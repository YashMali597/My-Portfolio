---
title: "System Architecture"
summary: "How this portfolio site is built: a markdown knowledge base, a local embedding index, and a LangGraph agent that answers only from them."
stack: ["LangGraph", "LangChain", "Groq", "Google Gemini", "transformers.js", "React", "Vite", "Vercel"]
---

# System Architecture

## Overview

This site is not a portfolio with a chatbot bolted on. The same content powers
both halves: a directory of markdown files under `/knowledge` is the single
source of truth, and everything else is derived from it at build time. The
static pages render from it. The agent retrieves from it. There is no second
copy to drift.

Two build artifacts come out of `npm run knowledge:build`:

- `src/data/site-content.ts` — typed data for the React pages, because a
  browser cannot read markdown off disk.
- `lib/knowledge/index.json` — 55 chunks with 384-dimension embeddings, used
  for semantic retrieval at request time.

Both are generated. Neither is edited by hand. Editing a fact means editing the
markdown and re-running the build, which is the only way the two can stay in
agreement.

## The orchestration graph

Every answer runs through a five-node LangGraph state machine:

`classify → retrieve → [clarify] → act → generate`

**classify** routes the question into one of seven intents
(`project_deep_dive`, `experience`, `achievements`, `skills_query`,
`architecture_meta`, `general_greeting`, `out_of_scope`) and tries to resolve a
project slug from it. Runs on Groq's `llama-3.1-8b-instant` at temperature 0 —
routing must be deterministic, and it sits on the hot path of every turn.

**retrieve** embeds the question locally and runs a cosine-similarity scan over
`index.json`, filtered by the intent's source type and, when known, the
specific project. No LLM call. Sub-millisecond.

**clarify** is conditional. When router confidence is low, or the question is a
project deep-dive with no identifiable project, the graph calls LangGraph's
`interrupt()` — suspending mid-execution and returning a question to the user
instead of guessing. The reply resumes the same run from the same checkpoint.

**act** binds the tool registry to Gemini and lets it decide which structured
facts it needs. It never writes prose.

**generate** turns the retrieved chunks and tool results into the answer, under
a system prompt loaded from `profile.md` at runtime.

## Model choices

| Node | Model | Why |
|---|---|---|
| classify | Groq `llama-3.1-8b-instant` | Latency. Runs every turn, emits a label. |
| act, generate | Google `gemini-2.0-flash` | Tool calling, long context, generous free tier. |
| embeddings | `Xenova/all-MiniLM-L6-v2`, local | No API key, no per-query cost, 384 dimensions. |

## Grounding

The generation model is structurally prevented from answering off its own
memory. It receives only the retrieved chunks and the tool results, under
instructions authored in `profile.md` — not hard-coded in TypeScript — that
require citing the source document and saying "that's not something I've
documented here" rather than guessing. Tools strip `<!-- VERIFY -->` review
comments and unfilled placeholder sections before anything reaches the model.

---

## ADR-001: LangGraph over a single LangChain chain

### Context

The agent has to do five distinguishable things per question: work out what is
being asked, fetch relevant context, decide whether it has enough to proceed,
gather structured facts, and write an answer. The obvious first implementation
is a single LangChain chain — one prompt, one model, tools bound, let it figure
out the sequence.

### Decision

Use LangGraph and make each step an explicit node with typed state between
them.

### Trade-offs considered

A single chain is less code and fewer moving parts. It also collapses five
decisions into one opaque one: when an answer is wrong, there is no way to tell
whether the model misunderstood the question, retrieved the wrong documents, or
had the right context and wrote badly. Debugging becomes prompt archaeology.

The stronger argument against LangGraph was the state machine's ceremony —
annotations, reducers, conditional edges — for what starts as a linear
pipeline. That ceremony bought two things that turned out to matter. First,
routing: the intent classifier narrows retrieval to one slice of the knowledge
base, which measurably improves precision because a profile chunk can no longer
outrank a project answer. Second, `interrupt()`, which is only expressible
because execution is a resumable graph with checkpointed state. A chain cannot
pause halfway, ask the user something, and resume where it left off.

