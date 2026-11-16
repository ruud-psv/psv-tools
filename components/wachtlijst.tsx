"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import tokens from "@psv/branding/tokens/tokens.json";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { number, share, Stat, formatDateTime } from "@/components/ticketing-stadion-parts";
import type { Bucket, MonthPoint, WaitlistAnalysis } from "@/lib/wachtlijst/analysis";
import type { WaitlistStatus } from "@/lib/wachtlijst/status";

/**
 * De wachtlijst uit Ringside: omvang, verloop, leeftijd en postcode. Geen
 * ingang in de sidebar; de pagina staat op `/dashboard/wachtlijst`.
 */

interface Payload {
  status: WaitlistStatus;
  analysis: WaitlistAnalysis | null;
}

const IN_COLOR = tokens.color.red.primary;
const OUT_COLOR = tokens.color.gray["09"];
const AXIS_TICK = { fontSize: 10, fill: "hsl(var(--muted-foreground))" };

/** De plaats waar een postcodegebied (eerste twee cijfers) om draait, voor Zuid-Nederland. */
const REGION_NAMES: Record<string, string> = {
  "46": "Bergen op Zoom",
  "47": "Roosendaal",
  "48": "Breda",
  "49": "Oosterhout",
  "50": "Tilburg",
  "51": "Waalwijk",
  "52": "'s-Hertogenbosch",
  "53": "Oss",
  "54": "Uden en Veghel",
  "55": "Veldhoven en Valkenswaard",
  "56": "Eindhoven",
  "57": "Helmond",
  "58": "Venray en Boxmeer",
  "59": "Venlo",
  "60": "Weert en Roermond",
  "61": "Sittard",
  "62": "Maastricht",
  "64": "Heerlen",
  "65": "Nijmegen",
};

const decimal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });

function monthLabel(month: string, long = false): string {
  const date = new Date(`${month}-15T12:00:00Z`);
  return date.toLocaleDateString("nl-NL", { month: long ? "long" : "short", year: long ? "numeric" : "2-digit", timeZone: "UTC" });
}

function signed(value: number): string {
  return `${value > 0 ? "+" : value < 0 ? "−" : ""}${number.format(Math.abs(value))}`;
}

function waitingLabel(days: number | null): string {
  if (days === null) return "–";
  if (days < 60) return `${Math.round(days)} dagen`;
  if (days < 730) return `${Math.round(days / 30.4)} maanden`;
  return `${decimal.format(days / 365.25)} jaar`;
}

function ChartTooltip({ title, lines }: { title: string; lines: { label: string; value: string; color?: string }[] }) {
  return (
    <div className="rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-heading uppercase tracking-wide">{title}</p>
      {lines.map((line) => (
        <p key={line.label} className="mt-0.5 flex items-center gap-1.5 text-muted-foreground">
          {line.color && <span className="h-2 w-2 rounded-sm" style={{ background: line.color }} />}
          {line.label}: <span className="text-foreground">{line.value}</span>
        </p>
      ))}
    </div>
  );
}

