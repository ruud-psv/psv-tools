import { BewarenFout, voorbeeldUitExport, zetConcept, type ConceptUitkomst, type MaileonConceptApi, type SchoneInvoer } from "./concept";
import { conceptSleutel, getConcept, nieuwVoorbeeldId, saveConcept, saveVoorbeeld } from "./concept-opslag";

/**
 * Concept in Maileon zetten, het voorbeeld ophalen en bewaren, en het concept
 * onthouden. Gedeeld door de knop op `/marnix/maileon-concept` en de automaat
 * voor het Asana-testproject. Fouten: `ConceptFout` en `MaileonFout` van
 * `zetConcept`, en `BewarenFout` als Maileon het concept al heeft maar PSV
 * Tools het niet kon bewaren.
 */

export interface GezetConcept extends ConceptUitkomst {
  naam: string;
  /** Pad van de voorbeeldlink, zoals `/share/mail/<id>`. */
  voorbeeldPad: string;
  voorbeeldBron: "maileon" | "export";
  bijgewerkt: string;
}

export function voorbeeldPad(voorbeeldId: string): string {
  return `/share/mail/${voorbeeldId}`;
}

export async function zetConceptMetVoorbeeld(api: MaileonConceptApi, invoer: SchoneInvoer, door: string): Promise<GezetConcept> {
  const sleutel = conceptSleutel(invoer.dmid, invoer.naam);
  const bestaand = await getConcept(sleutel).catch(() => null);
  const eerder = invoer.nieuw ? null : bestaand;

  const uitkomst = await zetConcept(api, invoer, eerder ? { mailingId: eerder.mailingId, hash: eerder.hash } : undefined);

  // Het voorbeeld van Maileon zelf, met een algemeen contact; lukt dat niet,
  // dan een voorbeeld uit de export.
  let maileonHtml: string | null = null;
  try {
    maileonHtml = await api.leesVoorbeeld(uitkomst.mailingId);
  } catch (err) {
    console.warn(`[maileon/concept] geen voorbeeld van Maileon voor ${uitkomst.mailingId}:`, err instanceof Error ? err.message : err);
  }
  const voorbeeldBron = maileonHtml ? "maileon" : "export";
  const html = maileonHtml ?? voorbeeldUitExport(invoer.html, invoer.onderwerp, invoer.previewTekst);

  const nu = new Date().toISOString();
  // Dezelfde link voor dezelfde mail, ook bij een nieuw concept: zo blijft een link in Asana werken.
  const voorbeeldId = bestaand?.voorbeeldId ?? nieuwVoorbeeldId();
  try {
    await saveVoorbeeld({ id: voorbeeldId, html, bron: voorbeeldBron, mailingId: uitkomst.mailingId, bijgewerkt: nu });
    await saveConcept({
      sleutel,
      naam: invoer.naam,
      ...(invoer.dmid && { dmid: invoer.dmid }),
      mailingId: uitkomst.mailingId,
      hash: uitkomst.hash,
      voorbeeldId,
      aangemaakt: bestaand && !uitkomst.nieuw ? bestaand.aangemaakt : nu,
      bijgewerkt: nu,
      door,
    });
  } catch (err) {
    console.error("[maileon/concept] bewaren mislukt:", err instanceof Error ? err.message : err);
    throw new BewarenFout(uitkomst.mailingId);
  }

  return { ...uitkomst, naam: invoer.naam, voorbeeldPad: voorbeeldPad(voorbeeldId), voorbeeldBron, bijgewerkt: nu };
}
