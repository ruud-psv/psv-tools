/**
 * De gedeelde modellenlijst van een beeldtool: modellen die iemand via "Model
 * toevoegen" in de dropdown heeft gezet. Elke tool heeft zijn eigen lijst,
 * onder zijn eigen prefix in Vercel Blob.
 */

import { del, get, list, put } from "@vercel/blob";

import type { BewaardModel } from "@/lib/replicate/model";
import { meldOpslagfout } from "./beelden";

export interface ModellenOpslag {
  lijst(): Promise<BewaardModel[]>;
  bewaar(model: BewaardModel): Promise<void>;
  verwijder(id: string, versie?: string): Promise<void>;
}

/** @param prefix bijvoorbeeld `kleurplaat/modellen/` */
export function modellenOpslag(prefix: string): ModellenOpslag {
  /**
   * `openai/gpt-image-1.5` wordt `openai~gpt-image-1.5.json`. De tilde en de apenstaart
   * komen niet voor in een Replicate-modelnaam, dus het pad blijft eenduidig.
   */
  function modelPad(id: string, versie?: string): string {
    return `${prefix}${id.replace(/\//g, "~")}${versie ? `@${versie}` : ""}.json`;
  }

  return {
    async lijst() {
      let paden: string[];
      try {
        const { blobs } = await list({ prefix });
        paden = blobs.map((b) => b.pathname);
      } catch (err) {
        meldOpslagfout(err);
      }

      const modellen = await Promise.all(
        paden.map(async (pad) => {
          try {
            const resultaat = await get(pad, { access: "private", useCache: false });
            if (!resultaat?.stream) return null;
            const tekst = await new Response(resultaat.stream).text();
            const model = JSON.parse(tekst) as BewaardModel;
            return model?.id ? model : null;
          } catch {
            return null;
          }
        })
      );

      return modellen
        .filter((m): m is BewaardModel => m !== null)
        .sort((a, b) => a.label.localeCompare(b.label));
    },

    async bewaar(model) {
      try {
        await put(modelPad(model.id, model.versie), JSON.stringify(model), {
          access: "private",
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: "application/json",
        });
      } catch (err) {
        meldOpslagfout(err);
      }
    },

    async verwijder(id, versie) {
      try {
        await del(modelPad(id, versie));
      } catch (err) {
        meldOpslagfout(err);
      }
    },
  };
}
