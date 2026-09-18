import { NextRequest, NextResponse } from "next/server";
import { requireEmail } from "@/lib/api-session";
import { isStale } from "@/lib/database/analysis";
import {
  listCampaigns,
  newCampaignId,
  putCampaignIndex,
  saveCampaign,
} from "@/lib/database/campaign-store";
import {
  BYTES_PER_RECORD,
  HASH_VERSION,
  fromBytes,
} from "@/lib/database/index-format";
import { getSourceState } from "@/lib/database/source-store";
import {
  DatabaseError,
  analyzeCampaignById,
  parseCampaignFields,
} from "@/lib/database/service";
import type { Campaign } from "@/lib/database/types";

export const dynamic = "force-dynamic";

/** Ruim boven een campagne van een paar honderdduizend deelnemers, onder de
 *  body-limiet van een function. */
const MAX_INDEX_BYTES = 4 * 1024 * 1024;

export async function GET(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  try {
    const [campaigns, state] = await Promise.all([listCampaigns(), getSourceState()]);
    return NextResponse.json({
      campaigns,
      activeVersionId: state.activeVersionId,
      staleCount: campaigns.filter((c) => isStale(c, state.activeVersionId)).length,
    });
  } catch (err) {
    console.error("[database/campaigns] GET mislukt:", err);
    return NextResponse.json({ error: "Ophalen van campagnes mislukt." }, { status: 500 });
  }
}

/**
 * Neemt een nieuwe campagne aan: de metadata als JSON-veld en de in de browser
 * gebouwde deelnemersindex als binair veld. Direct daarna volgt de analyse,
 * zodat je na het uploaden meteen de uitkomst ziet in plaats van nog een knop.
 */
export async function POST(req: NextRequest) {
  const auth = requireEmail(req);
  if ("error" in auth) return auth.error;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Kon de upload niet verwerken." }, { status: 400 });
  }

  const rawMeta = form.get("meta");
  const rawIndex = form.get("index");
  if (typeof rawMeta !== "string" || !rawIndex || typeof rawIndex === "string") {
    return NextResponse.json({ error: "Onvolledige upload." }, { status: 400 });
  }

  let meta: Record<string, unknown>;
  try {
    meta = JSON.parse(rawMeta) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Ongeldige campagnegegevens." }, { status: 400 });
  }

  let fields: { title: string; startDate: string; endDate: string };
  try {
    fields = parseCampaignFields(meta);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const bytes = new Uint8Array(await rawIndex.arrayBuffer());
  if (bytes.byteLength === 0) {
    return NextResponse.json({ error: "Geen deelnemers ontvangen." }, { status: 400 });
  }
  if (bytes.byteLength > MAX_INDEX_BYTES) {
    return NextResponse.json(
      { error: "De deelnemerslijst is te groot om in één keer te versturen." },
      { status: 413 }
    );
  }
  if (bytes.byteLength % BYTES_PER_RECORD !== 0) {
    return NextResponse.json({ error: "Beschadigde deelnemerslijst." }, { status: 400 });
  }

  const index = fromBytes(bytes);
  const participations =
    typeof meta.participations === "number" && meta.participations >= index.count
      ? Math.floor(meta.participations)
      : index.count;

  const campaign: Campaign = {
    id: newCampaignId(),
    ...fields,
    createdAt: new Date().toISOString(),
    createdBy: auth.name || auth.email,
    fileName:
      typeof meta.fileName === "string" ? meta.fileName.trim().slice(0, 200) : "onbekend",
    participations,
    uniqueParticipants: index.count,
    rowsSkipped:
      typeof meta.rowsSkipped === "number" && meta.rowsSkipped >= 0
        ? Math.floor(meta.rowsSkipped)
        : 0,
    hashVersion: HASH_VERSION,
    analysis: null,
  };

  try {
    await putCampaignIndex(campaign.id, index);
    await saveCampaign(campaign);
  } catch (err) {
    console.error("[database/campaigns] opslaan mislukt:", err);
    return NextResponse.json({ error: "Opslaan van de campagne mislukt." }, { status: 500 });
  }

  // De campagne staat er; lukt de analyse niet (nog geen bron bijvoorbeeld),
  // dan is dat geen reden om de upload weg te gooien.
  try {
    return NextResponse.json({ campaign: await analyzeCampaignById(campaign.id) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const status = err instanceof DatabaseError ? err.status : 500;
    if (status >= 500) console.error("[database/campaigns] analyse mislukt:", message);
    return NextResponse.json({ campaign, warning: message });
  }
}
