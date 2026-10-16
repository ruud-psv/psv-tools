/**
 * Contact Filter Import: welk veld in Maileon bij welk soort ID hoort.
 *
 * - **Relatienummer:** custom veld `MEMBERNUMBERPRIOR`, net als bij
 *   Aangrenzende stoelen. Dat werkt.
 * - **GroupID:** de External ID van het contact (de Mail Builder geeft hem als
 *   `groupid` door aan Typeform). Dat is geen custom veld maar een vast gegeven
 *   van het contact. Hoe het contactfilter-schema dat veld noemt, staat niet
 *   in de documentatie die we hebben. De schrijfwijzen in `EXTERNAL_ID_FIELDS`
 *   worden op volgorde geprobeerd; alleen bij een 400 gaat het naar de
 *   volgende, en de log en de pagina noemen welke Maileon accepteerde.
 * - **SSO-ID:** een custom veld. De naam zoeken we op in Maileon: het veld dat
 *   zonder hoofdletters en leestekens `ssoid` heet.
 */

import {
  createContactFilter,
  getCustomFieldNames,
  MaileonError,
  RELATION_NUMBER_FIELD,
} from "@/lib/maileon/contact-filters";
import type { IdType } from "./ids";

/** Schrijfwijzen voor de External ID, op volgorde van waarschijnlijkheid. */
export const EXTERNAL_ID_FIELDS = ["EXTERNAL_ID", "external_id", "EXTERNAL-ID"] as const;

export type FieldPlan =
  /** `fields` worden op volgorde geprobeerd; `label` staat op de pagina. */
  | { ok: true; fields: string[]; label: string }
  | { ok: false; reason: string; similar: string[] };

/** Wat de pagina over het veld te zien krijgt: zonder de schrijfwijzen die nog geprobeerd worden. */
export type FieldStatus = { ok: true; label: string } | Extract<FieldPlan, { ok: false }>;

function fieldKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Het custom veld voor het SSO-ID, uit de namen van alle custom velden. */
export function ssoFieldPlan(customFields: readonly string[]): FieldPlan {
  const matches = customFields.filter((name) => fieldKey(name) === "ssoid");
  if (matches.length === 1) return { ok: true, fields: matches, label: matches[0] };
  const similar = customFields.filter((name) => fieldKey(name).includes("sso"));
  return {
    ok: false,
    reason:
      matches.length > 1
        ? `Maileon heeft meer dan één veld voor het SSO-ID (${matches.join(", ")}); welke het is, moet in de code worden vastgelegd.`
        : "Maileon heeft geen custom veld voor het SSO-ID.",
    similar: matches.length > 1 ? [] : similar,
  };
}

export async function fieldPlan(type: IdType): Promise<FieldPlan> {
  if (type === "relatienummer") return { ok: true, fields: [RELATION_NUMBER_FIELD], label: RELATION_NUMBER_FIELD };
  if (type === "groupid") return { ok: true, fields: [...EXTERNAL_ID_FIELDS], label: "External ID" };
  try {
    return ssoFieldPlan(await getCustomFieldNames());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, reason: `De velden in Maileon konden niet worden opgevraagd. ${message}`, similar: [] };
  }
}

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
