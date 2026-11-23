import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { foutAntwoord } from "../../jwplayer/fouten";
import { PRESETS, PeriodeFout, TIJDZONE_NOTITIE, kiesPeriode } from "../../jwplayer/periode";
import { SORTEER_OP, content, live, mediaDetail, overzicht, publiek, vergelijk, zoekMedia } from "../../jwplayer/rapport";
import type { PsvPlayOmgeving } from "../../jwplayer/server";

/**
 * De MCP-server voor PSV Play (de videodienst in Mijn PSV+, op JW Player),
 * gehost in PSV Tools op `/api/mcp/psv-play`.
 *
 * Alle tools lezen alleen, met vaste lijsten van metrics en dimensies: er is
 * geen vrije query-tool en niets schrijft naar JW. De uitkomst is compacte
 * JSON met titels in plaats van id's, altijd met de periode in JW-datums,
 * `data_through` en `notes`.
 */

export const PSVPLAY_SERVER_INFO = { name: "psv-tools-psv-play", version: "1.0.0" };

const ALLEEN_LEZEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const KANTTEKENINGEN = `Datums zijn JW-datums (US Eastern): een dag loopt in Nederland van 06.00 tot 06.00 uur; de laatste volledige dag is gisteren. Unieke kijkers zijn een benadering (IP plus browser) en NIET optelbaar: tel nooit dag- of videowaarden op, maar vraag de hele periode in één keer. Percentage-completes (25/50/75%) en de afhaakcurve bestaan alleen voor video's langer dan 30 seconden.`;

const OVERVIEW = `KPI's van PSV Play (de video's in Mijn PSV+) over een periode: kijktijd in uren (de north star), unieke kijkers, plays, kijktijd per kijker en complete rate, met de delta in % ten opzichte van de vorige periode (even lang, direct ervoor; bij season dezelfde dagen een seizoen eerder), plus het verloop per dag. Gebruik dit voor "hoe doet PSV Play het?".

${KANTTEKENINGEN}`;

const TOP = `De best bekeken video's van PSV Play in een periode, gesorteerd op kijktijd, plays, unieke_kijkers of complete_rate, met titel, publicatiedatum, type, team, plays, kijktijd, complete rate en afhaakcurve. Ook de prestaties per type (persconferentie, oefenwedstrijd, interview, …) en per team, en welk deel van de kijktijd ongecategoriseerd is (video's zonder type:-tag). Filter op type, team of seizoen (bijvoorbeeld 2026-27). Gebruik dit voor "wat werd het meest bekeken?" of "hoe doen persconferenties het?".

${KANTTEKENINGEN}`;

const DETAIL = `Eén video van PSV Play: kerncijfers, afhaakcurve (hoeveel % van de plays 25/50/75/100% haalde), het verloop per dag en een vergelijking met het gemiddelde van video's van hetzelfde type in dezelfde periode. Vraagt een media_id; zoek die eerst op met psvplay_search_media.

${KANTTEKENINGEN}`;

const COMPARE = `Twee periodes van PSV Play naast elkaar: totaal (kijktijd, unieke kijkers, plays, complete rate) of per type video. Periode a is verplicht; zonder periode b wordt de vorige periode gebruikt. Gebruik dit voor seizoen tegen seizoen, maand tegen maand of "voor en na de zomerstop".

${KANTTEKENINGEN}`;

const LIVE = `Live-uitzendingen van PSV Play in een periode (plays in playback mode LIVE of DVR): per uitzending de live-plays, unieke kijkers en kijktijd, en de nakijk-plays van de opname in de dagen erna (dezelfde video on demand, plus een losse opname met dezelfde titel). Plus een vergelijking per type, zoals oefenwedstrijden tegen persconferenties.

${KANTTEKENINGEN}`;

const AUDIENCE = `Het publiek van PSV Play in een periode: verdeling van de plays over device, platform (web, iOS, Android, tvOS, …) en land (top 10, het aandeel Nederland en buitenland totaal). Onderdelen die de JW-licentie niet geeft, staan als null met een uitleg in niet_beschikbaar.

${TIJDZONE_NOTITIE}`;

const SEARCH = `Zoek video's van PSV Play op titel of tag via de JW Management API, nieuwste eerst, met media_id, titel, publicatiedatum, duur, type, team, seizoen en tags. Gebruik dit om een video te vinden voordat je de cijfers opvraagt, bijvoorbeeld "de persconferentie van vrijdag": zoek op "persconferentie" met gepubliceerd_van en gepubliceerd_tot rond die vrijdag. Geeft geen kijkcijfers.`;