### Consequences

Every node is independently inspectable, and the site exposes that: the trace
panel lights each node as it fires, so a visitor watches the machine work. A
bad answer is attributable to a specific node. Adding a step means adding a
node and an edge, not rewriting a prompt.

The cost is real. There is more scaffolding than a chain needs, the state
annotations are boilerplate, and a second retrieve node exists purely to
guarantee termination after a clarify. For a five-node graph this is close to
break-even; it pays off as soon as a sixth node is added.

## ADR-002: A two-model cascade instead of one model everywhere

### Context

Every turn needs a routing decision and an answer. The simplest configuration
is one capable model doing both.

### Decision

Route on Groq's `llama-3.1-8b-instant` at temperature 0; generate on Google's
`gemini-2.0-flash` at temperature 0.3.

### Trade-offs considered

One model is simpler: one key, one SDK, one failure mode, one bill. The case
against it is that classification and generation want opposite things.

Routing wants determinism and speed. It emits a label and maybe a slug, it runs
before anything else, and its latency is added to every single turn. Asking a
large multimodal model to do that is paying for capability the task never uses
and adding delay the user always feels. Groq's inference speed is the point of
using it — the router should be effectively free.

Generation wants the opposite: a long context window to hold retrieved chunks
and tool output, reliable tool calling, and enough fluency to write prose worth
reading. Gemini Flash provides that with a free tier generous enough to develop
against.

The real cost of the split is two provider dependencies, two ways to fail, and
two rate limits. It also introduces a class of bug that does not exist with one
model — the router returning an intent or slug the rest of the graph does not
recognize — which is why the router's output is validated against the real
intent list and fuzzy-matched against the real project slugs rather than
trusted.

### Consequences

Both providers are reached through LangChain's model wrappers, so the graph
only ever sees `.invoke()` / `.stream()` / `.bindTools()`. Swapping either
provider is an edit to `lib/agent/models.ts` and nothing else. If Groq is
unavailable, classification fails closed to low confidence, which routes to
clarify — the agent asks a question rather than answering wrongly.

## ADR-003: Local embeddings and a flat JSON index, not a vector database

### Context

Semantic retrieval needs embeddings and something to search them. The default
answer in 2026 is a hosted embedding API plus a managed vector database.

### Decision

Embed locally with `Xenova/all-MiniLM-L6-v2` via transformers.js. Store all 55
chunks and their vectors in a single committed `index.json` and scan it
linearly in memory.

### Trade-offs considered

At this scale the numbers make the decision. Fifty-five chunks at 384
dimensions is a 237 KB file. A full cosine scan takes under a millisecond —
far less than the network round trip to any vector database, let alone the
embedding API call that would precede it. A vector database would add a
service to run, a client to configure, an index to keep in sync, a bill, and
another thing that can be down at request time, in exchange for solving a
problem that does not exist yet.

Local embedding removes the other API call. Queries cost nothing, work offline,
and need no key, which means a contributor can clone this repository and have
retrieval working without signing up for anything.

The honest costs: the model is a ~23 MB download on first run and adds a
one-time load to a cold start. `@xenova/transformers` is no longer maintained
and pulls transitive dependencies with known advisories. And a linear scan is
O(n) — fine at 55 chunks, fine at 5,000, wrong at 5,000,000.

### Consequences

The index is a build artifact, committed and regenerated by
`npm run knowledge:build`, never computed per request. `search.ts` refuses to
load an index whose recorded model or dimension count does not match the
runtime embedder — the failure mode it guards against is the quiet one, where
mismatched vectors still produce plausible-looking similarity scores and
silently meaningless results.

The migration path, if the knowledge base grows two orders of magnitude, is to
replace one file. Nothing above `searchKnowledge()` knows how retrieval works.

## ADR-004: Markdown files, not a database or CMS

### Context

Project write-ups, roles, and profile information need to live somewhere that
both the static pages and the agent can read.

### Decision

