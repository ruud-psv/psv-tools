/**
 * Playable voor de MCP-server van PSV Tools (`lib/mcp/servers/playable.ts`).
 * Puur: campagnes zoeken en cijfers als tekst voor een model. Dezelfde
 * koppeling als Landingspagina's (`app/api/playable/*`), die ongewijzigd blijft.
 */

export const PLAYABLE_HOST = "https://api.playable.com";
/**
 * De rechten die het token vraagt. Ook als de app in Playable meer mag
 * (`docs/playable-api.md`), kan een token met alleen deze rechten niets
 * aanmaken, wijzigen of verwijderen.
 */
export const LEES_SCOPES = ["campaigns.list", "campaigns.view"];

export const MAX_RIJEN = 250;
export const MAX_CAMPAGNES_PER_VRAAG = 10;

/** Ontbrekende instelling aan de kant van PSV Tools. */
export class PlayableConfigError extends Error {}
/** Playable gaf een fout terug. */
export class PlayableFout extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function playableConfig(env: Record<string, string | undefined> = process.env): { clientId: string; clientSecret: string } {
  const clientId = env.PLAYABLE_CLIENT_ID?.trim();
  const clientSecret = env.PLAYABLE_SECRET?.trim();
  const missing = [!clientId && "PLAYABLE_CLIENT_ID", !clientSecret && "PLAYABLE_SECRET"].filter(Boolean);
  if (missing.length) throw new PlayableConfigError(`Playable-configuratie ontbreekt: ${missing.join(", ")}.`);
  return { clientId: clientId!, clientSecret: clientSecret! };
}

/* ---------- Campagnes ---------- */

export interface PlayableCampagne {
  id: number;
  name: string;
  type: string;
  active: boolean;
  active_from: string | null;
  active_to: string | null;
  live_url: string | null;
  created_on: string;
}

export function normaliseerCampagne(raw: Record<string, unknown>): PlayableCampagne {
  const tekst = (v: unknown) => (v === undefined || v === null || v === "" ? null : String(v));
  return {
    id: Number(raw.id),
    name: String(raw.name ?? ""),
    type: String(raw.type ?? ""),
    active: Boolean(raw.active),
    active_from: tekst(raw.active_from),
    active_to: tekst(raw.active_to),
    live_url: tekst(raw.live_url),
    created_on: String(raw.created_on ?? ""),
  };
}

/** Kleine letters, zonder accenten, spaties en leestekens: "Coen Dillen" vindt ook /coendillen. */
function plat(tekst: string): string {
  return tekst
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export interface CampagnesInvoer {
  zoek?: string;
  alleen_actief?: boolean;
  limiet?: number;
}

/** Zoeken in naam (met DMID) en URL; actieve eerst, dan de nieuwste. */
export function zoekCampagnes(campagnes: PlayableCampagne[], invoer: CampagnesInvoer): PlayableCampagne[] {
  const term = invoer.zoek?.trim() ?? "";
  const platteTerm = plat(term);
  return campagnes
    .filter((c) => !invoer.alleen_actief || c.active)
    .filter((c) => {
      if (!term) return true;
      if (c.name.toLowerCase().includes(term.toLowerCase())) return true;
      return platteTerm.length > 0 && (plat(c.name).includes(platteTerm) || plat(c.live_url ?? "").includes(platteTerm));
    })
    .sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : b.created_on.localeCompare(a.created_on)));
}

function limiet(waarde: number | undefined, standaard: number): number {
  if (!waarde || !Number.isFinite(waarde)) return standaard;
  return Math.min(Math.max(1, Math.floor(waarde)), MAX_RIJEN);
}

export function campagnesTekst(
  gevonden: PlayableCampagne[],
  totaal: number,
  invoer: CampagnesInvoer,
  volgensPlayable?: number
): string {
  const max = limiet(invoer.limiet, 50);
  const getoond = gevonden.slice(0, max);
  const filter = [invoer.alleen_actief && "alleen actief", invoer.zoek && `met "${invoer.zoek}"`].filter(Boolean).join(", ");
  const regels = [
    `PLAYABLE · campagnes${filter ? ` (${filter})` : ""} · ${gevonden.length} gevonden van ${totaal}`,
  ];
  if (volgensPlayable && volgensPlayable > totaal) {
    regels.push(`Let op: Playable noemt ${volgensPlayable} campagnes, maar er zijn er ${totaal} opgehaald. De zoekuitkomst is onvolledig.`);
  }
  if (getoond.length === 0) {
    regels.push("Geen campagnes gevonden. Probeer een ander woord, een deel van het DMID-nummer of het laatste stuk van de URL.");
    return regels.join("\n");
  }
  regels.push(
    "",
    "id | naam | type | actief | van | tot | url | aangemaakt",
    ...getoond.map((c) =>
      [c.id, c.name, c.type, c.active ? "ja" : "nee", c.active_from ?? "", c.active_to ?? "", c.live_url ?? "", c.created_on].join(" | ")
    )
  );
  if (gevonden.length > getoond.length) regels.push("", `Er zijn er meer (${gevonden.length}); zoek specifieker of vraag een hogere limiet.`);
  return regels.join("\n");
}

