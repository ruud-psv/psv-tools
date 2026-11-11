import type { SpecOperation } from "./spec";

/**
 * De pure kant van de Playable API-test: welke endpoints we mogen aanroepen,
 * en waar in een antwoord iets staat dat op de HTML, CSS of JS van een
 * campagnepagina lijkt.
 */

/* ---------- Wat we niet aanraken ---------- */

/**
 * Endpoints en rechten waar persoonsgegevens achter kunnen zitten
 * (registraties, deelnemers, e-mail- en sms-logs, vouchers, logins). Die test
 * deze pagina niet: de vraag is alleen waar de pagina-code staat.
 */
const PERSONAL_DATA =
  /registr|participant|voucher|e-?mail|sms|\blogs?\b|user|login|lead|winner|entr(y|ies)|submission|answer|export|contact|profile|consent|gdpr|personal/i;

export function isPersonalDataPath(path: string): boolean {
  return PERSONAL_DATA.test(path);
}

export function isPersonalDataScope(scope: string): boolean {
  return PERSONAL_DATA.test(scope);
}

/** Rechten die alleen lezen. Met alleen deze rechten in het token kan een aanroep niets veranderen. */
export function isReadScope(scope: string): boolean {
  return /\.(list|view)$/i.test(scope);
}

/** Rechten die iets aan een campagne kunnen veranderen of aanmaken. */
export function isWriteScope(scope: string): boolean {
  return /\.(modify|copy|create|update|delete|pause|resume|upload|clear)/i.test(scope);
}

/* ---------- Welke endpoints we aanroepen ---------- */

export function pathParams(path: string): string[] {
  return [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
}

export interface ReadPlan {
  /** GET met één parameter: het campagne-ID. */
  single: SpecOperation[];
  /**
   * GET met twee parameters, zoals `/campaign/{id}/sections/{section}`. Het
   * tweede ID halen we uit het lijst-endpoint ervoor (`/campaign/{id}/sections`).
   */
  nested: { operation: SpecOperation; listPath: string }[];
  /** Overgeslagen, met de reden. */
  skipped: { method: string; path: string; reason: string }[];
}

/** Als de API-beschrijving niet te lezen is: de twee endpoints die er zeker of vrijwel zeker zijn. */
export const FALLBACK_OPERATIONS: SpecOperation[] = [
  { method: "get", path: "/v1/campaign/{id}", summary: "Campagne bekijken", scopes: ["campaigns.view"] },
  {
    method: "get",
    path: "/v1/campaign/{id}/sections",
    summary: "Secties van een campagne",
    scopes: ["campaigns.sections.list"],
  },
];

export const MAX_SINGLE = 15;
export const MAX_NESTED = 6;
export const MAX_NESTED_IDS = 5;

export function planReads(operations: SpecOperation[]): ReadPlan {
  const plan: ReadPlan = { single: [], nested: [], skipped: [] };

  for (const op of operations) {
    if (op.method !== "get") continue;
    if (!/campaign/i.test(op.path)) continue;
    const params = pathParams(op.path);
    if (params.length === 0) continue;

    if (isPersonalDataPath(op.path) || op.scopes.some(isPersonalDataScope)) {
      plan.skipped.push({ method: op.method, path: op.path, reason: "Mogelijk persoonsgegevens" });
      continue;
    }

    if (params.length === 1) {
      plan.single.push(op);
    } else if (params.length === 2) {
      const last = op.path.lastIndexOf("/{");
      plan.nested.push({ operation: op, listPath: op.path.slice(0, last) });
    } else {
      plan.skipped.push({ method: op.method, path: op.path, reason: "Meer dan twee parameters" });
    }
  }

  // Alleen een genest endpoint waarvan we de lijst ook ophalen, anders is er geen tweede ID.
  const singlePaths = new Set(plan.single.map((op) => op.path));
  plan.nested = plan.nested.filter((n) => {
    if (singlePaths.has(n.listPath)) return true;
    plan.skipped.push({ method: n.operation.method, path: n.operation.path, reason: "Geen lijst om een ID uit te halen" });
    return false;
  });

  for (const op of plan.single.slice(MAX_SINGLE)) {
    plan.skipped.push({ method: op.method, path: op.path, reason: "Boven het maximum per test" });
  }
  for (const n of plan.nested.slice(MAX_NESTED)) {
    plan.skipped.push({ method: n.operation.method, path: n.operation.path, reason: "Boven het maximum per test" });
  }
  plan.single = plan.single.slice(0, MAX_SINGLE);
  plan.nested = plan.nested.slice(0, MAX_NESTED);
  return plan;
}

/** Vult de parameters van een pad in, in volgorde. */
export function fillPath(path: string, values: (string | number)[]): string {
  let i = 0;
  return path.replace(/\{[^}]+\}/g, () => encodeURIComponent(String(values[i++] ?? "")));
}

