// LangChain tools for the portfolio agent.
//
// These are the ONLY sanctioned source of structured facts about Yash. The
// generation model must never state a fact from its own memory of the
// conversation — it either calls one of these or works from chunks the
// retrieve node supplied.
//
// Rules this file holds to:
//   - No LLM call inside a tool.
//   - No free-text generation inside a tool. Tools return typed data; only the
//     generate node turns data into prose.
//   - Every value traces to a file under /knowledge.
//
// Tool descriptions matter as much as the code: they are what the model reads
// to choose between tools, so they are written to be unambiguous and
// non-overlapping.

import { tool } from "@langchain/core/tools";
import { z } from "zod";
import {
  loadKnowledgeDocuments,
  type KnowledgeDocument,
  type ProjectFrontmatter,
} from "../knowledge/loader";
import {
  splitIntoSections,
  extractAndStripComments,
  isPlaceholderText,
} from "../knowledge/chunker";
import {
  searchKnowledge as searchKnowledgeIndex,
  type SearchOptions,
  type SearchResult,
} from "../knowledge/search";

/* -------------------------------------------------------------------------- */
/* Document cache                                                             */
/* -------------------------------------------------------------------------- */

// /knowledge is a build-time artifact — it does not change while the server is
// running — so parse it once rather than hitting the filesystem per tool call.
let cachedDocs: KnowledgeDocument[] | null = null;

function docs(): KnowledgeDocument[] {
  if (!cachedDocs) cachedDocs = loadKnowledgeDocuments();
  return cachedDocs;
}

/** Test/dev hook: drop the cache so edits to /knowledge are picked up. */
export function clearKnowledgeCache(): void {
  cachedDocs = null;
}

/* -------------------------------------------------------------------------- */
/* Shared parsing helpers                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Parse the `**Key:** value` metadata lines that open each entry in the
 * collection files (experience.md, education.md, achievements.md).
 * Returns the metadata map and whatever body text followed it.
 */
function parseEntryMetadata(body: string): {
  meta: Record<string, string>;
  rest: string;
} {
  const meta: Record<string, string> = {};
  const lines = body.split("\n");
  let i = 0;

  for (; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const match = /^\*\*([^:*]+):\*\*\s*(.*)$/.exec(line);
    if (!match) break;
    const key = match[1].trim().toLowerCase();
    const value = match[2].trim();
    // "—" is the knowledge base's marker for "no value", not a value.
    meta[key] = value === "—" ? "" : value;
  }

  return { meta, rest: lines.slice(i).join("\n").trim() };
}

/**
 * Pull markdown list items out of a body.
 *
 * Bullets in /knowledge are soft-wrapped across lines to keep the source
 * readable, so a naive per-line match silently truncates them at the wrap
 * point ("...using C#" instead of the whole sentence). Continuation lines —
 * indented, non-empty, and not themselves a bullet or a `**Key:**` line — are
 * folded back into the bullet they belong to.
 */
export function parseBullets(body: string): string[] {
  const items: string[] = [];
  let current: string | null = null;

  const flush = () => {
    if (current !== null) {
      const text = current.replace(/\s+/g, " ").trim();
      if (text) items.push(text);
    }
    current = null;
  };

  for (const raw of body.split("\n")) {
    const bullet = /^\s*[-*]\s+(.*)$/.exec(raw);
    if (bullet) {
      flush();
      current = bullet[1];
      continue;
    }
    const trimmed = raw.trim();
    // Blank line, a metadata line, or a heading ends the current bullet.
    if (!trimmed || /^\*\*[^:*]+:\*\*/.test(trimmed) || /^#{1,6}\s/.test(trimmed)) {
      flush();
      continue;
    }
    // Anything else while a bullet is open is a wrapped continuation of it.
    if (current !== null) current += ` ${trimmed}`;
  }
  flush();

  return items;
}

/** Normalize an H2 into the section keys the project schema uses. */
function sectionKey(heading: string): string {
  return heading.trim().toLowerCase();
}

/* -------------------------------------------------------------------------- */
/* 1. getProject                                                              */
/* -------------------------------------------------------------------------- */

export interface ProjectSections {
  problem: string;
  architecture: string;
  decisions: string;
  challenges: string;
  impact: string;
}

export interface ProjectDetail {
  slug: string;
  title: string;
  oneLiner: string;
  skills: string[];
  stack: string[];
  timeframe: string;
  links: { repo: string; demo: string; writeup: string };
  sections: ProjectSections;
  sourceFile: string;
  /** Section keys that came back empty — lets the agent say what it lacks
   *  instead of implying the document covers something it doesn't. */
  missingSections: string[];
}

