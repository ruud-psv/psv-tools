"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Armchair,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  ArrowUpDown,
  Check,
  Link2,
  Loader2,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { StadiumOccupancyMap } from "@/components/stadium-occupancy-map";
import { StadionChat } from "@/components/stadion-chat";
import { StadionSupplyChart } from "@/components/stadion-supply-chart";
import { TicketSalesChart } from "@/components/ticket-sales-chart";
import {
  daysLabel,
  Delta,
  formatDateTime,
  formatEventDate,
  number,
  OccupancyBar,
  share,
  Stat,
} from "@/components/ticketing-stadion-parts";
import type { FreeGroups } from "@/lib/aangrenzende-stoelen/neighbors";
import type { SeatMaps } from "@/lib/aangrenzende-stoelen/seat-map";
import { offsetsToDailyPoints } from "@/lib/ringside/daily-sales";
import type { ComparisonInput, ComparisonMode } from "@/lib/ticket-sales-comparison";
import type { AreaOccupancy, Occupancy } from "@/lib/ticketing-herdgang/occupancy";
import type { ComparableMatch, Comparison, SalesPace } from "@/lib/ticketing-stadion/summary";

interface MatchResponse {
  match: {
    eventId: string;
    name: string | null;
    eventDate: string | null;
    daysOut: number;
    total: Occupancy;
    areas: AreaOccupancy[];
    otherTotal: Occupancy;
  };
  seatMaps: SeatMaps;
  freeGroups: { total: FreeGroups; byArea: Record<string, FreeGroups> };
  sales: { perOffset: Record<string, number>; total: number; season: string } | null;
  pace: SalesPace | null;
  comparison: Comparison;
  comparable: ComparableMatch[];
  seats: { capacityComplete: boolean; reservationComplete: boolean; caughtUpAt: string | null };
  salesStatus: { complete: boolean; updatedAt: string | null };
}

interface SalesSeries extends ComparableMatch {
  perOffset: Record<string, number>;
}

/** Meer lijnen naast elkaar wordt onleesbaar. */
const MAX_COMPARISONS = 3;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      data.error ??
        (res.status === 502 || res.status === 504
          ? "De server deed er te lang over of liep vast. Probeer het over een minuut opnieuw."
          : `Status ${res.status}`)
    );
  }
  return data as T;
}

function formatShortDate(value: string): string {
  const parsed = new Date(value.replace(" ", "T"));
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString("nl-NL", { day: "numeric", month: "short", year: "numeric" });
}

type AreaSortKey = "area" | "capacity" | "sold" | "reserved" | "resale" | "free" | "occupancy";

const AREA_COLUMNS: { key: AreaSortKey; label: string; value: (row: AreaOccupancy) => number | string }[] = [
  { key: "area", label: "Vak", value: (row) => row.area },
  { key: "capacity", label: "Capaciteit", value: (row) => row.capacity },
  { key: "sold", label: "Verkocht", value: (row) => row.sold },
  { key: "reserved", label: "Gereserveerd", value: (row) => row.reserved },
  { key: "resale", label: "In de resale", value: (row) => row.resale },
  { key: "free", label: "Vrij", value: (row) => row.free },
  { key: "occupancy", label: "Bezetting", value: (row) => (row.capacity > 0 ? row.sold / row.capacity : -1) },
];

