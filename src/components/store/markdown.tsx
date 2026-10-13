import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown subset for admin-edited pages: ## / ### headings,
 * paragraphs, - / 1. lists, **bold** and [links](/path). No raw HTML is ever rendered.
 */
function inline(text: string, keyPrefix: string): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*([^*]+)\*\*)|(\[([^\]]+)\]\(([^)\s]+)\))/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    if (m[2]) out.push(<strong key={`${keyPrefix}-b${i++}`}>{m[2]}</strong>);
    else if (m[4] && m[5]) {
      const href = m[5];
      const safe = href.startsWith("/") || href.startsWith("https://") || href.startsWith("mailto:");
      if (!safe) out.push(m[4]);
      else if (href.startsWith("/")) out.push(<Link key={`${keyPrefix}-l${i++}`} href={href}>{m[4]}</Link>);
      else out.push(<a key={`${keyPrefix}-l${i++}`} href={href} target="_blank" rel="noopener noreferrer">{m[4]}</a>);
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function Markdown({ source }: { source: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/);
  return (
    <div className="prose-mivora">
      {blocks.map((block, bi) => {
        const trimmed = block.trim();
        if (!trimmed) return null;
        if (trimmed.startsWith("### ")) return <h3 key={bi}>{inline(trimmed.slice(4), `h${bi}`)}</h3>;
        if (trimmed.startsWith("## ")) return <h2 key={bi}>{inline(trimmed.slice(3), `h${bi}`)}</h2>;
        const lines = trimmed.split("\n");
        if (lines.every((l) => /^\s*[-*]\s+/.test(l))) {
          return <ul key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*[-*]\s+/, ""), `u${bi}-${li}`)}</li>)}</ul>;
        }
        if (lines.every((l) => /^\s*\d+\.\s+/.test(l))) {
          return <ol key={bi}>{lines.map((l, li) => <li key={li}>{inline(l.replace(/^\s*\d+\.\s+/, ""), `o${bi}-${li}`)}</li>)}</ol>;
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <span key={li}>
                {li > 0 ? <br /> : null}
                {inline(l, `p${bi}-${li}`)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
