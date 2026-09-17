"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Download,
  ImagePlus,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  MODELLEN,
  SCENES,
  STANDAARD_MODEL,
  vindModel,
  vindScene,
  type DetailNiveau,
  type GenereerResponse,
  type StatusResponse,
  type Verhouding,
} from "@/lib/kleurplaat";

/* ------------------------------------------------------------------ */
/* Referenties                                                         */
/* ------------------------------------------------------------------ */

interface Referentie {
  id: string;
  naam: string;
  dataUrl: string;
}

const OPSLAG_SLEUTEL = "kleurplaat:referenties";
/** Groot genoeg voor het model, klein genoeg voor de request body. */
const MAX_ZIJDE = 1024;
const MAX_REFERENTIES = 6;

function laadAfbeelding(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kon de afbeelding niet lezen."));
    img.src = src;
  });
}

/**
 * Schaalt een upload terug naar maximaal 1024px en zet hem op een witte
 * achtergrond. Dat houdt de request klein en voorkomt dat een transparante PNG
 * als zwart vlak bij het model aankomt.
 */
async function verkleinNaarDataUrl(file: File): Promise<string> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await laadAfbeelding(objectUrl);
    const breedte = img.naturalWidth || MAX_ZIJDE;
    const hoogte = img.naturalHeight || MAX_ZIJDE;
    const schaal = Math.min(1, MAX_ZIJDE / Math.max(breedte, hoogte));
    const w = Math.max(1, Math.round(breedte * schaal));
    const h = Math.max(1, Math.round(hoogte * schaal));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is niet beschikbaar in deze browser.");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    return canvas.toDataURL("image/jpeg", 0.85);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/* ------------------------------------------------------------------ */
/* Resultaten                                                          */
/* ------------------------------------------------------------------ */

interface Resultaat {
  id: string;
  url: string;
  prompt: string;
  omschrijving: string;
  model: string;
  duur?: number;
}

const DETAIL_OPTIES: { waarde: DetailNiveau; label: string }[] = [
  { waarde: "eenvoudig", label: "Heel simpel — peuters en kleuters" },
  { waarde: "gemiddeld", label: "Gemiddeld — 4 tot 8 jaar" },
  { waarde: "gedetailleerd", label: "Gedetailleerd — 8 jaar en ouder" },
];

const VERHOUDING_OPTIES: { waarde: Verhouding; label: string }[] = [
  { waarde: "2:3", label: "Staand (A4-achtig)" },
  { waarde: "3:2", label: "Liggend" },
  { waarde: "1:1", label: "Vierkant" },
];

const POLL_INTERVAL = 1500;
const MAX_WACHTTIJD = 180_000;

