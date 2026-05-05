import type { Campaign, PlayableTotals } from "@/app/api/playable/route";

export type { Campaign, PlayableTotals };

export function buildPlayableContext(
  campaigns: Campaign[],
  totals: PlayableTotals
): string {
  const lines: string[] = [];

  lines.push("OVERZICHT:");
  lines.push(`  Totaal campagnes: ${totals.total}`);
  lines.push(`  Actief: ${totals.active}`);
  lines.push(`  Inactief: ${totals.inactive}`);
  lines.push(`  Totaal sessies: ${totals.totalSessions}`);
  lines.push(`  Totaal registraties: ${totals.totalRegistrations}`);
  lines.push(`  Gem. conversie: ${totals.avgConversionRate.toFixed(1)}%`);
  lines.push("");

  const capped = campaigns.slice(0, 50);

  lines.push(`CAMPAGNES (${capped.length}${campaigns.length > 50 ? ` van ${campaigns.length}` : ""}):`);
  lines.push("Naam | Type | Actief | Actief vanaf | Actief t/m | Sessies | Registraties | Conversie%");
  lines.push("-".repeat(110));

  for (const c of capped) {
    const from = c.active_from ? c.active_from.slice(0, 10) : "—";
    const to = c.active_to ? c.active_to.slice(0, 10) : "—";
    lines.push(
      `${c.name} | ${c.type} | ${c.active ? "Ja" : "Nee"} | ${from} | ${to} | ${c.sessions} | ${c.registrations} | ${c.conversionRate.toFixed(1)}`
    );
  }
  lines.push("");

  if (campaigns.length >= 3) {
    const bySessions = [...campaigns].sort((a, b) => b.sessions - a.sessions);
    lines.push("TOP 3 (sessies):");
    for (const c of bySessions.slice(0, 3)) {
      lines.push(`  ${c.name} — ${c.sessions} sessies, ${c.registrations} registraties (${c.conversionRate.toFixed(1)}% conversie)`);
    }
    lines.push("");

    const byConversion = campaigns.filter((c) => c.sessions >= 10).sort((a, b) => b.conversionRate - a.conversionRate);
    if (byConversion.length >= 3) {
      lines.push("TOP 3 (conversie%, min. 10 sessies):");
      for (const c of byConversion.slice(0, 3)) {
        lines.push(`  ${c.name} — ${c.conversionRate.toFixed(1)}% conversie (${c.sessions} sessies)`);
      }
      lines.push("LAAGSTE 3 (conversie%):");
      for (const c of byConversion.slice(-3).reverse()) {
        lines.push(`  ${c.name} — ${c.conversionRate.toFixed(1)}% conversie (${c.sessions} sessies)`);
      }
      lines.push("");
    }
  }

  const activeNow = campaigns.filter((c) => c.active);
  if (activeNow.length > 0) {
    const activeSessions = activeNow.reduce((s, c) => s + c.sessions, 0);
    const activeRegistrations = activeNow.reduce((s, c) => s + c.registrations, 0);
    lines.push(`ACTIEVE CAMPAGNES: ${activeNow.length} campagnes, ${activeSessions} sessies, ${activeRegistrations} registraties`);
    lines.push("");
  }

  const typeGroups = new Map<string, Campaign[]>();
  for (const c of campaigns) {
    const group = typeGroups.get(c.type) ?? [];
    group.push(c);
    typeGroups.set(c.type, group);
  }
  if (typeGroups.size > 1) {
    lines.push("PER TYPE:");
    for (const [type, group] of typeGroups) {
      const sessions = group.reduce((s, c) => s + c.sessions, 0);
      const regs = group.reduce((s, c) => s + c.registrations, 0);
      const conv = sessions > 0 ? (regs / sessions) * 100 : 0;
      lines.push(`  ${type}: ${group.length} campagnes, ${sessions} sessies, ${conv.toFixed(1)}% gem. conversie`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
