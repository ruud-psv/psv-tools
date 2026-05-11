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
    description: "Projectmanagementtool voor het plannen, toewijzen en bijhouden van taken en campagnes.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "azerion",
    name: "Azerion",
    description: "Gaming- en advertentieplatform voor branded content en display advertising.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "blueconic",
    name: "BlueConic",
    description: "Customer Data Platform (CDP) voor het verzamelen en activeren van first-party data.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "custom-landingspaginas",
    name: "Custom landingspagina's",
    description: "Zelf gebouwde landingspagina's voor campagnes, acties en evenementen.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "figma",
    name: "Figma",
    description: "Design- en prototypingtool voor het maken van visuele ontwerpen en mockups.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "google-ads",
    name: "Google Ads",
    description: "Betaald zoekadverteren en display campagnes via het Google-netwerk.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "jw-player",
    name: "JW Player",
    description: "Videospeler en streamingplatform voor het hosten en publiceren van videocontent.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "linkedin-ads",
    name: "LinkedIn Ads",
    description: "B2B-adverteren op LinkedIn voor het bereiken van zakelijke doelgroepen.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "maileon",
    name: "Maileon",
    description: "E-mailmarketingplatform voor nieuwsbrieven, transactionele e-mails en geautomatiseerde campagnes.",
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
            "Gekoppeld met het CRM van PSV Business. Contactfilters kunnen worden gemaakt op basis van velden die ook in het CRM terugkomen.",
          ],
          [
            "PSV Campaigns",
            "Account voor campagnes van PSV, directe communicatie. Hoeft niet te wachten op de nachtelijke verwerking.",
          ],
          [
            "PSV Operational",
            "Leeg account waar lijsten handmatig kunnen worden ingevoerd, zoals personeel of Business-leden.",
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
    ],
    tips: [
      {
        type: "note",
        text: "In het PSV-account kun je doelgroepen laten doorzetten vanuit TwoCircles. Lees meer hierover in de TwoCircles-kennisbank.",
      },
    ],
  },
  {
    slug: "meta-ads",
    name: "Meta Ads",
    description: "Adverteren op Facebook en Instagram via Meta's advertentieplatform.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "n8n",
    name: "n8n",
    description: "Workflow-automatiseringstool voor het koppelen van apps en automatiseren van processen.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "playable",
    name: "Playable",
    description: "Platform voor het maken van interactieve en speelbare advertenties.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "tiktok-ads",
    name: "TikTok Ads",
    description: "Adverteren op TikTok voor het bereiken van een jong en betrokken publiek.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "twocircles",
    name: "TwoCircles",
    description: "Data- en ticketingplatform voor het beheren van fan- en klantdata.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "typeform",
    name: "Typeform",
    description: "Tool voor het maken van formulieren, enquêtes, quizzen en registraties.",
    comingSoon: true,
    features: [],
  },
  {
    slug: "xperience-central",
    name: "Xperience Central",
    description: "CMS-platform voor het beheren en publiceren van content op PSV-kanalen.",
    comingSoon: true,
    features: [],
  },
];

export function getToolBySlug(slug: string): KennisbankTool | undefined {
  return kennisbankTools.find((t) => t.slug === slug);
}
