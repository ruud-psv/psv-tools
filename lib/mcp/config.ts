import { PAGE_GROUPS } from "@/lib/access";

/**
 * MCP-servers voor de assistent: welke servers er zijn, welke tools daarvan aan
 * staan en wie ze krijgt. Puur (geen opslag, geen netwerk), zodat de
 * beheer-API, de assistent en de tests dezelfde regels gebruiken.
 *
 * De afspraken:
 * - Een server hoort bij een pagina van PSV Tools. Wie die pagina mag zien,
 *   krijgt de tools van de server in de assistent; net als bij de eigen tools.
 * - Alleen tools die lezen kunnen aan. Een tool die zegt dat hij schrijft kan
 *   nooit aan; een tool die niets zegt alleen als een admin bevestigt dat hij
 *   alleen leest.
 * - Het model krijgt de beschrijving en het schema zoals een admin ze bij het
 *   synchroniseren zag, niet wat de server op dat moment zegt. Verandert een
 *   tool bij de leverancier, dan gaat hij uit tot een admin hem opnieuw aanzet.
 * - Een token staat nooit in de opslag: de server verwijst naar een
 *   omgevingsvariabele die met `MCP_` begint, of naar een bestaand token van
 *   PSV Tools uit `SHARED_TOKENS`, en dan alleen bij de partij van dat token.
 */

export type McpAuth =
  | { type: "geen" }
  | { type: "bearer"; envVar: string }
  | { type: "header"; header: string; envVar: string };

