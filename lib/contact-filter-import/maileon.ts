/**
 * Contact Filter Import: welk veld in Maileon bij welk soort ID hoort
 * (Contacts › Contact fields, oktober 2026).
 *
 * - **Relatienummer:** custom veld `MEMBERNUMBERPRIOR`, net als bij
 *   Aangrenzende stoelen. Dat werkt.
 * - **SSO-ID:** custom veld `SSOID` (tekst). Ongeveer 20% van de contacten
 *   heeft er een.
 * - **GroupID:** de External ID, een standaardveld van Maileon zelf ("Standard,
 *   system defined"; bijna elk contact heeft er een). Hoe het
 *   contactfilter-schema dat veld noemt, staat niet in de documentatie die we
 *   hebben. De schrijfwijzen in `EXTERNAL_ID_FIELDS` worden op volgorde
 *   geprobeerd; alleen bij een 400 gaat het naar de volgende, en de log en de
 *   pagina noemen welke Maileon accepteerde.
 */

import { createContactFilter, MaileonError, RELATION_NUMBER_FIELD } from "@/lib/maileon/contact-filters";
import type { IdType } from "./ids";

export const SSO_ID_FIELD = "SSOID";

/** Schrijfwijzen voor de External ID, op volgorde van waarschijnlijkheid. */
export const EXTERNAL_ID_FIELDS = ["EXTERNAL_ID", "external_id", "EXTERNAL-ID"] as const;

/** Per soort ID: de naam op de pagina, en de veldnamen die op volgorde worden geprobeerd. */
export const MAILEON_FIELDS: Record<IdType, { label: string; fields: readonly string[] }> = {
  relatienummer: { label: RELATION_NUMBER_FIELD, fields: [RELATION_NUMBER_FIELD] },
  "sso-id": { label: SSO_ID_FIELD, fields: [SSO_ID_FIELD] },
  groupid: { label: "External ID", fields: EXTERNAL_ID_FIELDS },
};

/**
 * Maakt het filter op het eerste veld dat Maileon accepteert. Een 400 betekent
 * "dit filter klopt niet"; elke andere fout stopt meteen.
 */
export async function createFilterOnFirstField(
  name: string,
  fields: readonly string[],
  values: readonly string[]
): Promise<{ contactFilterId: number; field: string }> {
  let lastError: MaileonError | null = null;
  for (const field of fields) {
    try {
      return { contactFilterId: await createContactFilter(name, field, values), field };
    } catch (error) {
      if (!(error instanceof MaileonError && error.status === 400)) throw error;
      console.warn(`[contact-filter-import] Maileon wees het veld ${field} af: ${error.message}`);
      lastError = error;
    }
  }
  if (!lastError) throw new Error("Er is geen veld om op te filteren.");
  if (fields.length === 1) throw lastError;
  throw new Error(`Maileon wees het filter af op elk geprobeerd veld (${fields.join(", ")}). ${lastError.message}`);
}
