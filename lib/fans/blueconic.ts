/**
 * BlueConic voor Active & Engaged Fans: de profielen in het segment
 * "[Doelstelling] Ingelogd via login.psv.nl", met hun SSO-id en hun meest
 * recente SSO-login. Via de REST API v2, met OAuth 2.0 client credentials (een
 * applicatie in BlueConic met leesrechten op Profiles, Properties en Segments).
 *
 * De vorm van de antwoorden is tolerant gelezen: profielen onder `profiles`,
 * `items` of `data`, eigenschappen als lijst (`[{id, values}]`) of als object,
 * pagineren met een cursor of met `startIndex`. Wat BlueConic precies teruggeeft,
 * laat `/api/fans/blueconic` zien (zonder SSO-id's).
 *
 * De SSO-id's gaan niet verder dan het geheugen van de run: de opslag krijgt
 * alleen hashes (`sets.ts`).
 */

import type { MijnpsvBron, MijnpsvProfiel } from "./run";
import { amsterdamDag } from "./tijd";

/** Het segment uit BlueConic: "[Doelstelling] Ingelogd via login.psv.nl". */
export const STANDAARD_SEGMENT = "ff5e51f8-3eb4-46cc-8640-6b66460d2633";
export const STANDAARD_HOST = "psv.blueconic.com";
const PAGINA = 1000;
const MAX_PAGINAS = 2000;
const WACHTTIJDEN_MS = [2_000, 5_000, 15_000];
export const STANDAARD_SCOPES = "read:profiles read:properties read:segments";

/**
 * Schrijfwijzen van de scopes om te proberen: BlueConic weigerde de standaard
 * niet, maar gaf er ook geen rechten voor. `""` is zonder scope in de vraag.
 */
export const SCOPE_VARIANTEN = [
  STANDAARD_SCOPES,
  "profiles:read properties:read segments:read",
  "read_profiles read_properties read_segments",
  "read:profile read:property read:segment",
  "profiles properties segments",
  "",
];

export class BlueconicConfigFout extends Error {}
export class BlueconicFout extends Error {
  readonly status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.status = status;
  }
}

export interface BlueconicConfig {
  host: string;
  clientId: string;
  clientSecret: string;
  segmentId: string;
  /** Eigenschap-ID's; zonder deze zoekt Tools ze op naam op. */
  eigenschapSso: string | null;
  eigenschapLogin: string | null;
  /** De scopes in de tokenvraag; `""` vraagt zonder scope. */
  scopes: string;
}

export function isBlueconicIngesteld(env: Record<string, string | undefined> = process.env): boolean {
  return Boolean(env.BLUECONIC_CLIENT_ID?.trim() && env.BLUECONIC_CLIENT_SECRET?.trim());
}

export function blueconicConfig(env: Record<string, string | undefined> = process.env): BlueconicConfig {
  const ontbreekt = ["BLUECONIC_CLIENT_ID", "BLUECONIC_CLIENT_SECRET"].filter((k) => !env[k]?.trim());
  if (ontbreekt.length) throw new BlueconicConfigFout(`BlueConic-configuratie ontbreekt: ${ontbreekt.join(", ")}.`);
  const host = (env.BLUECONIC_HOST?.trim() || STANDAARD_HOST).replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  return {
    host,
    clientId: env.BLUECONIC_CLIENT_ID!.trim(),
    clientSecret: env.BLUECONIC_CLIENT_SECRET!.trim(),
    segmentId: env.BLUECONIC_SEGMENT_ID?.trim() || STANDAARD_SEGMENT,
    eigenschapSso: env.BLUECONIC_PROP_SSO?.trim() || null,
    eigenschapLogin: env.BLUECONIC_PROP_LOGIN?.trim() || null,
    scopes: env.BLUECONIC_SCOPES?.trim() === "geen" ? "" : env.BLUECONIC_SCOPES?.trim() || STANDAARD_SCOPES,
  };
}

/* ---------- Antwoorden lezen ---------- */

type Json = Record<string, unknown>;

function isObject(v: unknown): v is Json {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** De eerste lijst onder een van deze sleutels, of het antwoord zelf als dat een lijst is. */
function lijst(body: unknown, sleutels: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isObject(body)) return [];
  for (const k of sleutels) if (Array.isArray(body[k])) return body[k] as unknown[];
  return [];
}

