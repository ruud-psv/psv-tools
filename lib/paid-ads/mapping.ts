/**
 * Vertaalt wat de advertentieplatformen leveren naar de indeling van het
 * dashboard: funnelfase, exploitatie, campagnegroep, doelgroeptype en format.
 *
 * Geen enkel platform kent deze velden — ze zitten alleen in de naamgeving.
 * De naamconventie waar dit bestand op mikt:
 *
 *   PSV | <Exploitatie> | <Fase> | <Campagne> | <Variant>
 *   PSV | Ticketing | Conversie | Seizoenkaarten 26-27 | Retargeting
 *
 * Staat een naam in dat formaat, dan worden de velden exact overgenomen.
 * Zo niet, dan valt elke functie terug op trefwoorden in de vrije naam. Dat is
 * een benadering: hoe consequenter de naamgeving, hoe scherper het dashboard.
 *
 * Alle vergelijkingen gebeuren op een genormaliseerde naam (kleine letters,
 * accenten en leestekens weg), zodat "Mijn PSV+" en "mijn-psv-plus" hetzelfde
 * resultaat geven.
 */

import type { AudienceType, PaidPhase } from "./types";

/** Scheidingsteken van de naamconventie. */
const PART_SEPARATOR = "|";

/** Kleine letters, zonder accenten en zonder leestekens. */
function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

/** Splitst een naam op het scheidingsteken; lege delen vallen weg. */
export function nameParts(name: string): string[] {
  return name
    .split(PART_SEPARATOR)
    .map((part) => part.trim())
    .filter(Boolean);
}

/** Of een genormaliseerde naam een van de trefwoorden bevat. */
function hasAny(haystack: string, needles: string[]): boolean {
  return needles.some((needle) => haystack.includes(needle));
}

/* ------------------------------------------------------------------ fase -- */

const PHASE_BY_KEYWORD: [PaidPhase, string[]][] = [
  ["conversie", ["conversie", "conversion", "sales", "aankoop", "aankopen", "lead", "leads", "registratie", "verkoop"]],
  ["verkeer", ["verkeer", "traffic", "clicks", "bezoek", "consideration"]],
  ["bereik", ["bereik", "reach", "awareness", "branding", "video views", "engagement"]],
];

/**
 * Doelstellingen zoals de platformen ze noemen, vertaald naar een funnelfase.
 * Zowel de huidige ODAX-namen van Meta als de oudere varianten staan erin, plus
 * de termen die TikTok, Google Ads en LinkedIn gebruiken.
 */
const PHASE_BY_OBJECTIVE: Record<string, PaidPhase> = {
  // Meta (ODAX)
  outcome_sales: "conversie",
  outcome_leads: "conversie",
  outcome_app_promotion: "conversie",
  outcome_traffic: "verkeer",
  outcome_engagement: "verkeer",
  outcome_awareness: "bereik",
  // Meta (legacy)
  conversions: "conversie",
  product_catalog_sales: "conversie",
  lead_generation: "conversie",
  link_clicks: "verkeer",
  post_engagement: "verkeer",
  page_likes: "verkeer",
  messages: "verkeer",
  brand_awareness: "bereik",
  reach: "bereik",
  video_views: "bereik",
  // TikTok / Google Ads / LinkedIn
  conversion: "conversie",
  lead_generation_tiktok: "conversie",
  traffic: "verkeer",
  engagement: "verkeer",
  website_visits: "verkeer",
  awareness: "bereik",
  video_view: "bereik",
  brand_awareness_linkedin: "bereik",
};

/**
 * Bepaalt de funnelfase. De naamconventie wint van de doelstelling: een
 * campagne die op "Conversie" staat maar met doelstelling Verkeer draait, hoort
 * in de rapportage bij conversie.
 */
export function resolvePhase(campaignName: string, objective: string): PaidPhase {
  const parts = nameParts(campaignName);
  if (parts.length >= 3) {
    const fromName = normalize(parts[2]);
    for (const [phase, keywords] of PHASE_BY_KEYWORD) {
      if (hasAny(fromName, keywords)) return phase;
    }
  }

  const fromObjective = PHASE_BY_OBJECTIVE[normalize(objective).replace(/ /g, "_")];
  if (fromObjective) return fromObjective;

  const fromFullName = normalize(campaignName);
  for (const [phase, keywords] of PHASE_BY_KEYWORD) {
    if (hasAny(fromFullName, keywords)) return phase;
  }

  // Zonder aanwijzing is verkeer de veiligste aanname: het is de fase waarvan
  // een verkeerde indeling de minste vertekening geeft in de funnel.
  return "verkeer";
}

