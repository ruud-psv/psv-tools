import { NextRequest, NextResponse } from "next/server";

import { AsanaConfigError, AsanaFout, TESTPROJECT, asanaApi, asanaConfig, isGid, type AsanaApi } from "@/lib/asana/client";
import { conceptReactie } from "@/lib/asana/reactie";
import { taakMetBrief } from "@/lib/asana/taak-brief";
import type { Punt } from "@/lib/asana/brief";
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
import { alleenAdmins } from "@/lib/marnix/toegang";

/**
 * Zet een mail uit de Mail Builder als concept in Maileon en maakt er een
 * voorbeeldlink bij. Hoort bij de testpagina `/marnix/maileon-concept`, buiten
 * het menu. Komt de mail uit een taak in het Asana-testproject
 * (`asanaTaakId`), dan zet de route daarna een reactie met de link op die
 * taak en verplaatst hij hem naar de sectie Feedback. Versturen, inplannen en
 * de doelgroep blijven in Maileon; zie `docs/maileon-concept.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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

interface AsanaUitkomst {
  reactie: boolean;
  sectie?: string;
  fout?: string;
}

/** Reactie op de taak en naar Feedback. Een fout hier laat het concept staan. */
async function meldInAsana(
  api: AsanaApi,
  taakGid: string,
  punten: Punt[],
  concept: { mailingId: number; naam: string; nieuw: boolean; voorbeeldUrl: string }
): Promise<AsanaUitkomst> {
  const uit: AsanaUitkomst = { reactie: false };
  try {
    await api.plaatsReactie(taakGid, conceptReactie({ ...concept, punten }));
    uit.reactie = true;
    const feedback = (await api.secties(TESTPROJECT)).find((s) => /^feedback$/i.test(s.naam.trim()));
    if (feedback) {
      await api.naarSectie(feedback.gid, taakGid);
      uit.sectie = feedback.naam;
    }
  } catch (err) {
    uit.fout = err instanceof AsanaFout ? `Asana gaf een fout (${err.status}): ${err.message}` : "Asana is niet bereikbaar.";
    console.error(`[marnix/maileon-concept] Asana-taak ${taakGid}: ${uit.fout}`);
  }
  return uit;
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

  // Komt de mail uit Asana? Dan eerst controleren dat de taak in het testproject staat.
  const ruwTaakId = (body as Record<string, unknown>).asanaTaakId;
  let asana: { api: AsanaApi; gid: string; punten: Punt[] } | null = null;
  if (ruwTaakId !== undefined && ruwTaakId !== null && ruwTaakId !== "") {
    if (typeof ruwTaakId !== "string" || !isGid(ruwTaakId)) return NextResponse.json({ error: "Ongeldig Asana-ID." }, { status: 400 });
    try {
      const api = asanaApi(asanaConfig());
      const { uitkomst } = await taakMetBrief(api, ruwTaakId);
      asana = { api, gid: ruwTaakId, punten: uitkomst.punten };
    } catch (err) {
      if (err instanceof AsanaConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
      if (err instanceof AsanaFout) {
        return NextResponse.json({ error: err.status === 403 ? err.message : `Asana gaf een fout (${err.status}): ${err.message}` }, { status: err.status === 403 ? 403 : 502 });
      }
      return NextResponse.json({ error: "Asana is niet bereikbaar." }, { status: 502 });
    }
  }

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

  const voorbeeldUrl = linkNaar(voorbeeldId);
  const asanaUitkomst = asana
    ? await meldInAsana(asana.api, asana.gid, asana.punten, {
        mailingId: uitkomst.mailingId,
        naam: invoer.naam,
        nieuw: uitkomst.nieuw,
        voorbeeldUrl: new URL(voorbeeldUrl, req.nextUrl.origin).toString(),
      })
    : undefined;

  console.info(`[marnix/maileon-concept] mailing ${uitkomst.mailingId} ${uitkomst.nieuw ? "aangemaakt" : "bijgewerkt"}, voorbeeld uit ${bron}${asana ? `, Asana-taak ${asana.gid}` : ""}`);
  return NextResponse.json({
    mailingId: uitkomst.mailingId,
    naam: invoer.naam,
    nieuw: uitkomst.nieuw,
    vervangen: uitkomst.vervangen,
    voorbeeldUrl,
    voorbeeldBron: bron,
    bijgewerkt: nu,
    ...(asanaUitkomst && { asana: asanaUitkomst }),
  });
}
