"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ExternalLink, FileUp, Loader2, Send, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  ID_TYPE_KEYS,
  ID_TYPES,
  IdListError,
  parseIdSheet,
  parseIdText,
  type IdListSummary,
  type IdType,
} from "@/lib/contact-filter-import/ids";
import { MAILEON_FIELDS } from "@/lib/contact-filter-import/maileon";
import { defaultDmid, filterName, MAX_FILTER_VALUES } from "@/lib/maileon/contact-filters";

/** Een ingelezen bestand: een werkblad (Excel) of tekst (CSV/TXT). */
type LoadedFile = { name: string; table: unknown[][] } | { name: string; text: string };

interface MaileonPush {
  name: string;
  contactFilterId: number;
  filterUrl: string;
  targetGroupId: number | null;
  targetGroupError: string | null;
  pushed: number;
  field: string;
}

interface TargetGroupStatus {
  state: string;
  countContacts: number | null;
  countActiveContacts: number | null;
}

/** Hoe vaak de pagina de doelgroep opvraagt terwijl Maileon rekent: elke 5 s, 2 minuten lang. */
const STATUS_POLLS = 24;

/** Groot genoeg voor elke lijst die in één filter past, klein genoeg om de browser niet te laten haperen. */
const MAX_FILE_BYTES = 10 * 1024 * 1024;

const number = new Intl.NumberFormat("nl-NL");

/** Vandaag als `yyyy-mm-dd`, in Nederlandse tijd. */
function today(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Amsterdam" }).format(new Date());
}

const LABEL = "text-xs font-heading uppercase tracking-wide text-muted-foreground";

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <p className={LABEL}>{label}</p>
      <p className="text-2xl font-heading">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function Problem({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex items-start gap-2 text-sm">
      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
      <span>{children}</span>
    </p>
  );
}

