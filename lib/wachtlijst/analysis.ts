/**
 * De analyse van de wachtlijst: omvang, verloop, leeftijd en postcode.
 *
 * Eenheid is de persoon. Iemand staat op de wachtlijst zolang hij een geldende
 * inschrijving heeft. Meerdere regels van dezelfde persoon die op elkaar
 * aansluiten (een gewijzigde of doorgezette inschrijving) tellen als één
 * periode, zodat een wijziging geen uitstroom en instroom op dezelfde dag geeft.
 *
 * De stand van vandaag is hard: het aantal mensen met een geldende regel. Het
 * verloop is daaruit teruggerekend:
 *
 * - **instroom** op de datum van de eerste inschrijfregel (`transaction_date`);
 * - **uitstroom** op de datum van de retour- of annuleringsregel van die
 *   inschrijving, en als die er niet is op de dag dat de regel voor het laatst
 *   gewijzigd is (`last_touched_at`). Dat laatste is een benadering.
 *
 * Puur: geen opslag en geen netwerk.
 */

import { isActiveRow, isSignupRow, type WaitlistData } from "./data";

export interface MonthPoint {
  /** `YYYY-MM`. */
  month: string;
  joined: number;
  left: number;
  /** Aantal mensen op de wachtlijst aan het eind van de maand. */
  size: number;
}

export interface DayPoint {
  /** `YYYY-MM-DD`. */
  day: string;
  joined: number;
  left: number;
  /** Aantal mensen op de wachtlijst aan het eind van de dag. */
  size: number;
}

export interface Bucket {
  label: string;
  count: number;
}

export interface PostcodeArea {
  code: string;
  count: number;
}

export interface WaitlistAnalysis {
  today: string;
  size: {
    people: number;
    /** Geldende inschrijvingen; meer dan `people` als iemand er meerdere heeft. */
    signups: number;
    /** Mensen die ooit op de wachtlijst stonden, ook wie er weer af is. */
    everPeople: number;
    perProduct: { productId: string; name: string; people: number; signups: number }[];
  };
  flow: {
    months: MonthPoint[];
    /** Elke dag vanaf de eerste inschrijving tot en met vandaag. */
    days: DayPoint[];
    last7: { joined: number; left: number };
    last30: { joined: number; left: number };
    /** Alle instroom sinds de eerste inschrijving. */
    joinedTotal: number;
    firstSignup: string | null;
    /** Uitstroom waarvan de datum uit `last_touched_at` komt in plaats van een retourregel. */
    leftDateEstimated: number;
    leftTotal: number;
  };
  /** Hoe lang de mensen die er nu op staan al wachten. */
  waiting: { buckets: Bucket[]; medianDays: number | null };
  age: {
    buckets: Bucket[];
    known: number;
    unknown: number;
    average: number | null;
    median: number | null;
    /** Gemiddelde leeftijd van wie zich in de laatste 90 dagen inschreef. */
    averageRecent: number | null;
    knownRecent: number;
  };
  postcode: {
    known: number;
    netherlands: number;
    belgium: number;
    germany: number;
    other: number;
    unknown: number;
    /** Per postcodegebied (eerste twee cijfers), grootste eerst. */
    regions: PostcodeArea[];
    /** De grootste postcodes op vier cijfers. */
    top: PostcodeArea[];
    distinct: number;
  };
  quality: {
    rows: number;
    saleTypes: Record<string, number>;
    rowsWithoutOwner: number;
    /** Mensen op de wachtlijst die (nog) niet in de klantgegevens gevonden zijn. */
    peopleWithoutClient: number;
  };
}

interface Interval {
  start: string;
  /** `null`: staat er nu nog op. */
  end: string | null;
  estimated: boolean;
}

const AGE_BUCKETS: [label: string, from: number, to: number][] = [
  ["0-11", 0, 11],
  ["12-17", 12, 17],
  ["18-24", 18, 24],
  ["25-34", 25, 34],
  ["35-44", 35, 44],
  ["45-54", 45, 54],
  ["55-64", 55, 64],
  ["65+", 65, 200],
];

const YEAR_BUCKETS: [label: string, fromDays: number, toDays: number][] = [
  ["< 3 maanden", 0, 90],
  ["3-12 maanden", 91, 365],
  ["1-2 jaar", 366, 730],
  ["2-3 jaar", 731, 1095],
  ["3-5 jaar", 1096, 1826],
  ["5+ jaar", 1827, Infinity],
];

/**
 * De groepen voor de wachttijd. Bestaat de wachtlijst korter dan een jaar, dan
 * per maand (dertig dagen); met jaargroepen zou bijna iedereen in dezelfde
 * groep vallen.
 */
