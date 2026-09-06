# Yash Mali — Portfolio

A Vite + React portfolio whose content lives in a markdown knowledge base, and
whose agent answers questions from that same knowledge base through a LangGraph
orchestration graph.

The central idea: **`/knowledge` is the single source of truth.** The static
pages render from it and the agent retrieves from it. There is no second copy
to drift.

---

## Quick start

```bash
npm install
cp .env.example .env      # then fill in the two API keys
npm run knowledge:build   # generate the derived artifacts
npm run dev
```

`npm run dev` runs the agent too — `vite.config.js` mounts `api/*.ts` as dev
middleware, so `/api/agent` works locally without `vercel dev`.

---

## Architecture

```
/knowledge/*.md                    <- single source of truth (edit these)
        |
        |  npm run knowledge:build
        v
src/data/site-content.ts           <- typed content for the React pages
src/data/tool-registry.ts          <- tool docs, introspected from tools.ts
src/data/eval-summary.ts           <- eval results for the /system page
lib/knowledge/index.json           <- 72 chunks + 384-d embeddings
```

The agent graph (`lib/agent/graph.ts`):

```
classify -> retrieve -> [clarify] -> act -> generate
```

| Node | Model | Job |
|---|---|---|
| `classify` | Groq `gpt-oss-20b`, temp 0 | Intent + project slug |
| `retrieve` | local MiniLM, no LLM | Cosine scan over `index.json` |
| `clarify` | none | `interrupt()` and ask instead of guessing |
| `act` | **none for mapped intents** | Tool selection is deterministic (`planTools`) |
| `generate` | Groq `gpt-oss-120b` | Writes the answer from retrieved context only |

Both model nodes fall back across four independent quota buckets. A typical
turn makes **2 model calls**, not 3.

The full write-up, including six architecture decision records, lives in
`knowledge/system-architecture.md`. The `/system` page that rendered it is
**unpublished** — `SystemPage` is not imported by the router, so that content is
tree-shaken out of the client bundle. The agent still answers architecture
questions from the same file when asked directly, but never volunteers them.

To re-publish it, restore the import and route in `src/App.jsx` and the
`system.css` / `eval.css` imports in `src/main.jsx`.

---

## Editing content

**Never edit `src/data/*.ts` — they are generated and carry a do-not-edit
banner.** Edit the markdown, then rebuild:

```bash
# 1. edit a file under /knowledge
# 2. regenerate everything derived from it
npm run knowledge:build
```

That single command runs, in order:

| Step | Produces |
|---|---|
| `build-content.ts` | `src/data/site-content.ts` |
| `build-tool-registry.ts` | `src/data/tool-registry.ts` |
| `build-eval-summary.ts` | `src/data/eval-summary.ts` |
| `build-index.ts` | `lib/knowledge/index.json` |

Frontmatter is validated with Zod; a malformed field fails the build and names
the file and field.

---

## Evaluation

The agent claims to answer only from its knowledge base. `npm run eval` tests
that claim.

```bash
npm run eval                          # full dataset
npm run eval -- --limit 5             # quick smoke run
npm run eval -- --only commodity-01   # one item
npm run eval -- --delay 40            # seconds between items (rate limiting)
```

For each item in `eval/dataset.json` it runs the real graph (not the HTTP
route), then scores:

- **Retrieval hit** — did the expected source document appear in the retrieved
  chunks?
- **Groundedness** — a separate strict LLM-as-judge call asks whether every
  claim in the answer is supported by the retrieved context. Set
  `JUDGE_MODEL_ID` to judge with a different model than the one under test;
  a model grading its own output is a weak check.
- **Correct behaviour** — did it answer, admit a gap, ask for clarification, or
  decline, according to the item's declared mode?
- **Latency** and token usage.

Results land in `eval/results.json`.

### ⚠️ Regenerate the eval when the system changes

`eval/results.json` is a **point-in-time measurement**, not a live metric. The
numbers shown on the /system page come from whenever the eval last ran.

**Re-run `npm run eval` and then `npm run knowledge:build` whenever you:**

- add, remove, or materially rewrite anything in `/knowledge`
- change the graph, prompts, retrieval filters, or chunking
- change model or embedding choices
- change tool definitions or their descriptions

Otherwise the /system page will confidently display stale numbers for a system
that no longer exists. If the eval has never run, `eval-summary` reports
`hasResults: false` and the page shows an honest empty state instead of zeros.

---

## Rate limits (important)

