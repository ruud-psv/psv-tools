"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, Copy, ExternalLink, FileUp, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MAX_NAAM, NAAM_ADVIES, conceptNaam } from "@/lib/maileon/concept-naam";

/**
 * Testpagina: een mail uit de Mail Builder (de Download, met de opgeslagen
 * staat erin) als concept in Maileon zetten, en de voorbeeldlink delen.
 * Server: `app/api/marnix/maileon-concept/route.ts`.
 */

/** De staat die de Mail Builder achter de HTML zet bij Download. */
const STAAT = /\s*<!--\s*mailbuilder-state:([\s\S]*?)\s*-->\s*$/;

interface Bestand {
  naam: string;
  html: string;
  kb: number;
  template?: string;
}

interface Uitkomst {
  mailingId: number;
  naam: string;
  nieuw: boolean;
  vervangen: boolean;
  voorbeeldUrl: string;
  voorbeeldBron: "maileon" | "export";
  bijgewerkt: string;
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

function tijdstip(iso: string): string {
  return new Date(iso).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
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

  const maileonNaam = conceptNaam(naam, dmid);
  const naamTeLang = maileonNaam.length > MAX_NAAM;
  const naamLang = maileonNaam.length > NAAM_ADVIES;

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

  function kiesBestand(file: File) {
    setBestandMelding(null);
    setUitkomst(null);
    setFout(null);
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
    !bestand && "Kies de HTML uit de Mail Builder.",
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
        body: JSON.stringify({ html: bestand.html, naam, dmid, onderwerp, previewTekst, nieuw }),
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
        <CardContent className="space-y-3">
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
            {bestand ? "Ander bestand kiezen" : "HTML kiezen"}
          </Button>
          {bestand && (
            <p className="text-sm">
              <span className="font-bold">{bestand.naam}</span>{" "}
              <span className="text-muted-foreground">
                · {bestand.kb} kB{bestand.template ? ` · template ${bestand.template}` : ""}
              </span>
            </p>
          )}
          {bestandMelding && <div className={`alert alert--${bestandMelding.soort} mb-0`}>{bestandMelding.tekst}</div>}
        </CardContent>
      </Card>

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
