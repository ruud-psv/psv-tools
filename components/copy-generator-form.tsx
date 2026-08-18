"use client";

import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { MessageSquare, RotateCcw, Loader2, Send } from "lucide-react";

interface ConversationMessage {
  role: "assistant" | "user";
  content: string;
}

// ─── Output parsing helpers ───────────────────────────────────────────────────

function normalizeOutput(text: string): string {
  return text
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\'/g, "'");
}

function stripCodeFences(text: string): string {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return match ? match[1].trim() : text;
}

function toList(value: unknown): string[] {
  if (Array.isArray(value)) return (value as unknown[]).filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

function extractJsonBlock(text: string): string | null {
  const start = text.search(/[{[]/);
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (inString) {
      if (escape) { escape = false; continue; }
      if (c === "\\") { escape = true; continue; }
      if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; continue; }
    if (c === "{" || c === "[") depth++;
    if (c === "}" || c === "]") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

interface LinkItem { label?: string; url?: string }

function formatLinks(links: unknown): string[] {
  if (!links) return [];
  if (Array.isArray(links)) {
    return (links as (string | LinkItem)[])
      .map((link) => {
        if (typeof link === "string") return link;
        if (link && typeof link === "object") {
          const label = link.label ? `${link.label}: ` : "";
          return `${label}${link.url || ""}`.trim();
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof links === "string") {
    return links.split("\n").map((l) => l.trim()).filter(Boolean);
  }
  return [];
}

interface EmailData {
  subject_lines?: unknown;
  preheaders?: unknown;
  email_plaintext_main?: string;
  email_plaintext_ab_variant?: string;
  cta_primary?: string;
  cta_secondary?: string;
  links_used?: unknown;
  doelgroep?: string;
  exploitatie?: string;
  partner?: string;
  doel_van_de_mail?: string;
  cta_omschrijving?: string;
  overige_input?: string;
}

interface ParsedOutput {
  type: "email";
  data: EmailData;
}

function tryParseEmailJson(data: unknown): ParsedOutput | null {
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const d = data as EmailData;
  if (!d.subject_lines && !d.email_plaintext_main) return null;
  return { type: "email", data: d };
}

type OutputResult =
  | { kind: "email"; data: EmailData }
  | { kind: "text"; content: string };

function parseOutput(raw: unknown): OutputResult {
  if (Array.isArray(raw)) {
    if (raw.length === 1) return parseOutput(raw[0]);
    for (const item of raw as unknown[]) {
      if (item && typeof item === "object") {
        for (const key of ["text", "message", "output", "result"]) {
          if (typeof (item as Record<string, unknown>)[key] === "string") {
            return parseOutput((item as Record<string, unknown>)[key]);
          }
        }
        const email = tryParseEmailJson(item);
        if (email) return { kind: "email", data: email.data };
      }
    }
    return { kind: "text", content: JSON.stringify(raw, null, 2) };
  }

  if (raw && typeof raw === "object") {
    for (const key of ["text", "message", "output", "result"]) {
      if (typeof (raw as Record<string, unknown>)[key] === "string") {
        return parseOutput((raw as Record<string, unknown>)[key]);
      }
    }
    const email = tryParseEmailJson(raw);
    if (email) return { kind: "email", data: email.data };
    return { kind: "text", content: JSON.stringify(raw, null, 2) };
  }

  if (typeof raw === "string") {
    const trimmed = raw.trim();
    const stripped = stripCodeFences(trimmed);

    if (stripped.startsWith("{") || stripped.startsWith("[")) {
      try {
        const parsed = JSON.parse(stripped);
        const email = tryParseEmailJson(parsed);
        if (email) return { kind: "email", data: email.data };
        return { kind: "text", content: JSON.stringify(parsed, null, 2) };
      } catch {
        // fall through
      }
    }

    const jsonBlock = extractJsonBlock(stripped);
    if (jsonBlock) {
      try {
        const parsed = JSON.parse(jsonBlock);
        const email = tryParseEmailJson(parsed);
        if (email) return { kind: "email", data: email.data };
        return { kind: "text", content: JSON.stringify(parsed, null, 2) };
      } catch {
        // fall through
      }
    }

    return { kind: "text", content: normalizeOutput(raw) };
  }

  return { kind: "text", content: String(raw ?? "") };
}

// ─── Output rendering ──────────────────────────────────────────────────────

function EmailOutput({ data }: { data: EmailData }) {
  const subjects = toList(data.subject_lines);
  const preheaders = toList(data.preheaders);
  const links = formatLinks(data.links_used);

  const metaItems: { label: string; value: string }[] = [];
  if (data.doelgroep) metaItems.push({ label: "Doelgroep", value: data.doelgroep });
  if (data.exploitatie) metaItems.push({ label: "Exploitatie", value: data.exploitatie });
  if (data.partner) metaItems.push({ label: "Partner", value: data.partner });
  if (data.doel_van_de_mail) metaItems.push({ label: "Doel van de mail", value: data.doel_van_de_mail });
  if (data.cta_omschrijving) metaItems.push({ label: "CTA-omschrijving", value: data.cta_omschrijving });
  if (data.overige_input) metaItems.push({ label: "Overige input", value: data.overige_input });

  return (
    <div className="space-y-6">
      {subjects.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Onderwerpregels</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {subjects.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section>
      )}

      {preheaders.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Preheaders</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {preheaders.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section>
      )}

      {data.email_plaintext_main && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Hoofdversie</h2>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {data.email_plaintext_main}
          </pre>
        </section>
      )}

      {data.email_plaintext_ab_variant && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Alternatieve versie</h2>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {data.email_plaintext_ab_variant}
          </pre>
        </section>
      )}

      {(data.cta_primary || data.cta_secondary) && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">CTA</h2>
          <div className="rounded-md border border-border bg-muted/40 p-4 space-y-2 text-sm">
            {data.cta_primary && (
              <p><span className="font-medium">Primair:</span> {data.cta_primary}</p>
            )}
            {data.cta_secondary && (
              <p><span className="font-medium">Secundair:</span> {data.cta_secondary}</p>
            )}
          </div>
        </section>
      )}

      {links.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold">Links</h2>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {links.map((line, i) => <li key={i}>{line}</li>)}
          </ul>
        </section>
      )}

      {metaItems.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-semibold">Ingevoerde velden</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {metaItems.map((item) => (
              <div key={item.label} className="rounded-md border border-border bg-muted/40 p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {item.label}
                </p>
                <p className="mt-1 text-sm font-medium whitespace-pre-wrap">
                  {item.value}
                </p>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ─── Main form component ──────────────────────────────────────────────────────

type Category = "mail_nl" | "partner_copy" | "engels" | "social_copy" | "";

export function CopyGeneratorForm() {
  const [category, setCategory] = useState<Category>("");
  const [doelgroep, setDoelgroep] = useState("");
  const [exploitatie, setExploitatie] = useState("");
  const [partner, setPartner] = useState("");
  const [doelVanDeMail, setDoelVanDeMail] = useState("");
  const [ctaOmschrijving, setCtaOmschrijving] = useState("");
  const [overigeInput, setOverigeInput] = useState("");
  const [details, setDetails] = useState("");

  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [output, setOutput] = useState<OutputResult | null>(null);
  const [progress, setProgress] = useState(0);

  // Conversation / follow-up state
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [originalPayload, setOriginalPayload] = useState<Record<string, string> | null>(null);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PROGRESS_DURATION = 75000;

  function startProgress() {
    setProgress(0);
    const start = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / PROGRESS_DURATION) * 100, 99);
      setProgress(pct);
      if (elapsed >= PROGRESS_DURATION) {
        clearInterval(progressRef.current!);
      }
    }, 100);
  }

  function stopProgress() {
    if (progressRef.current) clearInterval(progressRef.current);
    setProgress(100);
  }

  useEffect(() => {
    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, []);

  function reset() {
    setCategory("");
    setDoelgroep("");
    setExploitatie("");
    setPartner("");
    setDoelVanDeMail("");
    setCtaOmschrijving("");
    setOverigeInput("");
    setDetails("");
    setStatus("idle");
    setErrorMsg("");
    setOutput(null);
    setProgress(0);
    setConversation([]);
    setOriginalPayload(null);
    setFollowUpInput("");
    setFollowUpError("");
    if (progressRef.current) clearInterval(progressRef.current);
  }

  function outputToText(result: OutputResult): string {
    if (result.kind === "text") return result.content;
    // Serialize email output as readable text for n8n context
    return JSON.stringify(result.data);
  }

  async function handleFollowUp(e: React.FormEvent) {
    e.preventDefault();
    if (!followUpInput.trim() || !originalPayload) return;

    setFollowUpError("");
    setFollowUpLoading(true);

    const updatedConversation: ConversationMessage[] = [
      ...conversation,
      { role: "user", content: followUpInput.trim() },
    ];

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...originalPayload,
          conversation: updatedConversation,
        }),
      });

      const contentType = response.headers.get("content-type") || "";
      const raw = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error("Het bijsturen is mislukt. Probeer het opnieuw.");
      }

      const newOutput = parseOutput(raw);
      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: outputToText(newOutput),
      };

      setConversation([...updatedConversation, assistantMessage]);
      setOutput(newOutput);
      setFollowUpInput("");
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Onbekende fout.");
    } finally {
      setFollowUpLoading(false);
    }
  }

  const isMailNl = category === "mail_nl";
  const isPartner = category === "partner_copy";
  const isText = category === "engels" || category === "social_copy";
  const showMailFields = isMailNl || isPartner;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const payload: Record<string, string> = { category };

    if (showMailFields) {
      if (isMailNl) {
        payload.doelgroep = doelgroep;
        payload.exploitatie = exploitatie;
      }
      if (isPartner) {
        payload.partner = partner.trim();
      }
      payload.doel_van_de_mail = doelVanDeMail.trim();
      payload.cta_omschrijving = ctaOmschrijving.trim();
      payload.overige_input = overigeInput.trim();
      payload.language = "nl";
    } else {
      payload.details = details.trim();
    }

    setStatus("loading");
    startProgress();

    try {
      const response = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const contentType = response.headers.get("content-type") || "";
      const raw = contentType.includes("application/json")
        ? await response.json()
        : await response.text();

      if (!response.ok) {
        throw new Error(
          "Het genereren van de tekst is mislukt. Controleer je invoer en probeer het opnieuw."
        );
      }

      stopProgress();
      const parsed = parseOutput(raw);
      setOutput(parsed);
      setOriginalPayload(payload);
      setConversation([{ role: "assistant", content: outputToText(parsed) }]);
      setStatus("done");
    } catch (err) {
      stopProgress();
      setErrorMsg(
        err instanceof Error ? err.message : "Onbekende fout."
      );
      setStatus("error");
    }
  }

  // ── Loading state ──────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-medium">Copy wordt gegenereerd…</p>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground">
          Dit kan tot een minuut duren. Sluit deze pagina niet.
        </p>
      </div>
    );
  }

  // ── Output state ───────────────────────────────────────────────────────────
  if (status === "done" && output) {
    // Previous user feedback messages (everything except first assistant message)
    const feedbackHistory = conversation.filter((m) => m.role === "user");

    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">
            Resultaat
            {feedbackHistory.length > 0 && (
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · versie {feedbackHistory.length + 1}
              </span>
            )}
          </h2>
          <Button variant="outline" size="sm" onClick={reset} className="gap-2">
            <RotateCcw className="h-3.5 w-3.5" />
            Opnieuw
          </Button>
        </div>

        {/* Feedback history (collapsed) */}
        {feedbackHistory.length > 0 && (
          <div className="space-y-2">
            {feedbackHistory.map((msg, i) => (
              <div
                key={i}
                className="flex items-start gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm text-muted-foreground"
              >
                <MessageSquare className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                <span>
                  <span className="font-medium text-foreground">
                    Aanpassing {i + 1}:
                  </span>{" "}
                  {msg.content}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Current output */}
        {output.kind === "email" ? (
          <EmailOutput data={output.data} />
        ) : (
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {output.content}
          </pre>
        )}

        {/* Follow-up input */}
        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium">Wil je iets aanpassen?</p>
          <form onSubmit={handleFollowUp} className="flex gap-2">
            <Input
              placeholder='Bijv. "Maak de CTA krachtiger" of "Herschrijf de tweede alinea"'
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              disabled={followUpLoading}
              className="flex-1"
            />
            <Button
              type="submit"
              disabled={followUpLoading || !followUpInput.trim()}
              className="gap-2"
            >
              {followUpLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              {followUpLoading ? "Bezig…" : "Stuur"}
            </Button>
          </form>
          {followUpError && (
            <p className="mt-2 text-sm text-destructive">{followUpError}</p>
          )}
        </div>
      </div>
    );
  }

  // ── Form state ─────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Category */}
      <div className="space-y-2">
        <Label htmlFor="category">Doel</Label>
        <Select
          value={category}
          onValueChange={(v) => setCategory(v as Category)}
          required
        >
          <SelectTrigger id="category">
            <SelectValue placeholder="Maak een keuze" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="mail_nl">PSV Mailing copy</SelectItem>
            <SelectItem value="partner_copy">Partner mailing copy</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Text field (for future text-based categories) */}
      {isText && (
        <div className="space-y-2">
          <Label htmlFor="details">Tekst</Label>
          <Textarea
            id="details"
            rows={5}
            placeholder="Schrijf je bericht..."
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            required
          />
        </div>
      )}

      {/* Mail fields */}
      {showMailFields && (
        <div className="space-y-4">
          {/* Doelgroep (mail_nl only) */}
          {isMailNl && (
            <div className="space-y-2">
              <Label htmlFor="doelgroep">Doelgroep</Label>
              <Select
                value={doelgroep}
                onValueChange={setDoelgroep}
                required
              >
                <SelectTrigger id="doelgroep">
                  <SelectValue placeholder="Kies een doelgroep" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Seizoenkaarthouders">
                    Seizoenkaarthouders
                  </SelectItem>
                  <SelectItem value="Mijn PSV">Mijn PSV</SelectItem>
                  <SelectItem value="Mijn PSV+">Mijn PSV+</SelectItem>
                  <SelectItem value="Fanclub members">
                    Fanclub members
                  </SelectItem>
                  <SelectItem value="FANstore">FANstore</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Exploitatie (mail_nl only) */}
          {isMailNl && (
            <div className="space-y-2">
              <Label htmlFor="exploitatie">Exploitatie</Label>
              <Select
                value={exploitatie}
                onValueChange={setExploitatie}
                required
              >
                <SelectTrigger id="exploitatie">
                  <SelectValue placeholder="Kies een optie" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Ticketing">Ticketing</SelectItem>
                  <SelectItem value="Merchandise">Merchandise</SelectItem>
                  <SelectItem value="MIJN PSV+">MIJN PSV+</SelectItem>
                  <SelectItem value="FC PSV">FC PSV</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Partner (partner_copy only) */}
          {isPartner && (
            <div className="space-y-2">
              <Label htmlFor="partner">Partner</Label>
              <Input
                id="partner"
                type="text"
                placeholder="Bijv. Philips"
                value={partner}
                onChange={(e) => setPartner(e.target.value)}
                required
              />
            </div>
          )}

          {/* Doel van de mail */}
          <div className="space-y-2">
            <Label htmlFor="doel-van-de-mail">Doel van de mail</Label>
            <Input
              id="doel-van-de-mail"
              type="text"
              placeholder="Klikken naar website, meer informatie lezen, etc."
              value={doelVanDeMail}
              onChange={(e) => setDoelVanDeMail(e.target.value)}
              required
            />
          </div>

          {/* CTA omschrijving */}
          <div className="space-y-2">
            <Label htmlFor="cta-omschrijving">Omschrijf de CTA</Label>
            <Input
              id="cta-omschrijving"
              type="text"
              placeholder="Word lid, koop tickets, doe mee, etc."
              value={ctaOmschrijving}
              onChange={(e) => setCtaOmschrijving(e.target.value)}
              required
            />
          </div>

          {/* Overige input */}
          <div className="space-y-2">
            <Label htmlFor="overige-input">Overige input</Label>
            <Textarea
              id="overige-input"
              rows={4}
              placeholder="Plak hier alle benodigde input die nodig zijn om tot een goede tekst te komen. Hoe meer input, hoe beter het resultaat."
              value={overigeInput}
              onChange={(e) => setOverigeInput(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Error */}
      {status === "error" && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      {/* Submit */}
      <Button
        type="submit"
        className="w-full"
        disabled={!category}
      >
        Verstuur
      </Button>

      {/* Feedback link */}
      <div className="flex justify-center pt-2">
        <a
          href="https://form.asana.com/?k=8cmANuEgVHFzoChIx2aRbw&d=1113382548430224"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageSquare className="h-3.5 w-3.5" />
          Feedback geven
        </a>
      </div>
    </form>
  );
}
