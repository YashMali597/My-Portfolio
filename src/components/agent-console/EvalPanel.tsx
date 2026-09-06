// Evaluation results for the /system page.
//
// The arc gauges deliberately echo the telemetry style the old skills section
// used — with the important difference that these are measured numbers from
// eval/results.json, not self-assessed ratings. That distinction is the whole
// reason the skills gauges were removed and these were built.
//
// When the eval has never been run, this renders an honest empty state rather
// than zeros that would read as failures.

import { useRef } from "react";
import { useInView } from "framer-motion";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { evalSummary, type EvalRate } from "../../data/eval-summary";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

/* -------------------------------------------------------------- gauge */

const RADIUS = 42;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
/** Draw a 270° arc, leaving a gap at the bottom. */
const ARC = 0.75;

function toneFor(rate: number): "good" | "warn" | "bad" {
  if (rate >= 0.9) return "good";
  if (rate >= 0.7) return "warn";
  return "bad";
}

function ArcGauge({
  label,
  rate,
  detail,
  animate,
}: {
  label: string;
  rate: number;
  detail: string;
  animate: boolean;
}) {
  const tone = toneFor(rate);
  const dash = CIRCUMFERENCE * ARC;
  const filled = dash * rate;

  return (
    <figure className={`eval-gauge eval-gauge--${tone}`}>
      <svg viewBox="0 0 100 100" className="eval-gauge__svg" aria-hidden="true">
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className="eval-gauge__track"
          strokeDasharray={`${dash} ${CIRCUMFERENCE}`}
          transform="rotate(135 50 50)"
        />
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          className="eval-gauge__fill"
          strokeDasharray={`${animate ? filled : 0} ${CIRCUMFERENCE}`}
          transform="rotate(135 50 50)"
        />
      </svg>
      <div className="eval-gauge__center">
        <span className="eval-gauge__value">{(rate * 100).toFixed(0)}%</span>
        <span className="eval-gauge__detail">{detail}</span>
      </div>
      <figcaption className="eval-gauge__label">{label}</figcaption>
    </figure>
  );
}

/* --------------------------------------------------------------- panel */

function rateDetail(r?: EvalRate): string {
  return r ? `${r.passed}/${r.total}` : "";
}

export default function EvalPanel() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "120px" });
  const reduced = usePrefersReducedMotion();
  const animate = reduced || inView;

  const s = evalSummary;

  if (!s.hasResults) {
    return (
      <div className="eval-empty">
        <p className="eval-empty__title">No evaluation results yet.</p>
        <p className="eval-empty__body">
          The dataset is written — {s.datasetSize} questions covering every
          project, experience, deliberately undocumented facts, an ambiguous
          question that should trigger a clarification, and out-of-scope
          requests that should be declined. Run <code>npm run eval</code> with
          API keys configured to populate retrieval hit rate, groundedness, and
          latency here.
        </p>
      </div>
    );
  }

  const gauges: { label: string; r?: EvalRate }[] = [
    { label: "Retrieval hit rate", r: s.retrieval },
    { label: "Groundedness", r: s.groundedness },
    { label: "Correct behaviour", r: s.behaviour },
    { label: "Section precision", r: s.sectionPrecision },
  ];

  return (
    <div className="eval-panel" ref={ref}>
      <div className="eval-gauges">
        {gauges.map(({ label, r }) =>
          r && r.rate !== null ? (
            <ArcGauge
              key={label}
              label={label}
              rate={r.rate}
              detail={rateDetail(r)}
              animate={animate}
            />
          ) : null
        )}
      </div>

      <dl className="eval-stats">
        <div>
          <dt>Items</dt>
          <dd>{s.itemCount}</dd>
        </div>
        <div>
          <dt>Latency p50</dt>
          <dd>{s.latencyMs?.p50}ms</dd>
        </div>
        <div>
          <dt>Latency p95</dt>
          <dd>{s.latencyMs?.p95}ms</dd>
        </div>
        <div>
          <dt>Tokens</dt>
          <dd>
            {s.tokens?.reported
              ? `${s.tokens.input.toLocaleString()} in / ${s.tokens.output.toLocaleString()} out`
              : "not reported"}
          </dd>
        </div>
        <div>
          <dt>Est. cost</dt>
          <dd>{s.tokens?.reported ? `$${s.estimatedCostUsd?.toFixed(4)}` : "—"}</dd>
        </div>
      </dl>

      {s.byMode && (
        <div className="eval-modes">
          {Object.entries(s.byMode).map(([mode, r]) =>
            r.total > 0 ? (
              <div key={mode} className={`eval-mode eval-mode--${toneFor(r.rate ?? 0)}`}>
                <span className="eval-mode__name">{mode.replace(/_/g, " ")}</span>
                <span className="eval-mode__score">
                  {r.passed}/{r.total}
                </span>
              </div>
            ) : null
          )}
        </div>
      )}

      {/* Showing what failed is the point. A results panel that only ever shows
          a green score is marketing, not evaluation. */}
      {s.failures.length > 0 ? (
        <div className="eval-failures">
          <h4 className="eval-failures__title">
            <AlertTriangle size={14} aria-hidden="true" /> {s.failures.length} failing item
            {s.failures.length === 1 ? "" : "s"}
          </h4>
          <ul>
            {s.failures.map((f) => (
              <li key={f.id}>
                <code>{f.id}</code>
                <span className="eval-failure__q">{f.question}</span>
                <span className="eval-failure__why">{f.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="eval-clean">
          <CheckCircle2 size={14} aria-hidden="true" /> No failing items in this run.
        </p>
      )}

      <p className="eval-meta">
        {s.itemCount} items from <code>eval/dataset.json</code>, judged by a
        separate strict grounding call. Last run{" "}
        {s.generatedAt ? new Date(s.generatedAt).toLocaleDateString() : "—"}.
        Regenerate with <code>npm run eval</code>.
      </p>
    </div>
  );
}
