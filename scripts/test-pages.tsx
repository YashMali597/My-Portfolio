// Renders every route server-side and asserts what came out.
//
//   npm run test:pages
//
// A successful `vite build` only proves the code bundles. This proves each page
// actually renders, pulls its content from /knowledge, converts markdown to
// HTML, and leaks none of the things that must never reach a visitor —
// VERIFY flags, placeholder markers, or the removed Skills nav entry.
import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";

import HomePage from "../src/pages/HomePage";
import ProjectsPage from "../src/pages/ProjectsPage";
import ProjectPage from "../src/pages/ProjectPage";
import ExperiencePage from "../src/pages/ExperiencePage";
import AchievementsPage from "../src/pages/AchievementsPage";
import SiteNav from "../src/components/SiteNav";
import { projects, experience, education, achievements } from "../src/data/site-content";


let ok = 0;
let bad = 0;

const fail = (label: string, msg: string) => {
  console.log(`  FAIL  ${label} — ${msg}`);
  bad++;
};
const pass = (label: string, note = "") => {
  console.log(`  OK    ${label}${note ? ` — ${note}` : ""}`);
  ok++;
};

/** Render one path through the real route table. */
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
        {/* /system is intentionally not routed. */}
        <Route path="*" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  );
}

/** React escapes &, <, > in text nodes — compare against the escaped form. */
const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const has = (html: string, text: string) => html.includes(esc(text));

const forbidden = (html: string): string[] => {
  const out: string[] = [];
  if (html.includes("~/skills")) out.push("SKILLS NAV LEAKED");
  if (html.includes("⟨")) out.push("placeholder marker leaked");
  if (html.includes("VERIFY")) out.push("VERIFY flag leaked");
  if (html.includes("[object Object]")) out.push("[object Object] rendered");
  if (html.includes("## ")) out.push("raw markdown heading leaked");
  return out;
};

/* ------------------------------------------------------------------ home */
{
  const html = render("/");
  const issues = forbidden(html);
  if (issues.length) fail("/", issues.join("; "));
  else if (!html.includes("Yash Mali")) fail("/", "missing name");
  else if (!html.includes("agent-console")) fail("/", "console not rendered");
  else if (!html.includes("Walk me through")) fail("/", "suggestion chips missing");
  else if (projects.some((p) => !has(html, p.title))) fail("/", "a project is missing from the gallery");
  else pass("/", `${html.length}b, console + all ${projects.length} projects`);
}

/* -------------------------------------------------------------- projects */
{
  const html = render("/projects");
  const issues = forbidden(html);
  if (issues.length) fail("/projects", issues.join("; "));
  else if (projects.some((p) => !has(html, p.title))) fail("/projects", "missing a project");
  else if (!html.includes("skill-chip")) fail("/projects", "no skill chips");
  else pass("/projects", `${html.length}b, ${projects.length} cards`);
}

/* ------------------------------------------------------ project detail x6 */
for (const p of projects) {
  const path = `/projects/${p.slug}`;
  const html = render(path);
  const issues = forbidden(html);

  if (html.includes("Project not found")) fail(path, "rendered the not-found state");
  else if (issues.length) fail(path, issues.join("; "));
  else if (!has(html, p.title)) fail(path, "title missing");
  else if (!html.includes(">Problem<")) fail(path, "Problem section not rendered from markdown");
  else if (!html.includes(">Architecture<")) fail(path, "Architecture section not rendered");
  else if (!html.includes(">Impact<")) fail(path, "Impact section not rendered");
  else if (!html.includes("skill-chip")) fail(path, "skill chips missing");
  else if (!html.includes(p.sourceFile)) fail(path, "source attribution missing");
  else {
    const diagram = html.includes("pipeline-node");
    const expectDiagram = !!p.pipelineStages;
    if (diagram !== expectDiagram) fail(path, `pipeline diagram ${diagram ? "present" : "missing"}, expected ${expectDiagram}`);
    else pass(path, `${html.length}b${expectDiagram ? ", + diagram" : ""}`);
  }
}

/* ------------------------------------------------------------ experience */
{
  const html = render("/experience");
  const issues = forbidden(html);
  if (issues.length) fail("/experience", issues.join("; "));
  else if (experience.some((r) => !has(html, r.company))) fail("/experience", "an employer is missing");
  else if (education.some((e) => !has(html, e.school))) fail("/experience", "a school is missing");
  else if (!html.includes("dates not documented")) fail("/experience", "undocumented dates not surfaced honestly");
  else pass("/experience", `${html.length}b, ${experience.length} roles + ${education.length} degrees`);
}

/* ---------------------------------------------------------- achievements */
{
  const html = render("/achievements");
  const issues = forbidden(html);
  if (issues.length) fail("/achievements", issues.join("; "));
  else if (!html.includes("Achievements")) fail("/achievements", "no heading");
  else if (achievements.length === 0 && !html.includes("achievements-empty"))
    fail("/achievements", "no achievements documented but no empty state rendered");
  else if (achievements.length > 0 && !achievements.every((a) => has(html, a.title)))
    fail("/achievements", "an achievement is missing");
  else
    pass(
      "/achievements",
      `${html.length}b, ` +
        (achievements.length === 0 ? "honest empty state" : `${achievements.length} entries`)
    );
}

/* ------------------------------------------------- /system is not exposed */
{
  // Visiting /system must land on the homepage, not the architecture page.
  const html = render("/system");
  const leaked = [
    "Architecture decision records",
    "Tool registry",
    "graph-node",
    "eval-gauge",
    "ADR-001",
  ].filter((s) => html.includes(s));
  if (leaked.length) fail("/system hidden", `still renders: ${leaked.join(", ")}`);
  else pass("/system hidden", "falls through to the homepage, no architecture or eval content");
}

/* -------------------------------------------------------------------- nav */
{
  const html = render("/");
  const wanted = ["~/home", "~/projects", "~/experience", "~/achievements"];
  const missing = wanted.filter((w) => !html.includes(w));
  if (missing.length) fail("nav", `missing ${missing.join(", ")}`);
  else if (html.includes("~/skills")) fail("nav", "Skills entry still present");
  else if (html.includes("~/system")) fail("nav", "System entry still present");
  else pass("nav", "Home, Projects, Experience, Achievements — no Skills, no System");
}

console.log(`\n  ${ok} passed, ${bad} failed\n`);
if (bad) process.exit(1);
