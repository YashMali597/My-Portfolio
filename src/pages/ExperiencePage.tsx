// Experience: a skimmable timeline of roles, education, and achievements.
//
// Deliberately shallow. Every bullet here is already in /knowledge, and the
// deep narrative — why a decision was made, what broke — belongs to the agent,
// not to more static prose. Resist expanding this page; add to the markdown
// instead and let the agent surface it.

import { GraduationCap } from "lucide-react";
import { experience, education } from "../data/site-content";
import AgentDock from "../components/agent-console/AgentDock";
import { askAgent } from "../../lib/agent/agentBus";

export default function ExperiencePage() {
  const ask = (message: string) => {
    if (!askAgent(message)) {
      window.location.href = `/?ask=${encodeURIComponent(message)}`;
    }
  };

  return (
    <>
      <div className="container experience-page">
        <header className="experience-page__head">
          <h1 className="section-title">Experience</h1>
          <p className="experience-page__sub">
            The short version. Ask the agent for depth on any role.
          </p>
        </header>

        <ol className="role-timeline">
          {experience.map((role) => (
            <li key={role.title} className="role-timeline__item">
              <span className="role-timeline__dot" aria-hidden="true" />
              <div className="role-timeline__content">
                <h2 className="role-timeline__title">{role.title}</h2>
                <p className="role-timeline__employer">
                  {role.company}
                  {/* Dates are undocumented in /knowledge. Saying so beats an
                      empty slot that reads as a rendering bug. */}
                  {role.dates ? (
                    <span className="role-timeline__dates"> · {role.dates}</span>
                  ) : (
                    <span className="role-timeline__dates role-timeline__dates--missing">
                      {" "}
                      · dates not documented
                    </span>
                  )}
                </p>

                {/* All bullets, not just the first.
                    Prompt 6 asked for a one-line summary here, and the fidelity
                    check showed what that cost: six quantified achievements
                    (90%+ data integrity, 45% retrieval-time reduction, 15+
                    validation rules, 150+ test scenarios, 15% accuracy, 18%
                    engagement) rendered on NO page at all. They were reachable
                    only by asking the agent — which fails for a recruiter
                    skimming, for anyone with JS disabled, and whenever the
                    free-tier quota is exhausted.
                    These are short résumé lines, not the deep project narrative
                    that page was told to avoid duplicating. */}
                {role.bullets.length > 0 && (
                  <ul className="role-timeline__bullets">
                    {role.bullets.map((b, i) => (
                      <li key={i}>{b}</li>
                    ))}
                  </ul>
                )}

                {role.stack.length > 0 && (
                  <ul className="skill-chips" aria-label="Stack">
                    {role.stack.map((s) => (
                      <li key={s} className="skill-chip">
                        {s}
                      </li>
                    ))}
                  </ul>
                )}

                <button
                  type="button"
                  className="role-timeline__ask"
                  onClick={() => ask(`What did he do at ${role.company}?`)}
                >
                  Ask the agent about this role →
                </button>
              </div>
            </li>
          ))}
        </ol>

        <section className="education-block">
          <h2 className="experience-page__section-title">
            <GraduationCap size={18} aria-hidden="true" /> Education
          </h2>
          <ul className="education-list">
            {education.map((entry) => (
              <li key={entry.degree} className="education-item">
                <h3 className="education-item__degree">{entry.degree}</h3>
                <p className="education-item__school">
                  {entry.school}
                  {entry.years && (
                    <span className="education-item__years"> · {entry.years}</span>
                  )}
                </p>
                {entry.score && <p className="education-item__score">{entry.score}</p>}
              </li>
            ))}
          </ul>
        </section>

      </div>

      <AgentDock />
    </>
  );
}
