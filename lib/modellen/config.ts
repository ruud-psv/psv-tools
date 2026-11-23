/**
 * Model garden: welke Claude-modellen PSV Tools waar gebruikt.
 *
 * Elke plek waar de app Claude aanroept staat hieronder, met het model dat er
 * standaard draait. In Beheer > Model garden kan een admin per plek een ander
 * model kiezen; die keuze staat in Vercel Blob (`./store.ts`). Zonder keuze
 * draait het standaardmodel, dus een storing in de opslag verandert niets.
 *
 * De beeldmodellen van Groepsfoto en Kleurplaat lopen via Replicate en worden
 * daar beheerd; die staan hier niet.
 *
 * Dit bestand heeft geen afhankelijkheden, zodat de beheerpagina het ook kan
 * importeren.
 */

export type Inspanning = "low" | "medium" | "high";

export interface ModelPlek {
  id: string;
  naam: string;
  groep: string;
  beschrijving: string;
  /** De pagina waar je de plek ziet, voor een link in het beheer. */
  href?: string;
  standaard: string;
  /** Het `effort`-niveau dat de plek meestuurt, als het model dat kent. */
  inspanning?: Inspanning;
  /** De plek vraagt JSON terug volgens een schema (structured outputs). */
  json?: boolean;
  /** De plek geeft het model tools. */
  tools?: boolean;
}

export const MODEL_PLEKKEN: ModelPlek[] = [
  {
    id: "assistent",
    naam: "Assistent",
    groep: "Assistent",
    beschrijving: "Het gesprek met de assistent, inclusief de interne tools en de MCP-servers.",
    href: "/dashboard/assistent",
    standaard: "claude-opus-5-5",
    inspanning: "medium",
    tools: true,
  },
  {
    id: "assistent-titel",
    naam: "Gesprekstitels",
    groep: "Assistent",
    beschrijving: "Een korte titel voor elk nieuw gesprek in de assistent.",
    href: "/dashboard/assistent",
    standaard: "claude-haiku-5-5",
  },
  {
    id: "kennisbank",
    naam: "Kennisbank",
    groep: "Vragen stellen",
    beschrijving: "Antwoorden op vragen over de kennisbank.",
    href: "/dashboard/kennisbank",
    standaard: "claude-haiku-5-5",
    inspanning: "low",
  },
  {
    id: "paid-ads",
    naam: "Paid Ads",
    groep: "Vragen stellen",
    beschrijving: "Vragen over de advertentiedata in het dashboard.",
    href: "/dashboard/paid-ads",
    standaard: "claude-opus-5-5",
    inspanning: "medium",
  },
  {
    id: "ticketing-stadion",
    naam: "Ticketing stadion",
    groep: "Vragen stellen",
    beschrijving: "Vragen over de verkoop- en stadiondata op de pagina.",
    href: "/dashboard/ticketing-stadion",
    standaard: "claude-opus-5-5",
    inspanning: "low",
  },
  {
    id: "dm-vraag",
    naam: "DM Performance",
    groep: "Vragen stellen",
    beschrijving: "Vragen over de mailings in DM Performance.",
    href: "/dashboard/dm-performance",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "playable-vraag",
    naam: "Landingspagina's",
    groep: "Vragen stellen",
    beschrijving: "Vragen over de Playable-campagnes.",
    href: "/dashboard/landingspaginas",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "playable-loader",
    naam: "Playable loader",
    groep: "Bouwen",
    beschrijving: "Past de HTML, CSS en JavaScript van een landingspagina aan op verzoek.",
    href: "/dashboard/playable-loader",
    standaard: "claude-opus-5-5",
    inspanning: "medium",
    json: true,
  },
  {
    id: "inzichten-dm",
    naam: "DM-analyse",
    groep: "AI-analyses",
    beschrijving: "De automatische analyse van mailings (ook in gedeelde rapporten).",
    href: "/dashboard/dm-performance",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-playable",
    naam: "Playable-analyse",
    groep: "AI-analyses",
    beschrijving: "De automatische analyse van landingspagina-campagnes.",
    href: "/dashboard/landingspaginas",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-analytics",
    naam: "Webverkeer-analyse",
    groep: "AI-analyses",
    beschrijving: "De automatische analyse van Google Analytics.",
    href: "/dashboard/web-verkeer",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-ticket",
    naam: "Ticket-analyse",
    groep: "AI-analyses",
    beschrijving: "De analyse van ticketverkoop in gedeelde rapporten.",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-fanstore",
    naam: "Fanstore-analyse",
    groep: "AI-analyses",
    beschrijving: "De analyse van de Fanstore in gedeelde rapporten.",
    href: "/dashboard/fanstore",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-rapport",
    naam: "Rapportage-analyse",
    groep: "AI-analyses",
    beschrijving: "De gecombineerde analyse in de rapportage-generator en gedeelde rapporten.",
    href: "/dashboard/rapportage-generator",
    standaard: "claude-haiku-4-5-20251001",
  },
  {
    id: "inzichten-fandesk",
    naam: "Fandesk-samenvatting",
    groep: "AI-analyses",
    beschrijving: "De dag- en periodesamenvattingen van Fandesk-tickets.",
    href: "/dashboard/fandesk",
    standaard: "claude-haiku-4-5-20251001",
  },
];