/** Map from the H2 text used in /knowledge to the section key we expose. */
const SECTION_MAP: Record<string, keyof ProjectSections> = {
  problem: "problem",
  architecture: "architecture",
  "key decisions": "decisions",
  decisions: "decisions",
  challenges: "challenges",
  impact: "impact",
};

export function getProjectBySlug(slug: string): ProjectDetail | null {
  const doc = docs().find((d) => d.type === "project" && d.slug === slug);
  if (!doc) return null;

  const fm = doc.frontmatter as unknown as ProjectFrontmatter;
  const { sections } = splitIntoSections(doc.rawBody);

  const out: ProjectSections = {
    problem: "",
    architecture: "",
    decisions: "",
    challenges: "",
    impact: "",
  };

  for (const section of sections) {
    const key = SECTION_MAP[sectionKey(section.heading)];
    if (!key) continue;
    // VERIFY comments are review metadata for Yash, never content for a
    // reader — strip them here exactly as the indexer does.
    const { text } = extractAndStripComments(section.body);
    out[key] = text;
  }

  const missingSections = (Object.keys(out) as (keyof ProjectSections)[])
    .filter((k) => out[k].trim() === "")
    .map(String);

  return {
    slug: fm.slug,
    title: fm.title,
    oneLiner: fm.oneLiner,
    skills: fm.skills,
    stack: fm.stack,
    timeframe: fm.timeframe,
    links: {
      repo: fm.links.repo ?? "",
      demo: fm.links.demo ?? "",
      writeup: fm.links.writeup ?? "",
    },
    sections: out,
    sourceFile: doc.sourceFile,
    missingSections,
  };
}

export const getProject = tool(
  async ({ slug }: { slug: string }) => {
    const project = getProjectBySlug(slug);
    if (!project) {
      const available = listProjectSummaries().map((p) => p.slug);
      return {
        found: false,
        error: `No project with slug "${slug}".`,
        availableSlugs: available,
      };
    }
    return { found: true, project };
  },
  {
    name: "getProject",
    description:
      "Get the full documented detail of ONE specific project by its exact slug: " +
      "title, one-line summary, skills, tech stack, timeframe, links, and the " +
      "full Problem / Architecture / Key decisions / Challenges / Impact " +
      "sections. Use this when the user asks about a particular project in " +
      "depth (how it worked, why a decision was made, what the outcome was). " +
      "You must already know the slug — call listProjects first if you don't.",
    schema: z.object({
      slug: z
        .string()
        .describe(
          'Exact project slug, e.g. "commodity-intelligence-platform". Not the display title.'
        ),
    }),
  }
);

/* -------------------------------------------------------------------------- */
/* 2. listProjects                                                            */
/* -------------------------------------------------------------------------- */

export interface ProjectSummary {
  slug: string;
  title: string;
  oneLiner: string;
  skills: string[];
}

export function listProjectSummaries(): ProjectSummary[] {
  return docs()
    .filter((d) => d.type === "project")
    .map((d) => {
      const fm = d.frontmatter as unknown as ProjectFrontmatter;
      return {
        slug: fm.slug,
        title: fm.title,
        oneLiner: fm.oneLiner,
        skills: fm.skills,
      };
    });
}

export const listProjects = tool(
  async () => ({ count: listProjectSummaries().length, projects: listProjectSummaries() }),
  {
    name: "listProjects",
    description:
      "List every documented project as a short summary (slug, title, one-line " +
      "description, skills). Use this to help someone browse what Yash has " +
      "built, to answer 'what projects has he worked on', or to find the right " +
      "slug before calling getProject. Returns summaries only — it does NOT " +
      "include the detailed narrative sections.",
    schema: z.object({}),
  }
);

/* -------------------------------------------------------------------------- */
/* 3. getExperience                                                           */
/* -------------------------------------------------------------------------- */

export interface RoleEntry {
  slug: string;
  title: string;
  employer: string;
  dates: string;
  location: string;
  links: string;
  /** Responsibility/accomplishment bullets, verbatim from experience.md. */
  highlights: string[];
  stack: string[];
  sourceFile: string;
}

