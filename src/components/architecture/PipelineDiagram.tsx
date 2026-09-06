import { Fragment, useRef, useState } from "react";
import { motion, AnimatePresence, useInView } from "framer-motion";
import {
  Database,
  Layers,
  Filter,
  Gem,
  LayoutDashboard,
  Server,
  BarChart3,
  type LucideIcon,
} from "lucide-react";
import type { PipelineStage } from "../../data/site-content";
import { StatusDot } from "../ui";
import { renderRichText } from "../../lib/richText";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

const ICONS: Record<string, LucideIcon> = {
  Database,
  Layers,
  Filter,
  Gem,
  LayoutDashboard,
  Server,
  BarChart3,
};

interface PipelineDiagramProps {
  stages: PipelineStage[];
  /** Extra facts shown in the legend strip, beyond the automatic stage count. */
  legendItems?: string[];
}

function PipelineConnector({ animate }: { animate: boolean }) {
  return (
    <div className="pipeline-connector" aria-hidden="true">
      <svg
        className="pipeline-connector-svg pipeline-connector-svg--horizontal"
        viewBox="0 0 100 4"
        preserveAspectRatio="none"
      >
        <line x1="0" y1="2" x2="100" y2="2" className="pipeline-connector-line" />
        {animate && <line x1="0" y1="2" x2="100" y2="2" className="pipeline-connector-pulse" />}
      </svg>
      <svg
        className="pipeline-connector-svg pipeline-connector-svg--vertical"
        viewBox="0 0 4 100"
        preserveAspectRatio="none"
      >
        <line x1="2" y1="0" x2="2" y2="100" className="pipeline-connector-line" />
        {animate && (
          <line
            x1="2"
            y1="0"
            x2="2"
            y2="100"
            className="pipeline-connector-pulse pipeline-connector-pulse--vertical"
          />
        )}
      </svg>
    </div>
  );
}

export default function PipelineDiagram({ stages, legendItems = [] }: PipelineDiagramProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const wrapperRef = useRef<HTMLDivElement>(null);
  // Pre-trigger a bit before it's actually on screen so the pulse is already
  // running by the time the user's eye reaches it, without wasting cycles
  // animating a diagram nobody has scrolled to yet.
  const isInView = useInView(wrapperRef, { once: true, margin: "200px" });

  const openId = hoveredId ?? pinnedId;
  const hasActive = openId !== null;

  return (
    <div className="pipeline-diagram-wrapper" ref={wrapperRef}>
      <div className="pipeline-legend">
        <span className="pipeline-legend-item">
          <StatusDot status="idle" /> {stages.length} stages
        </span>
        {legendItems.map((item) => (
          <span className="pipeline-legend-item" key={item}>
            <StatusDot status="active" /> {item}
          </span>
        ))}
      </div>

      <div className="pipeline-diagram" role="group" aria-label="Pipeline architecture diagram">
        {stages.map((stage, i) => {
          const Icon = stage.icon ? ICONS[stage.icon] : undefined;
          const isOpen = openId === stage.id;
          const isDimmed = hasActive && !isOpen;

          return (
            <Fragment key={stage.id}>
              <div className="pipeline-node-wrapper">
                <button
                  type="button"
                  className={`pipeline-node${isOpen ? " pipeline-node--active" : ""}${
                    isDimmed ? " pipeline-node--dimmed" : ""
                  }`}
                  aria-expanded={isOpen}
                  aria-describedby={isOpen ? `${stage.id}-tooltip` : undefined}
                  onMouseEnter={() => setHoveredId(stage.id)}
                  onMouseLeave={() => setHoveredId((h) => (h === stage.id ? null : h))}
                  onClick={() => {
                    // A click/tap fires a synthetic mouseenter first, which would
                    // otherwise keep hoveredId set and mask this toggle — clear it
                    // so the pin (open/close) is authoritative once clicked.
                    setPinnedId((p) => (p === stage.id ? null : stage.id));
                    setHoveredId((h) => (h === stage.id ? null : h));
                  }}
                  onBlur={() => setPinnedId((p) => (p === stage.id ? null : p))}
                >
                  {stage.status && <StatusDot status={stage.status} className="pipeline-node-status" />}
                  <span className="pipeline-node-icon" aria-hidden="true">
                    {Icon && <Icon size={20} />}
                  </span>
                  <span className="pipeline-node-label">{stage.label}</span>
                </button>

                <AnimatePresence>
                  {isOpen && (
                    <motion.div
                      id={`${stage.id}-tooltip`}
                      role="tooltip"
                      className="pipeline-tooltip glass-panel"
                      initial={{ opacity: 0, y: 8, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 8, scale: 0.95 }}
                      transition={{ duration: 0.16 }}
                    >
                      {renderRichText(stage.description)}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {i < stages.length - 1 && (
                <PipelineConnector animate={!prefersReducedMotion && isInView} />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
