import { NextRequest, NextResponse } from "next/server";

import { blobTaakStatus } from "@/lib/asana/automaat-opslag";
import type { Punt } from "@/lib/asana/brief";
import { AsanaConfigError, AsanaFout, TESTPROJECT, asanaApi, asanaConfig, isGid, type AsanaApi, type AsanaTaak } from "@/lib/asana/client";
import { conceptReactie } from "@/lib/asana/reactie";
import { briefHash, taakMetBrief } from "@/lib/asana/taak-brief";
import { BewarenFout, ConceptFout, conceptNaam, controleerInvoer, maileonConceptApi, type MaileonConceptApi } from "@/lib/maileon/concept";
import { conceptSleutel, getConcept } from "@/lib/maileon/concept-opslag";
import { voorbeeldPad, zetConceptMetVoorbeeld, type GezetConcept } from "@/lib/maileon/concept-zetten";
import { MaileonConfigError, MaileonFout, maileonConfig } from "@/lib/maileon/rapport";
import { alleenAdmins } from "@/lib/marnix/toegang";

/**
 * Zet een mail als concept in Maileon en maakt er een voorbeeldlink bij. Hoort
 * bij de testpagina `/marnix/maileon-concept`, buiten het menu. Komt de mail
 * uit een taak in het Asana-testproject (`asanaTaakId`), dan zet de route
 * daarna een reactie met de link op die taak, verplaatst hij hem naar
 * Feedback, en onthoudt hij de versie van de brief voor de automaat.
 * Versturen, inplannen en de doelgroep blijven in Maileon; zie
 * `docs/maileon-concept.md`.
 */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
      voorbeeldUrl: voorbeeldPad(record.voorbeeldId),
    },
  });
}

interface AsanaUitkomst {
  reactie: boolean;
  sectie?: string;
  fout?: string;
}

/** Reactie op de taak, naar Feedback, en de versie onthouden. Een fout hier laat het concept staan. */
async function meldInAsana(
  api: AsanaApi,
  taak: AsanaTaak,
  punten: Punt[],
  concept: { mailingId: number; naam: string; nieuw: boolean; voorbeeldUrl: string }
): Promise<AsanaUitkomst> {
  const uit: AsanaUitkomst = { reactie: false };
  try {
    await api.plaatsReactie(taak.gid, conceptReactie({ ...concept, punten }));
    uit.reactie = true;
    const feedback = (await api.secties(TESTPROJECT)).find((s) => /^feedback$/i.test(s.naam.trim()));
    if (feedback) {
      await api.naarSectie(feedback.gid, taak.gid);
      uit.sectie = feedback.naam;
    }
    await blobTaakStatus.save({
      gid: taak.gid,
      hash: briefHash(taak),
      status: "concept",
      mailingId: concept.mailingId,
      bijgewerkt: new Date().toISOString(),
    });
  } catch (err) {
    uit.fout = err instanceof AsanaFout ? `Asana gaf een fout (${err.status}): ${err.message}` : "Asana is niet bereikbaar.";
    console.error(`[marnix/maileon-concept] Asana-taak ${taak.gid}: ${uit.fout}`);
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
  let asana: { api: AsanaApi; taak: AsanaTaak; punten: Punt[] } | null = null;
  if (ruwTaakId !== undefined && ruwTaakId !== null && ruwTaakId !== "") {
    if (typeof ruwTaakId !== "string" || !isGid(ruwTaakId)) return NextResponse.json({ error: "Ongeldig Asana-ID." }, { status: 400 });
    try {
      const api = asanaApi(asanaConfig());
      const { taak, uitkomst } = await taakMetBrief(api, ruwTaakId);
      asana = { api, taak, punten: uitkomst.punten };
    } catch (err) {
      if (err instanceof AsanaConfigError) return NextResponse.json({ error: err.message }, { status: 500 });
      if (err instanceof AsanaFout) {
        return NextResponse.json(
          { error: err.status === 403 ? err.message : `Asana gaf een fout (${err.status}): ${err.message}` },
          { status: err.status === 403 ? 403 : 502 }
        );
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

  let concept: GezetConcept;
  try {
    concept = await zetConceptMetVoorbeeld(api, invoer, sessie.email);
  } catch (err) {
    if (err instanceof ConceptFout) {
      const eerder = await getConcept(conceptSleutel(invoer.dmid, invoer.naam)).catch(() => null);
      return NextResponse.json({ error: err.message, code: err.code, mailingId: eerder?.mailingId }, { status: err.status });
    }
    if (err instanceof BewarenFout) return NextResponse.json({ error: err.message, mailingId: err.mailingId }, { status: 500 });
    if (err instanceof MaileonFout) {
      console.error(`[marnix/maileon-concept] Maileon ${err.status}: ${err.message}`);
      return NextResponse.json({ error: `Maileon gaf een fout (${err.status}): ${err.message}` }, { status: 502 });
    }
    console.error("[marnix/maileon-concept] Maileon niet bereikbaar:", err instanceof Error ? err.message : err);
    return NextResponse.json({ error: "Maileon is niet bereikbaar. Probeer het zo nog eens." }, { status: 502 });
  }

  const asanaUitkomst = asana
    ? await meldInAsana(asana.api, asana.taak, asana.punten, {
        mailingId: concept.mailingId,
        naam: concept.naam,
        nieuw: concept.nieuw,
        voorbeeldUrl: new URL(concept.voorbeeldPad, req.nextUrl.origin).toString(),
      })
    : undefined;

  console.info(
    `[marnix/maileon-concept] mailing ${concept.mailingId} ${concept.nieuw ? "aangemaakt" : "bijgewerkt"}, voorbeeld uit ${concept.voorbeeldBron}` +
      (asana ? `, Asana-taak ${asana.taak.gid}` : "")
  );
  return NextResponse.json({
    mailingId: concept.mailingId,
    naam: concept.naam,
    nieuw: concept.nieuw,
    vervangen: concept.vervangen,
    voorbeeldUrl: concept.voorbeeldPad,
    voorbeeldBron: concept.voorbeeldBron,
    bijgewerkt: concept.bijgewerkt,
    ...(asanaUitkomst && { asana: asanaUitkomst }),
  });
}
