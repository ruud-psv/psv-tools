export interface KennisbankFeature {
  title: string;
  description: string;
}

export interface KennisbankStep {
  title: string;
  description: string;
}

export interface KennisbankTip {
  type: "tip" | "warning" | "note";
  text: string;
}

export interface KennisbankTable {
  caption?: string;
  headers: string[];
  rows: string[][];
}

export interface KennisbankChecklistItem {
  label: string;
  note?: string;
}

export interface KennisbankChecklistGroup {
  type: "include" | "conditional" | "exclude";
  title: string;
  description?: string;
  items: KennisbankChecklistItem[];
}

export interface KennisbankChecklist {
  caption?: string;
  intro?: string;
  groups: KennisbankChecklistGroup[];
}

export interface KennisbankEmbed {
  /** Section heading, e.g. "Dataprocessen". Also used as anchor id. */
  caption?: string;
  /** Optional short intro shown above the embed. */
  intro?: string;
  /** Provider — determines how the URL is rendered. */
  type: "figma";
  /**
   * The Figma URL to embed. Paste a normal Figma share/file link OR a
   * ready-made embed URL (embed.figma.com / figma.com/embed). Plain share
   * links are wrapped automatically.
   */
  url: string;
  /** Optional aspect-ratio height in px (default 480). */
  height?: number;
  /** Optional direct link shown under the embed as a fallback. */
  openUrl?: string;
}

export type KennisbankCategory =
  | "Adverteren & Display"
  | "E-mail & Data"
  | "Design & Content"
  | "Automatisering & Projectmanagement";

export interface KennisbankTool {
  slug: string;
  name: string;
  category: KennisbankCategory;
  description: string;
  logo?: string;
  accessUrl?: string;
  accessNote?: string;
  accessLinks?: { label: string; url: string }[];
  docsUrl?: string;
  features: KennisbankFeature[];
  steps?: KennisbankStep[];
  tips?: KennisbankTip[];
  tables?: KennisbankTable[];
  checklists?: KennisbankChecklist[];
  embeds?: KennisbankEmbed[];
  comingSoon?: boolean;
}

export const kennisbankCategories: KennisbankCategory[] = [
  "Adverteren & Display",
  "E-mail & Data",
  "Design & Content",
  "Automatisering & Projectmanagement",
];

