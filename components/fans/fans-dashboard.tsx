"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Line,
  LineChart,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Info, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge, CHART, CHART_TOOLTIP, DataTable, HoverTip, SectionCard, Td, Th } from "@/components/paid-ads/shared";
import { datumKort, datumLang, getal } from "@/components/psv-play/format";
import type { ActivePunt, MaandWaarde, Overzicht } from "@/lib/fans/bereken";
import type { Niveau } from "@/lib/fans/doelen";
import { maandenTussen } from "@/lib/fans/tijd";
import { vennVorm } from "@/lib/fans/venn";
import type { Tone } from "@/lib/paid-ads/derive";
import { cn } from "@/lib/utils";

/* ---------- Opmaak ---------- */

const MAANDEN_KORT = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
const MAANDEN = ["januari", "februari", "maart", "april", "mei", "juni", "juli", "augustus", "september", "oktober", "november", "december"];

function maandKort(maand: string): string {
  return MAANDEN_KORT[Number(maand.slice(5, 7)) - 1];
}

function maandLang(maand: string): string {
  return `${MAANDEN[Number(maand.slice(5, 7)) - 1]} ${maand.slice(0, 4)}`;
}

/** `+8.879` of `−1.234`. */
function metTeken(n: number): string {
  return `${n < 0 ? "−" : "+"}${getal(Math.abs(n))}`;
}

function duizend(n: number): string {
  return `${getal(n / 1000, n % 1000 === 0 ? 0 : 1)}k`;
}

/** Niveau 3 is het doel: groen vanaf daar, oranje voor 2, rood voor 1. */
function toneVoor(niveau: number | null | undefined): Tone {
  if (niveau == null) return "neutral";
  return niveau >= 3 ? "good" : niveau === 2 ? "warn" : "bad";
}

function bereik(n: Niveau): string {
  if (n.van == null) return `t/m ${getal(n.tot)}`;
  if (n.tot == null) return `vanaf ${getal(n.van)}`;
  return `${getal(n.van)} – ${getal(n.tot)}`;
}

const STATUS_TEKST: Record<MaandWaarde["status"], string> = {
  volledig: "Volle maand",
  lopend: "Loopt nog",
  onvolledig: "Niet volledig geteld",
};

const tijd = (datum: string) => Date.parse(`${datum}T00:00:00Z`);

/* ---------- Data ---------- */

interface Antwoord {
  overzicht: Overzicht;
  status: { lastRunAt: string | null; lastError: string | null; bezig: boolean };
}

