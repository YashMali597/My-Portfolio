// Live view of the agent graph as it executes.
//
// Deliberately reuses the visual language of PipelineDiagram (nodes joined by
// pulsing connectors, status dots, mono labels) so the agent's internals read
// as the same kind of object as the data pipelines it talks about — the site's
// whole thesis is "here is how the machine actually works", and this makes the
// agent honest about its own.

import { Fragment } from "react";
import { motion } from "framer-motion";
import {
  Compass,
  Search,
  HelpCircle,
  Wrench,
  MessageSquareText,
  type LucideIcon,
} from "lucide-react";
import type { NodeName } from "../../../lib/agent/useAgentStream";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";
import { modelConfig } from "../../data/tool-registry";

interface TraceNode {
  id: NodeName;
  label: string;
  icon: LucideIcon;
  hint: string;
}

/** The happy path. `clarify` is conditional, so it is rendered as a branch
 *  that only appears when the graph actually takes it. */
const NODES: TraceNode[] = [
  { id: "classify", label: "classify", icon: Compass, hint: `Routing the question (Groq / ${modelConfig.router})` },
  { id: "retrieve", label: "retrieve", icon: Search, hint: "Searching the knowledge base" },
  { id: "act", label: "act", icon: Wrench, hint: `Calling tools for structured facts (${modelConfig.generation})` },
  { id: "generate", label: "generate", icon: MessageSquareText, hint: `Writing the grounded answer (${modelConfig.generation})` },
];

const CLARIFY_NODE: TraceNode = {
  id: "clarify",
  label: "clarify",
  icon: HelpCircle,
  hint: "Asking instead of guessing",
};

export interface TracePanelProps {
  activeNodes: NodeName[];
  completedNodes: NodeName[];
  isStreaming: boolean;
  /** Compact layout for the floating widget. */
  compact?: boolean;
}

function statusOf(
  id: NodeName,
  active: NodeName[],
  completed: NodeName[]
): "active" | "done" | "idle" {
  if (active.includes(id)) return "active";
  if (completed.includes(id)) return "done";
  return "idle";
}

function TraceConnector({ lit }: { lit: boolean }) {
  return (
    <div className="trace-connector" aria-hidden="true">
      <svg className="trace-connector-svg" viewBox="0 0 100 4" preserveAspectRatio="none" aria-hidden="true" focusable="false">
        <line x1="0" y1="2" x2="100" y2="2" className="trace-connector-line" />
        {lit && <line x1="0" y1="2" x2="100" y2="2" className="trace-connector-pulse" />}
      </svg>
    </div>
  );
}

export default function TracePanel({
  activeNodes,
  completedNodes,
  isStreaming,
  compact = false,
}: TracePanelProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  // `retrieveAfterClarify` is the same node function running a second time —
  // surface it on the existing "retrieve" node rather than adding a box the
  // user has to interpret.
  const normalize = (nodes: NodeName[]): NodeName[] =>
    nodes.map((n) => (n === "retrieveAfterClarify" ? "retrieve" : n));

  const active = normalize(activeNodes);
  const completed = normalize(completedNodes);
  const clarifyTaken = completed.includes("clarify") || active.includes("clarify");

  const nodes = clarifyTaken
    ? [NODES[0], NODES[1], CLARIFY_NODE, NODES[2], NODES[3]]
    : NODES;

  return (
    <section
      className={`trace-panel${compact ? " trace-panel--compact" : ""}`}
      aria-label="Agent execution trace"
    >
      <header className="trace-header">
        <span className="trace-title">graph</span>
        <span
          className={`trace-status${isStreaming ? " trace-status--live" : ""}`}
          // The trace is decorative reinforcement of the streamed answer;
          // announcing every node transition would spam a screen reader.
          aria-hidden="true"
        >
          {isStreaming ? "running" : "idle"}
        </span>
      </header>

      <div className="trace-flow">
        {nodes.map((node, i) => {
          const status = statusOf(node.id, active, completed);
          const Icon = node.icon;
          return (
            <Fragment key={node.id}>
              {i > 0 && (
                <TraceConnector
                  lit={!prefersReducedMotion && status !== "idle"}
                />
              )}
              <motion.div
                className={`trace-node trace-node--${status}`}
                title={node.hint}
                animate={
                  prefersReducedMotion
                    ? undefined
                    : status === "active"
                      ? { scale: [1, 1.06, 1] }
                      : { scale: 1 }
                }
                transition={
                  status === "active"
                    ? { duration: 1.4, repeat: Infinity, ease: "easeInOut" }
                    : { duration: 0.25 }
                }
              >
                <Icon size={14} className="trace-node-icon" aria-hidden="true" />
                <span className="trace-node-label">{node.label}</span>
                <span className={`trace-node-dot trace-node-dot--${status}`} aria-hidden="true" />
              </motion.div>
            </Fragment>
          );
        })}
      </div>

      {!compact && (
        <p className="trace-caption">
          {active.length > 0
            ? (nodes.find((n) => n.id === active[0])?.hint ?? "")
            : "Every answer runs through this graph and is grounded in the knowledge base."}
        </p>
      )}
    </section>
  );
}
