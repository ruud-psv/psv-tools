"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, Download, ExternalLink, FileUp, Loader2 } from "lucide-react";

import { generateEmailHTML, makeInitialState, newBlock, type MailBuilderState } from "@/components/mail-builder-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { MailOpzet, Punt } from "@/lib/asana/brief";
import { MAX_NAAM, NAAM_ADVIES, conceptNaam } from "@/lib/maileon/concept-naam";
import { mailProblemen } from "@/lib/mail-builder/validate";

/**
 * Testpagina: een mail als concept in Maileon zetten en de voorbeeldlink
 * delen. De mail komt uit een taak in het Asana-testproject (de content brief
 * wordt omgezet met de generator van de Mail Builder), of uit een Download van
 * de Mail Builder. Bij een Asana-taak zet de server daarna een reactie met de
 * link op de taak. Server: `app/api/marnix/*`.
 */

/** De staat die de Mail Builder achter de HTML zet bij Download. */
const STAAT = /\s*<!--\s*mailbuilder-state:([\s\S]*?)\s*-->\s*$/;

interface Bestand {
  naam: string;
  html: string;
  kb: number;
  template?: string;
  /** Gezet als de mail uit een Asana-taak komt. */
  asanaTaakId?: string;
}

interface Uitkomst {
  mailingId: number;
  naam: string;
  nieuw: boolean;
  vervangen: boolean;
  voorbeeldUrl: string;
  voorbeeldBron: "maileon" | "export";
  bijgewerkt: string;
  asana?: { reactie: boolean; sectie?: string; fout?: string };
}

interface Bestaand {
  mailingId: number;
  naam: string;
  bijgewerkt: string;
  voorbeeldUrl: string;
}

interface Fout {
  melding: string;
  code?: string;
}

interface TaakKort {
  gid: string;
  naam: string;
  sectie?: string;
}

interface AsanaBrief {
  taak: { gid: string; naam: string; url?: string; sectie?: string };
  punten: Punt[];
}

