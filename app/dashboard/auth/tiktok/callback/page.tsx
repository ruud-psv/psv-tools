import type { ReactNode } from "react";
import { headers } from "next/headers";
import { AlertTriangle, CheckCircle2, Plug } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { CopyField } from "./copy-field";

/**
 * Autorisatiestap voor de TikTok-koppeling van het Paid Ads dashboard.
 *
 * TikTok bindt de rechten van een token aan het moment van autoriseren, niet aan
 * de token zelf. Krijgt de app er een scope bij, dan moet het advertentieaccount
 * opnieuw toestemming geven én moet er een nieuwe token komen — een bestaande
 * token blijft anders met de oude rechten werken.
 *
 * Die uitwisseling vraagt het app-secret. Dat hoort niet in een terminal of een
 * chatvenster thuis, dus doet deze pagina hem server-side.
 *
 * Dit adres staat als redirect-URL bij de TikTok-app geregistreerd. Zonder
 * `auth_code` toont de pagina de startknop; mét `auth_code` wisselt hij die in
 * en laat het resultaat zien.
 *
 * Benodigde environment variabelen:
 *   TIKTOK_ADS_APP_ID       App-ID uit de TikTok for Business developer portal.
 *   TIKTOK_ADS_APP_SECRET   Bijbehorend secret.
 *
 * De token die hieruit komt hoort in `TIKTOK_ADS_ACCESS_TOKEN`, het nummer
 * daarnaast in `TIKTOK_ADS_ADVERTISER_ID`. Zie `lib/paid-ads/connectors/tiktok.ts`.
 */

export const metadata = {
  title: "TikTok koppelen | PSV Tools",
};

/** Een auth_code is eenmalig; een gecachete uitwisseling zou onzin opleveren. */
export const dynamic = "force-dynamic";

const PORTAL_AUTH_URL = "https://business-api.tiktok.com/portal/auth";
const TOKEN_ENDPOINT = "https://business-api.tiktok.com/open_api/v1.3/oauth2/access_token/";
const REDIRECT_PATH = "/dashboard/auth/tiktok/callback";

interface TokenResponse {
  code?: number;
  message?: string;
  data?: {
    access_token?: string;
    advertiser_ids?: string[];
    scope?: string[];
  };
}

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

/**
 * Wisselt de auth_code in voor een access token. Het antwoord van TikTok wordt
 * bewust niet ruw doorgegeven aan de pagina: bij een fout komt alleen de eigen
 * melding in beeld, zodat er nooit per ongeluk iets uit het verzoek terugkaatst.
 */
async function exchangeAuthCode(
  appId: string,
  secret: string,
  authCode: string
): Promise<TokenResponse> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, secret, auth_code: authCode }),
    cache: "no-store",
  });

  const text = await res.text();
  try {
    return JSON.parse(text) as TokenResponse;
  } catch {
    return { code: -1, message: `TikTok gaf een onleesbaar antwoord (${res.status}).` };
  }
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="mb-2 text-3xl">TikTok koppelen</h1>
      <p className="mb-6 max-w-2xl text-muted-foreground">
        Autoriseert het TikTok-advertentieaccount voor het Paid Ads dashboard en wisselt de
        toestemming in voor een access token.
      </p>
      <div className="max-w-2xl">{children}</div>
    </div>
  );
}

export default async function TikTokCallbackPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const raw = params.auth_code;
  const authCode = Array.isArray(raw) ? raw[0] : raw;

  const appId = readEnv("TIKTOK_ADS_APP_ID");
  const secret = readEnv("TIKTOK_ADS_APP_SECRET");

  if (!appId || !secret) {
    const missing = [!appId && "TIKTOK_ADS_APP_ID", !secret && "TIKTOK_ADS_APP_SECRET"]
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
                opnieuw. Het app-ID en het secret staan in de TikTok for Business developer
                portal, bij de app-details.
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

  const authUrl =
    `${PORTAL_AUTH_URL}?app_id=${encodeURIComponent(appId)}` +
    `&state=psv&redirect_uri=${encodeURIComponent(redirectUri)}`;

  // Nog geen toestemming gegeven: alleen de startknop tonen.
  if (!authCode) {
    return (
      <Shell>
        <Card>
          <CardContent className="py-6">
            <div className="flex items-start gap-3">
              <Plug className="mt-0.5 h-5 w-5 shrink-0 text-psv-red-primary" />
              <div>
                <p className="font-medium">Start de autorisatie</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Je gaat naar TikTok, kiest het PSV-advertentieaccount en keurt de toegang goed.
                  Daarna kom je hier terug en verschijnen de waarden voor Vercel.
                </p>
              </div>
            </div>
            <a
              href={authUrl}
              className="mt-5 inline-flex items-center rounded-md bg-psv-red-primary px-5 py-2.5 font-heading text-sm uppercase tracking-wide text-white transition-opacity hover:opacity-90"
            >
              Autoriseren bij TikTok
            </a>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const result = await exchangeAuthCode(appId, secret, authCode);
  const token = result.data?.access_token;

  if (result.code !== 0 || !token) {
    return (
      <Shell>
        <Card className="border-destructive">
          <CardContent className="flex items-start gap-3 py-4">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-destructive" />
            <div className="min-w-0">
              <p className="font-medium">Inwisselen mislukt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                TikTok antwoordde: {result.message ?? "onbekende fout"} (code {result.code ?? "?"}).
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Een auth_code werkt maar één keer en is enkele minuten geldig. Deze pagina
                herladen werkt daarom niet — begin opnieuw.
              </p>
              <a
                href={authUrl}
                className="mt-4 inline-flex items-center rounded-md border border-border px-4 py-2 font-heading text-sm uppercase tracking-wide transition-colors hover:bg-muted"
              >
                Opnieuw autoriseren
              </a>
            </div>
          </CardContent>
        </Card>
      </Shell>
    );
  }

  const advertiserIds = result.data?.advertiser_ids ?? [];
  const scopes = result.data?.scope ?? [];
  const hasReporting = scopes.some((s) => /report/i.test(s));

  return (
    <Shell>
      <Card>
        <CardContent className="space-y-5 py-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" />
            <div>
              <p className="font-medium">Gelukt</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Zet onderstaande waarden in Vercel en deploy opnieuw. Daarna haalt het dashboard
                TikTok-campagnes op.
              </p>
            </div>
          </div>

          <CopyField label="TIKTOK_ADS_ACCESS_TOKEN" value={token} masked />

          {advertiserIds.map((id) => (
            <CopyField key={id} label="TIKTOK_ADS_ADVERTISER_ID" value={id} />
          ))}

          <div>
            <p className="font-heading text-xs uppercase tracking-wide text-muted-foreground">
              Rechten van deze token
            </p>
            <p className="mt-1.5 text-sm">
              {scopes.length > 0 ? scopes.join(", ") : "TikTok gaf geen scopes terug."}
            </p>
            {!hasReporting && (
              <p className="mt-2 text-sm text-warning">
                Let op: er zit geen rapportagerecht in deze token. Zet Reporting aan bij de
                scopes van de app en autoriseer daarna opnieuw — zonder dat recht blijft het
                dashboard leeg.
              </p>
            )}
          </div>
        </CardContent>
      </Card>
    </Shell>
  );
}
