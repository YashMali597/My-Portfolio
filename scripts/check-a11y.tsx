// Static accessibility and contrast checks.
//
//   npm run check:a11y
//
// This is not a substitute for a real screen reader or an axe run in a browser,
// and it does not pretend to be. It catches the regressions that are checkable
// from rendered markup and the token file: unlabelled controls, missing focus
// styles, images without alt text, and colour pairs that fail WCAG AA.

import { renderToString } from "react-dom/server";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { readFileSync } from "node:fs";
import AgentConsole from "../src/components/agent-console/AgentConsole";
import TracePanel from "../src/components/agent-console/TracePanel";
import ToolBlock from "../src/components/agent-console/generative-ui/blocks";
import HomePage from "../src/pages/HomePage";
import ProjectPage from "../src/pages/ProjectPage";
import ExperiencePage from "../src/pages/ExperiencePage";
import SystemPage from "../src/pages/SystemPage";
import SiteNav from "../src/components/SiteNav";
import { projects } from "../src/data/site-content";

let fails = 0;
const ok = (m: string) => console.log(`  ok    ${m}`);
const bad = (m: string) => {
  console.log(`  FAIL  ${m}`);
  fails++;
};

/* ---------------------------------------------------------- contrast */

function srgb(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? [...h].map((c) => c + c).join("") : h;
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  return 0.2126 * srgb(r) + 0.7152 * srgb(g) + 0.0722 * srgb(b);
}
function contrast(a: string, b: string): number {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
}

