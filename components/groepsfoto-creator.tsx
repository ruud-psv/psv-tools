"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  Download,
  ImagePlus,
  Loader2,
  Pencil,
  Plus,
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
import { ModelKiezer } from "@/components/replicate/model-kiezer";
import { cn } from "@/lib/utils";
import {
  AANBEVOLEN_MODELLEN,
  GELEGENHEDEN,
  KLEDING,
  parseerModelId,
  POSITIES,
  STANDAARD_MODEL,
  type Basisfoto,
  type Gelegenheid,
  type GenereerResponse,
  type Kleding,
  type Positie,
  type StatusResponse,
} from "@/lib/groepsfoto";

/* ------------------------------------------------------------------ */
/* Hulpjes                                                             */
/* ------------------------------------------------------------------ */

/** Groot genoeg voor een herkenbaar gezicht, klein genoeg om vlot te versturen. */
const SELFIE_ZIJDE = 1024;
/** Spelersgezichten op een groepsfoto zijn klein; die moeten scherp blijven. */
const BASISFOTO_ZIJDE = 2048;

const POLL_INTERVAL = 1500;
const MAX_WACHTTIJD = 180_000;

function laadAfbeelding(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Kon de afbeelding niet lezen."));
    img.src = src;
  });
}

interface Verkleind {
  blob: Blob;
  breedte: number;
  hoogte: number;
}

/**
 * Verkleint een foto en codeert hem opnieuw als JPEG. Dat houdt de upload
 * klein en gooit meteen alle metadata weg (GPS, toestel). De browser draait
 * de foto bij het tekenen zelf volgens de EXIF-oriëntatie, dus een staande
 * telefoonfoto blijft staand.
 */
async function verkleinNaarJpeg(file: File, maxZijde: number): Promise<Verkleind> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await laadAfbeelding(objectUrl);
    const breedte = img.naturalWidth || maxZijde;
    const hoogte = img.naturalHeight || maxZijde;
    const schaal = Math.min(1, maxZijde / Math.max(breedte, hoogte));
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

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Verkleinen mislukt."))),
        "image/jpeg",
        0.9
      );
    });
    return { blob, breedte: w, hoogte: h };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function alsDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => resolve(String(lezer.result));
    lezer.onerror = () => reject(new Error("Kon de foto niet lezen."));
    lezer.readAsDataURL(blob);
  });
}

function fotoUrl(pad: string): string {
  return `/api/groepsfoto/basisfotos/bestand?pad=${encodeURIComponent(pad)}`;
}

/** Het resultaat via onze eigen route, met een nette bestandsnaam. */
function downloadUrl(url: string, naam: string): string {
  const params = new URLSearchParams({ url, naam });
  return `/api/groepsfoto/download?${params.toString()}`;
}

function bestandsnaam(label: string): string {
  const schoon = label
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50);
  return `psv-groepsfoto${schoon ? `-${schoon}` : ""}.png`;
}

/**
 * Een weigering van het veiligheidsfilter komt als technische melding terug.
 * Die vertalen we, want de gebruiker kan er iets mee: een andere selfie of een
 * ander model proberen.
 */
function leesbareFout(tekst: string): string {
  if (/sensitive|flagged|safety|nsfw|E005|content polic|moderation|prominent|public figure/i.test(tekst)) {
    return `Het model weigerde deze foto (veiligheidsfilter). Dat gebeurt soms bij herkenbare personen of bij foto's van kinderen. Probeer een andere selfie of een ander model. (${tekst})`;
  }
  return tekst;
}

interface Resultaat {
  id: string;
  url: string;
  prompt: string;
  model: string;
  duur?: number;
  basisfoto: Basisfoto;
}