A `/knowledge` directory of markdown files with YAML frontmatter, versioned in
git alongside the code.

### Trade-offs considered

A CMS gives a web editor, media handling, and scheduled publishing. A database
gives queries and relations. Both were rejected for the same reason: they put
the content behind a service, and the content here is the product. Every fact
the agent can state has to be reviewable, diffable, and revertible. A bad claim
about a former employer should be catchable in a pull request, not discovered
in production.

Markdown also makes the dual-consumption problem tractable. The same file
supplies frontmatter for the project card and prose for the agent to retrieve.
Chunking on `##` boundaries works because the documents are authored around
those boundaries — every project has Problem / Architecture / Key decisions /
Challenges / Impact, so a chunk is almost always one complete thought.

The costs are real. There is no editing UI; changing content means editing a
file and running a build. Validation has to be built rather than enforced by a
schema — `loader.ts` uses Zod for that and fails loudly with the file and field
named. And there is no referential integrity, so a project's declared slug is
checked against its filename in code because nothing else would catch the
mismatch.

### Consequences

Content review is code review. The migration that created this knowledge base
produced a `KNOWLEDGE-AUDIT.md` listing every drafted claim and every
`<!-- VERIFY -->` flag — 32 of them — so unconfirmed narrative is visible
rather than quietly published. Those flags are stripped before anything reaches
the model or the page.

## ADR-005: Interrupt and ask, instead of guessing

### Context

Some questions cannot be answered as asked. "Tell me about the pipeline
project" matches two projects. A vague question matches nothing well. A
retrieval system will always return its best match, and a language model will
always write something confident about it.

### Decision

When router confidence falls below 0.6, or a project deep-dive resolves no
project, call LangGraph's `interrupt()` and ask the user which they meant.

### Trade-offs considered

Guessing is smoother. The user asks once and gets an answer, and most of the
time the top match is right. The problem is the rest of the time: a confidently
wrong answer about the wrong project is worse than a question, because the
visitor has no way to know it happened. On a site whose entire claim is that
the agent only says documented things, quietly answering the wrong question
undermines the premise.

The alternative to interrupting was answering with a hedge — "you might mean X
or Y, here's X". That is strictly worse: it still commits to a guess, and it
buries the ambiguity in prose the user has to read carefully to notice.

The implementation cost is that the graph must be resumable, which requires a
checkpointer and a stable session id, and the API has to model a paused run as
a distinct state the client can respond to.

### Consequences

The clarifying question offers the closest two or three real projects as
clickable chips, matched against actual slugs, so the user can answer in one
click. Selecting one resumes the suspended run from its checkpoint rather than
starting over.

The current checkpointer is `MemorySaver`, which is in-process. On a serverless
deployment a cold start between the question and the reply loses the paused
run. That is a known limitation, not a design choice — it wants a durable
checkpointer before this handles real traffic.

## ADR-006: A generated content module, not a hand-maintained one

### Context

The static pages need the knowledge base's content, but the browser cannot read
markdown from disk, and the loader depends on `node:fs`.

### Decision

Generate `src/data/site-content.ts` from `/knowledge` at build time. Never edit
it by hand.

### Trade-offs considered

The alternative was to keep maintaining a hand-written data file for the pages
and let the agent read markdown separately. That is exactly the two-sources
problem this architecture exists to remove: the card would say one thing and
the agent another, and nothing would detect the divergence.

Parsing markdown in the browser was considered — Vite can inline files as raw
strings — but frontmatter parsing and validation belong at build time, where a
malformed file fails the build instead of the page.

### Consequences

`npm run knowledge:build` produces both artifacts in one step, so they cannot
be regenerated independently and fall out of sync. The generated file carries a
do-not-edit banner.

This decision was validated the hard way. When the pages were migrated onto the
generated module, a 42-point fidelity check against the original hand-written
data file caught three real defects: soft-wrapped markdown bullets being
truncated at the wrap point, CRLF line endings silently breaking every heading
regex, and four project one-liners that had been reworded during migration. All
three were invisible to the type checker and to a successful build.