export interface McpToolAnnotations {
  title?: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

/** Een tool zoals de server hem beschreef bij het synchroniseren. */
export interface McpToolSnapshot {
  /** De naam bij de server. */
  name: string;
  title?: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: McpToolAnnotations;
}

export interface McpTool extends McpToolSnapshot {
  enabled: boolean;
  /** Bij een tool die niet zegt of hij leest: de admin die bevestigde dat hij alleen leest. */
  confirmedBy?: string;
  confirmedAt?: string;
  /** Kwam erbij na de eerste synchronisatie; nog niet bekeken. */
  isNew?: boolean;
  /** Beschrijving, schema of annotaties zijn veranderd; daarom uitgezet. */
  changed?: boolean;
}

export interface McpSync {
  at: string;
  ok: boolean;
  error?: string;
  serverName?: string;
  serverVersion?: string;
  protocolVersion?: string;
  ms?: number;
}

export interface McpServer {
  /** Kort en vast: zit in de toolnamen, dus niet meer te wijzigen. */
  id: string;
  name: string;
  /** Streamable HTTP-endpoint van de server. */
  url: string;
  auth: McpAuth;
  /** De pagina waar de server bij hoort; bepaalt wie de tools krijgt. */
  page: string;
  enabled: boolean;
  tools: McpTool[];
  lastSync?: McpSync;
  createdAt?: string;
  updatedAt?: string;
  updatedBy?: string;
}

export type ToolKind = "leest" | "onbekend" | "schrijft";

export const TOOL_KIND_LABEL: Record<ToolKind, string> = {
  leest: "Leest",
  onbekend: "Onbekend",
  schrijft: "Schrijft",
};

/** De pagina's waar een server bij kan horen: dezelfde als in Beheer > Gebruikers. */
export const MCP_PAGES = PAGE_GROUPS.flatMap((g) => g.pages);

const ID = /^[a-z][a-z0-9]{1,23}$/;
const ENV_VAR = /^MCP_[A-Z0-9_]{1,60}$/;
const HEADER = /^[A-Za-z0-9-]{1,64}$/;
/** Headers die het transport zelf zet of die niets met inloggen te maken hebben. */
const RESERVED_HEADERS = new Set([
  "accept",
  "connection",
  "content-length",
  "content-type",
  "cookie",
  "host",
  "last-event-id",
  "mcp-protocol-version",
  "mcp-session-id",
  "transfer-encoding",
]);
/** Zo lang mag een toolnaam voor het model zijn. */
const MAX_MODEL_NAME = 64;
export const MODEL_NAME_PREFIX = "mcp_";

/* ---------- Tools ---------- */

/**
 * Wat een tool over zichzelf zegt. De annotaties zijn hints van de server: een
 * tool die zegt dat hij schrijft of iets kan verwijderen gaat nooit aan; een
 * tool die niets zegt is onbekend.
 */
export function toolKind(tool: Pick<McpToolSnapshot, "annotations">): ToolKind {
  const a = tool.annotations ?? {};
  if (a.destructiveHint === true || a.readOnlyHint === false) return "schrijft";
  if (a.readOnlyHint === true) return "leest";
  return "onbekend";
}

/** Mag deze tool aan (of in het beheer geprobeerd worden)? */
export function canUseTool(tool: McpTool): boolean {
  const kind = toolKind(tool);
  return kind === "leest" || (kind === "onbekend" && Boolean(tool.confirmedBy));
}

/** De tools die de assistent van deze server krijgt. */
export function activeTools(server: McpServer): McpTool[] {
  if (!server.enabled) return [];
  return server.tools.filter((t) => t.enabled && !t.changed && canUseTool(t));
}

/** JSON met gesorteerde sleutels, zodat dezelfde inhoud altijd dezelfde tekst geeft. */
export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

/** Alles van een tool waar het model of de rechten op leunen. */
export function toolFingerprint(tool: McpToolSnapshot): string {
  return stableStringify({
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: tool.annotations,
  });
}

export interface ToolMerge {
  tools: McpTool[];
  added: string[];
  changed: string[];
  removed: string[];
}

/**
 * Legt de tools van de server naast wat er was opgeslagen. Ongewijzigd blijft
 * zoals het was; nieuw komt erbij en staat uit; gewijzigd krijgt de nieuwe
 * beschrijving, staat uit en verliest een bevestiging; verdwenen valt weg.
 */
export function mergeTools(stored: McpTool[], live: McpToolSnapshot[]): ToolMerge {
  const firstSync = stored.length === 0;
  const byName = new Map(stored.map((t) => [t.name, t]));
  const liveNames = new Set(live.map((t) => t.name));
  const result: ToolMerge = { tools: [], added: [], changed: [], removed: [] };

  for (const snapshot of live) {
    const previous = byName.get(snapshot.name);
    if (!previous) {
      result.tools.push({ ...snapshot, enabled: false, ...(firstSync ? {} : { isNew: true }) });
      if (!firstSync) result.added.push(snapshot.name);
    } else if (toolFingerprint(previous) === toolFingerprint(snapshot)) {
      result.tools.push(previous);
    } else {
      result.tools.push({ ...snapshot, enabled: false, changed: true });
      result.changed.push(snapshot.name);
    }
  }
  result.removed = stored.filter((t) => !liveNames.has(t.name)).map((t) => t.name);
  return result;
}

/** Zet één tool aan of uit. Aanzetten mag alleen als hij leest of bevestigd is. */
export function setToolEnabled(
  server: McpServer,
  toolName: string,
  enabled: boolean,
  options: { confirm?: boolean; by: string; at: string }
): { server: McpServer } | { error: string } {
  const tool = server.tools.find((t) => t.name === toolName);
  if (!tool) return { error: "Deze tool bestaat niet (meer). Synchroniseer de server opnieuw." };

  let next: McpTool = { ...tool, enabled, isNew: undefined, changed: undefined };
  if (enabled) {
    const kind = toolKind(tool);
    if (kind === "schrijft") {
      return { error: "Deze tool kan iets aanmaken, wijzigen of verwijderen. De assistent mag alleen lezen." };
    }
    if (kind === "onbekend" && !tool.confirmedBy) {
      if (!options.confirm) {
        return { error: "Deze tool zegt niet of hij alleen leest. Bevestig dat eerst." };
      }
      next = { ...next, confirmedBy: options.by, confirmedAt: options.at };
    }
  }
  return { server: { ...server, tools: server.tools.map((t) => (t.name === toolName ? next : t)) } };
}

/* ---------- Toolnamen voor het model ---------- */

/** Korte, vaste hash (FNV-1a) om afgekapte of botsende namen uniek te maken. */
function shortHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).padStart(7, "0").slice(0, 7);
}

