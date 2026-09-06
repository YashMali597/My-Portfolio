# Knowledge Base Audit

Migration of the site's content model from `src/data/content.ts` to a
markdown-first knowledge base under `/knowledge`. This document lists every file
created, every `<!-- VERIFY -->` flag inserted, and everything the migration
broke on purpose.

**Nothing in `/knowledge` should be published or fed to an agent until the
VERIFY flags below are resolved.**

---

## 1. Files created

### Top level

| File | Source | Notes |
|---|---|---|
| `knowledge/profile.md` | `content.ts § profile` + written fresh | Bio migrated verbatim (4 paragraphs). Target roles, focus areas, tone, and the full agent behavior contract are **newly authored** — review the framing. |
| `knowledge/experience.md` | `content.ts § experience` | 2 roles, bullets verbatim. |
| `knowledge/education.md` | `content.ts § education` | 2 programs, dates/scores verbatim. |
| `knowledge/achievements.md` | `content.ts § achievements` | **All 3 entries were placeholders in the old file.** Nothing factual existed to migrate. |
| `knowledge/skills.md` | `content.ts § skills`, `terminalFocusLines`, `projectCategories` | **Not in the original spec** — added so this data wasn't destroyed with `content.ts`. Delete or relocate if you'd rather it lived elsewhere. |

### Projects — `knowledge/projects/`

All six projects from `content.ts § projects` migrated, one file each. Every
frontmatter field (`title`, `oneLiner`, `skills`, `stack`, `categories`) is
derived directly from the old `title` / `desc` / `tech` / `categories` fields —
no factual content altered.

| File | Old `id` | Categories | Narrative source |
|---|---|---|---|
| `supplysightai-agentic-supply-chain-intelligence.md` | 1 | AI, Software | Drafted — old copy was one sentence |
| `parcelpal-route-optimization.md` | 2 | Software, Data | Drafted — old copy was one sentence |
| `customer-segmentation-churn-prediction.md` | 3 | AI, Data | Drafted; **Impact is real** (12%, 100K+) |
| `ai-causal-intelligence-system.md` | 4 | AI, Data | Drafted; **Impact is real** ($684K+ simulated, 100K+) |
| `commodity-intelligence-platform.md` | 5 | Data, AI | **Architecture migrated verbatim** from the 5-stage `pipelineStages` diagram |
| `sap-bw-data-integration.md` | 6 | Data | **Architecture migrated verbatim** from the 5-stage `pipelineStages` diagram |

**Roles:** Graduate Software Engineer Trainee (Emerson), Deep Learning Intern
(Wizphys AI) — both in `experience.md`.
**Education:** MS MIS (UT Dallas), B.Tech (VIT Pune) — both in `education.md`.
**Achievements:** 3 placeholder sections in `achievements.md`, zero real
entries.

### Metadata convention

`experience.md`, `education.md`, and `achievements.md` all use **bold
`Key: value` lines directly under each H2** (`**Employer:**`, `**Dates:**`,
`**Result:**`, `**Link:**`). Project files use **YAML frontmatter**, per spec.

---

## 2. Facts carried over verbatim (do not re-verify)

These came straight from `content.ts` and were not touched:

- Emerson bullets: 60% error reduction, 90%+ data integrity, 45% retrieval time
  reduction, 15+ validation rules, 150+ test scenarios
- Wizphys AI bullets: 15% accuracy improvement, 18% engagement increase
- Education: GPA 3.75/4.0 (2025–2027), CGPA 8.77/10.0 (2020–2024)
- Churn project: 100K+ customer records, 12% targeted retention improvement
- Causal project: 100K+ user A/B simulation data, $684K+ simulated incremental
  revenue
- All six project titles, descriptions, and tech stacks
- Both medallion pipelines' five stage descriptions, verbatim including icon
  names and `active`/`idle` status

---

## 3. `<!-- VERIFY -->` flags — 35 total

### `achievements.md` — 3 flags · **blocking**

| Line | Flag |
|---|---|
| 22, 32, 42 | Each of the three entries is placeholder data carried over from `content.ts`. Replace title, date, link, and body with a real achievement, or delete the section. |

The old file's fake LinkedIn URL (`.../posts/⟨your-post-id⟩`) was **not**
carried forward as a live link. Until real entries land, an agent should treat
achievements as undocumented — `achievements.md` says so at the top.

### `experience.md` — 4 flags

| Line | Flag |
|---|---|
| 9 | Emerson — **dates missing**. The old site had no dates for either role. |
| 10 | Emerson — location not documented. |
| 32 | Wizphys AI — **dates missing**. |
| 33 | Wizphys AI — location not documented. |

### `education.md` — 3 flags

| Line | Flag |
|---|---|
| 11 | UT Dallas location "Richardson, Texas, USA" — **I added this**, it was not on the site. Confirm or remove. |
| 17 | Claim that MS coursework feeds the segmentation/churn/causal projects — **inferred**, the site never attributed them. |
| 27 | B.Tech **branch/major missing** — the site said only "Bachelor of Technology". |

### `projects/supplysightai-agentic-supply-chain-intelligence.md` — 5 flags

