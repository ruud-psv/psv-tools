"use client";

import { useState, useEffect, useRef } from "react";
import { Check, Copy, Loader2, MessageSquare, RotateCcw, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";

interface HuisstijlOutput {
  gecorrigeerde_tekst: string;
  wijzigingen?: string[];
}

interface ConversationMessage {
  role: "assistant" | "user";
  content: string;
}

function parseResponse(raw: unknown): HuisstijlOutput | null {
  if (!raw) return null;

  // Direct object with gecorrigeerde_tekst
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    if (typeof obj.gecorrigeerde_tekst === "string") {
      return {
        gecorrigeerde_tekst: obj.gecorrigeerde_tekst,
        wijzigingen: Array.isArray(obj.wijzigingen)
          ? obj.wijzigingen.map(String).filter(Boolean)
          : undefined,
      };
    }
    // Fallback: check common wrapper keys
    for (const key of ["output", "result", "text", "message"]) {
      if (typeof obj[key] === "string") {
        return parseResponse(obj[key]);
      }
    }
  }

  // JSON string
  if (typeof raw === "string") {
    const trimmed = raw.trim();
    // Strip markdown code fences
    const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    const toParse = fenceMatch ? fenceMatch[1].trim() : trimmed;
    if (toParse.startsWith("{")) {
      try {
        return parseResponse(JSON.parse(toParse));
      } catch {
        // fall through
      }
    }
    // Plain text fallback
    if (trimmed) return { gecorrigeerde_tekst: trimmed };
  }

  return null;
}

export function HuisstijlCheckerForm() {
  const [tekst, setTekst] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [output, setOutput] = useState<HuisstijlOutput | null>(null);
  const [progress, setProgress] = useState(0);
  const [copied, setCopied] = useState(false);

  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [originalPayload, setOriginalPayload] = useState<Record<string, string> | null>(null);
  const [followUpInput, setFollowUpInput] = useState("");
  const [followUpLoading, setFollowUpLoading] = useState(false);
  const [followUpError, setFollowUpError] = useState("");

  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const PROGRESS_DURATION = 35000;

  function startProgress() {
    setProgress(0);
    const start = Date.now();
    progressRef.current = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.min((elapsed / PROGRESS_DURATION) * 100, 99);
      setProgress(pct);
      if (elapsed >= PROGRESS_DURATION) clearInterval(progressRef.current!);
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
    setTekst("");
    setStatus("idle");
    setErrorMsg("");
    setOutput(null);
    setProgress(0);
    setCopied(false);
    setConversation([]);
    setOriginalPayload(null);
    setFollowUpInput("");
    setFollowUpError("");
    if (progressRef.current) clearInterval(progressRef.current);
  }

  async function handleCopy() {
    if (!output?.gecorrigeerde_tekst) return;
    await navigator.clipboard.writeText(output.gecorrigeerde_tekst);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg("");

    const payload: Record<string, string> = {
      category: "huisstijl_check",
      tekst: tekst.trim(),
    };

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
        throw new Error("Het controleren van de tekst is mislukt. Probeer het opnieuw.");
      }

      stopProgress();
      const parsed = parseResponse(raw);
      if (!parsed) throw new Error("Onverwacht antwoord ontvangen van de agent.");

      setOutput(parsed);
      setOriginalPayload(payload);
      setConversation([{ role: "assistant", content: parsed.gecorrigeerde_tekst }]);
      setStatus("done");
    } catch (err) {
      stopProgress();
      setErrorMsg(err instanceof Error ? err.message : "Onbekende fout.");
      setStatus("error");
    }
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

      if (!response.ok) throw new Error("Het bijsturen is mislukt. Probeer het opnieuw.");

      const parsed = parseResponse(raw);
      if (!parsed) throw new Error("Onverwacht antwoord ontvangen van de agent.");

      const assistantMessage: ConversationMessage = {
        role: "assistant",
        content: parsed.gecorrigeerde_tekst,
      };

      setConversation([...updatedConversation, assistantMessage]);
      setOutput(parsed);
      setFollowUpInput("");
    } catch (err) {
      setFollowUpError(err instanceof Error ? err.message : "Onbekende fout.");
    } finally {
      setFollowUpLoading(false);
    }
  }

  // ── Loading state ────────────────────────────────────────────────────────────
  if (status === "loading") {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
          <p className="text-sm font-medium">Tekst wordt gecontroleerd…</p>
        </div>
        <Progress value={progress} className="h-2" />
        <p className="text-xs text-muted-foreground">
          Dit kan even duren. Sluit deze pagina niet.
        </p>
      </div>
    );
  }

  // ── Output state ─────────────────────────────────────────────────────────────
  if (status === "done" && output) {
    const feedbackHistory = conversation.filter((m) => m.role === "user");
    const noChanges =
      output.gecorrigeerde_tekst.trim() === originalPayload?.tekst?.trim();

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

        {/* Feedback history */}
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

        {/* Status banner */}
        {noChanges ? (
          <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            <Check className="h-4 w-4 text-primary flex-shrink-0" />
            Geen wijzigingen — de tekst voldoet al aan de PSV-huisstijl.
          </div>
        ) : (
          output.wijzigingen && output.wijzigingen.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Doorgevoerde wijzigingen</h3>
              <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                {output.wijzigingen.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </section>
          )
        )}

        {/* Corrected text */}
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Gecorrigeerde tekst</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
              className="gap-2"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  Gekopieerd!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  Kopieer
                </>
              )}
            </Button>
          </div>
          <pre className="whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed">
            {output.gecorrigeerde_tekst}
          </pre>
        </section>

        {/* Follow-up */}
        <div className="border-t border-border pt-5">
          <p className="mb-3 text-sm font-medium">Wil je iets aanpassen?</p>
          <form onSubmit={handleFollowUp} className="flex gap-2">
            <Input
              placeholder='Bijv. "Pas ook de tijdnotatie aan" of "Verwijder de gedachtestreepjes"'
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

  // ── Form state ───────────────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="tekst">
          Tekst om te controleren <span className="text-destructive">*</span>
        </Label>
        <Textarea
          id="tekst"
          rows={10}
          placeholder="Plak hier de tekst die je wilt laten controleren op PSV-huisstijl…"
          value={tekst}
          onChange={(e) => setTekst(e.target.value)}
          required
        />
        {tekst.length > 0 && (
          <p className="text-xs text-muted-foreground text-right">
            {tekst.length} tekens
          </p>
        )}
      </div>

      <Separator />

      <div className="rounded-md border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Wat controleert de agent?</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>Spelling van PSV-eigennamen en submerken</li>
          <li>Koppeltekens, hoofdletters en samenstellingen</li>
          <li>Tijd- en datumnotatie, geldbedragen en getallen</li>
          <li>Em dash (—) gebruik en andere interpunctie</li>
          <li>Verwijzingen naar PSV (het/zijn)</li>
        </ul>
      </div>

      {status === "error" && errorMsg && (
        <p className="text-sm text-destructive">{errorMsg}</p>
      )}

      <Button type="submit" className="w-full" disabled={!tekst.trim()}>
        Controleer tekst
      </Button>
    </form>
  );
}
