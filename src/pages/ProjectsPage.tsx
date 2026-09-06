// Projects index: the same gallery as the homepage, on its own route.

import { projects } from "../data/site-content";
import ProjectCard from "../components/projects/ProjectCard";
import AgentDock from "../components/agent-console/AgentDock";

export default function ProjectsPage() {
  return (
    <>
      <div className="container projects-page">
        <header className="projects-page__head">
          <h1 className="section-title">Projects</h1>
          <p className="projects-page__sub">
            {projects.length} documented builds. Every write-up is rendered from
            the same markdown the agent answers from.
          </p>
        </header>

        <div className="project-grid">
          {projects.map((project) => (
            <ProjectCard key={project.slug} project={project} />
          ))}
        </div>
      </div>

      <AgentDock />
    </>
  );
}
