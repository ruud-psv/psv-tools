import { BewarenFout, ConceptFout, controleerInvoer, type SchoneInvoer } from "@/lib/maileon/concept";
import { MaileonFout } from "@/lib/maileon/rapport";

import type { MailOpzet, Punt } from "./brief";
import { AsanaFout, TESTPROJECT, vanTestproject, type AsanaApi, type AsanaTaak } from "./client";
import { conceptReactie, foutReactie, wachtReactie } from "./reactie";
import type { TaakStatus, TaakStatusOpslag } from "./automaat-opslag";
import { briefHash, briefVoorTaak } from "./taak-brief";

/**
 * De automaat voor het Asana-testproject. Elke ronde (cron, elke 5 minuten):
 *
 * - Nieuwe aanvraag: een taak met een complete brief komt als concept in
 *   Maileon, met een reactie met de voorbeeldlink, en gaat naar Feedback. Is
 *   de brief niet compleet, dan een reactie met wat er mist, en de taak gaat
 *   naar Wachten op input.
 * - Wachten op input en Feedback: alleen taken die de automaat al kent, en
 *   alleen als de brief veranderd is. Dan opnieuw: een concept (of een
 *   bijgewerkt concept, met dezelfde voorbeeldlink), of de punten.
 *
 * Per versie van de brief (`briefHash`) komt er hooguit één reactie. Een taak
 * die zonder wijziging terug in Nieuwe aanvraag wordt gezet, gaat zonder
 * reactie terug naar waar hij hoorde. Een storing bij Maileon of Asana
 * (5xx, geen verbinding) laat de taak staan voor de volgende ronde.
 */

export interface AutomaatDeps {
  asana: AsanaApi;
  /** Concept zetten en de volledige voorbeeldlink teruggeven. */
  maakConcept(invoer: SchoneInvoer): Promise<{ mailingId: number; nieuw: boolean; naam: string; voorbeeldUrl: string }>;
  /** De mail uit de opzet: HTML voor Maileon en wat de Mail Builder zou weigeren. */
  maakMail(opzet: MailOpzet): { html: string; problemen: string[] };
  status: TaakStatusOpslag;
  /** Zoveel taken verwerkt één ronde hooguit. */
  max?: number;
  nu?: () => string;
}

export type Actie = "concept" | "wachten" | "fout" | "storing" | "teruggezet";

export interface RondeVerslag {
  bekeken: number;
  verwerkt: { gid: string; naam: string; actie: Actie; melding?: string; mailingId?: number }[];
}

const SECTIES = { nieuw: "nieuwe aanvraag", wachten: "wachten op input", feedback: "feedback" } as const;

function isStoring(err: unknown): boolean {
  if (err instanceof ConceptFout || err instanceof BewarenFout) return false;
  if (err instanceof MaileonFout || err instanceof AsanaFout) return err.status >= 500 || err.status === 429;
  return true;
}