/** Klik op een kolomkop: eerst A→Z of laag→hoog, nog een keer andersom. */
function AreaTable({ rows }: { rows: AreaOccupancy[] }) {
  const [sort, setSort] = useState<{ key: AreaSortKey; ascending: boolean }>({ key: "area", ascending: true });

  const sorted = useMemo(() => {
    const column = AREA_COLUMNS.find((c) => c.key === sort.key) ?? AREA_COLUMNS[0];
    const direction = sort.ascending ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = column.value(a);
      const y = column.value(b);
      const order =
        typeof x === "string" || typeof y === "string"
          ? String(x).localeCompare(String(y), "nl", { numeric: true })
          : x - y;
      // Bij gelijke waarden op vaknaam, zodat de volgorde vast ligt.
      return order * direction || a.area.localeCompare(b.area, "nl", { numeric: true });
    });
  }, [rows, sort]);

  const toggle = (key: AreaSortKey) =>
    setSort((current) => (current.key === key ? { key, ascending: !current.ascending } : { key, ascending: true }));

  return (
    <div className="overflow-x-auto">
      <table className="w-full max-w-3xl text-sm">
        <thead>
          <tr className="border-b border-border text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
            {AREA_COLUMNS.map((column, i) => {
              const active = sort.key === column.key;
              const Icon = !active ? ArrowUpDown : sort.ascending ? ArrowUp : ArrowDown;
              return (
                <th
                  key={column.key}
                  aria-sort={active ? (sort.ascending ? "ascending" : "descending") : "none"}
                  className={`py-2 font-normal ${i < AREA_COLUMNS.length - 1 ? "pr-4" : ""} ${i > 0 ? "text-right" : ""}`}
                >
                  <button
                    type="button"
                    onClick={() => toggle(column.key)}
                    className={`inline-flex items-center gap-1 uppercase tracking-wide hover:text-foreground transition-colors ${
                      active ? "text-foreground" : ""
                    }`}
                  >
                    {column.label}
                    <Icon className={`h-3 w-3 ${active ? "text-primary" : "opacity-40"}`} aria-hidden="true" />
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row) => (
            <tr key={row.area} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-4 font-medium">{row.area}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{number.format(row.capacity)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{number.format(row.sold)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{number.format(row.reserved)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{number.format(row.resale)}</td>
              <td className="py-1.5 pr-4 text-right tabular-nums">{number.format(row.free)}</td>
              <td className="py-1.5 text-right tabular-nums">{share(row.sold, row.capacity)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** De verkoop per dag van deze wedstrijd, met eerdere thuiswedstrijden ernaast. */
function SalesSection({
  data,
  salesUrl,
  selected,
  setSelected,
}: {
  data: MatchResponse;
  salesUrl: (ids: string[]) => string;
  selected: string[];
  setSelected: (update: (current: string[]) => string[]) => void;
}) {
  const { match, sales, comparable } = data;
  // `null`: opgevraagd, maar geen verkoop gevonden. Zo wordt hij niet steeds opnieuw opgevraagd.
  const [series, setSeries] = useState<Record<string, SalesSeries | null>>({});
  const [mode, setMode] = useState<ComparisonMode>("perDag");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const missing = selected.filter((id) => series[id] === undefined);
    if (missing.length === 0) return;
    let cancelled = false;
    fetchJson<{ matches: SalesSeries[] }>(salesUrl(missing))
      .then(({ matches }) => {
        if (cancelled) return;
        setSeries((current) => {
          const next = { ...current };
          for (const id of missing) next[id] = null;
          for (const m of matches) next[m.productId] = m;
          return next;
        });
        setError(null);
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      cancelled = true;
    };
  }, [selected, series, salesUrl]);

  const points = useMemo(
    () => (sales && match.eventDate ? offsetsToDailyPoints(sales.perOffset, match.eventDate) : []),
    [sales, match.eventDate]
  );

  const comparisons = useMemo<ComparisonInput[]>(
    () =>
      selected
        .map((id) => series[id])
        .filter((m): m is SalesSeries => Boolean(m))
        .map((m) => ({
          id: m.productId,
          name: m.name,
          season: m.season,
          eventDate: m.eventDate,
          perOffset: new Map(Object.entries(m.perOffset).map(([offset, count]) => [Number(offset), count])),
          total: m.total,
          unfilteredTotal: m.total,
        })),
    [selected, series]
  );

  const byId = new Map(comparable.map((m) => [m.productId, m]));
  const options = comparable.filter((m) => !selected.includes(m.productId));

  if (!sales || !match.eventDate) {
    return <p className="text-sm text-muted-foreground">Voor deze wedstrijd is nog geen verkoop per dag ingelezen.</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="space-y-2">
          <label htmlFor="vergelijk" className="text-xs font-heading uppercase tracking-wide text-muted-foreground">
            Vergelijk met
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {selected.map((id) => (
              <span key={id} className="tag tag--outlined inline-flex items-center gap-1.5">
                {byId.get(id)?.name ?? series[id]?.name ?? "…"} ({byId.get(id)?.season ?? series[id]?.season})
                <button
                  type="button"
                  onClick={() => setSelected((current) => current.filter((other) => other !== id))}
                  aria-label="Verwijder uit de vergelijking"
                  className="hover:text-foreground"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            {selected.length < MAX_COMPARISONS && options.length > 0 && (
              <select
                id="vergelijk"
                value=""
                onChange={(e) => e.target.value && setSelected((current) => [...current, e.target.value])}
                className="h-9 max-w-xs rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <option value="">Kies een eerdere thuiswedstrijd…</option>
                {options.map((m) => (
                  <option key={m.productId} value={m.productId}>
                    {m.name} · {formatShortDate(m.eventDate)} ({m.season})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          {(["perDag", "tempo"] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setMode(option)}
              className={`btn btn--medium ${mode === option ? "" : "btn--outlined"}`}
            >
              {option === "perDag" ? "Per dag" : "Tempo"}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="flex items-start gap-2 text-sm">
          <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
          {error}
        </p>
      )}

      <TicketSalesChart
        eventId={match.eventId}
        eventDate={match.eventDate}
        points={points}
        comparisons={comparisons}
        liveName={match.name ?? "Deze wedstrijd"}
        comparisonMode={mode}
        comparisonWindow="full"
      />
    </div>
  );
}

/** Maakt een deellink en zet hem op het klembord. */
function ShareButton({ eventId }: { eventId: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "shown">("idle");
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function share() {
    setState("busy");
    setError(null);
    try {
      const res = await fetch(`/api/ticketing-stadion/${encodeURIComponent(eventId)}/deel`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.url) throw new Error(data.error ?? `Status ${res.status}`);
      setUrl(data.url);
      try {
        await navigator.clipboard.writeText(data.url);
        setState("copied");
      } catch {
        // Geen toegang tot het klembord: dan de link tonen om zelf te kopiëren.
        setState("shown");
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
      setState("idle");
    }
  }

  return (
    <div className="space-y-2">
      <button type="button" onClick={share} disabled={state === "busy"} className="btn btn--medium btn--outlined inline-flex items-center justify-center gap-2 whitespace-nowrap">
        {state === "busy" ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : state === "copied" ? (
          <Check className="h-4 w-4" />
        ) : (
          <Link2 className="h-4 w-4" />
        )}
        {state === "copied" ? "Link gekopieerd" : "Deel link"}
      </button>
      {url && (
        <p className="text-xs text-muted-foreground max-w-md break-all">
          Iedereen met deze link ziet de pagina, zonder in te loggen:{" "}
          <a href={url} target="_blank" rel="noreferrer" className="text-foreground underline">
            {url}
          </a>
        </p>
      )}
      {error && <p className="text-xs text-error">{error}</p>}
    </div>
  );
}

/**
 * De wedstrijdpagina. Met `eventId` de interne pagina (met deellink en chat),
 * met `shareToken` de openbare versie via een deellink.
 */
export function TicketingStadionMatch(props: { eventId: string } | { shareToken: string }) {
  const shared = "shareToken" in props;
  const token = shared ? props.shareToken : "";
  const internalId = shared ? "" : props.eventId;
  const dataUrl = shared
    ? `/api/share/stadion?token=${encodeURIComponent(token)}`
    : `/api/ticketing-stadion/${encodeURIComponent(internalId)}`;
  const salesUrl = useCallback(
    (ids: string[]) =>
      shared
        ? `/api/share/stadion/verkoop?token=${encodeURIComponent(token)}&ids=${ids.join(",")}`
        : `/api/ticketing-stadion/verkoop?ids=${ids.join(",")}`,
    [shared, token]
  );

  const [data, setData] = useState<MatchResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchJson<MatchResponse>(dataUrl)
      .then((result) => {
        if (cancelled) return;
        setData(result);
        // Standaard dezelfde tegenstander de vorige keer, anders de laatste thuiswedstrijd.
        setCompareIds(
          result.comparison.sameOpponent
            ? [result.comparison.sameOpponent.eventId]
            : result.comparable.slice(0, 1).map((m) => m.productId)
        );
      })
      .catch((caught) => !cancelled && setError(caught instanceof Error ? caught.message : String(caught)));
    return () => {
      cancelled = true;
    };
  }, [dataUrl]);

  const back = shared ? null : (
    <Link
      href="/dashboard/ticketing-stadion"
      className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
    >
      <ArrowLeft className="h-3.5 w-3.5" />
      Alle wedstrijden
    </Link>
  );

  if (error) {
    return (
      <div className="space-y-4">
        {back}
        <Card>
          <CardContent className="p-6 flex items-start gap-2 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-primary" />
            <span>{error}</span>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="space-y-4">
        {back}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Laden…
        </div>
      </div>
    );
  }

  const { match, pace, comparison, freeGroups, seats, salesStatus } = data;
  const { total } = match;
  const groups = freeGroups.total;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        {back}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            {shared && <p className="label text-xs text-muted-foreground">PSV · Ticketing Stadion</p>}
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl">{match.name ?? "Onbekende wedstrijd"}</h1>
              <span className={`tag ${match.daysOut <= 7 ? "" : "tag--outlined"}`}>{daysLabel(match.daysOut)}</span>
            </div>
            <p className="text-muted-foreground">{formatEventDate(match.eventDate)}</p>
          </div>
          {!shared && <ShareButton eventId={match.eventId} />}
        </div>
      </div>

      {(!seats.capacityComplete || !seats.reservationComplete) && (
        <div className="alert alert--warning text-sm">
          Nog niet alle cijfers zijn betrouwbaar: de tool vult eenmalig capaciteit en reserveringen aan. Dat gaat vanzelf
          en duurt een paar uur.
        </div>
      )}

      <Card>
        <CardContent className="p-6 space-y-5">
          <div className="space-y-2">
            <div className="flex items-baseline justify-between gap-4">
              <p className="text-3xl font-heading tabular-nums">{share(total.sold, total.capacity)}</p>
              <p className="text-sm text-muted-foreground tabular-nums">
                {number.format(total.sold)} van {number.format(total.capacity)} verkocht
              </p>
            </div>
            <OccupancyBar row={total} />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
            <Stat label="Vrij" value={number.format(total.free)} hint="nog te koop" />
            <Stat label="Gereserveerd" value={number.format(total.reserved)} hint="nog niet afgenomen" />
            <Stat label="In de resale" value={number.format(total.resale)} hint="aangeboden door de houder" />
            <Stat
              label="Laatste 7 dagen"
              value={pace ? number.format(pace.last7Days) : "–"}
              hint={pace ? `${number.format(pace.today)} vandaag` : "nog geen verkoop per dag"}
            />
            <Stat
              label="Vrije stoelen naast elkaar"
              value={number.format(groups.two + groups.threeOrMore)}
              hint={`plekken voor 2 of meer · ${number.format(groups.one)} losse stoelen`}
            />
          </div>

          {(comparison.sameOpponent || comparison.previousSeason) && (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="label text-xs text-muted-foreground">
                Vergeleken met eerder, {match.daysOut === 0 ? "op de wedstrijddag" : `${match.daysOut} dagen voor de aftrap`}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {comparison.sameOpponent && (
                  <Delta
                    label={`${comparison.sameOpponent.name} (${comparison.sameOpponent.season})`}
                    own={comparison.soldBy}
                    reference={comparison.sameOpponent.soldBy}
                    detail={`Toen ${number.format(comparison.sameOpponent.soldBy)} verkocht op dit moment, eindstand ${number.format(comparison.sameOpponent.total)}.`}
                  />
                )}
                {comparison.previousSeason && (
                  <Delta
                    label={`Gemiddelde ${comparison.previousSeason.season}`}
                    own={comparison.soldBy}
                    reference={comparison.previousSeason.soldBy}
                    detail={`Gemiddeld ${number.format(comparison.previousSeason.soldBy)} op dit moment over ${comparison.previousSeason.matches} thuiswedstrijden, eindstand ${number.format(comparison.previousSeason.total)}.`}
                  />
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!shared && (
        <StadionChat
          eventId={match.eventId}
          compareIds={compareIds}
          suggestions={[
            "Hoeveel tweetjes zijn er nog?",
            "Welke vakken zijn het minst vol?",
            "Loopt de verkoop voor of achter op de vorige keer?",
            "Waar zitten nog 4 stoelen naast elkaar?",
          ]}
        />
      )}

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-xl">Bezetting per vak</h2>
              <p className="text-sm text-muted-foreground max-w-3xl">
                Wijs een vak aan voor de cijfers en de stoelen. Vrije stoelen naast elkaar in een rij:{" "}
                {number.format(groups.one)}× één stoel, {number.format(groups.two)}× twee stoelen en{" "}
                {number.format(groups.threeOrMore)}× drie of meer ({number.format(groups.seatsInThreeOrMore)} stoelen).
              </p>
            </div>
            {!shared && (
              <Link
                href="/dashboard/aangrenzende-stoelen"
                className="inline-flex items-center gap-1.5 text-xs font-heading uppercase tracking-wide text-muted-foreground hover:text-foreground transition-colors"
              >
                <Armchair className="h-3.5 w-3.5" />
                Aangrenzende stoelen
              </Link>
            )}
          </div>
          <StadiumOccupancyMap areas={match.areas} seatMaps={data.seatMaps} groupsByArea={freeGroups.byArea} />
          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
              Als tabel
            </summary>
            <div className="mt-2">
              <AreaTable rows={match.areas} />
            </div>
          </details>
          {match.otherTotal.sold + match.otherTotal.reserved > 0 && (
            <p className="text-xs text-muted-foreground">
              Niet meegeteld: {number.format(match.otherTotal.sold)} verkocht en{" "}
              {number.format(match.otherTotal.reserved)} gereserveerd in vakken buiten de plattegrond, zoals parkeren.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl">Aanbod</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Wat er nu nog te koop is: vrije plaatsen in de vrije verkoop en kaarten die houders in de resale hebben
              aangeboden. Een kaart in de resale is al verkocht en telt dus ook mee in de bezetting.
            </p>
          </div>
          <StadionSupplyChart total={match.total} areas={match.areas} />
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl">Verkoop per dag</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Afgezet tegen het aantal dagen tot de aftrap, zodat wedstrijden uit verschillende seizoenen naast elkaar
              passen. Zonder seizoenkaarten: alleen wat er voor deze wedstrijd zelf verkocht is (losse verkoop, resale en
              vrijkaarten). Standaard staat dezelfde tegenstander de vorige keer ernaast.
              {!salesStatus.complete && " De verkoop per dag is nog niet helemaal ingelezen; de lijnen zijn ondergrenzen."}
            </p>
          </div>
          <SalesSection data={data} salesUrl={salesUrl} selected={compareIds} setSelected={setCompareIds} />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        Stoelstatus van {formatDateTime(seats.caughtUpAt)}, verkoop per dag van {formatDateTime(salesStatus.updatedAt)}.
        De verkoop per dag telt geen reserveringen en geen seizoenkaarten.
      </p>
    </div>
  );
}
