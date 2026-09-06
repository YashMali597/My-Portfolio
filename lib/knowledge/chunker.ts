// Splits knowledge documents into retrievable chunks along markdown H2
// boundaries.
//
// H2 is the right seam because the knowledge base was authored around it:
// every project has ## Problem / ## Architecture / ## Key decisions /
// ## Challenges / ## Impact, and every entry in the collection files
// (experience, education, achievements) is exactly one H2. So a chunk is
// almost always one semantically complete section.
//
// Oversized sections are split further, but only on blank-line paragraph
// boundaries — never mid-sentence.

import type { KnowledgeDocument, SourceType } from "./loader";

export interface KnowledgeChunk {
  /** Stable, deterministic id: "<sourceType>:<sourceSlug>:<headingSlug>[#n]". */
  id: string;
  /** Chunk body, HTML comments stripped. This is what gets embedded/shown. */
  text: string;
  /** The H2 this chunk came from, verbatim (e.g. "Key decisions"). */
  heading: string;
  sourceType: SourceType;
  /**
   * The *entry* this chunk belongs to. For projects this is the project slug;
   * for collection files it is the slugified H2 (e.g. "deep-learning-intern"),
   * so a single role is addressable rather than the whole experience file.
   */
  sourceSlug: string;
  sourceFile: string;
  /** Document title (H1 or frontmatter title) — used for display and citation. */
  documentTitle: string;
  /**
   * `<!-- VERIFY: ... -->` comments found in this section, stripped out of
   * `text`. The migration in Prompt 0 flagged unconfirmed claims this way;
   * they are review metadata, not content the agent should ever recite.
   */
  verifyFlags: string[];
  /**
   * True when the section still contains unfilled `⟨...⟩` template markers —
   * i.e. it is placeholder scaffolding, not real content. The index builder
   * excludes these. Without the exclusion the vague placeholder text matches
   * everything weakly and outranks genuine chunks: before this filter, the
   * three template achievements beat the real Education entries on the query
   * "What did he study and where?". Worse, retrieving one risks the agent
   * reciting a fabricated achievement to a recruiter.
   */
  isPlaceholder: boolean;
  /** Rough token estimate, for budgeting context windows later. */
  approxTokens: number;
}

/** Target ceiling for a single chunk, in characters. Sections longer than this
 *  get split on paragraph boundaries. ~1500 chars is roughly 350-400 tokens —
 *  small enough that several fit in a prompt, large enough to stay coherent. */
const MAX_CHUNK_CHARS = 1500;

/** Sections shorter than this get merged forward rather than standing alone —
 *  a two-line stub retrieves poorly and dilutes the index. */
const MIN_CHUNK_CHARS = 80;

const VERIFY_COMMENT = /<!--\s*VERIFY:\s*([\s\S]*?)-->/g;
const ANY_HTML_COMMENT = /<!--[\s\S]*?-->/g;

/** Unfilled template markers, e.g. "⟨ACHIEVEMENT TITLE⟩" or "⟨YYYY-MM⟩". */
const PLACEHOLDER_MARKER = /⟨[^⟩]*⟩/g;

/** A section is placeholder scaffolding if template markers make up a real
 *  share of it — not merely if one stray marker appears in otherwise real
 *  prose. 15% of characters is well clear of both cases in practice. */
export function isPlaceholderText(text: string): boolean {
  const markers = text.match(PLACEHOLDER_MARKER);
  if (!markers) return false;
  const markerChars = markers.reduce((s, m) => s + m.length, 0);
  return markerChars / Math.max(text.length, 1) > 0.15;
}

export function slugifyHeading(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function approxTokenCount(text: string): number {
  // ~4 chars per token is close enough for context budgeting.
  return Math.ceil(text.length / 4);
}

/** Pull out VERIFY flags, then remove all HTML comments from the body. */
export function extractAndStripComments(raw: string): {
  text: string;
  verifyFlags: string[];
} {
  const verifyFlags: string[] = [];
  for (const match of raw.matchAll(VERIFY_COMMENT)) {
    verifyFlags.push(match[1].trim().replace(/\s+/g, " "));
  }
  const text = raw
    .replace(ANY_HTML_COMMENT, "")
    // Collapse the blank lines the removed comments left behind.
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return { text, verifyFlags };
}

/**
 * Split an oversized section into parts on blank-line boundaries.
 * Paragraphs (and list blocks) are kept whole; a single paragraph longer than
 * the ceiling is left intact rather than cut mid-sentence.
 */
function splitOnParagraphs(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text];

  const paragraphs = text.split(/\n\s*\n/);
  const parts: string[] = [];
  let current = "";

  for (const para of paragraphs) {
    const candidate = current ? `${current}\n\n${para}` : para;
    if (candidate.length > maxChars && current) {
      parts.push(current);
      current = para;
    } else {
      current = candidate;
    }
  }
  if (current.trim()) parts.push(current);
  return parts;
}

export interface Section {
  heading: string;
  body: string;
}

/** Split a document body into H2 sections, plus any preamble before the first.
 *  Exported so lib/agent/tools.ts parses documents the exact same way the
 *  index does — two different splitters would eventually disagree. */
