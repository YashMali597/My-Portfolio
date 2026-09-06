// Project detail page.
//
// The narrative is rendered straight from the project's markdown body in
// /knowledge via react-markdown — nothing here re-types the prose in JSX, so
// this page cannot drift from the knowledge base. Editing the markdown and
// re-running `npm run knowledge:build` is the only way to change what it says.

import { Link, useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowLeft, ExternalLink } from "lucide-react";
import { projects } from "../data/site-content";
import PipelineDiagram from "../components/architecture/PipelineDiagram";
import AgentDock from "../components/agent-console/AgentDock";

export default function ProjectPage() {
  const { slug } = useParams<{ slug: string }>();
  const project = projects.find((p) => p.slug === slug);

  if (!project) {
    return (
      <div className="container project-page">
        <h1 className="project-page__title">Project not found</h1>
        <p className="project-page__oneliner">
          No project with the slug <code>{slug}</code> is documented.
        </p>
        <Link to="/projects" className="project-page__back">
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </Link>
      </div>
    );
  }

  const links = Object.entries(project.links).filter(([, url]) => url.trim() !== "");

  return (
    <>
      <article className="container project-page">
        <Link to="/projects" className="project-page__back">
          <ArrowLeft size={14} aria-hidden="true" /> All projects
        </Link>

        <header className="project-page__head">
          <h1 className="project-page__title">{project.title}</h1>
          <p className="project-page__oneliner">{project.desc}</p>

          {/* Same chip row as the card — one visual language for skills. */}
          {project.skills.length > 0 && (
            <ul className="skill-chips" aria-label="Skills used">
              {project.skills.map((skill) => (
                <li key={skill} className="skill-chip">
                  {skill}
                </li>
              ))}
            </ul>
          )}

          <dl className="project-page__meta">
            {project.stack.length > 0 && (
              <div>
                <dt>Stack</dt>
                <dd>{project.stack.join(" · ")}</dd>
              </div>
            )}
            {/* Timeframe is undocumented for every project today; the row is
                omitted rather than rendered blank. */}
            {project.timeframe && (
              <div>
                <dt>Timeframe</dt>
                <dd>{project.timeframe}</dd>
              </div>
            )}
            {links.length > 0 && (
              <div>
                <dt>Links</dt>
                <dd className="project-page__links">
                  {links.map(([label, url]) => (
                    <a key={label} href={url} target="_blank" rel="noopener noreferrer">
                      {label} <ExternalLink size={12} aria-hidden="true" />
                    </a>
                  ))}
                </dd>
              </div>
            )}
          </dl>
        </header>

        {project.pipelineStages && (
          <PipelineDiagram
            stages={project.pipelineStages}
            legendItems={project.pipelineLegend}
          />
        )}

        <div className="project-page__body markdown-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {project.bodyMarkdown}
          </ReactMarkdown>
        </div>

        <footer className="project-page__source">
          Rendered from <code>{project.sourceFile}</code>
        </footer>
      </article>

      {/* Follow-up questions without leaving the page. */}
      <AgentDock />
    </>
  );
}
