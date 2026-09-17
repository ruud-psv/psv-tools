import {
  BarChart2,
  BookOpen,
  ClipboardCheck,
  FileText,
  Globe,
  Headset,
  LayoutDashboard,
  LayoutTemplate,
  Link2,
  Mail,
  MailPlus,
  Megaphone,
  Palette,
  ShoppingBag,
  Ticket,
  type LucideIcon,
} from "lucide-react";

/**
 * De ingangen van PSV Tools op één plek. De sidebar gebruikt `name` (kort, past
 * naast een icoon), het dashboard gebruikt `title` + `description` (de vraag
 * "waar kan Tools je mee helpen?" beantwoord je met een handeling, niet met een
 * productnaam). Zo kan er geen ingang bijkomen die maar op één plek opduikt.
 */
export interface ToolEntry {
  /** Label in de sidebar. */
  name: string;
  /** Handeling op de dashboardkaart. */
  title: string;
  /** Subtekst op de dashboardkaart — één zin, wat je er doet. */
  description: string;
  href: string;
  icon: LucideIcon;
  badge?: string;
}

export interface ToolGroup {
  /** Kop boven de kaarten op het dashboard én boven de sidebar-sectie. */
  label: string;
  /** Toelichting onder de groepskop op het dashboard. */
  intro: string;
  entries: ToolEntry[];
}

/** Navigatie-items die geen ingang zijn maar wel in de sidebar staan. */
export const navItems = [
  {
    name: "Overzicht",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
];

export const makeTools: ToolEntry[] = [
  {
    name: "Mail tekst generator",
    title: "Mail tekst schrijven",
    description:
      "Genereer e-mailcopy of een partnermailing met AI, in de PSV-tone-of-voice.",
    href: "/dashboard/copy-generator",
    icon: FileText,
  },
  {
    name: "UTM Builder",
    title: "UTM link aanmaken",
    description:
      "Bouw een getagde campagnelink volgens de taxonomie en bewaar hem voor later.",
    href: "/dashboard/utm-builder",
    icon: Link2,
  },
  {
    name: "Mail Builder",
    title: "Mail bouwen",
    description:
      "Zet een Maileon-mail in elkaar met kant-en-klare templates en huisstijlblokken.",
    href: "/dashboard/mail-builder",
    icon: MailPlus,
  },
  {
    name: "Huisstijl Checker",
    title: "Tekst op huisstijl checken",
    description:
      "Laat je tekst controleren en corrigeren op basis van Het Rood-Witte Boekje.",
    href: "/dashboard/huisstijl-checker",
    icon: ClipboardCheck,
  },
  {
    name: "Rapportage generator",
    title: "Rapportage samenstellen",
    description:
      "Combineer inzichten tot één live rapportage en deel een link die zichzelf ververst.",
    href: "/dashboard/rapportage-generator",
    icon: BarChart2,
  },
  {
    name: "Kleurplaat Creator",
    title: "Kleurplaat maken",
    description:
      "Maak een gepersonaliseerde kleurplaat met Phoxy in de hoofdrol en download hem als PNG.",
    href: "/dashboard/kleurplaat",
    icon: Palette,
    badge: "Beta",
  },
];

export const knowledgeTools: ToolEntry[] = [
  {
    name: "Kennisbank",
    title: "Kennisbank doorzoeken",
    description:
      "Stel een vraag over de tools, processen en afspraken binnen PSV Marketing.",
    href: "/dashboard/kennisbank",
    icon: BookOpen,
  },
];

export const insightTools: ToolEntry[] = [
  {
    name: "Paid Ads",
    title: "Paid ads analyseren",
    description:
      "Meta, TikTok, Google Ads en LinkedIn, opgesplitst naar bereik, verkeer en conversie.",
    href: "/dashboard/paid-ads",
    icon: Megaphone,
  },
  {
    name: "Ticket Inzichten",
    title: "Ticketverkoop volgen",
    description:
      "Real-time beschikbaarheid voor wedstrijden, tours, museum en andere evenementen.",
    href: "/dashboard/ticket-inzichten",
    icon: Ticket,
  },
  {
    name: "Wedstrijdverkoop",
    title: "Wedstrijden vergelijken",
    description:
      "Verkoop per dag tot de aftrap, afgezet tegen andere wedstrijden of vorig seizoen.",
    href: "/dashboard/ticket-inzichten-new",
    icon: Ticket,
    badge: "Ringside",
  },
  {
    name: "DM Performance",
    title: "DM performance bekijken",
    description:
      "Open rates, click rates en KPI's per mailing uit Maileon.",
    href: "/dashboard/dm-performance",
    icon: Mail,
  },
  {
    name: "Web Verkeer",
    title: "Web verkeer bekijken",
    description:
      "Sessies, gebruikers en verkeersbronnen van de PSV-websites via Google Analytics.",
    href: "/dashboard/web-verkeer",
    icon: Globe,
  },
  {
    name: "Landingspagina's",
    title: "Landingspagina's meten",
    description:
      "Sessies, registraties en conversies per interactieve campagne in Playable.",
    href: "/dashboard/landingspaginas",
    icon: LayoutTemplate,
  },
  {
    name: "FANstore",
    title: "FANstore omzet bekijken",
    description:
      "Webshopomzet, transacties en best verkochte producten uit de FANstore.",
    href: "/dashboard/fanstore",
    icon: ShoppingBag,
  },
  {
    name: "FANdesk",
    title: "Supportvragen bekijken",
    description:
      "Hoeveel tickets er binnenkomen, waar ze over gaan en op welke momenten.",
    href: "/dashboard/fandesk",
    icon: Headset,
  },
];


/** De groepen zoals het dashboard ze toont, in volgorde. */
export const toolGroups: ToolGroup[] = [
  {
    label: "Maken",
    intro: "Schrijven, bouwen en controleren.",
    entries: makeTools,
  },
  {
    label: "Opzoeken",
    intro: "Alles wat we hebben vastgelegd, doorzoekbaar.",
    entries: knowledgeTools,
  },
  {
    label: "Inzichten",
    intro: "De cijfers achter onze campagnes, kanalen en verkoop.",
    entries: insightTools,
  },
];