function tekst(v: unknown): string | null {
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return null;
}

export interface RuwProfiel {
  id: string | null;
  /** Per eigenschap-ID de waarden, als tekst. */
  eigenschappen: Map<string, string[]>;
}

function waarden(v: unknown): string[] {
  if (Array.isArray(v)) return v.flatMap((x) => (isObject(x) ? waarden(x.value ?? x.values) : (tekst(x) ?? [])));
  if (isObject(v)) return waarden(v.values ?? v.value);
  const t = tekst(v);
  return t == null ? [] : [t];
}

function leesProfiel(ruw: unknown): RuwProfiel {
  const eigenschappen = new Map<string, string[]>();
  if (!isObject(ruw)) return { id: null, eigenschappen };
  const props = ruw.properties ?? ruw.profileProperties ?? ruw.attributes;
  if (Array.isArray(props)) {
    for (const p of props) {
      if (!isObject(p)) continue;
      const id = tekst(p.id ?? p.property ?? p.name);
      if (id) eigenschappen.set(id, waarden(p.values ?? p.value));
    }
  } else if (isObject(props)) {
    for (const [id, v] of Object.entries(props)) eigenschappen.set(id, waarden(v));
  }
  return { id: tekst(ruw.id ?? ruw.profileId), eigenschappen };
}

export interface ProfielPagina {
  profielen: RuwProfiel[];
  /** Cursor voor de volgende pagina, als BlueConic die geeft. */
  volgende: string | null;
  totaal: number | null;
}

export function leesProfielPagina(body: unknown): ProfielPagina {
  const profielen = lijst(body, ["profiles", "items", "data", "results"]).map(leesProfiel);
  let volgende: string | null = null;
  let totaal: number | null = null;
  if (isObject(body)) {
    const cursor = body.nextCursor ?? body.next ?? body.cursor ?? (isObject(body.paging) ? (body.paging.next ?? body.paging.cursor) : null);
    volgende = typeof cursor === "string" && cursor && !/^https?:/.test(cursor) ? cursor : null;
    const t = body.total ?? body.totalCount ?? body.totalResults ?? (isObject(body.paging) ? body.paging.total : null);
    totaal = typeof t === "number" && Number.isFinite(t) ? t : null;
  }
  return { profielen, volgende, totaal };
}

/**
 * Een datum uit BlueConic als Nederlandse kalenderdag. Datums komen als
 * milliseconden (getal of tekst) of als ISO-tekst.
 */
export function dagUitWaarde(waarde: string | null | undefined): string | null {
  if (!waarde) return null;
  const v = waarde.trim();
  const ms = /^\d{11,14}$/.test(v) ? Number(v) : Date.parse(v);
  return Number.isFinite(ms) ? amsterdamDag(ms) : null;
}

export interface EigenschapKandidaat {
  id: string;
  naam: string;
}

/**
 * Zoekt de eigenschappen op naam: "SSO Ingelogd Datum (meest recent)" en het
 * SSO-id. Bij geen of meer dan één treffer een fout met de kandidaten, zodat de
 * juiste in `BLUECONIC_PROP_SSO` of `BLUECONIC_PROP_LOGIN` kan.
 */
export function kiesEigenschappen(body: unknown): { sso: string; login: string; kandidaten: EigenschapKandidaat[] } {
  const alle: EigenschapKandidaat[] = lijst(body, ["properties", "items", "data", "results"]).flatMap((p) => {
    if (!isObject(p)) return [];
    const id = tekst(p.id);
    const naam = tekst(p.name ?? p.label) ?? "";
    return id ? [{ id, naam }] : [];
  });
  const plat = (s: string) => s.toLowerCase().replace(/\[[^\]]*\]/g, "").replace(/[^a-z0-9]/g, "");
  const kandidaten = alle.filter((p) => /sso/.test(plat(p.naam)) || /sso/.test(plat(p.id)));
  const login = kandidaten.filter((p) => plat(p.naam).includes("ssoingelogddatum"));
  const loginMeestRecent = login.filter((p) => plat(p.naam).includes("meestrecent"));
  const sso = kandidaten.filter((p) => ["ssoid", "ssoidentifier"].includes(plat(p.naam)) || ["ssoid"].includes(plat(p.id)));

  const kies = (treffers: EigenschapKandidaat[], wat: string, env: string): string => {
    if (treffers.length === 1) return treffers[0].id;
    const lijstje = kandidaten.map((k) => `${k.id} (${k.naam})`).join(", ") || "geen";
    throw new BlueconicFout(
      `${treffers.length ? "Meer dan één" : "Geen"} eigenschap gevonden voor ${wat}. Zet het ID in ${env}. Eigenschappen met SSO: ${lijstje}.`,
      500
    );
  };
  return {
    sso: kies(sso, "het SSO-id", "BLUECONIC_PROP_SSO"),
    login: kies(loginMeestRecent.length ? loginMeestRecent : login, "SSO Ingelogd Datum (meest recent)", "BLUECONIC_PROP_LOGIN"),
    kandidaten,
  };
}

