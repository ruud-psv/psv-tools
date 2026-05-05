import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";

const BASE_URL = "https://api.playable.com";

// Module-level token cache (persists per serverless instance)
let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PLAYABLE_CLIENT_ID;
  const clientSecret = process.env.PLAYABLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new ConfigError("PLAYABLE_CLIENT_ID of PLAYABLE_SECRET ontbreekt");
  }

  if (tokenCache && Date.now() < tokenCache.expiresAt) {
    return tokenCache.token;
  }

  const res = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
      scope: ["campaigns.list", "campaigns.view"],
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Playable authenticatie mislukt (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  // Cache with 60-second buffer before expiry
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };

  return tokenCache.token;
}

class ConfigError extends Error {}

async function playableFetch(path: string, params?: Record<string, string | string[]>): Promise<Response> {
  const token = await getAccessToken();
  const url = new URL(`${BASE_URL}${path}`);

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (Array.isArray(v)) {
        for (const item of v) url.searchParams.append(k, item);
      } else {
        url.searchParams.set(k, v);
      }
    }
  }

  return fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
}

/* ---------- Types ---------- */

export interface Campaign {
  id: number;
  name: string;
  type: string;
  active: boolean;
  active_from: string | null;
  active_to: string | null;
  live_url: string | null;
  demo_url: string | null;
  created_on: string;
  timezone: string;
}

export interface PlayableTotals {
  total: number;
  active: number;
  inactive: number;
}

/* ---------- Fetch all pages ---------- */

async function fetchAllCampaigns(): Promise<Campaign[]> {
  const campaigns: Campaign[] = [];
  let page = 1;

  while (true) {
    const res = await playableFetch("/v1/campaigns", {
      page: String(page),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Playable campaigns API fout (${res.status}): ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const items: Campaign[] = (data.data ?? []).map((c: Record<string, unknown>) => ({
      id: Number(c.id),
      name: String(c.name ?? ""),
      type: String(c.type ?? ""),
      active: Boolean(c.active),
      active_from: c.active_from ? String(c.active_from) : null,
      active_to: c.active_to ? String(c.active_to) : null,
      live_url: c.live_url ? String(c.live_url) : null,
      demo_url: c.demo_url ? String(c.demo_url) : null,
      created_on: String(c.created_on ?? ""),
      timezone: String(c.timezone ?? ""),
    }));

    campaigns.push(...items);

    // Stop when there's no next page
    if (!data.links?.next) break;
    page++;
  }

  return campaigns;
}

/* ---------- Route Handler ---------- */

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  try {
    const campaigns = await fetchAllCampaigns();

    // Sort: active first, then by created_on descending
    campaigns.sort((a, b) => {
      if (a.active !== b.active) return a.active ? -1 : 1;
      return b.created_on.localeCompare(a.created_on);
    });

    const active = campaigns.filter((c) => c.active);
    const totals: PlayableTotals = {
      total: campaigns.length,
      active: active.length,
      inactive: campaigns.length - active.length,
    };

    return NextResponse.json({ campaigns, totals, fetchedAt: new Date().toISOString() });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (err instanceof ConfigError) {
      console.error("[playable]", message);
      return NextResponse.json({ error: `Configuratie fout: ${message}` }, { status: 500 });
    }
    console.error("[playable] Data ophalen mislukt:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
