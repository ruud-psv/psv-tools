/**
 * De plattegrond van het Philips Stadion als vormen per vak.
 *
 * Nagetekend van de officiële plattegrond (dezelfde als op de pagina
 * Bezoekersinformatie en in de ticketshop), in een assenstelsel van 2000 × 1500.
 * Het is een schema, geen bouwtekening: de vakken liggen op de juiste plek en
 * in de juiste verhouding, zodat je in één oogopslag ziet waar de vrije stoelen
 * zitten.
 *
 * Vaknamen zijn precies die uit Ringside en de ticketshop (`*N` is Ere Noord).
 */

export type ExclusionReason = "rolstoelvak" | "sfeervak" | "uitvak" | "staanvak";

export interface StadiumArea {
  area: string;
  /** Rechthoek `[x, y, breedte, hoogte]`, of een SVG-pad. */
  rect?: [number, number, number, number];
  path?: string;
  /** Waar de naam en het aantal komen; standaard het midden van de rechthoek. */
  label?: [number, number];
  /** Getoonde naam, als die afwijkt van de vaknaam. */
  title?: string;
  /** Vakken die niet meedoen, met de reden. */
  excluded?: ExclusionReason;
  /** Klein vak: alleen de naam, geen aantal. */
  compact?: boolean;
}

function row(y: number, height: number, cells: [string, number, number][], extra: Partial<StadiumArea> = {}) {
  return cells.map(([area, x1, x2]): StadiumArea => ({ area, rect: [x1, y, x2 - x1, height], ...extra }));
}

function column(x: number, width: number, cells: [string, number, number][], extra: Partial<StadiumArea> = {}) {
  return cells.map(([area, y1, y2]): StadiumArea => ({ area, rect: [x, y1, width, y2 - y1], ...extra }));
}

export const STADIUM_AREAS: StadiumArea[] = [
  // Noord, boven.
  ...row(222, 93, [
    ["NN", 607, 697],
    ["OO", 697, 797],
    ["PP", 797, 897],
    ["PR", 897, 1097],
    ["RR", 1097, 1197],
    ["SS", 1197, 1297],
    ["TT", 1297, 1390],
  ]),
  // Noord, onder.
  { area: "M", path: "M520 352 H645 V442 H566 L520 398 Z", label: [588, 397] },
  ...row(352, 90, [
    ["N", 645, 740],
    ["O", 740, 835],
    ["P", 835, 925],
  ]),
  { area: "*N", rect: [925, 352, 145, 90], title: "Ere Noord" },
  ...row(352, 90, [
    ["R", 1070, 1160],
    ["S", 1160, 1255],
    ["T", 1255, 1352],
  ]),
  { area: "U", path: "M1352 352 H1455 L1490 387 L1435 442 H1352 Z", label: [1405, 397], excluded: "staanvak" },

  // Hoeken.
  { area: "MM", path: "M390 290 A305 305 0 0 1 607 200 V318 H530 L472 372 Z", label: [520, 270], excluded: "staanvak" },
  {
    area: "BEZOEKERS",
    path: "M300 505 A305 305 0 0 1 390 290 L472 372 L418 430 V505 Z",
    label: [375, 420],
    title: "Bezoekers",
    excluded: "uitvak",
  },
  { area: "UU", path: "M1390 200 A305 305 0 0 1 1695 505 H1578 V430 L1467 318 H1390 Z", label: [1530, 330], title: "UU · Family Corner" },
  { area: "GG", path: "M300 997 H390 V1075 L530 1215 H607 V1302 A305 305 0 0 1 300 997 Z", label: [478, 1192] },
  { area: "ZZ", path: "M1695 997 A305 305 0 0 1 1390 1302 V1215 H1467 L1607 1075 V997 Z", label: [1519, 1192] },

  // West.
  ...column(325, 93, [
    ["LL", 505, 652],
    ["KK", 652, 750],
    ["JJ", 750, 850],
    ["HH", 850, 997],
  ]),
  ...column(452, 93, [
    ["L", 455, 597],
    ["K", 597, 752],
    ["J", 752, 905],
    ["H", 905, 997],
  ]),
  ...column(
    552,
    28,
    [
      ["RSK", 585, 738],
      ["RSJ", 738, 890],
      ["RSH", 890, 983],
    ],
    { excluded: "rolstoelvak", compact: true }
  ),

  // Oost.
  ...column(
    1452,
    93,
    [
      ["V", 455, 597],
      ["W", 597, 752],
      ["X", 752, 905],
      ["Y", 905, 1035],
    ],
    { excluded: "sfeervak" }
  ),
  ...column(1578, 94, [
    ["VV", 505, 652],
    ["WW", 652, 750],
    ["XX", 750, 850],
    ["YY", 850, 997],
  ]),

  // Zuid.
  ...row(
    1010,
    27,
    [
      ["RSF", 607, 697],
      ["RSE", 699, 789],
      ["RSD", 791, 881],
      ["RSC", 1115, 1205],
      ["RSB", 1207, 1297],
      ["RSA", 1299, 1389],
    ],
    { excluded: "rolstoelvak", compact: true }
  ),
  ...row(1060, 90, [
    ["F", 607, 697],
    ["E", 697, 818],
    ["D", 818, 938],
  ]),
  { area: "*Z", rect: [938, 1060, 120, 90], title: "Ere Zuid" },
  ...row(1060, 90, [
    ["C", 1058, 1178],
    ["B", 1178, 1298],
    ["A", 1298, 1390],
  ]),
  ...row(1215, 63, [
    ["FF", 607, 693],
    ["EE", 693, 809],
    ["DD", 809, 926],
    ["CD", 926, 1069],
    ["CC", 1069, 1186],
    ["BB", 1186, 1303],
    ["AA", 1303, 1390],
  ]),
];

export function areaCenter(area: StadiumArea): [number, number] {
  if (area.label) return area.label;
  if (area.rect) {
    const [x, y, w, h] = area.rect;
    return [x + w / 2, y + h / 2];
  }
  return [1000, 750];
}

/**
 * Klassen voor het aantal vrije stoelen in een vak: één kleur, van licht naar
 * donker (PSV-rood uit `packages/psv-branding/tokens`). Tekst is zwart op de
 * lichte en wit op de donkere stappen; het contrast is nagemeten (minimaal 4,5:1).
 */
export const FREE_SEAT_BINS = [
  { min: 1, max: 4, fill: "#fbc9ca", ink: "#000000" },
  { min: 5, max: 14, fill: "#f79da1", ink: "#000000" },
  { min: 15, max: 39, fill: "#e82026", ink: "#ffffff" },
  { min: 40, max: Infinity, fill: "#9c1006", ink: "#ffffff" },
] as const;

/** Het veld, op de plattegrond en boven de vakweergave. */
export const FIELD_FILL = "#8fbb72";

export const NO_FREE_SEATS = { fill: "#eeeeee", ink: "#000000" } as const;
export const EXCLUDED_AREA = { fill: "#cccccc", ink: "#333333" } as const;

export function binFor(free: number): { fill: string; ink: string } {
  if (free <= 0) return NO_FREE_SEATS;
  return FREE_SEAT_BINS.find((bin) => free >= bin.min && free <= bin.max) ?? FREE_SEAT_BINS[FREE_SEAT_BINS.length - 1];
}

export const EXCLUSION_LABELS: Record<ExclusionReason, string> = {
  rolstoelvak: "rolstoelvak",
  sfeervak: "sfeervak",
  uitvak: "uitvak",
  staanvak: "staanvak, geen stoelnummers",
};
