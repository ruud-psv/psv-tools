import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { CopyField } from "@/components/copy-field";

/**
 * Autorisatiestap voor de Google Ads-koppeling van het Paid Ads dashboard.
 *
 * Google geeft alleen een refresh token uit bij een verse toestemming, en dat
 * token hoort onlosmakelijk bij de OAuth-client waarmee het is aangevraagd.
 * Werken client-ID, secret en refresh token niet als drietal samen, dan weigert
 * Google met `invalid_grant` of `invalid_client` — meldingen die niet verraden
 * wélke van de drie de boosdoener is. Vandaar deze pagina: hij maakt het token
 * aan met precies de client die in Vercel staat, zodat het drietal per definitie
 * bij elkaar hoort.
 *
 * Dit adres staat als omleidings-URI bij de OAuth-client geregistreerd. Zonder
 * `code` toont de pagina de startknop; mét `code` wisselt hij die in.
 *
 * Na het inwisselen wordt `customers:listAccessibleCustomers` aangeroepen. Dat
 * bewijst in één klap dat het token werkt én levert de account-ID's waaruit
 * `GOOGLE_ADS_CUSTOMER_ID` gekozen moet worden — precies de waarde die anders
 * verward wordt met het MCC-nummer.
 *
 * Benodigde environment variabelen:
 *   GOOGLE_ADS_CLIENT_ID        OAuth-client uit Google Cloud.
 *   GOOGLE_ADS_CLIENT_SECRET    Bijbehorend secret.
 *   GOOGLE_ADS_DEVELOPER_TOKEN  Nodig voor de controle-aanroep.
 *
 * Zie `lib/paid-ads/connectors/google.ts` voor waar de uitkomst terechtkomt.
 */

export const metadata = {
  title: "Google Ads koppelen | PSV Tools",
};

/** Een autorisatiecode is eenmalig; cachen zou onzin opleveren. */
export const dynamic = "force-dynamic";

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const ADS_HOST = "https://googleads.googleapis.com";
/** Zie de toelichting bij dezelfde constante in `lib/paid-ads/connectors/google.ts`. */
const DEFAULT_API_VERSION = "v22";
const SCOPE = "https://www.googleapis.com/auth/adwords";
const REDIRECT_PATH = "/dashboard/auth/google/callback";

interface TokenResponse {
  refresh_token?: string;
  access_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Wisselt de autorisatiecode in. Bij een fout komt alleen Googles eigen
 * `error`/`error_description` in beeld en nooit de ruwe body, zodat er niets
 * uit het verzoek terugkaatst naar het scherm.
 */
async function exchangeCode(
  clientId: string,
  clientSecret: string,
  code: string,
  redirectUri: string
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    return { error: "onleesbaar", error_description: `Google antwoordde onleesbaar (${res.status}).` };
  }
}

/**
 * Haalt de accounts op die dit token mag lezen. Dubbele functie: het bewijst
 * dat het token werkt, en het toont de account-ID's die in
 * `GOOGLE_ADS_CUSTOMER_ID` horen.
 */
async function listAccessibleCustomers(
  accessToken: string,
  developerToken: string,
  apiVersion: string
): Promise<{ ok: boolean; message: string; customerIds: string[] }> {
  try {
    const res = await fetch(`${ADS_HOST}/${apiVersion}/customers:listAccessibleCustomers`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "developer-token": developerToken,
        Accept: "application/json",
      },
      cache: "no-store",
    });

    const text = await res.text();
    let body: { resourceNames?: string[]; error?: { message?: string } };
    try {
      body = JSON.parse(text);
    } catch {
      // Een uitgefaseerde API-versie geeft geen JSON-fout maar een HTML-404.
      return {
        ok: false,
        message: `Google Ads antwoordde onleesbaar (${res.status}). Bestaat versie ${apiVersion} nog?`,
        customerIds: [],
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        message: body.error?.message ?? `Google Ads gaf status ${res.status}.`,
        customerIds: [],
      };
    }

    // "customers/1234567890" → "1234567890"
    const customerIds = (body.resourceNames ?? []).map((name) => name.split("/").pop() ?? name);
    return {
      ok: true,
      message: "De Google Ads API accepteert dit token.",
      customerIds,
    };
  } catch {
    return { ok: false, message: "Google Ads was niet bereikbaar voor de controle.", customerIds: [] };
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="mb-2 text-3xl">Google Ads koppelen</h1>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        Vraagt namens de PSV-app een refresh token aan bij Google en controleert meteen welke
        advertentieaccounts ermee te lezen zijn.
      </p>
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}

