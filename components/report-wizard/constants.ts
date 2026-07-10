import { Mail, Ticket, Globe, ShoppingBag } from "lucide-react";
import type { PeriodConfig } from "@/lib/reports";

export type SourceKey = "dm" | "ticketing" | "web" | "fanstore";

export interface PresetOption {
  value: string;
  label: string;
}

/** Alle bekende periode-labels (voor weergave in samenvatting en deelpagina). */
export const PERIOD_LABELS: Record<string, string> = {
  current: "Actuele status",
  "7d": "Laatste 7 dagen",
  "30d": "Laatste 30 dagen",
  "90d": "Laatste 90 dagen",
  "6m": "Laatste 6 maanden",
  "1y": "Laatste jaar",
  seizoen2425: "Seizoen 2024/25",
  seizoen2526: "Seizoen 2025/26",
  custom: "Aangepaste periode",
};

/** Presets per bron — alleen wat de databron daadwerkelijk kan leveren. */
export const PRESETS_BY_SOURCE: Record<SourceKey, PresetOption[]> = {
  dm: [
    { value: "7d", label: "7 dagen" },
    { value: "30d", label: "30 dagen" },
    { value: "90d", label: "90 dagen" },
    { value: "6m", label: "6 maanden" },
    { value: "1y", label: "1 jaar" },
    { value: "seizoen2425", label: "Seizoen 24/25" },
    { value: "seizoen2526", label: "Seizoen 25/26" },
    { value: "custom", label: "Aangepast" },
  ],
  web: [
    { value: "7d", label: "7 dagen" },
    { value: "30d", label: "30 dagen" },
    { value: "90d", label: "90 dagen" },
  ],
  fanstore: [
    { value: "7d", label: "7 dagen" },
    { value: "30d", label: "30 dagen" },
    { value: "90d", label: "90 dagen" },
    { value: "6m", label: "6 maanden" },
    { value: "1y", label: "1 jaar" },
    { value: "custom", label: "Aangepast" },
  ],
  // Ticketing: actuele status of snapshot-gedekte periode (max 30d retentie).
  ticketing: [
    { value: "current", label: "Actuele status" },
    { value: "7d", label: "Laatste 7 dagen" },
    { value: "30d", label: "Laatste 30 dagen" },
  ],
};

export const SOURCE_ALLOWS_CUSTOM: Record<SourceKey, boolean> = {
  dm: true,
  web: false,
  fanstore: true,
  ticketing: false,
};

export const WEB_SITES: PresetOption[] = [
  { value: "psv", label: "psv.nl" },
  { value: "ticketshop", label: "ticketshop.psv.nl" },
  { value: "fanstore", label: "psvfanstore.nl" },
  { value: "acties", label: "acties.psv.nl" },
];

export const TICKET_CATEGORIES: PresetOption[] = [
  { value: "all", label: "Alle categorieën" },
  { value: "Wedstrijden", label: "Wedstrijden" },
  { value: "Tours", label: "Tours" },
  { value: "Museum", label: "Museum" },
  { value: "Jeugd", label: "Jeugd" },
  { value: "Evenementen", label: "Evenementen" },
];

export interface SourceMeta {
  key: SourceKey;
  label: string;
  short: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const SOURCE_META: SourceMeta[] = [
  {
    key: "dm",
    label: "DM Performance",
    short: "DM",
    description: "Mailings, open rates, click rates en uitschrijvingen uit Maileon.",
    icon: Mail,
  },
  {
    key: "ticketing",
    label: "Ticketing",
    short: "Ticketing",
    description: "Verkoop en beschikbaarheid van events uit de ticketshop.",
    icon: Ticket,
  },
  {
    key: "web",
    label: "Web verkeer",
    short: "Web",
    description: "Sessies, gebruikers en pageviews uit Google Analytics.",
    icon: Globe,
  },
  {
    key: "fanstore",
    label: "Fanstore",
    short: "Fanstore",
    description: "Omzet, transacties en productverkoop uit de PSV Fanstore.",
    icon: ShoppingBag,
  },
];

/** Leesbaar periode-label voor weergave (samenvatting, deelpagina-subtitle). */
export function periodLabel(period: PeriodConfig | undefined): string {
  if (!period) return PERIOD_LABELS.current;
  if (period.preset === "custom" && period.from && period.to) {
    return `${period.from} t/m ${period.to}`;
  }
  return PERIOD_LABELS[period.preset] ?? period.preset;
}