Both providers' free tiers are restrictive enough to shape how you work:

Measured against both accounts:

| Provider / model | Requests/day | Tokens/day | Tokens/min |
|---|---|---|---|
| Groq (per model) | 1,000 | 200,000 | 8,000 |
| Google `gemini-3.6-flash` | **20** | — | — |

- **Gemini free tier is 20 requests per _day_.** It is a fallback here, not a
  primary — using it for routing *and* generation would cap the site at ~10
  answers/day.
- **Groq meters quota per model**, so the router and generator run on
  *different* models and each gets its own 200k allowance. The fallback chain
  walks four independent buckets before giving up.
- A turn costs ~3.2k tokens across 2 model calls, so the practical ceiling is
  **~60 answers/day**. Enough for a portfolio; not enough for a launch. Groq's
  Dev Tier is the upgrade path.
- The eval defaults to a 40s inter-item delay and honours `Retry-After` on 429.

`GENERATION_PROVIDER` and `GENERATION_MODEL_ID` let you point generation at
whichever provider currently has headroom without touching code:

```bash
GENERATION_PROVIDER=groq GENERATION_MODEL_ID=openai/gpt-oss-120b npm run eval
```

Whichever models a run used are recorded in `eval/results.json`, so published
numbers can't be misattributed.

**Model ids move.** `llama-3.1-8b-instant` and `gemini-2.0-flash` were both
retired during development and now 404. `GET https://api.groq.com/openai/v1/models`
lists what Groq currently serves; Gemini's 404 message names its replacement.

---

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server (frontend only) |
| `npm run build` | Production build |
| `npm run knowledge:build` | Regenerate all derived artifacts from `/knowledge` |
| `npm run eval` | Run the evaluation suite (needs API keys) |
| `npm run test:models` | Verify both API keys and the local embedder |
| `npm run test:retrieval` | Inspect retrieval quality for a query |
| `npm run test:tools` | Shape tests for the agent tools |
| `npm run test:agent` | Graph tests (offline checks + live turns if keys are set) |
| `npm run test:pages` | Server-render every route and assert its content |
| `npm run test:route` | API validation, rate limiting, error shapes |
| `npm run check:fidelity` | Rendered content vs. KNOWLEDGE-AUDIT.md |
| `npm run check:a11y` | Contrast, markup, reduced motion |
| `npm run typecheck` | `tsc --noEmit` over the whole repo |
| `npm run lint` | ESLint |

---

## Environment

See `.env.example`. `.env` is gitignored — **never put a key in source code.**
`lib/agent/config.ts` reads keys from the environment only; the URLs in that
file are help text for error messages, not a place for secrets.

| Variable | Used by |
|---|---|
| `GROQ_API_KEY` | Router + generation (primary) |
| `GOOGLE_API_KEY` | Fallback generation |
| `GENERATION_PROVIDER` | Optional: `groq` (default) or `google` |
| `GENERATION_MODEL_ID` | Optional: pin the generation model id |
| `ROUTER_MODEL_ID` | Optional: pin the router model id |
| `JUDGE_MODEL_ID` | Optional: eval judge model |

Embeddings run locally via `@xenova/transformers` and need no key.

---

## Deployment

Vercel. `vercel.json` sets the build to `npm run knowledge:build && npm run build`,
so the derived artifacts are always regenerated, and includes `knowledge/**`
plus `index.json` in the `api/agent.ts` function bundle.

`api/agent.ts` runs on the **Node** runtime, not Edge — transformers.js needs
onnxruntime, and the loader reads from disk. A SPA rewrite sends all non-`/api`
paths to `index.html`.

---

## Known limitations

- **`MemorySaver` is in-process.** A paused clarify run does not survive a
  serverless cold start. This wants a durable checkpointer before real traffic.
- **`@xenova/transformers` is unmaintained** and pulls transitive dependencies
  with known advisories. The maintained successor is
  `@huggingface/transformers` (same API).
- **`knowledge/achievements.md` is unfilled placeholder scaffolding.** It is
  excluded from the index and the achievements UI hides itself. See
  `KNOWLEDGE-AUDIT.md`.
- **32 `<!-- VERIFY -->` flags** remain in the knowledge base — drafted
  narrative not yet confirmed. They are stripped before reaching the model or
  the page, but should be reviewed.
- The superseded copilot stack (`api/copilot.ts`, `src/lib/rag/`,
  `src/components/copilot/`) is still present but unreachable from the UI.
