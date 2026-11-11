/**
 * Leest de API-beschrijving van Playable (`https://api.playable.com/openapi.yaml`)
 * uit: welke rechten (OAuth-scopes) er bestaan en welke endpoints er zijn, met
 * per endpoint de rechten die erbij horen.
 *
 * Er zit geen YAML-bibliotheek in dit project en voor één testpagina is er geen
 * nodig: een OpenAPI-bestand is regelmatig genoeg om op inspringing te lezen.
 * Is het bestand toch JSON, dan lezen we het als JSON.
 */

export const SPEC_URL = "https://api.playable.com/openapi.yaml";

/** Alleen hierheen sturen we ooit een token. */
export const PLAYABLE_HOST = "api.playable.com";

const METHODS = ["get", "put", "post", "patch", "delete", "head", "options"] as const;
export type HttpMethod = (typeof METHODS)[number];

export interface SpecScope {
  name: string;
  description: string;
}

export interface SpecOperation {
  method: HttpMethod;
  path: string;
  summary: string;
  /** De rechten die bij dit endpoint horen, voor zover de beschrijving ze noemt. */
  scopes: string[];
  /**
   * Het stuk van de beschrijving over dit endpoint, met de schema's waar het
   * naar verwijst (`$ref`). Daar staat welke velden je mag meesturen en wat
   * er terugkomt.
   */
  source?: string;
}

export interface ParsedSpec {
  scopes: SpecScope[];
  operations: SpecOperation[];
  /** De `servers`-adressen uit de beschrijving. */
  servers: string[];
}

/**
 * Rechten waarvan we zeker weten dat ze bestaan: de eerste twee gebruikt PSV
 * Tools al, de rest staat in de API-beschrijving. Valt het bestand niet te
 * lezen, dan testen we in elk geval deze.
 */
export const KNOWN_SCOPES = [
  "campaigns.list",
  "campaigns.view",
  "campaigns.sections.list",
  "campaigns.sections.view",
  "campaigns.copy",
  "campaigns.modify",
  "campaigns.pause",
  "campaigns.resume",
];

const SCOPE_NAME = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/i;

function unquote(s: string): string {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

function indentOf(line: string): number {
  return line.length - line.trimStart().length;
}

/** Lege regels en commentaar tellen niet mee voor de inspringing. */
function isContent(line: string): boolean {
  const t = line.trim();
  return t !== "" && !t.startsWith("#");
}

/** `sleutel: waarde` → [sleutel, waarde]; `null` als de regel geen sleutel is. */
function keyValue(line: string): [string, string] | null {
  const t = line.trim();
  if (t.startsWith("- ")) return null;
  const m = t.match(/^('[^']*'|"[^"]*"|[^:'"\s][^:]*?):(?:\s+(.*))?$/);
  if (!m) return null;
  return [unquote(m[1]), (m[2] ?? "").trim()];
}

function uniq<T>(items: T[]): T[] {
  return [...new Set(items)];
}

/* ---------- YAML, op inspringing ---------- */

/** De kinderen van een sleutel: regels die dieper inspringen, tot de volgende op hetzelfde niveau. */
function blockAfter(lines: string[], start: number): { from: number; to: number } {
  const own = indentOf(lines[start]);
  let to = start + 1;
  while (to < lines.length && (!isContent(lines[to]) || indentOf(lines[to]) > own)) to++;
  return { from: start + 1, to };
}

/** De inspringing van het eerste kind in een blok, of -1 als het blok leeg is. */
function childIndent(lines: string[], from: number, to: number): number {
  for (let i = from; i < to; i++) if (isContent(lines[i])) return indentOf(lines[i]);
  return -1;
}

function parseScopesYaml(lines: string[]): SpecScope[] {
  const scopes: SpecScope[] = [];
  lines.forEach((line, i) => {
    const kv = keyValue(line);
    if (!kv || kv[0] !== "scopes" || kv[1] !== "") return;
    const { from, to } = blockAfter(lines, i);
    const level = childIndent(lines, from, to);
    for (let j = from; j < to; j++) {
      if (!isContent(lines[j]) || indentOf(lines[j]) !== level) continue;
      const scope = keyValue(lines[j]);
      if (scope && SCOPE_NAME.test(scope[0])) {
        scopes.push({ name: scope[0], description: unquote(scope[1]) });
      }
    }
  });
  const seen = new Set<string>();
  return scopes.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true)));
}

