/**
 * De plattegrond van De Herdgang als vormen per vak.
 *
 * Nagetekend van de officiële plattegrond (oktober 2026), in hetzelfde
 * assenstelsel van 2000 × 1500. Alleen staanvakken. Vak E ligt aan twee kanten
 * van de rolstoelplaatsen en heeft daarom twee vormen.
 */

export interface HerdgangShape {
  area: string;
  rect: [number, number, number, number];
  /** Kleine regel onder de naam. */
  subtitle?: string;
}

/** Niet aan te wijzen: rolstoelplaatsen en het blok in Zuid zonder vak. */
export interface HerdgangDecor {
  rect: [number, number, number, number];
  kind: "rolstoel" | "blok";
}

function row(y: number, height: number, cells: [string, number, number][]): HerdgangShape[] {
  return cells.map(([area, x1, x2]) => ({ area, rect: [x1, y, x2 - x1, height] }));
}

function column(x: number, width: number, cells: [string, number, number][]): HerdgangShape[] {
  return cells.map(([area, y1, y2]) => ({ area, rect: [x, y1, width, y2 - y1] }));
}

export const HERDGANG_AREAS: HerdgangShape[] = [
  // Noord, boven.
  ...row(295, 72, [
    ["A", 448, 557],
    ["B", 560, 669],
    ["C", 672, 781],
    ["D", 814, 923],
    ["E", 926, 982],
    ["E", 1016, 1072],
    ["F", 1075, 1185],
    ["G", 1216, 1325],
    ["H", 1328, 1437],
    ["J", 1440, 1550],
  ]),
  // Oost, rechts.
  ...column(1589, 71, [
    ["K", 405, 533],
    ["L", 537, 666],
    ["M", 670, 799],
    ["N", 803, 932],
    ["O", 935, 1062],
  ]),
  // Zuid, onder.
  { area: "V", rect: [452, 1101, 212, 71], subtitle: "Bezoekers" },
  ...row(1101, 71, [
    ["U", 667, 772],
    ["T", 775, 924],
    ["S", 1073, 1225],
    ["R", 1228, 1333],
    ["Q", 1336, 1440],
    ["P", 1443, 1548],
  ]),
];

export const HERDGANG_DECOR: HerdgangDecor[] = [
  { rect: [785, 295, 25, 37], kind: "rolstoel" },
  { rect: [987, 295, 25, 37], kind: "rolstoel" },
  { rect: [1188, 295, 25, 37], kind: "rolstoel" },
  { rect: [928, 1101, 142, 71], kind: "blok" },
];

/** Het veld, zoals bij het Philips Stadion. */
export const HERDGANG_FIELD: [number, number, number, number] = [448, 405, 1102, 657];

/**
 * De naam van een vak zoals hij op de kaart staat. Ringside kan `Vak A` of
 * `a` geven; op de kaart is het `A`.
 */
export function mapArea(area: string): string {
  return area.trim().toUpperCase().replace(/^VAK\s+/, "");
}

/**
 * Klassen voor de bezetting van een vak (verkocht gedeeld door capaciteit):
 * één kleur, van licht naar donker, net als de plattegrond van het Philips
 * Stadion. Tekst is zwart op de lichte en wit op de donkere stappen.
 */
export const OCCUPANCY_BINS = [
  { min: 0, max: 0.25, label: "tot 25%", fill: "#fbc9ca", ink: "#000000" },
  { min: 0.25, max: 0.5, label: "25–50%", fill: "#f79da1", ink: "#000000" },
  { min: 0.5, max: 0.8, label: "50–80%", fill: "#e82026", ink: "#ffffff" },
  { min: 0.8, max: Infinity, label: "80% of meer", fill: "#9c1006", ink: "#ffffff" },
] as const;

/** Geen tickets, of geen capaciteit bekend. */
export const NO_OCCUPANCY = { fill: "#eeeeee", ink: "#000000" } as const;

export function occupancyBin(sold: number, capacity: number): { fill: string; ink: string } {
  if (sold <= 0 || capacity <= 0) return NO_OCCUPANCY;
  const share = sold / capacity;
  return OCCUPANCY_BINS.find((bin) => share >= bin.min && share < bin.max) ?? OCCUPANCY_BINS[OCCUPANCY_BINS.length - 1];
}
