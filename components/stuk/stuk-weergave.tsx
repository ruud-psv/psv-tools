"use client";

import type { ReactNode } from "react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatAnswer } from "@/components/chat-opmaak";
import { cn } from "@/lib/utils";
import { asVerdeling } from "@/lib/stukken/as";
import { AfbeeldingPlek, SleepbareFoto, VervangFoto, useAfbeeldingActies } from "@/components/stuk/afbeelding";
import { STUK_SOORT_LABEL, bronnenVan, isLegeAfbeelding, type Uitsnede, type Achtergrond, type Blok, type StukInhoud } from "@/lib/stukken/model";

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

/** Een kop zoals de titel op een slide: PSV Condensed, hoofdletters, wit op een zwart blok. */
export function TitelBlok({ children, als = "h2", className, rood = false }: { children: ReactNode; als?: "h1" | "h2" | "h3"; className?: string; rood?: boolean }) {
  const Kop = als;
  return (
    <Kop className={cn("font-heading uppercase leading-[1.15]", className)}>
      <span className={cn("px-[0.18em] pb-[0.02em] pt-[0.08em] text-white [-webkit-box-decoration-break:clone] [box-decoration-break:clone]", rood ? "bg-[#e30713]" : "bg-black")}>
        {children}
      </span>
    </Kop>
  );
}

/** Subkop uit het template: PSV Text Bold, rood (op een donker vlak wit). */
function Subkop({ children, donker = false, className }: { children: ReactNode; donker?: boolean; className?: string }) {
  return <p className={cn("text-lg font-bold leading-tight sm:text-xl", donker ? "text-white" : "text-[#e30713]", className)}>{children}</p>;
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
                "break-inside-avoid p-4",
                uitgelicht ? "col-span-2 bg-black text-white" : donker ? "bg-white/10" : "bg-[#F0F0F0]"
              )}
            >
              <p className={cn("text-sm font-bold", uitgelicht || !donker ? "text-[#e30713]" : "text-white")}>{k.label}</p>
              <p className={cn("mt-1 font-heading leading-none", uitgelicht ? "text-6xl" : groot ? "text-5xl" : "text-4xl")}>{k.waarde}</p>
              {k.toelichting && <p className={cn("mt-1.5 text-xs", uitgelicht ? "text-psv-gray-08" : donker ? "text-white" : "text-muted-foreground")}>{k.toelichting}</p>}
            </div>
          );
        })}
      </div>
      <Bron tekst={blok.bron} />
    </section>
  );
}

/** Een foto in een vak met rechte hoeken, met zijn uitsnede; in het voorbeeld te verslepen. */
function Foto({ src, alt, positie, verhouding, doel }: { src: string; alt: string; positie?: Uitsnede; verhouding: string; doel: string }) {
  return (
    <div className={cn("relative w-full overflow-hidden bg-muted", verhouding)}>
      <SleepbareFoto src={src} alt={alt} positie={positie} doel={doel} className="absolute inset-0 h-full w-full object-cover" />
    </div>
  );
}

