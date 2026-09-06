// Generates src/data/site-content.ts from /knowledge.
//
//   npm run knowledge:build   (runs this, then build-index)
//
// WHY THIS EXISTS: /knowledge is markdown read with node:fs, which the browser
// cannot do. Rather than keeping a second hand-maintained data file — the exact
// duplication this whole migration removed — the static pages import a
// *generated* module. /knowledge stays the single source of truth; this file is
// a build artifact derived from it, like lib/knowledge/index.json.
//
// Never edit src/data/site-content.ts by hand. Edit the markdown and re-run.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { loadKnowledgeDocuments, type PipelineStage } from "../lib/knowledge/loader";
import { splitIntoSections, extractAndStripComments } from "../lib/knowledge/chunker";
import {
  getExperienceEntries,
  getAchievementEntries,
  listProjectSummaries,
  getProjectBySlug,
  parseBullets,
} from "../lib/agent/tools";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "src", "data");
const OUT_PATH = join(OUT_DIR, "site-content.ts");

/** Parse the bold `**Key:** value` metadata block under an H2. */
function entryMeta(body: string): Record<string, string> {
  const meta: Record<string, string> = {};
  for (const line of body.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    const m = /^\*\*([^:*]+):\*\*\s*(.*)$/.exec(t);
    if (!m) continue;
    const value = m[2].trim();
    meta[m[1].trim().toLowerCase()] = value === "—" ? "" : value;
  }
  return meta;
}