/* ---------------------------------------------------------- exploitatie -- */

/**
 * De exploitaties waarop het dashboard uitsplitst, met hun trefwoorden.
 * Pas deze tabel aan zodra de indeling bij PSV verandert — dit is de enige
 * plek waar de exploitatienamen staan.
 */
const BUSINESS_UNITS: [string, string[]][] = [
  ["Ticketing", ["ticket", "ticketing", "kaart", "kaarten", "seizoenkaart", "seizoenkaarten", "wedstrijd", "losse verkoop", "uitkaart"]],
  ["Merchandise", ["merch", "merchandise", "fanstore", "shirt", "thuisshirt", "uitshirt", "webshop", "kit"]],
  ["Mijn PSV+", ["psv+", "psv plus", "mijn psv", "plus", "fanclub", "abonnement", "membership"]],
  ["PSV Business", ["business", "hospitality", "seats", "sponsor", "sponsoring", "zakelijk", "b2b"]],
  ["Museum & Tours", ["museum", "tour", "tours", "experience", "stadiontour", "rondleiding"]],
  ["Campus", ["campus", "soccer school", "academy", "kamp", "clinic", "coaching"]],
  ["Esports", ["esports", "gaming", "fifa", "ea fc"]],
  ["Vitality", ["vitality", "vitaliteit"]],
];

/** Herkent een exploitatienaam die letterlijk in de campagnenaam staat. */
function matchBusinessUnit(value: string): string | null {
  const normalized = normalize(value);
  for (const [label, keywords] of BUSINESS_UNITS) {
    if (normalized === normalize(label) || hasAny(normalized, keywords)) return label;
  }
  return null;
}

/**
 * Bepaalt de exploitatie. Deel 2 van de naamconventie is leidend; daarna wordt
 * de volledige naam op trefwoorden gescand. Blijft dat leeg, dan komt de
 * campagne onder "Overig" — zichtbaar in het dashboard, zodat een campagne die
 * buiten de naamconventie valt opvalt in plaats van verdwijnt.
 */
export function resolveBusinessUnit(campaignName: string): string {
  const parts = nameParts(campaignName);
  if (parts.length >= 2) {
    const fromName = matchBusinessUnit(parts[1]);
    if (fromName) return fromName;
  }
  return matchBusinessUnit(campaignName) ?? "Overig";
}

/* ------------------------------------------------------ campagnegroep -- */

/**
 * De overkoepelende campagne wanneer dezelfde actie op meerdere kanalen draait.
 * Deel 4 van de naamconventie, en alleen die: zonder conventie is er geen
 * betrouwbare manier om twee namen aan elkaar te knopen, en een foute koppeling
 * telt budget dubbel.
 */
export function resolveCampaignGroup(campaignName: string): string | null {
  const parts = nameParts(campaignName);
  return parts.length >= 4 ? parts[3] : null;
}

/* ---------------------------------------------------------- doelgroep -- */

const AUDIENCE_BY_KEYWORD: [AudienceType, string[]][] = [
  ["lookalike", ["lookalike", "lal", "look a like", "similar"]],
  ["retargeting", ["retarget", "retargeting", "remarket", "remarketing", "rtg", "bezoekers", "visitors", "viewers", "engagers", "warm"]],
  ["database", ["crm", "database", "klantenbestand", "customer list", "customer match", "bestand", "mailbestand", "eigen data"]],
  ["interesse", ["interesse", "interest", "affinity", "in market", "in-market", "voetbal", "football fans"]],
  ["broad", ["broad", "breed", "open", "prospecting", "cold", "koud", "advantage"]],
];

/** Leidt het doelgroeptype af uit de naam van de advertentieset. */
export function resolveAudienceType(adSetName: string): AudienceType | null {
  const normalized = normalize(adSetName);
  for (const [type, keywords] of AUDIENCE_BY_KEYWORD) {
    if (hasAny(normalized, keywords)) return type;
  }
  return null;
}

