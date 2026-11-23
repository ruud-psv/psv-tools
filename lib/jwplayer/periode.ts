/**
 * Periodes in JW-datums.
 *
 * JW Player telt dagen in US Eastern (`eastern_date`, UTC-5 in de winter en
 * UTC-4 in de zomer). Een JW-dag loopt voor ons dus van 06.00 tot 06.00 uur
 * (in de zomer, en een paar weken per jaar 05.00 tot 05.00 uur). We rekenen
 * en tonen datums zoals JW ze levert; er wordt nergens omgerekend naar
 * Europe/Amsterdam alsof het om uurdata gaat.
 *
 * De laatste volledige dag (`data_through`) is gisteren in Eastern.
 */

export type Preset = "7d" | "30d" | "90d" | "season";
export const PRESETS: Preset[] = ["7d", "30d", "90d", "season"];

export const PRESET_LABEL: Record<Preset, string> = {
  "7d": "Laatste 7 dagen",
  "30d": "Laatste 30 dagen",
  "90d": "Laatste 90 dagen",
  season: "Dit seizoen",
};

const PRESET_DAGEN: Record<Exclude<Preset, "season">, number> = { "7d": 7, "30d": 30, "90d": 90 };
/** Het langste eigen bereik. */
export const MAX_DAGEN = 3 * 366;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

export const TIJDZONE_NOTITIE =
  "Datums zijn JW-datums (US Eastern). Een JW-dag loopt in Nederland van 06.00 tot 06.00 uur (een paar weken per jaar van 05.00 tot 05.00 uur). De laatste volledige dag is gisteren in US Eastern.";

/** Een fout in de gevraagde periode, die de gebruiker of het model kan herstellen. */
export class PeriodeFout extends Error {}

export interface Periode {
  van: string;
  tot: string;
}

export interface PeriodeKeuze {
  periode: Periode;
  vorige: Periode;
  /** Laatste volledige JW-dag. */
  dataThrough: string;
  label: string;
  preset: Preset | "custom";
}

/** De datum (JJJJ-MM-DD) in US Eastern. */
export function easternDatum(moment: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(moment);
}

export function plusDagen(datum: string, dagen: number): string {
  const d = new Date(`${datum}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dagen);
  return d.toISOString().slice(0, 10);
}

export function plusJaren(datum: string, jaren: number): string {
  const [j, m, d] = datum.split("-").map(Number);
  // 29 februari wordt 28 februari in een gewoon jaar.
  const doel = new Date(Date.UTC(j + jaren, m - 1, 1));
  const laatste = new Date(Date.UTC(j + jaren, m, 0)).getUTCDate();
  doel.setUTCDate(Math.min(d, laatste));
  return doel.toISOString().slice(0, 10);
}

/** Aantal dagen van `van` tot en met `tot`. */
export function aantalDagen(p: Periode): number {
  return Math.round((Date.parse(`${p.tot}T00:00:00Z`) - Date.parse(`${p.van}T00:00:00Z`)) / 86_400_000) + 1;
}

export function dagenIn(p: Periode): string[] {
  const n = aantalDagen(p);
  return Array.from({ length: Math.max(0, n) }, (_, i) => plusDagen(p.van, i));
}

export function laatsteVolledigeDag(nu: Date = new Date()): string {
  return plusDagen(easternDatum(nu), -1);
}

/** Het seizoen van een dag, zoals `2026-27`. Een seizoen loopt van 1 juli tot en met 30 juni. */
export function seizoenVan(datum: string): string {
  const [j, m] = datum.split("-").map(Number);
  const start = m >= 7 ? j : j - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}

export function seizoenStart(datum: string): string {
  return `${seizoenVan(datum).slice(0, 4)}-07-01`;
}

/** De periode direct ervoor, even lang. */
export function vorigePeriode(p: Periode): Periode {
  const tot = plusDagen(p.van, -1);
  return { van: plusDagen(tot, -(aantalDagen(p) - 1)), tot };
}

/** Dezelfde dagen een jaar eerder: voor seizoen tegen seizoen. */
export function jaarEerder(p: Periode): Periode {
  return { van: plusJaren(p.van, -1), tot: plusJaren(p.tot, -1) };
}

function geldigeDatum(d: string): boolean {
  return DATUM.test(d) && !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && new Date(`${d}T00:00:00Z`).toISOString().startsWith(d);
}

export function formatDatumNl(d: string): string {
  const [j, m, dag] = d.split("-").map(Number);
  const maanden = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];
  return `${dag} ${maanden[m - 1]} ${j}`;
}

/**
 * Van invoer (een preset, of `start_date` en `end_date`) naar een periode en
 * de periode om mee te vergelijken. Zonder invoer: de laatste 30 dagen.
 * Een einddatum na de laatste volledige dag wordt daarop afgekapt.
 */
export function kiesPeriode(
  invoer: { preset?: Preset | null; start_date?: string | null; end_date?: string | null },
  nu: Date = new Date()
): PeriodeKeuze {
  const dataThrough = laatsteVolledigeDag(nu);

  if (invoer.start_date || invoer.end_date) {
    const van = invoer.start_date ?? "";
    const tot0 = invoer.end_date ?? dataThrough;
    if (!geldigeDatum(van) || !geldigeDatum(tot0)) throw new PeriodeFout("Geef start_date en end_date als JJJJ-MM-DD.");
    const tot = tot0 > dataThrough ? dataThrough : tot0;
    if (van > tot) throw new PeriodeFout(`start_date ligt na de einddatum (de laatste volledige dag is ${dataThrough}).`);
    const periode = { van, tot };
    if (aantalDagen(periode) > MAX_DAGEN) throw new PeriodeFout(`Hooguit ${MAX_DAGEN} dagen per periode.`);
    return {
      periode,
      vorige: vorigePeriode(periode),
      dataThrough,
      label: `${formatDatumNl(van)} tot en met ${formatDatumNl(tot)}`,
      preset: "custom",
    };
  }

  const preset = invoer.preset ?? "30d";
  if (preset === "season") {
    const periode = { van: seizoenStart(dataThrough), tot: dataThrough };
    return {
      periode,
      vorige: jaarEerder(periode),
      dataThrough,
      label: `Seizoen ${seizoenVan(dataThrough)} tot nu`,
      preset,
    };
  }
  const dagen = PRESET_DAGEN[preset];
  if (!dagen) throw new PeriodeFout(`Onbekende preset "${preset}". Kies uit ${PRESETS.join(", ")}.`);
  const periode = { van: plusDagen(dataThrough, -(dagen - 1)), tot: dataThrough };
  return { periode, vorige: vorigePeriode(periode), dataThrough, label: PRESET_LABEL[preset], preset };
}

/** Delta in procenten (afgerond op één decimaal), of `null` als er niets te vergelijken is. */
export function deltaPct(nu: number | null | undefined, vorig: number | null | undefined): number | null {
  if (nu == null || vorig == null || !Number.isFinite(nu) || !Number.isFinite(vorig) || vorig === 0) return null;
  return Math.round(((nu - vorig) / vorig) * 1000) / 10;
}

/** Splitst een periode in stukken van hooguit `max` dagen. */
export function splitsPeriode(p: Periode, max: number): Periode[] {
  const delen: Periode[] = [];
  let van = p.van;
  while (van <= p.tot) {
    const tot0 = plusDagen(van, max - 1);
    const tot = tot0 > p.tot ? p.tot : tot0;
    delen.push({ van, tot });
    van = plusDagen(tot, 1);
  }
  return delen;
}