export async function draaiRonde(deps: AutomaatDeps): Promise<RondeVerslag> {
  const { asana, status } = deps;
  const max = deps.max ?? 5;
  const nu = deps.nu ?? (() => new Date().toISOString());

  const secties = await asana.secties(TESTPROJECT);
  const vind = (naam: string) => secties.find((s) => s.naam.trim().toLowerCase() === naam);
  const nieuw = vind(SECTIES.nieuw);
  const wachten = vind(SECTIES.wachten);
  const feedback = vind(SECTIES.feedback);
  if (!nieuw) throw new Error('Sectie "Nieuwe aanvraag" niet gevonden in het testproject.');

  const kandidaten: { taak: AsanaTaak; sectie: string }[] = [];
  for (const sectie of [nieuw, wachten, feedback]) {
    if (!sectie) continue;
    for (const taak of await asana.takenInSectie(sectie.gid)) kandidaten.push({ taak, sectie: sectie.gid });
  }

  const verslag: RondeVerslag = { bekeken: kandidaten.length, verwerkt: [] };
  let verwerkt = 0;

  for (const { taak, sectie } of kandidaten) {
    if (!vanTestproject(taak)) continue;
    const inNieuw = sectie === nieuw.gid;
    const hash = briefHash(taak);
    const vorig = await status.get(taak.gid);

    // Buiten Nieuwe aanvraag alleen taken die de automaat al kent.
    if (!vorig && !inNieuw) continue;

    if (vorig && vorig.hash === hash) {
      // Brief niet veranderd. Teruggezet in Nieuwe aanvraag? Dan terug, zonder reactie.
      // Na een weigering van Maileon blijft de taak staan waar hij stond.
      if (inNieuw && vorig.status !== "fout") {
        const doel = vorig.status === "concept" ? feedback : wachten;
        if (doel) {
          await asana.naarSectie(doel.gid, taak.gid);
          verslag.verwerkt.push({ gid: taak.gid, naam: taak.naam, actie: "teruggezet", melding: `Brief niet veranderd; terug naar ${doel.naam}.` });
        }
      }
      continue;
    }

    if (verwerkt >= max) break;
    verwerkt++;

    const bewaar = (s: Omit<TaakStatus, "gid" | "hash" | "bijgewerkt">) => status.save({ gid: taak.gid, hash, bijgewerkt: nu(), ...s });
    const verplaats = async (doel: { gid: string } | undefined) => {
      if (doel && doel.gid !== sectie) await asana.naarSectie(doel.gid, taak.gid);
    };

    try {
      const uitkomst = await briefVoorTaak(asana, taak);
      const punten: Punt[] = [...uitkomst.punten];
      let invoer: SchoneInvoer | null = null;

      if (uitkomst.opzet) {
        const mail = deps.maakMail(uitkomst.opzet);
        punten.push(...mail.problemen.map((tekst): Punt => ({ soort: "nodig", tekst: `Mail Builder: ${tekst}` })));
        const gecontroleerd = controleerInvoer({
          html: mail.html,
          naam: uitkomst.opzet.mailNaam,
          dmid: uitkomst.opzet.dmid,
          onderwerp: uitkomst.onderwerp,
          previewTekst: uitkomst.opzet.preheaderTekst,
        });
        if ("fout" in gecontroleerd) punten.push({ soort: "nodig", tekst: gecontroleerd.fout });
        else invoer = gecontroleerd;
      }

      if (!invoer || punten.some((p) => p.soort === "nodig")) {
        await asana.plaatsReactie(taak.gid, wachtReactie(punten));
        await verplaats(wachten);
        await bewaar({ status: "wachten" });
        verslag.verwerkt.push({ gid: taak.gid, naam: taak.naam, actie: "wachten" });
        continue;
      }

      let concept: Awaited<ReturnType<AutomaatDeps["maakConcept"]>>;
      try {
        concept = await deps.maakConcept(invoer);
      } catch (err) {
        if (isStoring(err)) throw err;
        const melding = err instanceof Error ? err.message : String(err);
        await asana.plaatsReactie(taak.gid, foutReactie(melding));
        await bewaar({ status: "fout" });
        verslag.verwerkt.push({ gid: taak.gid, naam: taak.naam, actie: "fout", melding });
        continue;
      }

      await asana.plaatsReactie(taak.gid, conceptReactie({ ...concept, punten }));
      await verplaats(feedback);
      await bewaar({ status: "concept", mailingId: concept.mailingId });
      verslag.verwerkt.push({ gid: taak.gid, naam: taak.naam, actie: "concept", mailingId: concept.mailingId });
    } catch (err) {
      // Storing: niets bewaren, de volgende ronde probeert het opnieuw.
      const melding = err instanceof Error ? err.message : String(err);
      console.error(`[asana/automaat] taak ${taak.gid}: ${melding}`);
      verslag.verwerkt.push({ gid: taak.gid, naam: taak.naam, actie: "storing", melding });
    }
  }

  return verslag;
}