function main() {
  const docs = loadKnowledgeDocuments();

  /* ------------------------------------------------------------- profile */
  const profileDoc = docs.find((d) => d.type === "profile");
  if (!profileDoc) throw new Error("knowledge/profile.md not found.");
  const fm = profileDoc.frontmatter as Record<string, any>;

  const { sections: profileSections } = splitIntoSections(profileDoc.rawBody);
  const bio = profileSections.find((s) => s.heading.trim().toLowerCase() === "bio");
  if (!bio) throw new Error("knowledge/profile.md is missing its '## Bio' section.");

  // The bio renders as discrete <p> elements, so split on blank lines and
  // unwrap the markdown's hard line breaks back into flowing prose.
  const about = extractAndStripComments(bio.body)
    .text.split(/\n\s*\n/)
    .map((p) => p.replace(/\s*\n\s*/g, " ").trim())
    .filter(Boolean);

  const profile = {
    name: fm.name,
    navbarBrand: fm.navbarBrand ?? fm.name,
    roles: fm.currentRoles ?? [],
    targetRoles: fm.targetRoles ?? [],
    tagline: fm.tagline,
    photo: fm.photo ?? "",
    resumeUrl: fm.resume ?? "",
    about,
    contact: {
      email: fm.email ?? "",
      phone: fm.phone ?? "",
      linkedin: fm.linkedin ?? "",
      github: fm.github ?? "",
    },
    footer: fm.footer ?? "",
  };

  const terminalFocusLines: string[] = fm.terminalFocusLines ?? [];

  /* ---------------------------------------------------------- experience */
  const experience = getExperienceEntries().map((r) => ({
    title: r.title,
    company: r.employer,
    dates: r.dates,
    bullets: r.highlights,
    stack: r.stack,
  }));

  /* ----------------------------------------------------------- education */
  const eduDoc = docs.find((d) => d.type === "education");
  const education = eduDoc
    ? splitIntoSections(eduDoc.rawBody).sections.map((s) => {
        const meta = entryMeta(extractAndStripComments(s.body).text);
        return {
          degree: s.heading,
          school: meta.institution ?? "",
          score: meta.result ?? "",
          years: meta.dates ?? "",
          location: meta.location ?? "",
        };
      })
    : [];

  /* -------------------------------------------------------------- skills */
  const skillsDoc = docs.find((d) => d.type === "skills");
  // Only the skill-category H2s; the trailing "Hero terminal lines" and
  // "Project categories" sections are documentation, not skill groups.
  const SKIP = new Set(["hero terminal lines", "project categories"]);
  const skills = skillsDoc
    ? splitIntoSections(skillsDoc.rawBody)
        .sections.filter((s) => !SKIP.has(s.heading.trim().toLowerCase()))
        .map((s) => ({
          title: s.heading,
          // Shares the tool layer's parser so soft-wrapped items are folded
          // back together rather than truncated at the wrap point.
          items: parseBullets(extractAndStripComments(s.body).text),
        }))
        .filter((g) => g.items.length > 0)
    : [];

  /* ------------------------------------------------------------ projects */
  const projects = listProjectSummaries().map((summary, i) => {
    const doc = docs.find((d) => d.type === "project" && d.slug === summary.slug)!;
    const pfm = doc.frontmatter as Record<string, any>;
    const detail = getProjectBySlug(summary.slug)!;
    return {
      id: i + 1,
      slug: summary.slug,
      title: summary.title,
      desc: summary.oneLiner,
      tech: pfm.tech ?? (pfm.stack ?? []).join(", "),
      categories: pfm.categories ?? [],
      skills: summary.skills,
      stack: pfm.stack ?? [],
      timeframe: pfm.timeframe ?? "",
      links: detail.links,
      sections: detail.sections,
      pipelineStages: (pfm.pipeline ?? undefined) as PipelineStage[] | undefined,
      pipelineLegend: pfm.pipelineLegend as string[] | undefined,
      sourceFile: doc.sourceFile,
      // Raw markdown body (VERIFY comments stripped, H1 dropped since the page
      // renders its own title). The project page renders THIS through
      // react-markdown rather than re-typing prose in JSX, so the page cannot
      // drift from /knowledge.
      bodyMarkdown: extractAndStripComments(doc.rawBody)
        .text.replace(/^#\s+.*$/m, "")
        .trim(),
    };
  });

  const categorySet = new Set<string>();
  for (const p of projects) for (const c of p.categories) categorySet.add(c);
  const projectCategories = ["All", ...[...categorySet].sort()];

  /* -------------------------------------------------------- achievements */
  // Placeholder entries are filtered by the tool layer, so this is legitimately
  // empty today. Consumers must handle an empty array rather than assuming
  // there is always something to render.
  const { achievements: rawAchievements, placeholderCount } = getAchievementEntries();
  const achievements = rawAchievements.map((a) => ({
    id: a.slug,
    title: a.title,
    description: a.description,
    date: a.date,
    linkedinUrl: a.linkedinUrl,
    tags: a.type ? a.type.split(",").map((t) => t.trim()).filter(Boolean) : [],
  }));

  /* --------------------------------------------------- system architecture */
  // The /system page renders these from the SAME markdown the agent retrieves
  // from, so the documented architecture and the answered architecture are one
  // artifact.
  const systemDoc = docs.find((d) => d.type === "system");
  const systemSections = systemDoc
    ? splitIntoSections(systemDoc.rawBody).sections
    : [];

  const isAdr = (h: string) => /^ADR-\d+/i.test(h.trim());

  const systemOverview = systemSections
    .filter((s) => !isAdr(s.heading))
    .map((s) => ({
      heading: s.heading,
      markdown: extractAndStripComments(s.body).text,
    }));

  const adrs = systemSections.filter((s) => isAdr(s.heading)).map((s) => {
    const [, id, title] = /^(ADR-\d+):\s*(.+)$/i.exec(s.heading.trim()) ?? [
      "",
      s.heading,
      s.heading,
    ];
    const body = extractAndStripComments(s.body).text;
    // Each ADR uses H3 subsections (Context / Decision / Trade-offs
    // considered / Consequences). Split on those so the page can lay them out
    // as a structured record rather than a wall of prose.
    const parts: Record<string, string> = {};
    const re = /^###\s+(.+)$/gm;
    const marks: { name: string; start: number; end: number }[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(body))) {
      marks.push({ name: m[1].trim(), start: m.index + m[0].length, end: body.length });
    }
    marks.forEach((mk, i) => {
      if (i + 1 < marks.length) mk.end = body.lastIndexOf("###", marks[i + 1].start);
      parts[mk.name.toLowerCase()] = body.slice(mk.start, mk.end).trim();
    });

    return {
      id,
      title,
      context: parts["context"] ?? "",
      decision: parts["decision"] ?? "",
      tradeoffs: parts["trade-offs considered"] ?? parts["trade-offs"] ?? "",
      consequences: parts["consequences"] ?? "",
      wordCount: body.split(/\s+/).filter(Boolean).length,
    };
  });

  /* --------------------------------------------------------------- write */
  const banner = `// AUTO-GENERATED by \`npm run knowledge:build\` from /knowledge.
// DO NOT EDIT BY HAND — your changes will be overwritten.
//
// /knowledge is the single source of truth for both the static pages and the
// agent. This module exists only because the browser cannot read markdown off
// disk; it is a build artifact, like lib/knowledge/index.json.
//
// To change any content below, edit the corresponding file under /knowledge
// and re-run \`npm run knowledge:build\`.
`;

  const body = `
export interface ContactInfo {
  email: string;
  phone: string;
  linkedin: string;
  github: string;
}

export interface Profile {
  name: string;
  navbarBrand: string;
  roles: string[];
  targetRoles: string[];
  tagline: string;
  photo: string;
  resumeUrl: string;
  about: string[];
  contact: ContactInfo;
  footer: string;
}

export interface ExperienceEntry {
  title: string;
  company: string;
  /** Empty when undocumented in /knowledge — render the absence, don't guess. */
  dates: string;
  bullets: string[];
  stack: string[];
}

export interface EducationEntry {
  degree: string;
  school: string;
  score: string;
  years: string;
  location: string;
}

export interface SkillCategory {
  title: string;
  items: string[];
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  date: string;
  linkedinUrl: string;
  tags?: string[];
}

export interface PipelineStage {
  id: string;
  label: string;
  description: string;
  /** lucide-react icon name, resolved to a component in PipelineDiagram. */
  icon?: string;
  status?: "active" | "idle" | "warning";
}

export interface ProjectSections {
  problem: string;
  architecture: string;
  decisions: string;
  challenges: string;
  impact: string;
}

export interface Project {
  id: number;
  slug: string;
  title: string;
  desc: string;
  tech: string;
  categories: string[];
  skills: string[];
  stack: string[];
  timeframe: string;
  links: { repo: string; demo: string; writeup: string };
  sections: ProjectSections;
  pipelineStages?: PipelineStage[];
  pipelineLegend?: string[];
  sourceFile: string;
  /** Raw markdown body from /knowledge, rendered by the project detail page. */
  bodyMarkdown: string;
}

export const profile: Profile = ${JSON.stringify(profile, null, 2)};

export const terminalFocusLines: string[] = ${JSON.stringify(terminalFocusLines, null, 2)};

export const experience: ExperienceEntry[] = ${JSON.stringify(experience, null, 2)};

export const education: EducationEntry[] = ${JSON.stringify(education, null, 2)};

export const skills: SkillCategory[] = ${JSON.stringify(skills, null, 2)};

export const projectCategories: string[] = ${JSON.stringify(projectCategories, null, 2)};

export const projects: Project[] = ${JSON.stringify(projects, null, 2)};

/**
 * Documented achievements. Currently EMPTY: knowledge/achievements.md still
 * holds ${placeholderCount} unfilled placeholder section(s), which are excluded
 * rather than shipped. Consumers must handle the empty case.
 */
export const achievements: Achievement[] = ${JSON.stringify(achievements, null, 2)};

export interface SystemSection {
  heading: string;
  markdown: string;
}

export interface ADR {
  id: string;
  title: string;
  context: string;
  decision: string;
  tradeoffs: string;
  consequences: string;
  wordCount: number;
}

/** Narrative sections of knowledge/system-architecture.md, excluding ADRs. */
export const systemOverview: SystemSection[] = ${JSON.stringify(systemOverview, null, 2)};

/** Architecture Decision Records, parsed from the same file the agent
 *  retrieves from — the /system page and the agent cannot disagree. */
export const adrs: ADR[] = ${JSON.stringify(adrs, null, 2)};
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, banner + body, "utf8");

  console.log("\n  Wrote src/data/site-content.ts");
  console.log(`    profile: ${about.length} bio paragraph(s)`);
  console.log(`    experience: ${experience.length} role(s)`);
  console.log(`    education: ${education.length} entr(ies)`);
  console.log(`    skills: ${skills.length} categor(ies)`);
  console.log(`    projects: ${projects.length} (${projects.filter((p) => p.pipelineStages).length} with pipeline diagrams)`);
  console.log(`    categories: ${projectCategories.join(", ")}`);
  console.log(`    system: ${systemOverview.length} section(s), ${adrs.length} ADR(s)`);
  for (const a of adrs) {
    // Flag any ADR missing one of the four required parts — a half-written
    // record renders as an empty column on the page.
    const missing = (["context", "decision", "tradeoffs", "consequences"] as const).filter(
      (k) => !a[k]
    );
    console.log(
      `      ${a.id} ${String(a.wordCount).padStart(4)}w` +
        (missing.length ? `  MISSING: ${missing.join(", ")}` : "")
    );
  }
  console.log(
    `    achievements: ${achievements.length}` +
      (placeholderCount ? ` (${placeholderCount} placeholder(s) excluded)` : "")
  );
}

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