function SizeChart({ months }: { months: MonthPoint[] }) {
  return (
    <div className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={months} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
          <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m)} minTickGap={24} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tick={AXIS_TICK} />
          <YAxis allowDecimals={false} width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => number.format(v)} />
          <Tooltip
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as MonthPoint | undefined) : undefined;
              return row ? (
                <ChartTooltip title={monthLabel(row.month, true)} lines={[{ label: "Op de wachtlijst, eind van de maand", value: number.format(row.size) }]} />
              ) : null;
            }}
          />
          <Area type="monotone" dataKey="size" stroke={IN_COLOR} strokeWidth={2} fill={IN_COLOR} fillOpacity={0.12} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function FlowChart({ months }: { months: MonthPoint[] }) {
  const rows = months.map((month) => ({ ...month, out: -month.left }));
  return (
    <div className="space-y-2">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: IN_COLOR }} />
          Instroom
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-sm" style={{ background: OUT_COLOR }} />
          Uitstroom
        </li>
      </ul>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} stackOffset="sign" margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
            <XAxis dataKey="month" tickFormatter={(m: string) => monthLabel(m)} minTickGap={24} tickLine={false} axisLine={false} tick={AXIS_TICK} />
            <YAxis allowDecimals={false} width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => number.format(Math.abs(v))} />
            <ReferenceLine y={0} stroke="hsl(var(--border))" />
            <Tooltip
              cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
              content={({ active, payload }) => {
                const row = active ? (payload?.[0]?.payload as MonthPoint | undefined) : undefined;
                return row ? (
                  <ChartTooltip
                    title={monthLabel(row.month, true)}
                    lines={[
                      { label: "Instroom", value: number.format(row.joined), color: IN_COLOR },
                      { label: "Uitstroom", value: number.format(row.left), color: OUT_COLOR },
                      { label: "Per saldo", value: signed(row.joined - row.left) },
                    ]}
                  />
                ) : null;
              }}
            />
            <Bar dataKey="joined" stackId="verloop" fill={IN_COLOR} maxBarSize={28} isAnimationActive={false} />
            <Bar dataKey="out" stackId="verloop" fill={OUT_COLOR} maxBarSize={28} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function BucketChart({ buckets, unit }: { buckets: Bucket[]; unit: string }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  const highest = Math.max(...buckets.map((bucket) => bucket.count));
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={buckets} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid stroke="hsl(var(--border))" strokeOpacity={0.6} vertical={false} />
          <XAxis dataKey="label" interval={0} tickLine={false} axisLine={{ stroke: "hsl(var(--border))" }} tick={AXIS_TICK} />
          <YAxis allowDecimals={false} width={48} tickLine={false} axisLine={false} tick={AXIS_TICK} tickFormatter={(v: number) => number.format(v)} />
          <Tooltip
            cursor={{ fill: "hsl(var(--muted))", fillOpacity: 0.5 }}
            content={({ active, payload }) => {
              const row = active ? (payload?.[0]?.payload as Bucket | undefined) : undefined;
              return row ? (
                <ChartTooltip title={`${row.label} ${unit}`.trim()} lines={[{ label: "Mensen", value: `${number.format(row.count)} (${share(row.count, total)})` }]} />
              ) : null;
            }}
          />
          <Bar dataKey="count" maxBarSize={56} isAnimationActive={false}>
            {buckets.map((bucket) => (
              <Cell key={bucket.label} fill={bucket.count === highest ? IN_COLOR : tokens.color.red.light} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function BucketTable({ buckets, head }: { buckets: Bucket[]; head: string }) {
  const total = buckets.reduce((sum, bucket) => sum + bucket.count, 0);
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
          <th className="py-1 font-normal">{head}</th>
          <th className="py-1 text-right font-normal">Mensen</th>
          <th className="py-1 text-right font-normal">Aandeel</th>
        </tr>
      </thead>
      <tbody>
        {buckets.map((bucket) => (
          <tr key={bucket.label} className="border-t border-border">
            <td className="py-1">{bucket.label}</td>
            <td className="py-1 text-right tabular-nums">{number.format(bucket.count)}</td>
            <td className="py-1 text-right tabular-nums text-muted-foreground">{share(bucket.count, total)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Een ranglijst met een balk per regel. */
function RankList({ rows, total }: { rows: { key: string; label: string; count: number }[]; total: number }) {
  const highest = rows[0]?.count ?? 0;
  return (
    <ol className="space-y-1.5">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate">{row.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="block h-full bg-psv-red-primary" style={{ width: `${highest ? (row.count / highest) * 100 : 0}%` }} />
          </span>
          <span className="tabular-nums">
            {number.format(row.count)} <span className="text-muted-foreground">({share(row.count, total)})</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function StatusPanel({ status, busy, onStart }: { status: WaitlistStatus; busy: boolean; onStart: (query?: string) => void }) {
  const [chosen, setChosen] = useState("");
  const working = busy || status.running;

  const messages: Record<WaitlistStatus["phase"], string> = {
    leeg: "De wachtlijst is nog niet ingelezen. De eerste keer loopt de tool de hele verkoop van Ringside door; dat duurt een paar uur en gaat op de achtergrond door.",
    producten: "Bezig met de productenlijst: welk product is de wachtlijst?",
    "geen-product": "Er is geen product gevonden met \"wachtlijst\" in de naam. Kies hieronder het juiste product.",
    verkoop: `Bezig met de eerste doorloop van de verkoop: ${number.format(status.salesRead)} regels gelezen (van ruim 15 miljoen). De cijfers hieronder zijn tot die tijd ondergrenzen.`,
    klanten: `De wachtlijst zelf is compleet. Leeftijd en postcode worden nog opgezocht in de klantgegevens: ${number.format(status.clientsRead)} klanten gelezen.`,
    klaar: "",
  };

  return (
    <div className="space-y-3">
      {status.phase !== "klaar" && (
        <div className="alert alert--info" role="status">
          {messages[status.phase]}
        </div>
      )}
      {status.lastError && (
        <div className="alert alert--warning flex items-start gap-2" role="alert">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>De laatste run gaf een fout: {status.lastError}</span>
        </div>
      )}

      {status.phase === "geen-product" && status.candidates.length > 0 && (
        <div className="form-group max-w-xl">
          <label className="form-label" htmlFor="wachtlijst-product">
            Product
          </label>
          <div className="flex flex-wrap gap-2">
            <select
              id="wachtlijst-product"
              className="h-10 min-w-0 flex-1 border border-input bg-background px-3 text-sm"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              <option value="">Kies een product</option>
              {status.candidates.map((product) => (
                <option key={product.productId} value={product.productId}>
                  {product.name}
                </option>
              ))}
            </select>
            <Button onClick={() => onStart(`productId=${chosen}`)} disabled={!chosen || working}>
              Inlezen
            </Button>
          </div>
          <p className="form-hint">Dit zijn de producten van het type Memberships in Ringside.</p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <Button variant="outline" size="sm" onClick={() => onStart()} disabled={working}>
          {working ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {working ? "Bezig met inlezen" : status.phase === "leeg" ? "Start inlezen" : "Nu bijwerken"}
        </Button>
        {status.salesCaughtUpAt && <span>Bijgewerkt tot {formatDateTime(status.salesCaughtUpAt)}</span>}
        {status.products.length > 0 && (
          <span>
            Product: {status.products.map((product) => product.name).join(", ")}
            {status.chosenByHand ? " (met de hand gekozen)" : ""}
          </span>
        )}
      </div>
    </div>
  );
}

function Analysis({ analysis, status }: { analysis: WaitlistAnalysis; status: WaitlistStatus }) {
  const { size, flow, waiting, age, postcode, quality } = analysis;
  const growth = size.people - flow.sizeYearAgo;
  const recentMonths = flow.months.slice(-36);
  const tableMonths = flow.months.slice(-12).reverse();
  const busiest = flow.months.reduce<MonthPoint | null>((top, month) => (!top || month.joined > top.joined ? month : top), null);
  const clientsReady = status.clientsPassDoneAt !== null;

  const regions = postcode.regions.slice(0, 15).map((region) => ({
    key: region.code,
    label: REGION_NAMES[region.code] ? `${region.code}xx ${REGION_NAMES[region.code]}` : `${region.code}xx`,
    count: region.count,
  }));
  const eindhovenRegion = postcode.regions.filter((r) => ["55", "56", "57"].includes(r.code)).reduce((sum, r) => sum + r.count, 0);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Actuele omvang</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label="Op de wachtlijst"
              value={number.format(size.people)}
              hint={size.signups !== size.people ? `${number.format(size.signups)} inschrijvingen` : "unieke personen"}
            />
            <Stat
              label="Groei in een jaar"
              value={signed(growth)}
              hint={flow.sizeYearAgo > 0 ? `${signed(Math.round((growth / flow.sizeYearAgo) * 100))}% t.o.v. ${number.format(flow.sizeYearAgo)} een jaar geleden` : undefined}
            />
            <Stat label="Laatste 30 dagen" value={signed(flow.last30.joined - flow.last30.left)} hint={`${number.format(flow.last30.joined)} erbij, ${number.format(flow.last30.left)} eraf`} />
            <Stat label="Wacht al (mediaan)" value={waitingLabel(waiting.medianDays)} hint={flow.firstSignup ? `eerste inschrijving ${monthLabel(flow.firstSignup.slice(0, 7), true)}` : undefined} />
          </div>
          {size.perProduct.length > 1 && (
            <RankList rows={size.perProduct.map((p) => ({ key: p.productId, label: p.name, count: p.people }))} total={size.people} />
          )}
          <p className="text-xs text-muted-foreground">
            Iemand telt mee zolang hij een geldende inschrijving op het product heeft. Sinds het begin stonden er{" "}
            {number.format(size.everPeople)} mensen op; {number.format(flow.leftTotal)} keer ging er iemand weer af.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Verloop</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Instroom, 12 maanden" value={number.format(flow.last365.joined)} hint={`${number.format(flow.previous365.joined)} in het jaar ervoor`} />
            <Stat label="Uitstroom, 12 maanden" value={number.format(flow.last365.left)} hint={`${number.format(flow.previous365.left)} in het jaar ervoor`} />
            <Stat label="Gemiddeld per maand" value={signed(Math.round((flow.last365.joined - flow.last365.left) / 12))} hint="per saldo, laatste 12 maanden" />
            {busiest && <Stat label="Drukste maand" value={monthLabel(busiest.month, true)} hint={`${number.format(busiest.joined)} inschrijvingen`} />}
          </div>

          <div className="space-y-2">
            <h4 className="font-heading text-sm uppercase tracking-wide">Omvang per maand</h4>
            <SizeChart months={flow.months} />
          </div>
          <div className="space-y-2">
            <h4 className="font-heading text-sm uppercase tracking-wide">
              Instroom en uitstroom per maand{recentMonths.length < flow.months.length ? ", laatste drie jaar" : ""}
            </h4>
            <FlowChart months={recentMonths} />
          </div>

          <details className="text-sm">
            <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">Laatste 12 maanden als tabel</summary>
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="text-left text-xs font-heading uppercase tracking-wide text-muted-foreground">
                  <th className="py-1 font-normal">Maand</th>
                  <th className="py-1 text-right font-normal">Instroom</th>
                  <th className="py-1 text-right font-normal">Uitstroom</th>
                  <th className="py-1 text-right font-normal">Per saldo</th>
                  <th className="py-1 text-right font-normal">Omvang</th>
                </tr>
              </thead>
              <tbody>
                {tableMonths.map((month) => (
                  <tr key={month.month} className="border-t border-border">
                    <td className="py-1">{monthLabel(month.month, true)}</td>
                    <td className="py-1 text-right tabular-nums">{number.format(month.joined)}</td>
                    <td className="py-1 text-right tabular-nums">{number.format(month.left)}</td>
                    <td className="py-1 text-right tabular-nums">{signed(month.joined - month.left)}</td>
                    <td className="py-1 text-right tabular-nums">{number.format(month.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>

          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-2">
              <h4 className="font-heading text-sm uppercase tracking-wide">Hoe lang staat men er al op</h4>
              <BucketChart buckets={waiting.buckets} unit="" />
            </div>
            <BucketTable buckets={waiting.buckets} head="Wachttijd" />
          </div>

          <p className="text-xs text-muted-foreground">
            Instroom telt op de datum van de inschrijving. Uitstroom telt op de datum van de retour of annulering
            {flow.leftDateEstimated > 0
              ? `; bij ${number.format(flow.leftDateEstimated)} van de ${number.format(flow.leftTotal)} keer stond die er niet en is de dag genomen waarop de regel voor het laatst is gewijzigd.`
              : "."}{" "}
            De omvang van vandaag is geteld; de maanden ervoor zijn daaruit teruggerekend.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Leeftijdverdeling</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {age.known === 0 ? (
            <p className="text-sm text-muted-foreground">
              {clientsReady
                ? "Bij de mensen op de wachtlijst is geen geboortedatum gevonden in de klantgegevens van Ringside."
                : "De klantgegevens zijn nog niet ingelezen."}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Gemiddelde leeftijd" value={age.average === null ? "–" : `${decimal.format(age.average)} jaar`} />
                <Stat label="Mediaan" value={age.median === null ? "–" : `${decimal.format(age.median)} jaar`} />
                <Stat
                  label="Nieuw in 12 maanden"
                  value={age.averageRecent === null ? "–" : `${decimal.format(age.averageRecent)} jaar`}
                  hint={`gemiddeld, ${number.format(age.knownRecent)} mensen`}
                />
                <Stat label="Geboortedatum bekend" value={share(age.known, age.known + age.unknown)} hint={`${number.format(age.unknown)} onbekend`} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <BucketChart buckets={age.buckets} unit="jaar" />
                <BucketTable buckets={age.buckets} head="Leeftijd" />
              </div>
              <p className="text-xs text-muted-foreground">
                Leeftijd is het jaar van nu min het geboortejaar; de tool bewaart alleen het geboortejaar. Aandelen zijn van de mensen met een bekende geboortedatum.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Postcodes</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {postcode.known === 0 ? (
            <p className="text-sm text-muted-foreground">
              {clientsReady
                ? "Bij de mensen op de wachtlijst is geen postcode gevonden in de klantgegevens van Ringside."
                : "De klantgegevens zijn nog niet ingelezen."}
            </p>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Stat label="Regio Eindhoven" value={share(eindhovenRegion, postcode.known)} hint={`${number.format(eindhovenRegion)} mensen in 55xx, 56xx en 57xx`} />
                <Stat label="Nederland" value={number.format(postcode.netherlands)} hint={`${number.format(postcode.distinct)} verschillende postcodes (4 cijfers)`} />
                <Stat label="Buitenland" value={number.format(postcode.belgium + postcode.germany + postcode.other)} hint={`België ${number.format(postcode.belgium)}, Duitsland ${number.format(postcode.germany)}, overig of onleesbaar ${number.format(postcode.other)}`} />
                <Stat label="Postcode bekend" value={share(postcode.known, postcode.known + postcode.unknown)} hint={`${number.format(postcode.unknown)} onbekend`} />
              </div>
              <div className="grid gap-6 lg:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-heading text-sm uppercase tracking-wide">Per postcodegebied</h4>
                  <RankList rows={regions} total={postcode.known} />
                </div>
                <div className="space-y-2">
                  <h4 className="font-heading text-sm uppercase tracking-wide">Grootste postcodes</h4>
                  <RankList rows={postcode.top.slice(0, 15).map((area) => ({ key: area.code, label: area.code, count: area.count }))} total={postcode.known} />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                Een postcodegebied is de eerste twee cijfers; de plaatsnaam is de grootste plaats erin. Aandelen zijn van de mensen met een bekende postcode. De tool bewaart alleen de vier cijfers.
              </p>
            </>
          )}
        </CardContent>
      </Card>

      <details className="text-sm">
        <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">Controle van de data</summary>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          <p>
            {number.format(quality.rows)} verkoopregels op de wachtlijst, naar soort:{" "}
            {Object.entries(quality.saleTypes)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => `${type} ${number.format(count)}`)
              .join(", ")}
            . {number.format(quality.rowsWithoutOwner)} regels zonder klant.
          </p>
          <p>
            Klantgegevens: {number.format(status.clientsKnown)} gevonden, {number.format(status.clientsUnmatched)} niet gevonden,{" "}
            {number.format(status.clientsToLookUp)} nog op te zoeken (nieuwe inschrijvers worden hooguit eens per week opgezocht).
          </p>
          <p>
            Gebruikte kolommen: klant op de verkoopregel <code>{status.columns.salesOwner ?? "–"}</code>, klant in clients{" "}
            <code>{status.columns.clientKey ?? "–"}</code>, geboortedatum <code>{status.columns.birth ?? "–"}</code>, postcode{" "}
            <code>{status.columns.postcode ?? "–"}</code>, land <code>{status.columns.country ?? "–"}</code>.
          </p>
        </div>
      </details>
    </div>
  );
}

export function Wachtlijst() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/wachtlijst", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "De wachtlijst kon niet worden geladen.");
      setPayload(body as Payload);
      setError(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "De wachtlijst kon niet worden geladen.");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Zolang het inlezen loopt, elke twintig seconden de stand ophalen.
  const phase = payload?.status.phase;
  const running = payload?.status.running ?? false;
  useEffect(() => {
    if (!running && (phase === "klaar" || phase === "leeg" || phase === "geen-product" || !phase)) return;
    const timer = setInterval(load, 20_000);
    return () => clearInterval(timer);
  }, [running, phase, load]);

  // Een korte eerste run; die start zelf de volgende, op de achtergrond.
  const start = useCallback(
    async (query = "") => {
      setBusy(true);
      try {
        const res = await fetch(`/api/wachtlijst/inlezen?seconds=20${query ? `&${query}` : ""}`, { cache: "no-store" });
        const body = await res.json().catch(() => ({}));
        if (!res.ok && res.status !== 409) throw new Error(body.error ?? `Inlezen starten mislukt (${res.status}).`);
        await load();
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "Inlezen starten mislukt.");
      } finally {
        setBusy(false);
      }
    },
    [load]
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <header className="space-y-2">
        <h1 className="font-heading text-3xl uppercase">Wachtlijst</h1>
        <p className="lead max-w-3xl">
          Hoeveel mensen er op de wachtlijst staan, hoe dat zich ontwikkelt en wie het zijn. Uit de Ringside API van SeatGeek; alleen aantallen, geen namen.
        </p>
      </header>

      {error && (
        <div className="alert alert--error" role="alert">
          {error}
        </div>
      )}
      {!payload && !error && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Laden
        </p>
      )}
      {payload && (
        <>
          <StatusPanel status={payload.status} busy={busy} onStart={start} />
          {payload.analysis && <Analysis analysis={payload.analysis} status={payload.status} />}
        </>
      )}
    </div>
  );
}
