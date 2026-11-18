import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  MAX_CAMPAGNES_PER_VRAAG,
  MAX_RIJEN,
  PlayableConfigError,
  PlayableFout,
  campagnesTekst,
  perDagTekst,
  statistiekenTekst,
  zoekCampagnes,
  type PlayableCampagne,
  type PlayableStatistieken,
  type StatistiekenRij,
} from "../../playable/rapport";

/**
 * De MCP-server voor Playable (landingspagina's en acties op club.psv.nl),
 * gehost in PSV Tools op `/api/mcp/playable`. De MCP-server van Playable zelf
 * werkt alleen met Gemini Enterprise en Microsoft 365 Copilot.
 *
 * Alle tools lezen alleen, met een token dat alleen leesrechten vraagt, en
 * geven geen registraties met persoonsgegevens: alleen aantallen.
 */

/** Wat de server van Playable nodig heeft; in de tests een nepversie. */
export interface PlayableApi {
  campagnes(): Promise<PlayableCampagne[]>;
  statistieken(id: number): Promise<PlayableStatistieken>;
  aanmeldingenPerDag(id: number): Promise<unknown>;
}

export const PLAYABLE_SERVER_INFO = { name: "psv-tools-playable", version: "1.0.0" };

const ALLEEN_LEZEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const CAMPAGNES_BESCHRIJVING = `De campagnes in Playable: landingspagina's, acties en spellen op club.psv.nl. Met id, naam, type, actief, looptijd en URL.

Zoek met zoek op een woord uit de naam, een (deel van het) DMID-nummer of het laatste stuk van de URL. Namen volgen "Exploitatie - Campagne - Seizoen - DMID". Spaties en hoofdletters tellen niet: "Coen Dillen" vindt ook club.psv.nl/coendillen. Gebruik daarna het id voor statistieken.`;

const STATISTIEKEN_BESCHRIJVING =
  "De cijfers van 1 tot 10 Playable-campagnes, totaal over de hele looptijd: sessies, aanmeldingen, unieke aanmeldingen, conversie in procent (zoals Playable hem berekent), sessies per apparaat, gemiddelde tijd op de pagina in seconden en shares. Dezelfde cijfers als de pagina Landingspagina's. Zoek het id eerst op met campagnes.";

const PER_DAG_BESCHRIJVING =
  "Het aantal aanmeldingen per dag voor één Playable-campagne, zoals Playable het geeft. Gebruik dit voor het verloop: wanneer kwamen de aanmeldingen binnen. Zoek het id eerst op met campagnes.";

export function createPlayableServer({ playable }: { playable: () => PlayableApi }): McpServer {
  const server = new McpServer(PLAYABLE_SERVER_INFO, {
    instructions:
      "Campagnes en cijfers uit Playable (landingspagina's en acties op club.psv.nl). Alleen lezen. Zoek een campagne met campagnes en haal de cijfers op met statistieken.",
  });

  const campagneId = z.number().int().positive();

  async function voerUit(tool: string, werk: (api: PlayableApi) => Promise<string>) {
    const start = Date.now();
    try {
      const text = await werk(playable());
      console.info(`[mcp/playable] ${tool}: ok in ${Date.now() - start} ms`);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const text =
        err instanceof PlayableConfigError
          ? err.message
          : err instanceof PlayableFout
            ? `Playable gaf een fout (${err.status}): ${err.message}`
            : `Playable is niet bereikbaar: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[mcp/playable] ${tool}: ${text}`);
      return { isError: true, content: [{ type: "text" as const, text }] };
    }
  }

  async function vindCampagne(api: PlayableApi, id: number): Promise<PlayableCampagne | undefined> {
    return (await api.campagnes()).find((c) => c.id === id);
  }

  server.registerTool(
    "campagnes",
    {
      title: "Campagnes",
      description: CAMPAGNES_BESCHRIJVING,
      inputSchema: {
        zoek: z.string().max(100).optional().describe("Woord uit de naam, DMID-nummer of stuk van de URL."),
        alleen_actief: z.boolean().optional().describe("true: alleen campagnes die nu actief zijn."),
        limiet: z.number().int().min(1).max(MAX_RIJEN).optional().describe(`Hoeveel campagnes, standaard 50, hooguit ${MAX_RIJEN}.`),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("campagnes", async (api) => {
        const alle = await api.campagnes();
        return campagnesTekst(zoekCampagnes(alle, invoer), alle.length, invoer);
      })
  );

  server.registerTool(
    "statistieken",
    {
      title: "Statistieken",
      description: STATISTIEKEN_BESCHRIJVING,
      inputSchema: {
        campagne_ids: z.array(campagneId).min(1).max(MAX_CAMPAGNES_PER_VRAAG).describe("De id's uit campagnes."),
      },
      annotations: ALLEEN_LEZEN,
    },
    async ({ campagne_ids }) =>
      voerUit("statistieken", async (api) => {
        const ids = [...new Set(campagne_ids)];
        const alle = await api.campagnes().catch(() => [] as PlayableCampagne[]);
        // Per campagne apart: één fout id mag de andere niet tegenhouden.
        const rijen: StatistiekenRij[] = await Promise.all(
          ids.map(async (id) => {
            const campagne = alle.find((c) => c.id === id);
            try {
              return { id, campagne, stats: await api.statistieken(id) };
            } catch (err) {
              return { id, campagne, fout: err instanceof PlayableFout ? `${err.status} ${err.message}` : String(err) };
            }
          })
        );
        if (rijen.every((r) => !r.stats)) {
          throw rijen[0].fout ? new PlayableFout(`geen cijfers: ${rijen.map((r) => `${r.id}: ${r.fout}`).join("; ")}`, 404) : new Error("geen cijfers");
        }
        return statistiekenTekst(rijen);
      })
  );

  server.registerTool(
    "aanmeldingen_per_dag",
    {
      title: "Aanmeldingen per dag",
      description: PER_DAG_BESCHRIJVING,
      inputSchema: { campagne_id: campagneId.describe("Het id uit campagnes.") },
      annotations: ALLEEN_LEZEN,
    },
    async ({ campagne_id }) =>
      voerUit("aanmeldingen_per_dag", async (api) => {
        const [campagne, body] = await Promise.all([vindCampagne(api, campagne_id).catch(() => undefined), api.aanmeldingenPerDag(campagne_id)]);
        return perDagTekst(campagne_id, campagne, body);
      })
  );

  return server;
}
