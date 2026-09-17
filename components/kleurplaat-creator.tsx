"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Check,
  Download,
  ImagePlus,
  Loader2,
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  canvasNaarBlob,
  STANDAARD_LOGO,
  steldeKleurplaatSamen,
  type LogoHoek,
  type LogoStijl,
} from "@/lib/kleurplaat/compositie";
import {
  AANBEVOLEN_MODELLEN,
  parseerModelId,
  SCENES,
  STANDAARD_MODEL,
  vindScene,
  type BewaardModel,
  type DetailNiveau,
  type GenereerResponse,
  type Logo,
  type ModelProfielInfo,
  type Referentie,
  type StatusResponse,
  type Verhouding,
} from "@/lib/kleurplaat";

/* ------------------------------------------------------------------ */
/* Hulpjes                                                             */
/* ------------------------------------------------------------------ */

/** Groot genoeg voor het model, klein genoeg om vlot te uploaden. */
const MAX_ZIJDE = 1024;
/** Zoveel referenties gaan er hoogstens mee, ook als het model meer aankan. */
const MAX_MEE = 6;

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

/**
 * Schaalt een upload terug naar maximaal 1024px en zet hem op een witte
 * achtergrond. Dat houdt de upload klein en voorkomt dat een transparante PNG
 * als zwart vlak bij het model aankomt.
 */
async function verkleinNaarJpeg(file: File): Promise<Blob> {
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

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Verkleinen mislukt."))),
        "image/jpeg",
        0.85
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

/** Zelfde verkleining, maar als png met doorzichtigheid — nodig voor een logo. */
async function verkleinNaarPng(file: File, maxZijde = 640): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await laadAfbeelding(objectUrl);
    const schaal = Math.min(1, maxZijde / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
    const w = Math.max(1, Math.round((img.naturalWidth || maxZijde) * schaal));
    const h = Math.max(1, Math.round((img.naturalHeight || maxZijde) * schaal));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is niet beschikbaar in deze browser.");
    ctx.drawImage(img, 0, 0, w, h);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Verkleinen mislukt."))),
        "image/png"
      );
    });
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function voorbeeldUrl(pad: string): string {
  return `/api/kleurplaat/referenties/bestand?pad=${encodeURIComponent(pad)}`;
}

/** De sleutel waaronder een model in de lijst staat. */
function modelSleutel(m: { id: string; versie?: string }): string {
  return m.versie ? `${m.id}:${m.versie}` : m.id;
}

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

const LOGO_OPTIES: { waarde: LogoHoek; label: string }[] = [
  { waarde: "linksboven", label: "Linksboven" },
  { waarde: "rechtsboven", label: "Rechtsboven" },
  { waarde: "linksonder", label: "Linksonder" },
  { waarde: "rechtsonder", label: "Rechtsonder" },
  { waarde: "geen", label: "Geen logo" },
];

const LOGO_STIJLEN: { waarde: LogoStijl; label: string }[] = [
  { waarde: "lijn", label: "Lijntekening — in te kleuren" },
  { waarde: "kleur", label: "Vol in kleur" },
];

/** De tekening via onze eigen route, zodat het canvas er een PNG uit kan halen. */
function tekeningUrl(url: string): string {
  return `/api/kleurplaat/download?url=${encodeURIComponent(url)}&inline=1`;
}

function bestandsnaam(label: string): string {
  const schoon = label
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 50);
  return `kleurplaat-phoxy${schoon ? `-${schoon}` : ""}.png`;
}

