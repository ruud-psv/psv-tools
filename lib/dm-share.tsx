import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export interface MailingSummary {
  id: number;
  name: string;
  subject: string;
  scheduleTime: string;
  recipients: number;
  uniqueOpens: number;
  openRate: number;
  uniqueClicks: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
  opens: number;
  clicks: number;
  bounces: number;
  unsubscriptions: number;
  type: string;
  state: string;
}

export interface Totals {
  mailings: number;
  recipients: number;
  uniqueOpens: number;
  avgOpenRate: number;
  uniqueClicks: number;
  avgClickRate: number;
  avgCtor: number;
  bounces: number;
  avgBounceRate: number;
  unsubscriptions: number;
  avgUnsubRate: number;
}

export function formatNumber(n: number) {
  return n.toLocaleString("nl-NL");
}

export function formatPct(n: number) {
  return `${n.toFixed(1)}%`;
}

export function formatEuro(n: number) {
  return `€ ${n.toLocaleString("nl-NL", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** Datum + tijd in Nederlandse notatie, met veilige fallback. */
export function formatDateTime(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return iso; }
}

/** Bepaal het GA-periodebucket (7d/30d/90d) voor een datumbereik. */
export function periodForRange(from: string, to: string): string {
  const days = Math.max(1, Math.round((new Date(to).getTime() - new Date(from).getTime()) / (1000 * 60 * 60 * 24)));
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "90d";
}

export function formatDate(iso: string) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("nl-NL", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch { return iso; }
}

/** Strip DMID-suffix, datumpatronen én achtergebleven " - " separatoren */
export function stripName(name: string): string {
  const MONTHS = "januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec";
  return name
    .replace(/\s*DMID.*/i, "")
    .replace(/\s*\b\d{4}[.\-/]\d{1,2}[.\-/]\d{1,2}\b/g, "")
    .replace(/\s*\b\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/g, "")
    .replace(new RegExp(`\\s*\\b\\d{1,2}\\s+(${MONTHS})\\.?\\s*\\d{0,4}\\b`, "gi"), "")
    .replace(new RegExp(`\\s*\\b(${MONTHS})\\.?\\s+\\d{4}\\b`, "gi"), "")
    .replace(/\s+/g, " ")
    .replace(/(\s*-)+\s*$/, "")
    .replace(/^\s*(-\s*)+/, "")
    .trim() || name;
}

export function getDateRange(preset: string, customFrom?: string, customTo?: string) {
  if (preset === "custom" && customFrom && customTo) return { from: customFrom, to: customTo };
  const now = new Date();
  const to = now.toISOString().slice(0, 10);
  switch (preset) {
    case "7d":  { const d = new Date(now); d.setDate(d.getDate() - 7);   return { from: d.toISOString().slice(0, 10), to }; }
    case "30d": { const d = new Date(now); d.setDate(d.getDate() - 30);  return { from: d.toISOString().slice(0, 10), to }; }
    case "90d": { const d = new Date(now); d.setDate(d.getDate() - 90);  return { from: d.toISOString().slice(0, 10), to }; }
    case "6m":  { const d = new Date(now); d.setMonth(d.getMonth() - 6); return { from: d.toISOString().slice(0, 10), to }; }
    case "1y":  { const d = new Date(now); d.setFullYear(d.getFullYear() - 1); return { from: d.toISOString().slice(0, 10), to }; }
    case "seizoen2425": return { from: "2024-07-01", to: "2025-06-30" };
    case "seizoen2526": {
      const end = new Date(Math.min(new Date("2026-06-30").getTime(), now.getTime()));
      return { from: "2025-07-01", to: end.toISOString().slice(0, 10) };
    }
    default: { const d = new Date(now); d.setDate(d.getDate() - 30); return { from: d.toISOString().slice(0, 10), to }; }
  }
}

export function computeTotals(mailings: MailingSummary[]): Totals {
  if (!mailings.length) return { mailings: 0, recipients: 0, uniqueOpens: 0, avgOpenRate: 0, uniqueClicks: 0, avgClickRate: 0, avgCtor: 0, bounces: 0, avgBounceRate: 0, unsubscriptions: 0, avgUnsubRate: 0 };
  const sum = (k: keyof MailingSummary) => mailings.reduce((a, m) => a + ((m[k] as number) || 0), 0);
  const avg = (k: keyof MailingSummary) => sum(k) / mailings.length;
  return {
    mailings: mailings.length,
    recipients: sum("recipients"),
    uniqueOpens: sum("uniqueOpens"),
    avgOpenRate: avg("openRate"),
    uniqueClicks: sum("uniqueClicks"),
    avgClickRate: avg("clickRate"),
    avgCtor: avg("clickToOpenRate"),
    bounces: sum("bounces"),
    avgBounceRate: avg("bounceRate"),
    unsubscriptions: sum("unsubscriptions"),
    avgUnsubRate: avg("unsubscribeRate"),
  };
}

export function KpiCard({ label, value, sub, icon: Icon, color = "text-psv-red-primary" }: {
  label: string; value: string; sub?: string;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-heading uppercase tracking-wide">{label}</CardTitle>
        <Icon className={`h-5 w-5 ${color}`} />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-heading uppercase">{value}</div>
        {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

export function RateBadge({ rate, thresholds, inverted = false }: {
  rate: number; thresholds: [number, number]; inverted?: boolean;
}) {
  let variant: "destructive" | "warning" | "success" = "success";
  if (inverted) {
    if (rate >= thresholds[0]) variant = "destructive";
    else if (rate >= thresholds[1]) variant = "warning";
  } else {
    if (rate < thresholds[0]) variant = "destructive";
    else if (rate < thresholds[1]) variant = "warning";
  }
  return <Badge variant={variant} className="text-xs tabular-nums">{formatPct(rate)}</Badge>;
}
