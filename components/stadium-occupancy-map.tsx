"use client";

import { useState } from "react";
import { AreaSeatView } from "@/components/area-seat-view";
import { StadiumBackdrop } from "@/components/stadium-map";
import type { FreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import type { SeatMaps } from "@/lib/aangrenzende-stoelen/seat-map";
import { areaCenter, STADIUM_AREAS, type StadiumArea } from "@/lib/aangrenzende-stoelen/stadium";
import { NO_OCCUPANCY, OCCUPANCY_BINS, occupancyBin } from "@/lib/ticketing-herdgang/herdgang";
import type { AreaOccupancy } from "@/lib/ticketing-herdgang/occupancy";

const number = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

function share(row: AreaOccupancy | undefined): string {
  return row && row.capacity > 0 ? percent.format(row.sold / row.capacity) : "–";
}

function mapLabel(area: StadiumArea): string {
  return area.area === "BEZOEKERS" ? "Bezoekers" : area.area;
}

function areaName(area: StadiumArea): string {
  return area.title && area.title !== area.area ? `${area.title} (${area.area})` : `Vak ${area.area}`;
}

/** De cijfers van een vak in één zin, zonder de naam. */
function describeNumbers(row: AreaOccupancy | undefined): string {
  if (!row) return "geen gegevens in Ringside voor deze wedstrijd";
  const parts = [
    `${number.format(row.sold)} van ${number.format(row.capacity)} verkocht (${share(row)})`,
    `${number.format(row.free)} vrij`,
  ];
  if (row.reserved) parts.push(`${number.format(row.reserved)} gereserveerd`);
  if (row.resale) parts.push(`${number.format(row.resale)} in de resale`);
  if (row.capacity > 0 && row.sellable === 0) parts.push("niet te koop");
  return parts.join(" · ");
}

function Shape({ area, fill }: { area: StadiumArea; fill: string }) {
  if (area.rect) {
    const [x, y, w, h] = area.rect;
    return <rect x={x} y={y} width={w} height={h} fill={fill} />;
  }
  return <path d={area.path} fill={fill} />;
}

/**
 * De plattegrond van het Philips Stadion met per vak de bezetting (verkocht
 * gedeeld door capaciteit). Dezelfde kleurklassen als bij De Herdgang; het
 * percentage staat er altijd als getal bij. Rechts (op een smal scherm eronder)
 * de stoelen van het vak dat je aanwijst; klikken zet het vast.
 */
export function StadiumOccupancyMap({
  areas,
  seatMaps,
  groupsByArea,
}: {
  areas: AreaOccupancy[];
  seatMaps: SeatMaps;
  groupsByArea: Record<string, FreeGroups>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const byArea = new Map(areas.map((row) => [row.area, row]));
  const active = STADIUM_AREAS.find((area) => area.area === (hovered ?? selected)) ?? null;
  const toggle = (area: string) => setSelected((current) => (current === area ? null : area));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-hidden="true">
        <span className="font-heading uppercase tracking-wide">Bezetting</span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-3 w-5 rounded-sm border border-border" style={{ background: NO_OCCUPANCY.fill }} />
          Niets verkocht
        </span>
        {OCCUPANCY_BINS.map((bin) => (
          <span key={bin.label} className="inline-flex items-center gap-1.5">
            <span className="h-3 w-5 rounded-sm" style={{ background: bin.fill }} />
            {bin.label}
          </span>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        {/* Op een smal scherm liever scrollen dan onleesbaar kleine vaknamen. */}
        <div className="overflow-x-auto">
          <svg
            viewBox="200 110 1600 1300"
            className="w-full min-w-[560px] xl:min-w-0 max-w-3xl h-auto select-none"
            role="group"
            aria-label="Plattegrond van het Philips Stadion met de bezetting per vak"
          >
            <StadiumBackdrop />

            {STADIUM_AREAS.map((area) => {
              const row = byArea.get(area.area);
              const colors = occupancyBin(row?.sold ?? 0, row?.capacity ?? 0);
              const [cx, cy] = areaCenter(area);
              const isActive = active?.area === area.area;
              const short = area.rect ? area.rect[3] < 70 : false;
              const label = mapLabel(area);
              const description = `${areaName(area)} · ${describeNumbers(row)}`;

              return (
                <g
                  key={area.area}
                  role="button"
                  tabIndex={0}
                  aria-label={description}
                  aria-pressed={selected === area.area}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHovered(area.area)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(area.area)}
                  onBlur={() => setHovered(null)}
                  onClick={() => toggle(area.area)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(area.area);
                    }
                  }}
                >
                  <title>{description}</title>
                  <Shape area={area} fill={colors.fill} />
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
                    ) : short ? (
                      <text x={cx} y={cy + 10} fontSize="26">
                        {label} <tspan fontWeight="700">{share(row)}</tspan>
                      </text>
                    ) : (
                      <>
                        <text x={cx} y={cy - 4} fontSize="28">
                          {label}
                        </text>
                        <text x={cx} y={cy + 28} fontSize="26" fontWeight="700">
                          {share(row)}
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
          area={active ? { ...active, excluded: undefined } : null}
          name={active ? areaName(active) : ""}
          summary={active ? describeNumbers(byArea.get(active.area)) : ""}
          groups={active ? groupsByArea[active.area] : undefined}
          rows={active ? seatMaps[active.area] : undefined}
          pinned={active !== null && active.area === selected}
          onUnpin={() => setSelected(null)}
          showListed={false}
        />
      </div>
    </div>
  );
}
