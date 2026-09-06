// A project in the gallery grid.
//
// Skills render as small mono tags — no gauges, no percentages, no self-rated
// numbers. A skill's weight is the project it's attached to, which is exactly
// what this card shows.

import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles } from "lucide-react";
import type { Project } from "../../data/site-content";
import { askAgent, scrollToAgent } from "../../../lib/agent/agentBus";
import usePrefersReducedMotion from "../../hooks/usePrefersReducedMotion";

export interface ProjectCardProps {
  project: Project;
}

export default function ProjectCard({ project }: ProjectCardProps) {
  const prefersReducedMotion = usePrefersReducedMotion();

  const explore = () => {
    const message = `Tell me about ${project.title}`;
    // If a console is mounted on this page, drive it in place. Otherwise fall
    // back to the homepage, which carries the question in the URL so the
    // console can fire it on mount.
    if (askAgent(message)) {
      scrollToAgent();
    } else {
      window.location.href = `/?ask=${encodeURIComponent(message)}`;
    }
  };

  return (
    <motion.article
      className="project-card-v2"
      whileHover={prefersReducedMotion ? undefined : { y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <div className="project-card-v2__body">
        <h3 className="project-card-v2__title">
          <Link to={`/projects/${project.slug}`}>{project.title}</Link>
        </h3>
        <p className="project-card-v2__oneliner">{project.desc}</p>

        {project.skills.length > 0 && (
          <ul className="skill-chips" aria-label="Skills used">
            {project.skills.map((skill) => (
              <li key={skill} className="skill-chip">
                {skill}
              </li>
            ))}
          </ul>
        )}

        {project.stack.length > 0 && (
          <ul className="stack-badges" aria-label="Tech stack">
            {project.stack.map((item) => (
              <li key={item} className="stack-badge">
                {item}
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="project-card-v2__actions">
        <button type="button" className="project-card-v2__explore" onClick={explore}>
          <Sparkles size={14} aria-hidden="true" />
          Explore with Agent
          <ArrowRight size={14} aria-hidden="true" />
        </button>
        <Link to={`/projects/${project.slug}`} className="project-card-v2__read">
          Read the write-up
        </Link>
      </footer>
    </motion.article>
  );
}
