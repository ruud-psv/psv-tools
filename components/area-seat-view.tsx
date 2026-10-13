"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import type { FreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import { SEAT_CODE, type SeatCode, type SeatMapRow } from "@/lib/aangrenzende-stoelen/seat-map";
import { FIELD_FILL, type StadiumArea } from "@/lib/aangrenzende-stoelen/stadium";

const number = new Intl.NumberFormat("nl-NL");

/** Maten in eenheden van de viewBox; een stoel is 10 breed, inclusief ruimte eromheen. */
const CELL = 10;
const SEAT = 8;
/** Extra ruimte waar de nummering overslaat: een trap of een lege rij. */
const GAP = 6;
const LABEL = 22;
const FIELD = 14;
const TOP = FIELD + 12;
/** Groter dan zo veel pixels per stoel wordt het niet, ook niet in een klein vak. */
const MAX_PX_PER_CELL = 22;

type ShownCode = Exclude<SeatCode, typeof SEAT_CODE.geen>;

const SEAT_LABELS: Record<ShownCode, string> = {
  [SEAT_CODE.vrij]: "vrij",
  [SEAT_CODE.resale]: "vrij via de resale",
  [SEAT_CODE.lijst]: "seizoenkaarthouder op de lijst",
  [SEAT_CODE.bezet]: "bezet",
  [SEAT_CODE.geblokkeerd]: "geblokkeerd",
};

const LEGEND: { code: ShownCode; label: string }[] = [
  { code: SEAT_CODE.vrij, label: "Vrij" },
  { code: SEAT_CODE.resale, label: "Vrij via resale" },
  { code: SEAT_CODE.lijst, label: "Op de lijst" },
  { code: SEAT_CODE.bezet, label: "Bezet" },
  { code: SEAT_CODE.geblokkeerd, label: "Geblokkeerd" },
];

/** Eén stoel. Vrij is PSV-rood, de resale rood met een witte stip, de lijst goud. */
function Seat({ code, x, y }: { code: ShownCode; x: number; y: number }) {
  const inset = (CELL - SEAT) / 2;
  if (code === SEAT_CODE.geblokkeerd) {
    return (
      <rect
        x={x + inset + 0.5}
        y={y + inset + 0.5}
        width={SEAT - 1}
        height={SEAT - 1}
        rx={1.5}
        strokeWidth={1}
        className="fill-psv-white stroke-psv-gray-09"
      />
    );
  }
  const fill =
    code === SEAT_CODE.lijst ? "fill-psv-gold" : code === SEAT_CODE.bezet ? "fill-psv-gray-08" : "fill-psv-red-primary";
  return (
    <>
      <rect x={x + inset} y={y + inset} width={SEAT} height={SEAT} rx={2} className={fill} />
      {code === SEAT_CODE.resale && <circle cx={x + CELL / 2} cy={y + CELL / 2} r={1.8} className="fill-psv-white" />}
    </>
  );
}

function Swatch({ code }: { code: ShownCode }) {
  return (
    <svg width="12" height="12" viewBox={`0 0 ${CELL} ${CELL}`} aria-hidden="true">
      <Seat code={code} x={0} y={0} />
    </svg>
  );
}

/**
 * Waar elke stoel komt. Kolommen zijn stoelnummers en rijen rijnummers, net als
 * in de regels voor buren: wat recht achter elkaar staat heeft hetzelfde
 * stoelnummer. Nummers die in geen enkele rij voorkomen worden een smalle
 * opening in plaats van lege kolommen.
 */
function layout(rows: SeatMapRow[]) {
  const numbers = new Set<number>();
  for (const [, first, codes] of rows) {
    for (let i = 0; i < codes.length; i++) if (codes[i] !== SEAT_CODE.geen) numbers.add(first + i);
  }
  const columns = [...numbers].sort((a, b) => a - b);

  const x = new Map<number, number>();
  let cursorX = LABEL;
  columns.forEach((seat, i) => {
    if (i > 0 && seat - columns[i - 1] > 1) cursorX += GAP;
    x.set(seat, cursorX);
    cursorX += CELL;
  });

  const y: number[] = [];
  let cursorY = TOP;
  rows.forEach(([row], i) => {
    if (i > 0 && row - rows[i - 1][0] > 1) cursorY += GAP;
    y.push(cursorY);
    cursorY += CELL;
  });

  return { x, y, width: cursorX + LABEL, height: cursorY, columns };
}

interface HoveredSeat {
  row: number;
  seat: number;
  code: ShownCode;
}

