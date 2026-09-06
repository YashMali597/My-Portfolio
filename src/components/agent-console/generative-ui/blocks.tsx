// Renderers for tool_result frames — one component per tool.
//
// These are the "generative UI" layer: when the agent calls getProject, the
// user gets a real project card in the thread, not a paragraph describing one.
// Every value rendered here comes from the tool's own output, which comes from
// /knowledge — nothing is model-authored.
//
// Defensive by default: tool payloads arrive over the wire as `unknown`, and a
// renderer that throws would take the whole conversation down. Each component
// validates its shape and returns null (falling back to the raw JSON block)
// rather than assuming.

import type { ReactElement } from "react";
import { motion } from "framer-motion";
import {
  Boxes,
  Briefcase,
  Award,
  Tag,
  ExternalLink,
  AlertCircle,
} from "lucide-react";

/* -------------------------------------------------------------------------- */
/* Shared                                                                     */
/* -------------------------------------------------------------------------- */

export interface BlockProps {
  data: any;
  /** Ask the agent a follow-up (project chips, "tell me more" affordances). */
  onAsk?: (message: string) => void;
}

function Chips({ items, variant = "" }: { items: string[]; variant?: string }) {
  if (!items?.length) return null;
  return (
    <div className="gen-chips">
      {items.map((item) => (
        <span key={item} className={`gen-chip ${variant}`}>
          {item}
        </span>
      ))}
    </div>
  );
}

/** Renders one narrative section, skipped entirely when undocumented. */
function Section({ label, body }: { label: string; body?: string }) {
  if (!body || !body.trim()) return null;
  return (
    <div className="gen-section">
      <h5 className="gen-section-title">{label}</h5>
      <p className="gen-section-body">{body.trim()}</p>
    </div>
  );
}

function EmptyNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="gen-empty">
      <AlertCircle size={14} aria-hidden="true" />
      <span>{children}</span>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* getProject                                                                 */
/* -------------------------------------------------------------------------- */

