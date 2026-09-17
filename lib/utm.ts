/**
 * Gedeelde types en constanten voor de UTM Builder. Bewust zonder server-only
 * imports (`@vercel/blob`), zodat de client-componenten hier ook uit kunnen
 * putten zonder de blob-SDK in de browserbundel te trekken. De opslag zelf
 * staat in `lib/utm-links.ts`.
 */

/** Standaard utm_source-waarden (PSV-kanalen). */
export const DEFAULT_SOURCES = [
  "app",
  "b2bpro",
  "blueconic",
  "dpgmedia",
  "facebook",
  "google",
  "instagram",
  "linkedin",
  "maileon",
  "offline",
  "omroepbrabant",
  "playable",
  "psvfansnl",
  "psvnl",
  "psvplay",
  "snapchat",
  "tiktok",
  "typeform",
  "visitbrabant",
  "whatsapp",
  "x",
] as const;

/** Standaard utm_medium-waarden (PSV-plaatsingen). */
export const DEFAULT_MEDIUMS = [
  "agenda",
  "app_news",
  "app_video",
  "article",
  "banner_medium",
  "bannering",
  "bottom",
  "button",
  "call",
  "cpc",
  "CTA",
  "email",
  "feed",
  "half_page_ad",
  "leaderboard",
  "match_center",
  "match_right",
  "organic_social",
  "overview_bottom",
  "paid_social",
  "pop_up",
  "pushnotification",
  "qr_code",
  "recommendation",
  "rectangle",
  "redirect",
  "referral",
  "story",
  "ticketshop",
] as const;

/** Bron- en mediumwaarden mogen geen spaties of &/?/= bevatten: ze gaan
 *  rechtstreeks de URL in. */
export const UTM_VALUE_RE = /^[A-Za-z0-9_.-]{1,64}$/;

/**
 * Normaliseer een bron- of mediumwaarde: spaties worden underscores, overige
 * niet-toegestane tekens vallen weg. Hoofdletters blijven staan (er bestaan
 * bestaande waarden als "CTA").
 */
export function normalizeTaxonomyValue(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^A-Za-z0-9_.-]/g, "")
    .slice(0, 64);
}

export interface UtmLinkRecord {
  id: string;
  /** De ingevoerde bestemmings-URL, zonder UTM-parameters. */
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
  /** De volledige link mét UTM-parameters, zoals gekopieerd. */
  generatedUrl: string;
  /** E-mailadres van de aanmaker (uniek, ook als de voornaam ontbreekt). */
  createdBy: string;
  /** Volledige naam uit de SAML-sessie; ontbreekt bij links van voor die uitbreiding. */
  createdByName?: string;
  createdAt: string;
}

/**
 * Maak van het deel voor de @ een leesbare naam: "ruud.dankers" wordt
 * "Ruud Dankers" en "r.dankers" wordt "R. Dankers". Terugvalpad voor links en
 * sessies zonder naam-claim; de echte naam komt uit de SAML-assertion.
 */
const TUSSENVOEGSELS = new Set([
  "van", "de", "der", "den", "het", "ten", "ter", "te", "op", "aan", "in", "'t",
]);

function nameFromEmail(email: string): string {
  const local = email.split("@")[0];
  if (!local) return email;
  const parts = local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part, i) => {
      if (part.length === 1) return `${part.toUpperCase()}.`;
      // Tussenvoegsels blijven klein, behalve aan het begin: "jan.van.der.berg"
      // wordt "Jan van der Berg".
      if (i > 0 && TUSSENVOEGSELS.has(part.toLowerCase())) return part.toLowerCase();
      return part.charAt(0).toUpperCase() + part.slice(1);
    });
  return parts.length > 0 ? parts.join(" ") : local;
}

/**
 * Weergavenaam voor de kolom "Door": de volledige naam uit de sessie, en
 * anders een nette naam afgeleid van het e-mailadres (oudere links en sessies
 * zonder naam-claim).
 */
export function utmCreatorLabel(link: Pick<UtmLinkRecord, "createdBy" | "createdByName">): string {
  const name = link.createdByName?.trim();
  if (name) return name;
  return nameFromEmail(link.createdBy);
}

export interface UtmLinkInput {
  url: string;
  source: string;
  medium: string;
  campaign: string;
  term?: string;
  content?: string;
  generatedUrl: string;
}

export interface UtmTaxonomy {
  sources: string[];
  mediums: string[];
}