export function ContactFilterImport() {
  const [idType, setIdType] = useState<IdType>("relatienummer");
  const [text, setText] = useState("");
  const [file, setFile] = useState<LoadedFile | null>(null);
  const [reading, setReading] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [sendDate, setSendDate] = useState(today);
  const [title, setTitle] = useState("");
  const [dmid, setDmid] = useState("");
  const [pushing, setPushing] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);
  const [pushed, setPushed] = useState<MaileonPush | null>(null);
  const [groupStatus, setGroupStatus] = useState<TargetGroupStatus | null>(null);
  const [groupStatusError, setGroupStatusError] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);

  const type = ID_TYPES[idType];

  const parsed = useMemo((): { summary: IdListSummary } | { error: string } | null => {
    if (!file && !text.trim()) return null;
    try {
      if (file) return { summary: "table" in file ? parseIdSheet(file.table, idType) : parseIdText(file.text, idType) };
      return { summary: parseIdText(text, idType) };
    } catch (caught) {
      if (caught instanceof IdListError) return { error: caught.message };
      throw caught;
    }
  }, [file, text, idType]);

  const summary = parsed && "summary" in parsed ? parsed.summary : null;
  const tooMany = Boolean(summary && summary.values.length > MAX_FILTER_VALUES);

  // Een andere lijst begint zonder Maileon-uitkomst.
  useEffect(() => {
    setPushed(null);
    setPushError(null);
    setGroupStatus(null);
    setGroupStatusError(null);
  }, [summary]);

  const loadGroupStatus = useCallback(async (targetGroupId: number) => {
    try {
      const res = await fetch(`/api/contact-filter-import?targetGroupId=${targetGroupId}`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setGroupStatus(data);
      setGroupStatusError(null);
      return data as TargetGroupStatus;
    } catch (caught) {
      setGroupStatusError(caught instanceof Error ? caught.message : String(caught));
      return null;
    }
  }, []);

  // Maileon rekent de doelgroep op de achtergrond door; vraag de stand op tot hij bij is.
  useEffect(() => {
    const targetGroupId = pushed?.targetGroupId;
    if (!targetGroupId) return;
    let polls = 0;
    let stopped = false;
    setPolling(true);
    const poll = async () => {
      const status = await loadGroupStatus(targetGroupId);
      polls += 1;
      if (stopped) return;
      if (polls < STATUS_POLLS && status?.state !== "uptodate") timer = setTimeout(poll, 5000);
      else setPolling(false);
    };
    let timer = setTimeout(poll, 3000);
    return () => {
      stopped = true;
      clearTimeout(timer);
      setPolling(false);
    };
  }, [pushed, loadGroupStatus]);

  async function readFile(picked: File) {
    setFileError(null);
    if (picked.size > MAX_FILE_BYTES) {
      setFileError("Het bestand is groter dan 10 MB.");
      if (fileInput.current) fileInput.current.value = "";
      return;
    }
    setReading(true);
    try {
      // Excel herkennen aan de inhoud (een zip begint met "PK"), niet aan de naam.
      const head = new Uint8Array(await picked.slice(0, 2).arrayBuffer());
      if (head[0] === 0x50 && head[1] === 0x4b) {
        const { readSheet } = await import("read-excel-file/browser");
        setFile({ name: picked.name, table: await readSheet(picked) });
      } else {
        setFile({ name: picked.name, text: await picked.text() });
      }
    } catch (caught) {
      console.error("[contact-filter-import] bestand lezen mislukt:", caught);
      setFile(null);
      setFileError("Het bestand kon niet worden gelezen. Is het een Excel-, CSV- of tekstbestand?");
    } finally {
      setReading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  async function pushToMaileon() {
    if (!summary) return;
    setPushing(true);
    setPushError(null);
    try {
      const res = await fetch("/api/contact-filter-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idType,
          values: summary.values,
          sendDate,
          title,
          dmid: dmid.trim() || defaultDmid(sendDate),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `Status ${res.status}`);
      setPushed(data);
    } catch (caught) {
      setPushError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setPushing(false);
    }
  }

  /** Na het doorzetten liggen soort en naam vast; een andere lijst begint opnieuw. */
  const locked = pushing || Boolean(pushed);

  function startOver() {
    setText("");
    setFile(null);
    setFileError(null);
    setTitle("");
    setDmid("");
  }
  const canPush = Boolean(summary) && !tooMany && Boolean(sendDate) && Boolean(title.trim());

  return (
    <div className="space-y-6">
      {/* Lijst */}
      <Card>
        <CardContent className="p-6 space-y-5">
          <div>
            <h2 className="text-xl">Lijst</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Kies welk soort ID je lijst bevat en plak de lijst hieronder, of upload een bestand. Met een kopregel
              wordt de kolom op naam gezocht (bijvoorbeeld CRM ID, SSO ID of GroupID); andere kolommen mogen erin
              staan.
            </p>
          </div>

          <div className="space-y-2">
            <p className={LABEL}>Soort ID</p>
            <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Soort ID">
              {ID_TYPE_KEYS.map((key) => (
                <Button
                  key={key}
                  type="button"
                  role="radio"
                  aria-checked={idType === key}
                  variant={idType === key ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIdType(key)}
                  disabled={locked}
                >
                  {ID_TYPES[key].label}
                </Button>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              Maileon-veld: <span className="font-medium">{MAILEON_FIELDS[idType].label}</span>
            </p>
          </div>

          {file ? (
            <div className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3 text-sm">
              <FileUp className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium break-all">{file.name}</span>
              <Button variant="ghost" size="sm" onClick={() => setFile(null)} disabled={pushing}>
                <X className="h-4 w-4" />
                Verwijderen
              </Button>
            </div>
          ) : (
            <div className="space-y-1.5">
              <label htmlFor="ids" className={LABEL}>
                {type.plural}
              </label>
              <Textarea
                id="ids"
                rows={8}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={"Eén per regel, of gescheiden door komma's.\nEen kolom uit Excel met de kopregel erbij kan ook."}
                className="font-mono"
                disabled={pushing}
              />
            </div>
          )}

          <div className="space-y-2">
            <input
              ref={fileInput}
              type="file"
              accept=".xlsx,.csv,.txt,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv,text/plain"
              className="hidden"
              onChange={(e) => {
                const picked = e.target.files?.[0];
                if (picked) readFile(picked);
              }}
            />
            <Button variant="outline" onClick={() => fileInput.current?.click()} disabled={reading || pushing}>
              {reading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />}
              {file ? "Ander bestand" : "Bestand uploaden"}
            </Button>
            <p className="text-xs text-muted-foreground">
              Excel (.xlsx), CSV of TXT. Het bestand wordt in je browser gelezen; alleen de ID&apos;s gaan naar
              Maileon.
            </p>
            {fileError && <Problem>{fileError}</Problem>}
          </div>

          {parsed && "error" in parsed && <Problem>{parsed.error}</Problem>}

          {summary && (
            <div className="space-y-3 border-t border-border pt-5">
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <Stat
                  label="Uniek"
                  value={number.format(summary.values.length)}
                  hint={summary.column ? `${type.plural} uit kolom "${summary.column}"` : type.plural}
                />
                <Stat label="Dubbel" value={number.format(summary.duplicates)} hint="komen maar één keer in het filter" />
                <Stat
                  label="Overgeslagen"
                  value={number.format(summary.invalid.count)}
                  hint={
                    summary.invalid.count > 0
                      ? `geen geldig ${type.label}, bijv. ${summary.invalid.examples.join(", ")}`
                      : `alles is een geldig ${type.label}`
                  }
                />
              </div>
              {tooMany && (
                <Problem>
                  Maileon past hooguit {number.format(MAX_FILTER_VALUES)} {type.plural} in één filter. Splits de lijst
                  en zet de delen apart door.
                </Problem>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Doorzetten */}
      <Card>
        <CardContent className="p-6 space-y-4">
          <div>
            <h2 className="text-xl">Doorzetten naar Maileon</h2>
            <p className="text-sm text-muted-foreground max-w-3xl">
              Maakt in Maileon een contactfilter met iedereen uit de lijst, en een doelgroep op dat filter met
              dezelfde naam. De preference-regel die bij je mailing hoort, voeg je daarna in Maileon zelf aan het
              filter toe, want de API van Maileon accepteert die regel niet.
            </p>
          </div>

          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5 w-44">
              <label htmlFor="verzenddatum" className={LABEL}>
                Verzenddatum
              </label>
              <Input
                id="verzenddatum"
                type="date"
                value={sendDate}
                onChange={(e) => setSendDate(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="space-y-1.5 min-w-[16rem] flex-1 max-w-xl">
              <label htmlFor="naam" className={LABEL}>
                Naam
              </label>
              <Input
                id="naam"
                placeholder="PSV Kaartverkoop - Uitverkocht vak"
                maxLength={150}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={locked}
              />
            </div>
            <div className="space-y-1.5 w-44">
              <label htmlFor="dmid" className={LABEL}>
                DMID
              </label>
              <Input
                id="dmid"
                placeholder={defaultDmid(sendDate || today())}
                value={dmid}
                onChange={(e) => setDmid(e.target.value)}
                disabled={locked}
              />
            </div>
            <Button onClick={pushToMaileon} disabled={!canPush || locked}>
              {pushing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              Doorzetten naar Maileon
            </Button>
          </div>

          {!pushed && sendDate && title.trim() && (
            <p className="text-xs text-muted-foreground break-words">
              Naam van filter en doelgroep:{" "}
              {filterName({ sendDate, title, dmid: dmid.trim() || defaultDmid(sendDate) })}
            </p>
          )}
          {!summary && <p className="text-xs text-muted-foreground">Vul eerst hierboven een lijst in.</p>}
          {pushError && <Problem>{pushError}</Problem>}

          {pushed && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1">
                <p>
                  {pushed.targetGroupId
                    ? `Filter ${pushed.contactFilterId} en doelgroep ${pushed.targetGroupId} gemaakt: `
                    : `Filter ${pushed.contactFilterId} gemaakt: `}
                  <span className="font-medium break-words select-all">{pushed.name}</span>
                </p>
                <p className="text-muted-foreground">
                  {number.format(pushed.pushed)} {type.plural}, gefilterd op {pushed.field}
                </p>
                {pushed.targetGroupId && (
                  <p className="flex flex-wrap items-center gap-2 text-muted-foreground">
                    {groupStatus?.state === "uptodate" && groupStatus.countContacts !== null ? (
                      <span>
                        Maileon vond {number.format(groupStatus.countContacts)} contacten in de doelgroep, waarvan{" "}
                        {number.format(groupStatus.countActiveContacts ?? 0)} te mailen.
                      </span>
                    ) : polling ? (
                      <span className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Maileon rekent de doelgroep door…
                      </span>
                    ) : (
                      <span>Maileon is nog niet klaar met rekenen.</span>
                    )}
                    <button
                      type="button"
                      onClick={() => pushed.targetGroupId && loadGroupStatus(pushed.targetGroupId)}
                      className="underline underline-offset-2 hover:text-foreground"
                    >
                      Ververs
                    </button>
                  </p>
                )}
                {groupStatusError && (
                  <p className="text-xs text-muted-foreground">De stand van de doelgroep kwam niet door: {groupStatusError}</p>
                )}
              </div>
              {!pushed.targetGroupId && (
                <Problem>
                  Het filter staat in Maileon, maar de doelgroep niet
                  {pushed.targetGroupError ? ` (${pushed.targetGroupError})` : ""}. Maak de doelgroep zelf aan op dit
                  filter, met dezelfde naam.
                </Problem>
              )}
              <div className="space-y-2 rounded-md border border-primary/40 p-3">
                <p className="flex items-start gap-2 font-medium">
                  <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
                  Nog doen in Maileon, vóór je mailt
                </p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    <a
                      href={pushed.filterUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 underline underline-offset-2"
                    >
                      Open het filter in Maileon
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    .
                  </li>
                  <li>
                    Voeg onderaan de regel toe voor de preference die bij je mailing hoort, bijvoorbeeld{" "}
                    <span className="font-medium">Email › Ticketing = ja</span> voor kaartverkoop. De doelgroep is
                    gebaseerd op dit filter.
                  </li>
                  <li>
                    Controleer daarna het aantal contacten in de doelgroep. Minder contacten dan ID&apos;s is normaal:
                    niet iedereen staat in Maileon of heeft toestemming gegeven.
                  </li>
                </ol>
                <p className="text-xs text-muted-foreground">
                  De doelgroep staat al klaar om te mailen. Zonder stap 2 krijgen ook mensen die geen toestemming
                  gaven voor dit soort mail de mailing.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={startOver}>
                Nieuwe lijst
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
