"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  parseerModelId,
  type BewaardModel,
  type Model,
  type ModelProfielInfo,
} from "@/lib/replicate/model";

/** De sleutel waaronder een model in de lijst staat. */
export function modelSleutel(m: { id: string; versie?: string }): string {
  return m.versie ? `${m.id}:${m.versie}` : m.id;
}

interface ModelKiezerProps {
  /** Bijv. `/api/groepsfoto`: daaronder zitten `/model` en `/modellen`. */
  apiBasis: string;
  aanbevolen: Model[];
  standaard: string;
  /** De sleutel van het gekozen model (`owner/name` of `owner/name:versie`). */
  waarde: string;
  onChange: (sleutel: string) => void;
  /** Meldt of het gekozen model bruikbaar is; `false` zolang het niet gecontroleerd is. */
  onBruikbaar?: (bruikbaar: boolean) => void;
}

/**
 * Dropdown met aanbevolen en door het team toegevoegde Replicate-modellen, plus
 * "Model toevoegen". Wat een model kan, vraagt hij op bij `<apiBasis>/model`;
 * die route bepaalt per tool wat een fout is en wat een waarschuwing.
 */
export function ModelKiezer({
  apiBasis,
  aanbevolen,
  standaard,
  waarde,
  onChange,
  onBruikbaar,
}: ModelKiezerProps) {
  const [gedeeld, setGedeeld] = useState<BewaardModel[]>([]);
  const [profielen, setProfielen] = useState<Record<string, ModelProfielInfo>>({});
  const [profielFouten, setProfielFouten] = useState<Record<string, string>>({});

  const [toevoegenOpen, setToevoegenOpen] = useState(false);
  const [nieuwModel, setNieuwModel] = useState("");
  const [controleBezig, setControleBezig] = useState(false);
  const [controleFout, setControleFout] = useState("");
  const [controleInfo, setControleInfo] = useState<ModelProfielInfo | null>(null);
  const [opslaanBezig, setOpslaanBezig] = useState(false);

  const profiel = profielen[waarde];
  const profielFout = profielFouten[waarde];
  const gedeeldModel = gedeeld.find((m) => modelSleutel(m) === waarde);
  const aanbevolenModel = aanbevolen.find((m) => m.id === waarde);

  useEffect(() => {
    let afgebroken = false;
    (async () => {
      try {
        const res = await fetch(`${apiBasis}/modellen`);
        if (!res.ok) return;
        const body = (await res.json()) as { modellen: BewaardModel[] };
        if (!afgebroken) setGedeeld(body.modellen);
      } catch {
        // zonder gedeelde lijst blijven de aanbevolen modellen gewoon werken
      }
    })();
    return () => {
      afgebroken = true;
    };
  }, [apiBasis]);

  useEffect(() => {
    onBruikbaar?.(Boolean(profiel));
  }, [profiel, onBruikbaar]);

  useEffect(() => {
    if (profielen[waarde] || profielFouten[waarde]) return;
    let afgebroken = false;

    (async () => {
      try {
        const res = await fetch(`${apiBasis}/model?id=${encodeURIComponent(waarde)}`);
        const body = (await res.json()) as ModelProfielInfo & { error?: string };
        if (afgebroken) return;
        if (res.ok) setProfielen((vorige) => ({ ...vorige, [waarde]: body }));
        else setProfielFouten((vorige) => ({ ...vorige, [waarde]: body.error ?? "Dit model is niet bruikbaar." }));
      } catch {
        if (!afgebroken) {
          setProfielFouten((vorige) => ({ ...vorige, [waarde]: "Het model kon niet worden opgevraagd." }));
        }
      }
    })();

    return () => {
      afgebroken = true;
    };
  }, [apiBasis, waarde, profielen, profielFouten]);

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
      const res = await fetch(`${apiBasis}/model?id=${encodeURIComponent(modelSleutel(gekozen))}`);
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
      const res = await fetch(`${apiBasis}/modellen`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: controleInfo.id, versie: controleInfo.versie }),
      });
      const body = (await res.json()) as { model?: BewaardModel; error?: string };
      if (!res.ok || !body.model) throw new Error(body.error || "Model opslaan mislukt.");

      const toegevoegd = body.model;
      const sleutel = modelSleutel(toegevoegd);
      setGedeeld((vorige) => [...vorige.filter((m) => modelSleutel(m) !== sleutel), toegevoegd]);
      setProfielen((vorige) => ({ ...vorige, [sleutel]: controleInfo }));
      onChange(sleutel);

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
    const res = await fetch(`${apiBasis}/modellen?id=${encodeURIComponent(sleutel)}`, {
      method: "DELETE",
    });
    if (!res.ok) return;
    setGedeeld((vorige) => vorige.filter((m) => modelSleutel(m) !== sleutel));
    if (waarde === sleutel) onChange(standaard);
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="model">Model</Label>
        <Select value={waarde} onValueChange={onChange}>
          <SelectTrigger id="model">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              <SelectLabel>Aanbevolen</SelectLabel>
              {aanbevolen.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectGroup>
            {gedeeld.length > 0 && (
              <SelectGroup>
                <SelectLabel>Toegevoegd door het team</SelectLabel>
                {gedeeld.map((m) => (
                  <SelectItem key={modelSleutel(m)} value={modelSleutel(m)}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            )}
          </SelectContent>
        </Select>

        {aanbevolenModel?.hint && (
          <p className="text-xs text-muted-foreground">{aanbevolenModel.hint}</p>
        )}
        {!profiel && !profielFout && (
          <p className="text-xs text-muted-foreground">Eigenschappen worden opgehaald…</p>
        )}
        {profielFout && <p className="text-xs text-destructive">{profielFout}</p>}
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
              onClick={() => void verwijderModel(waarde)}
              className="underline hover:text-destructive"
            >
              Voor iedereen verwijderen
            </button>
          </p>
        )}
      </div>

      {!toevoegenOpen ? (
        <button
          type="button"
          onClick={() => setToevoegenOpen(true)}
          className="inline-flex items-center gap-1 font-heading text-xs uppercase tracking-wide text-primary hover:underline"
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
              placeholder="google/nano-banana"
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
            De identifier of de URL van de modelpagina. Een vastgezette versie mag ook:{" "}
            <span className="font-mono">eigenaar/model:hash</span>. Toegevoegde modellen staan
            voor iedereen in de lijst.
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
                  Beelden: maximaal {controleInfo.maxReferenties} (veld {controleInfo.referentieVeld})
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
    </div>
  );
}
