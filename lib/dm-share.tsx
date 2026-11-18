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

export { getDateRange, stripName } from "@/lib/dm-scope";

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
