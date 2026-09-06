// Global navigation.
//
// No Skills entry — skills appear only attached to a project or through the
// agent. No System entry either: /system (architecture, ADRs, tool registry,
// eval results) is intentionally not exposed to visitors.

import { NavLink, Link } from "react-router-dom";
import { profile } from "../data/site-content";
import { StatusDot } from "./ui";

const NAV_LINKS = [
  { label: "~/home", to: "/" },
  { label: "~/projects", to: "/projects" },
  { label: "~/experience", to: "/experience" },
  { label: "~/achievements", to: "/achievements" },
];

export default function SiteNav() {
  return (
    <nav className="cli-navbar">
      <div className="cli-navbar__inner">
        <Link to="/" className="cli-navbar__brand">
          <span className="cli-navbar__prompt">$</span> {profile.name}
        </Link>

        <div className="cli-navbar__links">
          {NAV_LINKS.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.to === "/"}
              className={({ isActive }) =>
                `cli-navbar__link${isActive ? " cli-navbar__link--active" : ""}`
              }
            >
              {link.label}
            </NavLink>
          ))}
          {profile.resumeUrl && (
            <a
              href={profile.resumeUrl}
              download
              className="cli-navbar__link cli-navbar__link--resume"
            >
              ~/resume
            </a>
          )}
        </div>

        <div className="cli-navbar__status">
          <StatusDot status="active" />
          <span className="cli-navbar__status-label">SYSTEM ONLINE</span>
        </div>
      </div>
    </nav>
  );
}
