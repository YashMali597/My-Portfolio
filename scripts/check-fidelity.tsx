// Content fidelity check.
//
//   npm run check:fidelity
//
// Answers three questions before this goes live:
//   1. Does every entity KNOWLEDGE-AUDIT.md recorded at migration time still
//      exist in /knowledge? (Nothing lost across seven prompts of refactoring.)
//   2. Does every fact in /knowledge actually reach a rendered page or the
//      retrieval index? (Nothing orphaned.)
//   3. Which <!-- VERIFY --> flags are still unresolved, and does any of that
//      unreviewed content leak to a visitor?

import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { readFileSync } from "node:fs";
import { loadKnowledgeDocuments } from "../lib/knowledge/loader";
import { chunkDocuments } from "../lib/knowledge/chunker";
import { projects, experience, education, achievements } from "../src/data/site-content";
import HomePage from "../src/pages/HomePage";
import ProjectsPage from "../src/pages/ProjectsPage";
import ProjectPage from "../src/pages/ProjectPage";
import ExperiencePage from "../src/pages/ExperiencePage";
import AchievementsPage from "../src/pages/AchievementsPage";
import SiteNav from "../src/components/SiteNav";

let problems = 0;
const warn = (m: string) => {
  console.log(`  ISSUE  ${m}`);
  problems++;
};
const ok = (m: string) => console.log(`  ok     ${m}`);

/* -------------------------------------------------------- audit baseline */
// The audit is the record of what existed immediately after migration. These
// are hard-coded from it deliberately: if someone edits the audit to match a
// regression, this check should still fail.
const AUDIT_EXPECTED = {
  projects: [
    "supplysightai-agentic-supply-chain-intelligence",
    "parcelpal-route-optimization",
    "customer-segmentation-churn-prediction",
    "ai-causal-intelligence-system",
    "commodity-intelligence-platform",
    "sap-bw-data-integration",
  ],
  employers: ["Emerson", "Wizphys AI"],
  schools: ["University of Texas at Dallas", "VIT Pune, India"],
  // Facts the audit called out as verbatim-preserved. If any of these vanish
  // from the rendered site, a migration lost content.
  metrics: ["60%", "90%+", "45%", "15+", "150+", "12%", "$684K+", "100K+", "15%", "18%"],
  verifyFlagCount: 32,
};

console.log("\nContent fidelity check\n");
console.log("— entities from KNOWLEDGE-AUDIT.md —");

const docs = loadKnowledgeDocuments();
const slugs = docs.filter((d) => d.type === "project").map((d) => d.slug);

for (const slug of AUDIT_EXPECTED.projects) {
  if (!slugs.includes(slug)) warn(`project missing from /knowledge: ${slug}`);
}
if (slugs.length !== AUDIT_EXPECTED.projects.length) {
  warn(`project count changed: audit recorded ${AUDIT_EXPECTED.projects.length}, found ${slugs.length}`);
} else {
  ok(`all ${slugs.length} projects present`);
}

for (const e of AUDIT_EXPECTED.employers) {
  if (!experience.some((r) => r.company === e)) warn(`employer missing: ${e}`);
}
ok(`${experience.length} roles present (${experience.map((r) => r.company).join(", ")})`);

for (const s of AUDIT_EXPECTED.schools) {
  if (!education.some((x) => x.school === s)) warn(`school missing: ${s}`);
}
ok(`${education.length} education entries present`);

/* ------------------------------------------------------------- rendering */
console.log("\n— rendered output —");

function render(path: string): string {
  return renderToString(
    <MemoryRouter initialEntries={[path]}>
      <SiteNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:slug" element={<ProjectPage />} />
        <Route path="/experience" element={<ExperiencePage />} />
        <Route path="/achievements" element={<AchievementsPage />} />
      </Routes>
    </MemoryRouter>
  );
}

const allHtml = [
  render("/"),
  render("/projects"),
  render("/experience"),
  render("/achievements"),
  ...projects.map((p) => render(`/projects/${p.slug}`)),
].join("\n");

