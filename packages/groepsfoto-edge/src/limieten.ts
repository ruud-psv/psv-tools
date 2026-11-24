/**
 * Limieten. Twee soorten, met elk hun beperking:
 *
 * - **Per dag** (de hele campagne): een teller in de privé opslag. Bunny
 *   Storage kan niet atomair ophogen; twee gelijktijdige aanvragen kunnen
 *   dezelfde stand lezen, dus de teller kan iets te laag uitvallen. Voor een
 *   dagplafond is dat acceptabel: de harde grens is de bestedingslimiet op de
 *   Replicate-sleutel.
 * - **Per IP per uur**: in het geheugen van één instantie van het script. Bunny
 *   draait meerdere instanties, dus dit remt één script vanaf één adres af,
 *   maar is geen harde grens. Zet daarvoor ook een rate limit-regel in Bunny
 *   Shield op dit pad.
 */

import type { Opslag } from "./opslag.ts";

/** De datum in Nederland, zodat "per dag" om middernacht hier omslaat. */
export function dagVan(nu: number): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(nu));
}

export const tellerPad = (campagne: string, dag: string) => `tellers/${campagne}/${dag}.json`;

export interface DagTeller {
  /** Hoog op als er nog ruimte is; `false` als het plafond bereikt is. */
  reserveer(campagne: string, plafond: number, nu: number): Promise<boolean>;
}

export function opslagDagTeller(opslag: Opslag): DagTeller {
  return {
    async reserveer(campagne, plafond, nu) {
      const pad = tellerPad(campagne, dagVan(nu));
      const ruw = await opslag.leesTekst(pad);
      let aantal = 0;
      if (ruw) {
        try {
          aantal = Number((JSON.parse(ruw) as { aantal?: unknown }).aantal) || 0;
        } catch {
          aantal = 0;
        }
      }
      if (aantal >= plafond) return false;
      await opslag.schrijf(pad, JSON.stringify({ aantal: aantal + 1, bijgewerkt: new Date(nu).toISOString() }), "application/json");
      return true;
    },
  };
}

const UUR = 60 * 60 * 1000;

/** Best-effort limiet per sleutel (IP) per uur, in het geheugen. */
export class GeheugenLimiet {
  private tijden = new Map<string, number[]>();

  probeer(sleutel: string, max: number, nu: number): boolean {
    const recent = (this.tijden.get(sleutel) ?? []).filter((t) => nu - t < UUR);
    if (recent.length >= max) {
      this.tijden.set(sleutel, recent);
      return false;
    }
    recent.push(nu);
    this.tijden.set(sleutel, recent);
    // Houd het geheugen klein: af en toe oude sleutels opruimen.
    if (this.tijden.size > 10_000) {
      for (const [k, v] of this.tijden) if (!v.some((t) => nu - t < UUR)) this.tijden.delete(k);
    }
    return true;
  }
}