export function FansDashboard() {
  const [data, setData] = useState<Antwoord | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const [laden, setLaden] = useState(true);
  const [bijwerken, setBijwerken] = useState<{ bezig: boolean; melding: string | null }>({ bezig: false, melding: null });

  const haal = useCallback(async () => {
    setLaden(true);
    setFout(null);
    try {
      const r = await fetch("/api/fans", { cache: "no-store" });
      const body = await r.json();
      if (!r.ok) throw new Error(body.error ?? `Fout ${r.status}`);
      setData(body);
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setLaden(false);
    }
  }, []);

  useEffect(() => {
    void haal();
  }, [haal]);

  async function nuBijwerken() {
    setBijwerken({ bezig: true, melding: null });
    try {
      const r = await fetch("/api/fans/snapshot", { cache: "no-store" });
      const body = await r.json().catch(() => ({}));
      if (r.status === 409) setBijwerken({ bezig: false, melding: "Er loopt al een telling. Probeer het over een paar minuten opnieuw." });
      else if (!r.ok) setBijwerken({ bezig: false, melding: body.error ?? `Bijwerken mislukt (${r.status}).` });
      else
        setBijwerken({
          bezig: false,
          melding: body.chained ? "Maileon wordt vanaf 1 juli ingelezen. Dat loopt op de achtergrond door; kijk over een kwartier opnieuw." : null,
        });
    } catch (e) {
      setBijwerken({ bezig: false, melding: e instanceof Error ? e.message : String(e) });
    }
    await haal();
  }

  if (!data) {
    return fout ? (
      <div className="alert alert--error flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{fout}</span>
      </div>
    ) : (
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
        Cijfers ophalen…
      </div>
    );
  }

  const o = data.overzicht;
  return (
    <div className="space-y-6">
      {fout && (
        <div className="alert alert--error flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{fout}</span>
        </div>
      )}

      {!o.automatisch.mijnpsvLaatste && (
        <div className="alert alert--info flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {!o.automatisch.mijnpsvGekoppeld
              ? "BlueConic (MijnPSV) is nog niet gekoppeld."
              : data.status.lastError?.startsWith("MijnPSV:")
                ? `BlueConic (MijnPSV) lezen lukte nog niet. ${data.status.lastError.replace(/^MijnPSV:\s*/, "")}`
                : "BlueConic (MijnPSV) is ingesteld maar nog niet gelezen. Dat gebeurt bij de eerste telling nadat Maileon is bijgewerkt."}{" "}
            Tot die tijd komen de totalen uit de handmatige updates.
            {o.automatisch.maileonTot ? ` Maileon is ingelezen tot en met ${datumLang(o.automatisch.maileonTot)}.` : ""}
          </span>
        </div>
      )}

      <Samenvatting o={o} />

      <div className="grid gap-4 lg:grid-cols-2">
        <EngagedKaart o={o} />
        <ActiveKaart o={o} />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <EngagedGrafiek o={o} />
        <ActiveGrafiek o={o} />
      </div>

      <Herkomst o={o} />

      <Toelichting />

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <span>
          Laatst bijgewerkt:{" "}
          {data.status.lastRunAt
            ? new Date(data.status.lastRunAt).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Amsterdam" })
            : "nog niet automatisch"}
          . De telling draait elke avond.
        </span>
        {data.status.lastError && <span className="text-error">Laatste fout: {data.status.lastError}</span>}
        {bijwerken.melding && <span>{bijwerken.melding}</span>}
        <button
          onClick={nuBijwerken}
          disabled={bijwerken.bezig || laden || data.status.bezig}
          className="ml-auto inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw className={cn("h-4 w-4", (bijwerken.bezig || data.status.bezig) && "animate-spin")} />
          {bijwerken.bezig || data.status.bezig ? "Bezig met tellen…" : "Nu bijwerken"}
        </button>
      </div>
    </div>
  );
}

/* ---------- Samenvatting ---------- */

function Samenvatting({ o }: { o: Overzicht }) {
  const e = o.engaged;
  const a = o.active;
  if (!e && !a) return null;
  return (
    <p className="max-w-3xl text-base">
      {e && (
        <>
          Engaged Fans komt gemiddeld uit op <b className="tabular-nums">{getal(e.gemiddelde)}</b> per volle maand, goed voor niveau{" "}
          <b>{e.niveau}</b>.{" "}
        </>
      )}
      {a && (
        <>
          Active Fans staat op <b className="tabular-nums">{getal(a.laatste.totaal)}</b> unieke fans sinds 1 juli.
          {a.prognose != null && a.model && (
            <>
              {" "}
              {a.model.methode === "verzadiging"
                ? "Neemt de groei verder af zoals in de afgelopen weken, dan komt het seizoen uit rond "
                : "Blijft de groei zoals in de afgelopen weken, dan komt het seizoen uit rond "}
              <b className="tabular-nums">{getal(a.prognose)}</b>, goed voor niveau <b>{a.niveauPrognose}</b>.
            </>
          )}
        </>
      )}
    </p>
  );
}

/* ---------- Doelkaarten ---------- */

function KaartKop({ label, venster }: { label: string; venster: string }) {
  return (
    <div>
      <p className="font-heading text-lg uppercase leading-tight tracking-wide">{label}</p>
      <p className="text-xs text-muted-foreground">{venster}</p>
    </div>
  );
}

