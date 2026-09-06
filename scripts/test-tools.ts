// Shape tests for the agent tools, run against the real /knowledge content.
//
//   npm run test:tools
//
// These assert structure and provenance, not prose quality: every tool must
// return typed data drawn from /knowledge, with no invented values. Uses
// node:assert rather than a test framework — the project has no test runner
// and this doesn't warrant adding one.

import assert from "node:assert/strict";
import {
  getProject,
  getProjectBySlug,
  listProjects,
  listProjectSummaries,
  getExperience,
  getExperienceEntries,
  getAchievements,
  getAchievementEntries,
  getSkillsOverview,
  buildSkillsOverview,
  retrieveKnowledge,
  searchKnowledgeTool,
  agentTools,
} from "../lib/agent/tools";

let passed = 0;
let failed = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name}`);
    console.log(`        ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    failed++;
  }
}

/** Invoke a tool regardless of its concrete generic signature.
 *  The tools array is heterogeneous, so TS cannot unify their .invoke
 *  overloads; the runtime contract is uniform. */
async function call(t: unknown, input: unknown = {}) {
  return (await (t as { invoke: (i: unknown) => Promise<unknown> }).invoke(input)) as any;
}

async function main() {
  console.log("\nAgent tool tests\n");

  /* ---------------------------------------------------------------- shape */

  await test("agentTools exposes 5 tools, excluding searchKnowledge", () => {
    const names = agentTools.map((t) => t.name as string).sort();
    assert.deepEqual(names, [
      "getAchievements",
      "getExperience",
      "getProject",
      "getSkillsOverview",
      "listProjects",
    ]);
    assert.ok(
      !(names as string[]).includes("searchKnowledge"),
      "searchKnowledge must not be bound to the generation model"
    );
  });

  await test("every tool has a non-trivial description", () => {
    for (const t of [...agentTools, searchKnowledgeTool]) {
      assert.ok(t.description && t.description.length > 80, `${t.name} description too short`);
    }
  });

  /* --------------------------------------------------------- listProjects */

  await test("listProjects returns all 6 projects with required fields", async () => {
    const res = await call(listProjects);
    assert.equal(res.count, 6);
    assert.equal(res.projects.length, 6);
    for (const p of res.projects) {
      assert.ok(p.slug && typeof p.slug === "string");
      assert.ok(p.title && typeof p.title === "string");
      assert.ok(p.oneLiner && typeof p.oneLiner === "string");
      assert.ok(Array.isArray(p.skills) && p.skills.length > 0);
      // Summaries only — no narrative body.
      assert.ok(!("sections" in p), `${p.slug} leaked sections into the summary`);
    }
  });

  /* ----------------------------------------------------------- getProject */

  await test("getProject returns all 5 narrative sections, populated", async () => {
    const res = await call(getProject, { slug: "commodity-intelligence-platform" });
    assert.equal(res.found, true);
    const p = res.project;
    assert.equal(p.title, "Commodity Intelligence Platform");
    assert.deepEqual(Object.keys(p.sections).sort(), [
      "architecture",
      "challenges",
      "decisions",
      "impact",
      "problem",
    ]);
    for (const [key, value] of Object.entries(p.sections)) {
      assert.ok(
        typeof value === "string" && (value as string).length > 50,
        `section "${key}" is empty or too short`
      );
    }
    assert.deepEqual(p.missingSections, []);
  });

  await test("getProject maps '## Key decisions' onto sections.decisions", () => {
    const p = getProjectBySlug("ai-causal-intelligence-system");
    assert.ok(p);
    assert.match(p!.sections.decisions, /Uplift over propensity/);
  });

  await test("getProject strips VERIFY comments from section text", () => {
    // Every project carries VERIFY flags; none may reach the model.
    for (const summary of listProjectSummaries()) {
      const p = getProjectBySlug(summary.slug)!;
      for (const [key, value] of Object.entries(p.sections)) {
        assert.ok(
          !value.includes("VERIFY") && !value.includes("<!--"),
          `${summary.slug}.${key} leaked a VERIFY comment`
        );
      }
    }
  });

  await test("getProject preserves frontmatter facts verbatim", () => {
    const p = getProjectBySlug("sap-bw-data-integration")!;
    assert.ok(p.stack.includes("SAP BW"));
    assert.equal(p.timeframe, ""); // documented as unknown — must stay empty
    assert.deepEqual(p.links, { repo: "", demo: "", writeup: "" });
  });

  await test("getProject on an unknown slug fails cleanly with alternatives", async () => {
    const res = await call(getProject, { slug: "not-a-real-project" });
    assert.equal(res.found, false);
    assert.ok(res.error.includes("not-a-real-project"));
    assert.ok(Array.isArray(res.availableSlugs) && res.availableSlugs.length === 6);
  });

  await test("getProject rejects a missing slug via its zod schema", async () => {
    await assert.rejects(() => getProject.invoke({} as never));
  });

  /* -------------------------------------------------------- getExperience */

  await test("getExperience returns both roles with employer and bullets", async () => {
    const res = await call(getExperience);
    assert.equal(res.count, 2);

    const emerson = res.roles.find((r: any) => r.employer === "Emerson");
    assert.ok(emerson, "Emerson role missing");
    assert.equal(emerson.title, "Graduate Software Engineer Trainee");
    assert.equal(emerson.highlights.length, 6);
    assert.match(emerson.highlights[0], /ETL data migration pipelines/);
    assert.ok(emerson.stack.includes("C#"));

    const wizphys = res.roles.find((r: any) => r.employer === "Wizphys AI");
    assert.ok(wizphys, "Wizphys AI role missing");
    assert.equal(wizphys.highlights.length, 3);
  });

  await test("getExperience flags that dates are undocumented", async () => {
    const res = await call(getExperience);
    for (const role of res.roles) {
      assert.equal(role.dates, "", `${role.employer} should have no documented dates`);
    }
    assert.ok(res.note && /not documented/i.test(res.note));
  });

  await test("getExperience does not leak the '**Stack:**' line into highlights", () => {
    for (const role of getExperienceEntries()) {
      for (const h of role.highlights) {
        assert.ok(!h.startsWith("**Stack:**"), `${role.employer} leaked its stack line`);
      }
    }
  });

  /* ------------------------------------------------------ getAchievements */

  await test("getAchievements excludes placeholders and returns zero entries", async () => {
    const res = await call(getAchievements);
    assert.equal(res.count, 0);
    assert.deepEqual(res.achievements, []);
    assert.ok(res.note && /not something Yash has documented/i.test(res.note));

    const { placeholderCount } = getAchievementEntries();
    assert.equal(placeholderCount, 3, "expected 3 placeholder sections to be filtered");
  });

  await test("getAchievements never emits ⟨...⟩ template text", async () => {
    const res = await call(getAchievements);
    assert.ok(!JSON.stringify(res).includes("⟨"), "placeholder markers reached the tool output");
  });

  /* ----------------------------------------------------- getSkillsOverview */

  await test("getSkillsOverview maps skills to the projects using them", async () => {
    const res = await call(getSkillsOverview);
    assert.ok(res.totalSkills > 10, `expected >10 skills, got ${res.totalSkills}`);

    for (const s of res.skills) {
      assert.ok(typeof s.skill === "string" && s.skill.length > 0);
      assert.ok(Array.isArray(s.projects) && s.projects.length > 0);
      assert.equal(s.projectCount, s.projects.length);
    }

    // Both Fabric projects declare these, so they must aggregate.
    const medallion = res.skills.find((s: any) => s.skill === "Medallion Architecture");
    assert.ok(medallion, "Medallion Architecture missing");
    assert.equal(medallion.projectCount, 2);
    assert.deepEqual(medallion.projects, [
      "commodity-intelligence-platform",
      "sap-bw-data-integration",
    ]);
  });

  await test("getSkillsOverview deduplicates and sorts by evidence", () => {
    const { skills } = buildSkillsOverview();
    const names = skills.map((s) => s.skill);
    assert.equal(new Set(names).size, names.length, "duplicate skill entries");
    for (let i = 1; i < skills.length; i++) {
      assert.ok(
        skills[i - 1].projectCount >= skills[i].projectCount,
        "skills are not sorted by project count"
      );
    }
  });

  await test("getSkillsOverview exposes no ratings or numeric self-assessment", async () => {
    const res = await call(getSkillsOverview);
    for (const s of res.skills) {
      assert.deepEqual(Object.keys(s).sort(), ["projectCount", "projects", "skill"]);
      assert.ok(!("rating" in s) && !("level" in s) && !("years" in s));
    }
    assert.ok(/no ratings/i.test(res.note));
  });

  /* ------------------------------------------------------ searchKnowledge */

  await test("retrieveKnowledge returns ranked results", async () => {
    const results = await retrieveKnowledge("microsoft fabric medallion pipeline", {
      topK: 3,
    });
    assert.equal(results.length, 3);
    assert.ok(results[0].score > 0.3, `top score too low: ${results[0].score}`);
    for (let i = 1; i < results.length; i++) {
      assert.ok(results[i - 1].score >= results[i].score, "results not sorted by score");
    }
    assert.ok(!("embedding" in results[0].chunk), "embedding vector leaked to caller");
  });

  await test("retrieveKnowledge honours the sourceType filter", async () => {
    const results = await retrieveKnowledge("what did he study", {
      topK: 5,
      sourceType: "education",
    });
    assert.ok(results.length > 0);
    for (const r of results) assert.equal(r.chunk.sourceType, "education");
  });

  await test("searchKnowledgeTool returns citable chunks", async () => {
    const res = await call(searchKnowledgeTool, { query: "route optimization" });
    assert.ok(res.count > 0);
    for (const r of res.results) {
      assert.ok(r.sourceFile.startsWith("knowledge/"), "missing citable source file");
      assert.ok(typeof r.score === "number");
    }
  });

  /* ------------------------------------------------------------ integrity */

  await test("no tool output contains a VERIFY flag", async () => {
    const outputs = await Promise.all([
      call(listProjects),
      call(getExperience),
      call(getAchievements),
      call(getSkillsOverview),
      call(getProject, { slug: "parcelpal-route-optimization" }),
    ]);
    const blob = JSON.stringify(outputs);
    assert.ok(!blob.includes("VERIFY"), "a VERIFY flag reached tool output");
    assert.ok(!blob.includes("<!--"), "an HTML comment reached tool output");
  });

  console.log(`\n  ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
