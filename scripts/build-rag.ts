// Regenerates src/lib/rag/corpus.ts and src/lib/rag/embeddings.json from
// src/data/site-content.ts. Run via `npm run rag:build` any time content.ts
// changes — including after filling in real achievements — so the RAG
// corpus never drifts from the real site content.
// LEGACY: this builds the corpus for the superseded /api/copilot RAG stack,
// which the /api/agent LangGraph pipeline replaced. It is kept only so the old
// endpoint still builds; `architectureNotes` was dropped in the /knowledge
// migration (the same content now lives in each project's Architecture
// section), so that field is read defensively rather than as a typed property.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  profile,
  projects,
  experience,
  education,
  skills,
  achievements,
} from "../src/data/site-content";
import { embedTexts } from "../src/lib/rag/embed";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RAG_DIR = join(__dirname, "..", "src", "lib", "rag");

export interface CorpusChunk {
  id: string;
  sourceType: "project" | "experience" | "education" | "skill" | "achievement" | "profile";
  source: string;
  text: string;
  /** Only set on achievement chunks — the API surfaces this to Claude so it
   * can link out without ever inventing a URL. */
  linkedinUrl?: string;
}

function slug(...parts: string[]): string {
  return parts
    .join("-")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// content.ts marks unfilled achievement fields with ⟨...⟩ placeholders (see
// the TODO block above the `achievements` export). Skip those so the
// assistant can never surface placeholder text as if it were a real,
// shippable achievement — real entries are picked up automatically the next
// time this script runs after they're filled in.
function isPlaceholderText(value: string): boolean {
  return value.includes("⟨") || value.includes("⟩");
}

function buildCorpus(): CorpusChunk[] {
  const chunks: CorpusChunk[] = [];

  for (const project of projects) {
    const parts = [project.desc];
    // `architectureNotes` was dropped in the /knowledge migration — the same
    // content now lives in each project's Architecture section. Read
    // defensively so this legacy script still builds.
    const architectureNotes = (project as unknown as { architectureNotes?: string })
      .architectureNotes;
    if (architectureNotes && architectureNotes !== project.desc) {
      parts.push(architectureNotes);
    }
    if (project.pipelineStages?.length) {
      parts.push(`Pipeline: ${project.pipelineStages.map((s) => s.label).join(" -> ")}.`);
    }
    parts.push(`Tech stack: ${project.tech}.`);
    chunks.push({
      id: slug("project", project.title),
      sourceType: "project",
      source: project.title,
      text: parts.join(" "),
    });

    // One chunk per pipeline stage's real description, so retrieval can go
    // deep on a specific stage (e.g. "the silver layer") instead of only
    // surfacing the terse label list above. Generic over any project that
    // has pipelineStages — not hardcoded to today's two diagrammed projects.
    for (const stage of project.pipelineStages ?? []) {
      chunks.push({
        id: slug("project", project.title, "stage", stage.id),
        sourceType: "project",
        source: `${project.title} — ${stage.label}`,
        text: stage.description,
      });
    }
  }

  for (const achievement of achievements) {
    if (
      isPlaceholderText(achievement.title) ||
      isPlaceholderText(achievement.description) ||
      isPlaceholderText(achievement.linkedinUrl)
    ) {
      continue;
    }
    const tagsSuffix = achievement.tags?.length ? ` Tags: ${achievement.tags.join(", ")}.` : "";
    chunks.push({
      id: slug("achievement", achievement.title),
      sourceType: "achievement",
      source: achievement.title,
      text: `${achievement.description} (${achievement.date}).${tagsSuffix}`,
      linkedinUrl: achievement.linkedinUrl,
    });
  }

  for (const role of experience) {
    role.bullets.forEach((bullet, i) => {
      chunks.push({
        id: slug("experience", role.company, role.title, String(i)),
        sourceType: "experience",
        source: `${role.title} at ${role.company}`,
        text: bullet,
      });
    });
  }

  for (const entry of education) {
    chunks.push({
      id: slug("education", entry.school, entry.degree),
      sourceType: "education",
      source: `${entry.degree}, ${entry.school}`,
      text: `${entry.degree} at ${entry.school} (${entry.years}), ${entry.score}.`,
    });
  }

  for (const category of skills) {
    const title = category.title.replace(/\s*⯆$/, "");
    chunks.push({
      id: slug("skill", title),
      sourceType: "skill",
      source: title,
      text: `${title}: ${category.items.join("; ")}.`,
    });
  }

  chunks.push({
    id: slug("profile", "summary"),
    sourceType: "profile",
    source: `${profile.name} — profile summary`,
    text: `${profile.name}, ${profile.roles.join(" / ")}. ${profile.tagline} ${profile.about.join(" ")}`,
  });

  chunks.push({
    id: slug("profile", "contact"),
    sourceType: "profile",
    source: `${profile.name} — contact`,
    text: `Contact ${profile.name} at ${profile.contact.email}, LinkedIn: ${profile.contact.linkedin}, GitHub: ${profile.contact.github}.`,
  });

  return chunks;
}

function writeCorpusFile(chunks: CorpusChunk[]) {
  const header = `// AUTO-GENERATED by \`npm run rag:build\` from src/data/site-content.ts.
// Do not edit by hand — changes here are overwritten on the next build.

export interface CorpusChunk {
  id: string;
  sourceType: "project" | "experience" | "education" | "skill" | "achievement" | "profile";
  source: string;
  text: string;
  /** Only set on achievement chunks — the API surfaces this to Claude so it
   * can link out without ever inventing a URL. */
  linkedinUrl?: string;
}

export const corpus: CorpusChunk[] = ${JSON.stringify(chunks, null, 2)};
`;
  writeFileSync(join(RAG_DIR, "corpus.ts"), header, "utf-8");
  console.log(`Wrote ${chunks.length} chunks to src/lib/rag/corpus.ts`);
}

async function writeEmbeddingsFile(chunks: CorpusChunk[]) {
  const outPath = join(RAG_DIR, "embeddings.json");

  if (!process.env.VOYAGE_API_KEY) {
    console.warn(
      "VOYAGE_API_KEY is not set — skipping embedding generation.\n" +
        "Corpus text was written, but embeddings.json is left empty until you\n" +
        "set VOYAGE_API_KEY and re-run `npm run rag:build`."
    );
    writeFileSync(outPath, "[]\n", "utf-8");
    return;
  }

  const BATCH_SIZE = 16;
  const results: { id: string; vector: number[] }[] = [];

  for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
    const batch = chunks.slice(i, i + BATCH_SIZE);
    const vectors = await embedTexts(batch.map((c) => c.text));
    batch.forEach((chunk, j) => {
      results.push({ id: chunk.id, vector: vectors[j] });
    });
    console.log(`Embedded ${Math.min(i + BATCH_SIZE, chunks.length)}/${chunks.length} chunks`);
  }

  writeFileSync(outPath, JSON.stringify(results), "utf-8");
  console.log(`Wrote ${results.length} embeddings to src/lib/rag/embeddings.json`);
}

async function main() {
  const chunks = buildCorpus();
  writeCorpusFile(chunks);
  await writeEmbeddingsFile(chunks);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
