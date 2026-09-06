// Homepage: compact hero, then the agent console as the full-width
// centerpiece, then a project gallery for people who'd rather skim than chat.

import { useSearchParams } from "react-router-dom";
import { profile, projects } from "../data/site-content";
import AgentConsole from "../components/agent-console/AgentConsole";
import ProjectCard from "../components/projects/ProjectCard";
import { StatusDot } from "../components/ui";
import AgentNetwork from "../components/hero/AgentNetwork";

export default function HomePage() {
  const [params] = useSearchParams();
  // A project card on another route links here with ?ask=… so the question
  // survives the navigation and fires once the console mounts.
  const initialMessage = params.get("ask") ?? undefined;

  return (
    <>
      <section className="home-hero" id="top">
        <div className="container home-hero__inner">
          <div className="home-hero__status">
            <StatusDot status="active" />
            <span className="home-hero__status-label">LIVE ORCHESTRATION</span>
          </div>
          <h1 className="home-hero__name">{profile.name}</h1>
          <p className="home-hero__roles">{profile.roles.join(" · ")}</p>
          <p className="home-hero__focus">{profile.tagline}</p>
        </div>
        <div className="home-hero__network" aria-hidden="true">
          <AgentNetwork />
        </div>
      </section>

      {/* The console is the page's centerpiece, not a corner widget. */}
      <section className="home-agent" id="agent">
        <div className="container">
          <AgentConsole variant="full" initialMessage={initialMessage} />
        </div>
      </section>

      <section className="home-projects" id="projects">
        <div className="container">
          <div className="home-projects__head">
            <h2 className="section-title">Projects</h2>
            <p className="home-projects__sub">
              {projects.length} documented builds. Skim the cards, read a
              write-up, or ask the agent to walk you through one.
            </p>
          </div>

          <div className="project-grid">
            {projects.map((project) => (
              <ProjectCard key={project.slug} project={project} />
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
