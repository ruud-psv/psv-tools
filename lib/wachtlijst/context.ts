import type { WaitlistAnalysis } from "./analysis";
import { shownProductIds, type WaitlistData } from "./data";
import type { WaitlistStatus } from "./status";

/**
 * De wachtlijst als tekst voor de assistent: dezelfde cijfers als de pagina
 * Wachtlijst (`buildWaitlistAnalysis`), alleen aantallen. Puur, zodat het te
 * testen is; de tool staat in `lib/assistent/tools.ts`.
 */

export type WachtlijstKeuze = "wachtlijst" | "pre" | "alle";

/** Zoveel dagen per dag in één keer, zoals bij FANdesk. */
export const MAX_DAGEN = 92;
const STANDAARD_DAGEN = 14;
const MAANDEN = 24;
const TOP = 15;

const nl = new Intl.NumberFormat("nl-NL");

/** Welke producten tellen: de wachtlijst zelf (zoals de pagina), de pre wachtlijst, of alles. */
export function productenVoor(data: WaitlistData, keuze: WachtlijstKeuze): string[] | null {
  if (keuze === "alle") return null;
  const getoond = shownProductIds(data);
  if (keuze === "wachtlijst") return getoond;
  const pre = Object.keys(data.products).filter((id) => !getoond.includes(id));
  return pre;
}

function regelsVan(buckets: { label: string; count: number }[]): string {
  return buckets.map((b) => `${b.label}: ${nl.format(b.count)}`).join(", ") || "geen";
}

export function wachtlijstContext(
  analyse: WaitlistAnalysis,
  status: WaitlistStatus,
  opties: { productNamen: string[]; van?: string; tot?: string }
): string {
  const { size, flow, waiting, age, postcode } = analyse;
  const regels = [
    `WACHTLIJST (stand ${analyse.today}; ${opties.productNamen.join(", ") || "alle producten"})`,
    `Nu op de wachtlijst: ${nl.format(size.people)} mensen (${nl.format(size.signups)} inschrijvingen). Ooit op de wachtlijst gestaan: ${nl.format(size.everPeople)}.`,
  ];
  if (size.perProduct.length > 1) {
    regels.push(`Per product: ${size.perProduct.map((p) => `${p.name}: ${nl.format(p.people)} mensen`).join("; ")}.`);
  }

  regels.push(
    "",
    "VERLOOP (erbij = nieuwe inschrijving, eraf = van de wachtlijst af)",
    `Laatste 7 dagen: ${nl.format(flow.last7.joined)} erbij, ${nl.format(flow.last7.left)} eraf. Laatste 30 dagen: ${nl.format(flow.last30.joined)} erbij, ${nl.format(flow.last30.left)} eraf.`,
    `Sinds de eerste inschrijving${flow.firstSignup ? ` (${flow.firstSignup})` : ""}: ${nl.format(flow.joinedTotal)} erbij, ${nl.format(flow.leftTotal)} eraf${
      flow.leftDateEstimated > 0 ? `; van ${nl.format(flow.leftDateEstimated)} keer eraf is de datum geschat` : ""
    }.`,
    "",
    `PER MAAND (laatste ${MAANDEN}): maand | erbij | eraf | omvang aan het eind`,
    ...flow.months.slice(-MAANDEN).map((m) => `${m.month} | ${m.joined} | ${m.left} | ${m.size}`)
  );

  // Per dag: de gevraagde periode, of de laatste twee weken.
  const dagen = flow.days;
  const tot = opties.tot ?? dagen[dagen.length - 1]?.day;
  const gekozen = opties.van
    ? dagen.filter((d) => d.day >= opties.van! && (!tot || d.day <= tot))
    : dagen.slice(-STANDAARD_DAGEN);
  const getoond = gekozen.slice(0, MAX_DAGEN);
  regels.push(
    "",
    `PER DAG ${opties.van ? `van ${opties.van} tot en met ${tot}` : `(laatste ${STANDAARD_DAGEN} dagen)`}: dag | erbij | eraf | omvang aan het eind`,
    ...(getoond.length ? getoond.map((d) => `${d.day} | ${d.joined} | ${d.left} | ${d.size}`) : ["geen dagen in deze periode"])
  );
  if (gekozen.length > getoond.length) regels.push(`(de eerste ${MAX_DAGEN} van ${gekozen.length} dagen; vraag een kortere periode voor de rest)`);

  regels.push(
    "",
    `WACHTTIJD van wie er nu op staat: ${regelsVan(waiting.buckets)}${waiting.medianDays !== null ? `. Mediaan ${nl.format(waiting.medianDays)} dagen` : ""}.`,
    `LEEFTIJD (van ${nl.format(age.known)} bekend, ${nl.format(age.unknown)} onbekend): ${regelsVan(age.buckets)}.${
      age.average !== null ? ` Gemiddeld ${age.average}, mediaan ${age.median}.` : ""
    }${age.averageRecent !== null ? ` Gemiddeld bij wie zich de laatste 90 dagen inschreef: ${age.averageRecent} (${nl.format(age.knownRecent)} mensen).` : ""}`,
    `POSTCODE (van ${nl.format(postcode.known)} bekend, ${nl.format(postcode.unknown)} onbekend): Nederland ${nl.format(postcode.netherlands)}, België ${nl.format(
      postcode.belgium
    )}, Duitsland ${nl.format(postcode.germany)}, overig ${nl.format(postcode.other)}.`,
    `Grootste postcodegebieden (eerste twee cijfers): ${postcode.regions.slice(0, TOP).map((r) => `${r.code}: ${nl.format(r.count)}`).join(", ") || "geen"}.`,
    `Grootste postcodes (vier cijfers): ${postcode.top.slice(0, TOP).map((r) => `${r.code}: ${nl.format(r.count)}`).join(", ") || "geen"}.`
  );

  // Hoe compleet de data is, zodat het antwoord dat kan zeggen.
  const opmerkingen: string[] = [];
  if (!status.salesComplete) opmerkingen.push("de verkoop wordt nog ingelezen; aantallen kunnen nog stijgen");
  if (status.clientsToLookUp > 0) opmerkingen.push(`van ${nl.format(status.clientsToLookUp)} mensen moeten leeftijd en postcode nog worden opgezocht`);
  if (status.lastError) opmerkingen.push(`het laatste inlezen gaf een fout: ${status.lastError}`);
  regels.push(
    "",
    `STAND VAN HET INLEZEN: verkoop bijgewerkt tot ${status.salesCaughtUpAt ?? "onbekend"}, laatste run ${status.lastRunAt ?? "onbekend"}.${
      opmerkingen.length ? ` Let op: ${opmerkingen.join("; ")}.` : ""
    }`
  );
  return regels.join("\n");
}
