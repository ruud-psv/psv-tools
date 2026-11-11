/**
 * De campagne opzoeken in Playable, voor de controle bij het openen: bestaat
 * hij, hoe heet hij, staat hij live, en waar staan de demo en de livepagina.
 * Alleen het recht `campaigns.view`.
 */

const BASE_URL = "https://api.playable.com";

export interface PlayableCampaign {
  id: number;
  name: string;
  type: string;
  active: boolean;
  demoUrl: string | null;
  liveUrl: string | null;
}

export type CampaignLookup =
  | { status: "gevonden"; campaign: PlayableCampaign }
  | { status: "niet-gevonden" }
  | { status: "fout"; message: string };

let tokenCache: { token: string; expiresAt: number } | null = null;

async function token(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.expiresAt) return tokenCache.token;
  const clientId = process.env.PLAYABLE_CLIENT_ID;
  const clientSecret = process.env.PLAYABLE_SECRET;
  if (!clientId || !clientSecret) throw new Error("PLAYABLE_CLIENT_ID of PLAYABLE_SECRET ontbreekt.");

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: ["campaigns.view"],
    }),
  });
  if (!res.ok) throw new Error(`Playable gaf geen toegang (${res.status}).`);
  const data = (await res.json()) as { access_token: string; expires_in?: number };
  // Playable vraagt tokens te hergebruiken zolang ze geldig zijn.
  tokenCache = { token: data.access_token, expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
  return tokenCache.token;
}

export async function lookupCampaign(campaignId: number): Promise<CampaignLookup> {
  try {
    const res = await fetch(`${BASE_URL}/v1/campaign/${campaignId}`, {
      headers: { Authorization: `Bearer ${await token()}`, Accept: "application/json" },
      cache: "no-store",
    });
    // Playable geeft voor een onbekende campagne 404, en soms 403 ("Unable to locate").
    if (res.status === 404 || res.status === 403) return { status: "niet-gevonden" };
    if (!res.ok) return { status: "fout", message: `Playable antwoordde met ${res.status}.` };
    const raw = ((await res.json()) as { data?: Record<string, unknown> }).data ?? {};
    return {
      status: "gevonden",
      campaign: {
        id: Number(raw.id ?? campaignId),
        name: String(raw.name ?? ""),
        type: String(raw.type ?? ""),
        active: Boolean(raw.active),
        demoUrl: raw.demo_url ? String(raw.demo_url) : null,
        liveUrl: raw.live_url ? String(raw.live_url) : null,
      },
    };
  } catch (err) {
    return { status: "fout", message: err instanceof Error ? err.message : String(err) };
  }
}
