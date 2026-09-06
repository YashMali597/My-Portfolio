// Static reference diagram of the agent graph.
//
// Same visual language as TracePanel (nodes, pulsing connectors, mono labels),
// but fixed rather than live: TracePanel shows what is happening right now,
// this shows what the machine is. Each node carries the model that powers it,
// which is the thing an interviewer actually wants to see.

import { Fragment } from "react";
import {
  Compass,
  Search,
  HelpCircle,
  Wrench,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import { modelConfig } from "../../data/tool-registry";

interface GraphNodeSpec {
  id: string;
  label: string;
  icon: LucideIcon;
  model: string;
  provider: "groq" | "gemini" | "local" | "none";
  job: string;
  /** Rendered as a branch off the main path rather than inline. */
  conditional?: boolean;
}

// Model ids come from the generated registry, not typed here: both original
// ids were retired by their providers mid-development and a hand-written
// diagram had already drifted to naming dead models.
const NODES: GraphNodeSpec[] = [
  {
    id: "classify",
    label: "classify",
    icon: Compass,
    model: modelConfig.router,
    provider: "groq",
    job: "Routes the question into one of seven intents and resolves a project slug. Temperature 0 — routing must be reproducible. Runs on every turn, so latency is the constraint.",
  },
  {
    id: "retrieve",
    label: "retrieve",
    icon: Search,
    model: modelConfig.embedding,
    provider: "local",
    job: "Embeds the question locally and cosine-scans the index, filtered by the classified intent's source type and, when known, the specific project. No LLM call.",
  },
  {
    id: "clarify",
    label: "clarify",
    icon: HelpCircle,
    model: "—",
    provider: "none",
    conditional: true,
    job: "Conditional. On low confidence, or a deep-dive with no identified project, calls interrupt() to suspend the graph and ask instead of guessing. The reply resumes the same run.",
  },
  {
    id: "act",
    label: "act",
    icon: Wrench,
    model: modelConfig.generation,
    provider: "gemini",
    job: "Binds the tool registry and decides which structured facts the question needs. Gathers only — it is instructed never to write the answer.",
  },
  {
    id: "generate",
    label: "generate",
    icon: MessageSquareText,
    model: modelConfig.generation,
    provider: "gemini",
    job: "Writes the answer from the retrieved chunks and tool results, under the contract authored in profile.md. Receives no other source of facts.",
  },
];

export default function GraphDiagram() {
  return (
    <figure className="graph-diagram">
      <div className="graph-flow" role="img" aria-label="Agent graph: classify, retrieve, optional clarify, act, generate">
        {NODES.map((node, i) => {
          const Icon = node.icon;
          return (
            <Fragment key={node.id}>
              {i > 0 && (
                <div className="graph-connector" aria-hidden="true">
                  <svg viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
                    <line x1="0" y1="2" x2="100" y2="2" className="graph-connector-line" />
                  </svg>
                </div>
              )}
              <div
                className={`graph-node graph-node--${node.provider}${
                  node.conditional ? " graph-node--conditional" : ""
                }`}
              >
                <Icon size={15} className="graph-node-icon" aria-hidden="true" />
                <span className="graph-node-label">{node.label}</span>
              </div>
            </Fragment>
          );
        })}
      </div>

      <div className="graph-legend">
        <span className="graph-legend-item graph-legend-item--groq">Groq</span>
        <span className="graph-legend-item graph-legend-item--gemini">Gemini</span>
        <span className="graph-legend-item graph-legend-item--local">local model</span>
        <span className="graph-legend-item graph-legend-item--none">no model</span>
      </div>

      <dl className="graph-captions">
        {NODES.map((node) => (
          <div key={node.id} className={`graph-caption graph-caption--${node.provider}`}>
            <dt>
              <span className="graph-caption-name">{node.label}</span>
              <span className="graph-caption-model">{node.model}</span>
              {node.conditional && (
                <span className="graph-caption-badge">conditional</span>
              )}
            </dt>
            <dd>{node.job}</dd>
          </div>
        ))}
      </dl>

      <figcaption className="graph-figcaption">
        Edges: <code>classify → retrieve → act → generate</code>. When clarify
        fires, the path becomes{" "}
        <code>retrieve → clarify → retrieve → act → generate</code> — the second
        retrieve is a distinct node so termination is structural rather than
        dependent on the user&apos;s reply.
      </figcaption>
    </figure>
  );
}