export type PlekId =
  | "assistent"
  | "assistent-titel"
  | "kennisbank"
  | "paid-ads"
  | "ticketing-stadion"
  | "dm-vraag"
  | "playable-vraag"
  | "playable-loader"
  | "inzichten-dm"
  | "inzichten-playable"
  | "inzichten-analytics"
  | "inzichten-ticket"
  | "inzichten-fanstore"
  | "inzichten-rapport"
  | "inzichten-fandesk";

export function plek(id: PlekId): ModelPlek {
  const gevonden = MODEL_PLEKKEN.find((p) => p.id === id);
  if (!gevonden) throw new Error(`Onbekende modelplek: ${id}`);
  return gevonden;
}

/** Wat een plek per model moet weten om een geldig verzoek te bouwen. */
export interface ModelKenmerken {
  /** Het model kent `output_config.effort`. */
  effort: boolean;
  /** Het model kent `fallbacks: "default"` (server-side fallback bij een weigering). */
  fallbacks: boolean;
}

/**
 * Modellen waarvoor de API `fallbacks: "default"` aanneemt. Bij andere modellen
 * sturen we hem niet mee, anders weigert de API het verzoek.
 */
const FALLBACK_MODELLEN = new Set([
  "claude-fable-5-2",
  "claude-fable-5-1",
  "claude-opus-5-5",
  "claude-opus-5",
  "claude-sonnet-5-5",
]);

/** Oudere modellen zonder `effort`; de Models API weet het zeker, dit is de terugval. */
const ZONDER_EFFORT = [
  /^claude-3/,
  /^claude-[a-z]+-4(-\d{8})?$/, // Opus 4, Sonnet 4
  /^claude-[a-z]+-4-[0-4](-|$)/, // Opus 4.1
  /^claude-(haiku|sonnet)-4-5(-|$)/,
];

export function standaardKenmerken(model: string): ModelKenmerken {
  return { effort: !ZONDER_EFFORT.some((r) => r.test(model)), fallbacks: FALLBACK_MODELLEN.has(model) };
}

