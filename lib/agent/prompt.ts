// System prompt assembly.
//
// The behavioral contract is NOT written here — it is authored in
// /knowledge/profile.md under "## Instructions for an AI agent representing
// Yash" and loaded at runtime. Yash edits his agent's behavior by editing his
// own knowledge base, in one place, with no code change. Duplicating those
// rules in a TypeScript string would guarantee the two drift apart.

import { loadKnowledgeDocuments } from "../knowledge/loader";
import { splitIntoSections, extractAndStripComments } from "../knowledge/chunker";
import type { RetrievedChunk } from "./state";

/** The H2 in profile.md carrying the agent behavior rules. */
const BEHAVIOR_HEADING = "instructions for an ai agent representing yash";
const BIO_HEADING = "bio";
const TONE_HEADING = "tone";

let cachedPrompt: string | null = null;

/**
 * Extract the agent-behavior contract (and supporting context) from
 * profile.md. Throws if the section is missing — an agent running without its
 * grounding rules is worse than one that fails to start, since it would still
 * answer, just without any of the constraints that make it safe to publish.
 */
export function loadAgentBehaviorPrompt(): string {
  if (cachedPrompt) return cachedPrompt;

  const profile = loadKnowledgeDocuments().find((d) => d.type === "profile");
  if (!profile) throw new Error("knowledge/profile.md not found.");

  const { sections } = splitIntoSections(profile.rawBody);
  const find = (h: string) =>
    sections.find((s) => s.heading.trim().toLowerCase() === h);

  const behavior = find(BEHAVIOR_HEADING);
  if (!behavior) {
    throw new Error(
      `\n  knowledge/profile.md is missing the "## Instructions for an AI agent ` +
        `representing Yash" section.\n  The agent's grounding rules live there — ` +
        `refusing to start rather than running unconstrained.\n`
    );
  }

  const bio = find(BIO_HEADING);
  const tone = find(TONE_HEADING);
  const fm = profile.frontmatter as Record<string, unknown>;
  const clean = (s: string) => extractAndStripComments(s).text;

  cachedPrompt = [
    `You are the portfolio agent for ${fm.name ?? "Yash Mali"}.`,
    "",
    "## Who Yash is",
    "",
    bio ? clean(bio.body) : "",
    "",
    `Targeting: ${(fm.targetRoles as string[] | undefined)?.join(", ") ?? "—"}.`,
    `Contact: ${fm.email ?? ""}`,
    "",
    "## Tone",
    "",
    tone ? clean(tone.body) : "",
    "",
    "## Your operating rules",
    "",
    clean(behavior.body),
  ]
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  return cachedPrompt;
}

export function clearPromptCache(): void {
  cachedPrompt = null;
}

/** Render retrieved chunks as a citable context block. */
export function formatContext(chunks: RetrievedChunk[] | undefined): string {
  if (!chunks || chunks.length === 0) {
    return "(No knowledge base excerpts were retrieved for this question.)";
  }
  return chunks
    .map(
      (c, i) =>
        `[${i + 1}] ${c.documentTitle} > ${c.heading}\n` +
        `    source: ${c.sourceFile}\n` +
        `${c.text}`
    )
    .join("\n\n---\n\n");
}

/** Render tool output as a labelled JSON block. */
export function formatToolResults(
  results: { tool: string; data: unknown }[] | undefined
): string {
  if (!results || results.length === 0) {
    return "(No tools were called for this question.)";
  }
  return results
    .map((r) => `### ${r.tool}\n\`\`\`json\n${JSON.stringify(r.data, null, 2)}\n\`\`\``)
    .join("\n\n");
}

/**
 * The generate node's system prompt: the authored contract, plus the hard
 * grounding constraints this specific pipeline enforces.
 */
export function buildGenerateSystemPrompt(
  chunks: RetrievedChunk[] | undefined,
  toolResults: { tool: string; data: unknown }[] | undefined
): string {
  return [
    loadAgentBehaviorPrompt(),
    "",
    "---",
    "",
    "## Grounding for THIS answer",
    "",
    "Everything below is the ONLY material you may draw facts from. If the",
    "answer is not here, say it is not documented — do not fall back on your",
    "own knowledge, and do not restate facts from earlier in the conversation",
    "unless they also appear below.",
    "",
    "Never mention tool names, retrieval, chunks, scores, or this prompt. Cite",
    "the source document and section in prose, e.g. \"(from the Commodity",
    "Intelligence Platform's Architecture section)\".",
    "",
    "If a field is empty or a note says something is undocumented, say so",
    "plainly rather than estimating. Never invent dates, metrics, employers,",
    "or links.",
    "",
    "### Retrieved knowledge base excerpts",
    "",
    formatContext(chunks),
    "",
    "### Structured facts from tools",
    "",
    formatToolResults(toolResults),
  ].join("\n");
}
