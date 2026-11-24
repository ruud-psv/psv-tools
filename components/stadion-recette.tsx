"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { number, Stat } from "@/components/ticketing-stadion-parts";
import { centsToInput, parseDecimalInput, type Recette } from "@/lib/ticketing-stadion/recette";

const euro = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const euroCents = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const percent = new Intl.NumberFormat("nl-NL", { style: "percent", maximumFractionDigits: 0 });

function money(cents: number | null): string {
  return cents === null ? "–" : euro.format(cents / 100);
}

function price(cents: number | null): string {
  return cents === null ? "–" : euroCents.format(cents / 100);
}

function pct(value: number | null): string {
  return value === null ? "–" : percent.format(value);
}

/** Een tekort (positief) in rood, een overschot in groen. */
function Gap({ label, cents, hint }: { label: string; cents: number; hint: string }) {
  const short = cents > 0;
  return (
    <div>
      <p className="text-xs font-heading uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className={`text-2xl font-heading tabular-nums ${short ? "text-error" : "text-success"}`}>
        {short ? money(cents) : `+${money(-cents)}`}
      </p>
      <p className="text-xs text-muted-foreground">{short ? hint : "boven het target"}</p>
    </div>
  );
}

/** De recette als balk: vrije verkoop in rood, resale in goud, tegen het target. */
function RecetteBar({ recette }: { recette: Recette }) {
  const scale = Math.max(recette.targetCents, recette.recetteCents, 1);
  const width = (cents: number) => `${Math.min((cents / scale) * 100, 100)}%`;
  return (
    <div className="space-y-1.5">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="bg-psv-red-primary" style={{ width: width(recette.free.revenueCents) }} />
        <div className="bg-psv-gold" style={{ width: width(recette.resale.revenueCents) }} />
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-psv-red-primary" />
          Vrije verkoop {money(recette.free.revenueCents)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-4 rounded-sm bg-psv-gold" />
          Resale {money(recette.resale.revenueCents)}
        </span>
      </div>
    </div>
  );
}

function Settings({ eventId, recette, onSaved }: { eventId: string; recette: Recette; onSaved: () => void }) {
  const [target, setTarget] = useState(centsToInput(recette.targetCents));
  const [uptake, setUptake] = useState(String(Math.round(recette.uptake * 1000) / 10).replace(".", ","));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save(body: Record<string, unknown>) {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/ticketing-stadion/recette", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      onSaved();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setSaving(false);
    }
  }

  function saveTarget() {
    const amount = parseDecimalInput(target);
    if (amount === null) setError("Geef het target als bedrag, bijvoorbeeld 246.852,94.");
    else save({ eventId, target: amount });
  }

  function saveUptake() {
    const value = parseDecimalInput(uptake);
    if (value === null || value <= 0 || value > 100) setError("Geef de afname als percentage tussen 0 en 100.");
    else save({ uptake: value / 100 });
  }

  return (
    <details className="text-sm">
      <summary className="cursor-pointer text-xs font-heading uppercase tracking-wide text-muted-foreground">
        Target en afname aanpassen
      </summary>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="form-group">
          <label className="form-label" htmlFor="recette-target">
            Target deze wedstrijd (€, incl. btw)
          </label>
          <div className="flex gap-2">
            <input
              id="recette-target"
              inputMode="decimal"
              className="w-full rounded-md border border-border bg-background px-3 py-2 tabular-nums"
              value={target}
              onChange={(event) => setTarget(event.target.value)}
            />
            <button type="button" className="btn btn--medium" disabled={saving} onClick={saveTarget}>
              Opslaan
            </button>
          </div>
          <p className="form-hint">
            {recette.customTarget ? (
              <>
                Aangepast voor deze wedstrijd.{" "}
                <button type="button" className="underline" disabled={saving} onClick={() => save({ eventId, target: null })}>
                  Terug naar de standaard
                </button>
              </>
            ) : (
              "Nu de standaard voor elke thuiswedstrijd."
            )}
          </p>
        </div>
        <div className="form-group">
          <label className="form-label" htmlFor="recette-uptake">
            Afname vrije verkoop voor xOVV (%)
          </label>
          <div className="flex gap-2">
            <input
              id="recette-uptake"
              inputMode="decimal"
              className="w-full rounded-md border border-border bg-background px-3 py-2 tabular-nums"
              value={uptake}
              onChange={(event) => setUptake(event.target.value)}
            />
            <button type="button" className="btn btn--medium" disabled={saving} onClick={saveUptake}>
              Opslaan
            </button>
          </div>
          <p className="form-hint">Geldt voor alle wedstrijden, tot het historische percentage bekend is.</p>
        </div>
      </div>
      {saving && (
        <p className="mt-2 inline-flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Opslaan…
        </p>
      )}
      {error && <p className="form-error mt-2">{error}</p>}
    </details>
  );
}

