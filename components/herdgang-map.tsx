"use client";

import { useState } from "react";
import { FIELD_FILL } from "@/lib/aangrenzende-stoelen/stadium";
import {
  HERDGANG_AREAS,
  HERDGANG_DECOR,
  HERDGANG_FIELD,
  mapArea,
  NO_OCCUPANCY,
  OCCUPANCY_BINS,
  occupancyBin,
} from "@/lib/ticketing-herdgang/herdgang";
import type { AreaOccupancy } from "@/lib/ticketing-herdgang/occupancy";

const number = new Intl.NumberFormat("nl-NL");
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

function share(row: AreaOccupancy | undefined): string {
  return row && row.capacity > 0 ? percent.format(row.sold / row.capacity) : "–";
}

function describe(area: string, row: AreaOccupancy | undefined): string {
  if (!row) return `Vak ${area} · geen gegevens in Ringside`;
  return `Vak ${area} · ${number.format(row.sold)} van ${number.format(row.capacity)} verkocht (${share(row)}) · ${number.format(row.free)} vrij`;
}

/**
 * De plattegrond van De Herdgang met per vak de bezetting.
 *
 * Kleur is één schaal van licht naar donker rood; het percentage staat er
 * altijd als getal bij. Wijs een vak aan voor de cijfers; klikken zet het vast.
 */
