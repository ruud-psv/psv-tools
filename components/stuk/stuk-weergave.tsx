"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { asVerdeling } from "@/lib/stukken/as";
import { AfbeeldingPlek, VervangFoto, useAfbeeldingActies } from "@/components/stuk/afbeelding";
import { STUK_SOORT_LABEL, bronnenVan, isLegeAfbeelding, type Achtergrond, type Blok, type StukInhoud } from "@/lib/stukken/model";

/**
 * Een rapport in de PSV-huisstijl. Dezelfde weergave in het voorbeeld naast de
 * chat, op de afdrukpagina en op de deellink, zodat wat je ziet ook is wat je
 * deelt. Kleuren komen uit de design tokens. Een deck staat in
 * `deck-weergave.tsx` en gebruikt de grafiek en het kerngetal van hier.
 */

const getal = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

export function formatDag(dag: string): string {
  const d = new Date(`${dag}T12:00:00Z`);
  return Number.isNaN(d.getTime()) ? dag : d.toLocaleDateString("nl-NL", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Rood en zwart zijn donkere vlakken: tekst wordt wit, rood als accent kan daar niet altijd. */
export function isDonker(achtergrond?: Achtergrond): boolean {
  return achtergrond === "rood" || achtergrond === "zwart";
}

/**
 * Het vlak achter een blok of slide: zet de kleuren (ook die van shadcn) voor
 * wat erin staat. Voluit geschreven, anders haalt Tailwind de klassen weg.
 */
const VLAK: Record<Achtergrond, string> = {
  wit: "",
  grijs: "stuk-vlak--grijs",
  rood: "stuk-vlak--rood",
  zwart: "stuk-vlak--zwart",
};

export function vlakKlasse(achtergrond?: Achtergrond): string {
  return achtergrond ? VLAK[achtergrond] : "";
}

/**
 * De kleuren van de reeksen. Met nadruk is alleen die reeks rood (op rood:
 * wit) en de rest neutraal; zonder nadruk de vaste volgorde van de huisstijl.
 */
export function reeksKleuren(namen: string[], achtergrond?: Achtergrond, nadruk?: string): string[] {
  const opRood = achtergrond === "rood";
  const accent = opRood ? "var(--color-white)" : "var(--color-red-primary)";
  const neutraal = opRood
    ? ["var(--color-black)", "var(--color-red-lighter)", "var(--color-gray-11)"]
    : achtergrond === "zwart"
      ? ["var(--color-white)", "var(--color-gray-09)", "var(--color-gold)"]
      : ["var(--color-neutral-dark)", "var(--color-gray-10)", "var(--color-gray-09)"];
  if (nadruk && namen.includes(nadruk)) {
    let n = 0;
    return namen.map((naam) => (naam === nadruk ? accent : neutraal[n++ % neutraal.length]));
  }
  const vast = opRood || achtergrond === "zwart" ? [accent, ...neutraal] : [accent, "var(--color-neutral-dark)", "var(--color-gold)", "var(--color-gray-09)"];
  return namen.map((_, i) => vast[i % vast.length]);
}

export function Bron({ tekst, className }: { tekst: string; className?: string }) {
  return <p className={cn("mt-1.5 text-[11px] text-muted-foreground", className)}>Bron: {tekst}</p>;
}

export function Grafiek({
  blok,
  achtergrond,
  hoogte = "h-64",
  toonTitel = true,
  deck = false,
}: {
  blok: Extract<Blok, { type: "grafiek" }>;
  achtergrond?: Achtergrond;
  /** Tailwind-klasse voor de hoogte van het tekenvlak. */
  hoogte?: string;
  toonTitel?: boolean;
  /** Op een slide: grotere letters, geen tooltip (de slide is geschaald). */
  deck?: boolean;
}) {
  const data = blok.labels.map((label, i) => ({
    label,
    ...Object.fromEntries(blok.reeksen.map((r) => [r.naam, r.waarden[i]])),
  }));
  const kleuren = reeksKleuren(
    blok.reeksen.map((r) => r.naam),
    achtergrond,
    blok.opmaak?.nadruk
  );
  const nadruk = blok.opmaak?.nadruk;
  const formatteer = (v: number) => `${getal.format(v)}${blok.eenheid ? ` ${blok.eenheid}` : ""}`;
  const tick = { fontSize: deck ? 15 : 11, fill: "hsl(var(--muted-foreground))" };
  const verdeling = asVerdeling(blok.reeksen.flatMap((r) => r.waarden));
  const assen = (
    <>
      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
      <XAxis dataKey="label" tick={tick} tickLine={false} stroke="hsl(var(--border))" />
      <YAxis
        tick={tick}
        tickLine={false}
        axisLine={false}
        width={deck ? 72 : 56}
        tickFormatter={(v: number) => getal.format(v)}
        {...(verdeling && { domain: verdeling.domein, ticks: verdeling.ticks })}
      />
      {!deck && <Tooltip formatter={(v) => formatteer(Number(v))} />}
      {blok.reeksen.length > 1 && <Legend itemSorter={null} wrapperStyle={{ fontSize: deck ? 15 : 12, paddingTop: deck ? 8 : 0 }} />}
    </>
  );
  return (
    <figure className="flex h-full flex-col">
      {toonTitel && <figcaption className="mb-2 font-heading text-sm uppercase tracking-wide">{blok.titel}</figcaption>}
      <div className={cn("min-h-0 w-full", hoogte)}>
        <ResponsiveContainer width="100%" height="100%">
          {blok.soort === "staaf" ? (
            <BarChart data={data}>
              {assen}
              {blok.reeksen.map((r, i) => (
                <Bar key={r.naam} dataKey={r.naam} fill={kleuren[i]} isAnimationActive={false} />
              ))}
            </BarChart>
          ) : (
            <LineChart data={data}>
              {assen}
              {blok.reeksen.map((r, i) => (
                <Line
                  key={r.naam}
                  type="monotone"
                  dataKey={r.naam}
                  stroke={kleuren[i]}
                  strokeWidth={r.naam === nadruk ? (deck ? 5 : 3.5) : deck ? 2.5 : 2}
                  dot={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>
      <Bron tekst={blok.bron} className={deck ? "text-xs" : undefined} />
    </figure>
  );
}

function Kerngetallen({ blok, achtergrond, groot }: { blok: Extract<Blok, { type: "kerngetallen" }>; achtergrond?: Achtergrond; groot: boolean }) {
  const donker = isDonker(achtergrond);
  return (
    <section>
      <div className={cn("grid grid-cols-2 gap-3", blok.opmaak?.grootte !== "half" && "sm:grid-cols-3")}>
        {blok.items.map((k, i) => {
          const uitgelicht = k.label === blok.opmaak?.nadruk;
          return (
            <div
              key={i}
              className={cn(
                "break-inside-avoid rounded-md border p-4",
                uitgelicht ? "col-span-2 border-transparent bg-psv-black text-white" : "border-border bg-card"
              )}
            >
              <p className={cn("font-heading text-xs uppercase tracking-wide", uitgelicht ? "text-white" : "text-muted-foreground")}>{k.label}</p>
              <p
                className={cn(
                  "mt-1 font-heading",
                  uitgelicht ? "text-5xl text-white" : groot ? "text-4xl" : "text-2xl sm:text-3xl",
                  !uitgelicht && (donker ? "text-white" : "text-psv-red-primary")
                )}
              >
                {k.waarde}
              </p>
              {k.toelichting && <p className={cn("mt-1 text-xs", uitgelicht ? "text-psv-gray-08" : "text-muted-foreground")}>{k.toelichting}</p>}
            </div>
          );
        })}
      </div>
      <Bron tekst={blok.bron} />
    </section>
  );
}

export function BlokWeergave({ blok, achtergrond }: { blok: Blok; achtergrond?: Achtergrond }) {
  const groot = blok.opmaak?.grootte === "groot";
  const donker = isDonker(achtergrond ?? blok.opmaak?.achtergrond);
  const vlak = achtergrond ?? blok.opmaak?.achtergrond;
  switch (blok.type) {
    case "kop":
      return <h2 className="font-heading text-xl uppercase tracking-wide">{blok.tekst}</h2>;
    case "tekst":
      return <div className={cn("space-y-2 leading-relaxed", groot ? "text-base" : "text-sm")}>{formatAnswer(blok.tekst)}</div>;
    case "kerngetallen":
      return <Kerngetallen blok={blok} achtergrond={vlak} groot={groot} />;
    case "tabel":
      return (
        <section>
          {blok.titel && <h3 className="mb-2 font-heading text-sm uppercase tracking-wide">{blok.titel}</h3>}
          <div className="overflow-x-auto">
            <table className={cn("w-full", groot ? "text-base" : "text-sm")}>
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
                {blok.rijen.map((rij, r) => {
                  const uitgelicht = Boolean(blok.opmaak?.nadruk) && rij[0] === blok.opmaak?.nadruk;
                  return (
                    <tr
                      key={r}
                      className={cn(
                        "border-b border-border last:border-0",
                        uitgelicht && (donker ? "bg-psv-black font-bold text-white" : "bg-psv-red-primary font-bold text-white")
                      )}
                    >
                      {rij.map((cel, c) => (
                        <td key={c} className={cn("py-2 pr-4", c === 0 && uitgelicht && "pl-2", c > 0 && /^[€\d\s.,%+-]+$/.test(cel) && "tabular-nums")}>
                          {cel}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Bron tekst={blok.bron} />
        </section>
      );
    case "grafiek":
      return <Grafiek blok={blok} achtergrond={vlak} hoogte={groot ? "h-96" : "h-64"} />;
    case "afbeelding":
      return blok.url ? (
        <figure className="relative">
          {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
          <img src={blok.url} alt={blok.alt ?? blok.wens} className={cn("w-full object-cover", groot ? "aspect-[3/2]" : "aspect-[16/9]")} />
          <VervangFoto doel={blok.id} />
          {blok.bijschrift && <figcaption className="mt-1.5 text-xs text-muted-foreground">{blok.bijschrift}</figcaption>}
        </figure>
      ) : (
        <AfbeeldingPlek doel={blok.id} wens={blok.wens} />
      );
    case "conclusie":
      return (
        <section className={cn("rounded-md p-4", vlak && vlak !== "wit" ? "" : "border-l-4 border-l-psv-red-primary bg-muted/50")}>
          <h3 className="font-heading text-sm uppercase tracking-wide">Conclusie</h3>
          <ul className={cn("mt-2 list-disc space-y-1 pl-5 leading-relaxed", groot ? "text-base" : "text-sm")}>
            {blok.punten.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </section>
      );
  }
}

/** Een blok in het rapport: met de kernboodschap erboven en het vlak eromheen. */
export function RapportBlok({ blok }: { blok: Blok }) {
  const acties = useAfbeeldingActies();
  // Een lege plek voor een foto staat alleen in het voorbeeld, niet op een deellink of afdruk.
  if (isLegeAfbeelding(blok) && !acties) return null;
  const achtergrond = blok.opmaak?.achtergrond;
  const kernboodschap = blok.opmaak?.kernboodschap;
  return (
    <div className={cn("h-full", vlakKlasse(achtergrond))}>
      {kernboodschap && blok.type !== "kop" && (
        <p className="mb-3 font-heading text-lg uppercase leading-tight tracking-wide sm:text-xl">{kernboodschap}</p>
      )}
      <BlokWeergave blok={blok} />
    </div>
  );
}

/** De foto boven het rapport; zonder foto (maar met een wens) een lege plek in het voorbeeld. */
function Titelbeeld({ stuk }: { stuk: StukInhoud }) {
  const beeld = stuk.titelbeeld;
  if (!beeld) return null;
  if (!beeld.url) return beeld.wens ? <AfbeeldingPlek doel="titel" wens={`Titelfoto: ${beeld.wens}`} className="mb-4" /> : null;
  return (
    <div className="relative">
      {/* eslint-disable-next-line @next/next/no-img-element -- een foto van onze CDN, ook in de afdruk */}
      <img src={beeld.url} alt={beeld.wens ?? ""} className="aspect-[3/1] w-full object-cover" />
      <VervangFoto doel="titel" />
    </div>
  );
}

/** Half naast elkaar, de rest over de hele breedte. */
export function breedte(blok: Blok): string {
  return blok.opmaak?.grootte === "half" ? "sm:col-span-1" : "sm:col-span-2";
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
  const bronnen = bronnenVan(stuk);
  const metHalf = stuk.blokken.some((b) => b.opmaak?.grootte === "half");
  return (
    <article className={cn("mx-auto w-full bg-background text-foreground", metHalf ? "max-w-4xl" : "max-w-3xl", className)}>
      <Titelbeeld stuk={stuk} />
      <header className="border-t-8 border-psv-red-primary pb-5 pt-5">
        <p className="font-heading text-xs uppercase tracking-wider text-muted-foreground">PSV · {STUK_SOORT_LABEL[stuk.soort]}</p>
        <h1 className="mt-1 font-heading text-3xl uppercase leading-tight sm:text-4xl">{stuk.titel}</h1>
        {stuk.ondertitel && <p className="mt-2 text-base text-muted-foreground">{stuk.ondertitel}</p>}
        <p className="mt-2 text-xs text-muted-foreground">Peildatum {formatDag(peildatum)}</p>
      </header>

      <div className="grid gap-x-5 gap-y-7 sm:grid-cols-2">
        {stuk.blokken.map((blok) => (
          <div key={blok.id} className={cn("min-w-0 break-inside-avoid", breedte(blok))}>
            <RapportBlok blok={blok} />
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
