/**
 * De creative van een Meta-advertentie: de copy (tekst, kop, beschrijving,
 * CTA, link) en wat er te zien is (afbeelding, video, carrousel).
 *
 * Meta bewaart dat op verschillende plekken, afhankelijk van hoe de
 * advertentie is gemaakt:
 *   - gewone advertentie: `object_story_spec` (link_data, video_data, photo_data
 *     of template_data);
 *   - Advantage+ / dynamische creative: `asset_feed_spec`, met meerdere
 *     varianten per onderdeel;
 *   - bestaande post als advertentie: alleen `effective_object_story_id`; de
 *     tekst staat dan in de post zelf (zie `postZonderTekst`);
 *   - daarnaast soms `title` en `body` direct op de creative.
 *
 * `normaliseerCreative` brengt dat terug naar één vorm. Deze module haalt zelf
 * niets op; Paid Ads en de MCP-server vragen de velden uit `CREATIVE_VELDEN`
 * op en geven het antwoord hier door.
 */

/** De velden van de creative, als genest veld op een advertentie. */
export const CREATIVE_VELDEN =
  "creative{id,name,title,body,link_url,call_to_action_type,object_type,image_url,thumbnail_url,video_id," +
  "effective_object_story_id,object_story_spec,asset_feed_spec}";

interface CallToAction {
  type?: string;
  value?: { link?: string };
}

interface ChildAttachment {
  name?: string;
  description?: string;
  link?: string;
  picture?: string;
  image_hash?: string;
  video_id?: string;
  call_to_action?: CallToAction;
}

interface LinkData {
  message?: string;
  name?: string;
  description?: string;
  caption?: string;
  link?: string;
  picture?: string;
  image_hash?: string;
  call_to_action?: CallToAction;
  child_attachments?: ChildAttachment[];
}

/** Zoals Graph de creative teruggeeft; alles is optioneel. */
export interface MetaCreativeRaw {
  id?: string;
  name?: string;
  title?: string;
  body?: string;
  link_url?: string;
  call_to_action_type?: string;
  object_type?: string;
  image_url?: string;
  thumbnail_url?: string;
  video_id?: string;
  effective_object_story_id?: string;
  object_story_spec?: {
    link_data?: LinkData;
    template_data?: LinkData;
    video_data?: {
      message?: string;
      title?: string;
      link_description?: string;
      image_url?: string;
      video_id?: string;
      call_to_action?: CallToAction;
    };
    photo_data?: { caption?: string; url?: string; image_hash?: string };
  };
  asset_feed_spec?: {
    bodies?: { text?: string }[];
    titles?: { text?: string }[];
    descriptions?: { text?: string }[];
    call_to_action_types?: string[];
    link_urls?: { website_url?: string; display_url?: string }[];
    images?: { hash?: string; url?: string }[];
    videos?: { video_id?: string; thumbnail_url?: string }[];
  };
}

export type CreativeSoort = "afbeelding" | "video" | "carrousel" | "dynamisch" | "post" | "onbekend";

export interface CreativeKaart {
  kop: string | null;
  beschrijving: string | null;
  link: string | null;
  video: boolean;
}

/** Een video in de creative; `poster` is een tijdelijke URL van Meta. */
export interface CreativeVideo {
  id: string;
  poster: string | null;
}

/** De creative in één vorm. Lijsten bevatten elke variant één keer. */
export interface CreativeDetails {
  soort: CreativeSoort;
  /** Hoofdtekst (primary text); meerdere bij een dynamische creative. */
  teksten: string[];
  /** Kop (headline). */
  koppen: string[];
  /** Beschrijving onder de kop. */
  beschrijvingen: string[];
  /** Knoptekst zoals Meta hem codeert, bijvoorbeeld `SHOP_NOW` of `LEARN_MORE`. */
  ctas: string[];
  /** Bestemmings-URL's. */
  links: string[];
  /** Kaarten van een carrousel, in volgorde. Leeg bij andere soorten. */
  kaarten: CreativeKaart[];
  /** Aantal afbeeldingen en video's in de creative (bij dynamisch alle varianten). */
  afbeeldingen: number;
  videos: number;
  /**
   * De video's zelf, in volgorde (bij een carrousel in kaartvolgorde). Het
   * bestand haal je op met het ID; zie `fetchMetaVideo` in Paid Ads.
   */
  videoLijst: CreativeVideo[];
  /** De post achter de advertentie, als Meta die noemt. */
  postId: string | null;
}

