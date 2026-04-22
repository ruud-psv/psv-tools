export interface MailingSummary {
  id: number;
  name: string;
  scheduleTime: string;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
  unsubscribeRate: number;
  clickToOpenRate: number;
}

export interface Totals {
  mailings: number;
  recipients: number;
  opens: number;
  uniqueOpens: number;
  clicks: number;
  uniqueClicks: number;
  bounces: number;
  unsubscriptions: number;
  avgOpenRate: number;
  avgClickRate: number;
  avgBounceRate: number;
  avgUnsubRate: number;
  avgCtor: number;
}

export function buildAnalysisContext(
  mailings: MailingSummary[],
  totals: Totals,
  dateRange: { preset: string; from: string; to: string }
): string {
  const lines: string[] = [];

  const presetLabels: Record<string, string> = {
    "7d": "laatste 7 dagen",
    "30d": "laatste 30 dagen",
    "90d": "laatste 90 dagen",
    "6m": "laatste 6 maanden",
    "1y": "laatste jaar",
  };

  lines.push(`PERIODE: ${presetLabels[dateRange.preset] || dateRange.preset} (${dateRange.from} t/m ${dateRange.to})`);
  lines.push("");

  lines.push("TOTALEN:");
  lines.push(`  Aantal mailings: ${totals.mailings}`);
  lines.push(`  Totaal ontvangers: ${totals.recipients}`);
  lines.push(`  Gem. open rate: ${totals.avgOpenRate.toFixed(1)}%`);
  lines.push(`  Gem. click rate: ${totals.avgClickRate.toFixed(1)}%`);
  lines.push(`  Gem. CTOR: ${totals.avgCtor.toFixed(1)}%`);
  lines.push(`  Gem. bounce rate: ${totals.avgBounceRate.toFixed(1)}%`);
  lines.push(`  Gem. unsub rate: ${totals.avgUnsubRate.toFixed(1)}%`);
  lines.push(`  Totaal unieke opens: ${totals.uniqueOpens}`);
  lines.push(`  Totaal unieke clicks: ${totals.uniqueClicks}`);
  lines.push(`  Totaal bounces: ${totals.bounces}`);
  lines.push(`  Totaal uitschrijvingen: ${totals.unsubscriptions}`);
  lines.push("");

  const sorted = [...mailings].sort(
    (a, b) => new Date(a.scheduleTime).getTime() - new Date(b.scheduleTime).getTime()
  );
  const capped = sorted.slice(0, 50);

  lines.push(`MAILINGS (${capped.length}${mailings.length > 50 ? ` van ${mailings.length}` : ""}):`);
  lines.push("Naam | Datum | Ontvangers | Open% | Click% | Bounce% | Unsub% | CTOR%");
  lines.push("-".repeat(90));
  for (const m of capped) {
    const date = m.scheduleTime ? m.scheduleTime.slice(0, 10) : "—";
    lines.push(
      `${m.name} | ${date} | ${m.recipients} | ${m.openRate.toFixed(1)} | ${m.clickRate.toFixed(1)} | ${m.bounceRate.toFixed(1)} | ${m.unsubscribeRate.toFixed(1)} | ${m.clickToOpenRate.toFixed(1)}`
    );
  }
  lines.push("");

  if (mailings.length >= 3) {
    const byOpen = [...mailings].sort((a, b) => b.openRate - a.openRate);
    lines.push("TOP 3 (open rate):");
    for (const m of byOpen.slice(0, 3)) {
      lines.push(`  ${m.name} — ${m.openRate.toFixed(1)}% open, ${m.clickRate.toFixed(1)}% click`);
    }
    lines.push("BOTTOM 3 (open rate):");
    for (const m of byOpen.slice(-3).reverse()) {
      lines.push(`  ${m.name} — ${m.openRate.toFixed(1)}% open, ${m.clickRate.toFixed(1)}% click`);
    }
    lines.push("");
  }

  if (sorted.length >= 4) {
    const mid = Math.floor(sorted.length / 2);
    const firstHalf = sorted.slice(0, mid);
    const secondHalf = sorted.slice(mid);
    const avgFirst = firstHalf.reduce((s, m) => s + m.openRate, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, m) => s + m.openRate, 0) / secondHalf.length;
    const diff = avgSecond - avgFirst;
    lines.push(`TREND: Open rate eerste helft periode: ${avgFirst.toFixed(1)}%, tweede helft: ${avgSecond.toFixed(1)}% (${diff >= 0 ? "+" : ""}${diff.toFixed(1)}pp)`);

    const avgFirstClick = firstHalf.reduce((s, m) => s + m.clickRate, 0) / firstHalf.length;
    const avgSecondClick = secondHalf.reduce((s, m) => s + m.clickRate, 0) / secondHalf.length;
    const diffClick = avgSecondClick - avgFirstClick;
    lines.push(`TREND: Click rate eerste helft: ${avgFirstClick.toFixed(1)}%, tweede helft: ${avgSecondClick.toFixed(1)}% (${diffClick >= 0 ? "+" : ""}${diffClick.toFixed(1)}pp)`);
    lines.push("");
  }

  if (mailings.length >= 3) {
    const meanOpen = totals.avgOpenRate;
    const variance = mailings.reduce((s, m) => s + Math.pow(m.openRate - meanOpen, 2), 0) / mailings.length;
    lines.push(`SPREIDING: Standaarddeviatie open rate: ${Math.sqrt(variance).toFixed(1)}pp`);
  }

  return lines.join("\n");
}