function tijdstip(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

const SELECT_KLASSEN =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50";

function PuntenLijst({ punten }: { punten: Punt[] }) {
  const nodig = punten.filter((p) => p.soort === "nodig");
  const letOp = punten.filter((p) => p.soort === "let-op");
  return (
    <>
      {nodig.length > 0 && (
        <div className="alert alert--error mb-0">
          <p className="font-bold">Nog nodig</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {nodig.map((p) => (
              <li key={p.tekst}>{p.tekst}</li>
            ))}
          </ul>
        </div>
      )}
      {letOp.length > 0 && (
        <div className="alert alert--warning mb-0">
          <p className="font-bold">Let op</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {letOp.map((p) => (
              <li key={p.tekst}>{p.tekst}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}

export function MaileonConcept() {
  const [bestand, setBestand] = useState<Bestand | null>(null);
  const [bestandMelding, setBestandMelding] = useState<{ tekst: string; soort: "error" | "warning" } | null>(null);
  const [naam, setNaam] = useState("");
  const [dmid, setDmid] = useState("");
  const [onderwerp, setOnderwerp] = useState("");
  const [previewTekst, setPreviewTekst] = useState("");
  const [bestaand, setBestaand] = useState<Bestaand | null>(null);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<Fout | null>(null);
  const [uitkomst, setUitkomst] = useState<Uitkomst | null>(null);
  const [gekopieerd, setGekopieerd] = useState(false);
  const invoerRef = useRef<HTMLInputElement>(null);

  // Asana
  const [taken, setTaken] = useState<TaakKort[] | null>(null);
  const [takenFout, setTakenFout] = useState<string | null>(null);
  const [gekozen, setGekozen] = useState("");
  const [briefBezig, setBriefBezig] = useState(false);
  const [brief, setBrief] = useState<AsanaBrief | null>(null);
  const [briefFout, setBriefFout] = useState<string | null>(null);
  const [builderState, setBuilderState] = useState<MailBuilderState | null>(null);
  const [voorbeeld, setVoorbeeld] = useState("");

  const maileonNaam = conceptNaam(naam, dmid);
  const naamTeLang = maileonNaam.length > MAX_NAAM;
  const naamLang = maileonNaam.length > NAAM_ADVIES;

  // De open taken in het Asana-testproject.
  useEffect(() => {
    let actief = true;
    fetch("/api/marnix/asana")
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!actief) return;
        if (!res.ok) {
          setTakenFout(data.error ?? `Asana gaf een fout (${res.status}).`);
          setTaken([]);
          return;
        }
        setTaken((data.taken as TaakKort[] | undefined) ?? []);
      })
      .catch(() => {
        if (!actief) return;
        setTakenFout("Asana is niet bereikbaar.");
        setTaken([]);
      });
    return () => {
      actief = false;
    };
  }, []);

  // Staat er al een concept voor deze mail? Dan werkt opnieuw zetten dat concept bij.
  useEffect(() => {
    if (!dmid.trim() && maileonNaam.length < 3) {
      setBestaand(null);
      return;
    }
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ dmid: dmid.trim(), naam });
        const res = await fetch(`/api/marnix/maileon-concept?${params}`, { signal: controller.signal });
        const data = await res.json().catch(() => ({}));
        setBestaand(res.ok ? ((data.concept as Bestaand | null) ?? null) : null);
      } catch {
        // Afgebroken of geen verbinding: dan tonen we niets.
      }
    }, 400);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [dmid, naam, maileonNaam.length, uitkomst]);

  function wisUitkomst() {
    setUitkomst(null);
    setFout(null);
    setBestandMelding(null);
  }

  async function haalBrief() {
    if (!gekozen) return;
    wisUitkomst();
    setBriefBezig(true);
    setBriefFout(null);
    setBrief(null);
    try {
      const res = await fetch(`/api/marnix/asana/${gekozen}`);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setBriefFout(data.error ?? `Er ging iets mis (${res.status}).`);
        return;
      }
      const taak = data.taak as AsanaBrief["taak"];
      const u = data.uitkomst as { opzet: MailOpzet | null; onderwerp: string; punten: Punt[] };
      setOnderwerp(u.onderwerp);
      if (!u.opzet) {
        setBrief({ taak, punten: u.punten });
        setBestand(null);
        setBuilderState(null);
        setVoorbeeld("");
        return;
      }
      const opzet = u.opzet;
      const state: MailBuilderState = {
        ...makeInitialState(opzet.template),
        ...opzet,
        blocks: opzet.blocks.map((b) => newBlock(b)),
      };
      // Wat de Mail Builder zelf zou weigeren bij Download, hoort er ook bij.
      const builder = mailProblemen(state).map((tekst): Punt => ({ soort: "nodig", tekst: `Mail Builder: ${tekst}` }));
      setBrief({ taak, punten: [...u.punten, ...builder] });
      const html = generateEmailHTML(state, true);
      setBuilderState(state);
      setBestand({ naam: taak.naam, html, kb: Math.round(html.length / 1024), template: state.template, asanaTaakId: taak.gid });
      setVoorbeeld(generateEmailHTML(state, false));
      setNaam(opzet.mailNaam);
      setDmid(opzet.dmid ?? "");
      setPreviewTekst(opzet.preheaderTekst);
    } catch {
      setBriefFout("PSV Tools is niet bereikbaar.");
    } finally {
      setBriefBezig(false);
    }
  }

  /** Dezelfde mail als Download voor de Mail Builder, om hem daar met de hand bij te werken. */
  function downloadVoorBuilder() {
    if (!builderState) return;
    const html = generateEmailHTML(builderState, true);
    const staat = JSON.stringify(builderState).replace(/-->/g, "--\\u003E");
    const blob = new Blob([`${html}\n<!-- mailbuilder-state:${staat} -->`], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `psv-mail-${builderState.template}-${builderState.dmid || "asana"}.html`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function kiesBestand(file: File) {
    wisUitkomst();
    setBrief(null);
    setBuilderState(null);
    setVoorbeeld("");
    const reader = new FileReader();
    reader.onload = () => {
      const tekst = typeof reader.result === "string" ? reader.result : "";
      if (!/<html[\s>]/i.test(tekst)) {
        setBestand(null);
        setBestandMelding({ soort: "error", tekst: "Dit bestand lijkt geen HTML van een mail. Gebruik de Download uit de Mail Builder." });
        return;
      }
      const match = tekst.match(STAAT);
      let staat: Record<string, unknown> = {};
      if (match) {
        try {
          staat = JSON.parse(match[1]) as Record<string, unknown>;
        } catch {
          // Geen bruikbare staat: de velden vult de collega dan zelf in.
        }
      }
      const veld = (sleutel: string): string | undefined =>
        typeof staat[sleutel] === "string" ? (staat[sleutel] as string) : undefined;
      setBestand({ naam: file.name, html: tekst.replace(STAAT, ""), kb: Math.round(file.size / 1024), template: veld("template") });
      const mailNaam = veld("mailNaam");
      const staatDmid = veld("dmid");
      const preheader = veld("preheaderTekst");
      if (mailNaam !== undefined) setNaam(mailNaam);
      if (staatDmid !== undefined) setDmid(staatDmid);
      if (preheader !== undefined) setPreviewTekst(preheader);
      if (!match) {
        setBestandMelding({ soort: "warning", tekst: "Er zit geen opgeslagen staat van de Mail Builder in dit bestand. Vul de velden hieronder zelf in." });
      }
    };
    reader.onerror = () => setBestandMelding({ soort: "error", tekst: "Het bestand kon niet worden gelezen." });
    reader.readAsText(file, "utf-8");
  }

  const problemen = [
    !bestand && "Kies een Asana-taak of de HTML uit de Mail Builder.",
    maileonNaam.length < 3 && "Vul de mailnaam in.",
    naamTeLang && `De naam in Maileon is te lang (${maileonNaam.length} tekens).`,
    !onderwerp.trim() && "Vul het onderwerp in.",
  ].filter((p): p is string => typeof p === "string");

  async function zetInMaileon(nieuw = false) {
    if (!bestand || problemen.length > 0) return;
    setBezig(true);
    setFout(null);
    setUitkomst(null);
    setGekopieerd(false);
    try {
      const res = await fetch("/api/marnix/maileon-concept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          html: bestand.html,
          naam,
          dmid,
          onderwerp,
          previewTekst,
          nieuw,
          ...(bestand.asanaTaakId && { asanaTaakId: bestand.asanaTaakId }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFout({ melding: data.error ?? `Er ging iets mis (${res.status}).`, code: data.code });
        return;
      }
      setUitkomst(data as Uitkomst);
    } catch {
      setFout({ melding: "PSV Tools is niet bereikbaar. Controleer je verbinding en probeer het opnieuw." });
    } finally {
      setBezig(false);
    }
  }

  const volledigeLink =
    uitkomst && typeof window !== "undefined" ? new URL(uitkomst.voorbeeldUrl, window.location.origin).toString() : "";

  async function kopieer() {
    await navigator.clipboard.writeText(volledigeLink);
    setGekopieerd(true);
    setTimeout(() => setGekopieerd(false), 2000);
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* 1. De mail */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">1. De mail</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* Uit Asana */}
          <div className="space-y-3">
            <Label htmlFor="mc-taak">Uit Asana (testproject)</Label>
            <div className="flex flex-col gap-2 sm:flex-row">
              <select
                id="mc-taak"
                className={SELECT_KLASSEN}
                value={gekozen}
                onChange={(e) => setGekozen(e.target.value)}
                disabled={!taken || taken.length === 0}
              >
                <option value="">{taken === null ? "Taken laden…" : taken.length ? "Kies een taak" : "Geen open taken"}</option>
                {(taken ?? []).map((t) => (
                  <option key={t.gid} value={t.gid}>
                    {t.naam}
                    {t.sectie ? ` · ${t.sectie}` : ""}
                  </option>
                ))}
              </select>
              <Button type="button" onClick={haalBrief} disabled={!gekozen || briefBezig} className="shrink-0">
                {briefBezig ? <Loader2 className="animate-spin" /> : <Check />}
                Brief ophalen
              </Button>
            </div>
            {takenFout && <div className="alert alert--error mb-0">{takenFout}</div>}
            {briefFout && <div className="alert alert--error mb-0">{briefFout}</div>}
            {brief && (
              <div className="space-y-3">
                <p className="text-sm">
                  <span className="font-bold">{brief.taak.naam}</span>
                  {brief.taak.sectie && <span className="text-muted-foreground"> · {brief.taak.sectie}</span>}
                  {brief.taak.url && (
                    <>
                      {" "}
                      <a href={brief.taak.url} target="_blank" rel="noopener noreferrer" className="underline">
                        Open in Asana
                      </a>
                    </>
                  )}
                </p>
                <PuntenLijst punten={brief.punten} />
                {builderState && (
                  <Button type="button" size="sm" variant="outline" onClick={downloadVoorBuilder}>
                    <Download />
                    Download voor de Mail Builder
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Of uit de Mail Builder */}
          <div className="space-y-3 border-t border-border pt-5">
            <Label>Of: HTML uit de Mail Builder</Label>
            <p className="text-sm text-muted-foreground">
              Gebruik de Download uit de Mail Builder. Daar zit de staat in, zodat naam, DMID en preview-tekst vanzelf
              worden ingevuld.
            </p>
            <input
              ref={invoerRef}
              type="file"
              accept=".html,.htm,text/html"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) kiesBestand(file);
                if (invoerRef.current) invoerRef.current.value = "";
              }}
            />
            <Button type="button" variant="outline" onClick={() => invoerRef.current?.click()}>
              <FileUp />
              HTML kiezen
            </Button>
            {bestand && !bestand.asanaTaakId && (
              <p className="text-sm">
                <span className="font-bold">{bestand.naam}</span>{" "}
                <span className="text-muted-foreground">
                  · {bestand.kb} kB{bestand.template ? ` · template ${bestand.template}` : ""}
                </span>
              </p>
            )}
            {bestandMelding && <div className={`alert alert--${bestandMelding.soort} mb-0`}>{bestandMelding.tekst}</div>}
          </div>
        </CardContent>
      </Card>

      {/* Voorbeeld van een mail uit Asana */}
      {voorbeeld && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">Voorbeeld</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-muted-foreground">
              Zoals de Mail Builder hem toont. Dynamische velden staan hier nog als token; in het voorbeeld van Maileon
              zijn ze ingevuld.
            </p>
            <iframe
              title="Voorbeeld van de mail"
              srcDoc={voorbeeld}
              sandbox=""
              className="h-[720px] w-full max-w-[640px] rounded-md border border-border bg-white"
            />
          </CardContent>
        </Card>
      )}

      {/* 2. Gegevens */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">2. Gegevens</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-[1fr_12rem]">
            <div className="space-y-2">
              <Label htmlFor="mc-naam">Mailnaam</Label>
              <Input
                id="mc-naam"
                placeholder="2026.11.27 PSV Kaartverkoop - Bezoekersinfo Real Madrid"
                value={naam}
                onChange={(e) => setNaam(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mc-dmid">DMID</Label>
              <Input id="mc-dmid" placeholder="DMID26-22619" value={dmid} onChange={(e) => setDmid(e.target.value)} />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            Naam in Maileon: <code>{maileonNaam || "…"}</code> ({maileonNaam.length} tekens). Moet uniek zijn in Maileon.
            {naamLang && (
              <span className="text-warning">
                {" "}
                De API-documentatie van Maileon noemt {NAAM_ADVIES} tekens als maximum. Weigert Maileon de naam, maak hem dan korter.
              </span>
            )}
          </p>

          <div className="space-y-2">
            <Label htmlFor="mc-onderwerp">Onderwerp</Label>
            <Input
              id="mc-onderwerp"
              placeholder="🎟️ Belangrijke ticketinformatie Real Madrid - PSV"
              value={onderwerp}
              onChange={(e) => setOnderwerp(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{onderwerp.trim().length} tekens. Op mobiel zie je er ongeveer 40 tot 50.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mc-preview">Preview-tekst</Label>
            <Input
              id="mc-preview"
              placeholder="Lees deze informatie goed door"
              value={previewTekst}
              onChange={(e) => setPreviewTekst(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 3. Naar Maileon */}
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">3. Naar Maileon</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {bestaand && !uitkomst && (
            <div className="alert alert--info mb-0">
              Er staat al een concept voor deze mail: mailing {bestaand.mailingId}, bijgewerkt {tijdstip(bestaand.bijgewerkt)}.
              Opnieuw zetten werkt dat concept bij, met dezelfde{" "}
              <a href={bestaand.voorbeeldUrl} target="_blank" rel="noopener noreferrer" className="underline">
                voorbeeldlink
              </a>
              .
            </div>
          )}

          {problemen.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
              {problemen.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          )}

          <Button type="button" onClick={() => zetInMaileon(false)} disabled={bezig || problemen.length > 0}>
            {bezig ? <Loader2 className="animate-spin" /> : <Check />}
            {bestaand ? "Concept bijwerken in Maileon" : "Als concept in Maileon zetten"}
          </Button>
          {bestand?.asanaTaakId && (
            <p className="text-xs text-muted-foreground">
              Daarna komt er een reactie met de voorbeeldlink op de Asana-taak, en gaat de taak naar Feedback.
            </p>
          )}

          {fout && (
            <div className="alert alert--error mb-0 space-y-3">
              <p className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>{fout.melding}</span>
              </p>
              {fout.code === "aangepast" && (
                <Button type="button" size="sm" variant="outline" onClick={() => zetInMaileon(true)} disabled={bezig}>
                  Toch een nieuw concept maken
                </Button>
              )}
              {fout.code === "aangepast" && (
                <p className="text-xs">Het nieuwe concept krijgt dezelfde naam; geeft Maileon een fout, pas dan de mailnaam aan.</p>
              )}
            </div>
          )}

          {uitkomst && (
            <div className="alert alert--success mb-0 space-y-3">
              <p>
                <span className="font-bold">{uitkomst.nieuw ? "Nieuw concept in Maileon." : "Concept bijgewerkt in Maileon."}</span>{" "}
                Mailing {uitkomst.mailingId}: {uitkomst.naam}.
                {uitkomst.vervangen && " Het vorige concept bestond niet meer in Maileon; dit is een nieuw."}
              </p>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input readOnly value={volledigeLink} onFocus={(e) => e.target.select()} className="font-text text-foreground" />
                <div className="flex gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={kopieer}>
                    {gekopieerd ? <Check /> : <Copy />}
                    {gekopieerd ? "Gekopieerd" : "Kopieer"}
                  </Button>
                  <Button type="button" size="sm" variant="outline" asChild>
                    <a href={uitkomst.voorbeeldUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink />
                      Open
                    </a>
                  </Button>
                </div>
              </div>
              <p className="text-xs">
                {uitkomst.voorbeeldBron === "maileon"
                  ? "Het voorbeeld komt van Maileon zelf, met een algemeen contact (geen persoonsgegevens)."
                  : "Maileon gaf geen voorbeeld; dit voorbeeld komt uit de export, zonder dynamische velden."}{" "}
                De link werkt zonder inloggen en blijft hetzelfde bij een nieuwe versie.
              </p>
              {uitkomst.asana && (
                <p className="text-xs">
                  {uitkomst.asana.reactie
                    ? `Reactie met de link geplaatst in Asana${uitkomst.asana.sectie ? `, taak naar ${uitkomst.asana.sectie}` : ""}.`
                    : `Het concept staat erin, maar de reactie in Asana lukte niet: ${uitkomst.asana.fout ?? "onbekende fout"}`}
                </p>
              )}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            Daarna in Maileon: doelgroep kiezen (met de preference-regel), testmail en inplannen. PSV Tools verstuurt niets.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
