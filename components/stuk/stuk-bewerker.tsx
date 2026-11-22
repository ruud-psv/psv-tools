"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, Loader2, Paintbrush, Pencil, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { RapportBlok, formatDag } from "@/components/stuk/stuk-weergave";
import { cn } from "@/lib/utils";
import {
  LIMIETEN,
  STUK_SOORT_LABEL,
  nadrukKeuzes,
  type Achtergrond,
  type Blok,
  type BlokInhoud,
  type BlokType,
  type Grootte,
  type Stuk,
  type StukSoort,
} from "@/lib/stukken/model";
import { NIEUW_BLOK_LABEL, leesGetal, nieuwBlok, toonGetal } from "@/lib/stukken/bewerken";

/**
 * Het stuk bewerken in het voorbeeld zelf: klik op een blok om het aan te
 * passen, verplaats of verwijder het, of voeg er een toe. Elke wijziging gaat
 * via PATCH naar de server, die dezelfde regels gebruikt als bij de assistent,
 * en wordt een nieuwe versie.
 */

const SELECT = "h-9 rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
const VELD_LABEL = "font-heading text-[11px] uppercase tracking-wide text-muted-foreground";

type Bewerking = { acties?: unknown[]; titel?: string; ondertitel?: string; soort?: StukSoort };

/** De inhoud zonder id en opmaak: de opmaak blijft bij "wijzigen" staan en verander je met "opmaken". */
function zonderId(blok: Blok): BlokInhoud {
  const { id, opmaak, ...inhoud } = blok;
  void id;
  void opmaak;
  return inhoud as BlokInhoud;
}

const GROOTTE_LABEL: Record<Grootte, string> = { half: "Half (naast elkaar)", heel: "Heel", groot: "Groot" };
const ACHTERGROND_LABEL: Record<Achtergrond, string> = { wit: "Wit", grijs: "Grijs", rood: "Rood", zwart: "Zwart" };