function waitingBuckets(longestDays: number): [label: string, fromDays: number, toDays: number][] {
  if (longestDays > 365) return YEAR_BUCKETS;
  const count = Math.max(Math.ceil((longestDays + 1) / 30), 1);
  return Array.from({ length: count }, (_, index) => [
    index === 0 ? "< 1 maand" : `${index}-${index + 1} mnd`,
    index * 30,
    index === count - 1 ? Infinity : index * 30 + 29,
  ]);
}

function shiftDay(day: string, days: number): string {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000);
}

function nextMonth(month: string): string {
  const [year, index] = month.split("-").map(Number);
  return index === 12 ? `${year + 1}-01` : `${year}-${String(index + 1).padStart(2, "0")}`;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

/** De periodes van één persoon, aaneengesloten periodes samengevoegd. */
function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start.localeCompare(b.start));
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const last = merged[merged.length - 1];
    // Sluit aan als de volgende begint op of vóór de dag na het einde.
    if (last && (last.end === null || interval.start <= shiftDay(last.end, 1))) {
      if (last.end !== null && (interval.end === null || interval.end > last.end)) {
        last.end = interval.end;
        last.estimated = interval.estimated;
      }
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

export function buildWaitlistAnalysis(
  data: WaitlistData,
  today: string,
  /** Alleen deze producten; `null` is alles. */
  productIds: readonly string[] | null = null
): WaitlistAnalysis {
  const only = productIds ? new Set(productIds) : null;
  const saleTypes: Record<string, number> = {};
  let rowCount = 0;
  let rowsWithoutOwner = 0;

  // 1. Regels per inschrijving (`product_item_id`).
  const items = new Map<string, { product: string; owner: string; rows: (typeof data.rows)[string][] }>();
  for (const row of Object.values(data.rows)) {
    if (only && !only.has(row[0])) continue;
    rowCount++;
    saleTypes[row[4] || "(leeg)"] = (saleTypes[row[4] || "(leeg)"] ?? 0) + 1;
    if (!row[2]) rowsWithoutOwner++;
    const key = `${row[0]}|${row[1]}`;
    const item = items.get(key) ?? { product: row[0], owner: "", rows: [] };
    item.rows.push(row);
    // De eigenaar van de geldende regel wint; anders de eerste die er een heeft.
    if (row[2] && (!item.owner || isActiveRow(row))) item.owner = row[2];
    items.set(key, item);
  }

  // 2. Per inschrijving één periode; per persoon samengevoegd.
  const people = new Map<string, Interval[]>();
  const perProduct = new Map<string, { people: Set<string>; signups: number }>();
  let signups = 0;
  for (const [key, item] of items) {
    const signupDays = item.rows.filter((row) => isSignupRow(row) && row[3]).map((row) => row[3]);
    if (!signupDays.length) continue;
    const start = signupDays.reduce((a, b) => (a < b ? a : b));
    const active = item.rows.some(isActiveRow);

    let end: string | null = null;
    let estimated = false;
    if (!active) {
      const closing = item.rows.filter((row) => !isSignupRow(row) && row[3] >= start).map((row) => row[3]);
      if (closing.length) {
        end = closing.reduce((a, b) => (a > b ? a : b));
      } else {
        const touched = item.rows.map((row) => row[6]).filter((day) => day >= start);
        end = touched.length ? touched.reduce((a, b) => (a > b ? a : b)) : start;
        estimated = true;
      }
      if (end > today) end = today;
    }

    const person = item.owner || `item:${key}`;
    people.set(person, [...(people.get(person) ?? []), { start, end, estimated }]);
    if (active) {
      signups++;
      const product = perProduct.get(item.product) ?? { people: new Set<string>(), signups: 0 };
      product.people.add(person);
      product.signups++;
      perProduct.set(item.product, product);
    }
  }

  // 3. Verloop per dag, en wie er nu op staat.
  const joinedOn = new Map<string, number>();
  const leftOn = new Map<string, number>();
  const current: { person: string; since: string }[] = [];
  let leftTotal = 0;
  let leftDateEstimated = 0;
  let firstSignup: string | null = null;
  for (const [person, intervals] of people) {
    for (const interval of mergeIntervals(intervals)) {
      joinedOn.set(interval.start, (joinedOn.get(interval.start) ?? 0) + 1);
      if (!firstSignup || interval.start < firstSignup) firstSignup = interval.start;
      if (interval.end === null) {
        current.push({ person, since: interval.start });
      } else {
        leftOn.set(interval.end, (leftOn.get(interval.end) ?? 0) + 1);
        leftTotal++;
        if (interval.estimated) leftDateEstimated++;
      }
    }
  }

  const months: MonthPoint[] = [];
  if (firstSignup) {
    const byMonth = (counts: Map<string, number>) => {
      const result = new Map<string, number>();
      for (const [day, count] of counts) result.set(day.slice(0, 7), (result.get(day.slice(0, 7)) ?? 0) + count);
      return result;
    };
    const joinedMonth = byMonth(joinedOn);
    const leftMonth = byMonth(leftOn);
    let size = 0;
    for (let month = firstSignup.slice(0, 7); month <= today.slice(0, 7); month = nextMonth(month)) {
      const joined = joinedMonth.get(month) ?? 0;
      const left = leftMonth.get(month) ?? 0;
      size += joined - left;
      months.push({ month, joined, left, size });
    }
  }

  const window = (fromExclusive: string, toInclusive: string) => {
    const sum = (counts: Map<string, number>) => {
      let total = 0;
      for (const [day, count] of counts) if (day > fromExclusive && day <= toInclusive) total += count;
      return total;
    };
    return { joined: sum(joinedOn), left: sum(leftOn) };
  };
  const days: DayPoint[] = [];
  if (firstSignup) {
    let size = 0;
    for (let day = firstSignup; day <= today; day = shiftDay(day, 1)) {
      const joined = joinedOn.get(day) ?? 0;
      const left = leftOn.get(day) ?? 0;
      size += joined - left;
      days.push({ day, joined, left, size });
    }
  }
  const recentFrom = shiftDay(today, -90);

  // 4. Wachttijd, leeftijd en postcode van wie er nu op staat.
  const waitingDays = current.map(({ since }) => Math.max(daysBetween(since, today), 0));
  const thisYear = Number(today.slice(0, 4));
  const ages: number[] = [];
  const agesRecent: number[] = [];
  const pc4 = new Map<string, number>();
  const pc2 = new Map<string, number>();
  const postcode = { known: 0, netherlands: 0, belgium: 0, germany: 0, other: 0, unknown: 0 };
  let peopleWithoutClient = 0;
  for (const { person, since } of current) {
    const client = data.clients[person];
    if (!client) peopleWithoutClient++;

    const year = client?.[0] ?? null;
    if (year !== null) {
      ages.push(thisYear - year);
      if (since > recentFrom) agesRecent.push(thisYear - year);
    }

    const code = client?.[1] ?? "";
    if (!code) postcode.unknown++;
    else {
      postcode.known++;
      if (code === "BE") postcode.belgium++;
      else if (code === "DE") postcode.germany++;
      else if (code === "XX") postcode.other++;
      else {
        postcode.netherlands++;
        pc4.set(code, (pc4.get(code) ?? 0) + 1);
        pc2.set(code.slice(0, 2), (pc2.get(code.slice(0, 2)) ?? 0) + 1);
      }
    }
  }
  const ranked = (counts: Map<string, number>): PostcodeArea[] =>
    [...counts].map(([code, count]) => ({ code, count })).sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));

  return {
    today,
    size: {
      people: current.length,
      signups,
      everPeople: people.size,
      perProduct: [...perProduct]
        .map(([id, product]) => ({
          productId: id,
          name: data.products[id]?.name ?? id,
          people: product.people.size,
          signups: product.signups,
        }))
        .sort((a, b) => b.people - a.people),
    },
    flow: {
      months,
      days,
      last7: window(shiftDay(today, -7), today),
      last30: window(shiftDay(today, -30), today),
      joinedTotal: [...joinedOn.values()].reduce((sum, count) => sum + count, 0),
      firstSignup,
      leftDateEstimated,
      leftTotal,
    },
    waiting: {
      buckets: waitingBuckets(Math.max(0, ...waitingDays)).map(([label, from, to]) => ({
        label,
        count: waitingDays.filter((days) => days >= from && days <= to).length,
      })),
      medianDays: median(waitingDays),
    },
    age: {
      buckets: AGE_BUCKETS.map(([label, from, to]) => ({
        label,
        count: ages.filter((age) => age >= from && age <= to).length,
      })),
      known: ages.length,
      unknown: current.length - ages.length,
      average: average(ages),
      median: median(ages),
      averageRecent: average(agesRecent),
      knownRecent: agesRecent.length,
    },
    postcode: {
      ...postcode,
      regions: ranked(pc2),
      top: ranked(pc4).slice(0, 25),
      distinct: pc4.size,
    },
    quality: { rows: rowCount, saleTypes, rowsWithoutOwner, peopleWithoutClient },
  };
}
