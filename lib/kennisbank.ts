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

export interface KennisbankTool {
  slug: string;
  name: string;
  description: string;
  accessUrl?: string;
  accessNote?: string;
  features: KennisbankFeature[];
  steps?: KennisbankStep[];
  tips?: KennisbankTip[];
  tables?: KennisbankTable[];
  comingSoon?: boolean;
}

export const kennisbankTools: KennisbankTool[] = [
  {
    slug: "asana",
    name: "Asana",
    description: "Plan campagnes, wijs taken toe en houd de voortgang bij — alles op één plek.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "azerion",
    name: "Azerion",
    description: "Bereik PSV-fans met branded games en display-advertenties via het Azerion-netwerk.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "blueconic",
    name: "BlueConic",
    description: "Verzamel first-party data, bouw doelgroepsegmenten en activeer ze in je campagnes.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "custom-landingspaginas",
    name: "Custom landingspagina's",
    description: "Bouw gerichte landingspagina's voor campagnes, acties en evenementen van PSV.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "figma",
    name: "Figma",
    description: "Ontwerp campagnevisuals, UI-mockups en prototypes in de PSV-huisstijl.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    description: "Adverteer in zoekresultaten, op YouTube en via het Google Display Netwerk.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "jw-player",
    name: "JW Player",
    description: "Host en publiceer PSV-videocontent en genereer embedcodes voor gebruik op de website.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "linkedin-ads",
    name: "LinkedIn Ads",
    description: "Bereik zakelijke doelgroepen op LinkedIn met gesponsorde content en lead gen forms.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "maileon",
    name: "Maileon",
    description: "Verstuur nieuwsbrieven, campagnemails en geautomatiseerde e-mails naar PSV-doelgroepen.",
    accessUrl: "https://app.maileon.com",
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
    description: "Adverteer op Facebook en Instagram en bereik PSV-fans met gerichte campagnes.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    description: "Koppel tools aan elkaar en automatiseer terugkerende processen zonder code.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "playable",
    name: "Playable",
    description: "Maak interactieve mini-games en speelbare advertenties voor PSV-campagnes.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "tiktok-ads",
    name: "TikTok Ads",
    description: "Bereik een jong publiek op TikTok met video-advertenties en Spark Ads.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "twocircles",
    name: "TwoCircles",
    description: "Data- en ticketingplatform voor het beheren van fan- en klantdata van PSV.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "typeform",
    name: "Typeform",
    description: "Maak formulieren, enquêtes en quizzen voor fan-onderzoek en registraties.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "xperience-central",
    name: "Xperience Central",
    description: "Beheer en publiceer content op PSV-kanalen via dit CMS-platform.",
    comingSoon: true,
    features: [],
  },
];

export function getToolBySlug(slug: string): KennisbankTool | undefined {
  return kennisbankTools.find((t) => t.slug === slug);
}