/**
 * De namen waaronder het model de tools van een server krijgt:
 * `mcp_<server>_<tool>`, met alleen tekens die de API toestaat en hooguit 64
 * lang. Dezelfde invoer geeft altijd dezelfde naam, zodat de bronnen van een
 * eerder gesprek terug te vinden zijn.
 */
export function modelToolNames(serverId: string, toolNames: string[]): Map<string, string> {
  const result = new Map<string, string>();
  const used = new Set<string>();
  for (const toolName of [...toolNames].sort()) {
    const clean = toolName.replace(/[^a-zA-Z0-9_-]/g, "_");
    let name = `${MODEL_NAME_PREFIX}${serverId}_${clean}`;
    // Aangepast of te lang: een hash van de echte naam houdt hem uniek.
    if (clean !== toolName || name.length > MAX_MODEL_NAME || used.has(name)) {
      const suffix = `_${shortHash(toolName)}`;
      name = name.slice(0, MAX_MODEL_NAME - suffix.length) + suffix;
    }
    used.add(name);
    result.set(toolName, name);
  }
  return result;
}

/** Label en pagina per toolnaam, voor de bronnen onder een antwoord. */
export function mcpSources(servers: McpServer[]): Record<string, { naam: string; label: string; href: string }> {
  const sources: Record<string, { naam: string; label: string; href: string }> = {};
  for (const server of servers) {
    const names = modelToolNames(server.id, server.tools.map((t) => t.name));
    for (const tool of server.tools) {
      const naam = names.get(tool.name)!;
      sources[naam] = { naam, label: `${server.name} · ${tool.title ?? tool.name}`, href: server.page };
    }
  }
  return sources;
}

/* ---------- Invoer van de beheerpagina ---------- */

export function slugify(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .replace(/^[0-9]+/, "")
    .slice(0, 24);
  return slug.length >= 2 ? slug : "";
}

const PRIVATE_HOST = /^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

/** Een geldige server-URL, of een melding. Alleen https en een gewone hostnaam. */
export function checkServerUrl(raw: string): { url: string } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return { error: "Vul een volledige URL in, zoals https://mcp.example.com/mcp." };
  }
  if (url.protocol !== "https:") return { error: "De URL moet met https:// beginnen." };
  if (url.username || url.password) return { error: "Zet geen inloggegevens in de URL; gebruik een omgevingsvariabele." };
  const host = url.hostname;
  if (PRIVATE_HOST.test(host) || IPV4.test(host) || host.startsWith("[")) {
    return { error: "Gebruik de hostnaam van de server, geen IP-adres of intern adres." };
  }
  url.hash = "";
  return { url: url.toString() };
}

/**
 * Bestaande tokens van PSV Tools die een MCP-server ook mag gebruiken, zodat
 * zo'n token op één plek staat. Alleen naar de domeinen van de partij die het
 * token al krijgt: Paid Ads stuurt `META_ADS_ACCESS_TOKEN` al naar Meta.
 */
export const SHARED_TOKENS: { envVar: string; domains: string[]; owner: string }[] = [
  { envVar: "META_ADS_ACCESS_TOKEN", domains: ["facebook.com", "meta.com"], owner: "Meta" },
];

function onDomain(host: string, domain: string): boolean {
  return host === domain || host.endsWith(`.${domain}`);
}

/**
 * Mag dit token naar deze server? Een `MCP_`-variabele overal heen, een
 * gedeeld token alleen naar de domeinen van zijn eigen partij.
 */
export function tokenAllowedFor(envVar: string, url: string): boolean {
  if (ENV_VAR.test(envVar)) return true;
  const shared = SHARED_TOKENS.find((t) => t.envVar === envVar);
  if (!shared) return false;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return shared.domains.some((domain) => onDomain(host, domain));
}