/** Leesbare knopteksten voor de CTA-codes die PSV het meest gebruikt. */
const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: "Shop nu",
  LEARN_MORE: "Meer informatie",
  BUY_TICKETS: "Tickets kopen",
  BUY_NOW: "Nu kopen",
  ORDER_NOW: "Nu bestellen",
  SIGN_UP: "Aanmelden",
  SUBSCRIBE: "Abonneren",
  WATCH_MORE: "Meer bekijken",
  WATCH_VIDEO: "Video bekijken",
  BOOK_TRAVEL: "Nu boeken",
  BOOK_NOW: "Nu boeken",
  DOWNLOAD: "Downloaden",
  GET_OFFER: "Aanbieding bekijken",
  CONTACT_US: "Contact opnemen",
  APPLY_NOW: "Nu aanvragen",
  SEE_MORE: "Meer weergeven",
  LISTEN_NOW: "Nu luisteren",
  PLAY_GAME: "Game spelen",
  INSTALL_APP: "Installeren",
  USE_APP: "App gebruiken",
  SEND_MESSAGE: "Bericht sturen",
  GET_QUOTE: "Offerte aanvragen",
  NO_BUTTON: "Geen knop",
};

/** De knoptekst bij een CTA-code; onbekende codes leesbaar gemaakt. */
export function ctaLabel(code: string): string {
  const label = CTA_LABELS[code];
  if (label) return label;
  const tekst = code.toLowerCase().replace(/_/g, " ");
  return tekst.charAt(0).toUpperCase() + tekst.slice(1);
}

function uniek(waarden: (string | undefined | null)[]): string[] {
  const uit: string[] = [];
  for (const w of waarden) {
    const t = w?.trim();
    if (t && !uit.includes(t)) uit.push(t);
  }
  return uit;
}

function ctaType(cta: CallToAction | undefined): string | undefined {
  return cta?.type;
}

/** Brengt de creative uit Graph terug naar `CreativeDetails`. */
export function normaliseerCreative(raw: MetaCreativeRaw | undefined | null): CreativeDetails {
  const c = raw ?? {};
  const spec = c.object_story_spec ?? {};
  const link = spec.link_data ?? spec.template_data;
  const video = spec.video_data;
  const foto = spec.photo_data;
  const feed = c.asset_feed_spec;
  const kinderen = link?.child_attachments ?? [];

  const teksten = uniek([
    link?.message,
    video?.message,
    foto?.caption,
    ...(feed?.bodies ?? []).map((b) => b.text),
    c.body,
  ]);
  const koppen = uniek([link?.name, video?.title, ...(feed?.titles ?? []).map((t) => t.text), c.title]);
  const beschrijvingen = uniek([
    link?.description,
    video?.link_description,
    ...(feed?.descriptions ?? []).map((d) => d.text),
  ]);
  const ctas = uniek([
    ctaType(link?.call_to_action),
    ctaType(video?.call_to_action),
    ...(feed?.call_to_action_types ?? []),
    c.call_to_action_type,
  ]);
  const links = uniek([
    link?.call_to_action?.value?.link,
    link?.link,
    video?.call_to_action?.value?.link,
    ...(feed?.link_urls ?? []).map((l) => l.website_url),
    c.link_url,
  ]);

  const videoLijst: CreativeVideo[] = [];
  const voegVideoToe = (id: string | undefined, poster: string | undefined) => {
    if (id && /^\d{1,30}$/.test(id) && !videoLijst.some((v) => v.id === id)) {
      videoLijst.push({ id, poster: poster?.startsWith("https://") ? poster : null });
    }
  };
  voegVideoToe(video?.video_id, video?.image_url);
  for (const k of kinderen) voegVideoToe(k.video_id, k.picture);
  for (const v of feed?.videos ?? []) voegVideoToe(v.video_id, v.thumbnail_url);
  voegVideoToe(c.video_id, c.thumbnail_url);

  const kaarten: CreativeKaart[] = kinderen.map((k) => ({
    kop: k.name?.trim() || null,
    beschrijving: k.description?.trim() || null,
    link: k.call_to_action?.value?.link ?? k.link ?? null,
    video: Boolean(k.video_id),
  }));

  let afbeeldingen = 0;
  let videos = 0;
  if (feed && ((feed.images?.length ?? 0) > 0 || (feed.videos?.length ?? 0) > 0)) {
    afbeeldingen = feed.images?.length ?? 0;
    videos = feed.videos?.length ?? 0;
  } else if (kaarten.length > 0) {
    videos = kaarten.filter((k) => k.video).length;
    afbeeldingen = kaarten.length - videos;
  } else if (video?.video_id || c.video_id) {
    videos = 1;
  } else if (link?.picture || link?.image_hash || foto || c.image_url || c.thumbnail_url) {
    afbeeldingen = 1;
  }

  // Een dynamische creative heeft meerdere varianten in asset_feed_spec; met
  // één variant van alles is het in de praktijk gewoon een advertentie.
  const varianten = Math.max(
    feed?.bodies?.length ?? 0,
    feed?.titles?.length ?? 0,
    (feed?.images?.length ?? 0) + (feed?.videos?.length ?? 0)
  );
  const soort: CreativeSoort =
    feed && varianten > 1
      ? "dynamisch"
      : kaarten.length > 1
        ? "carrousel"
        : videos > 0
          ? "video"
          : afbeeldingen > 0
            ? "afbeelding"
            : !c.object_story_spec && c.effective_object_story_id
              ? "post"
              : "onbekend";

  return {
    soort,
    teksten,
    koppen,
    beschrijvingen,
    ctas,
    links,
    kaarten,
    afbeeldingen,
    videos,
    videoLijst,
    postId: c.effective_object_story_id ?? null,
  };
}