function EngagedKaart({ o }: { o: Overzicht }) {
  const e = o.engaged;
  return (
    <Card className="space-y-4 p-5">
      <KaartKop
        label="Engaged Fans"
        venster={e ? `Gemiddelde per volle maand · ${maandKort(e.eerste)} t/m ${maandKort(e.laatste)}` : "Gemiddelde per volle maand"}
      />
      {e ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-5xl leading-none tabular-nums">{getal(e.gemiddelde)}</p>
            <Badge tone={toneVoor(e.niveau)}>Niveau {e.niveau}</Badge>
          </div>
          <Niveauschaal
            niveaus={o.seizoen.engaged}
            accent={e.niveau}
            hoofd={{ waarde: e.gemiddelde, label: `gem. ${getal(e.gemiddelde)}` }}
            neven={e.inclLopend ? { waarde: e.inclLopend.gemiddelde, label: `incl. ${maandKort(e.inclLopend.maand)}: ${getal(e.inclLopend.gemiddelde)}` } : null}
          />
          <div className="space-y-1 text-sm text-muted-foreground">
            {e.volgende == null && e.boven != null && (
              <p>
                Dat is <b className="text-foreground">{getal(e.boven)}</b> boven de ondergrens van niveau {e.niveau}.
              </p>
            )}
            {e.volgende != null && e.tekort != null && (
              <p>
                Het gemiddelde moet nog <b className="text-foreground">{getal(e.tekort)}</b> omhoog voor niveau {e.volgende}.
              </p>
            )}
            {e.inclLopend && (
              <p>
                Tel je {MAANDEN[Number(e.inclLopend.maand.slice(5, 7)) - 1]} mee
                {e.inclLopend.tm ? ` (t/m ${datumKort(e.inclLopend.tm)})` : ""}, dan is het gemiddelde{" "}
                <b className="text-foreground">{getal(e.inclLopend.gemiddelde)}</b>, niveau {e.inclLopend.niveau}.
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nog geen volle maand geteld.</p>
      )}
    </Card>
  );
}

function ActiveKaart({ o }: { o: Overzicht }) {
  const a = o.active;
  return (
    <Card className="space-y-4 p-5">
      <KaartKop label="Active Fans" venster={a ? `Unieke fans sinds 1 juli · t/m ${datumLang(a.laatste.datum)}` : "Unieke fans sinds 1 juli"} />
      {a ? (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <p className="font-heading text-5xl leading-none tabular-nums">{getal(a.laatste.totaal)}</p>
            {a.niveauPrognose != null && <Badge tone={toneVoor(a.niveauPrognose)}>Prognose niveau {a.niveauPrognose}</Badge>}
          </div>
          <Niveauschaal
            niveaus={o.seizoen.active}
            accent={a.niveauPrognose ?? a.niveau}
            hoofd={
              a.prognose != null
                ? { waarde: a.prognose, label: `prognose ${datumKort(o.seizoen.eind)}: ± ${getal(a.prognose)}` }
                : { waarde: a.laatste.totaal, label: `nu: ${getal(a.laatste.totaal)}` }
            }
            neven={a.prognose != null ? { waarde: a.laatste.totaal, label: `nu: ${getal(a.laatste.totaal)}` } : null}
          />
          <div className="space-y-1 text-sm text-muted-foreground">
            {a.tempo && a.tempo.groei >= 0 && (
              <p>
                In de afgelopen {a.tempo.dagen} dagen kwamen er <b className="text-foreground">{getal(a.tempo.groei)}</b> bij,{" "}
                <b className="text-foreground">{getal(a.tempo.perDag)}</b> per dag.
              </p>
            )}
            {a.tempo && a.tempo.groei < 0 && (
              <p>
                Het aantal ligt <b className="text-foreground">{getal(-a.tempo.groei)}</b> lager dan {a.tempo.dagen} dagen eerder. Een uniek
                totaal kan niet dalen; controleer de bronnen.
              </p>
            )}
            {a.model?.methode === "verzadiging" && (
              <p>
                De groei per dag neemt af met zo&apos;n <b className="text-foreground">{getal(a.model.afnamePerMaand * 100)}%</b> per maand,
                omdat terugkerende fans niet opnieuw tellen. Nu is dat zo&apos;n <b className="text-foreground">{getal(a.model.tempoNu)}</b> per dag.
              </p>
            )}
            {a.nodig.length > 0 && (
              <p>
                Tot {datumLang(o.seizoen.eind)} is per dag nodig:{" "}
                {a.nodig.map((n, i) => (
                  <span key={n.niveau}>
                    {i > 0 && " en "}
                    <b className="text-foreground">{getal(n.perDag)}</b> voor niveau {n.niveau}
                  </span>
                ))}
                .
              </p>
            )}
          </div>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">Nog geen telling.</p>
      )}
    </Card>
  );
}

/**
 * De vijf niveaus op schaal, het niveau van de hoofdwaarde in PSV-rood. De
 * hoofdwaarde staat erboven, een tweede waarde (lopende maand, stand nu) eronder.
 */
function Niveauschaal({
  niveaus,
  accent,
  hoofd,
  neven,
}: {
  niveaus: Niveau[];
  accent: number;
  hoofd: { waarde: number; label: string };
  neven: { waarde: number; label: string } | null;
}) {
  const grenzen = niveaus.flatMap((n) => (n.van == null ? [] : [n.van]));
  const span = Math.max(...grenzen) - Math.min(...grenzen);
  const stap = span > 10_000 ? 5_000 : 500;
  const waarden = [hoofd.waarde, ...(neven ? [neven.waarde] : [])];
  const lo = Math.floor(Math.min(Math.min(...grenzen) - span * 0.35, Math.min(...waarden) - span * 0.05) / stap) * stap;
  const hi = Math.ceil(Math.max(Math.max(...grenzen) + span * 0.35, Math.max(...waarden) + span * 0.05) / stap) * stap;
  const pct = (v: number) => Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100));
  const segmenten = niveaus.map((n, i) => ({ ...n, breedte: pct(niveaus[i + 1]?.van ?? hi) - pct(n.van ?? lo) }));

  const label = (p: number) => ({
    left: `${p}%`,
    transform: p < 12 ? "translateX(0)" : p > 88 ? "translateX(-100%)" : "translateX(-50%)",
  });

  return (
    <div className="space-y-1">
      <div className="relative h-4">
        <span className="absolute whitespace-nowrap text-xs font-bold tabular-nums" style={label(pct(hoofd.waarde))}>
          {hoofd.label}
        </span>
      </div>
      <div className="relative">
        <div className="flex h-5 gap-[2px]" role="img" aria-label={`Niveauschaal. ${hoofd.label}, niveau ${accent}.`}>
          {segmenten.map((s) => (
            <HoverTip
              key={s.niveau}
              content={`Niveau ${s.niveau}: ${bereik(s)}`}
              className={cn(
                "flex h-full items-center justify-center rounded-sm font-heading text-xs",
                s.niveau === accent ? "bg-psv-red-primary text-white" : "bg-psv-gray-07 text-muted-foreground"
              )}
              style={{ flexGrow: Math.max(s.breedte, 0.5), flexBasis: 0 }}
            >
              {s.breedte > 5 ? s.niveau : null}
            </HoverTip>
          ))}
        </div>
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1.5 h-8 w-0.5 -translate-x-1/2 bg-psv-neutralDark ring-2 ring-card"
          style={{ left: `${pct(hoofd.waarde)}%` }}
        />
        {neven && (
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 h-7 w-0.5 -translate-x-1/2 bg-psv-gray-09 ring-2 ring-card"
            style={{ left: `${pct(neven.waarde)}%` }}
          />
        )}
      </div>
      {neven && (
        <div className="relative h-4">
          <span className="absolute whitespace-nowrap text-xs tabular-nums text-muted-foreground" style={label(pct(neven.waarde))}>
            {neven.label}
          </span>
        </div>
      )}
    </div>
  );
}

