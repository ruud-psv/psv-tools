import { NextRequest, NextResponse } from "next/server";

import { getAccess } from "@/lib/access-store";
import { requireEmail } from "@/lib/api-session";
import {
  ConceptFout,
  conceptNaam,
  controleerInvoer,
  maileonConceptApi,
  voorbeeldUitExport,
  zetConcept,
  type ConceptUitkomst,
  type MaileonConceptApi,
} from "@/lib/maileon/concept";
import { conceptSleutel, getConcept, nieuwVoorbeeldId, saveConcept, saveVoorbeeld } from "@/lib/maileon/concept-opslag";
import { MaileonConfigError, MaileonFout, maileonConfig } from "@/lib/maileon/rapport";

/**
 * Zet een mail uit de Mail Builder als concept in Maileon en maakt er een
 * voorbeeldlink bij. Hoort bij de testpagina `/marnix/maileon-concept`, buiten
 * het menu. Versturen, inplannen en de doelgroep blijven in Maileon; zie
 * `lib/maileon/concept.ts` en `docs/maileon-concept.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function alleenAdmins(req: NextRequest): Promise<{ email: string } | { error: NextResponse }> {
  const sessie = requireEmail(req);
  if ("error" in sessie) return sessie;
  // De middleware laat /api/marnix alleen door voor admins. Hier nog eens,
  // omdat deze route naar Maileon schrijft.
  if (!(await getAccess(sessie.email)).isAdmin) {
    return { error: NextResponse.json({ error: "Deze pagina is alleen voor admins." }, { status: 403 }) };
  }
  return sessie;
}

function linkNaar(voorbeeldId: string): string {
  return `/share/mail/${voorbeeldId}`;
}

/** Staat er al een concept voor deze DMID (of naam)? Voor de pagina, vóór het zetten. */
export async function GET(req: NextRequest) {
  const sessie = await alleenAdmins(req);
  if ("error" in sessie) return sessie.error;

  const dmid = req.nextUrl.searchParams.get("dmid")?.trim() ?? "";
  const naam = conceptNaam(req.nextUrl.searchParams.get("naam") ?? "", dmid);
  if (!dmid && naam.length < 3) return NextResponse.json({ concept: null });

  const record = await getConcept(conceptSleutel(dmid || undefined, naam)).catch(() => null);
  if (!record) return NextResponse.json({ concept: null });
  return NextResponse.json({
    concept: {
      mailingId: record.mailingId,
      naam: record.naam,
      bijgewerkt: record.bijgewerkt,
      voorbeeldUrl: linkNaar(record.voorbeeldId),
    },
  });
}

export async function POST(req: NextRequest) {
  const sessie = await alleenAdmins(req);
  if ("error" in sessie) return sessie.error;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Ongeldige invoer." }, { status: 400 });
  }
  const invoer = controleerInvoer(body);
  if ("fout" in invoer) return NextResponse.json({ error: invoer.fout }, { status: 400 });

  let api: MaileonConceptApi;
  try {
    api = maileonConceptApi(maileonConfig());
  } catch (err) {
    const melding = err instanceof MaileonConfigError ? err.message : "Maileon-configuratie ontbreekt.";
    console.error(`[marnix/maileon-concept] ${melding}`);
    return NextResponse.json({ error: melding }, { status: 500 });
  }

  const sleutel = conceptSleutel(invoer.dmid, invoer.naam);
  const bestaand = await getConcept(sleutel).catch(() => null);
  const eerder = invoer.nieuw ? null : bestaand;

  let uitkomst: ConceptUitkomst;
  try {
    uitkomst = await zetConcept(api, invoer, eerder ? { mailingId: eerder.mailingId, hash: eerder.hash } : undefined);
  } catch (err) {
    if (err instanceof ConceptFout) {
      return NextResponse.json({ error: err.message, code: err.code, mailingId: eerder?.mailingId }, { status: err.status });
    }
    if (err instanceof MaileonFout) {
      console.error(`[marnix/maileon-concept] Maileon ${err.status}: ${err.message}`);
      return NextResponse.json({ error: `Maileon gaf een fout (${err.status}): ${err.message}` }, { status: 502 });
    }
    console.error("[marnix/maileon-concept] Maileon niet bereikbaar:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Maileon is niet bereikbaar. Probeer het zo nog eens." }, { status: 502 });
  }

  // Het voorbeeld van Maileon zelf, met een algemeen contact; lukt dat niet,
  // dan een voorbeeld uit de export.
  let maileonHtml: string | null = null;
  try {
    maileonHtml = await api.leesVoorbeeld(uitkomst.mailingId);
  } catch (err) {
    console.warn(`[marnix/maileon-concept] geen voorbeeld van Maileon voor ${uitkomst.mailingId}:`, err instanceof Error ? err.message : err);
  }
  const bron = maileonHtml ? "maileon" : "export";
  const html = maileonHtml ?? voorbeeldUitExport(invoer.html, invoer.onderwerp, invoer.previewTekst);

  const nu = new Date().toISOString();
  // Dezelfde link voor dezelfde mail, ook bij een nieuw concept: zo blijft een link in Asana werken.
  const voorbeeldId = bestaand?.voorbeeldId ?? nieuwVoorbeeldId();
  try {
    await saveVoorbeeld({ id: voorbeeldId, html, bron, mailingId: uitkomst.mailingId, bijgewerkt: nu });
    await saveConcept({
      sleutel,
      naam: invoer.naam,
      ...(invoer.dmid && { dmid: invoer.dmid }),
      mailingId: uitkomst.mailingId,
      hash: uitkomst.hash,
      voorbeeldId,
      aangemaakt: bestaand && !uitkomst.nieuw ? bestaand.aangemaakt : nu,
      bijgewerkt: nu,
      door: sessie.email,
    });
  } catch (err) {
    console.error("[marnix/maileon-concept] bewaren mislukt:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      {
        error: `Het concept staat in Maileon (mailing ${uitkomst.mailingId}), maar PSV Tools kon het niet bewaren. Er is geen voorbeeldlink, en de volgende keer komt er een nieuw concept.`,
        mailingId: uitkomst.mailingId,
      },
      { status: 500 }
    );
  }

  console.info(`[marnix/maileon-concept] mailing ${uitkomst.mailingId} ${uitkomst.nieuw ? "aangemaakt" : "bijgewerkt"}, voorbeeld uit ${bron}`);
  return NextResponse.json({
    mailingId: uitkomst.mailingId,
    naam: invoer.naam,
    nieuw: uitkomst.nieuw,
    vervangen: uitkomst.vervangen,
    voorbeeldUrl: linkNaar(voorbeeldId),
    voorbeeldBron: bron,
    bijgewerkt: nu,
  });
}
