/**
 * De handelingen die opslag en rekenkern combineren, zodat de route handlers
 * dun blijven en het hertellen na een nieuwe bron-upload maar op één plek staat.
 */

import { analyzeCampaign, isStale } from "@/lib/database/analysis";
import {
  getCampaign,
  listCampaigns,
  readCampaignIndex,
  saveCampaign,
} from "@/lib/database/campaign-store";
import { getActiveVersion, readSourceIndex } from "@/lib/database/source-store";
import { HASH_VERSION } from "@/lib/database/index-format";
import type { Campaign } from "@/lib/database/types";

export class DatabaseError extends Error {
  readonly status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

/**
 * Telt één campagne opnieuw tegen de actieve bron en slaat het resultaat op.
 * De uitkomst bewaren in plaats van hem bij elke paginaweergave opnieuw
 * berekenen: het overzicht laadt dan zonder de bronindex aan te raken.
 */
export async function analyzeCampaignById(id: string): Promise<Campaign> {
  const campaign = await getCampaign(id);
  if (!campaign) throw new DatabaseError("Campagne niet gevonden.", 404);

  const version = await getActiveVersion();
  if (!version) {
    throw new DatabaseError(
      "Er is nog geen SSO-bronbestand geüpload om tegen te vergelijken."
    );
  }
  if (campaign.hashVersion !== version.hashVersion) {
    throw new DatabaseError(
      "Deze campagne is met een oudere versie van de tool ingelezen en kan niet tegen de huidige bron worden vergeleken. Upload het campagnebestand opnieuw."
    );
  }

  const [campaignIndex, sourceIndex] = await Promise.all([
    readCampaignIndex(id),
    readSourceIndex(version.id),
  ]);
  if (!campaignIndex) {
    throw new DatabaseError("De deelnemerslijst van deze campagne ontbreekt.", 404);
  }
  if (!sourceIndex) {
    throw new DatabaseError("Het bronbestand kon niet worden gelezen.", 500);
  }

  const updated: Campaign = {
    ...campaign,
    analysis: analyzeCampaign(campaignIndex, sourceIndex, campaign, version),
  };
  await saveCampaign(updated);
  return updated;
}

/**
 * Telt alle campagnes opnieuw. Bewust serieel: elke analyse leest dezelfde
 * bronindex, en die staat na de eerste in het geheugen van de function —
 * parallel starten zou hem meermaals tegelijk ophalen.
 */
export async function analyzeAllCampaigns(
  onlyStale = false
): Promise<{ updated: number; failed: { id: string; title: string; error: string }[] }> {
  const version = await getActiveVersion();
  if (!version) {
    throw new DatabaseError(
      "Er is nog geen SSO-bronbestand geüpload om tegen te vergelijken."
    );
  }

  const campaigns = await listCampaigns();
  const failed: { id: string; title: string; error: string }[] = [];
  let updated = 0;

  for (const campaign of campaigns) {
    if (onlyStale && !isStale(campaign, version.id)) continue;
    try {
      await analyzeCampaignById(campaign.id);
      updated++;
    } catch (err) {
      failed.push({
        id: campaign.id,
        title: campaign.title,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return { updated, failed };
}

/** Valideert de velden die een gebruiker van een campagne invult. */
export function parseCampaignFields(input: {
  title?: unknown;
  startDate?: unknown;
  endDate?: unknown;
}): { title: string; startDate: string; endDate: string } {
  const title = typeof input.title === "string" ? input.title.trim().slice(0, 200) : "";
  const startDate = typeof input.startDate === "string" ? input.startDate.trim() : "";
  const endDate = typeof input.endDate === "string" ? input.endDate.trim() : "";

  if (!title) throw new DatabaseError("Geef de campagne een titel.");
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso.test(startDate)) throw new DatabaseError("Ongeldige startdatum.");
  if (!iso.test(endDate)) throw new DatabaseError("Ongeldige einddatum.");
  if (endDate < startDate) {
    throw new DatabaseError("De einddatum ligt vóór de startdatum.");
  }

  return { title, startDate, endDate };
}

export { HASH_VERSION };