export function BlokWeergave({ blok, achtergrond }: { blok: Blok; achtergrond?: Achtergrond }) {
  const groot = blok.opmaak?.grootte === "groot";
  const donker = isDonker(achtergrond ?? blok.opmaak?.achtergrond);
  const vlak = achtergrond ?? blok.opmaak?.achtergrond;
  switch (blok.type) {
    case "kop":
      return (
        <TitelBlok rood={vlak === "zwart"} className="text-2xl sm:text-3xl">
          {blok.tekst}
        </TitelBlok>
      );
    case "tekst":
      return <div className={cn("space-y-2 leading-relaxed", groot ? "text-lg" : "text-base")}>{formatAnswer(blok.tekst)}</div>;
    case "kerngetallen":
      return <Kerngetallen blok={blok} achtergrond={vlak} groot={groot} />;
    case "tabel":
      return (
        <section>
          {blok.titel && <Subkop donker={donker} className="mb-2 !text-base">{blok.titel}</Subkop>}
          <div className="overflow-x-auto">
            <table className={cn("w-full", groot ? "text-base" : "text-sm", !donker && "bg-white")}>
              <thead>
                <tr className="bg-black text-left text-white">
                  {blok.kolommen.map((k, i) => (
                    <th key={i} className="px-3 py-2 font-heading text-xs uppercase tracking-wide">
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
                        "border-b",
                        donker ? "border-white/25" : "border-[#e5e5e5]",
                        uitgelicht && (donker ? "bg-black font-bold text-white" : "bg-[#e30713] font-bold text-white")
                      )}
                    >
                      {rij.map((cel, c) => (
                        <td key={c} className={cn("px-3 py-2", c > 0 && /^[€\d\s.,%+-]+$/.test(cel) && "text-right tabular-nums")}>
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
      return (
        <figure>
          <Subkop donker={donker} className="mb-2 !text-base">
            {blok.titel}
            {blok.eenheid ? <span className={cn("font-normal", donker ? "text-white" : "text-muted-foreground")}>, in {blok.eenheid}</span> : null}
          </Subkop>
          <Grafiek blok={blok} achtergrond={vlak} hoogte={groot ? "h-96" : "h-64"} toonTitel={false} />
        </figure>
      );
    case "afbeelding":
      return blok.url ? (
        <figure className="relative">
          <Foto src={blok.url} alt={blok.alt ?? blok.wens} positie={blok.positie} verhouding={groot ? "aspect-[3/2]" : "aspect-[16/9]"} doel={blok.id} />
          <VervangFoto doel={blok.id} wens={blok.wens} positie={blok.positie} zoom />
          {blok.bijschrift && <figcaption className="mt-1.5 text-xs text-muted-foreground">{blok.bijschrift}</figcaption>}
        </figure>
      ) : (
        <AfbeeldingPlek doel={blok.id} wens={blok.wens} />
      );
    case "conclusie":
      return (
        <section className={cn(vlak && vlak !== "wit" ? "" : "bg-[#F0F0F0] p-5")}>
          <Subkop donker={donker}>Conclusie</Subkop>
          <ul className={cn("mt-3 space-y-2 leading-snug", groot ? "text-lg" : "text-base")}>
            {blok.punten.map((p, i) => (
              <li key={i} className="relative pl-5">
                <span className="absolute left-0">•</span>
                {p}
              </li>
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
        <TitelBlok als="h3" rood={achtergrond === "zwart"} className="mb-4 text-xl sm:text-2xl">
          {kernboodschap}
        </TitelBlok>
      )}
      <BlokWeergave blok={blok} />
    </div>
  );
}

/**
 * De kop van het rapport, zoals de welkomstslide: het rode PSV EINDHOVEN-vlak
 * (of de titelfoto) met de titel wit op het zwarte blok.
 */
function Kop({ stuk, peildatum }: { stuk: StukInhoud; peildatum: string }) {
  const beeld = stuk.titelbeeld;
  return (
    <header className="mb-8">
      <div className="relative flex min-h-[200px] items-end overflow-hidden bg-[#e30713] p-5 sm:min-h-[240px] sm:p-8">
        {beeld?.url ? (
          <>
            <SleepbareFoto src={beeld.url} alt={beeld.wens ?? ""} positie={beeld.positie} doel="titel" className="absolute inset-0 h-full w-full object-cover" />
            <VervangFoto doel="titel" wens={beeld.wens} positie={beeld.positie} zoom />
          </>
        ) : (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- achtergrond uit het template, ook in de afdruk */}
            <img src="/images/deck/welkom.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
            {/* In het voorbeeld: direct een titelfoto kiezen. */}
            <VervangFoto doel="titel" wens={beeld?.wens} />
          </>
        )}
        <div className="relative">
          <TitelBlok als="h1" className="text-3xl sm:text-5xl">
            {stuk.titel}
          </TitelBlok>
        </div>
      </div>
      {beeld?.wens && !beeld.url && <AfbeeldingPlek doel="titel" wens={`Titelfoto: ${beeld.wens}`} className="mt-3" />}
      {stuk.ondertitel && <Subkop className="mt-4">{stuk.ondertitel}</Subkop>}
      <p className="mt-1 text-xs text-muted-foreground">
        PSV · {STUK_SOORT_LABEL[stuk.soort]} · Peildatum {formatDag(peildatum)}
      </p>
    </header>
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
      <Kop stuk={stuk} peildatum={peildatum} />

      <div className="grid gap-x-6 gap-y-9 sm:grid-cols-2">
        {stuk.blokken.map((blok) => (
          <div key={blok.id} className={cn("min-w-0 break-inside-avoid", breedte(blok))}>
            <RapportBlok blok={blok} />
          </div>
        ))}
      </div>

      <footer className="mt-10 border-t border-[#e5e5e5] pt-5 text-xs text-muted-foreground">
        {bronnen.length > 0 && (
          <>
            <TitelBlok als="h3" className="mb-2 text-sm">
              Bronnen
            </TitelBlok>
            <ul className="mt-1 space-y-0.5">
              {bronnen.map((b) => (
                <li key={b} className="relative pl-4">
                  <span className="absolute left-0">•</span>
                  {b}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="mt-3">
          Peildatum {formatDag(peildatum)}. Gemaakt met de assistent van PSV Tools.
          {voetnoot}
        </p>
      </footer>
    </article>
  );
}