/* ---------- De bron van een endpoint, met zijn schema's ---------- */

const MAX_SOURCE_CHARS = 12_000;
const MAX_REF_DEPTH = 3;

/** Haalt de gemeenschappelijke inspringing weg. */
function dedent(block: string[]): string {
  const indents = block.filter(isContent).map(indentOf);
  const min = indents.length > 0 ? Math.min(...indents) : 0;
  return block.map((l) => l.slice(Math.min(min, indentOf(l)))).join("\n").trimEnd();
}

/** Alle onderdelen onder `components`, op hun `$ref`-adres: `#/components/schemas/Campaign` → tekst. */
function componentBlocks(lines: string[]): Map<string, string> {
  const blocks = new Map<string, string>();
  const start = lines.findIndex((l) => indentOf(l) === 0 && keyValue(l)?.[0] === "components");
  if (start < 0) return blocks;
  const comp = blockAfter(lines, start);
  const kindLevel = childIndent(lines, comp.from, comp.to);
  for (let i = comp.from; i < comp.to; i++) {
    if (!isContent(lines[i]) || indentOf(lines[i]) !== kindLevel) continue;
    const kind = keyValue(lines[i])?.[0];
    if (!kind) continue;
    const kindBlock = blockAfter(lines, i);
    const nameLevel = childIndent(lines, kindBlock.from, kindBlock.to);
    for (let j = kindBlock.from; j < kindBlock.to; j++) {
      if (!isContent(lines[j]) || indentOf(lines[j]) !== nameLevel) continue;
      const name = keyValue(lines[j])?.[0];
      if (!name) continue;
      const own = blockAfter(lines, j);
      blocks.set(`#/components/${kind}/${name}`, dedent(lines.slice(j, own.to)));
    }
  }
  return blocks;
}