export function KleurplaatCreator() {
  /* Gedeelde bibliotheek */
  const [referenties, setReferenties] = useState<Referentie[]>([]);
  const [gekozenPaden, setGekozenPaden] = useState<string[]>([]);
  const [bibliotheekBezig, setBibliotheekBezig] = useState(true);
  const [uploadBezig, setUploadBezig] = useState(false);
  const [sleept, setSleept] = useState(false);
  const [uploadFout, setUploadFout] = useState("");
  const bestandRef = useRef<HTMLInputElement>(null);

  /* Modellen */
  const [model, setModel] = useState(STANDAARD_MODEL);
  const [gedeeldeModellen, setGedeeldeModellen] = useState<BewaardModel[]>([]);
  const [profielen, setProfielen] = useState<Record<string, ModelProfielInfo>>({});
  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [nieuwModel, setNieuwModel] = useState("");
  const [controleBezig, setControleBezig] = useState(false);
  const [controleFout, setControleFout] = useState("");
  const [controleInfo, setControleInfo] = useState<ModelProfielInfo | null>(null);
  const [opslaanBezig, setOpslaanBezig] = useState(false);

  /* Instellingen */
  const [sceneId, setSceneId] = useState<string>(SCENES[0].id);
  const [eigenScene, setEigenScene] = useState("");
  const [detail, setDetail] = useState<DetailNiveau>("gemiddeld");
  const [verhouding, setVerhouding] = useState<Verhouding>("2:3");
  const [naam, setNaam] = useState("");
  const [rugnummer, setRugnummer] = useState("");
  const [extra, setExtra] = useState("");
  const [logoHoek, setLogoHoek] = useState<LogoHoek>("linksboven");
  const [logoStijl, setLogoStijl] = useState<LogoStijl>("lijn");
  const [logo, setLogo] = useState<Logo | null>(null);
  const [logoBezig, setLogoBezig] = useState(false);
  const [logoFout, setLogoFout] = useState("");
  const logoBestandRef = useRef<HTMLInputElement>(null);

  /* Generatie */
  const [bezig, setBezig] = useState(false);
  const [statusTekst, setStatusTekst] = useState("");
  const [voortgang, setVoortgang] = useState(0);
  const [fout, setFout] = useState("");
  const [resultaat, setResultaat] = useState<Resultaat | null>(null);
  const [historie, setHistorie] = useState<Resultaat[]>([]);
  const [promptZichtbaar, setPromptZichtbaar] = useState(false);

  /* De samengestelde plaat: tekening + logo + naam */
  const [plaat, setPlaat] = useState<{ url: string; blob: Blob } | null>(null);
  const [plaatFout, setPlaatFout] = useState("");

  const afbrekenRef = useRef(false);

  /* -------------------------------------------------------------- */
  /* Bibliotheek en modellen laden                                   */
  /* -------------------------------------------------------------- */

  const profiel = profielen[model];
  const modelMax = profiel ? Math.min(profiel.maxReferenties, MAX_MEE) : MAX_MEE;

  useEffect(() => {
    // Alles staat nu gedeeld op de server; oude lokale kopieën mogen weg.
    try {
      localStorage.removeItem("kleurplaat:referenties");
      localStorage.removeItem("kleurplaat:modellen");
      localStorage.removeItem("kleurplaat:model");
    } catch {
      // geen opslag, ook goed
    }

    let afgebroken = false;

    (async () => {
      try {
        const [refRes, modRes, logoRes] = await Promise.all([
          fetch("/api/kleurplaat/referenties"),
          fetch("/api/kleurplaat/modellen"),
          fetch("/api/kleurplaat/logo"),
        ]);

        if (!afgebroken && refRes.ok) {
          const body = (await refRes.json()) as { referenties: Referentie[] };
          setReferenties(body.referenties);
          setGekozenPaden(body.referenties.slice(0, MAX_MEE).map((r) => r.pad));
        } else if (!afgebroken) {
          const body = (await refRes.json()) as { error?: string };
          setUploadFout(body.error ?? "De gedeelde bibliotheek is niet bereikbaar.");
        }

        if (!afgebroken && modRes.ok) {
          const body = (await modRes.json()) as { modellen: BewaardModel[] };
          setGedeeldeModellen(body.modellen);
        }

        if (!afgebroken && logoRes.ok) {
          const body = (await logoRes.json()) as { logo: Logo | null };
          setLogo(body.logo);
        }
      } catch {
        if (!afgebroken) setUploadFout("De gedeelde bibliotheek is niet bereikbaar.");
      } finally {
        if (!afgebroken) setBibliotheekBezig(false);
      }
    })();

    return () => {
      afgebroken = true;
    };
  }, []);

  /** Wisselen naar een model dat minder referenties aankan, snoeit de keuze. */
  useEffect(() => {
    setGekozenPaden((vorige) => (vorige.length > modelMax ? vorige.slice(0, modelMax) : vorige));
  }, [modelMax]);

  useEffect(() => {
    if (profielen[model]) return;
    let afgebroken = false;

    (async () => {
      try {
        const res = await fetch(`/api/kleurplaat/model?id=${encodeURIComponent(model)}`);
        if (!res.ok) return; // stil: de generatieknop meldt het probleem wel
        const info = (await res.json()) as ModelProfielInfo;
        if (!afgebroken) setProfielen((vorige) => ({ ...vorige, [model]: info }));
      } catch {
        // geen profiel is niet fataal; we tonen dan gewoon minder detail
      }
    })();

    return () => {
      afgebroken = true;
    };
  }, [model, profielen]);

  /* -------------------------------------------------------------- */
  /* Referenties beheren                                             */
  /* -------------------------------------------------------------- */

  const voegBestandenToe = useCallback(
    async (bestanden: FileList | File[]) => {
      setUploadFout("");
      const lijst = Array.from(bestanden).filter((f) => f.type.startsWith("image/"));
      if (lijst.length === 0) {
        setUploadFout("Kies een afbeelding (png, jpg, webp of svg).");
        return;
      }

      setUploadBezig(true);
      try {
        for (const bestand of lijst) {
          let verkleind: Blob;
          try {
            verkleind = await verkleinNaarJpeg(bestand);
          } catch {
            setUploadFout(`"${bestand.name}" kon niet worden ingelezen.`);
            continue;
          }

          const formulier = new FormData();
          formulier.append("bestand", verkleind, bestand.name);

          const res = await fetch("/api/kleurplaat/referenties", {
            method: "POST",
            body: formulier,
          });
          const body = (await res.json()) as { referentie?: Referentie; error?: string };

          if (!res.ok || !body.referentie) {
            setUploadFout(body.error ?? `"${bestand.name}" kon niet worden opgeslagen.`);
            break;
          }

          const nieuwe = body.referentie;
          setReferenties((vorige) => [...vorige, nieuwe]);
          setGekozenPaden((vorige) =>
            vorige.length < modelMax ? [...vorige, nieuwe.pad] : vorige
          );
        }
      } finally {
        setUploadBezig(false);
      }
    },
    [modelMax]
  );

  async function verwijderReferentie(pad: string) {
    setUploadFout("");
    const res = await fetch(`/api/kleurplaat/referenties?pad=${encodeURIComponent(pad)}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const body = (await res.json()) as { error?: string };
      setUploadFout(body.error ?? "Verwijderen mislukt.");
      return;
    }
    setReferenties((vorige) => vorige.filter((r) => r.pad !== pad));
    setGekozenPaden((vorige) => vorige.filter((p) => p !== pad));
  }

  function wisselReferentie(pad: string) {
    setGekozenPaden((vorige) => {
      if (vorige.includes(pad)) return vorige.filter((p) => p !== pad);
      if (vorige.length >= modelMax) return vorige;
      return [...vorige, pad];
    });
  }

  /* -------------------------------------------------------------- */
  /* Logo beheren                                                    */
  /* -------------------------------------------------------------- */

  const logoUrl = logo ? voorbeeldUrl(logo.pad) : STANDAARD_LOGO;

  async function vervangLogo(bestanden: FileList | File[]) {
    const bestand = Array.from(bestanden)[0];
    if (!bestand) return;

    setLogoFout("");
    if (bestand.type !== "image/png") {
      setLogoFout("Het logo moet een png zijn, met een doorzichtige achtergrond.");
      return;
    }

    setLogoBezig(true);
    try {
      const formulier = new FormData();
      formulier.append("bestand", await verkleinNaarPng(bestand), bestand.name);

      const res = await fetch("/api/kleurplaat/logo", { method: "POST", body: formulier });
      const body = (await res.json()) as { logo?: Logo; error?: string };
      if (!res.ok || !body.logo) throw new Error(body.error || "Logo opslaan mislukt.");
      setLogo(body.logo);
    } catch (err) {
      setLogoFout(err instanceof Error ? err.message : "Logo opslaan mislukt.");
    } finally {
      setLogoBezig(false);
    }
  }

  async function herstelStandaardLogo() {
    setLogoFout("");
    setLogoBezig(true);
    try {
      const res = await fetch("/api/kleurplaat/logo", { method: "DELETE" });
      if (!res.ok) {
        const body = (await res.json()) as { error?: string };
        throw new Error(body.error || "Verwijderen mislukt.");
      }
      setLogo(null);
    } catch (err) {
      setLogoFout(err instanceof Error ? err.message : "Verwijderen mislukt.");
    } finally {
      setLogoBezig(false);
    }
  }

  /* -------------------------------------------------------------- */
  /* Modellen beheren                                                */
  /* -------------------------------------------------------------- */

  async function controleerModel() {
    const gekozen = parseerModelId(nieuwModel);
    setControleInfo(null);
    setControleFout("");

    if (!gekozen) {
      setControleFout(
        "Dat lijkt geen model-identifier. Gebruik eigenaar/modelnaam, of plak de URL van replicate.com."
      );
      return;
    }

    setControleBezig(true);
    try {
      const res = await fetch(`/api/kleurplaat/model?id=${encodeURIComponent(modelSleutel(gekozen))}`);
      const body = (await res.json()) as ModelProfielInfo & { error?: string };
      if (!res.ok) throw new Error(body.error || `Controle mislukt (HTTP ${res.status}).`);
      setControleInfo(body);
    } catch (err) {
      setControleFout(err instanceof Error ? err.message : "Controle mislukt.");
    } finally {
      setControleBezig(false);
    }
  }

  async function voegModelToe() {
    if (!controleInfo) return;
    setOpslaanBezig(true);
    setControleFout("");

    try {
      const res = await fetch("/api/kleurplaat/modellen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: controleInfo.id, versie: controleInfo.versie }),
      });
      const body = (await res.json()) as { model?: BewaardModel; error?: string };
      if (!res.ok || !body.model) throw new Error(body.error || "Model opslaan mislukt.");

      const toegevoegd = body.model;
      const sleutel = modelSleutel(toegevoegd);
      setGedeeldeModellen((vorige) => [
        ...vorige.filter((m) => modelSleutel(m) !== sleutel),
        toegevoegd,
      ]);
      setProfielen((vorige) => ({ ...vorige, [sleutel]: controleInfo }));
      setModel(sleutel);

      setNieuwModel("");
      setControleInfo(null);
      setToevoegenOpen(false);
    } catch (err) {
      setControleFout(err instanceof Error ? err.message : "Model opslaan mislukt.");
    } finally {
      setOpslaanBezig(false);
    }
  }

  async function verwijderModel(sleutel: string) {
    const res = await fetch(`/api/kleurplaat/modellen?id=${encodeURIComponent(sleutel)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setGedeeldeModellen((vorige) => vorige.filter((m) => modelSleutel(m) !== sleutel));
    if (model === sleutel) setModel(STANDAARD_MODEL);
  }

  /* -------------------------------------------------------------- */
  /* Genereren                                                       */
  /* -------------------------------------------------------------- */

  const gedeeldModel = gedeeldeModellen.find((m) => modelSleutel(m) === model);
  const aanbevolen = AANBEVOLEN_MODELLEN.find((m) => m.id === model);
  const sceneOmschrijving =
    sceneId === "eigen" ? eigenScene.trim() : vindScene(sceneId)?.label ?? "";
  const magGenereren = !bezig && (sceneId !== "eigen" || eigenScene.trim().length >= 3);

  useEffect(() => {
    return () => {
      afbrekenRef.current = true;
    };
  }, []);

  /**
   * Zet de plaat opnieuw in elkaar zodra de tekening er is of de naam of het
   * logo verandert. Dat kost geen generatie: het gebeurt hier in de browser.
   */
  useEffect(() => {
    if (!resultaat) {
      setPlaat(null);
      return;
    }

    let afgebroken = false;
    let gemaakteUrl: string | null = null;

    // Even wachten, anders stelt hij bij elke toetsaanslag opnieuw samen.
    const wachten = setTimeout(() => {
      void (async () => {
        try {
          const canvas = await steldeKleurplaatSamen(tekeningUrl(resultaat.url), {
            naam,
            logoHoek,
            logoStijl,
            logoUrl,
          });
          const blob = await canvasNaarBlob(canvas);
          if (afgebroken) return;
          gemaakteUrl = URL.createObjectURL(blob);
          setPlaat({ url: gemaakteUrl, blob });
          setPlaatFout("");
        } catch {
          if (afgebroken) return;
          setPlaat(null);
          setPlaatFout("Samenstellen lukte niet; je ziet de kale tekening van het model.");
        }
      })();
    }, 200);

    return () => {
      afgebroken = true;
      clearTimeout(wachten);
      if (gemaakteUrl) URL.revokeObjectURL(gemaakteUrl);
    };
  }, [resultaat, naam, logoHoek, logoStijl, logoUrl]);

  async function genereer() {
    if (!magGenereren) return;

    setBezig(true);
    setFout("");
    setVoortgang(4);
    setStatusTekst("Aanvraag versturen…");
    afbrekenRef.current = false;

    const gekozen = parseerModelId(model);

    try {
      const res = await fetch("/api/kleurplaat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: gekozen?.id ?? model,
          versie: gekozen?.versie,
          sceneId,
          eigenScene,
          detail,
          verhouding,
          rugnummer,
          extra,
          logoHoek,
          referenties: gekozenPaden.slice(0, modelMax),
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

  function downloadUrl(item: Resultaat): string {
    if (plaat) return plaat.url;
    // Terugval: zonder samengestelde plaat haalt de server hem op bij Replicate.
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
            De gedeelde bibliotheek van de tool: wat jij uploadt, ziet iedereen. Klik een
            referentie aan of uit om te bepalen welke meegaan naar het model.
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
            {uploadBezig ? (
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            ) : (
              <ImagePlus className="h-6 w-6 text-muted-foreground" />
            )}
            <p className="text-sm font-medium">
              {uploadBezig ? "Bezig met uploaden…" : "Sleep afbeeldingen hierheen of klik om te kiezen"}
            </p>
            <p className="text-xs text-muted-foreground">
              png, jpg, webp of svg — ze worden verkleind en gedeeld opgeslagen
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

          {bibliotheekBezig ? (
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Bibliotheek laden…
            </p>
          ) : referenties.length > 0 ? (
            <>
              <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-4">
                {referenties.map((ref) => {
                  const gekozen = gekozenPaden.includes(ref.pad);
                  return (
                    <div
                      key={ref.pad}
                      className={cn(
                        "group relative aspect-square overflow-hidden rounded-md border-2 bg-white transition-colors",
                        gekozen ? "border-primary" : "border-border opacity-60 hover:opacity-100"
                      )}
                      title={`${ref.naam}${gekozen ? " — gaat mee" : ""}`}
                    >
                      <button
                        type="button"
                        onClick={() => wisselReferentie(ref.pad)}
                        className="h-full w-full"
                        aria-pressed={gekozen}
                        aria-label={`${ref.naam} ${gekozen ? "niet meesturen" : "meesturen"}`}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={voorbeeldUrl(ref.pad)}
                          alt={ref.naam}
                          className="h-full w-full object-contain"
                        />
                      </button>
                      {gekozen && (
                        <span className="pointer-events-none absolute left-1 top-1 rounded-full bg-primary p-0.5 text-white">
                          <Check className="h-3 w-3" />
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => void verwijderReferentie(ref.pad)}
                        className="absolute right-1 top-1 rounded-full bg-psv-black/70 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                        aria-label={`${ref.naam} uit de bibliotheek verwijderen`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-3 text-xs text-muted-foreground">
                {modelMax === 0
                  ? "Dit model neemt geen referenties mee."
                  : `${gekozenPaden.length} van ${referenties.length} gaan mee — dit model neemt er maximaal ${modelMax}.`}
              </p>
            </>
          ) : (
            <p className="mt-3 text-xs text-warning">
              De bibliotheek is nog leeg. Zonder referentie tekent het model een willekeurige vos
              in plaats van Phoxy.
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
            De naam wordt na het genereren in DynaPuff op de plaat gezet — dus altijd goed
            gespeld, en aanpassen kost geen nieuwe generatie. Het rugnummer tekent het model
            zelf op het shirt; dat gaat niet altijd foutloos.
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="logo-hoek">Phoxy Club-logo</Label>
              <Select value={logoHoek} onValueChange={(v) => setLogoHoek(v as LogoHoek)}>
                <SelectTrigger id="logo-hoek">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_OPTIES.map((o) => (
                    <SelectItem key={o.waarde} value={o.waarde}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="logo-stijl">Logostijl</Label>
              <Select
                value={logoStijl}
                onValueChange={(v) => setLogoStijl(v as LogoStijl)}
                disabled={logoHoek === "geen"}
              >
                <SelectTrigger id="logo-stijl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LOGO_STIJLEN.map((o) => (
                    <SelectItem key={o.waarde} value={o.waarde}>
                      {o.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Welk logo er op de plaat komt — gedeeld, net als de referenties */}
          <div className="flex items-center gap-3 rounded-md border border-border bg-muted/40 p-3">
            <div className="flex h-14 w-20 shrink-0 items-center justify-center rounded border border-border bg-white p-1">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Het logo dat op de kleurplaat komt" className="max-h-full max-w-full object-contain" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {logo ? logo.naam : "Standaardlogo uit de huisstijl"}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {logo
                  ? "Eigen logo — iedereen krijgt dit op de kleurplaat."
                  : "Nog geen eigen logo geüpload."}
              </p>
              <div className="mt-2 flex flex-wrap gap-3 text-xs">
                <button
                  type="button"
                  onClick={() => logoBestandRef.current?.click()}
                  disabled={logoBezig}
                  className="inline-flex items-center gap-1 text-primary hover:underline disabled:opacity-50"
                >
                  {logoBezig ? <Loader2 className="h-3 w-3 animate-spin" /> : <ImagePlus className="h-3 w-3" />}
                  {logo ? "Vervangen" : "Eigen logo uploaden"}
                </button>
                {logo && (
                  <button
                    type="button"
                    onClick={() => void herstelStandaardLogo()}
                    disabled={logoBezig}
                    className="inline-flex items-center gap-1 text-muted-foreground hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-3 w-3" /> Terug naar het standaardlogo
                  </button>
                )}
              </div>
              {logoFout && <p className="mt-1 text-xs text-destructive">{logoFout}</p>}
            </div>
            <input
              ref={logoBestandRef}
              type="file"
              accept="image/png"
              className="hidden"
              onChange={(e) => {
                if (e.target.files) void vervangLogo(e.target.files);
                e.target.value = "";
              }}
            />
          </div>

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

          {/* Model */}
          <div className="space-y-2">
            <Label htmlFor="model">Model</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger id="model">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>Aanbevolen</SelectLabel>
                  {AANBEVOLEN_MODELLEN.map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
                {gedeeldeModellen.length > 0 && (
                  <SelectGroup>
                    <SelectLabel>Toegevoegd door het team</SelectLabel>
                    {gedeeldeModellen.map((m) => (
                      <SelectItem key={modelSleutel(m)} value={modelSleutel(m)}>
                        {m.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                )}
              </SelectContent>
            </Select>

            <p className="text-xs text-muted-foreground">
              {aanbevolen?.hint ? `${aanbevolen.hint} ` : ""}
              {profiel
                ? profiel.maxReferenties > 0
                  ? `Neemt maximaal ${profiel.maxReferenties} ${
                      profiel.maxReferenties === 1 ? "referentie" : "referenties"
                    } mee.`
                  : "Neemt geen referenties mee."
                : "Eigenschappen worden opgehaald…"}
            </p>

            {profiel?.waarschuwingen.map((w) => (
              <p key={w} className="text-xs text-warning">
                {w}
              </p>
            ))}

            {gedeeldModel && (
              <p className="text-xs text-muted-foreground">
                Toegevoegd door {gedeeldModel.toegevoegdDoor}.{" "}
                <button
                  type="button"
                  onClick={() => void verwijderModel(model)}
                  className="underline hover:text-destructive"
                >
                  Voor iedereen verwijderen
                </button>
              </p>
            )}
          </div>

          {/* Model toevoegen */}
          {!toevoegenOpen ? (
            <button
              type="button"
              onClick={() => setToevoegenOpen(true)}
              className="inline-flex items-center gap-1 text-xs uppercase tracking-wide text-primary hover:underline"
            >
              <Plus className="h-3 w-3" /> Model toevoegen
            </button>
          ) : (
            <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
              <div className="flex items-start justify-between gap-2">
                <Label htmlFor="nieuw-model">Model van Replicate</Label>
                <button
                  type="button"
                  onClick={() => {
                    setToevoegenOpen(false);
                    setControleInfo(null);
                    setControleFout("");
                  }}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Sluiten"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <div className="flex gap-2">
                <Input
                  id="nieuw-model"
                  placeholder="openai/gpt-image-1.5"
                  value={nieuwModel}
                  onChange={(e) => {
                    setNieuwModel(e.target.value);
                    setControleInfo(null);
                    setControleFout("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void controleerModel();
                    }
                  }}
                />
                <Button
                  variant="outline"
                  onClick={() => void controleerModel()}
                  disabled={controleBezig || !nieuwModel.trim()}
                >
                  {controleBezig ? <Loader2 className="animate-spin" /> : "Controleren"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                De identifier of de URL van de modelpagina, bijvoorbeeld{" "}
                <span className="font-mono">openai/gpt-image-1.5</span>. Een vastgezette versie
                mag ook: <span className="font-mono">eigenaar/model:hash</span>. Toegevoegde
                modellen staan voor iedereen in de lijst.
              </p>

              {controleFout && <p className="text-sm text-destructive">{controleFout}</p>}

              {controleInfo && (
                <div className="space-y-2 rounded-md border border-border bg-card p-3">
                  <p className="flex items-center gap-2 text-sm font-medium">
                    <Check className="h-4 w-4 text-success" /> {controleInfo.id}
                    {controleInfo.versie ? ` (versie ${controleInfo.versie.slice(0, 8)})` : ""}
                  </p>
                  {controleInfo.omschrijving && (
                    <p className="text-xs text-muted-foreground">{controleInfo.omschrijving}</p>
                  )}
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    <li>
                      Referenties:{" "}
                      {controleInfo.maxReferenties > 0
                        ? `maximaal ${controleInfo.maxReferenties} (veld ${controleInfo.referentieVeld})`
                        : "worden niet meegenomen"}
                    </li>
                    <li>
                      Formaat:{" "}
                      {controleInfo.verhoudingOpties.length > 0
                        ? controleInfo.verhoudingOpties.join(", ")
                        : "niet instelbaar"}
                    </li>
                  </ul>
                  {controleInfo.waarschuwingen.map((w) => (
                    <p key={w} className="text-xs text-warning">
                      {w}
                    </p>
                  ))}
                  <Button size="sm" onClick={() => void voegModelToe()} disabled={opslaanBezig}>
                    {opslaanBezig ? <Loader2 className="animate-spin" /> : <Plus />} Toevoegen voor
                    iedereen
                  </Button>
                </div>
              )}
            </div>
          )}

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
                  <a
                    href={downloadUrl(resultaat)}
                    download={bestandsnaam(naam.trim() || resultaat.omschrijving)}
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

          {plaatFout && <p className="mt-4 text-sm text-warning">{plaatFout}</p>}

          <div className="mt-4 flex min-h-[320px] items-center justify-center rounded-md border border-border bg-white p-3">
            {resultaat ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={plaat?.url ?? resultaat.url}
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
                  title={`${item.omschrijving} — ${item.model}`}
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