export function HerdgangMap({ areas }: { areas: AreaOccupancy[] }) {
  const [hovered, setHovered] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  const byArea = new Map<string, AreaOccupancy>();
  for (const row of areas) byArea.set(mapArea(row.area), row);
  const onMap = new Set(HERDGANG_AREAS.map((shape) => shape.area));
  const elsewhere = areas.filter((row) => !onMap.has(mapArea(row.area)));

  const activeName = hovered ?? selected;
  const active = activeName ? byArea.get(activeName) : undefined;
  const [fx, fy, fw, fh] = HERDGANG_FIELD;
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

      <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] xl:items-start">
        <div className="overflow-x-auto">
          <svg
            viewBox="380 120 1460 1240"
            className="w-full min-w-[520px] xl:min-w-0 max-w-3xl h-auto select-none"
            role="group"
            aria-label="Plattegrond van De Herdgang met de bezetting per vak"
          >
            <defs>
              <pattern id="herdgang-arcering" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="12" height="12" fill="#cccccc" />
                <line x1="0" y1="0" x2="0" y2="12" stroke="#999999" strokeWidth="3" />
              </pattern>
            </defs>

            {/* Veld: alleen decor. */}
            <rect x={fx} y={fy} width={fw} height={fh} fill={FIELD_FILL} />
            <g fill="none" stroke="#ffffff" strokeWidth="3" opacity="0.8">
              <rect x={fx + 45} y={fy + 45} width={fw - 90} height={fh - 90} />
              <line x1={fx + fw / 2} y1={fy + 45} x2={fx + fw / 2} y2={fy + fh - 45} />
              <circle cx={fx + fw / 2} cy={fy + fh / 2} r="80" />
              <rect x={fx + 45} y={fy + 141} width="159" height="375" />
              <rect x={fx + fw - 204} y={fy + 141} width="159" height="375" />
            </g>

            {HERDGANG_DECOR.map((decor, i) => {
              const [x, y, w, h] = decor.rect;
              return (
                <rect
                  key={i}
                  x={x}
                  y={y}
                  width={w}
                  height={h}
                  fill={decor.kind === "blok" ? "#594a4a" : "url(#herdgang-arcering)"}
                >
                  <title>{decor.kind === "rolstoel" ? "Rolstoelplaatsen" : "Geen vak"}</title>
                </rect>
              );
            })}
            <text x="1099" y="270" textAnchor="middle" fill="#666666" fontSize="18" className="font-heading" letterSpacing="1">
              ROLSTOELGEBRUIKERS
            </text>

            <g className="font-heading" fill="#e82026" fontSize="56" textAnchor="middle">
              <text x="999" y="210">
                Noord
              </text>
              <text x="999" y="1305">
                Zuid
              </text>
              <text x="1770" y="740" transform="rotate(90 1770 740)">
                Oost
              </text>
            </g>

            {HERDGANG_AREAS.map((shape, i) => {
              const row = byArea.get(shape.area);
              const colors = occupancyBin(row?.sold ?? 0, row?.capacity ?? 0);
              const [x, y, w, h] = shape.rect;
              const isActive = activeName === shape.area;
              const narrow = w < 80;
              return (
                <g
                  key={i}
                  role="button"
                  tabIndex={0}
                  aria-label={describe(shape.area, row)}
                  aria-pressed={selected === shape.area}
                  className="cursor-pointer outline-none"
                  onMouseEnter={() => setHovered(shape.area)}
                  onMouseLeave={() => setHovered(null)}
                  onFocus={() => setHovered(shape.area)}
                  onBlur={() => setHovered(null)}
                  onClick={() => toggle(shape.area)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      toggle(shape.area);
                    }
                  }}
                >
                  <title>{describe(shape.area, row)}</title>
                  <rect
                    x={x}
                    y={y}
                    width={w}
                    height={h}
                    fill={colors.fill}
                    stroke={isActive ? "#000000" : "#ffffff"}
                    strokeWidth={isActive ? 5 : 3}
                  />
                  <g className="font-heading" textAnchor="middle" fill={colors.ink} pointerEvents="none">
                    <text x={x + w / 2} y={y + h / 2 - (narrow ? 2 : 6)} fontSize="30">
                      {shape.area}
                    </text>
                    <text x={x + w / 2} y={y + h / 2 + 24} fontSize={narrow ? 17 : 22} fontWeight="700">
                      {shape.subtitle && !row ? shape.subtitle : share(row)}
                    </text>
                  </g>
                </g>
              );
            })}
          </svg>
        </div>

        <div className="rounded-md border border-border p-4 text-sm space-y-2">
          {activeName ? (
            <>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-heading uppercase">Vak {activeName}</h3>
                {selected === activeName && (
                  <button
                    type="button"
                    onClick={() => setSelected(null)}
                    className="text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground"
                  >
                    Vastgezet ×
                  </button>
                )}
              </div>
              {active ? (
                <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                  <dt className="text-muted-foreground">Capaciteit</dt>
                  <dd className="text-right tabular-nums">{number.format(active.capacity)}</dd>
                  <dt className="text-muted-foreground">Verkocht</dt>
                  <dd className="text-right tabular-nums">{number.format(active.sold)}</dd>
                  <dt className="text-muted-foreground">Gereserveerd</dt>
                  <dd className="text-right tabular-nums">{number.format(active.reserved)}</dd>
                  <dt className="text-muted-foreground">In de resale</dt>
                  <dd className="text-right tabular-nums">{number.format(active.resale)}</dd>
                  <dt className="text-muted-foreground">Vrij</dt>
                  <dd className="text-right tabular-nums">{number.format(active.free)}</dd>
                  <dt className="text-muted-foreground">Bezetting</dt>
                  <dd className="text-right tabular-nums font-medium">{share(active)}</dd>
                </dl>
              ) : (
                <p className="text-muted-foreground">Ringside heeft voor deze wedstrijd geen gegevens over dit vak.</p>
              )}
              {active && active.capacity > 0 && active.sellable === 0 && (
                <p className="text-xs text-muted-foreground">Dit vak is niet te koop.</p>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Wijs een vak aan voor de cijfers. Klikken zet het vast.</p>
          )}
        </div>
      </div>

      {elsewhere.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Vakken uit Ringside die niet op de plattegrond staan:{" "}
          {elsewhere.map((row) => `${row.area} (${number.format(row.sold)} verkocht)`).join(", ")}. Ze staan wel in de tabel.
        </p>
      )}
    </div>
  );
}
