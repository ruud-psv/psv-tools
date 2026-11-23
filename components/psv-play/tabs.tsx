"use client";

import { useState } from "react";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Clock, Eye, Play, Timer, CheckCircle2 } from "lucide-react";
import type { content, live, overzicht, publiek } from "@/lib/jwplayer/rapport";
import {
  CHART,
  CHART_TOOLTIP,
  DataTable,
  EmptySection,
  HoverTip,
  KpiCard,
  SectionCard,
  Td,
  Th,
  TotalTile,
  VolumeBar,
} from "@/components/paid-ads/shared";
import { cn } from "@/lib/utils";
import { datumKort, datumLang, delta, duur, getal, procent, uren } from "./format";

/* ---------- Types van de API (uit `lib/jwplayer/rapport.ts`) ---------- */

export type OverzichtData = Awaited<ReturnType<typeof overzicht>>;
type ContentAlles = Awaited<ReturnType<typeof content>>;
export type ContentData = Extract<ContentAlles, { top: unknown }>;
type LiveAlles = Awaited<ReturnType<typeof live>>;
export type LiveData = Extract<LiveAlles, { uitzendingen: unknown }>;
export type PubliekData = Awaited<ReturnType<typeof publiek>>;
export type Uitleg = { ok: true } | { ok: false; uitleg: string };

interface Verdeling {
  waarde: string;
  label: string;
  plays: number;
  kijktijd_uren: number;
  aandeel_plays_pct: number | null;
}

/* ---------- Overzicht ---------- */

type TrendMetric = "kijktijd_uren" | "plays" | "unieke_kijkers";
const TREND: { key: TrendMetric; label: string }[] = [
  { key: "kijktijd_uren", label: "Kijktijd (uren)" },
  { key: "plays", label: "Plays" },
  { key: "unieke_kijkers", label: "Unieke kijkers" },
];

