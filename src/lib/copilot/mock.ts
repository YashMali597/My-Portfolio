import {
  profile,
  projects,
  experience,
  skills,
  education,
} from "../../data/site-content";

// Questions shown as clickable chips in the empty chat state.
// Each maps to a rule below so every chip gets a grounded answer.
export const suggestedQuestions: string[] = [
  "How does the Commodity Intelligence Platform pipeline work?",
  "What did you build with Azure AI Search?",
  "Tell me about the LLM failure benchmarking project.",
  "What's the SupplySightAI agentic platform about?",
];

const commodityProject = projects.find((p) => p.title === "Commodity Intelligence Platform");
const sapProject = projects.find((p) => p.title === "SAP BW data integration");
const supplySight = projects.find((p) => p.id === 1);
const parcelPal = projects.find((p) => p.id === 2);
const churnProject = projects.find((p) => p.id === 3);
const causalProject = projects.find((p) => p.id === 4);
const applied = skills.find((s) => s.title.startsWith("Applied AI"));
const emerson = experience.find((e) => e.company === "Emerson");
const wizphys = experience.find((e) => e.company === "Wizphys AI");

interface Rule {
  keywords: string[];
  respond: () => string;
}

const rules: Rule[] = [
  {
    keywords: ["commodity", "medallion", "bronze", "silver", "gold", "direct lake", "fabric"],
    respond: () =>
      `The \`Commodity Intelligence Platform\` ${commodityProject?.desc.replace(
        /^An automated pipeline that /,
        "is an automated pipeline that "
      )} Stages: ${commodityProject?.pipelineStages?.map((s) => s.label).join(" → ")}.`,
  },
  {
    keywords: ["sap", "bw"],
    respond: () =>
      `\`SAP BW data integration\`: ${sapProject?.desc} Stages: ${sapProject?.pipelineStages
        ?.map((s) => s.label)
        .join(" → ")}.`,
  },
  {
    keywords: ["azure ai search", "search index", "indexer", "retrieval"],
    respond: () =>
      `On the Azure AI Search side, my work has focused on ${applied?.items[0]}. It's part of a broader "${applied?.title.replace(/\s*⯆$/, "")}" area that also includes ${applied?.items[1]} and ${applied?.items[2]}.`,
  },
  {
    keywords: ["copilot studio"],
    respond: () =>
      `I've worked on ${applied?.items[1]} — building conversational agents in Copilot Studio on top of enterprise data sources.`,
  },
  {
    keywords: ["llm failure", "benchmark", "evaluation"],
    respond: () =>
      `The LLM failure benchmarking work is about ${applied?.items[2]} — a systematic look at where and why LLM outputs break down, so fixes target real failure modes instead of anecdotes.`,
  },
  {
    keywords: ["supplysight", "supply chain", "agentic"],
    respond: () =>
      `\`SupplySightAI\` — ${supplySight?.desc} Built with ${supplySight?.tech}.`,
  },
  {
    keywords: ["parcelpal", "route", "dijkstra"],
    respond: () => `\`ParcelPal\` — ${parcelPal?.desc} Built with ${parcelPal?.tech}.`,
  },
  {
    keywords: ["churn", "segmentation", "retention"],
    respond: () => `${churnProject?.desc} Tech: ${churnProject?.tech}.`,
  },
  {
    keywords: ["causal", "uplift", "a/b"],
    respond: () => `\`AI Causal Intelligence System\` — ${causalProject?.desc}`,
  },
  {
    keywords: ["emerson", "graduate software engineer", "trainee"],
    respond: () =>
      `At ${emerson?.company}, as ${emerson?.title}, key work included: ${emerson?.bullets
        .slice(0, 3)
        .join("; ")}.`,
  },
  {
    keywords: ["wizphys", "deep learning intern", "posenet", "physiotherapy"],
    respond: () =>
      `At ${wizphys?.company}, as ${wizphys?.title}: ${wizphys?.bullets.join("; ")}.`,
  },
  {
    keywords: ["education", "degree", "university", "school", "gpa"],
    respond: () =>
      education
        .map((e) => `${e.degree} at ${e.school} (${e.years}, ${e.score})`)
        .join(". "),
  },
  {
    keywords: ["skills", "tech stack", "stack", "tools"],
    respond: () =>
      `Core areas span programming (\`Python\`, \`SQL\`, \`C#\`), AI/ML (LLMs, prompt engineering, agentic workflows), data & analytics (EDA, A/B testing, Power BI), and applied enterprise AI work like ${applied?.items[0]}.`,
  },
  {
    keywords: ["contact", "email", "linkedin", "github", "reach"],
    respond: () =>
      `You can reach out at ${profile.contact.email}, or find more at ${profile.contact.linkedin} and ${profile.contact.github}.`,
  },
];

function getMockResponse(query: string): string {
  const q = query.toLowerCase();
  const match = rules.find((rule) => rule.keywords.some((kw) => q.includes(kw)));
  if (match) return match.respond();

  return `I don't have a specific note on that yet, but I can walk you through ${profile.name}'s work — try asking about the \`Commodity Intelligence Platform\`, Azure AI Search, LLM failure benchmarking, or the projects and experience listed on this site.`;
}

/**
 * Entry point the chat widget calls. Signature is intentionally stable —
 * a future prompt swaps the body for a real RAG call without touching
 * any calling code.
 */
export async function getAgentResponse(query: string): Promise<string> {
  return getMockResponse(query);
}