/* ------------------------------------------------------ format en hook -- */

const FORMAT_BY_KEYWORD: [string, string[]][] = [
  ["Video 9:16", ["9 16", "9x16", "vertical", "verticaal", "reel", "reels", "story", "stories", "shorts"]],
  ["Video 1:1", ["1 1 video", "video 1 1", "square video"]],
  ["Video 16:9", ["16 9", "16x9", "landscape", "liggend"]],
  ["Carousel", ["carousel", "carrousel", "swipe"]],
  ["Collection", ["collection", "collectie"]],
  ["Statisch 1:1", ["static", "statisch", "beeld", "image", "foto", "1 1", "1x1"]],
  ["Search tekst", ["search", "rsa", "zoekadvertentie", "tekstadvertentie"]],
  ["Display", ["display", "banner", "gdn"]],
];

/**
 * Leidt het advertentieformat af uit de naam. Levert het platform zelf een
 * formatveld, geef dat dan mee als `hint` — die wint van de naam.
 */
export function resolveFormat(adName: string, hint?: string | null): string | null {
  const normalized = normalize(`${hint ?? ""} ${adName}`);
  for (const [label, keywords] of FORMAT_BY_KEYWORD) {
    if (hasAny(normalized, keywords)) return label;
  }
  return null;
}

/**
 * Haalt het hook-label uit de advertentienaam. Herkent zowel `hook: naam` als
 * een deel van de naamconventie dat met "hook" begint, zodat de
 * hook-vergelijking in de creative-view werkt zonder extra invoer.
 */
export function resolveHook(adName: string): string | null {
  const labelled = adName.match(/hook\s*[:=]\s*([^|_]+)/i);
  if (labelled?.[1]) return labelled[1].trim();

  const parts = nameParts(adName);
  const part = parts.find((p) => normalize(p).startsWith("hook"));
  if (part) {
    const value = part.replace(/^hook/i, "").replace(/^[\s:=-]+/, "").trim();
    if (value) return value;
  }
  return null;
}

/* ------------------------------------------------------- doelstelling -- */

/**
 * Nederlandse naam van de doelstelling. De waarden "Leads", "Registraties" en
 * "Aankopen" zijn niet vrij te kiezen: `CONVERSION_OBJECTIVES` in `types.ts`
 * gebruikt ze om te bepalen welke campagnes in de CPA-analyse meetellen.
 */
const OBJECTIVE_LABELS: Record<string, string> = {
  outcome_sales: "Aankopen",
  product_catalog_sales: "Aankopen",
  conversions: "Aankopen",
  conversion: "Aankopen",
  outcome_leads: "Leads",
  lead_generation: "Leads",
  outcome_app_promotion: "App-installaties",
  outcome_traffic: "Verkeer",
  link_clicks: "Verkeer",
  traffic: "Verkeer",
  website_visits: "Verkeer",
  outcome_engagement: "Interactie",
  post_engagement: "Interactie",
  engagement: "Interactie",
  messages: "Berichten",
  page_likes: "Interactie",
  outcome_awareness: "Bereik",
  brand_awareness: "Bereik",
  awareness: "Bereik",
  reach: "Bereik",
  video_views: "Videoweergaven",
  video_view: "Videoweergaven",
  lead_generation_tiktok: "Leads",
  brand_awareness_linkedin: "Bereik",
};

/**
 * Vertaalt de doelstelling van het platform. `resultActionType` is het
 * conversietype waarop de resultaten geteld zijn: staat dat op registraties,
 * dan is dat een preciezer label dan het generieke "Aankopen" van de
 * doelstelling.
 */
export function resolveObjectiveLabel(
  objective: string,
  resultActionType?: string | null
): string {
  if (resultActionType && /complete_registration|registration|signup|submit_application/i.test(resultActionType)) {
    return "Registraties";
  }
  if (resultActionType && /lead/i.test(resultActionType)) return "Leads";

  const key = normalize(objective).replace(/ /g, "_");
  return OBJECTIVE_LABELS[key] ?? (objective ? objective : "Onbekend");
}
