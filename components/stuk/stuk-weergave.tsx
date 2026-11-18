"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { STUK_SOORT_LABEL, bronnenVan, type Blok, type StukInhoud } from "@/lib/stukken/model";

/**
 * Een stuk (rapport of one-pager) in de PSV-huisstijl. Dezelfde weergave in het
 * voorbeeld naast de chat, op de afdrukpagina en op de deellink, zodat wat je
 * ziet ook is wat je deelt. Kleuren komen uit de design tokens.
 */

const REEKS_KLEUREN = ["var(--color-red-primary)", "var(--color-neutral-dark)", "var(--color-gold)", "var(--color-gray-09)"];

const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

export function formatDag(dag: string): string {
  const d = new Date(`${dag}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dag : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function Bron({ tekst }: { tekst: string }) {
  return <p className="mt-1.5 text-[11px] text-muted-foreground">Bron: {tekst}</p>;
}

function Grafiek({ blok }: { blok: Extract<Blok, { type: "grafiek" }> }) {
  const data = blok.labels.map((label, i) => ({
    label,
    ...Object.fromEntries(blok.reeksen.map((r) => [r.naam, r.waarden[i]])),
  }));
  const formatteer = (v: number) => `${getal.format(v)}${blok.eenheid ? ` ${blok.eenheid}` : ""}`;
  const assen = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickLine={false} />
      <YAxis
        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
        tickLine={false}
        axisLine={false}
        width={56}
        tickFormatter={(v: number) => getal.format(v)}
      />
      <Tooltip formatter={(v) => formatteer(Number(v))} />
      {blok.reeksen.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} />}
    </>
  );
  return (
    <figure>
      <figcaption className="mb-2 font-heading text-sm uppercase tracking-wide">{blok.titel}</figcaption>
      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          {blok.soort === "staaf" ? (
            <BarChart data={data}>
              {assen}
              {blok.reeksen.map((r, i) => (
                <Bar key={r.naam} dataKey={r.naam} fill={REEKS_KLEUREN[i]} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data}>
              {assen}
              {blok.reeksen.map((r, i) => (
                <Line key={r.naam} type="monotone" dataKey={r.naam} stroke={REEKS_KLEUREN[i]} strokeWidth={2} dot={false} isAnimationActive={false} />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <Bron tekst={blok.bron} />
    </figure>
  );
}

function BlokWeergave({ blok }: { blok: Blok }) {
  switch (blok.type) {
    case "kop":
      return <h2 className="font-heading text-xl uppercase tracking-wide">{blok.tekst}</h2>;
    case "tekst":
      return <div className="space-y-2 text-sm leading-relaxed">{formatAnswer(blok.tekst)}</div>;
    case "kerngetallen":
      return (
        <section>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {blok.items.map((k, i) => (
              <div key={i} className="break-inside-avoid rounded-md border border-border bg-card p-4">
                <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">{k.label}</p>
                <p className="mt-1 font-heading text-2xl text-psv-red-primary sm:text-3xl">{k.waarde}</p>
                {k.toelichting && <p className="mt-1 text-xs text-muted-foreground">{k.toelichting}</p>}
              </div>
            ))}
          </div>
          <Bron tekst={blok.bron} />
        </section>
      );
    case "tabel":
      return (
        <section>
          {blok.titel && <h3 className="mb-2 font-heading text-sm uppercase tracking-wide">{blok.titel}</h3>}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  {blok.kolommen.map((k, i) => (
                    <th key={i} className="py-2 pr-4 font-heading text-xs uppercase tracking-wide">
                      {k}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {blok.rijen.map((rij, r) => (
                  <tr key={r} className="border-b border-border last:border-0">
                    {rij.map((cel, c) => (
                      <td key={c} className={cn("py-2 pr-4", c > 0 && /^[€\d\s.,%+-]+$/.test(cel) && "tabular-nums")}>
                        {cel}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Bron tekst={blok.bron} />
        </section>
      );
    case "grafiek":
      return <Grafiek blok={blok} />;
    case "conclusie":
      return (
        <section className="rounded-md border-l-4 border-l-psv-red-primary bg-muted/50 p-4">
          <h3 className="font-heading text-sm uppercase tracking-wide">Conclusie</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm leading-relaxed">
            {blok.punten.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      );
  }
}

/** In een one-pager staan tekst en conclusie naast elkaar; de rest over de hele breedte. */
function breedte(blok: Blok): string {
  return blok.type === "tekst" || blok.type === "conclusie" ? "sm:col-span-1" : "sm:col-span-2";
}

export function StukWeergave({
  stuk,
  peildatum,
  voetnoot,
  className,
}: {
  stuk: StukInhoud;
  peildatum: string;
  voetnoot?: ReactNode;
  className?: string;
}) {
  const onepager = stuk.soort === "onepager";
  const bronnen = bronnenVan(stuk);
  return (
    <article className={cn("mx-auto w-full bg-background text-foreground", onepager ? "max-w-4xl" : "max-w-3xl", className)}>
      <header className="border-t-8 border-psv-red-primary pb-5 pt-5">
        <p className="font-heading text-xs uppercase tracking-wider text-muted-foreground">PSV · {STUK_SOORT_LABEL[stuk.soort]}</p>
        <h1 className="mt-1 font-heading text-3xl uppercase leading-tight sm:text-4xl">{stuk.titel}</h1>
        {stuk.ondertitel && <p className="mt-2 text-base text-muted-foreground">{stuk.ondertitel}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Peildatum {formatDag(peildatum)}</p>
      </header>

      <div className={cn(onepager ? "grid grid-flow-row-dense gap-5 sm:grid-cols-2" : "space-y-7")}>
        {stuk.blokken.map((blok) => (
          <div key={blok.id} className={cn("break-inside-avoid", onepager && breedte(blok))}>
            <BlokWeergave blok={blok} />
          </div>
        ))}
      </div>

      <footer className="mt-8 border-t border-border pt-4 text-xs text-muted-foreground">
        {bronnen.length > 0 && (
          <>
            <p className="font-heading uppercase tracking-wide">Bronnen</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {bronnen.map((b) => (
                <li key={b}>{b}</li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-2">
          Peildatum {formatDag(peildatum)}. Gemaakt met de assistent van PSV Tools.
          {voetnoot}
        </p>
      </footer>
    </article>
  );
}