/** De vorm van een blok: grootte, achtergrond, nadruk en kernboodschap. */
function OpmaakEditor({
  blok,
  soort,
  bezig,
  onOpslaan,
  onAnnuleer,
}: {
  blok: Blok;
  soort: StukSoort;
  bezig: boolean;
  onOpslaan: (opmaak: Record<string, string | null>) => void;
  onAnnuleer: () => void;
}) {
  const [grootte, setGrootte] = useState(blok.opmaak?.grootte ?? "");
  const [achtergrond, setAchtergrond] = useState(blok.opmaak?.achtergrond ?? "");
  const [nadruk, setNadruk] = useState(blok.opmaak?.nadruk ?? "");
  const [kernboodschap, setKernboodschap] = useState(blok.opmaak?.kernboodschap ?? "");
  const keuzes = nadrukKeuzes(blok);
  const deck = soort === "deck";
  return (
    <div className="space-y-3 rounded-md border border-psv-red-primary bg-card p-3">
      <p className={VELD_LABEL}>Opmaak van dit blok</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className={VELD_LABEL}>Grootte</span>
          <select value={grootte} onChange={(e) => setGrootte(e.target.value as Grootte)} className={cn(SELECT, "w-full")}>
            <option value="">Standaard</option>
            {(Object.keys(GROOTTE_LABEL) as Grootte[]).map((g) => (
              <option key={g} value={g}>
                {GROOTTE_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1">
          <span className={VELD_LABEL}>{deck ? "Achtergrond van de slide" : "Achtergrond"}</span>
          <select value={achtergrond} onChange={(e) => setAchtergrond(e.target.value as Achtergrond)} className={cn(SELECT, "w-full")}>
            <option value="">Standaard</option>
            {(Object.keys(ACHTERGROND_LABEL) as Achtergrond[]).map((a) => (
              <option key={a} value={a}>
                {ACHTERGROND_LABEL[a]}
              </option>
            ))}
          </select>
        </label>
        {keuzes.length > 0 && (
          <label className="block space-y-1 sm:col-span-2">
            <span className={VELD_LABEL}>Uitlichten</span>
            <select value={nadruk} onChange={(e) => setNadruk(e.target.value)} className={cn(SELECT, "w-full")}>
              <option value="">Niets</option>
              {keuzes.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
        )}
        {blok.type !== "kop" && (
          <label className="block space-y-1 sm:col-span-2">
            <span className={VELD_LABEL}>{deck ? "Kernboodschap (titel van de slide)" : "Kernboodschap (kop boven het blok)"}</span>
            <Input
              value={kernboodschap}
              maxLength={LIMIETEN.kernboodschap}
              placeholder="Bijvoorbeeld: Nog 312 stoelen te koop"
              onChange={(e) => setKernboodschap(e.target.value)}
            />
          </label>
        )}
      </div>
      {deck && grootte === "half" && <p className="form-hint">Twee halve blokken na elkaar komen samen op één slide.</p>}
      <Opslaan
        bezig={bezig}
        onAnnuleer={onAnnuleer}
        onOpslaan={() => onOpslaan({ grootte: grootte || null, achtergrond: achtergrond || null, nadruk: nadruk || null, kernboodschap: kernboodschap.trim() || null })}
      />
    </div>
  );
}

function IconKnop({ label, onClick, disabled, children }: { label: string; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function Opslaan({ bezig, onOpslaan, onAnnuleer, fout }: { bezig: boolean; onOpslaan: () => void; onAnnuleer: () => void; fout?: string | null }) {
  return (
    <div className="space-y-2 pt-1">
      {fout && <p className="form-error">{fout}</p>}
      <div className="flex gap-2">
        <Button type="button" size="sm" onClick={onOpslaan} disabled={bezig}>
          {bezig && <Loader2 className="animate-spin" />}
          Opslaan
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onAnnuleer} disabled={bezig}>
          Annuleren
        </Button>
      </div>
    </div>
  );
}

function BronVeld({ waarde, onChange }: { waarde: string; onChange: (v: string) => void }) {
  return (
    <label className="block space-y-1">
      <span className={VELD_LABEL}>Bron en periode</span>
      <Input value={waarde} onChange={(e) => onChange(e.target.value)} placeholder="Bijvoorbeeld: Google Analytics psv.nl, oktober 2026" />
    </label>
  );
}

/** De invulvorm voor één blok, in plaats van het blok zelf. */
function BlokEditor({
  blok,
  bezig,
  onOpslaan,
  onAnnuleer,
}: {
  blok: Blok;
  bezig: boolean;
  onOpslaan: (inhoud: BlokInhoud) => void;
  onAnnuleer: () => void;
}) {
  const [concept, setConcept] = useState<BlokInhoud>(zonderId(blok));
  // Grafiekwaarden als tekst, zodat je "1.400" of "12,5" kunt typen.
  const [waarden, setWaarden] = useState<string[][]>(blok.type === "grafiek" ? blok.reeksen.map((r) => r.waarden.map(toonGetal)) : []);
  const [fout, setFout] = useState<string | null>(null);
  const zet = (wijziging: Partial<BlokInhoud>) => setConcept((c) => ({ ...c, ...wijziging }) as BlokInhoud);

  function opslaan() {
    setFout(null);
    if (concept.type !== "grafiek") return onOpslaan(concept);
    const reeksen = concept.reeksen.map((r, i) => ({ ...r, waarden: (waarden[i] ?? []).map((w) => leesGetal(w)) }));
    for (const [i, r] of reeksen.entries()) {
      const j = r.waarden.findIndex((w) => w === null);
      if (j !== -1) return setFout(`"${r.naam || `Reeks ${i + 1}`}" bij "${concept.labels[j]}" is geen getal.`);
    }
    onOpslaan({ ...concept, reeksen: reeksen.map((r) => ({ naam: r.naam, waarden: r.waarden as number[] })) });
  }

  let velden: ReactNode;
  switch (concept.type) {
    case "kop":
      velden = <Input autoFocus value={concept.tekst} onChange={(e) => zet({ tekst: e.target.value })} className="font-heading uppercase" aria-label="Kop" />;
      break;
    case "tekst":
      velden = (
        <>
          <Textarea autoFocus value={concept.tekst} onChange={(e) => zet({ tekst: e.target.value })} rows={Math.min(14, Math.max(4, concept.tekst.split("\n").length + 1))} aria-label="Tekst" />
          <p className="form-hint">**vet** wordt vet, een regel die met &quot;- &quot; begint een opsomming.</p>
        </>
      );
      break;
    case "kerngetallen":
      velden = (
        <>
          {concept.items.map((item, i) => (
            <div key={i} className="grid grid-cols-[1fr_8rem_auto] gap-2 sm:grid-cols-[1fr_8rem_1fr_auto]">
              <Input value={item.label} placeholder="Label" aria-label={`Label ${i + 1}`} onChange={(e) => zet({ items: concept.items.map((k, j) => (j === i ? { ...k, label: e.target.value } : k)) })} />
              <Input value={item.waarde} placeholder="Waarde" aria-label={`Waarde ${i + 1}`} className="font-heading" onChange={(e) => zet({ items: concept.items.map((k, j) => (j === i ? { ...k, waarde: e.target.value } : k)) })} />
              <Input value={item.toelichting ?? ""} placeholder="Toelichting" aria-label={`Toelichting ${i + 1}`} className="col-span-2 sm:col-span-1" onChange={(e) => zet({ items: concept.items.map((k, j) => (j === i ? { ...k, toelichting: e.target.value } : k)) })} />
              <IconKnop label={`Kerngetal ${i + 1} weghalen`} disabled={concept.items.length === 1} onClick={() => zet({ items: concept.items.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </IconKnop>
            </div>
          ))}
          {concept.items.length < LIMIETEN.kerngetallen && (
            <Button type="button" size="sm" variant="ghost" onClick={() => zet({ items: [...concept.items, { label: "", waarde: "" }] })}>
              <Plus /> Kerngetal
            </Button>
          )}
          <BronVeld waarde={concept.bron} onChange={(bron) => zet({ bron })} />
        </>
      );
      break;
    case "conclusie":
      velden = (
        <>
          {concept.punten.map((punt, i) => (
            <div key={i} className="flex gap-2">
              <Textarea value={punt} rows={2} aria-label={`Punt ${i + 1}`} onChange={(e) => zet({ punten: concept.punten.map((p, j) => (j === i ? e.target.value : p)) })} />
              <IconKnop label={`Punt ${i + 1} weghalen`} disabled={concept.punten.length === 1} onClick={() => zet({ punten: concept.punten.filter((_, j) => j !== i) })}>
                <X className="h-4 w-4" />
              </IconKnop>
            </div>
          ))}
          {concept.punten.length < LIMIETEN.punten && (
            <Button type="button" size="sm" variant="ghost" onClick={() => zet({ punten: [...concept.punten, ""] })}>
              <Plus /> Punt
            </Button>
          )}
        </>
      );
      break;
    case "tabel": {
      const t = concept;
      velden = (
        <>
          <Input value={t.titel ?? ""} placeholder="Titel (optioneel)" aria-label="Titel van de tabel" onChange={(e) => zet({ titel: e.target.value })} />
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  {t.kolommen.map((k, c) => (
                    <th key={c} className="min-w-[7rem] align-top">
                      <div className="flex gap-1">
                        <Input value={k} aria-label={`Kolom ${c + 1}`} className="font-heading text-xs uppercase" onChange={(e) => zet({ kolommen: t.kolommen.map((x, j) => (j === c ? e.target.value : x)) })} />
                        <IconKnop
                          label={`Kolom ${c + 1} weghalen`}
                          disabled={t.kolommen.length === 1}
                          onClick={() => zet({ kolommen: t.kolommen.filter((_, j) => j !== c), rijen: t.rijen.map((r) => r.filter((_, j) => j !== c)) })}
                        >
                          <X className="h-3.5 w-3.5" />
                        </IconKnop>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.rijen.map((rij, r) => (
                  <tr key={r}>
                    {rij.map((cel, c) => (
                      <td key={c}>
                        <Input value={cel} aria-label={`Rij ${r + 1}, kolom ${c + 1}`} onChange={(e) => zet({ rijen: t.rijen.map((x, i) => (i === r ? x.map((y, j) => (j === c ? e.target.value : y)) : x)) })} />
                      </td>
                    ))}
                    <td>
                      <IconKnop label={`Rij ${r + 1} weghalen`} disabled={t.rijen.length === 1} onClick={() => zet({ rijen: t.rijen.filter((_, i) => i !== r) })}>
                        <X className="h-4 w-4" />
                      </IconKnop>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            {t.rijen.length < LIMIETEN.rijen && (
              <Button type="button" size="sm" variant="ghost" onClick={() => zet({ rijen: [...t.rijen, t.kolommen.map(() => "")] })}>
                <Plus /> Rij
              </Button>
            )}
            {t.kolommen.length < LIMIETEN.kolommen && (
              <Button type="button" size="sm" variant="ghost" onClick={() => zet({ kolommen: [...t.kolommen, `Kolom ${t.kolommen.length + 1}`], rijen: t.rijen.map((r) => [...r, ""]) })}>
                <Plus /> Kolom
              </Button>
            )}
          </div>
          <BronVeld waarde={t.bron} onChange={(bron) => zet({ bron })} />
        </>
      );
      break;
    }
    case "grafiek": {
      const g = concept;
      velden = (
        <>
          <div className="grid gap-2 sm:grid-cols-[1fr_8rem_8rem]">
            <Input value={g.titel} aria-label="Titel van de grafiek" onChange={(e) => zet({ titel: e.target.value })} />
            <select value={g.soort} aria-label="Soort grafiek" className={SELECT} onChange={(e) => zet({ soort: e.target.value === "lijn" ? "lijn" : "staaf" })}>
              <option value="staaf">Staven</option>
              <option value="lijn">Lijn</option>
            </select>
            <Input value={g.eenheid ?? ""} placeholder="Eenheid" aria-label="Eenheid" onChange={(e) => zet({ eenheid: e.target.value })} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-separate border-spacing-1 text-sm">
              <thead>
                <tr>
                  <th className={cn(VELD_LABEL, "text-left")}>Label</th>
                  {g.reeksen.map((r, i) => (
                    <th key={i} className="min-w-[7rem]">
                      <div className="flex gap-1">
                        <Input value={r.naam} aria-label={`Naam reeks ${i + 1}`} className="text-xs" onChange={(e) => zet({ reeksen: g.reeksen.map((x, j) => (j === i ? { ...x, naam: e.target.value } : x)) })} />
                        <IconKnop
                          label={`Reeks ${i + 1} weghalen`}
                          disabled={g.reeksen.length === 1}
                          onClick={() => {
                            zet({ reeksen: g.reeksen.filter((_, j) => j !== i) });
                            setWaarden((w) => w.filter((_, j) => j !== i));
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </IconKnop>
                      </div>
                    </th>
                  ))}
                  <th />
                </tr>
              </thead>
              <tbody>
                {g.labels.map((label, r) => (
                  <tr key={r}>
                    <td className="min-w-[6rem]">
                      <Input value={label} aria-label={`Label ${r + 1}`} onChange={(e) => zet({ labels: g.labels.map((x, j) => (j === r ? e.target.value : x)) })} />
                    </td>
                    {g.reeksen.map((reeks, i) => (
                      <td key={i}>
                        <Input
                          value={waarden[i]?.[r] ?? ""}
                          inputMode="decimal"
                          aria-label={`${reeks.naam || `Reeks ${i + 1}`} bij ${label}`}
                          className="tabular-nums"
                          onChange={(e) => setWaarden((w) => w.map((rij, j) => (j === i ? rij.map((v, k) => (k === r ? e.target.value : v)) : rij)))}
                        />
                      </td>
                    ))}
                    <td>
                      <IconKnop
                        label={`Rij ${label} weghalen`}
                        disabled={g.labels.length === 1}
                        onClick={() => {
                          zet({ labels: g.labels.filter((_, j) => j !== r), reeksen: g.reeksen.map((x) => ({ ...x, waarden: x.waarden.filter((_, j) => j !== r) })) });
                          setWaarden((w) => w.map((rij) => rij.filter((_, j) => j !== r)));
                        }}
                      >
                        <X className="h-4 w-4" />
                      </IconKnop>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex gap-2">
            {g.labels.length < LIMIETEN.labels && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  zet({ labels: [...g.labels, ""], reeksen: g.reeksen.map((x) => ({ ...x, waarden: [...x.waarden, 0] })) });
                  setWaarden((w) => w.map((rij) => [...rij, ""]));
                }}
              >
                <Plus /> Rij
              </Button>
            )}
            {g.reeksen.length < LIMIETEN.reeksen && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={() => {
                  zet({ reeksen: [...g.reeksen, { naam: `Reeks ${g.reeksen.length + 1}`, waarden: g.labels.map(() => 0) }] });
                  setWaarden((w) => [...w, g.labels.map(() => "")]);
                }}
              >
                <Plus /> Reeks
              </Button>
            )}
          </div>
          <BronVeld waarde={g.bron} onChange={(bron) => zet({ bron })} />
        </>
      );
      break;
    }
  }

  return (
    <div className="space-y-2 rounded-md border border-psv-red-primary bg-card p-3">
      <p className={VELD_LABEL}>{NIEUW_BLOK_LABEL[blok.type]} bewerken</p>
      {velden}
      <Opslaan bezig={bezig} onOpslaan={opslaan} onAnnuleer={onAnnuleer} fout={fout} />
    </div>
  );
}

/** Een dunne lijn met "Blok toevoegen" en de keuze van het soort blok. */
function Toevoegen({ uit, onKies }: { uit: boolean; onKies: (type: BlokType) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="group/toevoegen flex min-h-6 items-center gap-2 py-1">
      {open ? (
        <div className="flex flex-wrap items-center gap-1.5">
          {(Object.keys(NIEUW_BLOK_LABEL) as BlokType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => {
                setOpen(false);
                onKies(type);
              }}
              className="rounded-md border border-border bg-card px-2 py-1 font-heading text-[11px] uppercase tracking-wide transition-colors hover:border-psv-red-primary"
            >
              {NIEUW_BLOK_LABEL[type]}
            </button>
          ))}
          <IconKnop label="Annuleren" onClick={() => setOpen(false)}>
            <X className="h-4 w-4" />
          </IconKnop>
        </div>
      ) : (
        <>
          <span className="h-px flex-1 bg-border" />
          <button
            type="button"
            disabled={uit}
            onClick={() => setOpen(true)}
            className="flex items-center gap-1 rounded-md px-2 py-0.5 font-heading text-[11px] uppercase tracking-wide text-muted-foreground transition-colors hover:text-psv-red-primary disabled:opacity-40"
          >
            <Plus className="h-3.5 w-3.5" />
            Blok toevoegen
          </button>
          <span className="h-px flex-1 bg-border" />
        </>
      )}
    </div>
  );
}

export function StukBewerker({ stuk, onStuk }: { stuk: Stuk; onStuk: (stuk: Stuk) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  /** Open de opmaak van dit blok in plaats van de inhoud. */
  const [opmaakOpen, setOpmaakOpen] = useState<string | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [titel, setTitel] = useState(stuk.titel);
  const [ondertitel, setOndertitel] = useState(stuk.ondertitel ?? "");

  // Een nieuwe versie van buiten (de assistent, of terug): de velden bijwerken.
  useEffect(() => {
    setTitel(stuk.titel);
    setOndertitel(stuk.ondertitel ?? "");
  }, [stuk.titel, stuk.ondertitel]);

  async function bewaar(bewerking: Bewerking): Promise<Stuk | null> {
    setFout(null);
    setBezig(true);
    try {
      const res = await fetch(`/api/assistent/stukken/${stuk.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ basisVersie: stuk.versie, ...bewerking }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.stuk) {
        onStuk(data.stuk);
        setOpen(null);
        setOpmaakOpen(null);
        setFout(data.error);
        return null;
      }
      if (!res.ok) {
        setFout(data.error ?? "Opslaan is mislukt.");
        return null;
      }
      onStuk(data.stuk);
      return data.stuk as Stuk;
    } catch {
      setFout("Opslaan is mislukt. Probeer het opnieuw.");
      return null;
    } finally {
      setBezig(false);
    }
  }

  async function voegToe(type: BlokType, na: string) {
    const bestaand = new Set(stuk.blokken.map((b) => b.id));
    const nieuw = await bewaar({ acties: [{ actie: "toevoegen", blok: nieuwBlok(type), na }] });
    const toegevoegd = nieuw?.blokken.find((b) => !bestaand.has(b.id));
    if (toegevoegd) setOpen(toegevoegd.id);
  }

  function verplaats(index: number, richting: -1 | 1) {
    const blokken = stuk.blokken;
    const na = richting === -1 ? (index >= 2 ? blokken[index - 2].id : "begin") : blokken[index + 1].id;
    bewaar({ acties: [{ actie: "verplaatsen", blok_id: blokken[index].id, na }] });
  }

  function verwijder(blok: Blok) {
    if (!confirm(`Dit blok (${NIEUW_BLOK_LABEL[blok.type].toLowerCase()}) verwijderen? Met Vorige zet je het terug.`)) return;
    bewaar({ acties: [{ actie: "verwijderen", blok_id: blok.id }] }).then(() => setOpen((o) => (o === blok.id ? null : o)));
  }

  const druk = bezig || open !== null || opmaakOpen !== null;

  return (
    <article className="mx-auto w-full max-w-3xl">
      <header className="space-y-2 border-t-8 border-psv-red-primary pb-4 pt-5">
        <div className="flex items-center gap-2">
          <span className="font-heading text-xs uppercase tracking-wider text-muted-foreground">PSV ·</span>
          <select
            value={stuk.soort}
            aria-label="Soort stuk"
            disabled={bezig}
            className={cn(SELECT, "h-7 font-heading text-xs uppercase")}
            onChange={(e) => bewaar({ soort: e.target.value as StukSoort })}
          >
            {(Object.keys(STUK_SOORT_LABEL) as StukSoort[]).map((s) => (
              <option key={s} value={s}>
                {STUK_SOORT_LABEL[s]}
              </option>
            ))}
          </select>
          {bezig && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        <Input
          value={titel}
          aria-label="Titel"
          className="h-auto py-1.5 font-heading text-2xl uppercase"
          onChange={(e) => setTitel(e.target.value)}
          onBlur={() => titel.trim() !== stuk.titel && bewaar({ titel })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <Input
          value={ondertitel}
          aria-label="Ondertitel"
          placeholder="Ondertitel (optioneel)"
          onChange={(e) => setOndertitel(e.target.value)}
          onBlur={() => ondertitel.trim() !== (stuk.ondertitel ?? "") && bewaar({ ondertitel })}
          onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        />
        <p className="text-xs text-muted-foreground">Peildatum {formatDag(stuk.peildatum)}</p>
      </header>

      {fout && <div className="alert alert--error mb-3 text-sm">{fout}</div>}

      <Toevoegen uit={druk} onKies={(type) => voegToe(type, "begin")} />
      {stuk.blokken.map((blok, i) => (
        <div key={blok.id}>
          {opmaakOpen === blok.id ? (
            <OpmaakEditor
              blok={blok}
              soort={stuk.soort}
              bezig={bezig}
              onAnnuleer={() => setOpmaakOpen(null)}
              onOpslaan={(opmaak) => bewaar({ acties: [{ actie: "opmaken", blok_id: blok.id, opmaak }] }).then((nieuw) => nieuw && setOpmaakOpen(null))}
            />
          ) : open === blok.id ? (
            <BlokEditor
              blok={blok}
              bezig={bezig}
              onAnnuleer={() => setOpen(null)}
              onOpslaan={(inhoud) => bewaar({ acties: [{ actie: "wijzigen", blok_id: blok.id, blok: inhoud }] }).then((nieuw) => nieuw && setOpen(null))}
            />
          ) : (
            <div className="group relative rounded-md border border-transparent p-2 transition-colors hover:border-border">
              <div className="absolute right-1 top-1 z-10 flex gap-0.5 rounded-md bg-card/90 opacity-0 shadow-sm transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                <IconKnop label="Omhoog" disabled={druk || i === 0} onClick={() => verplaats(i, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </IconKnop>
                <IconKnop label="Omlaag" disabled={druk || i === stuk.blokken.length - 1} onClick={() => verplaats(i, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </IconKnop>
                <IconKnop label="Opmaak" disabled={druk} onClick={() => setOpmaakOpen(blok.id)}>
                  <Paintbrush className="h-4 w-4" />
                </IconKnop>
                <IconKnop label="Bewerken" disabled={druk} onClick={() => setOpen(blok.id)}>
                  <Pencil className="h-4 w-4" />
                </IconKnop>
                <IconKnop label="Verwijderen" disabled={druk || stuk.blokken.length === 1} onClick={() => verwijder(blok)}>
                  <Trash2 className="h-4 w-4" />
                </IconKnop>
              </div>
              <div
                role="button"
                tabIndex={0}
                aria-label={`${NIEUW_BLOK_LABEL[blok.type]} bewerken`}
                onClick={() => !druk && setOpen(blok.id)}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !druk && (e.preventDefault(), setOpen(blok.id))}
                className={cn("rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring", !druk && "cursor-text")}
              >
                <RapportBlok blok={blok} />
              </div>
            </div>
          )}
          <Toevoegen uit={druk} onKies={(type) => voegToe(type, blok.id)} />
        </div>
      ))}
      <p className="mt-4 text-xs text-muted-foreground">
        Klik op een blok om het aan te passen, of op het penseel voor de vorm: grootte, achtergrond, wat eruit springt en de
        kernboodschap. Elke wijziging wordt een nieuwe versie; met Vorige ga je terug. Cijfers die je zelf
        aanpast, worden niet tegen de bron gecontroleerd.
      </p>
    </article>
  );
}
