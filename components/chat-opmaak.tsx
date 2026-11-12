/**
 * De opmaak van een antwoord in de chats van PSV Tools (kennisbank en
 * assistent): alinea's, opsommingen, stappen, vet en links. Bewust geen
 * volledige markdown: de assistenten krijgen de opdracht alleen dit te
 * gebruiken.
 */

import type { ReactNode } from "react";

/** **vet**, [tekst](url) en losse links binnen een regel. */
function inline(text: string) {
  const parts = text.split(
    /(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\)|https?:\/\/[^\s)]*[^\s).,;:!?])/g
  );
  const linkClass = "text-psv-red-primary underline underline-offset-2 hover:opacity-80";
  return parts.map((part, i) => {
    if (!part) return null;
    if (part.length > 4 && part.startsWith("**") && part.endsWith("**"))
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    const md = part.match(/^\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)$/);
    if (md)
      return (
        <a key={i} href={md[2]} target="_blank" rel="noopener noreferrer" className={linkClass}>
          {md[1]}
        </a>
      );
    if (/^https?:\/\//.test(part))
      return (
        <a key={i} href={part} target="_blank" rel="noopener noreferrer" className={`${linkClass} break-all`}>
          {part}
        </a>
      );
    return <span key={i}>{part}</span>;
  });
}

/** Minimale formatter: alinea's, "- " opsommingen en "1. " stappen. */
export function formatAnswer(text: string) {
  const blocks: ReactNode[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flushList = (key: string) => {
    if (!list) return;
    const items = list.items.map((li, i) => <li key={i}>{inline(li)}</li>);
    blocks.push(
      list.type === "ul" ? (
        <ul key={key} className="list-disc space-y-1 pl-5">{items}</ul>
      ) : (
        <ol key={key} className="list-decimal space-y-1 pl-5">{items}</ol>
      )
    );
    list = null;
  };

  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.*)$/);
    const stap = trimmed.match(/^\d+[.)]\s+(.*)$/);
    const item = bullet ?? stap;
    if (item) {
      const type = bullet ? "ul" : "ol";
      if (list && list.type !== type) flushList(`l-${i}`);
      if (!list) list = { type, items: [] };
      list.items.push(item[1]);
    } else {
      flushList(`l-${i}`);
      if (trimmed) blocks.push(<p key={`p-${i}`}>{inline(trimmed)}</p>);
    }
  });
  flushList("l-end");
  return blocks;
}