export function KleurplaatCreator() {
  /* Referenties */
  const [referenties, setReferenties] = useState<Referentie[]>([]);
  const [sleept, setSleept] = useState(false);
  const [uploadFout, setUploadFout] = useState("");
  const bestandRef = useRef<HTMLInputElement>(null);

  /* Instellingen */
  const [model, setModel] = useState(STANDAARD_MODEL);
  const [sceneId, setSceneId] = useState<string>(SCENES[0].id);
  const [eigenScene, setEigenScene] = useState("");
  const [detail, setDetail] = useState<DetailNiveau>("gemiddeld");
  const [verhouding, setVerhouding] = useState<Verhouding>("2:3");
  const [naam, setNaam] = useState("");
  const [rugnummer, setRugnummer] = useState("");
  const [extra, setExtra] = useState("");

  /* Generatie */
  const [bezig, setBezig] = useState(false);
  const [statusTekst, setStatusTekst] = useState("");
  const [voortgang, setVoortgang] = useState(0);
  const [fout, setFout] = useState("");
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [historie, setHistorie] = useState<Resultaat[]>([]);
  const [promptZichtbaar, setPromptZichtbaar] = useState(false);

  const afbrekenRef = useRef(false);

  /* -------------------------------------------------------------- */
  /* Referenties bewaren tussen sessies                              */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    try {
      const opgeslagen = localStorage.getItem(OPSLAG_SLEUTEL);
      if (opgeslagen) setReferenties(JSON.parse(opgeslagen) as Referentie[]);
    } catch {
      // stukke opslag is geen reden om de tool niet te tonen
    }
  }, []);

  const bewaarReferenties = useCallback((volgende: Referentie[]) => {
    setReferenties(volgende);
    try {
      localStorage.setItem(OPSLAG_SLEUTEL, JSON.stringify(volgende));
    } catch {
      setUploadFout(
        "De referenties passen niet in de browseropslag; ze gelden alleen voor deze sessie."
      );
    }
  }, []);

  const voegBestandenToe = useCallback(
    async (bestanden: FileList | File[]) => {
      setUploadFout("");
      const lijst = Array.from(bestanden).filter((f) => f.type.startsWith("image/"));
      if (lijst.length === 0) {
        setUploadFout("Kies een afbeelding (png, jpg, webp of svg).");
        return;
      }

      const nieuwe: Referentie[] = [];
      for (const bestand of lijst) {
        try {
          nieuwe.push({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            naam: bestand.name,
            dataUrl: await verkleinNaarDataUrl(bestand),
          });
        } catch {
          setUploadFout(`"${bestand.name}" kon niet worden ingelezen.`);
        }
      }

      if (nieuwe.length > 0) {
        bewaarReferenties([...referenties, ...nieuwe].slice(0, MAX_REFERENTIES));
      }
    },
    [referenties, bewaarReferenties]
  );

  function verwijderReferentie(id: string) {
    bewaarReferenties(referenties.filter((r) => r.id !== id));
  }

  /* -------------------------------------------------------------- */
  /* Genereren                                                       */
  /* -------------------------------------------------------------- */

  const gekozenModel = vindModel(model);
  const meegenomen = gekozenModel
    ? Math.min(referenties.length, gekozenModel.maxReferenties)
    : referenties.length;
  const sceneOmschrijving =
    sceneId === "eigen" ? eigenScene.trim() : vindScene(sceneId)?.label ?? "";
  const magGenereren =
    !bezig && (sceneId !== "eigen" || eigenScene.trim().length >= 3);

  useEffect(() => {
    return () => {
      afbrekenRef.current = true;
    };
  }, []);

  async function genereer() {
    if (!magGenereren) return;

    setBezig(true);
    setFout("");
    setVoortgang(4);
    setStatusTekst("Aanvraag versturen…");
    afbrekenRef.current = false;

    try {
      const res = await fetch("/api/kleurplaat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          sceneId,
          eigenScene,
          detail,
          verhouding,
          naam,
          rugnummer,
          extra,
          referenties: referenties.slice(0, MAX_REFERENTIES).map((r) => r.dataUrl),
        }),
      });

      const body = (await res.json()) as GenereerResponse & { error?: string };
      if (!res.ok) throw new Error(body.error || `Genereren mislukt (HTTP ${res.status}).`);

      await volgVoorspelling(body);
    } catch (err) {
      setFout(err instanceof Error ? err.message : "Er ging iets mis bij het genereren.");
      setStatusTekst("");
      setVoortgang(0);
    } finally {
      setBezig(false);
    }
  }

  /** Vraagt de status op tot de plaat klaar is, mislukt of de tijd om is. */
  async function volgVoorspelling(start: GenereerResponse) {
    const begin = Date.now();

    while (!afbrekenRef.current) {
      const verstreken = Date.now() - begin;
      if (verstreken > MAX_WACHTTIJD) {
        throw new Error("Het duurde te lang. Probeer het opnieuw of kies een ander model.");
      }
      setVoortgang(Math.min(95, 8 + (verstreken / 45_000) * 87));

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      if (afbrekenRef.current) return;

      const res = await fetch(`/api/kleurplaat/status/${start.id}`, { cache: "no-store" });
      const status = (await res.json()) as StatusResponse & { error?: string };
      if (!res.ok) throw new Error(status.error || "Status opvragen mislukt.");

      if (status.status === "starting") setStatusTekst("In de wachtrij bij het model…");
      if (status.status === "processing") setStatusTekst("Phoxy wordt getekend…");

      if (status.status === "succeeded" && status.imageUrl) {
        const klaar: Resultaat = {
          id: start.id,
          url: status.imageUrl,
          prompt: start.prompt,
          omschrijving: sceneOmschrijving || "Eigen scène",
          model: start.model,
          duur: status.duur,
        };
        setResultaat(klaar);
        setHistorie((vorige) => [klaar, ...vorige.filter((h) => h.id !== klaar.id)].slice(0, 8));
        setVoortgang(100);
        setStatusTekst("");
        return;
      }

      if (status.status === "failed" || status.status === "canceled") {
        throw new Error(status.error || "Het model kon deze kleurplaat niet maken.");
      }
    }
  }

  function downloadUrl(item: Resultaat) {
    const params = new URLSearchParams({ url: item.url });
    const label = naam.trim() || item.omschrijving;
    if (label) params.set("naam", label);
    return `/api/kleurplaat/download?${params.toString()}`;
  }

  /* -------------------------------------------------------------- */
  /* Weergave                                                        */
  /* -------------------------------------------------------------- */

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ---------------- Instellingen ---------------- */}
      <div className="space-y-6">
        {/* Referenties */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-lg">Referenties van Phoxy</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Upload een paar illustraties van Phoxy. Het model gebruikt ze om zijn kop, oren,
            staart en tenue kloppend te houden. Ze blijven in deze browser bewaard.
          </p>

          <div
            onDragOver={(e) => {
              e.preventDefault();
              setSleept(true);
            }}
            onDragLeave={() => setSleept(false)}
            onDrop={(e) => {
              e.preventDefault();
              setSleept(false);
              void voegBestandenToe(e.dataTransfer.files);
            }}
            onClick={() => bestandRef.current?.click()}
            className={cn(
              "mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed px-4 py-6 text-center transition-colors",
              sleept ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
            )}
          >
            <ImagePlus className="h-6 w-6 text-muted-foreground" />
            <p className="text-sm font-medium">Sleep afbeeldingen hierheen of klik om te kiezen</p>
            <p className="text-xs text-muted-foreground">
              Maximaal {MAX_REFERENTIES} stuks — png, jpg, webp of svg
            </p>
          </div>
          <input
            ref={bestandRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void voegBestandenToe(e.target.files);
              e.target.value = "";
            }}
          />

          {uploadFout && <p className="mt-2 text-sm text-destructive">{uploadFout}</p>}

          {referenties.length > 0 && (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {referenties.map((ref, index) => (
                  <div
                    key={ref.id}
                    className={cn(
                      "group relative aspect-square overflow-hidden rounded-md border bg-white",
                      gekozenModel && index >= gekozenModel.maxReferenties
                        ? "border-border opacity-40"
                        : "border-border"
                    )}
                    title={ref.naam}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={ref.dataUrl} alt={ref.naam} className="h-full w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => verwijderReferentie(ref.id)}
                      className="absolute right-1 top-1 rounded-full bg-psv-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`${ref.naam} verwijderen`}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                <span>
                  {meegenomen} van {referenties.length} gaan mee naar dit model
                </span>
                <button
                  type="button"
                  onClick={() => bewaarReferenties([])}
                  className="inline-flex items-center gap-1 hover:text-destructive"
                >
                  <Trash2 className="h-3 w-3" /> Alles wissen
                </button>
              </div>
            </>
          )}

          {referenties.length === 0 && (
            <p className="mt-3 text-xs text-warning">
              Zonder referentie tekent het model een willekeurige vos in plaats van Phoxy.
            </p>
          )}
        </section>

        {/* Scène en opties */}
        <section className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-lg">De kleurplaat</h2>

          <div className="space-y-2">
            <Label htmlFor="scene">Scène</Label>
            <Select value={sceneId} onValueChange={setSceneId}>
              <SelectTrigger id="scene">
                <SelectValue placeholder="Kies een scène" />
              </SelectTrigger>
              <SelectContent>
                {SCENES.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.label}
                  </SelectItem>
                ))}
                <SelectItem value="eigen">Zelf beschrijven…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {sceneId === "eigen" && (
            <div className="space-y-2">
              <Label htmlFor="eigen-scene">Beschrijf de scène</Label>
              <Textarea
                id="eigen-scene"
                rows={3}
                placeholder="Bijvoorbeeld: Phoxy zit op een step met een voetbal onder zijn arm, met de Lichttoren op de achtergrond."
                value={eigenScene}
                onChange={(e) => setEigenScene(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Nederlands mag; de modellen begrijpen het. Engels geeft meestal een iets
                preciezer resultaat.
              </p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="detail">Detailniveau</Label>
              <Select value={detail} onValueChange={(v) => setDetail(v as DetailNiveau)}>
                <SelectTrigger id="detail">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DETAIL_OPTIES.map((o) => (
                    <SelectItem key={o.waarde} value={o.waarde}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="verhouding">Formaat</Label>
              <Select value={verhouding} onValueChange={(v) => setVerhouding(v as Verhouding)}>
                <SelectTrigger id="verhouding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {VERHOUDING_OPTIES.map((o) => (
                    <SelectItem key={o.waarde} value={o.waarde}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          <div className="grid gap-4 sm:grid-cols-[1fr_120px]">
            <div className="space-y-2">
              <Label htmlFor="naam">Naam op de plaat</Label>
              <Input
                id="naam"
                placeholder="Bijv. Luuk"
                maxLength={20}
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="rugnummer">Rugnummer</Label>
              <Input
                id="rugnummer"
                inputMode="numeric"
                placeholder="10"
                maxLength={3}
                value={rugnummer}
                onChange={(e) => setRugnummer(e.target.value.replace(/\D/g, ""))}
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Beeldmodellen schrijven letters niet altijd foutloos. Controleer de naam op de plaat
            voordat je hem meegeeft.
          </p>

          <div className="space-y-2">
            <Label htmlFor="extra">Extra wensen (optioneel)</Label>
            <Input
              id="extra"
              placeholder="Bijv. met een sjaal om, of een hond ernaast"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODELLEN.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {gekozenModel && (
              <p className="text-xs text-muted-foreground">
                {gekozenModel.hint} Neemt maximaal {gekozenModel.maxReferenties}{" "}
                {gekozenModel.maxReferenties === 1 ? "referentie" : "referenties"} mee.
              </p>
            )}
          </div>

          <Button onClick={() => void genereer()} disabled={!magGenereren} className="w-full">
            {bezig ? (
              <>
                <Loader2 className="animate-spin" /> Bezig met tekenen…
              </>
            ) : (
              <>
                <Sparkles /> Kleurplaat genereren
              </>
            )}
          </Button>
        </section>
      </div>

      {/* ---------------- Resultaat ---------------- */}
      <div className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-lg">Resultaat</h2>
              {resultaat && (
                <p className="mt-1 text-sm text-muted-foreground">
                  {resultaat.omschrijving}
                  {resultaat.duur ? ` — ${resultaat.duur.toFixed(1)} sec` : ""}
                </p>
              )}
            </div>
            {resultaat && !bezig && (
              <div className="flex shrink-0 gap-2">
                <Button variant="outline" size="sm" onClick={() => void genereer()}>
                  <RotateCcw /> Opnieuw
                </Button>
                <Button size="sm" asChild>
                  <a href={downloadUrl(resultaat)} download>
                    <Download /> PNG
                  </a>
                </Button>
              </div>
            )}
          </div>

          {bezig && (
            <div className="mt-4 space-y-2">
              <Progress value={voortgang} />
              <p className="text-sm text-muted-foreground">{statusTekst}</p>
            </div>
          )}

          {fout && (
            <div className="mt-4 rounded-md border border-error bg-error-bg px-3 py-2 text-sm text-error">
              {fout}
            </div>
          )}

          <div className="mt-4 flex min-h-[320px] items-center justify-center rounded-md border border-border bg-white p-3">
            {resultaat ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={resultaat.url}
                alt={`Kleurplaat: ${resultaat.omschrijving}`}
                className="max-h-[70vh] w-auto max-w-full"
              />
            ) : (
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                {bezig
                  ? "Even geduld — de eerste plaat duurt meestal 10 tot 30 seconden."
                  : "Nog geen kleurplaat. Kies een scène en klik op genereren."}
              </p>
            )}
          </div>

          {resultaat && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setPromptZichtbaar((v) => !v)}
                className="text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
              >
                {promptZichtbaar ? "Prompt verbergen" : "Gebruikte prompt tonen"}
              </button>
              {promptZichtbaar && (
                <pre className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-xs leading-relaxed text-muted-foreground">
                  {resultaat.prompt}
                  {"\n\n"}
                  {resultaat.model}
                </pre>
              )}
            </div>
          )}
        </section>

        {historie.length > 1 && (
          <section className="rounded-lg border border-border bg-card p-4 shadow-card">
            <h2 className="text-lg">Eerder in deze sessie</h2>
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {historie.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setResultaat(item)}
                  className={cn(
                    "aspect-square overflow-hidden rounded-md border bg-white p-1 transition-colors",
                    resultaat?.id === item.id
                      ? "border-primary"
                      : "border-border hover:border-primary/60"
                  )}
                  title={item.omschrijving}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={item.url}
                    alt={item.omschrijving}
                    className="h-full w-full object-contain"
                  />
                </button>
              ))}
            </div>
            <p className="mt-2 text-xs text-muted-foreground">
              De links van Replicate verlopen na een uur. Download wat je wilt bewaren.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
