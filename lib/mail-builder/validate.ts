import type { MailBuilderState } from "@/components/mail-builder-form";

/**
 * Een URL is geldig als hij over https gaat, een echte host heeft en geen
 * spaties of Maileon-tokens bevat. Een adres zonder schema krijgt https://,
 * net als bij de export; wie expliciet http:// typt krijgt een melding.
 */
export function isGeldigeUrl(url: string | undefined): boolean {
  const u = (url ?? "").trim();
  if (!u || /\s/.test(u) || u.includes("[[")) return false;
  const metSchema = /^[a-z][a-z0-9+.-]*:/i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(metSchema);
    if (parsed.protocol !== "https:") return false;
    return /^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(parsed.hostname);
  } catch {
    return false;
  }
}

function checkUrl(problemen: string[], waar: string, url: string | undefined) {
  const u = (url ?? "").trim();
  if (!u) problemen.push(`${waar}: link ontbreekt`);
  else if (!isGeldigeUrl(u)) problemen.push(`${waar}: "${u}" is geen geldige https-URL`);
}

/**
 * Wat er nog ontbreekt voordat de mail gedownload mag worden: elke afbeelding
 * met alt-tekst en klik-link, elke knop met een geldige link, en een mailnaam
 * voor het overzicht.
 *
 * De regels zijn geschreven voor het pre-match template; de overige templates
 * staan uit. Komen die terug, dan hebben hun eigen blokken hier ook een
 * controle nodig.
 */
export function mailProblemen(state: MailBuilderState): string[] {
  const problemen: string[] = [];

  if (!(state.mailNaam ?? "").trim()) problemen.push("Mailnaam ontbreekt");

  if (!(state.heroPreviewUrl ?? "").trim()) problemen.push("Headerbeeld: afbeelding ontbreekt");
  if (!(state.heroAlt ?? "").trim()) problemen.push("Headerbeeld: alt-tekst ontbreekt");
  checkUrl(problemen, "Headerbeeld", state.heroLink);

  if (state.template !== "prematch") return problemen;

  if (state.prematchHeeftCta) {
    if (!(state.prematchCtaLabel ?? "").trim()) problemen.push("Knop onder de header: tekst ontbreekt");
    checkUrl(problemen, "Knop onder de header", state.prematchCtaUrl);
  }

  state.prematchBlocks.forEach((block, i) => {
    const waar = `Blok ${i + 1} (${block.type === "content" ? "content" : "banmail"})`;
    if (!block.imageUrl.trim()) problemen.push(`${waar}: afbeelding ontbreekt`);
    if (!block.imageAlt.trim()) problemen.push(`${waar}: alt-tekst ontbreekt`);
    checkUrl(problemen, `${waar} afbeelding`, block.imageLink);
    if (block.type === "content") {
      if (!block.titel.trim()) problemen.push(`${waar}: titel ontbreekt`);
      if (block.heeftCta) {
        if (!block.ctaLabel.trim()) problemen.push(`${waar}: knoptekst ontbreekt`);
        checkUrl(problemen, `${waar} knop`, block.ctaUrl);
      }
    }
  });

  if (!(state.prematchFooterPreviewUrl ?? "").trim()) problemen.push("Footerbeeld: afbeelding ontbreekt");
  if (!(state.prematchFooterAlt ?? "").trim()) problemen.push("Footerbeeld: alt-tekst ontbreekt");

  return problemen;
}