function checkAuth(input: unknown, url: string): { auth: McpAuth } | { error: string } {
  const raw = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  if (raw.type === "geen" || raw.type === undefined) return { auth: { type: "geen" } };
  if (raw.type !== "bearer" && raw.type !== "header") return { error: "Kies hoe PSV Tools inlogt bij de server." };

  const envVar = typeof raw.envVar === "string" ? raw.envVar.trim() : "";
  const shared = SHARED_TOKENS.find((t) => t.envVar === envVar);
  if (shared && !tokenAllowedFor(envVar, url)) {
    return { error: `${envVar} mag alleen naar servers van ${shared.owner} (${shared.domains.join(" of ")}).` };
  }
  if (!shared && !ENV_VAR.test(envVar)) {
    return {
      error: `De omgevingsvariabele moet met MCP_ beginnen en mag alleen hoofdletters, cijfers en _ bevatten, bijvoorbeeld MCP_GA_TOKEN. Bestaande tokens die ook mogen: ${SHARED_TOKENS.map(
        (t) => `${t.envVar} (alleen voor ${t.owner})`
      ).join(", ")}.`,
    };
  }
  if (raw.type === "bearer") return { auth: { type: "bearer", envVar } };

  const header = typeof raw.header === "string" ? raw.header.trim() : "";
  if (!HEADER.test(header)) return { error: "Vul een geldige headernaam in, zoals X-Api-Key." };
  if (RESERVED_HEADERS.has(header.toLowerCase())) return { error: `De header ${header} kan niet voor het inloggen worden gebruikt.` };
  return { auth: { type: "header", header, envVar } };
}

export type McpServerInput = Pick<McpServer, "id" | "name" | "url" | "auth" | "page" | "enabled">;

/**
 * Controleert een server zoals hij uit het formulier komt. Bij een bestaande
 * server blijft het id staan; bij een nieuwe mag het nog niet bestaan.
 */
export function sanitizeServerInput(
  input: unknown,
  existing: McpServer[],
  editingId?: string
): { server: McpServerInput } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Ongeldige invoer." };
  const raw = input as Record<string, unknown>;

  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (name.length < 2 || name.length > 60) return { error: "Geef de server een naam van 2 tot 60 tekens." };

  let id: string;
  if (editingId) {
    if (!existing.some((s) => s.id === editingId)) return { error: "Deze server bestaat niet (meer)." };
    id = editingId;
  } else {
    id = typeof raw.id === "string" ? raw.id.trim() : "";
    if (!ID.test(id)) {
      return { error: "Het id is 2 tot 24 kleine letters of cijfers en begint met een letter, bijvoorbeeld googleanalytics." };
    }
    if (existing.some((s) => s.id === id)) return { error: `Er is al een server met het id ${id}.` };
  }

  const url = checkServerUrl(typeof raw.url === "string" ? raw.url : "");
  if ("error" in url) return url;

  const auth = checkAuth(raw.auth, url.url);
  if ("error" in auth) return auth;

  const page = typeof raw.page === "string" ? raw.page : "";
  if (!MCP_PAGES.some((p) => p.href === page)) return { error: "Kies de pagina waar deze server bij hoort." };

  return { server: { id, name, url: url.url, auth: auth.auth, page, enabled: raw.enabled !== false } };
}

/* ---------- Aanroepen ---------- */

type JsonSchema = Record<string, unknown>;

function matchesType(value: unknown, type: string): boolean {
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "boolean":
      return typeof value === "boolean";
    case "array":
      return Array.isArray(value);
    case "object":
      return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    case "null":
      return value === null;
    default:
      return true;
  }
}

/**
 * Een eerste controle van wat het model als invoer meegaf: een object, de
 * verplichte velden, geen onbekende velden als het schema dat verbiedt, en de
 * eenvoudige types op het hoogste niveau. De server controleert de rest zelf.
 */
