// Loads and validates the /knowledge markdown base.
//
// /knowledge is the single source of truth for both the static pages and the
// agent's retrieval layer. This module is the only place that knows the
// directory's shape — everything downstream (chunker, index builder, search)
// works off the typed documents this returns.
//
// Validation is deliberately strict and loud: a malformed frontmatter field is
// a build-time failure with the file and field named, not a runtime surprise
// where the agent quietly answers with a missing timeframe.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, basename } from "node:path";
import matter from "gray-matter";
import { z } from "zod";

const HERE = dirname(fileURLToPath(import.meta.url));
export const KNOWLEDGE_DIR = join(HERE, "..", "..", "knowledge");

export type SourceType =
  | "project"
  | "experience"
  | "education"
  | "achievement"
  | "profile"
  | "skills"
  | "system";

export interface KnowledgeDocument {
  /** Stable id, e.g. "project:commodity-intelligence-platform". */
  id: string;
  type: SourceType;
  slug: string;
  frontmatter: Record<string, unknown>;
  rawBody: string;
  /** Path relative to the repo root, for error messages and citations. */
  sourceFile: string;
}

/* -------------------------------------------------------------------------- */
/* Schemas                                                                    */
/* -------------------------------------------------------------------------- */

const linksSchema = z
  .object({
    repo: z.string().default(""),
    demo: z.string().default(""),
    writeup: z.string().default(""),
  })
  .passthrough();

/** One stage of a project's interactive pipeline diagram. */
const pipelineStageSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string().min(1),
  /** lucide-react icon name, resolved to a component in PipelineDiagram. */
  icon: z.string().optional(),
  status: z.enum(["active", "idle", "warning"]).optional(),
});

const projectFrontmatterSchema = z
  .object({
    slug: z.string().min(1),
    title: z.string().min(1),
    oneLiner: z.string().min(1),
    skills: z.array(z.string()),
    stack: z.array(z.string()),
    // Empty string is legitimate right now — the migration flagged every
    // project's timeframe as unknown rather than inventing one.
    timeframe: z.string(),
    links: linksSchema,
    /** Tech line shown on the project card, verbatim from the original site. */
    tech: z.string().optional(),
    categories: z.array(z.string()).optional(),
    pipelineLegend: z.array(z.string()).optional(),
    pipeline: z.array(pipelineStageSchema).optional(),
    relatedProjects: z.array(z.string()).optional(),
  })
  .passthrough();

const profileFrontmatterSchema = z
  .object({
    name: z.string().min(1),
    tagline: z.string().min(1),
    currentRoles: z.array(z.string()),
    targetRoles: z.array(z.string()),
    email: z.string().min(1),
    linkedin: z.string().min(1),
    github: z.string().min(1),
    phone: z.string().optional(),
    resume: z.string().optional(),
    // Site chrome, rendered by the static pages.
    navbarBrand: z.string().optional(),
    photo: z.string().optional(),
    footer: z.string().optional(),
    terminalFocusLines: z.array(z.string()).optional(),
  })
  .passthrough();

export type PipelineStage = z.infer<typeof pipelineStageSchema>;

/** The collection files (experience/education/achievements/skills) carry no
 *  frontmatter — their per-entry metadata lives as bold key/value lines under
 *  each H2, which the chunker reads. An empty object is the valid shape. */
const emptyFrontmatterSchema = z.record(z.string(), z.unknown());

/* -------------------------------------------------------------------------- */
/* Error reporting                                                            */
/* -------------------------------------------------------------------------- */

export class KnowledgeValidationError extends Error {
  constructor(file: string, issues: z.ZodIssue[]) {
    const lines = [
      "",
      `  Invalid frontmatter in ${file}`,
      "",
      ...issues.map((i) => {
        const path = i.path.length ? i.path.join(".") : "(root)";
        return `    ${path}: ${i.message}`;
      }),
      "",
      "  Fix the frontmatter in that file, then re-run `npm run knowledge:build`.",
      "",
    ];
    super(lines.join("\n"));
    this.name = "KnowledgeValidationError";
    this.stack = `${this.name}: ${this.message}`;
  }
}

function parseOrThrow<T>(
  schema: z.ZodType<T>,
  data: unknown,
  file: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new KnowledgeValidationError(file, result.error.issues);
  }
  return result.data;
}

