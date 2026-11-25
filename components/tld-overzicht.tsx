"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, ExternalLink, KeyRound, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { CATEGORIE_VOLGORDE, type TldCategorie, type TldResultaat, type TldScan } from "@/lib/tld-overzicht/types";

const UITLEG: Record<string, string> = {
  verdacht: "Niet van ons, maar noemt PSV Eindhoven, het stadion, tickets e.d., of heeft een inlogveld met PSV erop.",
  "ander gebruik": "Een site van iemand anders, bijvoorbeeld een bedrijf dat ook PSV heet.",
  geparkeerd: "Parkeerpagina, domein te koop of een (bijna) lege pagina.",
  eigen: "Draait op, of stuurt door naar, een eigen domein.",
  "geen website": "Wijst naar een server, maar die gaf geen pagina.",
  "geregistreerd, geen webadres": "Bestaat, maar wijst niet naar een server.",
};

/** De kleur van de categorie, met de statuskleuren uit de huisstijl. */
const KLEUR: Partial<Record<TldCategorie, { rand: string; label: string }>> = {
  verdacht: { rand: "border-t-error", label: "bg-error text-white" },
  "ander gebruik": { rand: "border-t-info", label: "bg-info-bg text-info" },
  geparkeerd: { rand: "border-t-warning", label: "bg-warning-bg text-warning" },
  eigen: { rand: "border-t-success", label: "bg-success-bg text-success" },
};

function Label({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span className={cn("px-1.5 py-0.5 font-heading text-xs uppercase tracking-wide", className)}>{children}</span>
  );
}

function Kaart({ r }: { r: TldResultaat }) {
  const kleur = KLEUR[r.categorie];
  const beeld = r.screenshotPad ? `/api/tld-overzicht/screenshot?pad=${encodeURIComponent(r.screenshotPad)}` : null;
  const doorgestuurd = r.eindHost && r.eindHost !== r.domein && r.eindHost !== `www.${r.domein}`;
  const meta = [
    r.httpStatus ? `HTTP ${r.httpStatus}` : null,
    r.https === false ? "geen https" : null,
    r.ips[0] ?? null,
  ].filter(Boolean);

  return (
    <article className={cn("flex flex-col overflow-hidden border border-border border-t-4 bg-card", kleur?.rand ?? "border-t-psv-gray-08")}>
      {beeld ? (
        <a href={beeld} target="_blank" rel="noreferrer" className="block border-b border-border bg-psv-offWhite">
          <img src={beeld} alt={`Screenshot van ${r.domein}`} loading="lazy" className="aspect-[16/10] w-full object-cover object-top" />
        </a>
      ) : (
        <div className="flex aspect-[16/10] items-center justify-center border-b border-border bg-psv-offWhite p-4 text-center text-sm text-muted-foreground">
          {r.fout ?? UITLEG[r.categorie] ?? r.categorie}
        </div>
      )}
      <div className="flex flex-1 flex-col gap-1 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <a
            href={r.eindUrl ?? `http://${r.domein}`}
            target="_blank"
            rel="noopener noreferrer"
            className="mr-auto inline-flex items-center gap-1 font-heading text-lg uppercase hover:text-psv-red-primary"
          >
            {r.domein}
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <Label className={kleur?.label ?? "bg-psv-gray-07 text-psv-gray-11"}>{r.categorie}</Label>
          {r.wijziging && <Label className="bg-psv-gold text-white">{r.wijziging}</Label>}
        </div>
        {r.titel && <p className="text-sm">{r.titel}</p>}
        {doorgestuurd && (
          <p className="text-sm text-muted-foreground">
            Doorgestuurd naar <strong className="text-foreground">{r.eindHost}</strong>
          </p>
        )}
        {r.wachtwoordveld && (
          <p className="inline-flex items-center gap-1 text-sm text-error">
            <KeyRound className="h-3.5 w-3.5" /> Heeft een wachtwoordveld
          </p>
        )}
        {meta.length > 0 && <p className="break-all text-xs text-muted-foreground">{meta.join(" · ")}</p>}
      </div>
    </article>
  );
}

function Tegel({ waarde, label, nadruk }: { waarde: number; label: string; nadruk?: boolean }) {
  return (
    <div className="border border-border bg-card px-4 py-3">
      <p className={cn("font-heading text-3xl", nadruk && waarde > 0 && "text-error")}>{waarde.toLocaleString("nl-NL")}</p>
      <p className="text-sm text-muted-foreground">{label}</p>
    </div>
  );
}