export function checkToolInput(
  schema: JsonSchema,
  input: unknown
): { input: Record<string, unknown> } | { error: string } {
  const value = input ?? {};
  if (typeof value !== "object" || Array.isArray(value)) return { error: "De invoer moet een object zijn." };
  const fields = value as Record<string, unknown>;
  const properties = (schema.properties && typeof schema.properties === "object" ? schema.properties : {}) as Record<
    string,
    JsonSchema
  >;
  const required = Array.isArray(schema.required) ? schema.required.filter((r): r is string => typeof r === "string") : [];

  for (const name of required) {
    if (fields[name] === undefined || fields[name] === null) return { error: `Het veld "${name}" ontbreekt.` };
  }
  for (const [name, fieldValue] of Object.entries(fields)) {
    const field = properties[name];
    if (!field) {
      if (schema.additionalProperties === false) return { error: `Het veld "${name}" bestaat niet voor deze tool.` };
      continue;
    }
    const types = typeof field.type === "string" ? [field.type] : Array.isArray(field.type) ? field.type : [];
    if (types.length > 0 && !types.some((t) => typeof t === "string" && matchesType(fieldValue, t))) {
      return { error: `Het veld "${name}" moet van het type ${types.join(" of ")} zijn.` };
    }
    if (Array.isArray(field.enum) && !field.enum.some((option) => stableStringify(option) === stableStringify(fieldValue))) {
      return { error: `Het veld "${name}" moet een van deze waarden zijn: ${field.enum.map((o) => JSON.stringify(o)).join(", ")}.` };
    }
  }
  return { input: fields };
}

/** Het schema zoals het model het krijgt: altijd een object. */
export function modelInputSchema(schema: JsonSchema): { type: "object"; [key: string]: unknown } {
  const rest = { ...schema };
  delete rest.$schema;
  return { ...rest, type: "object" };
}

interface ContentBlock {
  type: string;
  text?: string;
  mimeType?: string;
  uri?: string;
  name?: string;
  resource?: { uri?: string; text?: string; mimeType?: string; blob?: string };
}

/** Zoveel tekens uit één aanroep gaan naar het model. */
export const MAX_RESULT_CHARS = 60_000;

/**
 * Maakt van de uitkomst van een tool tekst voor het model. Afbeeldingen, geluid
 * en bestanden gaan niet mee; een te lange uitkomst wordt afgekapt met een
 * melding, zodat het model om minder data kan vragen.
 */
export function resultText(
  result: { content?: unknown; structuredContent?: unknown },
  maxChars = MAX_RESULT_CHARS
): string {
  const blocks = Array.isArray(result.content) ? (result.content as ContentBlock[]) : [];
  const parts: string[] = [];
  let hasText = false;
  for (const block of blocks) {
    if (block.type === "text" && typeof block.text === "string") {
      parts.push(block.text);
      hasText = true;
    } else if (block.type === "resource" && typeof block.resource?.text === "string") {
      parts.push(block.resource.text);
      hasText = true;
    } else if (block.type === "resource") {
      parts.push(block.resource?.uri ? `[bestand weggelaten: ${block.resource.uri}]` : "[bestand weggelaten]");
    } else if (block.type === "resource_link") {
      parts.push(`[link: ${[block.name, block.uri].filter(Boolean).join(" ")}]`);
    } else if (block.type === "image") {
      parts.push("[afbeelding weggelaten]");
    } else if (block.type === "audio") {
      parts.push("[geluid weggelaten]");
    }
  }
  // Servers met een outputSchema zetten de data soms alleen in structuredContent.
  if (!hasText && result.structuredContent !== undefined) {
    parts.unshift(JSON.stringify(result.structuredContent));
  }
  const text = parts.join("\n\n").trim() || "De tool gaf geen uitkomst terug.";
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n[Afgekapt: de uitkomst was ${text.length} tekens. Vraag minder data op, bijvoorbeeld een kortere periode of minder velden.]`;
}

/* ---------- Beheer ---------- */

/** Een server zoals de beheerpagina hem krijgt: met of het token gezet is, nooit het token zelf. */
export type McpServerView = McpServer & { authIsSet: boolean };
