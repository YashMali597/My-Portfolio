import type { ReactNode } from "react";

// Alternatives are tried left-to-right at each scan position, so `**bold**`
// always wins over `*italic*` at a run of two asterisks. The italic arm can
// swallow a whole `**bold**` span as a single unit, which is what lets
// "*who converts **because** of the treatment*" parse as italic-with-bold
// instead of leaving stray asterisks in the copy. Every inner group is
// non-capturing: String.split emits capture groups, and only the outer one
// should reach the output.
const TOKEN_PATTERN =
  /(`[^`]+`|\[[^\]]+\]\([^)]+\)|\\?\*\\?\*[^*]+\\?\*\\?\*|\*(?!\*)(?!\s)(?:[^*\n]|\*\*[^*\n]+\*\*)+?(?<!\s)\*(?!\*))/g;
const LINK_PATTERN = /^\[([^\]]+)\]\(([^)]+)\)$/;
const BOLD_PATTERN = /^\\?\*\\?\*([^*]+)\\?\*\\?\*$/;
const ITALIC_PATTERN = /^\*((?:[^*\n]|\*\*[^*\n]+\*\*)+)\*$/;

/**
 * Lightweight rich-text renderer for chat/tooltip copy: backtick spans
 * become <code>, **bold** spans become <strong>, *italic* spans become <em>
 * (and may contain bold), and "[label](url)" markdown links become real,
 * clickable <a> tags (opened in a new tab). Everything else is rendered as
 * plain text. Shared by any UI that needs to render model output or
 * data-layer copy without pulling in a full markdown parser.
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

    const boldMatch = part.match(BOLD_PATTERN);
    if (boldMatch) {
      return <strong key={i}>{boldMatch[1]}</strong>;
    }

    // Italic content can itself hold bold, so recurse rather than emit raw text.
    const italicMatch = part.match(ITALIC_PATTERN);
    if (italicMatch) {
      return <em key={i}>{renderRichText(italicMatch[1], codeClassName, linkClassName)}</em>;
    }

    return <span key={i}>{part}</span>;
  });
}
