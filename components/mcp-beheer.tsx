"use client";

import { useEffect, useRef, useState } from "react";
import { KeyRound, Loader2, Pencil, Play, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { PAGE_GROUPS } from "@/lib/access";
import {
  MCP_PAGES,
  TOOL_KIND_LABEL,
  canUseTool,
  slugify,
  toolKind,
  type McpAuth,
  type McpServerView,
  type McpTool,
  type ToolKind,
} from "@/lib/mcp/config";

/**
 * Beheer > MCP Servers: servers toevoegen, de verbinding testen, per tool
 * bepalen wat de assistent mag gebruiken en een tool proberen. De regels
 * (wat aan mag, hoe een URL eruitziet) staan in `lib/mcp/config.ts` en worden
 * door de API afgedwongen; deze pagina laat ze alleen zien.
 */

const PAGE_NAME = Object.fromEntries(MCP_PAGES.map((p) => [p.href, p.name])) as Record<string, string>;

const KIND_BADGE: Record<ToolKind, "success" | "warning" | "destructive"> = {
  leest: "success",
  onbekend: "warning",
  schrijft: "destructive",
};

const SELECT_CLASS =
  "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring";

function formatMoment(iso?: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleString("nl-NL", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

function authLabel(auth: McpAuth): string {
  if (auth.type === "geen") return "Geen";
  if (auth.type === "bearer") return `Bearer-token uit ${auth.envVar}`;
  return `${auth.header} uit ${auth.envVar}`;
}

interface Draft {
  id: string;
  idTouched: boolean;
  name: string;
  url: string;
  authType: McpAuth["type"];
  envVar: string;
  header: string;
  page: string;
  enabled: boolean;
}

const EMPTY_DRAFT: Draft = {
  id: "",
  idTouched: false,
  name: "",
  url: "",
  authType: "bearer",
  envVar: "MCP_",
  header: "",
  page: "",
  enabled: true,
};

function draftAuth(d: Draft): McpAuth {
  if (d.authType === "geen") return { type: "geen" };
  if (d.authType === "bearer") return { type: "bearer", envVar: d.envVar.trim() };
  return { type: "header", header: d.header.trim(), envVar: d.envVar.trim() };
}

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? "Er ging iets mis. Probeer het opnieuw.");
  return data as T;
}

/** Een voorbeeld-invoer uit het schema: de verplichte velden met een lege waarde. */
function exampleInput(schema: Record<string, unknown>): string {
  const properties = (schema.properties ?? {}) as Record<string, { type?: unknown }>;
  const required = Array.isArray(schema.required) ? (schema.required as string[]) : [];
  const empty: Record<string, unknown> = { string: "", number: 0, integer: 0, boolean: false, array: [], object: {} };
  const example = Object.fromEntries(
    required.map((name) => {
      const type = properties[name]?.type;
      return [name, typeof type === "string" && type in empty ? empty[type] : ""];
    })
  );
  return JSON.stringify(example, null, 2);
}

function ToolProberen({ server, tool }: { server: McpServerView; tool: McpTool }) {
  const [invoer, setInvoer] = useState(() => exampleInput(tool.inputSchema));
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);
  const [uitkomst, setUitkomst] = useState<{ text: string; isError: boolean; ms: number } | null>(null);

  async function voerUit() {
    setFout(null);
    setUitkomst(null);
    let parsed: unknown;
    try {
      parsed = invoer.trim() ? JSON.parse(invoer) : {};
    } catch {
      return setFout("De invoer is geen geldige JSON.");
    }
    setBezig(true);
    try {
      setUitkomst(
        await api("/api/beheer/mcp/proberen", {
          method: "POST",
          body: JSON.stringify({ id: server.id, tool: tool.name, invoer: parsed }),
        })
      );
    } catch (err) {
      setFout((err as Error).message);
    } finally {
      setBezig(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/40 p-3">
      <div className="form-group">
        <Label htmlFor={`invoer-${server.id}-${tool.name}`} className="form-label">
          Invoer (JSON)
        </Label>
        <Textarea
          id={`invoer-${server.id}-${tool.name}`}
          value={invoer}
          onChange={(e) => setInvoer(e.target.value)}
          className="min-h-[96px] font-mono text-xs"
          spellCheck={false}
        />
        <p className="form-hint">Dit roept de tool echt aan bij {server.name}, met de rechten van het token.</p>
      </div>
      <Button type="button" size="sm" onClick={voerUit} disabled={bezig}>
        {bezig ? <Loader2 className="animate-spin" /> : <Play />}
        Uitvoeren
      </Button>
      {fout && <div className="alert alert--error">{fout}</div>}
      {uitkomst && (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {uitkomst.isError ? "De server gaf een fout" : "Uitkomst"} na {uitkomst.ms} ms. Zo leest de assistent hem.
          </p>
          <pre
            className={cn(
              "max-h-80 overflow-auto whitespace-pre-wrap break-words rounded-md border bg-background p-3 text-xs",
              uitkomst.isError ? "border-error text-error" : "border-border"
            )}
          >
            {uitkomst.text}
          </pre>
        </div>
      )}
    </div>
  );
}

function ToolRij({
  server,
  tool,
  bezig,
  onToggle,
}: {
  server: McpServerView;
  tool: McpTool;
  bezig: boolean;
  onToggle: (tool: McpTool, enabled: boolean) => void;
}) {
  const [proberen, setProberen] = useState(false);
  const kind = toolKind(tool);
  const bruikbaar = canUseTool(tool);

  return (
    <li className="py-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <code className="break-all text-sm font-medium">{tool.name}</code>
            <Badge variant={KIND_BADGE[kind]}>{TOOL_KIND_LABEL[kind]}</Badge>
            {tool.isNew && <Badge variant="info">Nieuw</Badge>}
            {tool.changed && <Badge variant="warning">Gewijzigd</Badge>}
          </div>
          {tool.title && <p className="mt-0.5 text-sm">{tool.title}</p>}
          <details className="mt-1 text-sm text-muted-foreground">
            <summary className="cursor-pointer line-clamp-2">{tool.description || "Geen beschrijving."}</summary>
            <p className="mt-2 whitespace-pre-wrap">{tool.description}</p>
            <pre className="mt-2 max-h-60 overflow-auto rounded-md border border-border bg-muted/40 p-2 text-xs">
              {JSON.stringify(tool.inputSchema, null, 2)}
            </pre>
          </details>
          {tool.changed && (
            <p className="form-hint mt-1">
              De beschrijving of invoer is bij de leverancier veranderd. Lees hem opnieuw en zet hem weer aan als hij
              klopt.
            </p>
          )}
          {kind === "schrijft" && (
            <p className="form-hint mt-1">Deze tool kan iets aanmaken, wijzigen of verwijderen en kan niet aan.</p>
          )}
          {tool.confirmedBy && (
            <p className="form-hint mt-1">
              Alleen-lezen bevestigd door {tool.confirmedBy} op {formatMoment(tool.confirmedAt)}.
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label
            className={cn(
              "flex items-center gap-2 text-sm",
              kind === "schrijft" ? "cursor-not-allowed opacity-50" : "cursor-pointer"
            )}
          >
            <input
              type="checkbox"
              className="h-4 w-4 accent-primary"
              checked={tool.enabled && !tool.changed}
              disabled={kind === "schrijft" || bezig}
              onChange={(e) => onToggle(tool, e.target.checked)}
            />
            Aan
          </label>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={!bruikbaar}
            title={bruikbaar ? undefined : "Alleen tools die lezen kun je proberen."}
            onClick={() => setProberen((p) => !p)}
          >
            <Play />
            Proberen
          </Button>
        </div>
      </div>
      {proberen && bruikbaar && (
        <div className="mt-3">
          <ToolProberen server={server} tool={tool} />
        </div>
      )}
    </li>
  );
}

function ServerKaart({
  server,
  bezig,
  onSync,
  onEdit,
  onRemove,
  onToggle,
}: {
  server: McpServerView;
  bezig: string | null;
  onSync: () => void;
  onEdit: () => void;
  onRemove: () => void;
  onToggle: (tool: McpTool, enabled: boolean) => void;
}) {
  const aan = server.tools.filter((t) => t.enabled && !t.changed && canUseTool(t)).length;
  const sync = server.lastSync;

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-heading text-lg uppercase tracking-wide">{server.name}</h3>
            {!server.enabled ? (
              <Badge variant="secondary">Uit</Badge>
            ) : !sync ? (
              <Badge variant="outline">Niet getest</Badge>
            ) : sync.ok ? (
              <Badge variant="success">Verbonden</Badge>
            ) : (
              <Badge variant="destructive">Fout</Badge>
            )}
            {!server.authIsSet && <Badge variant="warning">Token ontbreekt</Badge>}
          </div>
          <p className="mt-1 break-all font-mono text-xs text-muted-foreground">{server.url}</p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <Button type="button" variant="outline" size="sm" onClick={onSync} disabled={bezig !== null}>
            {bezig === "sync" ? <Loader2 className="animate-spin" /> : <RefreshCw />}
            Verbinding testen
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label={`${server.name} bewerken`} onClick={onEdit}>
            <Pencil />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${server.name} verwijderen`}
            onClick={onRemove}
            disabled={bezig !== null}
          >
            <Trash2 />
          </Button>
        </div>
      </div>

      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="label font-heading uppercase tracking-wide">Id</dt>
          <dd className="font-mono text-xs">{server.id}</dd>
        </div>
        <div>
          <dt className="label font-heading uppercase tracking-wide">Pagina</dt>
          <dd>{PAGE_NAME[server.page] ?? server.page}</dd>
        </div>
        <div>
          <dt className="label font-heading uppercase tracking-wide">Inloggen</dt>
          <dd className="flex items-center gap-1.5">
            {server.auth.type !== "geen" && <KeyRound className="h-3.5 w-3.5 text-muted-foreground" />}
            <span className="break-all">{authLabel(server.auth)}</span>
          </dd>
        </div>
        <div>
          <dt className="label font-heading uppercase tracking-wide">Laatste test</dt>
          <dd>
            {sync ? (
              <>
                {formatMoment(sync.at)}
                {sync.ok && sync.ms !== undefined && <span className="text-muted-foreground"> · {sync.ms} ms</span>}
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {sync && !sync.ok && sync.error && <div className="alert alert--error mt-4">{sync.error}</div>}
      {sync?.ok && sync.serverName && (
        <p className="mt-3 text-xs text-muted-foreground">
          Server: {sync.serverName}
          {sync.serverVersion && ` ${sync.serverVersion}`}
          {sync.protocolVersion && ` · protocol ${sync.protocolVersion}`}
        </p>
      )}

      <div className="mt-5 border-t border-border pt-4">
        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
          <h4 className="font-heading text-sm uppercase tracking-wide">Tools</h4>
          {server.tools.length > 0 && (
            <span className="text-xs text-muted-foreground">
              {aan} van {server.tools.length} aan voor de assistent
            </span>
          )}
        </div>
        {server.tools.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {sync?.ok
              ? "Deze server biedt geen tools aan."
              : "Test de verbinding om de tools van deze server op te halen."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {server.tools.map((tool) => (
              <ToolRij key={tool.name} server={server} tool={tool} bezig={bezig !== null} onToggle={onToggle} />
            ))}
          </ul>
        )}
      </div>
    </Card>
  );
}

export function McpBeheer() {
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [busy, setBusy] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    api<{ servers: McpServerView[] }>("/api/beheer/mcp")
      .then((data) => setServers(data.servers))
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoading(false));
  }, []);

  function resetForm() {
    setDraft(EMPTY_DRAFT);
    setEditingId(null);
    setFormError(null);
  }

  function startEdit(server: McpServerView) {
    setDraft({
      id: server.id,
      idTouched: true,
      name: server.name,
      url: server.url,
      authType: server.auth.type,
      envVar: server.auth.type === "geen" ? "MCP_" : server.auth.envVar,
      header: server.auth.type === "header" ? server.auth.header : "",
      page: server.page,
      enabled: server.enabled,
    });
    setEditingId(server.id);
    setFormError(null);
    setNotice(null);
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    setNotice(null);
    const editing = servers.find((s) => s.id === editingId);
    if (editing && editing.url !== draft.url.trim() && editing.tools.length > 0) {
      if (!confirm("Een andere URL is een andere server. De tools en wat er aan staat worden gewist. Doorgaan?")) return;
    }
    setSaving(true);
    try {
      const data = await api<{ servers: McpServerView[] }>("/api/beheer/mcp", {
        method: "PUT",
        body: JSON.stringify({
          ...(editingId ? { editingId } : {}),
          id: draft.id,
          name: draft.name,
          url: draft.url,
          auth: draftAuth(draft),
          page: draft.page,
          enabled: draft.enabled,
        }),
      });
      setServers(data.servers);
      setNotice(
        editingId
          ? `${draft.name.trim()} is opgeslagen.`
          : `${draft.name.trim()} is toegevoegd. Test de verbinding om de tools op te halen.`
      );
      resetForm();
    } catch (err) {
      setFormError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function run(id: string, action: string, work: () => Promise<void>) {
    setBusy((b) => ({ ...b, [id]: action }));
    setNotice(null);
    setActionError(null);
    try {
      await work();
    } catch (err) {
      setActionError((err as Error).message);
    } finally {
      setBusy((b) => {
        const next = { ...b };
        delete next[id];
        return next;
      });
    }
  }

  function sync(server: McpServerView) {
    return run(server.id, "sync", async () => {
      const data = await api<{
        servers: McpServerView[];
        result: { ok: boolean; error?: string; tools?: number; added?: string[]; changed?: string[]; removed?: string[] };
      }>("/api/beheer/mcp/sync", { method: "POST", body: JSON.stringify({ id: server.id }) });
      setServers(data.servers);
      const r = data.result;
      if (!r.ok) {
        setActionError(`${server.name}: ${r.error ?? "verbinden is mislukt."}`);
        return;
      }
      const parts = [`${r.tools} tools`];
      if (r.added?.length) parts.push(`${r.added.length} nieuw (staan uit)`);
      if (r.changed?.length) parts.push(`${r.changed.length} gewijzigd (uitgezet)`);
      if (r.removed?.length) parts.push(`${r.removed.length} verdwenen`);
      setNotice(`${server.name} is bereikbaar: ${parts.join(", ")}.`);
    });
  }

  function remove(server: McpServerView) {
    if (!confirm(`${server.name} verwijderen? De assistent kan de tools van deze server dan niet meer gebruiken.`)) return;
    return run(server.id, "remove", async () => {
      const data = await api<{ servers: McpServerView[] }>(`/api/beheer/mcp?id=${encodeURIComponent(server.id)}`, {
        method: "DELETE",
      });
      setServers(data.servers);
      if (editingId === server.id) resetForm();
      setNotice(`${server.name} is verwijderd.`);
    });
  }

  function toggleTool(server: McpServerView, tool: McpTool, enabled: boolean) {
    let confirmRead = false;
    if (enabled && toolKind(tool) === "onbekend" && !tool.confirmedBy) {
      confirmRead = confirm(
        `${tool.name} zegt niet of hij alleen leest.\n\nHeb je gecontroleerd dat deze tool niets aanmaakt, wijzigt, verstuurt of verwijdert? Je naam komt bij de tool te staan.`
      );
      if (!confirmRead) return;
    }
    return run(server.id, "tool", async () => {
      const data = await api<{ servers: McpServerView[] }>("/api/beheer/mcp/tools", {
        method: "PATCH",
        body: JSON.stringify({ id: server.id, tool: tool.name, enabled, confirm: confirmRead }),
      });
      setServers(data.servers);
    });
  }

  const editing = editingId !== null;

  return (
    <div className="space-y-6">
      <div className="alert alert--info">
        Een MCP-server geeft de assistent extra tools, rechtstreeks van een leverancier. De assistent gebruikt alleen
        de tools die je hier aanzet, en alleen tools die lezen. Wie de gekoppelde pagina mag zien, krijgt de tools in de
        assistent. Een wijziging is binnen een halve minuut actief.
      </div>

      {/* Formulier */}
      <Card className="p-5 sm:p-6">
        <form ref={formRef} onSubmit={save} className="space-y-5 scroll-mt-6">
          <h2 className="font-heading text-xl uppercase tracking-wide">
            {editing ? "Server bewerken" : "Server toevoegen"}
          </h2>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <Label htmlFor="mcp-name" className="form-label">
                Naam
              </Label>
              <Input
                id="mcp-name"
                placeholder="Google Analytics"
                value={draft.name}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    name: e.target.value,
                    id: d.idTouched ? d.id : slugify(e.target.value),
                  }))
                }
              />
            </div>
            <div className="form-group">
              <Label htmlFor="mcp-id" className="form-label">
                Id
              </Label>
              <Input
                id="mcp-id"
                placeholder="googleanalytics"
                value={draft.id}
                disabled={editing}
                onChange={(e) => setDraft((d) => ({ ...d, id: e.target.value.toLowerCase(), idTouched: true }))}
                className="font-mono"
              />
              <p className="form-hint">
                Kleine letters en cijfers. Staat in de toolnamen en is na het opslaan niet meer te wijzigen.
              </p>
            </div>
          </div>

          <div className="form-group">
            <Label htmlFor="mcp-url" className="form-label">
              URL
            </Label>
            <Input
              id="mcp-url"
              type="url"
              placeholder="https://mcp.example.com/mcp"
              value={draft.url}
              onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
              className="font-mono"
            />
            <p className="form-hint">Het Streamable HTTP-adres van de server. Alleen https.</p>
          </div>

          <fieldset>
            <legend className="label mb-2 font-heading uppercase tracking-wide">Inloggen</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {(
                [
                  { value: "bearer", label: "Bearer-token", description: "Authorization: Bearer <token>" },
                  { value: "header", label: "Eigen header", description: "Bijvoorbeeld X-Api-Key: <token>" },
                  { value: "geen", label: "Geen", description: "Een openbare server" },
                ] as const
              ).map((option) => (
                <label
                  key={option.value}
                  className={cn(
                    "flex cursor-pointer flex-col gap-1 rounded-md border p-3 transition-colors",
                    draft.authType === option.value
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="radio"
                      name="mcp-auth"
                      value={option.value}
                      checked={draft.authType === option.value}
                      onChange={() => setDraft((d) => ({ ...d, authType: option.value }))}
                      className="h-4 w-4 accent-primary"
                    />
                    <span className="font-heading text-sm uppercase tracking-wide">{option.label}</span>
                  </span>
                  <span className="text-xs text-muted-foreground">{option.description}</span>
                </label>
              ))}
            </div>
          </fieldset>

          {draft.authType !== "geen" && (
            <div className="grid gap-4 sm:grid-cols-2">
              {draft.authType === "header" && (
                <div className="form-group">
                  <Label htmlFor="mcp-header" className="form-label">
                    Header
                  </Label>
                  <Input
                    id="mcp-header"
                    placeholder="X-Api-Key"
                    value={draft.header}
                    onChange={(e) => setDraft((d) => ({ ...d, header: e.target.value }))}
                    className="font-mono"
                  />
                </div>
              )}
              <div className="form-group">
                <Label htmlFor="mcp-env" className="form-label">
                  Omgevingsvariabele
                </Label>
                <Input
                  id="mcp-env"
                  placeholder="MCP_GA_TOKEN"
                  value={draft.envVar}
                  onChange={(e) => setDraft((d) => ({ ...d, envVar: e.target.value.toUpperCase() }))}
                  className="font-mono"
                />
                <p className="form-hint">
                  Zet het token in Vercel onder deze naam; hij begint met MCP_. Het token zelf komt nooit in PSV Tools
                  te staan.
                </p>
              </div>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="form-group">
              <Label htmlFor="mcp-page" className="form-label">
                Hoort bij pagina
              </Label>
              <select
                id="mcp-page"
                value={draft.page}
                onChange={(e) => setDraft((d) => ({ ...d, page: e.target.value }))}
                className={SELECT_CLASS}
              >
                <option value="">Kies een pagina</option>
                {PAGE_GROUPS.map((group) => (
                  <optgroup key={group.title} label={group.title}>
                    {group.pages.map((page) => (
                      <option key={page.href} value={page.href}>
                        {page.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              <p className="form-hint">Wie deze pagina mag zien, krijgt de tools in de assistent.</p>
            </div>
            <div className="form-group">
              <span className="form-label">Status</span>
              <label className="flex h-10 items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-primary"
                  checked={draft.enabled}
                  onChange={(e) => setDraft((d) => ({ ...d, enabled: e.target.checked }))}
                />
                Aan: de assistent gebruikt de tools die aan staan
              </label>
            </div>
          </div>

          {formError && <p className="form-error">{formError}</p>}

          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="animate-spin" />}
              Opslaan
            </Button>
            {(editing || draft.name || draft.url) && (
              <Button type="button" variant="ghost" onClick={resetForm}>
                Annuleren
              </Button>
            )}
          </div>
        </form>
      </Card>

      {notice && <div className="alert alert--success">{notice}</div>}
      {actionError && <div className="alert alert--error">{actionError}</div>}

      {/* Servers */}
      <div className="space-y-4">
        <h2 className="font-heading text-xl uppercase tracking-wide">Servers</h2>
        {loading ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Laden…
          </p>
        ) : loadError ? (
          <div className="alert alert--error">{loadError}</div>
        ) : servers.length === 0 ? (
          <Card className="p-6 text-center text-sm text-muted-foreground">
            Nog geen MCP-servers. Voeg hierboven de eerste toe.
          </Card>
        ) : (
          servers.map((server) => (
            <ServerKaart
              key={server.id}
              server={server}
              bezig={busy[server.id] ?? null}
              onSync={() => sync(server)}
              onEdit={() => startEdit(server)}
              onRemove={() => remove(server)}
              onToggle={(tool, enabled) => toggleTool(server, tool, enabled)}
            />
          ))
        )}
      </div>
    </div>
  );
}
