import {
  KNOWN_SCOPES,
  PLAYABLE_HOST,
  SPEC_URL,
  apiBase,
  parseOpenApi,
  type ParsedSpec,
  type SpecOperation,
} from "./spec";
import {
  FALLBACK_OPERATIONS,
  fillPath,
  findCodeFields,
  idsFromList,
  isPersonalDataScope,
  isReadScope,
  isWriteScope,
  normalizeUrl,
  parseCampaignInput,
  planReads,
  type CodeField,
} from "./scan";

/**
 * De Playable API-test: welke rechten hebben de sleutels van PSV Tools, en wat
 * geeft de API terug voor één campagne? Zit de HTML, CSS en JS van de pagina
 * erin, dan kan PSV Tools die zelf ophalen in plaats van dat een collega hem
 * plakt.
 *
 * Alles hier leest alleen. Voor de aanroepen vragen we een token aan met
 * uitsluitend lees-rechten (`.list` en `.view`), zonder rechten op
 * registraties of andere persoonsgegevens, en we doen alleen GET-verzoeken.
 * Schrijfrechten zoals `campaigns.modify` testen we door er een token voor aan
 * te vragen; dat token gebruiken we nergens voor.
 */

/** Een fout die de collega te zien krijgt. */
export class PlayableTestError extends Error {}

const TOKEN_URL = `https://${PLAYABLE_HOST}/oauth/token`;
const SPEC_CACHE_MS = 60 * 60 * 1000;
const MAX_BODY_CHARS = 300_000;
const MAX_CAMPAIGN_PAGES = 30;
const CONCURRENCY = 4;

/* ---------- Typen van het rapport ---------- */

export interface ScopeResult {
  name: string;
  description: string;
  /** Staat dit recht in de API-beschrijving, of testen we het omdat we het al kennen? */
  inSpec: boolean;
  /** `null`: niet vast te stellen (bijvoorbeeld te veel verzoeken). */
  granted: boolean | null;
  status?: number;
  message?: string;
  read: boolean;
  write: boolean;
  personal: boolean;
}

export interface ReadResult {
  /** Het pad zoals het in de API-beschrijving staat. */
  specPath: string;
  /** Het pad zoals we het hebben aangeroepen. */
  path: string;
  summary: string;
  status: number;
  ok: boolean;
  /** Lengte van het antwoord in tekens. */
  size: number;
  /** Het antwoord als JSON; ontbreekt als het te groot of geen JSON is. */
  json?: unknown;
  /** Het begin van het antwoord als het geen JSON is of te groot was. */
  text?: string;
  truncated: boolean;
  codeFields: CodeField[];
  error?: string;
}

export interface PlayableTestReport {
  ranAt: string;
  input: string;
  campaign: { id: number; name: string | null; demoUrl: string | null; liveUrl: string | null };
  spec: {
    url: string;
    loaded: boolean;
    error: string | null;
    base: string;
    operations: SpecOperation[];
  };
  scopeMethod: "alles-tegelijk" | "per-recht";
  scopes: ScopeResult[];
  /** De rechten in het token waarmee de campagne is opgehaald. */
  readScopes: string[];
  reads: ReadResult[];
  skipped: { method: string; path: string; reason: string }[];
  conclusion: {
    /** Velden met PSV-klassen of herkenbare HTML, CSS of JS. */
    codeFound: boolean;
    /** Velden met `psvk-`, de klassen van de PSV Campaign Kit. */
    psvkFound: boolean;
    codeLocations: string[];
    modify: boolean | null;
    copy: boolean | null;
    /** Endpoints in de beschrijving die bij `campaigns.modify` of `campaigns.copy` horen. */
    writeOperations: SpecOperation[];
  };
}

/* ---------- Hulpjes ---------- */

export interface Credentials {
  clientId: string;
  clientSecret: string;
}