export function getExperienceEntries(): RoleEntry[] {
  const doc = docs().find((d) => d.type === "experience");
  if (!doc) return [];

  const { sections } = splitIntoSections(doc.rawBody);
  const roles: RoleEntry[] = [];

  for (const section of sections) {
    const { text } = extractAndStripComments(section.body);
    const { meta, rest } = parseEntryMetadata(text);

    // "Stack:" is a trailing bold line, not part of the leading metadata block,
    // so pull it out of the body separately.
    const stackLine = /^\*\*Stack:\*\*\s*(.+)$/m.exec(rest);
    const stack = stackLine
      ? stackLine[1].split(",").map((s) => s.trim()).filter(Boolean)
      : [];

    const bulletBody = stackLine ? rest.replace(stackLine[0], "") : rest;

    roles.push({
      slug: section.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      title: section.heading,
      employer: meta.employer ?? "",
      dates: meta.dates ?? "",
      location: meta.location ?? "",
      links: meta.links ?? "",
      highlights: parseBullets(bulletBody),
      stack,
      sourceFile: doc.sourceFile,
    });
  }

  return roles;
}

export const getExperience = tool(
  async () => {
    const roles = getExperienceEntries();
    return {
      count: roles.length,
      roles,
      // Dates are genuinely absent from the knowledge base. Surfacing that
      // explicitly stops the model from filling the gap with a plausible guess.
      note: roles.some((r) => !r.dates)
        ? "Some roles have no documented dates. Do not infer or estimate them — say they are not documented."
        : undefined,
    };
  },
  {
    name: "getExperience",
    description:
      "Get Yash's professional work history: every role with employer, dates, " +
      "accomplishment bullets, and tech stack. Use this for questions about " +
      "jobs, employers, work history, years of experience, or what he did at a " +
      "particular company. This covers EMPLOYMENT only — for personal or " +
      "portfolio projects use listProjects/getProject instead.",
    schema: z.object({}),
  }
);

/* -------------------------------------------------------------------------- */
/* 4. getAchievements                                                         */
/* -------------------------------------------------------------------------- */

export interface AchievementEntry {
  slug: string;
  title: string;
  date: string;
  type: string;
  linkedinUrl: string;
  description: string;
  sourceFile: string;
}

export function getAchievementEntries(): {
  achievements: AchievementEntry[];
  placeholderCount: number;
} {
  const doc = docs().find((d) => d.type === "achievement");
  if (!doc) return { achievements: [], placeholderCount: 0 };

  const { sections } = splitIntoSections(doc.rawBody);
  const achievements: AchievementEntry[] = [];
  let placeholderCount = 0;

  for (const section of sections) {
    const { text } = extractAndStripComments(section.body);

    // achievements.md is still entirely unfilled template scaffolding. These
    // must never reach the model: a fabricated award recited to a recruiter is
    // the single most damaging thing this agent could do.
    if (isPlaceholderText(text) || isPlaceholderText(section.heading)) {
      placeholderCount++;
      continue;
    }

    const { meta, rest } = parseEntryMetadata(text);
    achievements.push({
      slug: section.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
      title: section.heading,
      date: meta.date ?? "",
      type: meta.type ?? "",
      linkedinUrl: meta.link ?? meta.linkedinurl ?? "",
      description: rest,
      sourceFile: doc.sourceFile,
    });
  }

  return { achievements, placeholderCount };
}

export const getAchievements = tool(
  async () => {
    const { achievements, placeholderCount } = getAchievementEntries();
    if (achievements.length === 0) {
      return {
        count: 0,
        achievements: [],
        note:
          "No achievements are documented in the knowledge base yet" +
          (placeholderCount > 0
            ? ` (${placeholderCount} unfilled placeholder section(s) were excluded).`
            : ".") +
          " Tell the user this is not something Yash has documented. Do not " +
          "substitute project outcomes or work accomplishments as achievements.",
      };
    }
    return { count: achievements.length, achievements };
  },
  {
    name: "getAchievements",
    description:
      "Get Yash's documented achievements — awards, recognitions, publications, " +
      "talks, and certifications — each with its date and LinkedIn post URL. " +
      "Use this ONLY for questions about awards, honors, recognition, " +
      "publications, talks, or certifications. Do NOT use it for project " +
      "outcomes or job accomplishments; those come from getProject and " +
      "getExperience. May legitimately return zero entries.",
    schema: z.object({}),
  }
);

/* -------------------------------------------------------------------------- */
/* 5. getSkillsOverview                                                       */
/* -------------------------------------------------------------------------- */

export interface SkillUsage {
  skill: string;
  /** Slugs of the projects whose frontmatter lists this skill. */
  projects: string[];
  projectCount: number;
}

/**
 * Skills exist in this system only as evidence: a skill is a thing that appears
 * in some project's frontmatter, and its weight is the set of projects that
 * used it. There is deliberately no rating, score, or years-of-experience
 * number anywhere — a self-assigned "9/10 at Python" is unfalsifiable and
 * carries no information a recruiter can check. "How good are you at X" is
 * answered with the projects that used X.
 */
