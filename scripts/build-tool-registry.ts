// Introspects lib/agent/tools.ts and writes src/data/tool-registry.ts.
//
// Run as part of `npm run knowledge:build`.
//
// WHY INTROSPECT RATHER THAN HAND-WRITE: the /system page documents the tool
// registry, and a hand-maintained list is a lie waiting to happen — someone
// renames a tool or adds a field and the docs quietly become wrong.
//
// Input shapes come from each tool's real Zod schema. Output shapes come from
// actually CALLING each tool at build time and walking the returned object, so
// the documented output is by construction what the tool returns.

import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { z } from "zod";
import {
  agentTools,
  searchKnowledgeTool,
  listProjectSummaries,
} from "../lib/agent/tools";
import {
  ROUTER_MODEL,
  GENERATION_MODEL,
  FALLBACK_GENERATION_MODEL,
} from "../lib/agent/models";
import { EMBEDDING_MODEL, EMBEDDING_DIMENSIONS } from "../lib/knowledge/embeddings";

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(HERE, "..", "src", "data");
const OUT_PATH = join(OUT_DIR, "tool-registry.ts");

export interface FieldDoc {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
}

/** Describe a Zod type as a short readable type string. */
function zodTypeName(schema: z.ZodTypeAny): string {
  const def: any = (schema as any)._def ?? {};
  const typeName: string = def.type ?? def.typeName ?? "";

  switch (typeName) {
    case "string":
    case "ZodString":
      return "string";
    case "number":
    case "ZodNumber":
      return "number";
    case "boolean":
    case "ZodBoolean":
      return "boolean";
    case "array":
    case "ZodArray":
      return `${zodTypeName(def.element ?? def.type)}[]`;
    case "enum":
    case "ZodEnum": {
      const values = def.entries ? Object.keys(def.entries) : (def.values ?? []);
      return values.length ? values.map((v: string) => `"${v}"`).join(" | ") : "enum";
    }
    case "optional":
    case "ZodOptional":
      return zodTypeName(def.innerType);
    case "object":
    case "ZodObject":
      return "object";
    default:
      return typeName ? String(typeName).replace(/^Zod/, "").toLowerCase() : "unknown";
  }
}

function isOptional(schema: z.ZodTypeAny): boolean {
  const def: any = (schema as any)._def ?? {};
  const t = def.type ?? def.typeName;
  return t === "optional" || t === "ZodOptional";
}

/** Walk a Zod object schema into documented fields. */
function describeInput(schema: unknown): FieldDoc[] {
  const def: any = (schema as any)?._def ?? {};
  const shape = typeof def.shape === "function" ? def.shape() : def.shape;
  if (!shape) return [];

  return Object.entries(shape).map(([name, raw]) => {
    const field = raw as z.ZodTypeAny;
    const fd: any = (field as any)._def ?? {};
    const inner = isOptional(field) ? fd.innerType : field;
    return {
      name,
      type: zodTypeName(inner),
      optional: isOptional(field),
      // Zod exposes .describe() text as a top-level `.description` getter;
      // read it from the outer field and the unwrapped inner type.
      description:
        (field as any).description ??
        (inner as any)?.description ??
        fd.description ??
        (inner as any)?._def?.description,
    };
  });
}

/** Describe a runtime value's shape, one level deep (arrays sampled). */
function describeValue(value: unknown, depth = 0): string {
  if (value === null) return "null";
  if (Array.isArray(value)) {
    if (value.length === 0) return "unknown[]";
    const inner = describeValue(value[0], depth + 1);
    return `${inner}[]`;
  }
  switch (typeof value) {
    case "string":
      return "string";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "undefined":
      return "undefined";
    case "object": {
      // Depth 2 so an array of objects still shows its element's keys —
      // "roles: object[]" documents nothing useful.
      if (depth >= 2) return "object";
      const keys = Object.keys(value as object);
      if (keys.length === 0) return "object";
      return `{ ${keys.join(", ")} }`;
    }
    default:
      return "unknown";
  }
}

/** Sample arguments for tools that require input, so output can be observed. */
function sampleArgs(toolName: string): Record<string, unknown> {
  if (toolName === "getProject") {
    return { slug: listProjectSummaries()[0]?.slug ?? "" };
  }
  if (toolName === "searchKnowledge") {
    return { query: "architecture" };
  }
  return {};
}

async function main() {
  const all = [...agentTools, searchKnowledgeTool];
  const entries: any[] = [];

  for (const tool of all) {
    const input = describeInput((tool as any).schema);

    let output: FieldDoc[] = [];
    let outputError: string | undefined;
    try {
      const result = await (tool as any).invoke(sampleArgs(tool.name));
      if (result && typeof result === "object" && !Array.isArray(result)) {
        output = Object.entries(result).map(([name, value]) => ({
          name,
          type: describeValue(value),
          optional: value === undefined,
        }));
      } else {
        output = [{ name: "(value)", type: describeValue(result), optional: false }];
      }
    } catch (err) {
      outputError = err instanceof Error ? err.message.split("\n")[0] : String(err);
    }

    entries.push({
      name: tool.name,
      description: tool.description,
      // searchKnowledge is used internally by the graph's retrieve node and is
      // deliberately NOT bound to the generation model.
      boundToModel: agentTools.some((t) => t.name === tool.name),
      input,
      output,
      outputError,
    });
  }

  const banner = `// AUTO-GENERATED by \`npm run knowledge:build\` from lib/agent/tools.ts.
// DO NOT EDIT BY HAND — your changes will be overwritten.
//
// Input shapes are read from each tool's real Zod schema; output shapes are
// observed by invoking the tool at build time. The /system page renders this,
// so the documented registry cannot drift from the actual tool definitions.
`;

  const body = `
export interface ToolField {
  name: string;
  type: string;
  optional: boolean;
  description?: string;
}

export interface ToolDoc {
  name: string;
  description: string;
  /** False for tools the graph calls directly but never exposes to the model. */
  boundToModel: boolean;
  input: ToolField[];
  output: ToolField[];
  outputError?: string;
}

export const toolRegistry: ToolDoc[] = ${JSON.stringify(entries, null, 2)};

export interface ModelConfig {
  router: string;
  generation: string;
  fallback: string;
  embedding: string;
  embeddingDimensions: number;
}

/**
 * The model ids actually configured in lib/agent/models.ts.
 *
 * Generated rather than typed into the diagram by hand: the /system page
 * displays these, and both original ids (llama-3.1-8b-instant,
 * gemini-2.0-flash) were retired by their providers during development. A
 * hand-written diagram had already drifted to naming dead models.
 */
export const modelConfig: ModelConfig = ${JSON.stringify(
    {
      router: ROUTER_MODEL,
      generation: GENERATION_MODEL,
      fallback: FALLBACK_GENERATION_MODEL,
      embedding: EMBEDDING_MODEL,
      embeddingDimensions: EMBEDDING_DIMENSIONS,
    },
    null,
    2
  )};
`;

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(OUT_PATH, banner + body, "utf8");

  console.log("\n  Wrote src/data/tool-registry.ts");
  for (const e of entries) {
    console.log(
      `    ${e.name.padEnd(20)} in:${e.input.length} out:${e.output.length}` +
        `${e.boundToModel ? "" : "  (graph-internal)"}${e.outputError ? `  ERROR: ${e.outputError}` : ""}`
    );
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