function credentials(): Credentials {
  const clientId = process.env.PLAYABLE_CLIENT_ID;
  const clientSecret = process.env.PLAYABLE_SECRET;
  if (!clientId || !clientSecret) {
    throw new PlayableTestError("PLAYABLE_CLIENT_ID of PLAYABLE_SECRET ontbreekt in de server-omgeving.");
  }
  return { clientId, clientSecret };
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

/**
 * Een korte foutmelding uit een antwoord, zonder de sleutels van PSV Tools
 * erin. Alleen waarden van minstens 8 tekens worden weggelakt: een kort
 * (numeriek) client-ID zou anders elk cijfer in de melding vervangen.
 */
export function shortMessage(json: unknown, text: string, creds: Credentials): string {
  const j = (json ?? {}) as Record<string, unknown>;
  let message = String(j.error_description ?? j.message ?? j.hint ?? j.error ?? text ?? "");
  for (const [value, label] of [
    [creds.clientSecret, "[geheim]"],
    [creds.clientId, "[client-id]"],
  ] as const) {
    if (value.length >= 8) message = message.split(value).join(label);
  }
  return message.replace(/\s+/g, " ").trim().slice(0, 300);
}

/* ---------- Tokens ---------- */

interface TokenResult {
  ok: boolean;
  status: number;
  token?: string;
  /** De rechten die Playable zegt te hebben toegekend, als het antwoord ze noemt. */
  grantedScopes?: string[];
  message?: string;
}

async function requestToken(creds: Credentials, scopes: string[]): Promise<TokenResult> {
  try {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: scopes,
      }),
      cache: "no-store",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const body = (json ?? {}) as { access_token?: unknown; scope?: unknown };
    if (res.ok && typeof body.access_token === "string") {
      const granted =
        typeof body.scope === "string"
          ? body.scope.split(/[\s,]+/).filter(Boolean)
          : Array.isArray(body.scope)
            ? body.scope.map(String)
            : undefined;
      return { ok: true, status: res.status, token: body.access_token, grantedScopes: granted };
    }
    return { ok: false, status: res.status, message: shortMessage(json, text, creds) };
  } catch (err) {
    return { ok: false, status: 0, message: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Welke rechten krijgen we? Eerst alles in één keer: lukt dat, dan is het in
 * één verzoek klaar. Lukt het niet, dan per recht, zodat we zien welke
 * ontbreken.
 */
async function testScopes(
  creds: Credentials,
  scopes: { name: string; description: string; inSpec: boolean }[]
): Promise<{ method: PlayableTestReport["scopeMethod"]; results: ScopeResult[] }> {
  const base = (s: (typeof scopes)[number]) => ({
    ...s,
    read: isReadScope(s.name),
    write: isWriteScope(s.name),
    personal: isPersonalDataScope(s.name),
  });

  const all = await requestToken(creds, scopes.map((s) => s.name));
  if (all.ok) {
    // Noemt Playable de toegekende rechten niet, controleer dan of hij een
    // verzonnen recht weigert. Krijgen we daar ook een token voor, dan kijkt
    // Playable bij het aanvragen niet naar de rechten en zegt dit niets.
    const checksScopes = all.grantedScopes
      ? true
      : !(await requestToken(creds, ["psvtools.controle-bestaat-niet"])).ok;
    return {
      method: "alles-tegelijk",
      results: scopes.map((s) => ({
        ...base(s),
        granted: all.grantedScopes ? all.grantedScopes.includes(s.name) : checksScopes ? true : null,
        status: all.status,
        message: checksScopes
          ? undefined
          : "Playable geeft ook een token voor een verzonnen recht, dus of dit recht echt werkt blijkt pas bij gebruik.",
      })),
    };
  }

  const results = await mapLimit(scopes, CONCURRENCY, async (s) => {
    const r = await requestToken(creds, [s.name]);
    const granted = r.ok ? true : r.status === 429 || r.status === 0 || r.status >= 500 ? null : false;
    return { ...base(s), granted, status: r.status, message: r.ok ? undefined : r.message };
  });
  return { method: "per-recht", results };
}

/* ---------- De API-beschrijving ---------- */

let specCache: { spec: ParsedSpec; at: number } | null = null;

async function loadSpec(): Promise<{ spec: ParsedSpec | null; error: string | null }> {
  if (specCache && Date.now() - specCache.at < SPEC_CACHE_MS) return { spec: specCache.spec, error: null };
  try {
    const res = await fetch(SPEC_URL, { cache: "no-store", headers: { Accept: "application/yaml, text/yaml, */*" } });
    if (!res.ok) return { spec: null, error: `API-beschrijving ophalen mislukt (${res.status}).` };
    const spec = parseOpenApi(await res.text());
    if (spec.operations.length === 0 && spec.scopes.length === 0) {
      return { spec: null, error: "API-beschrijving opgehaald, maar er waren geen endpoints of rechten in te lezen." };
    }
    specCache = { spec, at: Date.now() };
    return { spec, error: null };
  } catch (err) {
    return { spec: null, error: `API-beschrijving ophalen mislukt: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/* ---------- Lezen ---------- */

async function getEndpoint(
  base: string,
  path: string,
  token: string
): Promise<Omit<ReadResult, "specPath" | "summary">> {
  const url = new URL(`${base}${path}`);
  // Het token gaat nooit naar een ander adres dan de API van Playable.
  if (url.protocol !== "https:" || url.host !== PLAYABLE_HOST) {
    return { path, status: 0, ok: false, size: 0, truncated: false, codeFields: [], error: "Adres buiten api.playable.com." };
  }
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
    });
    const text = await res.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      json = undefined;
    }
    const codeFields = findCodeFields(json ?? text);
    const truncated = text.length > MAX_BODY_CHARS;
    return {
      path,
      status: res.status,
      ok: res.ok,
      size: text.length,
      ...(json !== undefined && !truncated ? { json } : { text: text.slice(0, truncated ? MAX_BODY_CHARS : 2000) }),
      truncated,
      codeFields,
    };
  } catch (err) {
    return {
      path,
      status: 0,
      ok: false,
      size: 0,
      truncated: false,
      codeFields: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

interface CampaignSummary {
  id: number;
  name: string | null;
  demoUrl: string | null;
  liveUrl: string | null;
}

function campaignFrom(raw: unknown): CampaignSummary | null {
  const c = (raw ?? {}) as Record<string, unknown>;
  const id = Number(c.id);
  if (!Number.isFinite(id)) return null;
  return {
    id,
    name: c.name ? String(c.name) : null,
    demoUrl: c.demo_url ? String(c.demo_url) : null,
    liveUrl: c.live_url ? String(c.live_url) : null,
  };
}

/** Zoekt een campagne op het adres van de demo- of livepagina. */
async function findCampaignByUrl(token: string, url: string): Promise<CampaignSummary | null> {
  const target = normalizeUrl(url);
  for (let page = 1; page <= MAX_CAMPAIGN_PAGES; page++) {
    const res = await fetch(`https://${PLAYABLE_HOST}/v1/campaigns?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) throw new PlayableTestError(`Campagnes ophalen mislukt (${res.status}).`);
    const data = (await res.json()) as { data?: unknown[]; links?: { next?: unknown } };
    for (const raw of data.data ?? []) {
      const c = campaignFrom(raw);
      if (!c) continue;
      if ([c.demoUrl, c.liveUrl].some((u) => u && normalizeUrl(u) === target)) return c;
    }
    if (!data.links?.next) break;
  }
  return null;
}

/* ---------- De test ---------- */

export async function runPlayableApiTest(input: string): Promise<PlayableTestReport> {
  const parsedInput = parseCampaignInput(input);
  if (parsedInput.kind === "invalid") {
    throw new PlayableTestError("Vul een campagne-ID in (bijvoorbeeld 189777) of het adres van de demo- of livepagina.");
  }

  const creds = credentials();

  // 1. De API-beschrijving: welke rechten en endpoints er zijn.
  const { spec, error: specError } = await loadSpec();
  const operations = spec && spec.operations.length > 0 ? spec.operations : FALLBACK_OPERATIONS;
  const base = apiBase(spec?.servers ?? []);

  const specScopeNames = new Set(spec?.scopes.map((s) => s.name) ?? []);
  const scopesToTest = [
    ...(spec?.scopes ?? []).map((s) => ({ ...s, inSpec: true })),
    ...KNOWN_SCOPES.filter((name) => !specScopeNames.has(name)).map((name) => ({
      name,
      description: "",
      inSpec: false,
    })),
  ];

  // 2. Welke rechten hebben onze sleutels?
  const { method: scopeMethod, results: scopes } = await testScopes(creds, scopesToTest);

  // 3. Een token met alleen lees-rechten, zonder persoonsgegevens. Lukt dat
  //    niet met alles wat (mogelijk) is toegekend, dan met de twee rechten die
  //    PSV Tools al gebruikt.
  let readScopes = scopes.filter((s) => s.granted !== false && s.read && !s.personal).map((s) => s.name);
  let readToken = readScopes.length > 0 ? await requestToken(creds, readScopes) : null;
  if (!readToken?.ok) {
    readScopes = ["campaigns.list", "campaigns.view"];
    readToken = await requestToken(creds, readScopes);
  }
  if (!readToken.ok || !readToken.token) {
    throw new PlayableTestError(
      `De sleutels van PSV Tools krijgen geen token met lees-rechten (${readToken.status}): ${readToken.message ?? ""}`
    );
  }
  const token = readToken.token;

  // 4. Welke campagne?
  let campaign: CampaignSummary;
  if (parsedInput.kind === "url") {
    if (!readScopes.includes("campaigns.list")) {
      throw new PlayableTestError("Zoeken op adres kan niet zonder het recht campaigns.list. Vul het campagne-ID in.");
    }
    const found = await findCampaignByUrl(token, parsedInput.url);
    if (!found) throw new PlayableTestError("Geen campagne gevonden met dit adres. Vul het campagne-ID in.");
    campaign = found;
  } else {
    campaign = { id: parsedInput.id, name: null, demoUrl: null, liveUrl: null };
  }

  // 5. De endpoints van de campagne, alleen GET.
  const plan = planReads(operations);
  const singleReads = await mapLimit(plan.single, CONCURRENCY, async (op) => ({
    specPath: op.path,
    summary: op.summary,
    ...(await getEndpoint(base, fillPath(op.path, [campaign.id]), token)),
  }));

  const nestedJobs = plan.nested.flatMap(({ operation, listPath }) => {
    const list = singleReads.find((r) => r.specPath === listPath);
    return idsFromList(list?.json).map((childId) => ({ operation, childId }));
  });
  const nestedReads = await mapLimit(nestedJobs, CONCURRENCY, async ({ operation, childId }) => ({
    specPath: operation.path,
    summary: operation.summary,
    ...(await getEndpoint(base, fillPath(operation.path, [campaign.id, childId]), token)),
  }));

  const reads: ReadResult[] = [...singleReads, ...nestedReads];

  // De naam en adressen uit het eerste antwoord dat ze heeft, als we ze nog niet kenden.
  if (!campaign.name) {
    for (const r of reads) {
      const data = (r.json as { data?: unknown } | undefined)?.data ?? r.json;
      const found = r.ok && !Array.isArray(data) ? campaignFrom(data) : null;
      if (found?.name && found.id === campaign.id) {
        campaign = found;
        break;
      }
    }
  }

  // 6. Conclusie.
  const codeReads = reads.filter((r) => r.ok);
  const codeFields = codeReads.flatMap((r) =>
    r.codeFields.filter((f) => f.signals.some((s) => s !== "veldnaam")).map((f) => ({ read: r, field: f }))
  );
  const scopeGranted = (name: string) => scopes.find((s) => s.name === name)?.granted ?? null;

  return {
    ranAt: new Date().toISOString(),
    input: input.trim(),
    campaign,
    spec: { url: SPEC_URL, loaded: spec !== null, error: specError, base, operations },
    scopeMethod,
    scopes,
    readScopes,
    reads,
    skipped: plan.skipped,
    conclusion: {
      codeFound: codeFields.length > 0,
      psvkFound: codeFields.some(({ field }) => field.signals.includes("psvk")),
      codeLocations: codeFields.slice(0, 10).map(({ read, field }) => `GET ${read.path} → ${field.path}`),
      modify: scopeGranted("campaigns.modify"),
      copy: scopeGranted("campaigns.copy"),
      writeOperations: operations.filter((op) =>
        op.scopes.some((s) => s === "campaigns.modify" || s === "campaigns.copy")
      ),
    },
  };
}
