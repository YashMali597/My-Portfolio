import { memo } from "react";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

const OUTER_LABELS = ["RETRIEVER", "PLANNER", "TOOL-USE", "RESPONDER", "EVALUATOR"];
const CENTER = { id: "orchestrator", label: "ORCHESTRATOR", x: 400, y: 240 };
const OUTER_RADIUS = 190;

const outerNodes = OUTER_LABELS.map((label, i) => {
  const angle = (-90 + i * (360 / OUTER_LABELS.length)) * (Math.PI / 180);
  return {
    id: label.toLowerCase(),
    label,
    x: CENTER.x + OUTER_RADIUS * Math.cos(angle),
    y: CENTER.y + OUTER_RADIUS * Math.sin(angle),
  };
});

const nodes = [{ ...CENTER, isCenter: true }, ...outerNodes];

// Quadratic bezier between two nodes, bowed outward for a "circuit" look.
function edgePath(a, b, bow = 34) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const px = -dy / len;
  const py = dx / len;
  const cx = mx + px * bow;
  const cy = my + py * bow;
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

const edges = outerNodes.map((node) => ({
  id: `orchestrator-${node.id}`,
  d: edgePath(CENTER, node),
}));

// Takes no props and its data is static (computed at module scope), so the
// only thing that ever changes its output is prefersReducedMotion — memoize
// to skip reconciling this fairly large SVG tree on every Hero re-render
// (the typewriter effect above it re-renders Hero every ~40-80ms while typing).
function AgentNetwork() {
  const prefersReducedMotion = usePrefersReducedMotion();

  return (
    <svg
      className="agent-network"
      viewBox="0 0 800 480"
      role="img"
      aria-label="Diagram of AI agents (retriever, planner, tool-use, responder, evaluator) exchanging messages with a central orchestrator"
      preserveAspectRatio="xMidYMid meet"
    >
      {edges.map((edge, i) => (
        <g key={edge.id}>
          <path d={edge.d} className="agent-edge" />
          {!prefersReducedMotion && (
            <path
              d={edge.d}
              className="agent-edge-pulse"
              style={{ animationDelay: `${i * 0.5}s` }}
            />
          )}
        </g>
      ))}

      {nodes.map((node) => (
        <g key={node.id} transform={`translate(${node.x}, ${node.y})`}>
          {node.isCenter && (
            <circle
              r="48"
              className={
                prefersReducedMotion
                  ? "agent-node-glow agent-node-glow--static"
                  : "agent-node-glow"
              }
            />
          )}
          <circle
            r={node.isCenter ? 32 : 20}
            className={node.isCenter ? "agent-node agent-node--center" : "agent-node"}
          />
          <text
            y={node.isCenter ? 62 : 40}
            className={
              node.isCenter
                ? "agent-node-label agent-node-label--center"
                : "agent-node-label"
            }
            textAnchor="middle"
          >
            {node.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

export default memo(AgentNetwork);
