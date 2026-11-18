import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  MAX_MAILINGS_PER_VRAAG,
  MAX_RIJEN,
  MaileonConfigError,
  MaileonFout,
  MaileonInvoerFout,
  controleerPeriode,
  mailingsTekst,
  resultatenTekst,
  verstuurd,
  type Mailing,
  type Resultaat,
} from "../../maileon/rapport";

/**
 * De MCP-server voor Maileon (e-mailings), gehost in PSV Tools op
 * `/api/mcp/maileon`. Maileon heeft zelf geen MCP-server.
 *
 * Alle tools lezen alleen, en alleen totalen per mailing: geen contacten,
 * geen klikken per persoon, niets versturen. Dezelfde cijfers als DM Performance.
 */

/** Wat de server van Maileon nodig heeft; in de tests een nepversie. */
export interface MaileonApi {
  /** Alle mailings met een verzendmoment vanaf deze dag (JJJJ-MM-DD). */
  mailingsSinds(van: string): Promise<Mailing[]>;
  resultaten(ids: number[]): Promise<Resultaat[]>;
}

export const MAILEON_SERVER_INFO = { name: "psv-tools-maileon", version: "1.0.0" };

const ALLEEN_LEZEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const MAILINGS_BESCHRIJVING = `De verstuurde mailings (e-mails) van PSV in Maileon in een periode, nieuwste eerst: verzendmoment, id, naam en type.

Zoek met zoek op een woord uit de naam of een (deel van het) DMID-nummer. Namen volgen "[DATUM] [EXPLOITATIE] [ONDERWERP/CAMPAGNE] [VARIANT] [DMID]", bijvoorbeeld "2026.05.03 PSV Vrouwen - Kampioenschap - Mail personeel - DMID26-11566". Spaties en hoofdletters tellen niet. Gebruik daarna resultaten voor de cijfers.`;

const RESULTATEN_BESCHRIJVING = `De resultaten van verstuurde mailings in een periode: ontvangers, uniek geopend, open %, uniek geklikt, klik %, CTOR (klikken per opener), bounces en afmeldingen, per mailing en in totaal. Dezelfde cijfers als DM Performance.

Filter met zoek (woord uit de naam of DMID) of mailing_ids (uit mailings). Het totaal telt alle gevonden mailings, ook als de tabel er minder toont. Opens zijn een indicatie: sommige mailprogramma's openen mails automatisch.`;

export function createMaileonServer({ maileon }: { maileon: () => MaileonApi }): McpServer {
  const server = new McpServer(MAILEON_SERVER_INFO, {
    instructions:
      "Verstuurde mailings en hun resultaten uit Maileon. Alleen lezen, alleen totalen per mailing. Zoek met mailings en haal de cijfers op met resultaten.",
  });

  const dag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const periode = {
    van: dag.describe("Eerste dag, JJJJ-MM-DD."),
    tot: dag.describe("Laatste dag, JJJJ-MM-DD."),
    zoek: z.string().max(100).optional().describe("Woord uit de naam of (een deel van) het DMID-nummer."),
  };
  const limiet = z.number().int().min(1).max(MAX_RIJEN).optional().describe(`Hoeveel rijen, standaard 50, hooguit ${MAX_RIJEN}.`);

  async function voerUit(tool: string, werk: (api: MaileonApi) => Promise<string>) {
    const start = Date.now();
    try {
      const text = await werk(maileon());
      console.info(`[mcp/maileon] ${tool}: ok in ${Date.now() - start} ms`);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const text =
        err instanceof MaileonInvoerFout || err instanceof MaileonConfigError
          ? err.message
          : err instanceof MaileonFout
            ? `Maileon gaf een fout (${err.status}): ${err.message}`
            : `Maileon is niet bereikbaar: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[mcp/maileon] ${tool}: ${text}`);
      return { isError: true, content: [{ type: "text" as const, text }] };
    }
  }

  server.registerTool(
    "mailings",
    { title: "Mailings", description: MAILINGS_BESCHRIJVING, inputSchema: { ...periode, limiet }, annotations: ALLEEN_LEZEN },
    async (invoer) =>
      voerUit("mailings", async (api) => {
        controleerPeriode(invoer);
        return mailingsTekst(verstuurd(await api.mailingsSinds(invoer.van), invoer), invoer);
      })
  );

  server.registerTool(
    "resultaten",
    {
      title: "Resultaten",
      description: RESULTATEN_BESCHRIJVING,
      inputSchema: {
        ...periode,
        mailing_ids: z.array(z.number().int().positive()).max(MAX_MAILINGS_PER_VRAAG).optional().describe("Alleen deze mailings (id's uit mailings)."),
        limiet,
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("resultaten", async (api) => {
        controleerPeriode(invoer);
        const gevonden = verstuurd(await api.mailingsSinds(invoer.van), invoer);
        if (gevonden.length > MAX_MAILINGS_PER_VRAAG) {
          throw new MaileonInvoerFout(
            `Dat zijn ${gevonden.length} mailings; hooguit ${MAX_MAILINGS_PER_VRAAG} per vraag. Neem een kortere periode of zoek specifieker.`
          );
        }
        const resultaten = gevonden.length ? await api.resultaten(gevonden.map((m) => m.id)) : [];
        return resultatenTekst(gevonden, resultaten, invoer);
      })
  );

  return server;
}
