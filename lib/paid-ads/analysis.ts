/**
 * Bouwt de tekstcontext die het model krijgt voor de AI-inzichten. Alleen
 * geaggregeerde cijfers — geen advertentie-id's of doelgroepdefinities.
 */

import {
  byAudienceType,
  byFormat,
  byPlatform,
  businessUnitPerformance,
  derive,
  saturation,
  scoreCampaigns,
  sumMetrics,
} from "./derive";
import { eur, nl, pct } from "./format";
import { PaidAdsResponse, PHASE_LABELS, PLATFORM_LABELS } from "./types";

/** Hoeveel campagnes er maximaal meegaan; genoeg voor patronen, niet meer dan dat. */
const CAMPAIGN_LIMIT = 40;

export function buildPaidAdsContext(data: PaidAdsResponse): string {
  const totals = derive(sumMetrics(data.campaigns));
  const lines: string[] = [];

  lines.push(`PERIODE: ${data.period.from} t/m ${data.period.to} (dag ${data.period.daysElapsed} van ${data.period.daysTotal})`);
  lines.push(
    `TOTAAL: ${eur(totals.spend)} besteed · ${nl(totals.results)} resultaten · CPA ${eur(totals.costPerResult, 2)} · CTR ${pct(totals.ctr)} · CVR ${pct(totals.cvr)} · CPC ${eur(totals.cpc, 2)} · bereik ${nl(totals.reach)} · weergaven ${nl(totals.impressions)} · frequentie ${nl(totals.frequency, 2)}`
  );

  if (data.benchmarks.previous) {
    const prev = derive(data.benchmarks.previous);
    lines.push(
      `VORIGE PERIODE: ${eur(prev.spend)} besteed · ${nl(prev.results)} resultaten · CPA ${eur(prev.costPerResult, 2)} · CTR ${pct(prev.ctr)} · CVR ${pct(prev.cvr)}`
    );
  }

  const t = data.targets;
  const targetParts = [
    t.budget != null ? `budget ${eur(t.budget)}` : null,
    t.results != null ? `resultaten ${nl(t.results)}` : null,
    t.costPerResult != null ? `CPA ${eur(t.costPerResult, 2)}` : null,
    t.ctr != null ? `CTR ${pct(t.ctr)}` : null,
  ].filter(Boolean);
  if (targetParts.length) lines.push(`DOELSTELLINGEN: ${targetParts.join(" · ")}`);

  lines.push("", "PER PLATFORM:");
  for (const p of byPlatform(data.campaigns)) {
    lines.push(
      `- ${p.label}: ${eur(p.metrics.spend)} (${nl(p.spendShare, 0)}% van budget) · ${nl(p.metrics.results)} resultaten · CPA ${eur(p.derived.costPerResult, 2)} · CTR ${pct(p.derived.ctr)}`
    );
  }

  const units = businessUnitPerformance(data.campaigns, data.targets);
  if (units.length) {
    lines.push("", "PER EXPLOITATIE:");
    for (const u of units) {
      const target = u.target != null ? ` · doel ${eur(u.target, 2)} · index ${u.index}` : "";
      lines.push(
        `- ${u.label}: ${eur(u.metrics.spend)} · ${nl(u.metrics.results)} resultaten · CPA ${eur(u.derived.costPerResult, 2)}${target}`
      );
    }
  }

  const formats = byFormat(data.ads);
  if (formats.length) {
    lines.push("", "PER FORMAT:");
    for (const f of formats) {
      lines.push(
        `- ${f.label}: ${eur(f.metrics.spend)} · ${nl(f.metrics.results)} resultaten · CTR ${pct(f.derived.ctr)} · CVR ${pct(f.derived.cvr)} · CPA ${eur(f.derived.costPerResult, 2)}`
      );
    }
  }

  const audiences = byAudienceType(data.adSets);
  if (audiences.length) {
    lines.push("", "PER DOELGROEPTYPE:");
    for (const a of audiences) {
      lines.push(
        `- ${a.label}: ${eur(a.metrics.spend)} · CPA ${eur(a.derived.costPerResult, 2)} · CTR ${pct(a.derived.ctr)} · CVR ${pct(a.derived.cvr)}`
      );
    }
  }

  const hot = saturation(data.campaigns).filter((s) => s.tone !== "good");
  if (hot.length) {
    lines.push("", "VERZADIGING (frequentie boven 3,0):");
    for (const s of hot) lines.push(`- ${s.name} (${s.platform}): frequentie ${nl(s.frequency, 2)} — ${s.status}`);
  }

  const scored = scoreCampaigns(data.campaigns).slice(0, CAMPAIGN_LIMIT);
  if (scored.length) {
    lines.push("", `CAMPAGNES (${scored.length} van ${data.campaigns.length}, score 0-100 per funnelfase):`);
    for (const c of scored) {
      lines.push(
        `- ${c.name} | ${PLATFORM_LABELS[c.platform]} | ${PHASE_LABELS[c.phase]} | ${c.businessUnit} | ${c.objective} | score ${c.score ?? "n.v.t."} | ${eur(c.metrics.spend)} · ${nl(c.metrics.results)} resultaten · CPA ${eur(c.derived.costPerResult, 2)} · CTR ${pct(c.derived.ctr)} · CVR ${pct(c.derived.cvr)} · frequentie ${nl(c.derived.frequency, 2)}`
      );
    }
  }

  if (data.daily.length) {
    lines.push("", "PER DAG (datum · besteed · resultaten):");
    lines.push(data.daily.map((d) => `${d.date} ${eur(d.spend)} ${nl(d.results)}`).join(" | "));
  }

  return lines.join("\n");
}