// Nothing unreviewed may reach a visitor.
if (allHtml.includes("VERIFY")) warn("a VERIFY flag reached rendered output");
else ok("no VERIFY flags in any rendered page");

if (allHtml.includes("⟨")) warn("a placeholder marker reached rendered output");
else ok("no ⟨placeholder⟩ markers in any rendered page");

if (/<!--/.test(allHtml.replace(/<!--\s*-->/g, ""))) {
  warn("an HTML comment reached rendered output");
} else {
  ok("no raw HTML comments in rendered output");
}

// Every documented metric should still be visible somewhere on the site.
const missingMetrics = AUDIT_EXPECTED.metrics.filter((m) => !allHtml.includes(m));
if (missingMetrics.length) {
  warn(`metrics no longer rendered anywhere: ${missingMetrics.join(", ")}`);
} else {
  ok(`all ${AUDIT_EXPECTED.metrics.length} audited metrics still render`);
}

// Every project must be reachable and titled on its own page.
for (const p of projects) {
  const html = render(`/projects/${p.slug}`);
  if (html.includes("Project not found")) warn(`${p.slug} renders as not-found`);
}
ok(`all ${projects.length} project pages render`);

/* -------------------------------------------------------- orphaned facts */
console.log("\n— coverage —");

const chunks = chunkDocuments(docs);
const indexedSlugs = new Set(chunks.filter((c) => !c.isPlaceholder).map((c) => c.sourceSlug));
for (const slug of slugs) {
  if (!indexedSlugs.has(slug)) warn(`project not represented in the retrieval index: ${slug}`);
}
ok(`${chunks.filter((c) => !c.isPlaceholder).length} chunks indexed across ${indexedSlugs.size} entities`);

// /system is no longer exposed to visitors, so the ADRs are not rendered
// anywhere. They remain in knowledge/system-architecture.md and in the
// retrieval index — verified below — so nothing was lost, only unpublished.
const systemChunks = chunks.filter((c) => c.sourceType === "system" && !c.isPlaceholder);
if (systemChunks.length === 0) warn("system-architecture.md contributes no chunks");
else ok(`${systemChunks.length} system chunks retained in the index (page unpublished)`);

/* ------------------------------------------------------- unresolved flags */
console.log("\n— unresolved VERIFY flags —");

const byFile = new Map<string, string[]>();
for (const c of chunks) {
  if (c.verifyFlags.length === 0) continue;
  const list = byFile.get(c.sourceFile) ?? [];
  for (const f of c.verifyFlags) list.push(`${c.heading}: ${f}`);
  byFile.set(c.sourceFile, list);
}

// Placeholder sections are excluded from chunking, so count their flags directly.
let rawFlagCount = 0;
for (const d of docs) {
  rawFlagCount += (d.rawBody.match(/<!--\s*VERIFY:/g) ?? []).length;
}

let shown = 0;
for (const [file, flags] of [...byFile.entries()].sort()) {
  console.log(`\n  ${file}  (${flags.length})`);
  for (const f of flags) {
    console.log(`    - ${f.length > 140 ? f.slice(0, 137) + "..." : f}`);
    shown++;
  }
}

console.log(`\n  ${rawFlagCount} VERIFY flag(s) total in /knowledge; ${shown} attached to indexed chunks.`);
if (rawFlagCount !== AUDIT_EXPECTED.verifyFlagCount) {
  console.log(
    `  NOTE: audit recorded ${AUDIT_EXPECTED.verifyFlagCount}. A different count means flags were ` +
      `${rawFlagCount < AUDIT_EXPECTED.verifyFlagCount ? "resolved" : "added"} — expected if you have been reviewing.`
  );
}
console.log("  These are drafted claims Yash has not confirmed. They never reach the model or a");
console.log("  page, but they should be resolved before this is presented as fact.\n");

console.log(problems === 0 ? "  No fidelity problems found.\n" : `  ${problems} problem(s) found.\n`);
if (problems > 0) process.exit(1);