/**
 * De post waar de tekst nog uit moet komen: een advertentie zonder eigen
 * tekst die op een bestaande post draait. `null` als de tekst er al is.
 */
export function postZonderTekst(details: CreativeDetails): string | null {
  return details.teksten.length === 0 && details.postId && /^\d+_\d+$/.test(details.postId) ? details.postId : null;
}

/** Vult de tekst aan met het bericht van de post. */
export function metPostTekst(details: CreativeDetails, bericht: string | undefined): CreativeDetails {
  const tekst = bericht?.trim();
  if (!tekst) return details;
  return { ...details, teksten: [tekst], soort: details.soort === "onbekend" ? "post" : details.soort };
}

const SOORT_LABEL: Record<CreativeSoort, string> = {
  afbeelding: "afbeelding",
  video: "video",
  carrousel: "carrousel",
  dynamisch: "dynamische creative (Advantage+)",
  post: "bestaande post",
  onbekend: "onbekend formaat",
};

/** De creative als tekstblok voor het model. */
export function creativeTekst(details: CreativeDetails): string[] {
  const regels: string[] = [];
  const media = [
    details.afbeeldingen > 0 && `${details.afbeeldingen} ${details.afbeeldingen === 1 ? "afbeelding" : "afbeeldingen"}`,
    details.videos > 0 && `${details.videos} ${details.videos === 1 ? "video" : "video's"}`,
  ].filter(Boolean);
  regels.push(`Soort: ${SOORT_LABEL[details.soort]}${media.length ? ` (${media.join(", ")})` : ""}`);

  const lijst = (label: string, waarden: string[]) => {
    if (waarden.length === 0) return;
    if (waarden.length === 1) {
      regels.push(`${label}: ${waarden[0]}`);
      return;
    }
    regels.push(`${label} (${waarden.length} varianten):`);
    waarden.forEach((w, i) => regels.push(`  ${i + 1}. ${w}`));
  };
  lijst("Tekst", details.teksten);
  lijst("Kop", details.koppen);
  lijst("Beschrijving", details.beschrijvingen);
  lijst("Knop", details.ctas.map((c) => `${ctaLabel(c)} (${c})`));
  lijst("Link", details.links);
  if (details.videoLijst.length > 0) {
    regels.push(`Video-ID's: ${details.videoLijst.map((v) => v.id).join(", ")}`);
  }
  details.kaarten.forEach((k, i) => {
    const delen = [k.kop, k.beschrijving, k.link, k.video ? "video" : null].filter(Boolean);
    regels.push(`Kaart ${i + 1}: ${delen.join(" · ") || "(geen tekst)"}`);
  });
  if (details.teksten.length === 0 && details.koppen.length === 0) {
    regels.push(
      details.postId
        ? `Geen copy gevonden in de creative; de advertentie draait op post ${details.postId}.`
        : "Geen copy gevonden in de creative."
    );
  }
  return regels;
}
