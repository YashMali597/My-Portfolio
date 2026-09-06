// /system — this site documenting its own architecture.
//
// The page is itself part of the argument: the ADRs and overview render from
// knowledge/system-architecture.md, which is also chunked into the retrieval
// index, so the agent can answer questions about the same architecture this
// page describes. There is one source, not a page and a separate prompt.

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { FlaskConical, Wrench, ScrollText, Network } from "lucide-react";
import { systemOverview, adrs } from "../data/site-content";
import { toolRegistry } from "../data/tool-registry";
import GraphDiagram from "../components/agent-console/GraphDiagram";
import AgentDock from "../components/agent-console/AgentDock";
import EvalPanel from "../components/agent-console/EvalPanel";
import { askAgent } from "../../lib/agent/agentBus";

/** Overview sections rendered above the diagram; the rest sit below it. */
const LEAD_HEADINGS = new Set(["overview"]);

function ToolRow({ tool }: { tool: (typeof toolRegistry)[number] }) {
  return (
    <article className="tool-row">
      <header className="tool-row__head">
        <code className="tool-row__name">{tool.name}</code>
        {!tool.boundToModel && (
          <span className="tool-row__badge" title="Called by the graph, never exposed to the model">
            graph-internal
          </span>
        )}
      </header>

      <p className="tool-row__desc">{tool.description}</p>

      <div className="tool-row__shapes">
        <div className="tool-shape">
          <h4>Input</h4>
          {tool.input.length === 0 ? (
            <p className="tool-shape__none">no arguments</p>
          ) : (
            <ul>
              {tool.input.map((f) => (
                <li key={f.name}>
                  <code>
                    {f.name}
                    {f.optional ? "?" : ""}: {f.type}
                  </code>
                  {f.description && <span className="tool-shape__doc">{f.description}</span>}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="tool-shape">
          <h4>Output</h4>
          <ul>
            {tool.output.map((f) => (
              <li key={f.name}>
                <code>
                  {f.name}: {f.type}
                </code>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </article>
  );
}

function AdrCard({ adr }: { adr: (typeof adrs)[number] }) {
  const parts: [string, string][] = [
    ["Context", adr.context],
    ["Decision", adr.decision],
    ["Trade-offs considered", adr.tradeoffs],
    ["Consequences", adr.consequences],
  ];

  return (
    <article className="adr">
      <header className="adr__head">
        <span className="adr__id">{adr.id}</span>
        <h3 className="adr__title">{adr.title}</h3>
      </header>
      <div className="adr__body">
        {parts.map(([label, text]) =>
          text ? (
            <section key={label} className="adr__part">
              <h4 className="adr__part-title">{label}</h4>
              <div className="markdown-body markdown-body--tight">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{text}</ReactMarkdown>
              </div>
            </section>
          ) : null
        )}
      </div>
    </article>
  );
}

export default function SystemPage() {
  const lead = systemOverview.filter((s) => LEAD_HEADINGS.has(s.heading.toLowerCase()));
  const rest = systemOverview.filter((s) => !LEAD_HEADINGS.has(s.heading.toLowerCase()));

  const ask = (message: string) => {
    if (!askAgent(message)) {
      window.location.href = `/?ask=${encodeURIComponent(message)}`;
    }
  };

  return (
    <>
      <div className="container system-page">
        <header className="system-page__head">
          <h1 className="section-title">System</h1>
          <p className="system-page__sub">
            This site runs on the orchestration graph below. Every answer the
            agent gives — on this page or any other — goes through it, and is
            grounded in the same markdown knowledge base that renders the static
            pages you have been reading.
          </p>
          <p className="system-page__sub">
            This page is not a separate description of the system. It renders
            from <code>knowledge/system-architecture.md</code>, which is also
            chunked into the retrieval index — so the agent can answer questions
            about this architecture from the same source, and the two cannot
            disagree.
          </p>
          <button type="button" className="system-page__ask" onClick={() => ask("How does your agent architecture work?")}>
            Ask the agent about this architecture →
          </button>
        </header>

        {lead.map((s) => (
          <div key={s.heading} className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.markdown}</ReactMarkdown>
          </div>
        ))}

        <section className="system-section">
          <h2 className="system-section__title">
            <Network size={18} aria-hidden="true" /> The orchestration graph
          </h2>
          <GraphDiagram />
        </section>

        {rest.map((s) => (
          <section key={s.heading} className="system-section">
            <h2 className="system-section__title">{s.heading}</h2>
            <div className="markdown-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{s.markdown}</ReactMarkdown>
            </div>
          </section>
        ))}

        <section className="system-section">
          <h2 className="system-section__title">
            <Wrench size={18} aria-hidden="true" /> Tool registry
          </h2>
          <p className="system-section__note">
            {toolRegistry.length} tools. This table is generated by introspecting{" "}
            <code>lib/agent/tools.ts</code> at build time — input shapes come
            from each tool&apos;s Zod schema, output shapes from actually calling
            it — so it cannot drift from the real definitions.
          </p>
          <div className="tool-registry">
            {toolRegistry.map((tool) => (
              <ToolRow key={tool.name} tool={tool} />
            ))}
          </div>
        </section>

        <section className="system-section">
          <h2 className="system-section__title">
            <ScrollText size={18} aria-hidden="true" /> Architecture decision records
          </h2>
          <p className="system-section__note">
            {adrs.length} decisions, with the alternatives that were rejected and
            what each choice cost.
          </p>
          <div className="adr-list">
            {adrs.map((adr) => (
              <AdrCard key={adr.id} adr={adr} />
            ))}
          </div>
        </section>

        <section className="system-section">
          <h2 className="system-section__title">
            <FlaskConical size={18} aria-hidden="true" /> Evaluation
          </h2>
          <p className="system-section__note">
            An agent that claims to answer only from its knowledge base should
            be able to prove it. These are measured results from{" "}
            <code>eval/dataset.json</code>, not self-assessment — regenerate
            with <code>npm run eval</code>.
          </p>
          <EvalPanel />
        </section>
      </div>

      <AgentDock />
    </>
  );
}