const tokens = readFileSync("src/styles/tokens.css", "utf8");
const token = (name: string): string | null =>
  new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{3,8})`).exec(tokens)?.[1] ?? null;

console.log("\nAccessibility checks\n");
console.log("— contrast (WCAG AA: 4.5:1 body, 3:1 large/UI) —");

const BG = token("bg-panel") ?? "#12121a";
const BG900 = token("bg-900") ?? "#0a0a0f";

const pairs: [string, string, string, number][] = [
  ["text-primary on panel", token("text-primary")!, BG, 4.5],
  ["text-muted on panel", token("text-muted")!, BG, 4.5],
  ["text-dim on panel", token("text-dim")!, BG, 4.5],
  ["accent-cyan on panel", token("accent-cyan")!, BG, 4.5],
  ["accent-amber on panel", token("accent-amber")!, BG, 4.5],
  ["danger on panel", token("danger")!, BG, 4.5],
  ["success on panel", token("success")!, BG, 4.5],
  ["accent-purple on panel", token("accent-purple")!, BG, 3],
  ["text-muted on bg-900", token("text-muted")!, BG900, 4.5],
  ["text-dim on bg-900", token("text-dim")!, BG900, 4.5],
];

for (const [label, fg, bg, min] of pairs) {
  if (!fg) {
    bad(`${label}: token not found`);
    continue;
  }
  const ratio = contrast(fg, bg);
  const line = `${label}: ${ratio.toFixed(2)}:1 (needs ${min}:1)`;
  if (ratio >= min) ok(line);
  else bad(line);
}

// White on the purple user bubble — the one place white text is used.
const purpleDeep = token("accent-purple-deep");
if (purpleDeep) {
  const r = contrast("#ffffff", purpleDeep);
  if (r >= 4.5) ok(`white on accent-purple-deep (user bubble): ${r.toFixed(2)}:1`);
  else bad(`white on accent-purple-deep: ${r.toFixed(2)}:1 (needs 4.5:1)`);
}

/* ------------------------------------------------------------- markup */

console.log("\n— markup —");

const render = (el: React.ReactElement, path = "/") =>
  renderToString(<MemoryRouter initialEntries={[path]}>{el}</MemoryRouter>);

const consoleHtml = render(<AgentConsole variant="full" />);
const pagesHtml = [
  renderToString(
    <MemoryRouter initialEntries={["/"]}>
      <SiteNav />
      <Routes>
        <Route path="/" element={<HomePage />} />
      </Routes>
    </MemoryRouter>
  ),
  renderToString(
    <MemoryRouter initialEntries={["/experience"]}>
      <Routes>
        <Route path="/experience" element={<ExperiencePage />} />
      </Routes>
    </MemoryRouter>
  ),
  renderToString(
    <MemoryRouter initialEntries={["/system"]}>
      <Routes>
        <Route path="/system" element={<SystemPage />} />
      </Routes>
    </MemoryRouter>
  ),
  renderToString(
    <MemoryRouter initialEntries={[`/projects/${projects[0].slug}`]}>
      <Routes>
        <Route path="/projects/:slug" element={<ProjectPage />} />
      </Routes>
    </MemoryRouter>
  ),
].join("\n");

const all = consoleHtml + pagesHtml;

// Buttons must have a discernible name: text content or aria-label.
const buttons = [...all.matchAll(/<button\b[^>]*>(.*?)<\/button>/gs)];
const unnamed = buttons.filter(([full, inner]) => {
  if (/aria-label="[^"]+"/.test(full)) return false;
  const text = inner.replace(/<[^>]+>/g, "").replace(/&[a-z]+;/g, "").trim();
  return text.length === 0;
});
if (unnamed.length) bad(`${unnamed.length} button(s) with no accessible name`);
else ok(`all ${buttons.length} buttons have an accessible name`);

// Decorative SVG icons must be hidden from assistive tech.
const svgs = [...all.matchAll(/<svg\b[^>]*>/g)];
const exposedSvgs = svgs.filter(
  (m) => !/aria-hidden="true"/.test(m[0]) && !/role="img"/.test(m[0]) && !/aria-label=/.test(m[0])
);
if (exposedSvgs.length) bad(`${exposedSvgs.length} svg(s) neither aria-hidden nor labelled`);
else ok(`all ${svgs.length} svgs are hidden or labelled`);

// Images need alt text.
const imgs = [...all.matchAll(/<img\b[^>]*>/g)];
const noAlt = imgs.filter((m) => !/alt=/.test(m[0]));
if (noAlt.length) bad(`${noAlt.length} img(s) without alt`);
else ok(imgs.length ? `all ${imgs.length} images have alt text` : "no <img> elements");

// The live region must exist and be polite, not assertive.
if (!/role="log"/.test(consoleHtml)) bad("conversation thread is not a log landmark");
else if (!/aria-live="polite"/.test(consoleHtml)) bad("thread live region is not polite");
else ok("conversation thread is a polite live region");

if (!/agent-skip-link/.test(consoleHtml)) bad("no skip link past the transcript");
else ok("skip link to the composer present");

if (!/aria-label="Message the agent"/.test(consoleHtml)) bad("composer textarea unlabelled");
else ok("composer textarea labelled");

// The trace panel is decorative reinforcement; it must not spam a screen reader.
const trace = renderToString(
  <TracePanel activeNodes={["act"]} completedNodes={["classify", "retrieve"]} isStreaming />
);
if (!/aria-label="Agent execution trace"/.test(trace)) bad("trace panel has no accessible name");
else if (/aria-live/.test(trace)) bad("trace panel announces every node transition (too chatty)");
else ok("trace panel is labelled and does not announce transitions");

// Generative UI blocks: clickable cards must say what they do.
const grid = renderToString(
  <ToolBlock
    tool="listProjects"
    data={{ count: projects.length, projects }}
    reducedMotion
  />
);
const gridButtons = [...grid.matchAll(/<button\b[^>]*>/g)];
const labelled = gridButtons.filter((m) => /aria-label="Ask about /.test(m[0]));
if (gridButtons.length && labelled.length !== gridButtons.length) {
  bad(`${gridButtons.length - labelled.length} project chip(s) without an action label`);
} else {
  ok(`all ${gridButtons.length} project chips announce their action`);
}

/* ----------------------------------------------------- reduced motion */

console.log("\n— prefers-reduced-motion —");

const css = [
  "src/styles/agent-console.css",
  "src/styles/pages.css",
  "src/styles/system.css",
  "src/styles/eval.css",
]
  .map((f) => readFileSync(f, "utf8"))
  .join("\n");

const reducedBlocks = [...css.matchAll(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{/g)];
if (reducedBlocks.length === 0) bad("no prefers-reduced-motion blocks in CSS");
else ok(`${reducedBlocks.length} prefers-reduced-motion block(s)`);

for (const anim of ["agent-cursor", "trace-node-dot--active", "trace-connector-pulse", "eval-gauge__fill"]) {
  // Each animated element must be neutralised inside a reduced-motion block.
  const covered = reducedBlocks.some((m) => {
    const start = m.index!;
    const block = css.slice(start, css.indexOf("}", css.indexOf("}", start) + 1) + 200);
    return block.includes(anim);
  }) || new RegExp(`prefers-reduced-motion[\\s\\S]{0,600}${anim.replace(/[-]/g, "\\-")}`).test(css);
  if (covered) ok(`${anim} disabled under reduced motion`);
  else bad(`${anim} still animates under reduced motion`);
}

// Components must also branch on the hook, not rely on CSS alone.
for (const [file, label] of [
  ["src/components/agent-console/TracePanel.tsx", "TracePanel"],
  ["src/components/agent-console/AgentConsole.tsx", "AgentConsole"],
  ["src/components/agent-console/EvalPanel.tsx", "EvalPanel"],
] as const) {
  const src = readFileSync(file, "utf8");
  if (/usePrefersReducedMotion/.test(src)) ok(`${label} respects the reduced-motion hook`);
  else bad(`${label} does not read usePrefersReducedMotion`);
}

console.log(`\n  ${fails === 0 ? "No accessibility problems found." : `${fails} problem(s) found.`}\n`);
if (fails > 0) process.exit(1);
