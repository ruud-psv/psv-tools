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
  lines.push("");

  const capped = campaigns.slice(0, 50);

  lines.push(`CAMPAGNES (${capped.length}${campaigns.length > 50 ? ` van ${campaigns.length}` : ""}):`);
  lines.push("Naam | Type | Actief | Actief vanaf | Actief t/m | Aangemaakt");
  lines.push("-".repeat(100));

  for (const c of capped) {
    const from = c.active_from ? c.active_from.slice(0, 10) : "—";
    const to = c.active_to ? c.active_to.slice(0, 10) : "—";
    const created = c.created_on ? c.created_on.slice(0, 10) : "—";
    lines.push(`${c.name} | ${c.type} | ${c.active ? "Ja" : "Nee"} | ${from} | ${to} | ${created}`);
  }
  lines.push("");

  const activeNow = campaigns.filter((c) => c.active);
  if (activeNow.length > 0) {
    lines.push(`ACTIEVE CAMPAGNES (${activeNow.length}):`);
    for (const c of activeNow.slice(0, 10)) {
      const to = c.active_to ? ` t/m ${c.active_to.slice(0, 10)}` : "";
      lines.push(`  ${c.name} (${c.type})${to}`);
    }
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
      const activeCount = group.filter((c) => c.active).length;
      lines.push(`  ${type}: ${group.length} campagnes (${activeCount} actief)`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
