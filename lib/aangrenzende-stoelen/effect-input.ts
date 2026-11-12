/**
 * Invoer voor het effect van een mail: relatienummers en tijdstippen in
 * Nederlandse tijd. Los van `./effect.ts`, zodat de pagina dit ook kan
 * gebruiken zonder serverbibliotheken mee te laden.
 */

/**
 * Relatienummers uit geplakte tekst: alles wat geen cijfer is, scheidt. Nullen
 * vooraan vallen weg, net als bij de lijst seizoenkaarthouders. Dubbele tellen
 * één keer; de volgorde blijft.
 */
export function parseRelationNumbers(text: string): string[] {
  const seen = new Set<string>();
  for (const part of text.split(/[^0-9]+/)) {
    if (!part) continue;
    const number = part.replace(/^0+(?=\d)/, "");
    if (number !== "0") seen.add(number);
  }
  return [...seen];
}

const AMSTERDAM_PARTS = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function amsterdamParts(ms: number): Record<string, string> {
  const parts: Record<string, string> = {};
  for (const part of AMSTERDAM_PARTS.formatToParts(new Date(ms))) parts[part.type] = part.value;
  return parts;
}

/** Hoeveel milliseconden Nederland op moment `ms` voor ligt op UTC. */
function amsterdamOffset(ms: number): number {
  const p = amsterdamParts(ms);
  const local = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return local - Math.floor(ms / 1000) * 1000;
}

/**
 * Een tijdstip in Nederlandse tijd (`2026-11-03T20:00` of `2026-11-03 20:00`,
 * zoals een `datetime-local`-veld het geeft) als seconden sinds 1970. `null`
 * als het geen tijdstip is.
 */
export function parseAmsterdamDateTime(value: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number);
  const wall = Date.UTC(y, mo - 1, d, h, mi, s || 0);
  if (isNaN(wall)) return null;
  // Twee keer: de offset op het geschatte moment kan rond de klokwissel anders zijn.
  let instant = wall - amsterdamOffset(wall);
  instant = wall - amsterdamOffset(instant);
  return Math.round(instant / 1000);
}

/** Seconden sinds 1970 als `2026-11-03 20:00`, in Nederlandse tijd. */
export function formatAmsterdamDateTime(seconds: number): string {
  const p = amsterdamParts(seconds * 1000);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}