export const kennisbankTools: KennisbankTool[] = [
  {
    slug: "dataprocessen",
    name: "Dataprocessen",
    category: "E-mail & Data",
    description:
      "Overzicht van onze dataprocessen en het NBA-model (Next Best Action), rechtstreeks vanuit Figma.",
    embeds: [
      {
        caption: "Dataprocessen & NBA-model",
        intro:
          "Interactief overzicht vanuit Figma. Scroll en zoom binnen het board; klik op de knop eronder om het in Figma te openen.",
        type: "figma",
        // TODO: vervang door de echte Figma-URL (gewone share-link mag).
        url: "https://www.figma.com/board/PLACEHOLDER/PSV-Dataprocessen",
        height: 640,
      },
    ],
    features: [],
  },
  {
    slug: "asana",
    name: "Asana",
    category: "Automatisering & Projectmanagement",
    logo: "/images/kennisbank/asana.svg",
    description: "Plan campagnes, wijs taken toe en houd de voortgang bij — alles op één plek.",
    docsUrl: "https://help.asana.com",
    comingSoon: true,
    features: [],
  },
  {
    slug: "azerion",
    name: "Azerion",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/azerion.png",
    description: "Bereik PSV-fans met branded games en display-advertenties via het Azerion-netwerk.",
    accessUrl: "https://psv.azerionsports.com/",
    features: [],
    tables: [
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Afbeelding", "980 x 1080 px"],
        ],
      },
      {
        caption: "Tekstspecificaties push notificatie",
        headers: ["Onderdeel", "Specificatie"],
        rows: [
          ["Titel", "40-60 tekens"],
          ["Message", "100-150 tekens zichtbaar"],
        ],
      },
      {
        caption: "Taxonomie pop-ups",
        headers: ["Onderdeel", "Formaat / Voorbeeld"],
        rows: [
          ["Formaat", "[DATUM] [EXPLOITATIE] - [ONDERWERP] - [DMID]"],
          ["Voorbeeld", "2026.05.06 PSV Kaartverkoop - Wachtlijst SCC - DMID26-11224"],
        ],
      },
    ],
    tips: [
      {
        type: "note",
        text: "Pop-ups kunnen gekoppeld worden aan een externe URL of aan een tab binnen de app. Push notificaties linken aan een tab binnen de app.",
      },
      {
        type: "note",
        text: "De doelgroepen voor push notificaties zijn dezelfde als in Maileon en worden vanuit TwoCircles doorgezet.",
      },
    ],
  },
  {
    slug: "blueconic",
    name: "BlueConic",
    category: "E-mail & Data",
    logo: "/images/kennisbank/blueconic.jpeg",
    description: "Verzamel first-party data, bouw doelgroepsegmenten en activeer ze in je campagnes.",
    docsUrl: "https://support.blueconic.com",
    comingSoon: true,
    features: [],
  },
  {
    slug: "custom-landingspaginas",
    name: "Custom landingspagina's",
    category: "Design & Content",
    logo: "/images/kennisbank/custom-landingspaginas.svg",
    description: "Bouw gerichte landingspagina's voor campagnes, acties en evenementen van PSV.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "figma",
    name: "Figma",
    category: "Design & Content",
    logo: "/images/kennisbank/figma.svg",
    description: "Ontwerp campagnevisuals, UI-mockups en prototypes in de PSV-huisstijl.",
    docsUrl: "https://help.figma.com/hc/en-us",
    comingSoon: true,
    features: [],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/google.svg",
    description: "Adverteer in zoekresultaten, op YouTube en via het Google Display Netwerk.",
    docsUrl: "https://support.google.com/google-ads",
    comingSoon: true,
    features: [],
  },
  {
    slug: "jw-player",
    name: "JW Player",
    category: "Design & Content",
    logo: "/images/kennisbank/jwplayer.png",
    description: "Host en publiceer PSV-videocontent en genereer embedcodes voor gebruik op de website.",
    docsUrl: "https://docs.jwplayer.com/platform/docs",
    comingSoon: true,
    features: [],
  },
  {
    slug: "linkedin-ads",
    name: "LinkedIn Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/linkedin.svg",
    description: "Bereik zakelijke doelgroepen op LinkedIn met gesponsorde content en lead gen forms.",
    docsUrl: "https://www.linkedin.com/help/lms",
    comingSoon: true,
    features: [],
  },
  {
    slug: "maileon",
    name: "Maileon",
    category: "E-mail & Data",
    logo: "/images/kennisbank/maileon.png",
    description: "Verstuur nieuwsbrieven, campagnemails en geautomatiseerde e-mails naar PSV-doelgroepen.",
    docsUrl: "https://support.maileon.com",
    accessLinks: [
      { label: "PSV", url: "https://psv-news-mailer.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa" },
      { label: "PSV Business", url: "https://psvbusiness-sendserver.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
      { label: "PSV Campaigns", url: "https://campains-psv.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
      { label: "PSV Operational", url: "https://psv-sso-news-mailer.maileon.com/eagle_kp_webapp/start/dashboards/dashboard.msa?fromlogin=true" },
    ],
    features: [],
    tables: [
      {
        caption: "Accountstructuur",
        headers: ["Account", "Omschrijving"],
        rows: [
          [
            "PSV",
            "Database-account. Nachtelijke verwerking via koppeling met TwoCircles.",
          ],
          [
            "PSV Business",
            "Gekoppeld met het CRM van PSV Business. Contactfilters maak je op basis van velden die ook in het CRM terugkomen.",
          ],
          [
            "PSV Campaigns",
            "Account voor campagnes van PSV, directe communicatie. Hoeft niet te wachten op de nachtelijke verwerking.",
          ],
          [
            "PSV Operational",
            "Leeg account waar je lijsten handmatig invoert, zoals personeel of PSV Business-leden.",
          ],
        ],
      },
      {
        caption: "Taxonomie van mailings",
        headers: ["Onderdeel", "Voorbeeld"],
        rows: [
          [
            "Formaat",
            "[DATUM YYYY.MM.DD] [EXPLOITATIE] [ONDERWERP/CAMPAGNE] [VARIANT] [DMID]",
          ],
          [
            "Voorbeeld",
            "2026.05.03 PSV Vrouwen - Kampioenschap - Mail personeel - DMID26-11566",
          ],
        ],
      },
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Header", "1250 x 802 px"],
          ["Banmail", "1250 x 458 px"],
        ],
      },
      {
        caption: "Beschikbare templates",
        headers: ["Template"],
        rows: [
          ["TEMPLATE PSV 1 - Pre-match"],
          ["TEMPLATE PSV Tours"],
          ["TEMPLATE FC PSV O16"],
          ["TEMPLATE FC PSV O12"],
          ["TEMPLATE PSV Soccer School"],
          ["TEMPLATE PSV FANstore"],
        ],
      },
    ],
    tips: [
      {
        type: "note",
        text: "In het PSV-account zet je doelgroepen door vanuit TwoCircles. Lees meer hierover in de TwoCircles-kennisbank.",
      },
    ],
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/meta.svg",
    description: "Adverteer op Facebook en Instagram en bereik PSV-fans met gerichte campagnes.",
    docsUrl: "https://www.facebook.com/business/help",
    comingSoon: true,
    features: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    category: "Automatisering & Projectmanagement",
    logo: "/images/kennisbank/n8n.svg",
    description: "Koppel tools aan elkaar en automatiseer terugkerende processen zonder code.",
    docsUrl: "https://docs.n8n.io",
    comingSoon: true,
    features: [],
  },
  {
    slug: "playable",
    name: "Playable",
    category: "Design & Content",
    logo: "/images/kennisbank/playable.jpeg",
    description: "Maak interactieve landingspagina's en mini-games voor PSV-campagnes.",
    accessUrl: "https://app.playable.com/campaigns",
    docsUrl: "https://help.playable.com/en/",
    features: [],
    tables: [
      {
        caption: "Templates",
        headers: ["Template", "ID"],
        rows: [
          ["TEMPLATE PSV 1", "#189777"],
          ["TEMPLATE PHOXY CLUB | 2025 - 2026", "191848"],
          ["TEMPLATE FC PSV O12 | 2025-2026", "191851"],
          ["TEMPLATE FC PSV O16 | 2025-2026", "191853"],
          ["TEMPLATE PSV PARTNERSHIPS | 2025-2026", "192598"],
          ["TEMPLATE UEFA CHAMPIONS LEAGUE | 2025-2026", "192971"],
          ["TEMPLATE PSV FANCLUB | 2025 - 2026", "192974"],
          ["TEMPLATE JONG PSV - PSV VROUWEN | 2025 - 2026", "211939"],
          ["TEMPLATE - Video detail", "225293"],
        ],
      },
      {
        caption: "Afbeeldingsspecificaties",
        headers: ["Onderdeel", "Afmetingen"],
        rows: [
          ["Header mobile", "700 x 290 px"],
          ["Header desktop", "335 x 300 px"],
        ],
      },
      {
        caption: "Taxonomie van landingspagina's",
        headers: ["Onderdeel", "Formaat"],
        rows: [
          ["Naamgeving", "[EXPLOITATIE] - [CAMPAGNE] - [SEIZOEN] - [DMID]"],
        ],
      },
    ],
  },
  {
    slug: "tiktok-ads",
    name: "TikTok Ads",
    category: "Adverteren & Display",
    logo: "/images/kennisbank/tiktok.svg",
    description: "Bereik een jong publiek op TikTok met video-advertenties en Spark Ads.",
    docsUrl: "https://ads.tiktok.com/help/",
    comingSoon: true,
    features: [],
  },
  {
    slug: "twocircles",
    name: "TwoCircles",
    category: "E-mail & Data",
    logo: "/images/kennisbank/twocircles.svg",
    description: "Data- en ticketingplatform voor het beheren van fan- en klantdata van PSV.",
    docsUrl: "https://help.koresoftware.com/hc/en-us",
    features: [],
    checklists: [
      {
        caption: "Audience Builder – Seizoenkaarten 26/27",
        intro:
          "Bij een selectie van seizoenkaarthouders werk je in de Audience Builder onder SeizoenClubCards. Er zijn altijd 8 waardes (6 kernwaarden + 2 toegangswaarden); daarnaast zijn er opties die je juist moet uitsluiten.",
        groups: [
          {
            type: "include",
            title: "Altijd meenemen",
            description: "De 6 kernwaarden van een seizoenkaart 26/27.",
            items: [
              { label: "Certificaat 26/27" },
              { label: "Certificaat All-in 26/27" },
              { label: "Dagkaarten 26/27" },
              { label: "Dagkaarten All-in 26/27" },
              { label: "Seizoen Club Card 26/27" },
              { label: "Seizoen Club Card All-in 26/27" },
            ],
          },
          {
            type: "conditional",
            title: "Afhankelijk van de briefing",
            description:
              "Gratis kaarten voor sponsors en personeel. Wel, niet of anders aanschrijven hangt af van de mailing — leg dit altijd expliciet vast in de briefing.",
            items: [
              { label: "Toegang SCC 26/27" },
              { label: "Toegang SCC dagkaarten 26/27" },
            ],
          },
          {
            type: "exclude",
            title: "Altijd uitsluiten",
            description:
              "Deze opties horen niet bij Seizoenkaarten 26/27 en sluit je altijd uit bij een selectie van seizoenkaarthouders.",
            items: [
              { label: "Certificaten" },
              { label: "Mystery SCC" },
              { label: "SCC wijziging 26/27" },
            ],
          },
        ],
      },
    ],
  },
  {
    slug: "typeform",
    name: "Typeform",
    category: "Design & Content",
    logo: "/images/kennisbank/typeform.png",
    description: "Maak formulieren, enquêtes en quizzen voor fan-onderzoek en registraties.",
    accessUrl: "https://admin.typeform.com/",
    docsUrl: "https://help.typeform.com/hc/en-us",
    features: [],
    tables: [
      {
        caption: "Accountstructuur",
        headers: ["Werkruimte"],
        rows: [
          ["Archief nieuwe account"],
          ["Archief oude account"],
          ["Dataverrijking PSV (Webhook)"],
          ["PSV 1"],
          ["PSV Academy"],
          ["PSV Brand & Design"],
          ["PSV Business"],
          ["PSV Business - Diners"],
          ["PSV Business - Evenementen"],
          ["PSV Business - Vitality"],
          ["PSV Digital Marketing"],
          ["PSV Digital Marketing - CES"],
          ["PSV Enquete"],
          ["PSV Esports"],
          ["PSV FANclub"],
          ["PSV FANclub - FC PSV"],
          ["PSV FANclub - Phoxy Club"],
          ["PSV FANdesk"],
          ["PSV FANentertainment"],
          ["PSV FANstore"],
          ["PSV Foundation"],
          ["PSV Kaartverkoop"],
          ["PSV Marketing & Media"],
          ["PSV Media"],
          ["PSV Museum & Tours"],
          ["PSV New Business"],
          ["PSV Organisatie"],
          ["PSV Partnerships"],
          ["PSV Perszaken"],
          ["PSV Philips Stadion"],
          ["PSV Soccer Schools"],
          ["PSV Together"],
          ["PSV Vrouwen"],
        ],
      },
      {
        caption: "Taxonomie van formulieren",
        headers: ["Onderdeel", "Formaat"],
        rows: [
          ["Naamgeving", "[EXPLOITATIE] - [ONDERWERP] - [OPTIONEEL SEIZOEN] - [DMID]"],
        ],
      },
    ],
  },
  {
    slug: "xperience-central",
    name: "Xperience Central",
    category: "Design & Content",
    logo: "/images/kennisbank/xperience-central.png",
    description: "Beheer en publiceer content op PSV-kanalen via dit CMS-platform.",
    docsUrl: "https://wiki.gxsoftware.com",
    comingSoon: true,
    features: [],
  },
];