| Line | Flag |
|---|---|
| 11 | Timeframe + links empty. |
| 53 | The five-agent decomposition (analysis / risk / root cause / forecasting / recommendation) is **inferred from the one-line description**. Confirm real agent boundaries and names. |
| 75 | Key decisions section reconstructed from the stack. |
| 91 | Challenges section drafted from problem shape, not documented. |
| 98 | No quantified outcome existed — Impact is qualitative. |

### `projects/parcelpal-route-optimization.md` — 5 flags

| Line | Flag |
|---|---|
| 11 | Timeframe + links empty. |
| 41 | Layer breakdown inferred from the stack list. Confirm service boundaries. |
| 56 | Key decisions reconstructed from the stack. |
| 69 | Challenges drafted, not documented. |
| 75 | No quantified efficiency/cost figure existed — the site said only "improving efficiency and reducing operational costs". |

### `projects/customer-segmentation-churn-prediction.md` — 4 flags

| Line | Flag |
|---|---|
| 11 | Timeframe + links empty. |
| 42 | Pipeline stage decomposition inferred; **specific algorithms not documented**. |
| 57 | Key decisions reconstructed. |
| 72 | Challenges drafted (class imbalance, churn definition, actionable segments) — plausible but not documented. |

Impact section carries real numbers — no flag.

### `projects/ai-causal-intelligence-system.md` — 4 flags

| Line | Flag |
|---|---|
| 11 | Timeframe + links empty. |
| 44 | Pipeline decomposition inferred; **model family not documented** (T-learner? uplift trees? meta-learner?). |
| 60 | Key decisions reconstructed. |
| 75 | Challenges drafted, not documented. |

Impact carries real numbers — no flag. I added an explicit note that the $684K+
is **simulated, not realized**, and that it must always be described that way.

### `projects/commodity-intelligence-platform.md` — 3 flags

| Line | Flag |
|---|---|
| 12 | Timeframe + links empty. |
| 94 | Challenges drafted from the architecture, not documented. |
| 101 | No quantified outcome (latency, dashboard/user count) existed. |

Architecture and Key decisions here are the **best-grounded of any project** —
the five stage descriptions came verbatim from the interactive diagram, so no
flags on those.

### `projects/sap-bw-data-integration.md` — 4 flags

| Line | Flag |
|---|---|
| 13 | Timeframe + links empty. |
| 80 | **SAP BW extraction method not documented** — InfoProvider / ODP / OpenHub? |
| 89 | Challenges drafted from the architecture. |
| 96 | No quantified outcome existed. |

---

## 4. Highest-priority corrections

1. **Achievements** — 3 placeholder sections, zero real content. Either fill or
   delete.
2. **Dates** — both roles have no dates at all. This is a visible gap on a
   portfolio.
3. **Repo / demo / writeup links** — all 12 link fields across 6 projects are
   empty. The old site had none.
4. **B.Tech major** — currently just "Bachelor of Technology" with no field.
5. **Agent behavior contract** in `profile.md` — newly authored, not migrated.
   Read the "Instructions for an AI agent representing Yash" section closely;
   it defines what the agent will and won't say on your behalf.

---

## 5. What was deleted

`src/data/content.ts` — **deleted**. The now-empty `src/data/` directory was
removed with it.

## 6. Broken imports left marked (not fixed — Prompt 5 rebuilds these)

Each file below has a `FIXME(knowledge-base)` banner immediately above the dead
import. **The project does not build in this state — that is expected.**

| File | Imported |
|---|---|
| `src/components/About.jsx` | `profile` |
| `src/components/Contact.jsx` | `profile` |
| `src/components/Footer.jsx` | `profile` |
| `src/components/Navbar.jsx` | `profile` |
| `src/components/Hero.jsx` | `profile`, `terminalFocusLines` |
| `src/components/Experience.jsx` | `experience` |
| `src/components/Education.jsx` | `education` |
| `src/components/Projects.jsx` | `projects`, `projectCategories` |
| `src/components/achievements/AchievementsSection.tsx` | `achievements` |
| `src/components/architecture/PipelineDiagram.tsx` | `type PipelineStage` |
| `src/components/skills/parseSkills.ts` | `type SkillCategory` |
| `src/components/skills/TelemetryDashboard.tsx` | `skills`, `type SkillCategory` |
| `src/lib/copilot/mock.ts` | `profile`, `projects`, `experience`, `skills`, `education` |
| `api/copilot.ts` | `profile` |
| `scripts/build-rag.ts` | `profile`, `projects`, `experience`, `education`, `skills`, `achievements` |

### Also stale (no import, but downstream of the deleted file)

- `src/lib/rag/corpus.ts` — auto-generated from `content.ts` via
  `npm run rag:build`. Its contents are now a **frozen snapshot** of the old
  data model and cannot be regenerated until `scripts/build-rag.ts` is rebuilt
  against `/knowledge`.
- `src/lib/rag/embeddings.json` — same, embeddings of that stale corpus.
- `npm run rag:build` — will fail until `scripts/build-rag.ts` is ported.

No UI or agent logic was built or modified beyond inserting these markers.