export function buildSkillsOverview(): {
  skills: SkillUsage[];
  totalSkills: number;
} {
  const map = new Map<string, Set<string>>();

  for (const doc of docs()) {
    if (doc.type !== "project") continue;
    const fm = doc.frontmatter as unknown as ProjectFrontmatter;
    for (const skill of fm.skills ?? []) {
      const key = skill.trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, new Set());
      map.get(key)!.add(fm.slug);
    }
  }

  const skills: SkillUsage[] = [...map.entries()]
    .map(([skill, projects]) => ({
      skill,
      projects: [...projects].sort(),
      projectCount: projects.size,
    }))
    // Most-evidenced first, then alphabetical — the ordering itself is the
    // signal the agent should read.
    .sort(
      (a, b) => b.projectCount - a.projectCount || a.skill.localeCompare(b.skill)
    );

  return { skills, totalSkills: skills.length };
}

export const getSkillsOverview = tool(
  async () => {
    const { skills, totalSkills } = buildSkillsOverview();
    return {
      totalSkills,
      skills,
      note:
        "Skills are evidenced by project usage only. There are no ratings, " +
        "scores, or years-of-experience numbers in this system. Answer " +
        "'how good is he at X' by describing the projects that used X.",
    };
  },
  {
    name: "getSkillsOverview",
    description:
      "Get every skill Yash has documented, mapped to the projects that used " +
      "it. Use this for questions about what technologies or capabilities he " +
      "has, whether he has used a specific technology, or how much experience " +
      "he has with something. Returns evidence (which projects used each " +
      "skill), NOT ratings — there are no proficiency scores in this system.",
    schema: z.object({}),
  }
);

/* -------------------------------------------------------------------------- */
/* 6. searchKnowledge                                                         */
/* -------------------------------------------------------------------------- */

/**
 * Semantic retrieval over the whole knowledge base.
 *
 * Exported in two forms deliberately:
 *   - `retrieveKnowledge` — the plain async function, called directly by the
 *     graph's retrieve node.
 *   - `searchKnowledgeTool` — the same thing wrapped as a LangChain tool, for
 *     if it is ever bound to the model.
 *
 * Per the spec, only the plain function is wired into the graph; the tool form
 * is NOT part of `agentTools` below, so the generation model cannot call it.
 */
export async function retrieveKnowledge(
  query: string,
  opts: SearchOptions = {}
): Promise<SearchResult[]> {
  return searchKnowledgeIndex(query, opts);
}

const SOURCE_TYPES = [
  "project",
  "experience",
  "education",
  "achievement",
  "profile",
  "skills",
  "system",
] as const;

export const searchKnowledgeTool = tool(
  async ({ query, sourceType }: { query: string; sourceType?: string }) => {
    const results = await retrieveKnowledge(query, {
      topK: 5,
      sourceType: sourceType as SearchOptions["sourceType"],
    });
    return {
      count: results.length,
      results: results.map((r) => ({
        score: Number(r.score.toFixed(4)),
        heading: r.chunk.heading,
        documentTitle: r.chunk.documentTitle,
        sourceType: r.chunk.sourceType,
        sourceSlug: r.chunk.sourceSlug,
        sourceFile: r.chunk.sourceFile,
        text: r.chunk.text,
      })),
    };
  },
  {
    name: "searchKnowledge",
    description:
      "Semantic search across the entire knowledge base. Use only as a " +
      "fallback when no more specific tool fits — prefer getProject, " +
      "listProjects, getExperience, getAchievements, or getSkillsOverview " +
      "whenever the question matches one of those.",
    schema: z.object({
      query: z.string().describe("Natural-language search query."),
      sourceType: z
        .enum(SOURCE_TYPES)
        .optional()
        .describe("Restrict the search to one section of the knowledge base."),
    }),
  }
);

/* -------------------------------------------------------------------------- */
/* Export set                                                                 */
/* -------------------------------------------------------------------------- */

/**
 * The tools bound to the generation model in Prompt 4.
 *
 * `searchKnowledgeTool` is intentionally absent: retrieval is the graph's job,
 * run before generation, not something the model decides to do mid-answer.
 */
export const agentTools = [
  getProject,
  listProjects,
  getExperience,
  getAchievements,
  getSkillsOverview,
];

export const agentToolsByName = Object.fromEntries(
  agentTools.map((t) => [t.name, t])
);