export function ProjectBlock({ data }: BlockProps) {
  if (!data?.found || !data?.project) {
    if (data?.error) return <EmptyNote>{data.error}</EmptyNote>;
    return null;
  }
  const p = data.project;
  const links: [string, string][] = Object.entries(p.links ?? {}).filter(
    ([, url]) => typeof url === "string" && url.trim() !== ""
  ) as [string, string][];

  return (
    <article className="gen-block gen-project">
      <header className="gen-project-head">
        <Boxes size={16} className="gen-block-icon" aria-hidden="true" />
        <div>
          <h4 className="gen-block-title">{p.title}</h4>
          {p.oneLiner && <p className="gen-project-oneliner">{p.oneLiner}</p>}
        </div>
      </header>

      <div className="gen-project-meta">
        {/* timeframe is empty for every project right now — render the row
            only when it has a value rather than showing a blank label. */}
        {p.timeframe ? (
          <span className="gen-meta-item">{p.timeframe}</span>
        ) : null}
        {p.stack?.length ? (
          <span className="gen-meta-item gen-meta-stack">{p.stack.join(" · ")}</span>
        ) : null}
      </div>

      <Chips items={p.skills ?? []} variant="gen-chip--skill" />

      <div className="gen-sections">
        <Section label="Problem" body={p.sections?.problem} />
        <Section label="Architecture" body={p.sections?.architecture} />
        <Section label="Key decisions" body={p.sections?.decisions} />
        <Section label="Challenges" body={p.sections?.challenges} />
        <Section label="Impact" body={p.sections?.impact} />
      </div>

      {links.length > 0 && (
        <div className="gen-links">
          {links.map(([label, url]) => (
            <a
              key={label}
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="gen-link"
            >
              {label} <ExternalLink size={12} aria-hidden="true" />
            </a>
          ))}
        </div>
      )}

      <footer className="gen-source">{p.sourceFile}</footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* listProjects                                                               */
/* -------------------------------------------------------------------------- */

export function ProjectGridBlock({ data, onAsk }: BlockProps) {
  const projects = data?.projects;
  if (!Array.isArray(projects) || projects.length === 0) return null;

  return (
    <div className="gen-block gen-grid-block">
      <header className="gen-block-head">
        <Boxes size={16} className="gen-block-icon" aria-hidden="true" />
        <h4 className="gen-block-title">{projects.length} projects</h4>
      </header>
      <div className="gen-grid">
        {projects.map((p: any) => (
          <button
            key={p.slug}
            type="button"
            className="gen-grid-card"
            onClick={() => onAsk?.(`Tell me about ${p.title}`)}
            // Every card is a shortcut into a deep dive, so announce the action
            // rather than leaving a screen reader with just the title.
            aria-label={`Ask about ${p.title}`}
          >
            <span className="gen-grid-title">{p.title}</span>
            <span className="gen-grid-oneliner">{p.oneLiner}</span>
            {p.skills?.length ? (
              <span className="gen-grid-skills">{p.skills.slice(0, 3).join(" · ")}</span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* getExperience                                                              */
/* -------------------------------------------------------------------------- */

export function ExperienceBlock({ data }: BlockProps) {
  const roles = data?.roles;
  if (!Array.isArray(roles) || roles.length === 0) return null;

  return (
    <div className="gen-block gen-timeline-block">
      <header className="gen-block-head">
        <Briefcase size={16} className="gen-block-icon" aria-hidden="true" />
        <h4 className="gen-block-title">Experience</h4>
      </header>

      <ol className="gen-timeline">
        {roles.map((role: any) => (
          <li key={role.slug} className="gen-timeline-item">
            <span className="gen-timeline-dot" aria-hidden="true" />
            <div className="gen-timeline-content">
              <h5 className="gen-timeline-role">{role.title}</h5>
              <p className="gen-timeline-employer">
                {role.employer}
                {/* Dates are undocumented across the whole knowledge base.
                    Saying so is more honest than rendering an empty slot. */}
                {role.dates ? (
                  <span className="gen-timeline-dates"> · {role.dates}</span>
                ) : (
                  <span className="gen-timeline-dates gen-timeline-dates--missing">
                    {" "}
                    · dates not documented
                  </span>
                )}
              </p>
              {role.highlights?.length ? (
                <ul className="gen-timeline-highlights">
                  {role.highlights.map((h: string, i: number) => (
                    <li key={i}>{h}</li>
                  ))}
                </ul>
              ) : null}
              {role.stack?.length ? (
                <Chips items={role.stack} variant="gen-chip--stack" />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* getAchievements                                                            */
/* -------------------------------------------------------------------------- */

export function AchievementsBlock({ data }: BlockProps) {
  const achievements = data?.achievements;

  // The knowledge base has no real achievements yet, so this is the normal
  // path, not an edge case. Render the absence honestly.
  if (!Array.isArray(achievements) || achievements.length === 0) {
    return <EmptyNote>No achievements are documented yet.</EmptyNote>;
  }

  return (
    <div className="gen-block gen-achievements-block">
      <header className="gen-block-head">
        <Award size={16} className="gen-block-icon" aria-hidden="true" />
        <h4 className="gen-block-title">Achievements</h4>
      </header>
      <div className="gen-achievements">
        {achievements.map((a: any) => (
          <article key={a.slug} className="gen-achievement">
            <h5 className="gen-achievement-title">{a.title}</h5>
            <p className="gen-achievement-meta">
              {[a.date, a.type].filter(Boolean).join(" · ")}
            </p>
            {a.description && (
              <p className="gen-achievement-desc">{a.description}</p>
            )}
            {/* Only render a link when there is a real URL — the migration left
                these blank rather than shipping the placeholder post id. */}
            {a.linkedinUrl && /^https?:\/\//.test(a.linkedinUrl) && (
              <a
                href={a.linkedinUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="gen-link"
              >
                View on LinkedIn <ExternalLink size={12} aria-hidden="true" />
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* getSkillsOverview                                                          */
/* -------------------------------------------------------------------------- */

export function SkillsBlock({ data, onAsk }: BlockProps) {
  const skills = data?.skills;
  if (!Array.isArray(skills) || skills.length === 0) return null;

  // Group by project so the display shows evidence — which skills were used
  // where — rather than any kind of proficiency reading.
  const byProject = new Map<string, string[]>();
  for (const s of skills) {
    for (const slug of s.projects ?? []) {
      if (!byProject.has(slug)) byProject.set(slug, []);
      byProject.get(slug)!.push(s.skill);
    }
  }

  const titleize = (slug: string) =>
    slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <div className="gen-block gen-skills-block">
      <header className="gen-block-head">
        <Tag size={16} className="gen-block-icon" aria-hidden="true" />
        <h4 className="gen-block-title">
          {skills.length} skills, by where they were used
        </h4>
      </header>

      <div className="gen-skill-groups">
        {[...byProject.entries()].map(([slug, list]) => (
          <div key={slug} className="gen-skill-group">
            <button
              type="button"
              className="gen-skill-group-title"
              onClick={() => onAsk?.(`Tell me about ${titleize(slug)}`)}
            >
              {titleize(slug)}
            </button>
            <Chips items={list} variant="gen-chip--skill" />
          </div>
        ))}
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Fallback                                                                   */
/* -------------------------------------------------------------------------- */

export function RawJsonBlock({ data, tool }: BlockProps & { tool: string }) {
  return (
    <details className="gen-block gen-raw">
      <summary className="gen-raw-summary">{tool}</summary>
      <pre className="gen-raw-pre">
        <code>{JSON.stringify(data, null, 2)}</code>
      </pre>
    </details>
  );
}

/* -------------------------------------------------------------------------- */
/* Registry                                                                   */
/* -------------------------------------------------------------------------- */

const REGISTRY: Record<string, (props: BlockProps) => ReactElement | null> = {
  getProject: ProjectBlock,
  listProjects: ProjectGridBlock,
  getExperience: ExperienceBlock,
  getAchievements: AchievementsBlock,
  getSkillsOverview: SkillsBlock,
};

export interface ToolBlockProps {
  tool: string;
  data: unknown;
  onAsk?: (message: string) => void;
  reducedMotion?: boolean;
}

/** Resolve a tool_result frame to its component, animating it into the thread. */
export default function ToolBlock({
  tool,
  data,
  onAsk,
  reducedMotion = false,
}: ToolBlockProps) {
  const Component = REGISTRY[tool];

  let content: ReactElement | null = null;
  if (Component) {
    try {
      content = <Component data={data} onAsk={onAsk} />;
    } catch {
      // A malformed payload must not blank the conversation — fall through to
      // the raw JSON view instead.
      content = null;
    }
  }
  if (!content) content = <RawJsonBlock tool={tool} data={data} />;

  return (
    <motion.div
      className="gen-block-wrap"
      initial={reducedMotion ? false : { opacity: 0, y: 12, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
    >
      {content}
    </motion.div>
  );
}

export { REGISTRY as toolBlockRegistry };
