import { Headset, Megaphone, ShoppingBag, Sparkles, Ticket, type LucideIcon } from "lucide-react";
import { betaTools, insightTools, knowledgeTools, makeTools } from "@/lib/tools";

/**
 * De indeling van de sidebar: een rail met onderdelen (zoals Teams en Slack),
 * en per onderdeel een paneel met de pagina's eronder. De pagina's zelf
 * (naam, icoon, href) staan in `lib/tools.ts`; hier staat alleen wáár ze
 * hangen. Beta tools krijgen in het paneel een label "Beta".
 *
 * Toegang blijft per pagina geregeld (`lib/access.ts`): een onderdeel zonder
 * pagina's waar je recht op hebt, verschijnt niet in de rail.
 */

export interface NavLink {
  name: string;
  href: string;
  icon: LucideIcon;
  beta: boolean;
}

export interface NavGroup {
  /** Kopje boven de groep in het paneel; zonder titel staat de groep bovenaan. */
  title?: string;
  links: NavLink[];
}

export interface NavSection {
  id: string;
  name: string;
  icon: LucideIcon;
  groups: NavGroup[];
}

interface SectionSpec {
  id: string;
  name: string;
  icon: LucideIcon;
  groups: { title?: string; hrefs: string[] }[];
}

const SPECS: SectionSpec[] = [
  {
    id: "assistent",
    name: "Assistent",
    icon: Sparkles,
    groups: [
      { hrefs: ["/dashboard/assistent", "/dashboard/huisstijl-checker", "/dashboard/kennisbank"] },
    ],
  },
  {
    id: "ticketing",
    name: "Ticketing",
    icon: Ticket,
    groups: [
      { title: "Inzichten", hrefs: ["/dashboard/ticketing-stadion", "/dashboard/ticketing-herdgang"] },
      { title: "Tools", hrefs: ["/dashboard/aangrenzende-stoelen"] },
    ],
  },
  {
    id: "merchandise",
    name: "Merchandise",
    icon: ShoppingBag,
    groups: [{ title: "Inzichten", hrefs: ["/dashboard/fanstore"] }],
  },
  {
    id: "marketing",
    name: "Marketing",
    icon: Megaphone,
    groups: [
      {
        title: "Maken",
        hrefs: [
          "/dashboard/copy-generator",
          "/dashboard/utm-builder",
          "/dashboard/mail-builder",
          "/dashboard/rapportage-generator",
          "/dashboard/kleurplaat",
          "/dashboard/groepsfoto",
        ],
      },
      {
        title: "Inzichten",
        hrefs: [
          "/dashboard/dm-performance",
          "/dashboard/paid-ads",
          "/dashboard/web-verkeer",
          "/dashboard/landingspaginas",
          "/dashboard/database",
        ],
      },
      {
        title: "Data",
        hrefs: ["/dashboard/contact-filter-import", "/dashboard/playable-loader"],
      },
    ],
  },
  {
    id: "fandesk",
    name: "FANdesk",
    icon: Headset,
    groups: [{ title: "Inzichten", hrefs: ["/dashboard/fandesk"] }],
  },
];

const BETA_HREFS = new Set(betaTools.map((t) => t.href));

/** Alle pagina's uit `lib/tools.ts`, op href. */
export const ALL_LINKS: Map<string, NavLink> = new Map(
  [...makeTools, ...knowledgeTools, ...insightTools, ...betaTools].map((t) => [
    t.href,
    {
      // De assistent heet in het paneel "Chat": het onderdeel heet al Assistent.
      name: t.href === "/dashboard/assistent" ? "Chat" : t.name,
      href: t.href,
      icon: t.icon,
      // Kennisbank staat als gewone pagina in de toegangsregels, maar is wel beta.
      beta: BETA_HREFS.has(t.href) || ("badge" in t && t.badge === "Beta"),
    },
  ])
);

export const NAV_SECTIONS: NavSection[] = SPECS.map((spec) => ({
  id: spec.id,
  name: spec.name,
  icon: spec.icon,
  groups: spec.groups.map((g) => ({
    title: g.title,
    links: g.hrefs.map((href) => {
      const link = ALL_LINKS.get(href);
      if (!link) throw new Error(`Onbekende pagina in de navigatie: ${href}`);
      return link;
    }),
  })),
}));

/** De onderdelen met alleen de pagina's waar je recht op hebt; lege groepen en onderdelen vallen weg. */
export function sectionsFor(allowedPages: string[]): NavSection[] {
  return NAV_SECTIONS.map((section) => ({
    ...section,
    groups: section.groups
      .map((g) => ({ ...g, links: g.links.filter((l) => allowedPages.includes(l.href)) }))
      .filter((g) => g.links.length > 0),
  })).filter((s) => s.groups.length > 0);
}

/** Valt `pathname` onder `href` op een segmentgrens? */
export function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Het onderdeel waar `pathname` onder valt, of `null` (zoals op het overzicht). */
export function sectionForPath(sections: NavSection[], pathname: string): NavSection | null {
  return (
    sections.find((s) => s.groups.some((g) => g.links.some((l) => isUnder(pathname, l.href)))) ?? null
  );
}

/** Eerste pagina van een onderdeel: daar kom je uit als je op de rail klikt. */
export function firstHref(section: NavSection): string {
  return section.groups[0].links[0].href;
}