/* -------------------------------------------------------------------------- */
/* Loading                                                                    */
/* -------------------------------------------------------------------------- */

function readDoc(
  absPath: string,
  relPath: string
): { frontmatter: Record<string, unknown>; rawBody: string } {
  // Normalize line endings before anything parses this.
  //
  // This is not cosmetic. Every heading/bullet regex downstream is anchored
  // with `$`, and JS treats `\r` as a line terminator that `.` will not match
  // — so on a CRLF file `/^##\s+(.+)$/` fails against "## Bio\r" and EVERY
  // section silently disappears. The knowledge base is edited on Windows, so
  // a CRLF file is a matter of when, not if.
  const raw = readFileSync(absPath, "utf8").replace(/\r\n?/g, "\n");
  const parsed = matter(raw);
  return {
    frontmatter: parsed.data as Record<string, unknown>,
    rawBody: parsed.content.trim(),
  };
}

/** Top-level single-entry and collection files, mapped to their type. */
const TOP_LEVEL_FILES: { file: string; type: SourceType; required: boolean }[] = [
  { file: "profile.md", type: "profile", required: true },
  { file: "experience.md", type: "experience", required: true },
  { file: "education.md", type: "education", required: true },
  { file: "achievements.md", type: "achievement", required: true },
  { file: "skills.md", type: "skills", required: false },
  { file: "system-architecture.md", type: "system", required: false },
];

export function loadKnowledgeDocuments(): KnowledgeDocument[] {
  if (!existsSync(KNOWLEDGE_DIR)) {
    throw new Error(
      `\n  /knowledge not found at ${KNOWLEDGE_DIR}\n  Expected the markdown knowledge base created in Prompt 0.\n`
    );
  }

  const docs: KnowledgeDocument[] = [];

  for (const { file, type, required } of TOP_LEVEL_FILES) {
    const abs = join(KNOWLEDGE_DIR, file);
    const rel = `knowledge/${file}`;
    if (!existsSync(abs)) {
      if (required) {
        throw new Error(`\n  Missing required knowledge file: ${rel}\n`);
      }
      continue;
    }

    const { frontmatter, rawBody } = readDoc(abs, rel);
    const schema =
      type === "profile" ? profileFrontmatterSchema : emptyFrontmatterSchema;
    const validated = parseOrThrow(schema, frontmatter, rel);
    const slug = basename(file, ".md");

    docs.push({
      id: `${type}:${slug}`,
      type,
      slug,
      frontmatter: validated as Record<string, unknown>,
      rawBody,
      sourceFile: rel,
    });
  }

  // Projects: one file per project, all requiring full frontmatter.
  const projectsDir = join(KNOWLEDGE_DIR, "projects");
  if (!existsSync(projectsDir)) {
    throw new Error(`\n  Missing required directory: knowledge/projects/\n`);
  }

  const projectFiles = readdirSync(projectsDir)
    .filter((f) => f.endsWith(".md"))
    .sort();

  if (projectFiles.length === 0) {
    throw new Error(`\n  knowledge/projects/ contains no .md files.\n`);
  }

  for (const file of projectFiles) {
    const rel = `knowledge/projects/${file}`;
    const { frontmatter, rawBody } = readDoc(join(projectsDir, file), rel);
    const fm = parseOrThrow(projectFrontmatterSchema, frontmatter, rel);

    // The slug is used to build citation links, so a mismatch between the
    // filename and the declared slug would produce a dead reference.
    const fileSlug = basename(file, ".md");
    if (fm.slug !== fileSlug) {
      throw new KnowledgeValidationError(rel, [
        {
          code: "custom",
          path: ["slug"],
          message: `declared slug "${fm.slug}" does not match filename "${fileSlug}.md"`,
        } as z.ZodIssue,
      ]);
    }

    docs.push({
      id: `project:${fm.slug}`,
      type: "project",
      slug: fm.slug,
      frontmatter: fm as unknown as Record<string, unknown>,
      rawBody,
      sourceFile: rel,
    });
  }

  return docs;
}

/** Convenience: just the projects, with frontmatter typed. */
export type ProjectFrontmatter = z.infer<typeof projectFrontmatterSchema>;
export type ProfileFrontmatter = z.infer<typeof profileFrontmatterSchema>;