/* ---------- Client ---------- */

export interface TokenInfo {
  /** Of het token met de scopes erbij gevraagd is. */
  metScopes: boolean;
  /** De scopes die BlueConic teruggaf, als het die noemt. */
  scope: string | null;
  geldigSeconden: number;
}

export interface BlueconicApi {
  get(pad: string, params?: [string, string][]): Promise<unknown>;
  tokenInfo(): Promise<TokenInfo>;
}

export function blueconicApi(
  config: Pick<BlueconicConfig, "host" | "clientId" | "clientSecret"> & { scopes?: string },
  opties: { doeFetch?: typeof fetch; wachttijden?: number[]; nu?: () => number; terugval?: boolean } = {}
): BlueconicApi {
  const scopes = config.scopes ?? STANDAARD_SCOPES;
  const doeFetch = opties.doeFetch ?? fetch;
  const wachttijden = opties.wachttijden ?? WACHTTIJDEN_MS;
  const nu = opties.nu ?? Date.now;
  const basis = `https://${config.host}/rest/v2`;
  let token: { waarde: string; tot: number } | null = null;

  async function vraagToken(metScopes: boolean): Promise<Response> {
    const body = new URLSearchParams({ grant_type: "client_credentials", client_id: config.clientId, client_secret: config.clientSecret });
    if (metScopes && scopes) body.set("scope", scopes);
    return doeFetch(`${basis}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      cache: "no-store",
    });
  }

  async function haalToken(): Promise<string> {
    if (token && token.tot > nu()) return token.waarde;
    // Eerst met de scopes erbij: een token zonder gaf bij PSV een 403 op het
    // segment en een lege lijst profielen. Kent BlueConic die scope-namen niet,
    // dan zonder.
    let metScopes = Boolean(scopes);
    let res = await vraagToken(metScopes);
    let tekst_ = await res.text();
    if (metScopes && opties.terugval !== false && !res.ok && (res.status === 400 || /scope/i.test(tekst_))) {
      metScopes = false;
      res = await vraagToken(false);
      tekst_ = await res.text();
    }
    let body: unknown = null;
    try {
      body = JSON.parse(tekst_);
    } catch {
      // geen JSON: dan volgt hieronder een fout
    }
    const waarde = isObject(body) ? tekst(body.access_token) : null;
    if (!res.ok || !waarde) {
      const reden = isObject(body) ? tekst(body.error_description ?? body.error ?? body.message) : null;
      throw new BlueconicFout(
        `BlueConic gaf geen toegangstoken (${res.status})${reden ? `: ${reden}` : ""}. Controleer BLUECONIC_CLIENT_ID en BLUECONIC_CLIENT_SECRET, en of de applicatie client credentials mag gebruiken.`,
        res.status === 400 || res.status === 401 ? 401 : res.status
      );
    }
    const geldig = isObject(body) && typeof body.expires_in === "number" ? body.expires_in : 600;
    token = { waarde, tot: nu() + Math.max(30, geldig - 60) * 1000 };
    info = { metScopes, scope: isObject(body) ? tekst(body.scope) : null, geldigSeconden: geldig };
    return waarde;
  }

  let info: TokenInfo | null = null;

  return {
    async tokenInfo() {
      await haalToken();
      return info!;
    },
    async get(pad, params = []) {
      const url = new URL(`${basis}${pad}`);
      for (const [k, v] of params) url.searchParams.append(k, v);
      let opnieuwIngelogd = false;
      for (let poging = 0; ; poging++) {
        const res = await doeFetch(url, { headers: { Authorization: `Bearer ${await haalToken()}`, Accept: "application/json" }, cache: "no-store" });
        const tekst_ = await res.text();
        if (res.ok) {
          try {
            return JSON.parse(tekst_);
          } catch {
            throw new BlueconicFout(`BlueConic gaf geen JSON terug op ${pad}.`, 502);
          }
        }
        if (res.status === 401 && !opnieuwIngelogd) {
          token = null;
          opnieuwIngelogd = true;
          continue;
        }
        if ((res.status === 429 || res.status >= 500) && poging < wachttijden.length) {
          await new Promise((r) => setTimeout(r, wachttijden[poging]));
          continue;
        }
        let reden: string | null = null;
        try {
          const b = JSON.parse(tekst_);
          reden = isObject(b) ? tekst(b.message ?? b.error_description ?? b.error) : null;
        } catch {
          reden = tekst_.slice(0, 200) || null;
        }
        const hint = res.status === 403 ? " Heeft de applicatie leesrechten op Profiles, Properties en Segments?" : "";
        throw new BlueconicFout(`BlueConic gaf ${res.status} op ${pad}${reden ? `: ${reden}` : ""}.${hint}`, res.status);
      }
    },
  };
}

/* ---------- Scopes proberen ---------- */

export interface ScopeProef {
  scopes: string;
  token: TokenInfo | { fout: string };
  /** HTTP-status van het segment, of de fout. */
  segment: number | string;
  /** Profielen in BlueConic zonder filter (`totalResults`), of de fout. */
  profielen: number | null | string;
}

/**
 * Probeert elke schrijfwijze van de scopes: een nieuw token, dan het segment
 * en het aantal profielen. Zonder terugval, zodat elke regel zegt wat hij test.
 */
export async function probeerScopes(
  config: BlueconicConfig,
  opties: { doeFetch?: typeof fetch; varianten?: string[] } = {}
): Promise<ScopeProef[]> {
  const uit: ScopeProef[] = [];
  for (const scopes of opties.varianten ?? SCOPE_VARIANTEN) {
    const api = blueconicApi({ ...config, scopes }, { doeFetch: opties.doeFetch, wachttijden: [], terugval: false });
    const proef: ScopeProef = { scopes: scopes || "(geen)", token: { fout: "" }, segment: "", profielen: null };
    try {
      proef.token = await api.tokenInfo();
    } catch (err) {
      proef.token = { fout: err instanceof Error ? err.message : String(err) };
      uit.push(proef);
      continue;
    }
    try {
      await api.get(`/segments/${config.segmentId}`);
      proef.segment = 200;
    } catch (err) {
      proef.segment = err instanceof BlueconicFout ? err.status : String(err);
    }
    try {
      proef.profielen = leesProfielPagina(await api.get("/profiles", [["count", "1"], ["startIndex", "0"]])).totaal;
    } catch (err) {
      proef.profielen = err instanceof Error ? err.message : String(err);
    }
    uit.push(proef);
  }
  return uit;
}

/* ---------- Ruwe proef ---------- */

export interface RuwAntwoord {
  status: number;
  /** De `WWW-Authenticate`-header: bij een 403 staat daar vaak welk recht mist. */
  wwwAuthenticate: string | null;
  contentType: string | null;
  /** Bij een fout het begin van het antwoord; bij succes alleen het aantal (geen profieldata). */
  inhoud: string | null;
  totaal: number | null;
}

export interface RuweProef {
  /** Hoe het token gevraagd is: client-gegevens in de body, in een Basic-header, of geen token. */
  manier: "body" | "basic" | "geen";
  token: { status: number; sleutels: string[]; tokenType: string | null; fout: string | null } | null;
  segment: RuwAntwoord | null;
  profielen: RuwAntwoord | null;
}

async function ruwGet(doeFetch: typeof fetch, url: string, token: string | null): Promise<RuwAntwoord> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await doeFetch(url, { headers, cache: "no-store" });
  const tekst_ = await res.text();
  let totaal: number | null = null;
  if (res.ok) {
    try {
      totaal = leesProfielPagina(JSON.parse(tekst_)).totaal;
    } catch {
      // geen JSON
    }
  }
  return {
    status: res.status,
    wwwAuthenticate: res.headers.get("www-authenticate"),
    contentType: res.headers.get("content-type"),
    inhoud: res.ok ? null : tekst_.slice(0, 300),
    totaal,
  };
}

/**
 * Dezelfde twee verzoeken (het segment en één profiel) op drie manieren: met
 * een token waarvoor de client-gegevens in de body staan, met een token via een
 * Basic-header, en zonder token. Is alles gelijk, dan negeert BlueConic het
 * token. Toont geen token en geen profieldata.
 */
export async function ruweProeven(config: BlueconicConfig, opties: { doeFetch?: typeof fetch } = {}): Promise<RuweProef[]> {
  const doeFetch = opties.doeFetch ?? fetch;
  const basis = `https://${config.host}/rest/v2`;
  const uit: RuweProef[] = [];
  for (const manier of ["body", "basic", "geen"] as const) {
    const proef: RuweProef = { manier, token: null, segment: null, profielen: null };
    let token: string | null = null;
    if (manier !== "geen") {
      const body = new URLSearchParams({ grant_type: "client_credentials" });
      if (config.scopes) body.set("scope", config.scopes);
      const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" };
      if (manier === "body") {
        body.set("client_id", config.clientId);
        body.set("client_secret", config.clientSecret);
      } else {
        headers.Authorization = `Basic ${Buffer.from(`${encodeURIComponent(config.clientId)}:${encodeURIComponent(config.clientSecret)}`).toString("base64")}`;
      }
      try {
        const res = await doeFetch(`${basis}/oauth/token`, { method: "POST", headers, body, cache: "no-store" });
        const tekst_ = await res.text();
        let json: unknown = null;
        try {
          json = JSON.parse(tekst_);
        } catch {
          // geen JSON
        }
        token = isObject(json) ? tekst(json.access_token) : null;
        proef.token = {
          status: res.status,
          sleutels: isObject(json) ? Object.keys(json) : [],
          tokenType: isObject(json) ? tekst(json.token_type) : null,
          fout: token ? null : isObject(json) ? tekst(json.error_description ?? json.error) : tekst_.slice(0, 200),
        };
      } catch (err) {
        proef.token = { status: 0, sleutels: [], tokenType: null, fout: err instanceof Error ? err.message : String(err) };
      }
      if (!token) {
        uit.push(proef);
        continue;
      }
    }
    try {
      proef.segment = await ruwGet(doeFetch, `${basis}/segments/${config.segmentId}`, token);
      proef.profielen = await ruwGet(doeFetch, `${basis}/profiles?count=1&startIndex=0`, token);
    } catch (err) {
      proef.segment ??= { status: 0, wwwAuthenticate: null, contentType: null, inhoud: err instanceof Error ? err.message : String(err), totaal: null };
    }
    uit.push(proef);
  }
  return uit;
}

/* ---------- Bron voor de telling ---------- */

/**
 * Waar de lijst met profieleigenschappen kan staan. `/properties` gaf bij PSV
 * een 404; de andere twee zijn de gangbare namen in de v2-API.
 */
export const EIGENSCHAPPEN_PADEN = ["/profileproperties", "/profileProperties", "/properties"];

/** De lijst met eigenschappen, van het eerste pad dat bestaat. */
export async function leesEigenschappenLijst(api: BlueconicApi): Promise<{ pad: string; body: unknown }> {
  const geprobeerd: string[] = [];
  for (const pad of EIGENSCHAPPEN_PADEN) {
    try {
      return { pad, body: await api.get(pad, [["count", "10000"]]) };
    } catch (err) {
      if (err instanceof BlueconicFout && (err.status === 404 || err.status === 405)) {
        geprobeerd.push(pad);
        continue;
      }
      throw err;
    }
  }
  throw new BlueconicFout(
    `BlueConic kent geen lijst met eigenschappen op ${geprobeerd.join(", ")}. Zet de ID's van het SSO-id en van "SSO Ingelogd Datum (meest recent)" in BLUECONIC_PROP_SSO en BLUECONIC_PROP_LOGIN.`,
    404
  );
}

export async function eigenschappenVoor(api: BlueconicApi, config: BlueconicConfig): Promise<{ sso: string; login: string }> {
  if (config.eigenschapSso && config.eigenschapLogin) return { sso: config.eigenschapSso, login: config.eigenschapLogin };
  const gekozen = kiesEigenschappen((await leesEigenschappenLijst(api)).body);
  return { sso: config.eigenschapSso ?? gekozen.sso, login: config.eigenschapLogin ?? gekozen.login };
}

/**
 * Leest alle profielen van het segment, pagina voor pagina. Doorgaan tot een
 * lege pagina, het totaal of het eind van de cursor: zo maakt het niet uit of
 * BlueConic minder per pagina geeft dan gevraagd.
 */
export async function* profielenUitSegment(
  api: BlueconicApi,
  segmentId: string,
  eigenschappen: string[],
  deadline?: number
): AsyncGenerator<RuwProfiel[]> {
  let cursor: string | null = null;
  let start = 0;
  let gezien = 0;
  let eersteId: string | null = null;
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    if (deadline && Date.now() > deadline) throw new BlueconicFout(`BlueConic lezen duurde te lang (${gezien} profielen gelezen).`, 504);
    const params: [string, string][] = [
      ["segment", segmentId],
      ["properties", eigenschappen.join(",")],
      ["count", String(PAGINA)],
    ];
    if (cursor) params.push(["cursor", cursor]);
    else params.push(["startIndex", String(start)]);
    const deel = leesProfielPagina(await api.get("/profiles", params));
    if (!deel.profielen.length) return;
    // Negeert BlueConic het pagineren, dan komt steeds dezelfde pagina terug.
    if (pagina > 0 && deel.profielen[0].id && deel.profielen[0].id === eersteId) {
      throw new BlueconicFout("BlueConic gaf twee keer dezelfde pagina; het pagineren werkt niet zoals verwacht.", 502);
    }
    if (pagina === 0) eersteId = deel.profielen[0].id;
    yield deel.profielen;
    gezien += deel.profielen.length;
    start += deel.profielen.length;
    if (deel.totaal != null && gezien >= deel.totaal) return;
    if (cursor || deel.volgende) {
      if (!deel.volgende) return;
      cursor = deel.volgende;
    }
  }
  throw new BlueconicFout(`Meer dan ${MAX_PAGINAS} pagina's in het segment; het lezen is gestopt.`, 500);
}

export function blueconicBron(api: BlueconicApi, config: BlueconicConfig, opties: { deadline?: () => number | undefined } = {}): MijnpsvBron {
  return {
    async profielenSinds(sinds) {
      const { sso, login } = await eigenschappenVoor(api, config);
      const uit: MijnpsvProfiel[] = [];
      let gelezen = 0;
      let metSso = 0;
      let metLogin = 0;
      for await (const pagina of profielenUitSegment(api, config.segmentId, [sso, login], opties.deadline?.())) {
        for (const p of pagina) {
          gelezen++;
          const id = p.eigenschappen.get(sso)?.[0]?.trim();
          const dag = dagUitWaarde(p.eigenschappen.get(login)?.[0]);
          if (id) metSso++;
          if (dag) metLogin++;
          if (id && dag && dag >= sinds) uit.push({ sso: id, laatsteLogin: dag });
        }
      }
      // Het segment heeft tienduizenden profielen. Nul is dus geen telling maar
      // een fout, en mag nooit als "0 MijnPSV-fans" in de cijfers belanden.
      if (gelezen === 0) {
        throw new BlueconicFout(
          `BlueConic gaf 0 profielen in segment ${config.segmentId}. Waarschijnlijk mist het token rechten of herkent BlueConic het segment niet; zie /api/fans/blueconic.`,
          502
        );
      }
      if (metSso === 0) {
        throw new BlueconicFout(
          `BlueConic gaf ${gelezen} profielen maar geen SSO-id (eigenschap ${sso}). Is die eigenschap als PII gemarkeerd? Vink dan PII aan bij de applicatie in BlueConic.`,
          502
        );
      }
      if (metLogin === 0) {
        throw new BlueconicFout(`BlueConic gaf ${gelezen} profielen maar geen logindatum (eigenschap ${login}).`, 502);
      }
      return uit;
    },
  };
}