export function createPsvPlayServer({ omgeving }: { omgeving: () => PsvPlayOmgeving }): McpServer {
  const server = new McpServer(PSVPLAY_SERVER_INFO, {
    instructions:
      "Kijkcijfers van PSV Play (video's in Mijn PSV+, op JW Player). Alleen lezen. Zoek een video met psvplay_search_media en vraag cijfers op met de andere tools. Unieke kijkers zijn niet optelbaar; datums zijn JW-datums (US Eastern).",
  });

  const dag = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
  const periode = {
    preset: z.enum(PRESETS as [string, ...string[]]).optional().describe("7d, 30d, 90d of season (vanaf 1 juli). Standaard 30d. Niet samen met start_date/end_date."),
    start_date: dag.optional().describe("Eerste JW-dag, JJJJ-MM-DD."),
    end_date: dag.optional().describe("Laatste JW-dag, JJJJ-MM-DD; wordt afgekapt op de laatste volledige dag."),
    site: z.string().max(40).optional().describe("Property (site-id of naam). Standaard PSV Play."),
  };
  type PeriodeInvoer = { preset?: string; start_date?: string; end_date?: string };
  const keuzeUit = (i: PeriodeInvoer) => kiesPeriode({ preset: i.preset as (typeof PRESETS)[number] | undefined, start_date: i.start_date, end_date: i.end_date });

  async function voerUit(tool: string, werk: (o: PsvPlayOmgeving) => Promise<unknown>) {
    const start = Date.now();
    try {
      const text = JSON.stringify(await werk(omgeving()));
      console.info(`[mcp/psv-play] ${tool}: ok in ${Date.now() - start} ms`);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const text = foutAntwoord(err).melding;
      console.error(`[mcp/psv-play] ${tool}: ${text}`);
      return { isError: true, content: [{ type: "text" as const, text }] };
    }
  }

  server.registerTool(
    "psvplay_overview",
    { title: "PSV Play: overzicht", description: OVERVIEW, inputSchema: periode, annotations: ALLEEN_LEZEN },
    async (i) => voerUit("psvplay_overview", async (o) => overzicht(await o.ctx(i.site), keuzeUit(i)))
  );

  server.registerTool(
    "psvplay_top_content",
    {
      title: "PSV Play: top-video's",
      description: TOP,
      inputSchema: {
        ...periode,
        metric: z.enum(SORTEER_OP as [string, ...string[]]).optional().describe("Sorteer op kijktijd (standaard), plays, unieke_kijkers of complete_rate."),
        limit: z.number().int().min(1).max(50).optional().describe("Hoeveel video's, standaard 10."),
        type: z.string().max(40).optional().describe("Alleen dit type, zoals persconferentie of Ongecategoriseerd."),
        team: z.string().max(40).optional().describe("Alleen dit team: psv1, vrouwen, jong of jeugd."),
        seizoen: z.string().regex(/^\d{4}-\d{2}$/).optional().describe("Alleen video's met deze seizoen:-tag, zoals 2026-27."),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (i) =>
      voerUit("psvplay_top_content", async (o) =>
        content(await o.ctx(i.site), keuzeUit(i), {
          sorteer: i.metric as (typeof SORTEER_OP)[number] | undefined,
          limiet: i.limit ?? 10,
          filter: { type: i.type, team: i.team, seizoen: i.seizoen },
        })
      )
  );

  server.registerTool(
    "psvplay_media_detail",
    {
      title: "PSV Play: één video",
      description: DETAIL,
      inputSchema: { media_id: z.string().regex(/^[A-Za-z0-9]{8}$/).describe("Media-id van acht tekens, uit psvplay_search_media."), ...periode },
      annotations: ALLEEN_LEZEN,
    },
    async (i) => voerUit("psvplay_media_detail", async (o) => mediaDetail(await o.ctx(i.site), i.media_id, keuzeUit(i)))
  );

  const periodeObject = z.object({ preset: periode.preset, start_date: periode.start_date, end_date: periode.end_date });
  server.registerTool(
    "psvplay_compare_periods",
    {
      title: "PSV Play: periodes vergelijken",
      description: COMPARE,
      inputSchema: {
        periode_a: periodeObject.describe("De periode om te bekijken."),
        periode_b: periodeObject.optional().describe("De periode om mee te vergelijken; standaard de vorige periode van a."),
        per: z.enum(["totaal", "type"]).optional().describe("totaal (standaard) of per type video."),
        site: periode.site,
      },
      annotations: ALLEEN_LEZEN,
    },
    async (i) =>
      voerUit("psvplay_compare_periods", async (o) => {
        const a = keuzeUit(i.periode_a);
        const b = i.periode_b ? keuzeUit(i.periode_b).periode : a.vorige;
        if (b.van > b.tot) throw new PeriodeFout("periode_b is leeg.");
        return vergelijk(await o.ctx(i.site), a.periode, b, i.per ?? "totaal", { data_through: a.dataThrough });
      })
  );

  server.registerTool(
    "psvplay_live_events",
    { title: "PSV Play: live-uitzendingen", description: LIVE, inputSchema: periode, annotations: ALLEEN_LEZEN },
    async (i) => voerUit("psvplay_live_events", async (o) => live(await o.ctx(i.site), keuzeUit(i)))
  );

  server.registerTool(
    "psvplay_audience",
    { title: "PSV Play: publiek", description: AUDIENCE, inputSchema: periode, annotations: ALLEEN_LEZEN },
    async (i) => voerUit("psvplay_audience", async (o) => publiek(await o.ctx(i.site), keuzeUit(i)))
  );

  server.registerTool(
    "psvplay_search_media",
    {
      title: "PSV Play: video zoeken",
      description: SEARCH,
      inputSchema: {
        zoek: z.string().max(100).optional().describe("Woorden uit de titel of tags; hoofdletters en accenten tellen niet."),
        tag: z.string().max(60).optional().describe("Precies deze tag, zoals type:persconferentie."),
        gepubliceerd_van: dag.optional().describe("Gepubliceerd op of na deze dag, JJJJ-MM-DD."),
        gepubliceerd_tot: dag.optional().describe("Gepubliceerd op of voor deze dag, JJJJ-MM-DD."),
        limit: z.number().int().min(1).max(50).optional().describe("Hoeveel video's, standaard 20."),
        site: periode.site,
      },
      annotations: ALLEEN_LEZEN,
    },
    async (i) =>
      voerUit("psvplay_search_media", async (o) =>
        zoekMedia(await o.ctx(i.site), {
          zoek: i.zoek,
          tag: i.tag,
          gepubliceerd_van: i.gepubliceerd_van,
          gepubliceerd_tot: i.gepubliceerd_tot,
          limiet: i.limit,
        })
      )
  );

  return server;
}
