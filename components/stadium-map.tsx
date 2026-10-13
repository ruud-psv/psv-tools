"use client";

import { useState } from "react";
import { AreaSeatView } from "@/components/area-seat-view";
import type { FreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import type { SeatMaps } from "@/lib/aangrenzende-stoelen/seat-map";
import {
  areaCenter,
  binFor,
  EXCLUDED_AREA,
  EXCLUSION_LABELS,
  FIELD_FILL,
  FREE_SEAT_BINS,
  NO_FREE_SEATS,
  STADIUM_AREAS,
  type StadiumArea,
} from "@/lib/aangrenzende-stoelen/stadium";

export interface AreaNumbers {
  free: number;
  resale: number;
  listed: number;
  groups?: FreeGroups;
}

const number = new Intl.NumberFormat("nl-NL");

/** Wat er op de kaart in het vak staat: de vaknaam, behalve bij het uitvak. */
function mapLabel(area: StadiumArea): string {
  return area.area === "BEZOEKERS" ? "Bezoekers" : area.area;
}

function areaName(area: StadiumArea): string {
  return area.title && area.title !== area.area ? `${area.title} (${area.area})` : `Vak ${area.area}`;
}

/** De cijfers van een vak in één zin, zonder de naam. */
function describeNumbers(area: StadiumArea, numbers: AreaNumbers | undefined): string {
  if (area.excluded) return `doet niet mee (${EXCLUSION_LABELS[area.excluded]})`;
  const free = numbers?.free ?? 0;
  if (free === 0) return "geen vrije stoelen";
  const resale = numbers?.resale ? `, waarvan ${number.format(numbers.resale)} in de resale` : "";
  const listed = numbers?.listed ?? 0;
  return `${number.format(free)} vrije ${free === 1 ? "stoel" : "stoelen"}${resale} · ${number.format(listed)} ${
    listed === 1 ? "stoel" : "stoelen"
  } van seizoenkaarthouders op de lijst`;
}

function describe(area: StadiumArea, numbers: AreaNumbers | undefined): string {
  return `${areaName(area)} · ${describeNumbers(area, numbers)}`;
}

function Shape({ area, fill }: { area: StadiumArea; fill: string }) {
  if (area.rect) {
    const [x, y, w, h] = area.rect;
    return <rect x={x} y={y} width={w} height={h} fill={fill} />;
  }
  return <path d={area.path} fill={fill} />;
}

/**
 * De plattegrond met per vak het aantal vrije stoelen.
 *
 * Kleur is één schaal van licht naar donker rood; het aantal staat er altijd
 * als getal bij, zodat de kaart ook zonder kleurwaarneming te lezen is. Vakken
 * die niet meedoen zijn grijs en gearceerd. Rechts (op een smal scherm eronder)
 * staan de stoelen van het vak dat je aanwijst; klikken zet het vast.
 */
export function StadiumMap({ numbers, seatMaps }: { numbers: Record<string, AreaNumbers>; seatMaps: SeatMaps }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const active = STADIUM_AREAS.find((area) => area.area === (hovered ?? selected)) ?? null;
  const onMap = new Set(STADIUM_AREAS.map((area) => area.area));
  const elsewhere = Object.entries(numbers).filter(([area, n]) => !onMap.has(area) && n.free > 0);
  const tableRows = Object.entries(numbers)
    .filter(([, n]) => n.free > 0)
    .sort((a, b) => b[1].free - a[1].free || a[0].localeCompare(b[0]));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-hidden="true">
        <span className="font-heading uppercase tracking-wide">Vrije stoelen</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-border" style={{ background: NO_FREE_SEATS.fill }} />0
        </span>
        {FREE_SEAT_BINS.map((bin) => (
          <span key={bin.min} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm" style={{ background: bin.fill }} />
            {bin.max === Infinity ? `${bin.min}+` : `${bin.min}–${bin.max}`}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <svg width="20" height="12" className="rounded-sm">
            <rect width="20" height="12" fill={EXCLUDED_AREA.fill} />
            <path d="M-2 10 L6 -2 M4 14 L14 -2 M12 14 L22 -2" stroke="#999999" strokeWidth="1.5" />
          </svg>
          Doet niet mee
        </span>
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        {/* Op een smal scherm liever scrollen dan onleesbaar kleine vaknamen. */}
        <div className="overflow-x-auto">
          <svg
            viewBox="200 110 1600 1300"
            className="w-full min-w-[560px] xl:min-w-0 max-w-3xl h-auto select-none"
            role="group"
            aria-label="Plattegrond van het Philips Stadion met het aantal vrije stoelen per vak"
          >
            <defs>
              <pattern id="stadion-arcering" width="16" height="16" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="16" height="16" fill={EXCLUDED_AREA.fill} />
                <line x1="0" y1="0" x2="0" y2="16" stroke="#999999" strokeWidth="4" />
              </pattern>
            </defs>

            {/* Omloop, binnenring en veld: alleen decor. */}
            <path
              d="M418 505 V430 L530 318 H1467 L1578 430 V997 H1607 V1075 L1467 1215 H530 L390 1075 V997 H418 Z"
              fill="#555555"
            />
            <path d="M452 400 L500 352 H1490 L1545 407 V1060 L1455 1150 H545 L452 1057 Z" fill="#ffffff" />
            <rect x="587" y="492" width="823" height="491" fill={FIELD_FILL} />
            <g fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.8">
              <rect x="622" y="527" width="753" height="421" />
              <line x1="998" y1="527" x2="998" y2="948" />
              <circle cx="998" cy="737" r="70" />
              <rect x="622" y="598" width="118" height="279" />
              <rect x="1257" y="598" width="118" height="279" />
            </g>
            <text x="998" y="1192" textAnchor="middle" fill="#ffffff" fontSize="26" className="font-heading" letterSpacing="2">
              PSV BUSINESS
            </text>

            {/* Windrichtingen. */}
            <g className="font-heading" fill="#e82026" fontSize="44" textAnchor="middle">
              <text x="998" y="170">
                Noord
              </text>
              <text x="998" y="1395">
                Zuid
              </text>
              <text x="262" y="750" transform="rotate(-90 262 750)">
                West
              </text>
              <text x="1738" y="750" transform="rotate(90 1738 750)">
                Oost
              </text>
            </g>

            {STADIUM_AREAS.map((area) => {
              const n = numbers[area.area];
              const free = n?.free ?? 0;
              const colors = area.excluded ? EXCLUDED_AREA : binFor(free);
              const fill = area.excluded ? "url(#stadion-arcering)" : colors.fill;
              const [cx, cy] = areaCenter(area);
              const isActive = active?.area === area.area;
              const short = area.rect ? area.rect[3] < 70 : false;
              const label = mapLabel(area);

              return (
                <g
                  key={area.area}
                  role="button"
                  tabIndex={0}
                  aria-label={describe(area, n)}
                  aria-pressed={selected === area.area}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHovered(area.area)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(area.area)}
                  onBlur={() => setHovered(null)}
                  onClick={() => setSelected((current) => (current === area.area ? null : area.area))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setSelected((current) => (current === area.area ? null : area.area));
                    }
                  }}
                >
                  <title>{describe(area, n)}</title>
                  <Shape area={area} fill={fill} />
                  {/* Witte rand als ruimte tussen de vakken, zwart als het vak actief is. */}
                  <g fill="none" stroke={isActive ? "#000000" : "#ffffff"} strokeWidth={isActive ? 6 : 4}>
                    {area.rect ? (
                      <rect x={area.rect[0]} y={area.rect[1]} width={area.rect[2]} height={area.rect[3]} />
                    ) : (
                      <path d={area.path} />
                    )}
                  </g>
                  <g className="font-heading" textAnchor="middle" fill={colors.ink} pointerEvents="none">
                    {area.compact ? (
                      <text x={cx} y={cy + 7} fontSize="18">
                        {label}
                      </text>
                    ) : area.excluded ? (
                      <text x={cx} y={cy + 10} fontSize="28">
                        {label}
                      </text>
                    ) : short ? (
                      <text x={cx} y={cy + 10} fontSize="28">
                        {label} <tspan fontWeight="700">{free}</tspan>
                      </text>
                    ) : (
                      <>
                        <text x={cx} y={cy - 4} fontSize="30">
                          {label}
                        </text>
                        <text x={cx} y={cy + 30} fontSize="30" fontWeight="700">
                          {free}
                        </text>
                      </>
                    )}
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <AreaSeatView
          area={active}
          name={active ? areaName(active) : ""}
          summary={active ? describeNumbers(active, numbers[active.area]) : ""}
          groups={active ? numbers[active.area]?.groups : undefined}
          rows={active ? seatMaps[active.area] : undefined}
          pinned={active !== null && active.area === selected}
          onUnpin={() => setSelected(null)}
        />
      </div>

      {elsewhere.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Ook vrije stoelen in vakken die niet op de plattegrond staan:{" "}
          {elsewhere.map(([area, n]) => `${area} (${number.format(n.free)})`).join(", ")}.
        </p>
      )}

      {tableRows.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
            Als tabel
          </summary>
          <table className="mt-2 w-full max-w-md text-left">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-1 font-normal">Vak</th>
                <th className="py-1 font-normal text-right">Vrij</th>
                <th className="py-1 font-normal text-right">In resale</th>
                <th className="py-1 font-normal text-right">Op de lijst</th>
              </tr>
            </thead>
            <tbody>
              {tableRows.map(([area, n]) => (
                <tr key={area} className="border-t border-border">
                  <td className="py-1">{area}</td>
                  <td className="py-1 text-right tabular-nums">{number.format(n.free)}</td>
                  <td className="py-1 text-right tabular-nums">{number.format(n.resale)}</td>
                  <td className="py-1 text-right tabular-nums">{number.format(n.listed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}