interface NieuweFoto {
  bestand: Verkleind;
  voorbeeld: string;
  label: string;
  gelegenheid: Gelegenheid;
  plaatsingshint: string;
  kleding: string;
  rechten: boolean;
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export function GroepsfotoCreator() {
  /* Basisfoto's */
  const [basisfotos, setBasisfotos] = useState<Basisfoto[]>([]);
  const [gekozenId, setGekozenId] = useState<string>("");
  const [bibliotheekBezig, setBibliotheekBezig] = useState(true);
  const [bibliotheekFout, setBibliotheekFout] = useState("");
  const [nieuweFoto, setNieuweFoto] = useState<NieuweFoto | null>(null);
  const [fotoBezig, setFotoBezig] = useState(false);
  const [fotoFout, setFotoFout] = useState("");
  const [bewerken, setBewerken] = useState<{ plaatsingshint: string; kleding: string } | null>(null);
  const fotoBestandRef = useRef<HTMLInputElement>(null);

  /* Selfie */
  const [selfie, setSelfie] = useState<{ dataUrl: string } | null>(null);
  const [selfieBezig, setSelfieBezig] = useState(false);
  const [selfieFout, setSelfieFout] = useState("");
  const [toestemming, setToestemming] = useState(false);
  const [sleept, setSleept] = useState(false);
  const selfieRef = useRef<HTMLInputElement>(null);

  /* Instellingen */
  const [positie, setPositie] = useState<Positie>("automatisch");
  const [kleding, setKleding] = useState<Kleding>("passend");
  const [extra, setExtra] = useState("");
  const [model, setModel] = useState(STANDAARD_MODEL);
  const [modelBruikbaar, setModelBruikbaar] = useState(false);

  /* Generatie */
  const [bezig, setBezig] = useState(false);
  const [statusTekst, setStatusTekst] = useState("");
  const [voortgang, setVoortgang] = useState(0);
  const [fout, setFout] = useState("");
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [historie, setHistorie] = useState<Resultaat[]>([]);
  const [promptZichtbaar, setPromptZichtbaar] = useState(false);
  const [vergelijk, setVergelijk] = useState<number | null>(null);

  const afbrekenRef = useRef(false);

  const gekozenFoto = basisfotos.find((f) => f.id === gekozenId);

  /* -------------------------------------------------------------- */
  /* Laden                                                           */
  /* -------------------------------------------------------------- */

  useEffect(() => {
    let afgebroken = false;
    (async () => {
      try {
        const res = await fetch("/api/groepsfoto/basisfotos");
        const body = (await res.json()) as { basisfotos?: Basisfoto[]; error?: string };
        if (afgebroken) return;
        if (!res.ok || !body.basisfotos) {
          setBibliotheekFout(body.error ?? "De bibliotheek met foto's is niet bereikbaar.");
          return;
        }
        setBasisfotos(body.basisfotos);
        setGekozenId(body.basisfotos[0]?.id ?? "");
      } catch {
        if (!afgebroken) setBibliotheekFout("De bibliotheek met foto's is niet bereikbaar.");
      } finally {
        if (!afgebroken) setBibliotheekBezig(false);
      }
    })();
    return () => {
      afgebroken = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      afbrekenRef.current = true;
    };
  }, []);

  // Wie een andere foto kiest, bewerkt die andere foto niet per ongeluk.
  useEffect(() => setBewerken(null), [gekozenId]);

  /* -------------------------------------------------------------- */
  /* Selfie                                                          */
  /* -------------------------------------------------------------- */

  const kiesSelfie = useCallback(async (bestanden: FileList | File[]) => {
    setSelfieFout("");
    const bestand = Array.from(bestanden).find((f) => f.type.startsWith("image/"));
    if (!bestand) {
      setSelfieFout("Kies een foto (jpg, png of webp).");
      return;
    }

    setSelfieBezig(true);
    try {
      const { blob, breedte, hoogte } = await verkleinNaarJpeg(bestand, SELFIE_ZIJDE);
      if (Math.min(breedte, hoogte) < 256) {
        setSelfieFout("Deze foto is erg klein; het gezicht wordt dan niet herkenbaar. Kies een grotere.");
      }
      setSelfie({ dataUrl: await alsDataUrl(blob) });
    } catch {
      setSelfieFout(`"${bestand.name}" kon niet worden ingelezen.`);
    } finally {
      setSelfieBezig(false);
    }
  }, []);

  /* -------------------------------------------------------------- */
  /* Basisfoto's beheren                                             */
  /* -------------------------------------------------------------- */

  async function kiesNieuweFoto(bestanden: FileList) {
    const bestand = Array.from(bestanden).find((f) => f.type.startsWith("image/"));
    if (!bestand) return;
    setFotoFout("");
    try {
      const verkleind = await verkleinNaarJpeg(bestand, BASISFOTO_ZIJDE);
      setNieuweFoto({
        bestand: verkleind,
        voorbeeld: URL.createObjectURL(verkleind.blob),
        label: bestand.name.replace(/\.[a-z0-9]+$/i, "").slice(0, 60),
        gelegenheid: "kerst",
        plaatsingshint: "",
        kleding: "",
        rechten: false,
      });
    } catch {
      setFotoFout(`"${bestand.name}" kon niet worden ingelezen.`);
    }
  }

  function annuleerNieuweFoto() {
    if (nieuweFoto) URL.revokeObjectURL(nieuweFoto.voorbeeld);
    setNieuweFoto(null);
    setFotoFout("");
  }

  async function bewaarNieuweFoto() {
    if (!nieuweFoto) return;
    setFotoBezig(true);
    setFotoFout("");
    try {
      const formulier = new FormData();
      formulier.append("bestand", nieuweFoto.bestand.blob, "basisfoto.jpg");
      formulier.append("breedte", String(nieuweFoto.bestand.breedte));
      formulier.append("hoogte", String(nieuweFoto.bestand.hoogte));
      formulier.append("label", nieuweFoto.label);
      formulier.append("gelegenheid", nieuweFoto.gelegenheid);
      formulier.append("plaatsingshint", nieuweFoto.plaatsingshint);
      formulier.append("kleding", nieuweFoto.kleding);
      formulier.append("rechten", nieuweFoto.rechten ? "ja" : "nee");

      const res = await fetch("/api/groepsfoto/basisfotos", { method: "POST", body: formulier });
      const body = (await res.json()) as { basisfoto?: Basisfoto; error?: string };
      if (!res.ok || !body.basisfoto) throw new Error(body.error || "Foto opslaan mislukt.");

      const nieuw = body.basisfoto;
      setBasisfotos((vorige) => [nieuw, ...vorige]);
      setGekozenId(nieuw.id);
      annuleerNieuweFoto();
    } catch (err) {
      setFotoFout(err instanceof Error ? err.message : "Foto opslaan mislukt.");
    } finally {
      setFotoBezig(false);
    }
  }

  async function bewaarWijziging() {
    if (!gekozenFoto || !bewerken) return;
    setFotoBezig(true);
    setFotoFout("");
    try {
      const res = await fetch("/api/groepsfoto/basisfotos", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: gekozenFoto.id, ...bewerken }),
      });
      const body = (await res.json()) as { basisfoto?: Basisfoto; error?: string };
      if (!res.ok || !body.basisfoto) throw new Error(body.error || "Bijwerken mislukt.");
      const bijgewerkt = body.basisfoto;
      setBasisfotos((vorige) => vorige.map((f) => (f.id === bijgewerkt.id ? bijgewerkt : f)));
      setBewerken(null);
    } catch (err) {
      setFotoFout(err instanceof Error ? err.message : "Bijwerken mislukt.");
    } finally {
      setFotoBezig(false);
    }
  }

  async function verwijderFoto(foto: Basisfoto) {
    if (!window.confirm(`"${foto.label}" voor iedereen uit de bibliotheek verwijderen?`)) return;
    setFotoFout("");
    const res = await fetch(`/api/groepsfoto/basisfotos?id=${encodeURIComponent(foto.id)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setFotoFout(body.error ?? "Verwijderen mislukt.");
      return;
    }
    const over = basisfotos.filter((f) => f.id !== foto.id);
    setBasisfotos(over);
    if (gekozenId === foto.id) setGekozenId(over[0]?.id ?? "");
  }

  /* -------------------------------------------------------------- */
  /* Genereren                                                       */
  /* -------------------------------------------------------------- */

  const ontbreekt = !selfie
    ? "Upload eerst een selfie."
    : !toestemming
      ? "Bevestig dat de selfie van jou is, of dat je toestemming hebt."
      : !gekozenFoto
        ? "Kies een foto om je in te zetten."
        : !modelBruikbaar
          ? "Kies een model dat twee beelden aanneemt."
          : "";
  const magGenereren = !bezig && !ontbreekt;

  async function genereer() {
    if (!magGenereren || !selfie || !gekozenFoto) return;

    setBezig(true);
    setFout("");
    setVoortgang(4);
    setStatusTekst("Aanvraag versturen…");
    setVergelijk(null);
    afbrekenRef.current = false;

    const gekozen = parseerModelId(model);
    const basisfoto = gekozenFoto;

    try {
      const res = await fetch("/api/groepsfoto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: gekozen?.id ?? model,
          versie: gekozen?.versie,
          basisfoto: basisfoto.id,
          selfie: selfie.dataUrl,
          toestemming,
          positie,
          kleding,
          extra,
        }),
      });

      const body = (await res.json()) as GenereerResponse & { error?: string };
      if (!res.ok) throw new Error(body.error || `Genereren mislukt (HTTP ${res.status}).`);

      await volgVoorspelling(body, basisfoto);
    } catch (err) {
      setFout(leesbareFout(err instanceof Error ? err.message : "Er ging iets mis bij het genereren."));
      setStatusTekst("");
      setVoortgang(0);
    } finally {
      setBezig(false);
    }
  }

  /** Vraagt de status op tot de foto klaar is, mislukt of de tijd om is. */
  async function volgVoorspelling(start: GenereerResponse, basisfoto: Basisfoto) {
    const begin = Date.now();

    while (!afbrekenRef.current) {
      const verstreken = Date.now() - begin;
      if (verstreken > MAX_WACHTTIJD) {
        throw new Error("Het duurde te lang. Probeer het opnieuw of kies een ander model.");
      }
      setVoortgang(Math.min(95, 8 + (verstreken / 45_000) * 87));

      await new Promise((r) => setTimeout(r, POLL_INTERVAL));
      if (afbrekenRef.current) return;

      const res = await fetch(`/api/groepsfoto/status/${start.id}`, { cache: "no-store" });
      const status = (await res.json()) as StatusResponse & { error?: string };
      if (!res.ok) throw new Error(status.error || "Status opvragen mislukt.");

      if (status.status === "starting") setStatusTekst("In de wachtrij bij het model…");
      if (status.status === "processing") setStatusTekst("Je wordt in de foto gezet…");

      if (status.status === "succeeded" && status.imageUrl) {
        const klaar: Resultaat = {
          id: start.id,
          url: status.imageUrl,
          prompt: start.prompt,
          model: start.model,
          duur: status.duur,
          basisfoto,
        };
        setResultaat(klaar);
        setHistorie((vorige) => [klaar, ...vorige.filter((h) => h.id !== klaar.id)].slice(0, 8));
        setVoortgang(100);
        setStatusTekst("");
        return;
      }

      if (status.status === "failed" || status.status === "canceled") {
        throw new Error(status.error || "Het model kon deze foto niet maken.");
      }
    }
  }

  /* -------------------------------------------------------------- */
  /* Weergave                                                        */
  /* -------------------------------------------------------------- */

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
      {/* ---------------- Instellingen ---------------- */}
      <div className="space-y-6">
        {/* Selfie */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-lg">Jouw selfie</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Alleen jij in beeld, gezicht recht naar de camera, goed licht en geen zonnebril. De
            selfie gaat alleen naar het model en wordt nergens bewaard.
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
              void kiesSelfie(e.dataTransfer.files);
            }}
            onClick={() => selfieRef.current?.click()}
            className={cn(
              "mt-4 flex cursor-pointer items-center justify-center gap-4 rounded-md border-2 border-dashed p-4 text-center transition-colors",
              sleept ? "border-primary bg-primary/5" : "border-border hover:border-primary/60"
            )}
          >
            {selfie ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={selfie.dataUrl}
                  alt="Jouw selfie"
                  className="h-28 w-28 rounded-md object-cover"
                />
                <p className="text-sm text-muted-foreground">Klik of sleep om te vervangen</p>
              </>
            ) : (
              <div className="flex flex-col items-center gap-2 py-4">
                {selfieBezig ? (
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                ) : (
                  <Camera className="h-6 w-6 text-muted-foreground" />
                )}
                <p className="text-sm font-medium">Maak een selfie of kies een foto</p>
                <p className="text-xs text-muted-foreground">
                  Op je telefoon opent de camera meteen
                </p>
              </div>
            )}
          </div>
          <input
            ref={selfieRef}
            type="file"
            accept="image/*"
            capture="user"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void kiesSelfie(e.target.files);
              e.target.value = "";
            }}
          />
          {selfieFout && <p className="mt-2 text-sm text-destructive">{selfieFout}</p>}

          <label className="mt-4 flex items-start gap-2 text-sm">
            <input
              type="checkbox"
              checked={toestemming}
              onChange={(e) => setToestemming(e.target.checked)}
              className="mt-0.5 h-4 w-4 accent-primary"
            />
            <span>
              Dit is een foto van mezelf, of van iemand die daar toestemming voor gaf.
            </span>
          </label>
        </section>

        {/* Basisfoto */}
        <section className="rounded-lg border border-border bg-card p-4 shadow-card">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-lg">De foto</h2>
            {!nieuweFoto && (
              <button
                type="button"
                onClick={() => fotoBestandRef.current?.click()}
                className="inline-flex items-center gap-1 font-heading text-xs uppercase tracking-wide text-primary hover:underline"
              >
                <Plus className="h-3 w-3" /> Foto toevoegen
              </button>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            De groepsfoto met spelers waar jij in komt. De bibliotheek is gedeeld: wat jij
            toevoegt, ziet iedereen.
          </p>
          <input
            ref={fotoBestandRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              if (e.target.files) void kiesNieuweFoto(e.target.files);
              e.target.value = "";
            }}
          />

          {nieuweFoto && (
            <div className="mt-4 space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <p className="label">Nieuwe foto</p>
                <button
                  type="button"
                  onClick={annuleerNieuweFoto}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Annuleren"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={nieuweFoto.voorbeeld}
                alt="Voorbeeld van de nieuwe foto"
                className="w-full rounded-md"
              />
              <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                <div className="space-y-1">
                  <Label htmlFor="foto-label">Naam</Label>
                  <Input
                    id="foto-label"
                    maxLength={60}
                    placeholder="Kerst 2026 — bij de boom"
                    value={nieuweFoto.label}
                    onChange={(e) => setNieuweFoto({ ...nieuweFoto, label: e.target.value })}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="foto-gelegenheid">Gelegenheid</Label>
                  <Select
                    value={nieuweFoto.gelegenheid}
                    onValueChange={(v) => setNieuweFoto({ ...nieuweFoto, gelegenheid: v as Gelegenheid })}
                  >
                    <SelectTrigger id="foto-gelegenheid">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GELEGENHEDEN.map((g) => (
                        <SelectItem key={g.waarde} value={g.waarde}>
                          {g.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-1">
                <Label htmlFor="foto-kleding">Wat draagt de groep? (optioneel)</Label>
                <Input
                  id="foto-kleding"
                  maxLength={200}
                  placeholder="red knitted Christmas jumpers with a white PSV pattern"
                  value={nieuweFoto.kleding}
                  onChange={(e) => setNieuweFoto({ ...nieuweFoto, kleding: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="foto-hint">Waar is ruimte in de groep? (optioneel)</Label>
                <Input
                  id="foto-hint"
                  maxLength={200}
                  placeholder="there is a gap between the second and third player from the left"
                  value={nieuweFoto.plaatsingshint}
                  onChange={(e) => setNieuweFoto({ ...nieuweFoto, plaatsingshint: e.target.value })}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Engels werkt het best: deze zinnen gaan letterlijk de prompt in.
              </p>
              <label className="flex items-start gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={nieuweFoto.rechten}
                  onChange={(e) => setNieuweFoto({ ...nieuweFoto, rechten: e.target.checked })}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>
                  De spelers op deze foto hebben toestemming gegeven voor dit gebruik. Je naam
                  wordt bij de foto bewaard.
                </span>
              </label>
              <Button
                size="sm"
                onClick={() => void bewaarNieuweFoto()}
                disabled={fotoBezig || !nieuweFoto.rechten || !nieuweFoto.label.trim()}
              >
                {fotoBezig ? <Loader2 className="animate-spin" /> : <ImagePlus />} Toevoegen voor
                iedereen
              </Button>
            </div>
          )}

          {fotoFout && <p className="mt-2 text-sm text-destructive">{fotoFout}</p>}
          {bibliotheekFout && <p className="mt-2 text-sm text-destructive">{bibliotheekFout}</p>}

          {bibliotheekBezig ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Foto&apos;s laden…
            </p>
          ) : basisfotos.length === 0 ? (
            !bibliotheekFout && (
              <p className="mt-3 text-xs text-warning">
                Er staan nog geen foto&apos;s in de bibliotheek. Voeg er eerst een toe.
              </p>
            )
          ) : (
            <div className="mt-4 grid grid-cols-3 gap-2">
              {basisfotos.map((foto) => {
                const gekozen = foto.id === gekozenId;
                return (
                  <button
                    key={foto.id}
                    type="button"
                    onClick={() => setGekozenId(foto.id)}
                    aria-pressed={gekozen}
                    title={foto.label}
                    className={cn(
                      "relative aspect-[4/3] overflow-hidden rounded-md border-2 bg-muted transition-colors",
                      gekozen ? "border-primary" : "border-border opacity-70 hover:opacity-100"
                    )}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={fotoUrl(foto.pad)} alt={foto.label} className="h-full w-full object-cover" />
                    {gekozen && (
                      <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-primary p-0.5 text-white">
                        <Check className="h-3 w-3" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {gekozenFoto && !nieuweFoto && (
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-medium text-foreground">{gekozenFoto.label}</span> ·{" "}
                {GELEGENHEDEN.find((g) => g.waarde === gekozenFoto.gelegenheid)?.label} · toegevoegd
                door {gekozenFoto.toegevoegdDoor}
              </p>

              {bewerken ? (
                <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                  <div className="space-y-1">
                    <Label htmlFor="bewerk-kleding">Wat draagt de groep?</Label>
                    <Input
                      id="bewerk-kleding"
                      maxLength={200}
                      value={bewerken.kleding}
                      onChange={(e) => setBewerken({ ...bewerken, kleding: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="bewerk-hint">Waar is ruimte in de groep?</Label>
                    <Input
                      id="bewerk-hint"
                      maxLength={200}
                      value={bewerken.plaatsingshint}
                      onChange={(e) => setBewerken({ ...bewerken, plaatsingshint: e.target.value })}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => void bewaarWijziging()} disabled={fotoBezig}>
                      {fotoBezig ? <Loader2 className="animate-spin" /> : <Check />} Opslaan
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => setBewerken(null)}>
                      Annuleren
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  {gekozenFoto.kleding && <p>Kleding: {gekozenFoto.kleding}</p>}
                  {gekozenFoto.plaatsingshint && <p>Ruimte: {gekozenFoto.plaatsingshint}</p>}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={() =>
                        setBewerken({
                          kleding: gekozenFoto.kleding ?? "",
                          plaatsingshint: gekozenFoto.plaatsingshint ?? "",
                        })
                      }
                      className="inline-flex items-center gap-1 text-primary hover:underline"
                    >
                      <Pencil className="h-3 w-3" /> Hints bewerken
                    </button>
                    <button
                      type="button"
                      onClick={() => void verwijderFoto(gekozenFoto)}
                      className="inline-flex items-center gap-1 hover:text-destructive"
                    >
                      <Trash2 className="h-3 w-3" /> Verwijderen
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* Instellingen */}
        <section className="space-y-5 rounded-lg border border-border bg-card p-4 shadow-card">
          <h2 className="text-lg">Instellingen</h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="positie">Waar sta je?</Label>
              <Select value={positie} onValueChange={(v) => setPositie(v as Positie)}>
                <SelectTrigger id="positie">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {POSITIES.map((p) => (
                    <SelectItem key={p.waarde} value={p.waarde}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="kleding">Kleding</Label>
              <Select value={kleding} onValueChange={(v) => setKleding(v as Kleding)}>
                <SelectTrigger id="kleding">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KLEDING.map((k) => (
                    <SelectItem key={k.waarde} value={k.waarde}>
                      {k.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="extra">Extra wensen (optioneel)</Label>
            <Textarea
              id="extra"
              rows={2}
              maxLength={400}
              placeholder="Bijv. met een kerstmuts op, of lachend naar de camera"
              value={extra}
              onChange={(e) => setExtra(e.target.value)}
            />
          </div>

          <Separator />

          <ModelKiezer
            apiBasis="/api/groepsfoto"
            aanbevolen={AANBEVOLEN_MODELLEN}
            standaard={STANDAARD_MODEL}
            waarde={model}
            onChange={setModel}
            onBruikbaar={setModelBruikbaar}
          />

          <div className="space-y-2">
            <Button onClick={() => void genereer()} disabled={!magGenereren} className="w-full">
              {bezig ? (
                <>
                  <Loader2 className="animate-spin" /> Bezig…
                </>
              ) : (
                <>
                  <Sparkles /> Zet mij in de foto
                </>
              )}
            </Button>
            {ontbreekt && !bezig && (
              <p className="text-center text-xs text-muted-foreground">{ontbreekt}</p>
            )}
          </div>
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
                  {resultaat.basisfoto.label}
                  {resultaat.duur ? ` — ${resultaat.duur.toFixed(1)} sec` : ""}
                </p>
              )}
            </div>
            {resultaat && !bezig && (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setVergelijk((v) => (v === null ? 50 : null))}
                >
                  {vergelijk === null ? "Vergelijk" : "Alleen resultaat"}
                </Button>
                <Button variant="outline" size="sm" onClick={() => void genereer()} disabled={!magGenereren}>
                  <RotateCcw /> Opnieuw
                </Button>
                <Button size="sm" asChild>
                  <a
                    href={downloadUrl(resultaat.url, resultaat.basisfoto.label)}
                    download={bestandsnaam(resultaat.basisfoto.label)}
                  >
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

          <div className="mt-4 flex min-h-[320px] items-center justify-center rounded-md border border-border bg-muted p-3">
            {resultaat ? (
              <div className="relative inline-block max-w-full">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={resultaat.url}
                  alt={`Groepsfoto: ${resultaat.basisfoto.label}`}
                  className="block max-h-[70vh] w-auto max-w-full"
                />
                {vergelijk !== null && (
                  <>
                    {/* De originele foto eroverheen, tot aan de schuif. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={fotoUrl(resultaat.basisfoto.pad)}
                      alt="De originele foto"
                      className="pointer-events-none absolute inset-0 h-full w-full object-cover"
                      style={{ clipPath: `inset(0 ${100 - vergelijk}% 0 0)` }}
                    />
                    <div
                      className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow"
                      style={{ left: `${vergelijk}%` }}
                    />
                    <span className="label pointer-events-none absolute left-2 top-2 rounded bg-psv-black/70 px-1.5 py-0.5 text-white">
                      Origineel
                    </span>
                    <span className="label pointer-events-none absolute right-2 top-2 rounded bg-psv-black/70 px-1.5 py-0.5 text-white">
                      Met jou
                    </span>
                  </>
                )}
              </div>
            ) : (
              <p className="max-w-xs text-center text-sm text-muted-foreground">
                {bezig
                  ? "Even geduld — dit duurt meestal 10 tot 40 seconden."
                  : "Nog geen resultaat. Upload een selfie, kies een foto en klik op de knop."}
              </p>
            )}
          </div>

          {resultaat && vergelijk !== null && (
            <input
              type="range"
              min={0}
              max={100}
              value={vergelijk}
              onChange={(e) => setVergelijk(Number(e.target.value))}
              className="mt-3 w-full accent-primary"
              aria-label="Schuif tussen de originele foto en het resultaat"
            />
          )}

          {resultaat && (
            <div className="mt-3">
              <button
                type="button"
                onClick={() => setPromptZichtbaar((v) => !v)}
                className="font-heading text-xs uppercase tracking-wide text-muted-foreground hover:text-foreground"
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
                    "aspect-square overflow-hidden rounded-md border bg-muted transition-colors",
                    resultaat?.id === item.id ? "border-primary" : "border-border hover:border-primary/60"
                  )}
                  title={`${item.basisfoto.label} — ${item.model}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt={item.basisfoto.label} className="h-full w-full object-cover" />
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