/** Indicatieve prijzen in dollar per miljoen tokens (invoer / uitvoer), voor in het beheer. */
export const MODEL_PRIJZEN: Record<string, { invoer: number; uitvoer: number }> = {
  "claude-fable-5-2": { invoer: 8, uitvoer: 40 },
  "claude-mythos-5-2": { invoer: 8, uitvoer: 40 },
  "claude-fable-5-1": { invoer: 10, uitvoer: 50 },
  "claude-mythos-5-1": { invoer: 10, uitvoer: 50 },
  "claude-fable-5": { invoer: 10, uitvoer: 50 },
  "claude-opus-5-5": { invoer: 4, uitvoer: 20 },
  "claude-opus-5": { invoer: 5, uitvoer: 25 },
  "claude-opus-4-8": { invoer: 5, uitvoer: 25 },
  "claude-opus-4-7": { invoer: 5, uitvoer: 25 },
  "claude-opus-4-6": { invoer: 5, uitvoer: 25 },
  "claude-sonnet-5-5": { invoer: 2, uitvoer: 10 },
  "claude-sonnet-5": { invoer: 2, uitvoer: 10 },
  "claude-sonnet-4-6": { invoer: 3, uitvoer: 15 },
  "claude-haiku-5-5": { invoer: 0.1, uitvoer: 0.5 },
  "claude-haiku-4-5": { invoer: 1, uitvoer: 5 },
  "claude-haiku-4-5-20251001": { invoer: 1, uitvoer: 5 },
};

/** Een leesbare naam als de Models API er geen geeft: `claude-opus-5-5` → `Claude Opus 5.5`. */
export function modelNaam(id: string): string {
  const m = id.match(/^claude-([a-z]+)-(\d+)(?:-(\d{1,2}))?(?:-\d{8})?$/);
  if (!m) return id;
  const familie = m[1].charAt(0).toUpperCase() + m[1].slice(1);
  return `Claude ${familie} ${m[2]}${m[3] ? `.${m[3]}` : ""}`;
}

/** Een model dat de API-sleutel kan aanroepen, zoals het beheer het toont. */
export interface BeschikbaarModel {
  id: string;
  naam: string;
  context: number | null;
  maxUitvoer: number | null;
  prijs: { invoer: number; uitvoer: number } | null;
  kenmerken: ModelKenmerken;
}

/** Een keuze zoals hij in de opslag staat. */
export interface ModelKeuze {
  model: string;
  kenmerken: ModelKenmerken;
  gewijzigdOp: string;
  gewijzigdDoor: string;
}

/** Het model dat op een plek draait, met wat het verzoek daarvoor nodig heeft. */
export interface ActiefModel {
  model: string;
  kenmerken: ModelKenmerken;
  /** Door een admin gekozen (true) of het standaardmodel (false). */
  gekozen: boolean;
}

export function actiefModel(p: ModelPlek, keuze?: ModelKeuze | null): ActiefModel {
  if (keuze?.model) return { model: keuze.model, kenmerken: keuze.kenmerken, gekozen: true };
  return { model: p.standaard, kenmerken: standaardKenmerken(p.standaard), gekozen: false };
}

/** `output_config.effort` als de plek er een heeft en het model hem kent; anders niets. */
export function effortVoor(actief: ActiefModel, p: ModelPlek): { effort?: Inspanning } {
  return p.inspanning && actief.kenmerken.effort ? { effort: p.inspanning } : {};
}

/** `output_config` met alleen de effort, of niets als er geen effort meegaat. */
export function outputConfigVoor(actief: ActiefModel, p: ModelPlek): { output_config?: { effort: Inspanning } } {
  const { effort } = effortVoor(actief, p);
  return effort ? { output_config: { effort } } : {};
}

/**
 * De server-side fallback bij een onterechte weigering, alleen voor modellen die
 * hem kennen. `fallbacks` staat nog niet in de types van deze SDK-versie.
 */
export function fallbackVoor(actief: ActiefModel): { betas?: string[]; fallbacks?: "default" } {
  return actief.kenmerken.fallbacks ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" } : {};
}

/** Kenmerken uit de `capabilities` van de Models API; zonder bruikbare data de terugval. */
export function kenmerkenUitCapabilities(model: string, capabilities: unknown): ModelKenmerken {
  const terugval = standaardKenmerken(model);
  const effort = (capabilities as { effort?: { supported?: unknown } } | null | undefined)?.effort?.supported;
  return { effort: typeof effort === "boolean" ? effort : terugval.effort, fallbacks: terugval.fallbacks };
}