export default async function GoogleCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const rawCode = params.code;
  const code = Array.isArray(rawCode) ? rawCode[0] : rawCode;
  const rawError = params.error;
  const oauthError = Array.isArray(rawError) ? rawError[0] : rawError;

  const clientId = readEnv("GOOGLE_ADS_CLIENT_ID");
  const clientSecret = readEnv("GOOGLE_ADS_CLIENT_SECRET");
  const developerToken = readEnv("GOOGLE_ADS_DEVELOPER_TOKEN");
  const apiVersion = readEnv("GOOGLE_ADS_API_VERSION") ?? DEFAULT_API_VERSION;

  if (!clientId || !clientSecret || !developerToken) {
    const missing = [
      !clientId && "GOOGLE_ADS_CLIENT_ID",
      !clientSecret && "GOOGLE_ADS_CLIENT_SECRET",
      !developerToken && "GOOGLE_ADS_DEVELOPER_TOKEN",
    ]
      .filter(Boolean)
      .join(", ");
    return (
      <Shell>
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Deze pagina is nog niet ingesteld</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ontbrekend: {missing}. Zet deze als environment variable in Vercel en deploy
                opnieuw.
              </p>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const requestHeaders = await headers();
  const proto = requestHeaders.get("x-forwarded-proto") ?? "https";
  const host = requestHeaders.get("host") ?? "";
  const redirectUri = `${proto}://${host}${REDIRECT_PATH}`;

  // `access_type=offline` met `prompt=consent` is wat een refresh token oplevert:
  // zonder die twee geeft Google alleen een access token van een uur, en bij een
  // herhaalde toestemming zelfs helemaal geen refresh token meer.
  const authUrl =
    `${AUTH_URL}?client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&response_type=code&scope=${encodeURIComponent(SCOPE)}` +
    `&access_type=offline&prompt=consent`;

  const StartCard = (
    <Card>
      <CardContent className="py-6">
        <div className="flex items-start gap-3">
          <Plug className="mt-0.5 h-5 w-5 shrink-0 text-psv-red-primary" />
          <div>
            <p className="font-medium">Start de autorisatie</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Log in met het Google-account dat toegang heeft tot het PSV Ads-account. Verschijnt
              er een waarschuwing dat de app niet is geverifieerd, klik dan door via
              &quot;Geavanceerd&quot;. Daarna kom je hier terug met de waarden voor Vercel.
            </p>
          </div>
        </div>
        <a
          href={authUrl}
          className="mt-5 inline-flex items-center rounded-md bg-psv-red-primary px-5 py-2.5 font-heading text-sm uppercase tracking-wide text-white transition-opacity hover:opacity-90"
        >
          Autoriseren bij Google
        </a>
      </CardContent>
    </Card>
  );

  if (oauthError) {
    return (
      <Shell>
        <Card className="mb-4 border-destructive">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div>
              <p className="font-medium">Google heeft de toestemming afgebroken</p>
              <p className="mt-1 text-sm text-muted-foreground">Melding: {oauthError}</p>
            </div>
          </CardContent>
        </Card>
        {StartCard}
      </Shell>
    );
  }

  if (!code) {
    return <Shell>{StartCard}</Shell>;
  }

  const result = await exchangeCode(clientId, clientSecret, code, redirectUri);

  if (result.error || !result.refresh_token) {
    return (
      <Shell>
        <Card className="mb-4 border-destructive">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium">Inwisselen mislukt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                {result.error
                  ? `Google antwoordde: ${result.error_description ?? result.error}.`
                  : "Google gaf wel toegang, maar geen refresh token terug."}
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Een autorisatiecode werkt maar één keer. Deze pagina herladen werkt daarom niet —
                begin opnieuw.
              </p>
            </div>
          </CardContent>
        </Card>
        {StartCard}
      </Shell>
    );
  }

  const check = result.access_token
    ? await listAccessibleCustomers(result.access_token, developerToken, apiVersion)
    : null;

  return (
    <Shell>
      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">Gelukt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zet het refresh token in Vercel en deploy opnieuw.
              </p>
            </div>
          </div>

          {check && (
            <div
              className={cn(
                "rounded-md border px-3.5 py-3 text-sm",
                check.ok
                  ? "border-success/40 bg-success-bg/40 text-success"
                  : "border-warning/50 bg-warning-bg/40 text-warning"
              )}
            >
              {check.ok ? "Token getest en werkend — " : "Token getest, maar afgewezen — "}
              {check.message}
            </div>
          )}

          <CopyField label="GOOGLE_ADS_REFRESH_TOKEN" value={result.refresh_token} masked />

          {check && check.customerIds.length > 0 && (
            <>
              <p className="text-xs text-muted-foreground">
                {check.customerIds.length === 1
                  ? "Dit account is direct toegankelijk met dit token. Let op: is dit jullie managersaccount (MCC), dan hoort dit nummer in GOOGLE_ADS_LOGIN_CUSTOMER_ID en moet GOOGLE_ADS_CUSTOMER_ID het advertentieaccount eronder zijn — die verschijnen hier niet."
                  : "Deze accounts zijn direct toegankelijk met dit token. Neem het advertentieaccount over — niet het MCC-nummer, dat hoort in GOOGLE_ADS_LOGIN_CUSTOMER_ID."}
              </p>
              {check.customerIds.map((id) => (
                <CopyField key={id} label="GOOGLE_ADS_CUSTOMER_ID" value={id} />
              ))}
            </>
          )}
        </CardContent>
      </Card>
    </Shell>
  );
}
