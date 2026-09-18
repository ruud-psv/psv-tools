"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Campaign, OverlapResult } from "@/lib/database/types";
import {
  AXIS_PROPS,
  GRID_PROPS,
  Notice,
  OUTCOME_COLORS,
  StatTile,
  TOOLTIP_PROPS,
  formatDate,
  formatNumber,
  formatPercent,
} from "@/components/database/shared";

interface Props {
  campaigns: Campaign[];
}

export function OverviewTab({ campaigns }: Props) {
  const [overlap, setOverlap] = useState<OverlapResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch("/api/database/overlap", { cache: "no-store" })
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error ?? "Ophalen mislukt.");
        return data as OverlapResult;
      })
      .then((data) => {
        if (!cancelled) {
          setOverlap(data);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [campaigns]);

  const analyzed = useMemo(
    () => campaigns.filter((c) => c.analysis !== null),
    [campaigns]
  );

  const totals = useMemo(() => {
    return analyzed.reduce(
      (acc, c) => ({
        participations: acc.participations + c.participations,
        unique: acc.unique + c.uniqueParticipants,
        isNew: acc.isNew + (c.analysis?.isNew ?? 0),
        existing: acc.existing + (c.analysis?.existing ?? 0),
        unknown: acc.unknown + (c.analysis?.unknown ?? 0),
      }),
      { participations: 0, unique: 0, isNew: 0, existing: 0, unknown: 0 }
    );
  }, [analyzed]);

  /** Oudste eerst: een reeks campagnes leest chronologisch. */
  const chartRows = useMemo(
    () =>
      [...analyzed]
        .sort((a, b) => a.startDate.localeCompare(b.startDate))
        .map((c) => ({
          label: c.title.length > 22 ? `${c.title.slice(0, 21)}…` : c.title,
          Nieuw: c.analysis?.isNew ?? 0,
          Bestaand: c.analysis?.existing ?? 0,
          Onbekend: c.analysis?.unknown ?? 0,
        })),
    [analyzed]
  );

  const downloadCsv = useCallback(() => {
    const header = [
      "Campagne",
      "Start",
      "Einde",
      "Deelnames",
      "Unieke deelnemers",
      "Nieuw",
      "Bestaand",
      "Onbekend",
      "Nieuw %",
    ];
    // Puntkomma's en CRLF: zo opent Excel in een NL-locale het bestand direct
    // goed, zonder importwizard.
    const escape = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [...campaigns]
      .sort((a, b) => a.startDate.localeCompare(b.startDate))
      .map((c) =>
        [
          escape(c.title),
          c.startDate,
          c.endDate,
          c.participations,
          c.uniqueParticipants,
          c.analysis?.isNew ?? "",
          c.analysis?.existing ?? "",
          c.analysis?.unknown ?? "",
          c.analysis
            ? formatPercent(c.analysis.isNew, c.uniqueParticipants).replace("%", "")
            : "",
        ].join(";")
      );

    const csv = `﻿${[header.join(";"), ...rows].join("\r\n")}`;
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `database-campagnes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [campaigns]);

  if (campaigns.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Nog geen campagnes om te vergelijken.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Campagnes" value={formatNumber(campaigns.length)} />
        <StatTile
          label="Deelnames totaal"
          value={formatNumber(totals.participations)}
          sub={`${formatNumber(totals.unique)} unieke deelnemers per campagne opgeteld`}
        />
        <StatTile
          label="Nieuwe records"
          value={formatNumber(totals.isNew)}
          sub={`${formatPercent(totals.isNew, totals.unique)} van alle deelnemers`}
          accent={OUTCOME_COLORS.isNew}
        />
        <StatTile
          label="Al bekend"
          value={formatNumber(totals.existing)}
          sub={
            totals.unknown
              ? `${formatNumber(totals.unknown)} onbekend`
              : "alles teruggevonden"
          }
        />
      </div>

      {analyzed.length < campaigns.length && (
        <Notice tone="info">
          {campaigns.length - analyzed.length} campagne
          {campaigns.length - analyzed.length === 1 ? "" : "s"} zonder analyse telt nog
          niet mee in de totalen hierboven.
        </Notice>
      )}

      {chartRows.length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Uitkomst per campagne</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={Math.max(220, chartRows.length * 44)}>
              <BarChart
                data={chartRows}
                layout="vertical"
                margin={{ top: 4, right: 16, left: 0, bottom: 0 }}
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis type="number" {...AXIS_PROPS} />
                <YAxis type="category" dataKey="label" {...AXIS_PROPS} width={150} />
                <Tooltip {...TOOLTIP_PROPS} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Nieuw" stackId="a" fill={OUTCOME_COLORS.isNew} />
                <Bar dataKey="Bestaand" stackId="a" fill={OUTCOME_COLORS.existing} />
                <Bar dataKey="Onbekend" stackId="a" fill={OUTCOME_COLORS.unknown} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Tabel */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <CardTitle className="text-base">Alle campagnes</CardTitle>
          <Button variant="outline" size="sm" onClick={downloadCsv}>
            <Download className="h-4 w-4" />
            CSV
          </Button>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {["Campagne", "Periode"].map((label) => (
                    <th
                      key={label}
                      className="py-2 pr-4 font-heading text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {label}
                    </th>
                  ))}
                  {["Deelnames", "Uniek", "Nieuw", "Bestaand", "Onbekend", "Nieuw %"].map(
                    (label) => (
                      <th
                        key={label}
                        className="py-2 pr-4 text-right font-heading text-xs uppercase tracking-wide text-muted-foreground"
                      >
                        {label}
                      </th>
                    )
                  )}
                </tr>
              </thead>
              <tbody>
                {[...campaigns]
                  .sort((a, b) => a.startDate.localeCompare(b.startDate))
                  .map((c) => (
                    <tr key={c.id} className="border-b border-border/60">
                      <td className="py-2 pr-4">{c.title}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {formatDate(c.startDate)} – {formatDate(c.endDate)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatNumber(c.participations)}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {formatNumber(c.uniqueParticipants)}
                      </td>
                      <td className="py-2 pr-4 text-right font-medium tabular-nums text-psv-red-primary">
                        {c.analysis ? formatNumber(c.analysis.isNew) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.analysis ? formatNumber(c.analysis.existing) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.analysis ? formatNumber(c.analysis.unknown) : "—"}
                      </td>
                      <td className="py-2 pr-4 text-right tabular-nums">
                        {c.analysis
                          ? formatPercent(c.analysis.isNew, c.uniqueParticipants)
                          : "—"}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Overlap */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Overlap tussen campagnes</CardTitle>
          <p className="text-sm text-muted-foreground">
            Hoeveel dezelfde mensen aan twee campagnes meededen. De diagonaal is het
            aantal unieke deelnemers van de campagne zelf.
          </p>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Overlap berekenen
            </p>
          )}
          {error && (
            <Notice tone="error" title="Mislukt">
              {error}
            </Notice>
          )}
          {overlap && !loading && <OverlapTable overlap={overlap} />}
        </CardContent>
      </Card>
    </div>
  );
}

function OverlapTable({ overlap }: { overlap: OverlapResult }) {
  const { campaigns, matrix, participation } = overlap;

  /** De zwaarste overlap buiten de diagonaal bepaalt de kleurschaal. */
  const peak = useMemo(() => {
    let max = 0;
    for (let i = 0; i < matrix.length; i++) {
      for (let j = 0; j < matrix.length; j++) {
        if (i !== j && matrix[i][j] > max) max = matrix[i][j];
      }
    }
    return max;
  }, [matrix]);

  if (campaigns.length < 2) {
    return (
      <p className="py-4 text-sm text-muted-foreground">
        Overlap komt in beeld zodra er twee campagnes zijn.
      </p>
    );
  }

  const multi = participation.slice(1).reduce((sum, count) => sum + (count ?? 0), 0);
  const total = participation.reduce((sum, count) => sum + (count ?? 0), 0);

  return (
    <div className="space-y-6">
      <div className="overflow-x-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className="sticky left-0 bg-card py-2 pr-4 text-left font-heading text-xs uppercase tracking-wide text-muted-foreground">
                Campagne
              </th>
              {campaigns.map((c, i) => (
                <th
                  key={c.id}
                  title={c.title}
                  className="px-2 py-2 text-center font-heading text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {i + 1}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {campaigns.map((row, i) => (
              <tr key={row.id}>
                <td className="sticky left-0 whitespace-nowrap bg-card py-1.5 pr-4">
                  <span className="text-muted-foreground">{i + 1}.</span> {row.title}
                </td>
                {campaigns.map((col, j) => {
                  const value = matrix[i][j];
                  const diagonal = i === j;
                  // Doorzichtig rood schaalt mee met de zwaarste overlap, zodat
                  // je de uitschieters ziet zonder de getallen te lezen.
                  const intensity = !diagonal && peak > 0 ? value / peak : 0;
                  return (
                    <td
                      key={col.id}
                      className="px-2 py-1.5 text-center tabular-nums"
                      style={{
                        background: diagonal
                          ? "hsl(var(--muted))"
                          : intensity > 0
                            ? `rgba(232, 32, 38, ${(0.08 + intensity * 0.5).toFixed(3)})`
                            : undefined,
                      }}
                      title={
                        diagonal
                          ? `${row.title}: ${formatNumber(value)} unieke deelnemers`
                          : `${row.title} × ${col.title}: ${formatNumber(value)} dezelfde mensen`
                      }
                    >
                      {diagonal ? (
                        <span className="text-muted-foreground">{formatNumber(value)}</span>
                      ) : (
                        formatNumber(value)
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div>
        <p className="mb-2 font-heading text-xs uppercase tracking-wide text-muted-foreground">
          Aan hoeveel campagnes deed iemand mee
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {participation.map((count, i) => (
            <StatTile
              key={i}
              label={`${i + 1} campagne${i === 0 ? "" : "s"}`}
              value={formatNumber(count ?? 0)}
              sub={formatPercent(count ?? 0, total)}
              accent={i > 0 ? OUTCOME_COLORS.isNew : undefined}
            />
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          {formatNumber(total)} unieke mensen deden aan minstens één campagne mee,
          waarvan {formatNumber(multi)} ({formatPercent(multi, total)}) aan meer dan één.
        </p>
      </div>
    </div>
  );
}