export function TldOverzicht({ scan, fout }: { scan: TldScan | null; fout: string | null }) {
  const [filter, setFilter] = useState<TldCategorie | "alles" | "veranderd">("alles");
  const [zoek, setZoek] = useState("");

  const zichtbaar = useMemo(
    () => (scan?.resultaten ?? []).filter((r) => CATEGORIE_VOLGORDE.includes(r.categorie)),
    [scan]
  );

  const gefilterd = useMemo(() => {
    const q = zoek.trim().toLowerCase();
    return zichtbaar
      .filter((r) => (filter === "alles" ? true : filter === "veranderd" ? !!r.wijziging : r.categorie === filter))
      .filter((r) => !q || r.domein.includes(q) || (r.titel ?? "").toLowerCase().includes(q) || (r.eindHost ?? "").includes(q))
      .sort(
        (a, b) =>
          CATEGORIE_VOLGORDE.indexOf(a.categorie) - CATEGORIE_VOLGORDE.indexOf(b.categorie) ||
          a.domein.localeCompare(b.domein)
      );
  }, [zichtbaar, filter, zoek]);

  if (fout) {
    return (
      <div className="alert alert--error flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
        <span>De laatste scan kon niet gelezen worden: {fout}</span>
      </div>
    );
  }

  if (!scan) {
    return (
      <div className="alert alert--info max-w-3xl">
        Er is nog geen scan. Die start je met <code>node scripts/psv-domeinscan.mjs --upload</code> (zie{" "}
        <code>docs/domeinscan.md</code>); daarna staat het resultaat hier.
      </div>
    );
  }

  const aantal = (c: TldCategorie) => zichtbaar.filter((r) => r.categorie === c).length;
  const veranderd = zichtbaar.filter((r) => r.wijziging).length;
  const knoppen: { waarde: typeof filter; label: string; n: number }[] = [
    { waarde: "alles", label: "Alles", n: zichtbaar.length },
    ...(veranderd ? [{ waarde: "veranderd" as const, label: "Nieuw of veranderd", n: veranderd }] : []),
    ...CATEGORIE_VOLGORDE.filter((c) => aantal(c) > 0).map((c) => ({ waarde: c, label: c, n: aantal(c) })),
  ];
  const gescand = new Date(scan.gescandOp).toLocaleString("nl-NL", { dateStyle: "long", timeStyle: "short" });

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tegel waarde={scan.resultaten.length} label="domeinen gecontroleerd" />
        <Tegel waarde={zichtbaar.length} label="geregistreerd" />
        <Tegel waarde={aantal("verdacht")} label="verdacht" nadruk />
        <Tegel waarde={veranderd} label="nieuw of veranderd sinds vorige scan" />
      </div>

      <p className="text-sm text-muted-foreground">
        Laatste scan: {gescand}. Eigen domeinen: {scan.eigen.join(", ")}. De indeling kijkt naar de tekst op de pagina;
        een kloon die vooral uit afbeeldingen bestaat kan onder &ldquo;ander gebruik&rdquo; vallen, dus kijk die ook even na.
      </p>

      <div className="flex flex-wrap items-center gap-2">
        {knoppen.map((k) => (
          <button
            key={k.waarde}
            type="button"
            onClick={() => setFilter(k.waarde)}
            title={UITLEG[k.waarde]}
            className={cn(
              "border px-3 py-1.5 font-heading text-sm uppercase tracking-wide transition-colors",
              filter === k.waarde
                ? "border-psv-gray-11 bg-psv-gray-11 text-white"
                : "border-border bg-card text-muted-foreground hover:text-foreground"
            )}
          >
            {k.label} ({k.n})
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
            placeholder="Zoek op domein of titel"
            className="w-full border border-border bg-card py-1.5 pl-8 pr-2 text-sm"
          />
        </label>
      </div>

      {filter !== "alles" && filter !== "veranderd" && UITLEG[filter] && (
        <p className="text-sm text-muted-foreground">{UITLEG[filter]}</p>
      )}

      {gefilterd.length === 0 ? (
        <p className="text-muted-foreground">Geen domeinen gevonden.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {gefilterd.map((r) => (
            <Kaart key={r.domein} r={r} />
          ))}
        </div>
      )}
    </div>
  );
}
