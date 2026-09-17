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
  createdBy: string;
  createdAt: string;
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
