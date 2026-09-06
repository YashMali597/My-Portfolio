// Achievements — awards, recognition, publications, talks, certifications.
//
// Renders from knowledge/achievements.md via the generated content layer.
// That file is currently unfilled placeholder scaffolding, which the content
// build excludes, so this page shows an empty state rather than fabricated
// entries. It populates automatically once real achievements are written.

import { ExternalLink, Award } from "lucide-react";
import { achievements } from "../data/site-content";
import AgentDock from "../components/agent-console/AgentDock";
import { askAgent } from "../../lib/agent/agentBus";

export default function AchievementsPage() {
  const ask = (message: string) => {
    if (!askAgent(message)) {
      window.location.href = `/?ask=${encodeURIComponent(message)}`;
    }
  };

  return (
    <>
      <div className="container achievements-page">
        <header className="achievements-page__head">
          <h1 className="section-title">Achievements</h1>
          <p className="achievements-page__sub">
            Recognition, publications, talks, and certifications.
          </p>
        </header>

        {achievements.length === 0 ? (
          // Deliberately honest: no invented entries, no fake LinkedIn links.
          // The agent behaves the same way — it says achievements are not
          // documented rather than substituting project outcomes.
          <div className="achievements-empty">
            <Award size={22} aria-hidden="true" />
            <p className="achievements-empty__title">Nothing documented yet.</p>
            <p className="achievements-empty__body">
              Achievements are published from{" "}
              <code>knowledge/achievements.md</code>. That file still holds
              template scaffolding, so nothing is shown here rather than
              anything invented.
            </p>
            <button
              type="button"
              className="achievements-empty__ask"
              onClick={() => ask("What has he actually built and shipped?")}
            >
              Ask the agent what he has shipped instead →
            </button>
          </div>
        ) : (
          <div className="achievements-grid-v2">
            {achievements.map((a) => (
              <article key={a.id} className="achievement-card-v2">
                <h2 className="achievement-card-v2__title">{a.title}</h2>
                <p className="achievement-card-v2__meta">
                  {[a.date, ...(a.tags ?? [])].filter(Boolean).join(" · ")}
                </p>
                {a.description && (
                  <p className="achievement-card-v2__desc">{a.description}</p>
                )}
                {/* Only link when there is a real URL — the migration left
                    these blank rather than shipping a placeholder post id. */}
                {/^https?:\/\//.test(a.linkedinUrl) && (
                  <a
                    className="achievement-card-v2__link"
                    href={a.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    View on LinkedIn <ExternalLink size={12} aria-hidden="true" />
                  </a>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <AgentDock />
    </>
  );
}