/** De ID's uit een lijstantwoord: `[{id}]` of `{data: [{id}]}`. */
export function idsFromList(json: unknown, max = MAX_NESTED_IDS): (string | number)[] {
  const items = Array.isArray(json)
    ? json
    : json && typeof json === "object" && Array.isArray((json as { data?: unknown }).data)
      ? (json as { data: unknown[] }).data
      : [];
  const ids: (string | number)[] = [];
  for (const item of items) {
    const id = item && typeof item === "object" ? (item as { id?: unknown }).id : undefined;
    if (typeof id === "number" || (typeof id === "string" && id !== "")) ids.push(id);
    if (ids.length >= max) break;
  }
  return ids;
}

/* ---------- Pagina-code herkennen ---------- */

export type CodeSignal = "psvk" | "html" | "css" | "js" | "veldnaam";

export interface CodeField {
  /** Waar het staat, zoals `data.sections[2].settings.html`. */
  path: string;
  length: number;
  signals: CodeSignal[];
  /** Het begin van de waarde, op één regel. */
  preview: string;
}

const CODE_KEY = /^(html|css|js|javascript|script|scripts|style|styles|code|custom_?(code|css|js|html|javascript)|(html|css|js)_?code)$/i;

const SIGNALS: [CodeSignal, RegExp][] = [
  ["psvk", /psvk[-:]/],
  ["html", /<(div|section|header|main|footer|article|p|a|img|span|ul|li|h[1-6]|style|script)\b[^>]*>/i],
  ["css", /[#.][\w-]+[^{}]{0,80}\{[^{}]*:[^{}]*\}|@media\b|@keyframes\b/],
  ["js", /addEventListener|querySelector|document\.|window\.|function\s*\(|=>\s*\{/],
];

const MIN_LENGTH = 40;
const PREVIEW_LENGTH = 300;
const MAX_FIELDS = 50;

function signalsFor(key: string, value: string): CodeSignal[] {
  const found: CodeSignal[] = [];
  if (value.length >= MIN_LENGTH) {
    for (const [signal, re] of SIGNALS) if (re.test(value)) found.push(signal);
  }
  if (CODE_KEY.test(key)) found.push("veldnaam");
  return found;
}

/**
 * Loopt door een JSON-antwoord en geeft elk tekstveld terug dat op pagina-code
 * lijkt. Velden met PSV-klassen (`psvk-`) eerst, daarna de langste. Een veld
 * dat `html`, `css` of `js` heet telt ook als het leeg is: dan weten we dat het
 * veld bestaat.
 */
export function findCodeFields(root: unknown): CodeField[] {
  const fields: CodeField[] = [];

  const walk = (node: unknown, path: string, key: string) => {
    if (typeof node === "string") {
      const signals = signalsFor(key, node);
      if (signals.length > 0) {
        fields.push({
          path: path || "(antwoord)",
          length: node.length,
          signals,
          preview: node.replace(/\s+/g, " ").trim().slice(0, PREVIEW_LENGTH),
        });
      }
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((child, i) => walk(child, `${path}[${i}]`, key));
      return;
    }
    if (node && typeof node === "object") {
      for (const [childKey, child] of Object.entries(node as Record<string, unknown>)) {
        walk(child, path ? `${path}.${childKey}` : childKey, childKey);
      }
    }
  };
  walk(root, "", "");

  const rank = (f: CodeField) => (f.signals.includes("psvk") ? 2 : 0) + (f.signals.length > 1 ? 1 : 0);
  return fields.sort((a, b) => rank(b) - rank(a) || b.length - a.length).slice(0, MAX_FIELDS);
}

/* ---------- Wat de collega invult ---------- */

/** Adres vergelijkbaar maken: zonder protocol, `www.`, query, hash en slash aan het eind. */
export function normalizeUrl(raw: string): string {
  try {
    const url = new URL(raw.trim());
    return `${url.host.replace(/^www\./, "")}${url.pathname.replace(/\/+$/, "")}`.toLowerCase();
  } catch {
    return raw.trim().toLowerCase();
  }
}

export type CampaignInput = { kind: "id"; id: number } | { kind: "url"; url: string } | { kind: "invalid" };

/** Een campagne-ID (ook als `#189777`), of het adres van de demo- of livepagina. */
export function parseCampaignInput(raw: string): CampaignInput {
  const text = raw.trim();
  const id = text.match(/^#?(\d{1,12})$/);
  if (id) return { kind: "id", id: Number(id[1]) };
  try {
    const url = new URL(text);
    if (url.protocol === "https:" || url.protocol === "http:") return { kind: "url", url: text };
  } catch {
    // Geen adres.
  }
  return { kind: "invalid" };
}