/** De tekst van een endpoint plus de onderdelen waar hij (ook indirect) naar verwijst. */
function withRefs(text: string, components: Map<string, string>): string {
  const parts = [text];
  const seen = new Set<string>();
  let frontier = [text];
  for (let depth = 0; depth < MAX_REF_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const chunk of frontier) {
      for (const m of chunk.matchAll(/\$ref:\s*['"]?(#\/components\/[^'"\s]+)/g)) {
        const ref = m[1];
        if (seen.has(ref)) continue;
        seen.add(ref);
        const block = components.get(ref);
        if (!block) continue;
        parts.push(`# ${ref}\n${block}`);
        next.push(block);
      }
    }
    frontier = next;
  }
  const source = parts.join("\n\n");
  return source.length > MAX_SOURCE_CHARS ? `${source.slice(0, MAX_SOURCE_CHARS)}\n# … ingekort` : source;
}

function parseOperationsYaml(lines: string[], knownScopes: string[]): SpecOperation[] {
  const pathsLine = lines.findIndex((l) => indentOf(l) === 0 && keyValue(l)?.[0] === "paths");
  if (pathsLine < 0) return [];
  const components = componentBlocks(lines);

  const operations: SpecOperation[] = [];
  const { from, to } = blockAfter(lines, pathsLine);
  const pathLevel = childIndent(lines, from, to);

  for (let i = from; i < to; i++) {
    if (!isContent(lines[i]) || indentOf(lines[i]) !== pathLevel) continue;
    const pathKey = keyValue(lines[i]);
    if (!pathKey || !pathKey[0].startsWith("/")) continue;

    const pathBlock = blockAfter(lines, i);
    const methodLevel = childIndent(lines, pathBlock.from, pathBlock.to);

    for (let j = pathBlock.from; j < pathBlock.to; j++) {
      if (!isContent(lines[j]) || indentOf(lines[j]) !== methodLevel) continue;
      const methodKey = keyValue(lines[j]);
      const method = methodKey?.[0].toLowerCase() as HttpMethod | undefined;
      if (!method || !METHODS.includes(method)) continue;

      const opBlock = blockAfter(lines, j);
      const body = lines.slice(opBlock.from, opBlock.to);

      let summary = "";
      for (const line of body) {
        const kv = keyValue(line);
        if (kv && (kv[0] === "summary" || (kv[0] === "operationId" && !summary)) && kv[1]) {
          summary = unquote(kv[1]);
          if (kv[0] === "summary") break;
        }
      }

      operations.push({
        method,
        path: pathKey[0],
        summary,
        scopes: scopesInText(body.join("\n"), knownScopes),
        source: withRefs(dedent(lines.slice(j, opBlock.to)), components),
      });
    }
  }
  return operations;
}

/** Rechten die in een stuk tekst genoemd worden: bekende namen, plus losse `- naam.recht`-regels. */
function scopesInText(text: string, knownScopes: string[]): string[] {
  const found = knownScopes.filter((s) =>
    // Na de naam mag een punt staan als die een zin afsluit: "… of campaigns.copy."
    new RegExp(`(^|[^a-z0-9_.-])${s.replace(/\./g, "\\.")}($|[^a-z0-9_.-]|\\.(?![a-z0-9_-]))`, "i").test(text)
  );
  for (const m of text.matchAll(/^\s*-\s*['"]?([a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+)['"]?\s*$/gim)) {
    found.push(m[1]);
  }
  return uniq(found);
}

/** Alleen het `servers`-blok bovenaan; andere `url:`-sleutels (zoals bij documentatie) tellen niet. */
function parseServersYaml(lines: string[]): string[] {
  const start = lines.findIndex((l) => indentOf(l) === 0 && keyValue(l)?.[0] === "servers");
  if (start < 0) return [];
  const { from, to } = blockAfter(lines, start);
  const urls: string[] = [];
  for (let i = from; i < to; i++) {
    const m = lines[i].match(/^\s*-?\s*url:\s*['"]?(https?:\/\/[^\s'"]+)/i);
    if (m) urls.push(m[1]);
  }
  return uniq(urls);
}

/* ---------- JSON ---------- */

function parseJson(doc: Record<string, unknown>): ParsedSpec {
  const scopes: SpecScope[] = [];
  const walkScopes = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (key === "scopes" && value && typeof value === "object" && !Array.isArray(value)) {
        for (const [name, description] of Object.entries(value as Record<string, unknown>)) {
          if (SCOPE_NAME.test(name)) scopes.push({ name, description: String(description ?? "") });
        }
      } else {
        walkScopes(value);
      }
    }
  };
  walkScopes(doc.components);
  walkScopes(doc.securityDefinitions);
  const known = uniq(scopes.map((s) => s.name));

  const operations: SpecOperation[] = [];
  const paths = (doc.paths ?? {}) as Record<string, Record<string, unknown>>;
  for (const [path, item] of Object.entries(paths)) {
    if (!item || typeof item !== "object") continue;
    for (const method of METHODS) {
      const op = item[method] as Record<string, unknown> | undefined;
      if (!op) continue;
      operations.push({
        method,
        path,
        summary: String(op.summary ?? op.operationId ?? ""),
        scopes: scopesInText(JSON.stringify(op.security ?? op), known),
        source: JSON.stringify(op, null, 2).slice(0, MAX_SOURCE_CHARS),
      });
    }
  }

  const servers = Array.isArray(doc.servers)
    ? doc.servers.map((s) => String((s as { url?: unknown })?.url ?? "")).filter(Boolean)
    : [];

  const seen = new Set<string>();
  return {
    scopes: scopes.filter((s) => (seen.has(s.name) ? false : (seen.add(s.name), true))),
    operations,
    servers,
  };
}

/* ---------- Ingang ---------- */

export function parseOpenApi(text: string): ParsedSpec {
  const trimmed = text.trim();
  if (trimmed.startsWith("{")) {
    try {
      return parseJson(JSON.parse(trimmed));
    } catch {
      // Toch geen JSON: verder als YAML.
    }
  }
  const lines = text.replace(/\r\n?/g, "\n").replace(/\t/g, "  ").split("\n");
  const scopes = parseScopesYaml(lines);
  return {
    scopes,
    operations: parseOperationsYaml(lines, scopes.map((s) => s.name)),
    servers: parseServersYaml(lines),
  };
}

/**
 * Het adres waar de paden uit de beschrijving achter komen. Alleen een server
 * op `api.playable.com` telt; anders het vaste adres dat PSV Tools al gebruikt.
 */
export function apiBase(servers: string[]): string {
  for (const server of servers) {
    try {
      const url = new URL(server);
      if (url.protocol === "https:" && url.host === PLAYABLE_HOST) {
        return `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
      }
    } catch {
      // Geen geldig adres: overslaan.
    }
  }
  return `https://${PLAYABLE_HOST}`;
}
