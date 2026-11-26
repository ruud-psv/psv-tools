/**
 * Datums voor Active & Engaged Fans. Een dag en een maand lopen in Nederlandse
 * tijd: een klik om 00.30 uur op 1 november hoort bij november, ook al is het
 * dan in UTC nog 31 oktober.
 *
 * Datums zijn strings (`JJJJ-MM-DD`, maanden `JJJJ-MM`): die sorteren en
 * vergelijken goed, en zomertijd speelt er geen rol in.
 */

import { plusDagen } from "../jwplayer/periode";

export { plusDagen };

const DAG = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Amsterdam",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

const OFFSET = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", timeZoneName: "longOffset" });

/** De Nederlandse kalenderdag van een moment. */
export function amsterdamDag(moment: Date | number): string {
  return DAG.format(typeof moment === "number" ? new Date(moment) : moment);
}

/** Hoeveel milliseconden Nederland op dat moment voorloopt op UTC. */
function offsetMs(moment: number): number {
  const naam = OFFSET.formatToParts(new Date(moment)).find((p) => p.type === "timeZoneName")?.value ?? "";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(naam);
  if (!m) return 0;
  return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 60 + Number(m[3])) * 60_000;
}

/** Middernacht in Nederland aan het begin van `dag`, als UTC-milliseconden. */
export function amsterdamMiddernacht(dag: string): number {
  const gok = Date.parse(`${dag}T00:00:00Z`);
  // Twee keer: de eerste schatting kan net aan de andere kant van een zomertijdgrens vallen.
  const eerste = gok - offsetMs(gok);
  return gok - offsetMs(eerste);
}

export function maandVan(dag: string): string {
  return dag.slice(0, 7);
}

export function eersteDag(maand: string): string {
  return `${maand}-01`;
}

export function laatsteDag(maand: string): string {
  const [j, m] = maand.split("-").map(Number);
  return new Date(Date.UTC(j, m, 0)).toISOString().slice(0, 10);
}

/** Aantal dagen van `van` naar `tot`: 1 voor twee opeenvolgende dagen. */
export function dagenTussen(van: string, tot: string): number {
  return Math.round((Date.parse(`${tot}T00:00:00Z`) - Date.parse(`${van}T00:00:00Z`)) / 86_400_000);
}

/** De maanden van `van` tot en met `tot`, als `JJJJ-MM`. */
export function maandenTussen(van: string, tot: string): string[] {
  const uit: string[] = [];
  let [j, m] = maandVan(van).split("-").map(Number);
  const eind = maandVan(tot);
  for (let i = 0; i < 240; i++) {
    const maand = `${j}-${String(m).padStart(2, "0")}`;
    if (maand > eind) break;
    uit.push(maand);
    m++;
    if (m > 12) {
      m = 1;
      j++;
    }
  }
  return uit;
}
