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
  roasOf,
  scoreCampaigns,
  totalsOf,
} from "./derive";
import { eur, nl, pct, roas } from "./format";
import { KOOPREDENEN, perKoopreden, TEST_DREMPEL, TESTBUDGET, testOverzicht } from "./methode";
import { PaidAdsResponse, PHASE_LABELS, PLATFORM_LABELS } from "./types";

/** Hoeveel campagnes er maximaal meegaan; genoeg voor patronen, niet meer dan dat. */
const CAMPAIGN_LIMIT = 40;

export function buildPaidAdsContext(data: PaidAdsResponse): string {
  const totals = totalsOf(data.campaigns, data.revenuePlatforms);
  const lines: string[] = [];

  lines.push(`PERIODE: ${data.period.from} t/m ${data.period.to} (dag ${data.period.daysElapsed} van ${data.period.daysTotal})`);
  lines.push(
    `TOTAAL: ${eur(totals.spend)} besteed · ${nl(totals.results)} resultaten · CPA ${eur(totals.costPerResult, 2)} · CTR ${pct(totals.ctr)} · CVR ${pct(totals.cvr)} · CPC ${eur(totals.cpc, 2)} · bereik ${nl(totals.reach)} · weergaven ${nl(totals.impressions)} · frequentie ${nl(totals.frequency, 2)} · conversiewaarde ${eur(totals.revenue)} · ROAS ${roas(totals.roas)}`
  );

  if (data.benchmarks.previousCampaigns) {
    const prev = totalsOf(data.benchmarks.previousCampaigns, data.revenuePlatforms);
    lines.push(
      `VORIGE PERIODE: ${eur(prev.spend)} besteed · ${nl(prev.results)} resultaten · CPA ${eur(prev.costPerResult, 2)} · CTR ${pct(prev.ctr)} · CVR ${pct(prev.cvr)} · ROAS ${roas(prev.roas)}`
    );
  }

  const t = data.targets;
  const targetParts = [
    t.budget != null ? `budget ${eur(t.budget)}` : null,
    t.results != null ? `resultaten ${nl(t.results)}` : null,
    t.costPerResult != null ? `CPA ${eur(t.costPerResult, 2)}` : null,
    t.ctr != null ? `CTR ${pct(t.ctr)}` : null,
    t.roas != null ? `ROAS ${roas(t.roas)}` : null,
  ].filter(Boolean);
  if (targetParts.length) lines.push(`DOELSTELLINGEN: ${targetParts.join(" · ")}`);

  lines.push("", "PER PLATFORM:");
  for (const p of byPlatform(data.campaigns)) {
    lines.push(
      `- ${p.label}: ${eur(p.metrics.spend)} (${nl(p.spendShare, 0)}% van budget) · ${nl(p.metrics.results)} resultaten · CPA ${eur(p.derived.costPerResult, 2)} · CTR ${pct(p.derived.ctr)} · ROAS ${roas(roasOf(data.campaigns.filter((c) => c.platform === p.key), data.revenuePlatforms))}`
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

  // Alleen advertenties die aan staan, of waarvan de status onbekend is.
  const ads = data.ads.filter((a) => a.active !== false);
  const redenen = perKoopreden(ads, data.adSets);
  if (redenen.length) {
    lines.push("", "PER KOOPREDEN (uit de naam van advertentie of set):");
    for (const r of redenen) {
      lines.push(
        `- ${r.label}: ${nl(r.advertenties)} advertenties · ${eur(r.metrics.spend)} · ${nl(r.metrics.results)} resultaten · CPA ${eur(r.derived.costPerResult, 2)} · CTR ${pct(r.derived.ctr)}${r.derived.roas != null ? ` · ROAS ${roas(r.derived.roas)}` : ""}`
      );
    }
    const zonder = KOOPREDENEN.filter((k) => !redenen.some((r) => r.key === k.key)).map((k) => k.label);
    if (zonder.length) lines.push(`Niet gebruikt in deze periode: ${zonder.join(", ")}.`);
  }

  const tests = testOverzicht(ads, data.adSets, data.campaigns);
  lines.push(
    "",
    `TESTEN: ${tests.aandeel != null ? `${nl(tests.aandeel, 0)}%` : "geen"} van het budget naar tests (afspraak ${TESTBUDGET.min}-${TESTBUDGET.max}%), ${nl(tests.rijen.length)} testadvertenties.`
  );
  for (const t of tests.rijen.slice(0, 15)) {
    const oordeel = {
      "te-vroeg": `nog te vroeg, onder € ${TEST_DREMPEL}`,
      beter: "beter dan bewezen",
      slechter: "slechter dan bewezen",
      "geen-vergelijking": "geen bewezen advertenties om mee te vergelijken",
    }[t.oordeel];
    lines.push(
      `- ${t.ad.name}: ${eur(t.ad.metrics.spend)} · ${nl(t.ad.metrics.results)} resultaten · CPA ${eur(t.derived.costPerResult, 2)} tegen ${eur(t.vergelijkCpa, 2)} bewezen · ${oordeel}`
    );
  }

  const topAds = [...ads].sort((a, b) => b.metrics.spend - a.metrics.spend).slice(0, 20);
  if (topAds.length) {
    lines.push("", `ADVERTENTIES (${topAds.length} met de hoogste besteding, alleen die aan staan):`);
    for (const a of topAds) {
      const d = derive(a.metrics);
      lines.push(
        `- ${a.name} | ${PLATFORM_LABELS[a.platform]}${a.format ? ` | ${a.format}` : ""} | ${eur(a.metrics.spend)} · ${nl(a.metrics.results)} resultaten · CPA ${eur(d.costPerResult, 2)} · CTR ${pct(d.ctr)}${d.roas != null ? ` · ROAS ${roas(d.roas)}` : ""}`
      );
    }
  }

  const scored = scoreCampaigns(data.campaigns).slice(0, CAMPAIGN_LIMIT);
  if (scored.length) {
    lines.push("", `CAMPAGNES (${scored.length} van ${data.campaigns.length}, score 0-100 per funnelfase):`);
    for (const c of scored) {
      lines.push(
        `- ${c.name} | ${PLATFORM_LABELS[c.platform]} | ${PHASE_LABELS[c.phase]} | ${c.businessUnit} | ${c.objective} | score ${c.score ?? "n.v.t."} | ${eur(c.metrics.spend)} · ${nl(c.metrics.results)} resultaten · CPA ${eur(c.derived.costPerResult, 2)} · CTR ${pct(c.derived.ctr)} · CVR ${pct(c.derived.cvr)} · frequentie ${nl(c.derived.frequency, 2)}${c.derived.roas != null ? ` · ROAS ${roas(c.derived.roas)}` : ""}`
      );
    }
  }

  if (data.daily.length) {
    lines.push("", "PER DAG (datum · besteed · resultaten):");
    lines.push(data.daily.map((d) => `${d.date} ${eur(d.spend)} ${nl(d.results)}`).join(" | "));
  }

  return lines.join("\n");
}
