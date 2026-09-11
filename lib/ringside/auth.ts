/**
 * Locksmith — het machine-to-machine authenticatiesysteem van SeatGeek waarmee
 * we access tokens voor de Ringside API ophalen.
 *
 * Het is een standaard OAuth 2.0 Client Credentials Flow (RFC 6749 §4.4):
 * we sturen client_id + client_secret + audience naar de token-endpoint en
 * krijgen een access token met een `expires_in` terug.
 *
 * SeatGeek vraagt nadrukkelijk om een token zo lang mogelijk te hergebruiken,
 * dus we cachen het in het geheugen tot vlak voor het verloopt. Op Vercel leeft
 * die cache per lambda-instance: bij een koude start halen we simpelweg een
 * nieuw token op, wat prima is — het is geen gedeelde store en hoeft dat ook
 * niet te zijn.
 */

/** Ontbrekende of onvolledige configuratie — een serverprobleem, geen API-fout. */
export class RingsideConfigError extends Error {}

/** Locksmith wees de credentials af of was onbereikbaar. */
export class RingsideAuthError extends Error {}

/** Vaste audience uit de credentials-mail van SeatGeek. */
const DEFAULT_AUDIENCE = "https://ringside.seatgeek.com";

/**
 * Marge waarmee we een token als verlopen beschouwen. Voorkomt dat een token
 * onderweg naar Ringside alsnog over de datum gaat.
 */
const EXPIRY_MARGIN_SECONDS = 60;

interface TokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
}

interface CachedToken {
  token: string;
  /** Epoch-ms waarna we een nieuw token halen (inclusief marge). */
  expiresAt: number;
  /** Alleen voor de diagnose-endpoint; nooit het token zelf loggen of tonen. */
  meta: { tokenType: string; expiresIn: number; scope: string | null };
}

let tokenCache: CachedToken | null = null;

/**
 * Lopende tokenaanvraag. Zonder deze dedupe vuurt een burst aan requests
 * evenveel Locksmith-calls af, terwijl één token voor allemaal volstaat.
 */
let inFlight: Promise<CachedToken> | null = null;

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

export interface LocksmithConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  audience: string;
}

/**
 * Leest de Locksmith-configuratie uit de omgeving. Gooit een
 * `RingsideConfigError` met de exacte ontbrekende namen, zodat een misconfig op
 * Vercel meteen te herleiden is.
 */
export function getLocksmithConfig(): LocksmithConfig {
  const clientId = readEnv("RINGSIDE_CLIENT_ID");
  const clientSecret = readEnv("RINGSIDE_CLIENT_SECRET");
  const tokenUrl = readEnv("RINGSIDE_TOKEN_URL");

  const missing = [
    !clientId && "RINGSIDE_CLIENT_ID",
    !clientSecret && "RINGSIDE_CLIENT_SECRET",
    !tokenUrl && "RINGSIDE_TOKEN_URL",
  ].filter((name): name is string => Boolean(name));

  if (missing.length) {
    throw new RingsideConfigError(
      `Ringside-configuratie ontbreekt: ${missing.join(", ")}. Zet deze als environment variable in Vercel.`
    );
  }

  return {
    tokenUrl: tokenUrl!,
    clientId: clientId!,
    clientSecret: clientSecret!,
    audience: readEnv("RINGSIDE_AUDIENCE") ?? DEFAULT_AUDIENCE,
  };
}

/** Geeft aan of alle verplichte variabelen gezet zijn, zonder te gooien. */
export function isRingsideConfigured(): boolean {
  try {
    getLocksmithConfig();
    return true;
  } catch {
    return false;
  }
}

/**
 * Haalt het client secret uit een foutmelding. Locksmith hoort het nooit terug
 * te geven, maar de tekst gaat naar de serverlog én naar de diagnose-endpoint,
 * dus we laten het niet aan de andere kant hangen.
 */
function redactSecret(text: string, secret: string): string {
  return secret ? text.split(secret).join("***") : text;
}

/**
 * Doet één tokenaanvraag. RFC 6749 schrijft een form-encoded body voor, maar
 * Auth0-gebaseerde servers — en Locksmith lijkt er zo een — accepteren vaak
 * alleen JSON. We proberen daarom de standaard eerst en vallen bij een
 * body-gerelateerde afwijzing (400/415) terug op JSON, zodat de integratie
 * werkt zonder dat we vooraf weten welke variant Locksmith verwacht.
 */
async function requestToken(config: LocksmithConfig): Promise<TokenResponse> {
  const payload = {
    grant_type: "client_credentials",
    client_id: config.clientId,
    client_secret: config.clientSecret,
    audience: config.audience,
  };

  const attempts: { contentType: string; body: string }[] = [
    { contentType: "application/x-www-form-urlencoded", body: new URLSearchParams(payload).toString() },
    { contentType: "application/json", body: JSON.stringify(payload) },
  ];

  const failures: string[] = [];

  for (const [index, attempt] of attempts.entries()) {
    const res = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": attempt.contentType, Accept: "application/json" },
      body: attempt.body,
      cache: "no-store",
    });

    if (res.ok) {
      const data = (await res.json()) as TokenResponse;
      if (!data.access_token) {
        throw new RingsideAuthError("Locksmith gaf een antwoord zonder access_token terug.");
      }
      return data;
    }

    // Afgeknipt en ontdaan van het secret: deze tekst gaat naar de log en naar
    // de diagnose-endpoint.
    const detail = redactSecret((await res.text()).slice(0, 300), config.clientSecret);
    failures.push(`${attempt.contentType}: ${res.status} ${res.statusText}${detail ? ` — ${detail}` : ""}`);

    const bodyFormatRejected = res.status === 400 || res.status === 415;
    if (!bodyFormatRejected || index === attempts.length - 1) break;
  }

  // Bewust de láátste mislukking voorop: viel de fallback aan, dan is die
  // poging de inhoudelijke ("invalid_client" bij een fout secret) en zegt de
  // eerste alleen iets over het body-formaat.
  throw new RingsideAuthError(
    `Locksmith authenticatie mislukt — ${failures[failures.length - 1]}` +
      (failures.length > 1 ? ` [eerdere poging — ${failures[0]}]` : "")
  );
}

async function fetchAndCacheToken(): Promise<CachedToken> {
  const config = getLocksmithConfig();
  const data = await requestToken(config);
  const expiresIn = data.expires_in ?? 3600;

  const cached: CachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + Math.max(expiresIn - EXPIRY_MARGIN_SECONDS, 1) * 1000,
    meta: {
      tokenType: data.token_type ?? "Bearer",
      expiresIn,
      scope: data.scope ?? null,
    },
  };

  tokenCache = cached;
  return cached;
}

/**
 * Geeft een geldig access token terug: uit de cache wanneer dat kan, anders via
 * een nieuwe Locksmith-aanvraag.
 */
export async function getRingsideToken(): Promise<string> {
  return (await getCachedToken()).token;
}

async function getCachedToken(): Promise<CachedToken> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache;
  inFlight ??= fetchAndCacheToken().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

/**
 * Niet-gevoelige metadata over het huidige token, voor de diagnose-endpoint.
 * Het token zelf verlaat deze module nooit anders dan als Authorization-header.
 */
export async function getRingsideTokenInfo(): Promise<{
  tokenType: string;
  expiresIn: number;
  scope: string | null;
  expiresAt: string;
}> {
  const cached = await getCachedToken();
  return { ...cached.meta, expiresAt: new Date(cached.expiresAt).toISOString() };
}

/** Gooit de cache weg zodat de volgende call een vers token ophaalt. */
export function resetRingsideToken(): void {
  tokenCache = null;
}
