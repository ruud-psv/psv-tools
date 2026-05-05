import { NextRequest, NextResponse } from "next/server";
import { authorize } from "@/lib/auth";

const BASE_URL = "https://api.playable.com";

let tokenCache: { token: string; expiresAt: number } | null = null;

async function getAccessToken(): Promise<string> {
  const clientId = process.env.PLAYABLE_CLIENT_ID;
  const clientSecret = process.env.PLAYABLE_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("PLAYABLE_CLIENT_ID of PLAYABLE_SECRET ontbreekt");
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
      scope: ["campaigns.view"],
    }),
  });

  if (!res.ok) throw new Error(`Playable auth mislukt (${res.status})`);

  const data = await res.json();
  tokenCache = {
    token: data.access_token,
    expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000,
  };

  return tokenCache.token;
}

export interface CampaignStatistics {
  sessions: number;
  registrations: number;
  unique_registration: number;
  conversion: number;
  devices: { desktop: number; tablet: number; mobile: number };
  engagement: { time_spent_average: number; total_time_spent: number };
  facebook: { shares: number; sessions_from_shares: number };
  tip_a_friend: number;
  realtime: { desktop: number; tablet: number; mobile: number };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const sessionCookie = request.cookies.get("psv_session")?.value;
  const authError = authorize(sessionCookie);
  if (authError) return NextResponse.json({ error: authError }, { status: 401 });

  const { id } = await params;
  const campaignId = parseInt(id, 10);
  if (isNaN(campaignId)) {
    return NextResponse.json({ error: "Ongeldig campaign ID" }, { status: 400 });
  }

  try {
    const token = await getAccessToken();
    const res = await fetch(`${BASE_URL}/v1/campaign/${campaignId}/statistics`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      return NextResponse.json({ error: `Statistieken ophalen mislukt (${res.status})` }, { status: res.status });
    }

    const json = await res.json();
    const raw = json.data ?? json ?? {};

    const stats: CampaignStatistics = {
      sessions: Number(raw.sessions ?? 0),
      registrations: Number(raw.registrations ?? 0),
      unique_registration: Number(raw.unique_registration ?? 0),
      conversion: Number(raw.conversion ?? 0),
      devices: {
        desktop: Number(raw.devices?.desktop ?? 0),
        tablet: Number(raw.devices?.tablet ?? 0),
        mobile: Number(raw.devices?.mobile ?? 0),
      },
      engagement: {
        time_spent_average: Number(raw.engagement?.time_spent_average ?? 0),
        total_time_spent: Number(raw.engagement?.total_time_spent ?? 0),
      },
      facebook: {
        shares: Number(raw.facebook?.shares ?? 0),
        sessions_from_shares: Number(raw.facebook?.sessions_from_shares ?? 0),
      },
      tip_a_friend: Number(raw.tip_a_friend ?? 0),
      realtime: {
        desktop: Number(raw.realtime?.desktop ?? 0),
        tablet: Number(raw.realtime?.tablet ?? 0),
        mobile: Number(raw.realtime?.mobile ?? 0),
      },
    };

    return NextResponse.json({ data: stats });
  } catch (err) {
    console.error("[playable/stats] Mislukt:", err);
    return NextResponse.json({ error: "Statistieken ophalen mislukt" }, { status: 502 });
  }
}