/**
 * Recette en wat die betekent voor de vrije verkoop en de resale. Zie
 * `computeRecette()` voor de definities.
 */
export function StadionRecette({
  eventId,
  recette,
  editable,
  onSaved,
}: {
  eventId: string;
  recette: Recette | null;
  editable: boolean;
  onSaved: () => void;
}) {
  if (!recette) {
    return (
      <p className="text-sm text-muted-foreground">
        Nog geen bedragen: de verkoop per dag wordt opnieuw ingelezen, nu met de prijs per ticket. Dat duurt een paar uur;
        daarna staat de recette hier vanzelf.
      </p>
    );
  }

  const { free, resale } = recette;
  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <Stat label="Recette" value={money(recette.recetteCents)} hint="vrije verkoop + resale, incl. btw" />
          <Stat
            label="Target"
            value={money(recette.targetCents)}
            hint={recette.customTarget ? "aangepast voor deze wedstrijd" : "standaard per thuiswedstrijd"}
          />
          <Gap label="Status" cents={recette.statusCents} hint="nog te gaan tot het target" />
        </div>
        <RecetteBar recette={recette} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-lg">Vrije verkoop</h3>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Verkocht"
              value={pct(free.soldShare)}
              hint={`${number.format(free.sold)} van ${number.format(free.offered)} aangeboden · ${number.format(free.available)} nog vrij`}
            />
            <Stat label="Opbrengst" value={money(free.revenueCents)} hint={`gem. ${price(free.averageCents)} per ticket`} />
            <Stat label="Potentie" value={money(free.potentialCents)} hint="als alles verkocht wordt" />
            <Stat label="xOVV" value={money(free.expectedCents)} hint={`verwacht bij ${pct(recette.uptake)} afname`} />
            <Stat
              label="Voortgang t.o.v. xOVV"
              value={pct(free.progressShare)}
              hint={`${money(free.revenueCents)} van ${money(free.expectedCents)}`}
            />
          </div>
        </section>

        <section className="space-y-3 border-t border-border pt-4">
          <h3 className="text-lg">Resale</h3>
          <div className="grid grid-cols-2 gap-4">
            <Stat
              label="Opbrengst"
              value={money(resale.revenueCents)}
              hint={`${number.format(resale.sold)} verkocht · gem. ${price(resale.averageCents)}`}
            />
            <Stat
              label="Verwacht resale-target"
              value={money(resale.expectedTargetCents)}
              hint={`target − xOVV · minimum ${money(resale.minimumTargetCents)}`}
            />
            <Gap label="Tekort op verwacht target" cents={resale.shortfallCents} hint="nog nodig uit de resale" />
            <Stat
              label="Nu aangeboden"
              value={number.format(resale.offered)}
              hint={`waarde ${money(resale.offeredValueCents)} · gem. ${price(resale.offeredAverageCents)}`}
            />
            <Stat label="Verkocht" value={pct(resale.soldShare)} hint="van verkocht + nu aangeboden" />
          </div>
        </section>
      </div>

      <p className="text-xs text-muted-foreground max-w-3xl">
        Bedragen inclusief btw, uit de prijs per verkocht ticket in Ringside. Potentie: de opbrengst tot nu toe plus elke
        vrije plaats tegen de prijs van zijn vak. Een aangeboden resale-ticket telt tegen de prijs van zijn vak in de vrije
        verkoop; die is in de resale altijd gelijk. Het uitvak telt niet mee.
        {free.unpricedSeats > 0 &&
          ` ${number.format(free.unpricedSeats)} vrije plaatsen liggen in een vak zonder bekende prijs; die tellen tegen de gemiddelde prijs.`}
      </p>

      {editable && <Settings eventId={eventId} recette={recette} onSaved={onSaved} />}
    </div>
  );
}