/* ---------- Engaged Fans per maand ---------- */

function EngagedGrafiek({ o }: { o: Overzicht }) {
  const grens5 = o.seizoen.engaged.find((n) => n.niveau === 5)?.van ?? null;
  // Alle maanden van het seizoen, ook de komende: dan is te zien hoeveel er nog komt.
  const rijen = useMemo(() => {
    const perMaand = new Map(o.maanden.map((m) => [m.maand, m]));
    return maandenTussen(o.seizoen.start, o.seizoen.eind).map((maand) => {
      const m = perMaand.get(maand) ?? null;
      return { maand, label: maandKort(maand), totaal: m?.totaal ?? null, m };
    });
  }, [o]);
  const max = Math.max(grens5 ?? 0, ...rijen.map((r) => r.totaal ?? 0));
  const top = Math.ceil((max * 1.12) / 10_000) * 10_000;

  return (
    <SectionCard title="Engaged Fans per maand" hint="Groen vlak: niveau 5. Licht: maand loopt nog of is niet volledig geteld.">
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rijen} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} interval={0} />
            <YAxis domain={[0, top]} tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} width={44} tickFormatter={(n: number) => (n ? duizend(n) : "0")} />
            {grens5 != null && (
              <>
                <ReferenceArea y1={grens5} y2={top} fill="var(--color-success)" fillOpacity={0.08} ifOverflow="hidden" />
                <ReferenceLine
                  y={grens5}
                  stroke="var(--color-success)"
                  strokeDasharray="4 3"
                  label={{ value: `Niveau 5 vanaf ${getal(grens5)}`, position: "insideTopRight", fill: CHART.axis, fontSize: 11 }}
                />
              </>
            )}
            <Tooltip
              cursor={{ fill: "var(--color-gray-07)", fillOpacity: 0.5 }}
              contentStyle={CHART_TOOLTIP}
              labelStyle={{ color: "var(--color-white)" }}
              formatter={(n) => [getal(Number(n)), "Engaged Fans"]}
              labelFormatter={(_l, p) => {
                const r = p?.[0]?.payload as (typeof rijen)[number] | undefined;
                if (!r?.m) return "";
                const extra = r.m.tm ? `, t/m ${datumKort(r.m.tm)}` : "";
                return `${maandLang(r.maand)} · ${STATUS_TEKST[r.m.status].toLowerCase()}${extra} · ${r.m.bron}`;
              }}
            />
            <Bar dataKey="totaal" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {rijen.map((r) => (
                <Cell
                  key={r.maand}
                  fill={CHART.primary}
                  fillOpacity={r.m && r.m.status !== "volledig" ? 0.35 : 1}
                  stroke={r.m && r.m.status !== "volledig" ? CHART.primary : "none"}
                  strokeDasharray="3 2"
                />
              ))}
              <LabelList dataKey="totaal" position="top" fontSize={11} fill="var(--color-neutral-dark)" formatter={(v) => (v == null ? "" : duizend(Number(v)))} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <DataTable className="mt-4">
        <thead className="border-b border-border">
          <tr>
            <Th>Maand</Th>
            <Th align="right">Engaged Fans</Th>
            <Th>Telling</Th>
            <Th>Bron</Th>
            <Th align="right" className="hidden sm:table-cell">
              <span title="Wat Tools zelf in Maileon telt: fans met een SSOID en minstens één klik in de maand. Om naast een filter in Maileon te leggen.">
                Waarvan e-mail (Tools)
              </span>
            </Th>
          </tr>
        </thead>
        <tbody>
          {o.maanden.map((m) => (
            <tr key={m.maand} className="border-b border-border last:border-0">
              <Td className="capitalize">{maandLang(m.maand)}</Td>
              <Td align="right">
                {m.totaal != null ? (
                  getal(m.totaal)
                ) : (
                  <span className="text-muted-foreground" title="Alleen Maileon: MijnPSV is nog niet gekoppeld.">
                    {getal(m.maileon)} alleen e-mail
                  </span>
                )}
              </Td>
              <Td className="text-muted-foreground">
                {STATUS_TEKST[m.status]}
                {m.tm ? `, t/m ${datumKort(m.tm)}` : ""}
              </Td>
              <Td>
                <Badge tone="neutral">{m.bron === "handmatig" ? "Handmatig" : "Automatisch"}</Badge>
              </Td>
              <Td align="right" className="hidden text-muted-foreground sm:table-cell">
                {m.maileonTools != null ? getal(m.maileonTools) : "–"}
              </Td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </SectionCard>
  );
}

/* ---------- Active Fans richting doel ---------- */

function ActiveGrafiek({ o }: { o: Overzicht }) {
  const a = o.active;
  const n3 = o.seizoen.active.find((n) => n.niveau === 3)?.van ?? null;
  const n5 = o.seizoen.active.find((n) => n.niveau === 5)?.van ?? null;
  const start = tijd(o.seizoen.start);
  const eind = tijd(o.seizoen.eind);

  const reeks = o.punten.map((p) => ({ t: tijd(p.datum), totaal: p.totaal, datum: p.datum }));
  // De verwachte stand per week, elke dag opnieuw berekend uit de peilingen tot nu (`prognoseModel`).
  const prognose = (a?.model?.lijn ?? []).map((p) => ({ t: tijd(p.datum), prognose: Math.round(p.waarde), datum: p.datum }));
  const waarden = [...reeks.map((r) => r.totaal), ...prognose.map((p) => p.prognose)];
  const lo = waarden.length ? Math.floor((Math.min(...waarden) - 8_000) / 10_000) * 10_000 : 0;
  const hi = Math.ceil((Math.max(...waarden, n5 ?? 0) + 6_000) / 10_000) * 10_000;

  const maandTicks: number[] = [];
  const maand = new Date(start);
  while (maand.getTime() <= eind) {
    maandTicks.push(maand.getTime());
    maand.setUTCMonth(maand.getUTCMonth() + 1);
  }

  return (
    <SectionCard title="Active Fans richting 30 juni" hint="Stippellijn: de verwachte stand, elke dag opnieuw berekend.">
      {reeks.length ? (
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart margin={{ top: 16, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis
                dataKey="t"
                type="number"
                domain={[start, eind]}
                ticks={maandTicks}
                interval="preserveStartEnd"
                minTickGap={12}
                tickFormatter={(t: number) => MAANDEN_KORT[new Date(t).getUTCMonth()]}
                tick={{ fontSize: 11, fill: CHART.axis }}
                stroke={CHART.grid}
              />
              <YAxis domain={[lo, hi]} tick={{ fontSize: 11, fill: CHART.axis }} stroke={CHART.grid} width={44} tickFormatter={(n: number) => duizend(n)} />
              {n5 != null && (
                <>
                  <ReferenceArea y1={n5} y2={hi} fill="var(--color-success)" fillOpacity={0.08} ifOverflow="hidden" />
                  <ReferenceLine
                    y={n5}
                    stroke="var(--color-success)"
                    strokeDasharray="4 3"
                    label={{ value: `Niveau 5 vanaf ${getal(n5)}`, position: "insideTopLeft", fill: CHART.axis, fontSize: 11 }}
                  />
                </>
              )}
              {n3 != null && (
                <ReferenceLine
                  y={n3}
                  stroke={CHART.axis}
                  strokeDasharray="4 3"
                  label={{ value: `Niveau 3 vanaf ${getal(n3)}`, position: "insideTopLeft", fill: CHART.axis, fontSize: 11 }}
                />
              )}
              <Tooltip
                contentStyle={CHART_TOOLTIP}
                labelStyle={{ color: "var(--color-white)" }}
                labelFormatter={(_l, p) => datumLang((p?.[0]?.payload as { datum?: string } | undefined)?.datum)}
                formatter={(n, naam) => [getal(Number(n)), naam === "prognose" ? "Prognose" : "Active Fans"]}
              />
              <Line
                data={prognose}
                dataKey="prognose"
                stroke={CHART.primary}
                strokeWidth={2}
                strokeDasharray="2 5"
                strokeLinecap="round"
                dot={false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
              <Line
                data={reeks}
                dataKey="totaal"
                stroke={CHART.primary}
                strokeWidth={2}
                dot={reeks.length <= 15 ? { r: 3.5, fill: CHART.primary, stroke: "var(--color-white)", strokeWidth: 2 } : false}
                activeDot={{ r: 4 }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">Nog geen telling.</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        {a?.model?.methode === "verzadiging"
          ? `Unieke fans groeien steeds langzamer, omdat terugkerende fans niet opnieuw tellen. De stippellijn gaat ervan uit dat de groei per dag blijft afnemen zoals in de afgelopen weken (zo'n ${getal(a.model.afnamePerMaand * 100)}% per maand). `
          : "Er is nog te weinig verloop om een afname te schatten, dus de stippellijn trekt het tempo van de laatste periode recht door. "}
        Eenmalige pieken, zoals een campagne of de kaartverkoop, zitten er niet in.
      </p>
    </SectionCard>
  );
}

/* ---------- Herkomst ---------- */

function delen(p: ActivePunt) {
  return { maileon: p.maileon - p.overlap, beide: p.overlap, mijnpsv: p.mijnpsv - p.overlap };
}

const VENN_B = 560;
const VENN_H = 260;

/**
 * Twee cirkels op schaal (`lib/fans/venn.ts`): de oppervlakte is het aantal
 * fans per bron, de overlap het aantal in beide. Alleen de laatste peildatum.
 */
function Venn({ p }: { p: ActivePunt }) {
  const v = vennVorm(p.maileon, p.mijnpsv, p.overlap);
  const marge = 16;
  const breedte = v.rA + v.d + v.rB;
  const s = Math.min((VENN_B - 2 * marge) / breedte, (VENN_H - 2 * marge) / (2 * Math.max(v.rA, v.rB)));
  const links = (VENN_B - breedte * s) / 2;
  const cxA = links + v.rA * s;
  const cxB = cxA + v.d * s;
  const cy = VENN_H / 2;
  const d = delen(p);
  const vakken = [
    { x: (cxA - v.rA * s + cxB - v.rB * s) / 2, waarde: d.maileon, label: "alleen e-mail" },
    { x: (cxB - v.rB * s + cxA + v.rA * s) / 2, waarde: d.beide, label: "beide" },
    { x: (cxA + v.rA * s + cxB + v.rB * s) / 2, waarde: d.mijnpsv, label: "alleen MijnPSV" },
  ];
  return (
    <svg
      viewBox={`0 0 ${VENN_B} ${VENN_H}`}
      className="h-auto w-full max-w-[560px]"
      role="img"
      aria-label={`Venn-diagram op ${datumLang(p.datum)}: ${getal(d.maileon)} alleen via e-mail, ${getal(d.beide)} via beide, ${getal(d.mijnpsv)} alleen via MijnPSV.`}
    >
      <circle cx={cxA} cy={cy} r={v.rA * s} fill="var(--color-red-primary)" fillOpacity={0.5} stroke="var(--color-red-primary)" strokeWidth={2} />
      <circle cx={cxB} cy={cy} r={v.rB * s} fill="var(--color-gold)" fillOpacity={0.55} stroke="var(--color-gold)" strokeWidth={2} />
      {vakken.map((vak) => (
        <g key={vak.label}>
          <text x={vak.x} y={cy - 2} textAnchor="middle" className="fill-foreground font-heading" fontSize={22}>
            {getal(vak.waarde)}
          </text>
          <text x={vak.x} y={cy + 16} textAnchor="middle" className="fill-foreground" fontSize={12}>
            {vak.label}
          </text>
        </g>
      ))}
    </svg>
  );
}

function Herkomst({ o }: { o: Overzicht }) {
  if (!o.tabel.length) return null;
  const rijen = [...o.tabel].reverse();
  const laatste = o.tabel.at(-1)!;
  const d = delen(laatste);
  const regels = [
    { kleur: "bg-psv-red-primary", label: "E-mail (Maileon)", waarde: laatste.maileon, uitleg: "klikte op een e-mail" },
    { kleur: "bg-psv-gold", label: "MijnPSV (BlueConic)", waarde: laatste.mijnpsv, uitleg: "logde in op een MijnPSV-touchpoint" },
    { kleur: "bg-psv-gray-09", label: "In beide", waarde: d.beide, uitleg: `${getal((d.beide / laatste.totaal) * 100)}% van alle Active Fans` },
  ];
  return (
    <SectionCard title="Waar Active Fans vandaan komen" hint={`Stand van ${datumLang(laatste.datum)}, elke fan één keer geteld.`}>
      <div className="flex flex-col items-center gap-6 lg:flex-row lg:items-center">
        <div className="w-full lg:w-3/5">
          <Venn p={laatste} />
        </div>
        <dl className="w-full space-y-3 lg:w-2/5">
          {regels.map((r) => (
            <div key={r.label} className="flex items-start gap-3">
              <span className={cn("mt-1 h-3 w-3 shrink-0 rounded-sm", r.kleur)} />
              <div>
                <dt className="font-heading text-xs uppercase tracking-wide text-muted-foreground">{r.label}</dt>
                <dd className="font-heading text-2xl leading-tight tabular-nums">{getal(r.waarde)}</dd>
                <dd className="text-xs text-muted-foreground">{r.uitleg}</dd>
              </div>
            </div>
          ))}
          <div className="border-t border-border pt-3">
            <dt className="font-heading text-xs uppercase tracking-wide text-muted-foreground">Active Fans, ontdubbeld</dt>
            <dd className="font-heading text-2xl leading-tight tabular-nums">{getal(laatste.totaal)}</dd>
          </div>
        </dl>
      </div>

      <DataTable className="mt-5">
        <thead className="border-b border-border">
          <tr>
            <Th>Peildatum</Th>
            <Th align="right">Maileon</Th>
            <Th align="right">MijnPSV</Th>
            <Th align="right">In beide</Th>
            <Th align="right">Active Fans</Th>
            <Th align="right">Erbij</Th>
            <Th>Bron</Th>
          </tr>
        </thead>
        <tbody>
          {rijen.map((p) => {
            const vorige = o.tabel[o.tabel.indexOf(p) - 1];
            return (
              <tr key={p.datum} className="border-b border-border last:border-0">
                <Td>{datumLang(p.datum)}</Td>
                <Td align="right">{getal(p.maileon)}</Td>
                <Td align="right">{getal(p.mijnpsv)}</Td>
                <Td align="right">{getal(p.overlap)}</Td>
                <Td align="right" className="font-bold">
                  {getal(p.totaal)}
                </Td>
                <Td align="right" className="text-muted-foreground">
                  {vorige ? metTeken(p.totaal - vorige.totaal) : "–"}
                </Td>
                <Td>
                  <Badge tone="neutral">{p.bron === "handmatig" ? "Handmatig" : "Automatisch"}</Badge>
                </Td>
              </tr>
            );
          })}
        </tbody>
      </DataTable>
      <p className="mt-3 text-xs text-muted-foreground">
        Maileon telt fans met een SSO-id die op een e-mail klikten. MijnPSV telt fans die inlogden op de PSV-app, PSV Play, de FANstore,
        Playable of een ander MijnPSV-touchpoint. In de handmatige update van 26 november staat bij Maileon 68.708, hetzelfde getal als op 13
        oktober; alleen 73.852 klopt met de vermelde groei en het totaal, dus dat getal staat hier.
        {o.automatisch.maileonSeizoen != null && o.automatisch.laatsteDag && (
          <>
            {" "}
            Tools telt zelf {getal(o.automatisch.maileonSeizoen)} fans met een klik sinds 1 juli (t/m {datumLang(o.automatisch.laatsteDag.datum)}).
          </>
        )}
      </p>
    </SectionCard>
  );
}

/* ---------- Toelichting ---------- */

function Toelichting() {
  return (
    <details className="accordion">
      <summary>Definities en aannames</summary>
      <div className="accordion__content space-y-3 text-sm text-muted-foreground">
        <p>
          <b className="text-foreground">Engaged Fans</b>: per kalendermaand de unieke SSO-id&apos;s die op een e-mail klikten (Maileon,
          contactveld SSOID gevuld) of inlogden op MijnPSV (BlueConic, segment &ldquo;Heeft SSO ID&rdquo; met SSO Ingelogd Datum in die
          maand). Het doel is het gemiddelde over de volle maanden; een lopende maand telt pas mee als hij voorbij is.
        </p>
        <p>
          <b className="text-foreground">Active Fans</b>: dezelfde fans over het hele seizoen, sinds 1 juli. Het doel geldt voor het
          totaal op 30 juni.
        </p>
        <p>
          <b className="text-foreground">Niveaus</b>: elk doel heeft vijf niveaus. Groen is niveau 3 of hoger, oranje niveau 2, rood
          niveau 1. Wijs een niveau op de schaal aan om de grenzen te zien.
        </p>
        <p>
          <b className="text-foreground">Prognose</b>: unieke fans groeien steeds langzamer, omdat wie al meetelt niet opnieuw telt.
          Tools meet de groei per dag in perioden van minstens twee weken, schat hoe snel die afneemt, en trekt die afname door tot 30
          juni. Elke dag opnieuw, met de nieuwste peilingen. Perioden lopen nooit over de overgang van handmatige naar automatische
          tellingen, omdat die een paar procent kunnen verschillen. Neemt de groei niet af, dan is de prognose een rechte lijn.
        </p>
        <p>
          <b className="text-foreground">Handmatig en automatisch</b>: juli tot en met oktober komen uit de handmatige updates in Asana.
          BlueConic bewaart alleen de meest recente logindatum, dus een voorbije maand is achteraf niet na te rekenen. Tools legt elke
          maand daarom vast terwijl hij loopt, elke avond rond 22.30 uur.
        </p>
      </div>
    </details>
  );
}