function SeatGrid({ rows, label }: { rows: SeatMapRow[]; label: string }) {
  const [hovered, setHovered] = useState<HoveredSeat | null>(null);
  const { x, y, width, height, columns } = useMemo(() => layout(rows), [rows]);
  const first = columns[0];
  const last = columns[columns.length - 1];
  const hoveredRow = hovered ? rows.findIndex(([row]) => row === hovered.row) : -1;

  // Eén handler voor alle stoelen: welke het is staat in `data-stoel`. Tussen
  // twee stoelen blijft de vorige staan.
  function pick(target: EventTarget) {
    const element = target instanceof Element ? target.closest<SVGElement>("[data-stoel]") : null;
    const data = element?.dataset.stoel;
    if (!data) return;
    const [row, seat, code] = data.split("|");
    setHovered({ row: Number(row), seat: Number(seat), code: code as ShownCode });
  }

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMin meet"
        className="w-full h-auto max-h-[32rem] select-none"
        style={{ maxWidth: (width / CELL) * MAX_PX_PER_CELL }}
        role="img"
        aria-label={label}
        onMouseOver={(event) => pick(event.target)}
        onClick={(event) => pick(event.target)}
        onMouseLeave={() => setHovered(null)}
      >
        <rect x={LABEL} y={0} width={width - 2 * LABEL} height={FIELD} rx={2} fill={FIELD_FILL} />
        <text
          x={width / 2}
          y={FIELD / 2 + 3}
          textAnchor="middle"
          fontSize="8"
          letterSpacing="1"
          className="font-heading fill-psv-white"
        >
          VELD
        </text>

        {/* Eerste en laatste stoelnummer, om te zien hoe de nummering loopt. */}
        <g fontSize="6" textAnchor="middle" className="fill-muted-foreground">
          <text x={(x.get(first) ?? LABEL) + CELL / 2} y={TOP - 3}>
            {first}
          </text>
          {last !== first && (
            <text x={(x.get(last) ?? LABEL) + CELL / 2} y={TOP - 3}>
              {last}
            </text>
          )}
        </g>

        {rows.map(([row, firstSeat, codes], r) => (
          <g key={row}>
            <g fontSize="7" className="font-heading fill-muted-foreground">
              <text x={LABEL - 4} y={y[r] + CELL / 2 + 2.5} textAnchor="end">
                {row}
              </text>
              <text x={width - LABEL + 4} y={y[r] + CELL / 2 + 2.5}>
                {row}
              </text>
            </g>
            {[...codes].map((code, i) => {
              if (code === SEAT_CODE.geen) return null;
              const seat = firstSeat + i;
              const left = x.get(seat) ?? 0;
              return (
                <g key={seat} data-stoel={`${row}|${seat}|${code}`}>
                  <Seat code={code as ShownCode} x={left} y={y[r]} />
                </g>
              );
            })}
          </g>
        ))}

        {hovered && hoveredRow >= 0 && x.has(hovered.seat) && (
          <rect
            x={(x.get(hovered.seat) ?? 0) + 0.25}
            y={y[hoveredRow] + 0.25}
            width={CELL - 0.5}
            height={CELL - 0.5}
            rx={2.5}
            fill="none"
            strokeWidth={1}
            pointerEvents="none"
            className="stroke-foreground"
          />
        )}
      </svg>

      <p className="text-xs min-h-[1rem]" aria-hidden="true">
        {hovered
          ? `Rij ${hovered.row} · stoel ${hovered.seat} · ${SEAT_LABELS[hovered.code]}`
          : "Wijs een stoel aan voor rij en stoelnummer."}
      </p>
    </div>
  );
}

function GroupsLine({ groups }: { groups: FreeGroups }) {
  const parts = [
    `${number.format(groups.one)}× één stoel`,
    `${number.format(groups.two)}× twee stoelen`,
    `${number.format(groups.threeOrMore)}× drie of meer${
      groups.threeOrMore > 0 ? ` (${number.format(groups.seatsInThreeOrMore)} stoelen)` : ""
    }`,
  ];
  return <p className="text-xs text-muted-foreground">Naast elkaar in een rij: {parts.join(" · ")}</p>;
}

/**
 * De stoelen van één vak, naast de plattegrond: wat je daar aanwijst of
 * aanklikt. Net als in de ticketshop ligt het veld boven en lopen de rijen
 * naar achteren af, maar dan op nummer: de echte vorm van het vak (trappen,
 * schuine hoeken) kent Ringside niet.
 */
export function AreaSeatView({
  area,
  name,
  summary,
  groups,
  rows,
  pinned,
  onUnpin,
}: {
  area: StadiumArea | null;
  name: string;
  summary: string;
  groups: FreeGroups | undefined;
  rows: SeatMapRow[] | undefined;
  pinned: boolean;
  onUnpin: () => void;
}) {
  if (!area) {
    return (
      <div className="flex min-h-[12rem] items-center justify-center rounded-md border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        Wijs een vak aan op de plattegrond om de stoelen te zien. Klik erop om het vast te zetten.
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3">
        <div aria-live="polite" className="space-y-1">
          <h3 className="text-base font-heading">{name}</h3>
          <p className="text-sm">{summary}</p>
        </div>
        {pinned ? (
          <button
            type="button"
            onClick={onUnpin}
            title="Klik om los te maken"
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-2 py-1 text-xs font-heading uppercase tracking-wide hover:bg-muted"
          >
            Vastgezet
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        ) : (
          <span className="shrink-0 text-xs text-muted-foreground">Klik om vast te zetten</span>
        )}
      </div>

      {area.excluded ? null : !rows || rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Voor dit vak staan geen stoelen met rij- en stoelnummer in de stoelenkaart van deze wedstrijd.
        </p>
      ) : (
        <>
          {groups && <GroupsLine groups={groups} />}
          {/* Per vak opnieuw, zodat een aangewezen stoel niet meeverhuist. */}
          <SeatGrid key={area.area} rows={rows} label={`Stoelen van ${name}. ${summary}`} />
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
            {LEGEND.map(({ code, label }) => (
              <span key={code} className="inline-flex items-center gap-1.5">
                <Swatch code={code} />
                {label}
              </span>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Schema op nummer: de laagste rij ligt aan het veld, lage stoelnummers links. Een smalle opening is
            een sprong in de nummering, meestal een trap.
          </p>
        </>
      )}
    </div>
  );
}