export function splitIntoSections(rawBody: string): {
  documentTitle: string | null;
  preamble: string;
  sections: Section[];
} {
  const lines = rawBody.split("\n");
  let documentTitle: string | null = null;
  const preambleLines: string[] = [];
  const sections: Section[] = [];
  let current: Section | null = null;
  let inFence = false;

  for (const line of lines) {
    // Never treat a "##" inside a fenced code block as a heading.
    if (/^\s*```/.test(line)) inFence = !inFence;

    const h1 = !inFence && /^#\s+(.+)$/.exec(line);
    const h2 = !inFence && /^##\s+(.+)$/.exec(line);

    if (h1 && documentTitle === null && current === null) {
      documentTitle = h1[1].trim();
      continue;
    }
    if (h2) {
      if (current) sections.push(current);
      current = { heading: h2[1].trim(), body: "" };
      continue;
    }
    if (current) {
      current.body += line + "\n";
    } else {
      preambleLines.push(line);
    }
  }
  if (current) sections.push(current);

  return {
    documentTitle,
    preamble: preambleLines.join("\n").trim(),
    sections,
  };
}

/**
 * Chunk one document.
 *
 * For a project, `sourceSlug` stays the project slug across all its sections,
 * so retrieval can group hits back to a single project. For collection files
 * each H2 is a separate entry, so `sourceSlug` becomes that entry's slug.
 */
export function chunkDocument(doc: KnowledgeDocument): KnowledgeChunk[] {
  const { documentTitle, preamble, sections } = splitIntoSections(doc.rawBody);
  const fmTitle =
    typeof doc.frontmatter.title === "string" ? doc.frontmatter.title : null;
  const title = fmTitle ?? documentTitle ?? doc.slug;

  const isCollection =
    doc.type === "experience" ||
    doc.type === "education" ||
    doc.type === "achievement" ||
    doc.type === "skills";

  const chunks: KnowledgeChunk[] = [];

  const push = (
    heading: string,
    body: string,
    entrySlug: string,
    partIndex: number,
    partCount: number
  ) => {
    const { text, verifyFlags } = extractAndStripComments(body);
    if (text.length < MIN_CHUNK_CHARS && partCount === 1) {
      // Too thin to retrieve well on its own, but we still don't want to lose
      // it — keep it if it's all the entry has, drop it if it's an empty
      // section left behind after stripping comments.
      if (text.length === 0) return;
    }
    const headingSlug = slugifyHeading(heading);
    const suffix = partCount > 1 ? `#${partIndex + 1}` : "";
    chunks.push({
      id: `${doc.type}:${entrySlug}:${headingSlug}${suffix}`,
      text,
      heading,
      sourceType: doc.type,
      sourceSlug: entrySlug,
      sourceFile: doc.sourceFile,
      documentTitle: title,
      verifyFlags,
      isPlaceholder: isPlaceholderText(text),
      approxTokens: approxTokenCount(text),
    });
  };

  // Preamble (a project's one-line summary, a file's convention note).
  // For projects this is genuinely useful context; for collection files it is
  // usually just the metadata-convention boilerplate, so we skip it there.
  if (preamble && !isCollection) {
    const parts = splitOnParagraphs(preamble, MAX_CHUNK_CHARS);
    parts.forEach((p, i) => push("Overview", p, doc.slug, i, parts.length));
  }

  for (const section of sections) {
    const entrySlug = isCollection
      ? slugifyHeading(section.heading)
      : doc.slug;
    const parts = splitOnParagraphs(section.body.trim(), MAX_CHUNK_CHARS);
    parts.forEach((p, i) =>
      push(section.heading, p, entrySlug, i, parts.length)
    );
  }

  return chunks;
}

export function chunkDocuments(docs: KnowledgeDocument[]): KnowledgeChunk[] {
  return docs.flatMap(chunkDocument);
}

/**
 * The string actually handed to the embedder.
 *
 * Prefixing each chunk with its document title and heading gives the embedding
 * the context the bare body lacks — an "## Impact" section says "improved
 * targeted retention by 12%" without ever naming the project, so on its own it
 * would never match a query like "churn project results".
 */
export function embeddableText(chunk: KnowledgeChunk): string {
  // Flatten the bold `**Key:** value` metadata syntax the collection files use.
  //
  // This matters more than it looks. Before this, "What did he do at Emerson?"
  // scored 0.105 against the Emerson chunk — below the retrieval floor, so the
  // graph returned NO context for questions about his own job. The chunk was
  // dominated by markup (`**Employer:** Emerson **Dates:** **Location:**
  // **Links:** —`) rather than by its content, and empty fields contributed
  // pure noise.
  const body = chunk.text
    // "**Employer:** Emerson" -> "Employer: Emerson"
    .replace(/\*\*([^:*]+):\*\*\s*/g, "$1: ")
    // Drop metadata lines whose value is empty or the "no value" em dash.
    .replace(/^[A-Za-z ]+:\s*(—)?\s*$/gm, "")
    .replace(/\*\*/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  // Surface the entry's subject (employer, institution) into the prefix. The
  // heading is the ROLE title, and the document title is just "Experience", so
  // without this neither carries the employer name the question asks about.
  const subject = /(?:^|\n)(?:Employer|Institution):\s*(.+)/.exec(body)?.[1]?.trim();
  const prefix = subject
    ? `${chunk.documentTitle} — ${chunk.heading} at ${subject}`
    : `${chunk.documentTitle} — ${chunk.heading}`;

  return `${prefix}\n\n${body}`;
}
