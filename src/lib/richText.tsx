import type { ReactNode } from "react";

const TOKEN_PATTERN = /(`[^`]+`|\[[^\]]+\]\([^)]+\))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;

/**
 * Lightweight rich-text renderer for chat/tooltip copy: backtick spans
 * become <code>, and "[label](url)" markdown links become real, clickable
 * <a> tags (opened in a new tab). Everything else is rendered as plain
 * text. Shared by any UI that needs to render model output or data-layer
 * copy without pulling in a full markdown parser.
 */
export function renderRichText(
  text: string,
  codeClassName = "inline-code",
  linkClassName = "inline-link"
): ReactNode[] {
  const parts = text.split(TOKEN_PATTERN).filter(Boolean);
  return parts.map((part, i) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 1) {
      return (
        <code key={i} className={codeClassName}>
          {part.slice(1, -1)}
        </code>
      );
    }

    const linkMatch = part.match(LINK_PATTERN);
    if (linkMatch) {
      const [, label, url] = linkMatch;
      return (
        <a key={i} href={url} target="_blank" rel="noopener noreferrer" className={linkClassName}>
          {label}
        </a>
      );
    }

    return <span key={i}>{part}</span>;
  });
}
