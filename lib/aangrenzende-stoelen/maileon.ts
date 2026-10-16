/**
 * Doorzetten naar Maileon: de lijst wordt een contactfilter op relatienummer.
 * Er gaan alleen relatienummers naar Maileon; Maileon kent de contacten zelf al.
 * Het maken van het filter zelf staat in `lib/maileon/contact-filters.ts`.
 *
 * Kaartverkoop mag alleen contacten mailen met de preference Ticketing op ja
 * (preference group `Email`, preference `Ticketing`; op de voorkeurenpagina
 * "PSV Kaartverkoop thuiswedstrijden"). De API wijst elk filter met een
 * `contactpreference`-regel af ("Unable to create the contact filter", getest
 * op 2026-10-13 in drie vormen, ook de exacte vorm uit de wiki). Daarom maakt
 * de tool alleen het filter op relatienummers, zonder doelgroep: de
 * Ticketing-regel en de doelgroep voegt Digital Marketing in Maileon zelf toe.
 * Zo kan niemand per ongeluk mailen naar een doelgroep zonder die regel.
 */

import { filterName } from "@/lib/maileon/contact-filters";

export interface MaileonNameInput {
  /** Verzenddatum als `yyyy-mm-dd`. */
  sendDate: string;
  eventName: string;
  dmid: string;
}

/**
 * De naam volgens de conventie van Digital Marketing, voor filter en doelgroep:
 * `2026.10.31 PSV Kaartverkoop - Aangrenzende stoelen PSV - Willem II - DMID26-12345`.
 */
export function maileonName({ sendDate, eventName, dmid }: MaileonNameInput): string {
  return filterName({ sendDate, title: `PSV Kaartverkoop - Aangrenzende stoelen ${eventName}`, dmid });
}