/* ---------- Statistieken ---------- */

export interface PlayableStatistieken {
  sessions: number;
  registrations: number;
  unique_registration: number;
  /** Procent, zoals Playable hem berekent. */
  conversion: number;
  devices: { desktop: number; tablet: number; mobile: number };
  /** Seconden. */
  time_spent_average: number;
  shares: number;
  sessions_from_shares: number;
  tip_a_friend: number;
}

export function normaliseerStatistieken(body: unknown): PlayableStatistieken {
  const raw = ((body as { data?: unknown })?.data ?? body ?? {}) as Record<string, unknown>;
  const deel = (key: string) => (raw[key] && typeof raw[key] === "object" ? (raw[key] as Record<string, unknown>) : {});
  const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  return {
    sessions: n(raw.sessions),
    registrations: n(raw.registrations),
    unique_registration: n(raw.unique_registration),
    conversion: n(raw.conversion),
    devices: { desktop: n(deel("devices").desktop), tablet: n(deel("devices").tablet), mobile: n(deel("devices").mobile) },
    time_spent_average: n(deel("engagement").time_spent_average),
    shares: n(deel("facebook").shares),
    sessions_from_shares: n(deel("facebook").sessions_from_shares),
    tip_a_friend: n(raw.tip_a_friend),
  };
}

export interface StatistiekenRij {
  id: number;
  campagne?: PlayableCampagne;
  stats?: PlayableStatistieken;
  fout?: string;
}

export function statistiekenTekst(rijen: StatistiekenRij[]): string {
  const regels = [
    "PLAYABLE · statistieken per campagne, totaal over de hele looptijd",
    "",
    "id | naam | actief | sessies | aanmeldingen | unieke aanmeldingen | conversie (%) | desktop | tablet | mobiel | gem. tijd (s) | shares | sessies via shares",
  ];
  for (const { id, campagne, stats, fout } of rijen) {
    const naam = campagne?.name ?? "onbekend";
    if (!stats) {
      regels.push(`${id} | ${naam} | fout: ${fout ?? "geen cijfers"}`);
      continue;
    }
    regels.push(
      [
        id,
        naam,
        campagne ? (campagne.active ? "ja" : "nee") : "",
        stats.sessions,
        stats.registrations,
        stats.unique_registration,
        Number(stats.conversion.toFixed(1)),
        stats.devices.desktop,
        stats.devices.tablet,
        stats.devices.mobile,
        Math.round(stats.time_spent_average),
        stats.shares,
        stats.sessions_from_shares,
      ].join(" | ")
    );
  }
  return regels.join("\n");
}

/* ---------- Aanmeldingen per dag ---------- */

const MAX_DAGEN = 400;

/**
 * De aanmeldingen per dag zoals Playable ze geeft. De vorm van dit antwoord
 * is niet vastgelegd in de code (zie `docs/playable-api.md`), dus een lijst
 * van objecten wordt een tabel en al het andere compacte JSON.
 */
export function perDagTekst(id: number, campagne: PlayableCampagne | undefined, body: unknown): string {
  const kop = `PLAYABLE · aanmeldingen per dag · ${campagne?.name ?? "campagne"} (${id})`;
  const data = (body as { data?: unknown })?.data ?? body;
  const rijen = Array.isArray(data) ? data : null;
  if (rijen && rijen.length === 0) return `${kop}\nGeen aanmeldingen per dag gevonden.`;
  if (rijen && rijen.every((r) => r && typeof r === "object" && !Array.isArray(r))) {
    const kolommen = [...new Set(rijen.flatMap((r) => Object.keys(r as object)))].slice(0, 12);
    const regels = [kop, "", kolommen.join(" | ")];
    for (const rij of rijen.slice(0, MAX_DAGEN)) {
      regels.push(
        kolommen
          .map((k) => {
            const v = (rij as Record<string, unknown>)[k];
            return v && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
          })
          .join(" | ")
      );
    }
    if (rijen.length > MAX_DAGEN) regels.push("", `En nog ${rijen.length - MAX_DAGEN} rijen.`);
    return regels.join("\n");
  }
  const json = JSON.stringify(data ?? null);
  return `${kop}\n${json.length > 20_000 ? `${json.slice(0, 20_000)}… (afgekapt)` : json}`;
}