export function OverzichtTab({ data }: { data: OverzichtData }) {
  const [trend, setTrend] = useState<TrendMetric>("kijktijd_uren");
  const k = data.kpis;
  const v = data.vorige;
  const d = data.delta_pct;
  const sub = (waarde: string) => `vorige periode: ${waarde}`;
  const reeks = data.per_dag.map((p) => ({ ...p, label: datumKort(p.datum) }));
  const trendLabel = TREND.find((t) => t.key === trend)!.label;

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="sm:col-span-2 lg:col-span-1 [&>div]:h-full [&>div]:border-psv-red-primary">
          <KpiCard
            label="Kijktijd (uren)"
            value={uren(k.kijktijd_uren)}
            delta={delta(d.kijktijd_uren).tekst}
            deltaTone={delta(d.kijktijd_uren).tone}
            sub={sub(uren(v.kijktijd_uren))}
            icon={<Clock className="h-4 w-4" />}
          />
        </div>
        <KpiCard
          label="Unieke kijkers"
          value={getal(k.unieke_kijkers)}
          delta={delta(d.unieke_kijkers).tekst}
          deltaTone={delta(d.unieke_kijkers).tone}
          sub={k.unieke_kijkers == null ? "niet in één query op te halen" : sub(getal(v.unieke_kijkers))}
          icon={<Eye className="h-4 w-4" />}
        />
        <KpiCard
          label="Plays"
          value={getal(k.plays)}
          delta={delta(d.plays).tekst}
          deltaTone={delta(d.plays).tone}
          sub={sub(getal(v.plays))}
          icon={<Play className="h-4 w-4" />}
        />
        <KpiCard
          label="Kijktijd per kijker"
          value={k.kijktijd_per_kijker_min == null ? "–" : `${getal(k.kijktijd_per_kijker_min, 1)} min`}
          delta={delta(d.kijktijd_per_kijker_min).tekst}
          deltaTone={delta(d.kijktijd_per_kijker_min).tone}
          sub={v.kijktijd_per_kijker_min == null ? undefined : sub(`${getal(v.kijktijd_per_kijker_min, 1)} min`)}
          icon={<Timer className="h-4 w-4" />}
        />
        <KpiCard
          label="Complete rate"
          value={procent(k.complete_rate_pct)}
          delta={delta(d.complete_rate_pct).tekst}
          deltaTone={delta(d.complete_rate_pct).tone}
          sub={sub(procent(v.complete_rate_pct))}
          icon={<CheckCircle2 className="h-4 w-4" />}
        />
      </div>

      <SectionCard
        title={`${trendLabel} per dag`}
        hint="JW-dagen (US Eastern)"
        action={
          <div className="flex overflow-hidden rounded-md border border-border">
            {TREND.map((t) => (
              <button
                key={t.key}
                onClick={() => setTrend(t.key)}
                className={cn(
                  "whitespace-nowrap px-3 py-1 font-heading text-xs uppercase tracking-wide transition-colors",
                  trend === t.key ? "bg-psv-red-primary text-white" : "bg-card text-muted-foreground hover:bg-muted"
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        }
      >
        {reeks.length ? (
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={reeks} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} minTickGap={24} />
                <YAxis tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} width={48} tickFormatter={(n: number) => getal(n)} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP}
                  labelStyle={{ color: "var(--color-white)" }}
                  formatter={(n) => [trend === "kijktijd_uren" ? `${getal(Number(n), 1)} uur` : getal(Number(n)), trendLabel]}
                  labelFormatter={(_l, p) => datumLang((p?.[0]?.payload as { datum?: string } | undefined)?.datum)}
                />
                <Area
                  type="monotone"
                  dataKey={trend}
                  stroke={CHART.primary}
                  strokeWidth={2}
                  fill={CHART.primary}
                  fillOpacity={0.12}
                  dot={false}
                  activeDot={{ r: 4 }}
                  connectNulls
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <EmptySection>Geen plays in deze periode.</EmptySection>
        )}
        {trend === "unieke_kijkers" && (
          <p className="mt-2 text-xs text-muted-foreground">Unieke kijkers per dag zijn niet op te tellen tot een periodetotaal; het totaal hierboven komt uit één query over de hele periode.</p>
        )}
      </SectionCard>
    </div>
  );
}

/* ---------- Content ---------- */

function Afhaakcurve({ curve }: { curve: ContentData["top"][number]["afhaakcurve"] }) {
  if (!curve) return <span className="text-xs text-muted-foreground">–</span>;
  const punten = [
    { label: "25%", w: curve.p25 },
    { label: "50%", w: curve.p50 },
    { label: "75%", w: curve.p75 },
    { label: "100%", w: curve.p100 },
  ];
  return (
    <HoverTip
      content={
        <span>
          Van de plays haalde {punten.map((p) => `${p.label}: ${procent(p.w, 0)}`).join(", ")}
        </span>
      }
      className="inline-flex"
    >
      <span className="sr-only">{punten.map((p) => `${p.label} ${procent(p.w, 0)}`).join(", ")}</span>
      <span className="flex h-6 items-end gap-[2px]" aria-hidden>
        {punten.map((p) => (
          <span key={p.label} className="w-2 rounded-t-sm bg-psv-red-primary" style={{ height: `${Math.max(4, p.w ?? 0)}%` }} />
        ))}
      </span>
    </HoverTip>
  );
}

function GroepTabel({ titel, groepen }: { titel: string; groepen: ContentData["per_type"] }) {
  return (
    <SectionCard title={titel} hint="aandeel in de kijktijd">
      {groepen.length ? (
        <DataTable>
          <thead>
            <tr className="border-b border-border">
              <Th>{titel.replace("Per ", "")}</Th>
              <Th align="right">Video&apos;s</Th>
              <Th align="right">Plays</Th>
              <Th align="right">Uren</Th>
              <Th>Aandeel kijktijd</Th>
              <Th align="right">Complete rate</Th>
            </tr>
          </thead>
          <tbody>
            {groepen.map((g) => (
              <tr key={g.groep} className="border-b border-border last:border-0">
                <Td>{g.groep}</Td>
                <Td align="right">{getal(g.videos)}</Td>
                <Td align="right">{getal(g.plays)}</Td>
                <Td align="right">{uren(g.kijktijd_uren)}</Td>
                <Td>
                  <div className="flex min-w-[120px] items-center gap-2">
                    <VolumeBar width={g.aandeel_kijktijd_pct ?? 0} />
                    <span className="w-12 text-right text-xs tabular-nums">{procent(g.aandeel_kijktijd_pct)}</span>
                  </div>
                </Td>
                <Td align="right">{procent(g.complete_rate_pct)}</Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      ) : (
        <EmptySection />
      )}
    </SectionCard>
  );
}

export function ContentTab({ data, afhaak }: { data: ContentData; afhaak: Uitleg }) {
  const o = data.ongecategoriseerd;
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-3">
        <TotalTile label="Video's met kijkers" value={getal(data.videos_met_kijkers)} />
        <TotalTile label="Ongecategoriseerd (kijktijd)" value={procent(o.aandeel_kijktijd_pct)} />
        <TotalTile label="Video's zonder type-tag" value={getal(o.videos)} />
      </div>
      {(o.aandeel_kijktijd_pct ?? 0) > 0 && (
        <p className="text-sm text-muted-foreground">
          {procent(o.aandeel_kijktijd_pct)} van de kijktijd ({uren(o.kijktijd_uren)} uur) ging naar video&apos;s zonder{" "}
          <code className="rounded-sm bg-muted px-1 text-xs">type:</code>-tag. Geef die video&apos;s in JW Player een tag, zoals{" "}
          <code className="rounded-sm bg-muted px-1 text-xs">type:persconferentie</code>, dan tellen ze mee per type.
        </p>
      )}

      <SectionCard title="Top-video's op kijktijd" hint={data.videos_na_filter !== data.videos_met_kijkers ? `${getal(data.videos_na_filter)} na filter` : undefined}>
        {data.top.length ? (
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th>Video</Th>
                <Th>Gepubliceerd</Th>
                <Th align="right">Plays</Th>
                <Th align="right">Uren</Th>
                <Th align="right">Unieke kijkers</Th>
                <Th align="right">Complete rate</Th>
                <Th>Afhaakcurve</Th>
              </tr>
            </thead>
            <tbody>
              {data.top.map((v) => (
                <tr key={v.media_id} className="border-b border-border last:border-0">
                  <Td>
                    <p className="font-bold">{v.titel}</p>
                    <p className="text-xs text-muted-foreground">
                      {[v.type, v.team !== "Geen team" ? v.team : null, v.duur_sec ? duur(v.duur_sec) : null].filter(Boolean).join(" · ")}
                    </p>
                  </Td>
                  <Td className="whitespace-nowrap">{datumKort(v.gepubliceerd)}</Td>
                  <Td align="right">{getal(v.plays)}</Td>
                  <Td align="right">{uren(v.kijktijd_uren)}</Td>
                  <Td align="right">{getal(v.unieke_kijkers)}</Td>
                  <Td align="right">{procent(v.complete_rate_pct)}</Td>
                  <Td>
                    <Afhaakcurve curve={v.afhaakcurve} />
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptySection>Geen video&apos;s met plays in deze periode.</EmptySection>
        )}
        <p className="mt-3 text-xs text-muted-foreground">
          {afhaak.ok
            ? "Afhaakcurve: welk deel van de plays 25, 50, 75 en 100% van de video haalde. Alleen voor video's langer dan 30 seconden."
            : afhaak.uitleg}{" "}
          Unieke kijkers per video tellen niet op tot een totaal.
        </p>
      </SectionCard>

      <div className="grid gap-5 xl:grid-cols-2">
        <GroepTabel titel="Per type" groepen={data.per_type} />
        <GroepTabel titel="Per team" groepen={data.per_team} />
      </div>
    </div>
  );
}

/* ---------- Live ---------- */

export function LiveTab({ data }: { data: LiveData }) {
  return (
    <div className="space-y-5">
      <SectionCard title="Live-uitzendingen" hint="live = playback mode LIVE of DVR">
        {data.uitzendingen.length ? (
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th>Datum</Th>
                <Th>Uitzending</Th>
                <Th align="right">Live-plays</Th>
                <Th align="right">Unieke kijkers</Th>
                <Th align="right">Uren live</Th>
                <Th align="right">Nakijk-plays</Th>
                <Th align="right">Uren nakijken</Th>
              </tr>
            </thead>
            <tbody>
              {data.uitzendingen.map((u) => (
                <tr key={u.media_id} className="border-b border-border last:border-0">
                  <Td className="whitespace-nowrap">{datumKort(u.datum)}</Td>
                  <Td>
                    <p className="font-bold">{u.titel}</p>
                    <p className="text-xs text-muted-foreground">
                      {u.type}
                      {u.nakijk.opnames.length ? ` · opname: ${u.nakijk.opnames.join(", ")}` : ""}
                    </p>
                  </Td>
                  <Td align="right">{getal(u.live.plays)}</Td>
                  <Td align="right">{getal(u.live.unieke_kijkers)}</Td>
                  <Td align="right">{uren(u.live.kijktijd_uren)}</Td>
                  <Td align="right">
                    <HoverTip content={`Tot en met ${datumLang(u.nakijk.tot_en_met)}`} className="inline-block">
                      {getal(u.nakijk.plays)}
                    </HoverTip>
                  </Td>
                  <Td align="right">{uren(u.nakijk.kijktijd_uren)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        ) : (
          <EmptySection>Geen live-uitzendingen met plays in deze periode.</EmptySection>
        )}
      </SectionCard>

      {data.per_type.length > 0 && (
        <SectionCard title="Vergelijking per type" hint="gemiddeld per uitzending">
          <DataTable>
            <thead>
              <tr className="border-b border-border">
                <Th>Type</Th>
                <Th align="right">Uitzendingen</Th>
                <Th align="right">Live-plays</Th>
                <Th align="right">Nakijk-plays</Th>
                <Th align="right">Uren (live + nakijken)</Th>
              </tr>
            </thead>
            <tbody>
              {data.per_type.map((t) => (
                <tr key={t.type} className="border-b border-border last:border-0">
                  <Td>{t.type}</Td>
                  <Td align="right">{getal(t.uitzendingen)}</Td>
                  <Td align="right">{getal(t.gem_live_plays)}</Td>
                  <Td align="right">{getal(t.gem_nakijk_plays)}</Td>
                  <Td align="right">{uren(t.gem_kijktijd_uren)}</Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        </SectionCard>
      )}
      <p className="text-xs text-muted-foreground">
        Nakijken telt de on-demand plays van dezelfde video plus die van een opname met dezelfde titel (tot drie dagen later gepubliceerd),
        vanaf de uitzenddag tot en met zeven dagen erna.
      </p>
    </div>
  );
}

/* ---------- Publiek ---------- */

function VerdelingLijst({ rijen }: { rijen: Verdeling[] }) {
  return (
    <ul className="space-y-2">
      {rijen.map((r) => (
        <li key={r.waarde} className="flex items-center gap-3 text-sm">
          <span className="w-36 shrink-0 truncate" title={r.label}>
            {r.label}
          </span>
          <VolumeBar width={r.aandeel_plays_pct ?? 0} />
          <span className="w-14 shrink-0 text-right tabular-nums">{procent(r.aandeel_plays_pct)}</span>
          <span className="hidden w-20 shrink-0 text-right text-xs tabular-nums text-muted-foreground sm:block">{getal(r.plays)} plays</span>
        </li>
      ))}
    </ul>
  );
}

export function PubliekTab({ data, onderdelen }: { data: PubliekData; onderdelen: Record<string, Uitleg> }) {
  const d = data as Record<string, unknown>;
  const device = d.device as Verdeling[] | null;
  const platform = d.platform as Verdeling[] | null;
  const browser = d.browser as Verdeling[] | null;
  const videoduur = d.videoduur as Verdeling[] | null;
  const land = d.land as {
    top10: Verdeling[];
    nederland_pct: number | null;
    buitenland_totaal: { landen: number; plays: number; kijktijd_uren: number; aandeel_plays_pct: number | null };
  } | null;
  const uitleg = (o: string) => (onderdelen[o] && !onderdelen[o].ok ? (onderdelen[o] as { uitleg: string }).uitleg : undefined);

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <SectionCard title="Device" hint="aandeel in de plays">
        {device ? device.length ? <VerdelingLijst rijen={device} /> : <EmptySection /> : <EmptySection>{uitleg("device")}</EmptySection>}
      </SectionCard>
      <SectionCard title="Platform" hint="aandeel in de plays">
        {platform ? platform.length ? <VerdelingLijst rijen={platform} /> : <EmptySection /> : <EmptySection>{uitleg("platform")}</EmptySection>}
        {platform?.length === 1 && (
          <p className="mt-3 text-xs text-muted-foreground">
            Alle plays kwamen via één platform. Device en browser laten beter zien waarop er gekeken wordt.
          </p>
        )}
      </SectionCard>
      <SectionCard title="Browser" hint="top 10 op plays">
        {browser ? browser.length ? <VerdelingLijst rijen={browser} /> : <EmptySection /> : <EmptySection>{uitleg("browser")}</EmptySection>}
      </SectionCard>
      <SectionCard title="Videoduur" hint="lengte van de video, in de groepen van JW">
        {videoduur ? videoduur.length ? <VerdelingLijst rijen={videoduur} /> : <EmptySection /> : <EmptySection>{uitleg("videoduur")}</EmptySection>}
        {videoduur && videoduur.length > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">Hoe lang de bekeken video&apos;s zijn, niet hoe lang er gekeken is.</p>
        )}
      </SectionCard>
      <SectionCard title="Land" hint="top 10 op plays" className="xl:col-span-2">
        {land ? (
          <div className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-3">
              <TotalTile label="Nederland" value={procent(land.nederland_pct)} />
              <TotalTile label="Buitenland totaal" value={procent(land.buitenland_totaal.aandeel_plays_pct)} />
              <TotalTile label="Landen buiten Nederland" value={getal(land.buitenland_totaal.landen)} />
            </div>
            {land.top10.length ? <VerdelingLijst rijen={land.top10} /> : <EmptySection />}
          </div>
        ) : (
          <EmptySection>{uitleg("land")}</EmptySection>
        )}
      </SectionCard>
    </div>
  );
}