export function getToolBySlug(slug: string): KennisbankTool | undefined {
  return kennisbankTools.find((t) => t.slug === slug);
}

const CHECKLIST_LABELS: Record<KennisbankChecklistGroup["type"], string> = {
  include: "ALTIJD MEENEMEN",
  conditional: "AFHANKELIJK VAN DE BRIEFING",
  exclude: "ALTIJD UITSLUITEN",
};

/**
 * Serialiseert de volledige kennisbank naar platte tekst voor gebruik als
 * context in de system prompt van de kennisbank-assistent (context-stuffing).
 */
export function buildKennisbankContext(): string {
  return kennisbankTools
    .map((tool) => {
      const lines: string[] = [];
      lines.push(`## ${tool.name} (categorie: ${tool.category}, slug: ${tool.slug})`);
      lines.push(tool.description);
      if (tool.comingSoon)
        lines.push("Status: documentatie nog niet beschikbaar (binnenkort).");
      if (tool.accessUrl) lines.push(`Inloggen: ${tool.accessUrl}`);
      tool.accessLinks?.forEach((l) => lines.push(`Inloggen (${l.label}): ${l.url}`));
      if (tool.accessNote) lines.push(`Toegang: ${tool.accessNote}`);
      if (tool.docsUrl) lines.push(`Officiële documentatie: ${tool.docsUrl}`);
      tool.features?.forEach((f) =>
        lines.push(`Mogelijkheid — ${f.title}: ${f.description}`)
      );
      tool.steps?.forEach((s, i) =>
        lines.push(`Stap ${i + 1} — ${s.title}: ${s.description}`)
      );
      tool.checklists?.forEach((c) => {
        lines.push(`Checklist — ${c.caption ?? ""}`);
        if (c.intro) lines.push(c.intro);
        c.groups.forEach((g) => {
          lines.push(
            `${CHECKLIST_LABELS[g.type]} — ${g.title}${g.description ? `: ${g.description}` : ""}`
          );
          g.items.forEach((it) =>
            lines.push(`  - ${it.label}${it.note ? ` (${it.note})` : ""}`)
          );
        });
      });
      tool.tables?.forEach((t) => {
        lines.push(`Tabel — ${t.caption ?? ""}`);
        lines.push(t.headers.join(" | "));
        t.rows.forEach((r) => lines.push(r.join(" | ")));
      });
      tool.embeds?.forEach((e) => {
        lines.push(`Ingesloten (${e.type}) — ${e.caption ?? ""}`);
        if (e.intro) lines.push(e.intro);
        lines.push(`Bron: ${e.url}`);
      });
      tool.tips?.forEach((tip) => lines.push(`Let op: ${tip.text}`));
      return lines.join("\n");
    })
    .join("\n\n");
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

/**
 * Zet een Figma-link om naar een insluitbare embed-URL. Accepteert zowel gewone
 * share-/file-links (figma.com/design|file|board|proto/...) als kant-en-klare
 * embed-URL's (embed.figma.com of figma.com/embed) — die worden ongewijzigd
 * teruggegeven. Voorwaarde blijft dat de linkrechten in Figma bekijken toestaan.
 */
export function figmaEmbedUrl(url: string): string {
  if (url.includes("embed.figma.com") || url.includes("figma.com/embed")) {
    return url;
  }
  return `https://www.figma.com/embed?embed_host=psv-tools&url=${encodeURIComponent(url)}`;
}

export interface KennisbankSection {
  label: string;
  id: string;
}

export function getToolSections(tool: KennisbankTool): KennisbankSection[] {
  const sections: KennisbankSection[] = [];
  if (tool.accessUrl || tool.accessNote || tool.accessLinks?.length || tool.docsUrl)
    sections.push({ label: "Toegang", id: "toegang" });
  if (tool.features.length > 0)
    sections.push({ label: "Mogelijkheden", id: "mogelijkheden" });
  if (tool.steps && tool.steps.length > 0)
    sections.push({ label: "Aan de slag", id: "aan-de-slag" });
  tool.embeds?.forEach((e) => {
    if (e.caption) sections.push({ label: e.caption, id: slugify(e.caption) });
  });
  tool.checklists?.forEach((c) => {
    if (c.caption) sections.push({ label: c.caption, id: slugify(c.caption) });
  });
  tool.tables?.forEach((t) => {
    if (t.caption) sections.push({ label: t.caption, id: slugify(t.caption) });
  });
  if (tool.tips && tool.tips.length > 0)
    sections.push({ label: "Tips", id: "tips" });
  return sections;
}

export const toolsByCategory: Record<KennisbankCategory, KennisbankTool[]> =
  Object.fromEntries(
    kennisbankCategories.map((cat) => [
      cat,
      kennisbankTools.filter((t) => t.category === cat),
    ])
  ) as Record<KennisbankCategory, KennisbankTool[]>;
