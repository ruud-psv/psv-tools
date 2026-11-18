import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { protos } from "@google-analytics/data";
import { z } from "zod";

import {
  DATUM,
  GaConfigError,
  GaInvoerFout,
  MAX_DIMENSIES,
  MAX_METRICS,
  MAX_RIJEN,
  STANDAARD_RIJEN,
  VELDNAAM,
  gaFoutTekst,
  rapportTekst,
  rapportVerzoek,
  realtimeTekst,
  realtimeVerzoek,
  veldenTekst,
  vindSite,
  type GaSite,
} from "../../google-analytics/rapport";

/**
 * De MCP-server voor Google Analytics, gehost in PSV Tools op
 * `/api/mcp/google-analytics`. Hij biedt algemene tools: het model stelt zelf
 * de vraag samen (welke cijfers, uitgesplitst naar wat, over welke periode).
 *
 * Alle tools lezen alleen, en alleen van de sites van PSV (`gaSites`), ook als
 * het service-account bij meer properties kan.
 */

type IRunReportRequest = protos.google.analytics.data.v1beta.IRunReportRequest;
type IRunReportResponse = protos.google.analytics.data.v1beta.IRunReportResponse;
type IRunRealtimeReportRequest = protos.google.analytics.data.v1beta.IRunRealtimeReportRequest;
type IRunRealtimeReportResponse = protos.google.analytics.data.v1beta.IRunRealtimeReportResponse;
type IMetadata = protos.google.analytics.data.v1beta.IMetadata;

/** Wat de server van Google Analytics nodig heeft; in de tests een nepversie. */
export interface GaApi {
  runReport(request: IRunReportRequest): Promise<IRunReportResponse>;
  runRealtimeReport(request: IRunRealtimeReportRequest): Promise<IRunRealtimeReportResponse>;
  getMetadata(name: string): Promise<IMetadata>;
}

export const GA_SERVER_INFO = { name: "psv-tools-google-analytics", version: "1.0.0" };

const ALLEEN_LEZEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const RAPPORT_BESCHRIJVING = `Draait een rapport op Google Analytics 4 voor een website van PSV: kies zelf de metrics, de dimensies en de periode.

Voorbeelden:
- Best bekeken pagina's gisteren: metrics ["screenPageViews"], dimensies ["pagePath", "pageTitle"], van en tot "yesterday".
- Sessies per kanaal vorige week: metrics ["sessions"], dimensies ["sessionDefaultChannelGroup"], van "7daysAgo", tot "yesterday".
- Verloop per dag: dimensies ["date"], sorteer_op "date", oplopend true.
- Alleen mobiel: filters [{"dimensie": "deviceCategory", "type": "gelijk", "waarde": "mobile"}].

Veelgebruikte metrics: screenPageViews (paginaweergaven), sessions, activeUsers (gebruikers), newUsers, engagedSessions, engagementRate (fractie), averageSessionDuration (seconden), bounceRate (fractie), eventCount, keyEvents, transactions, purchaseRevenue, itemsPurchased.
Veelgebruikte dimensies: date, pagePath, pageTitle, landingPage, hostName, sessionDefaultChannelGroup, sessionSource, sessionMedium, sessionSourceMedium, sessionCampaignName, deviceCategory, country, city, eventName, itemName.
Twijfel je over een naam of zoek je een eigen dimensie, gebruik dan velden.

Datums als JJJJ-MM-DD, of today, yesterday of NdaysAgo (bijvoorbeeld 7daysAgo), in de tijdzone van de property. Met vergelijk_van en vergelijk_tot leg je een tweede periode ernaast; elke rij krijgt dan de kolom dateRange (periode of vergelijking). Het antwoord bevat ook het totaal over alle rijen.`;

const REALTIME_BESCHRIJVING = `Wat er nu gebeurt op een website van PSV: de afgelopen 30 minuten in Google Analytics 4.
Metrics: activeUsers, screenPageViews, eventCount, keyEvents. Dimensies: unifiedScreenName (paginatitel), deviceCategory, country, city, eventName, minutesAgo.`;

const VELDEN_BESCHRIJVING =
  "Zoekt de metrics en dimensies die een website van PSV in Google Analytics 4 heeft, met hun naam voor het rapport. Zonder zoekterm: alleen de eigen velden (customEvent:...). Met een zoekterm, zoals revenue, page of campaign: alle velden die erop lijken.";

export function createGoogleAnalyticsServer({ sites, ga }: { sites: GaSite[]; ga: () => GaApi }): McpServer {
  if (sites.length === 0) throw new GaConfigError("Er zijn geen Google Analytics-properties ingesteld (GA_PROPERTY_*).");

  const server = new McpServer(GA_SERVER_INFO, {
    instructions:
      "Cijfers uit Google Analytics 4 van de websites van PSV. Alleen lezen. Gebruik rapport voor een periode, realtime voor de afgelopen 30 minuten en velden om de juiste naam van een metric of dimensie te vinden.",
  });

  const site = z
    .enum(sites.map((s) => s.key) as [string, ...string[]])
    .describe(`De website: ${sites.map((s) => `${s.key} = ${s.label}`).join(", ")}.`);
  const veldnaam = z.string().regex(VELDNAAM);
  const datum = z.string().regex(DATUM);
  const metrics = z.array(veldnaam).min(1).max(MAX_METRICS).describe(`1 tot ${MAX_METRICS} metrics, met hun API-naam.`);
  const dimensies = z.array(veldnaam).max(MAX_DIMENSIES).optional().describe(`0 tot ${MAX_DIMENSIES} dimensies, met hun API-naam.`);
  const filters = z
    .array(
      z.object({
        dimensie: veldnaam.describe("De dimensie waarop je filtert, bijvoorbeeld pagePath."),
        type: z.enum(["gelijk", "bevat", "begint_met", "eindigt_met", "regex"]),
        waarde: z.string().min(1).max(500),
        uitsluiten: z.boolean().optional().describe("true: juist de rijen weglaten die aan het filter voldoen."),
      })
    )
    .max(10)
    .optional()
    .describe("Filters op dimensies; alle filters moeten kloppen. Hoofdletters maken niet uit.");
  const sorteerOp = veldnaam.optional().describe("Metric of dimensie om op te sorteren; standaard de eerste metric.");
  const oplopend = z.boolean().optional().describe("true: van laag naar hoog. Standaard van hoog naar laag.");
  const limiet = z
    .number()
    .int()
    .min(1)
    .max(MAX_RIJEN)
    .optional()
    .describe(`Hoeveel rijen, standaard ${STANDAARD_RIJEN}, hooguit ${MAX_RIJEN}.`);

  async function voerUit(tool: string, siteKey: string, werk: () => Promise<string>) {
    const start = Date.now();
    try {
      const text = await werk();
      console.info(`[mcp/google-analytics] ${tool} ${siteKey}: ok in ${Date.now() - start} ms`);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const text =
        err instanceof GaInvoerFout || err instanceof GaConfigError ? err.message : `Google Analytics gaf een fout: ${gaFoutTekst(err)}`;
      console.error(`[mcp/google-analytics] ${tool} ${siteKey}: ${text}`);
      return { isError: true, content: [{ type: "text" as const, text }] };
    }
  }

  server.registerTool(
    "rapport",
    {
      title: "Rapport",
      description: RAPPORT_BESCHRIJVING,
      inputSchema: {
        site,
        metrics,
        dimensies,
        van: datum.describe("Eerste dag van de periode."),
        tot: datum.describe("Laatste dag van de periode."),
        vergelijk_van: datum.optional().describe("Optioneel: eerste dag van een periode om mee te vergelijken."),
        vergelijk_tot: datum.optional().describe("Optioneel: laatste dag van die periode."),
        filters,
        sorteer_op: sorteerOp,
        oplopend,
        limiet,
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("rapport", invoer.site, async () => {
        const gekozen = vindSite(sites, invoer.site);
        return rapportTekst(await ga().runReport(rapportVerzoek(invoer, gekozen)), invoer, gekozen);
      })
  );

  server.registerTool(
    "realtime",
    {
      title: "Realtime",
      description: REALTIME_BESCHRIJVING,
      inputSchema: { site, metrics, dimensies, filters, sorteer_op: sorteerOp, oplopend, limiet },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("realtime", invoer.site, async () => {
        const gekozen = vindSite(sites, invoer.site);
        return realtimeTekst(await ga().runRealtimeReport(realtimeVerzoek(invoer, gekozen)), gekozen);
      })
  );

  server.registerTool(
    "velden",
    {
      title: "Velden zoeken",
      description: VELDEN_BESCHRIJVING,
      inputSchema: {
        site,
        zoek: z.string().max(100).optional().describe("Zoekterm in de naam of beschrijving, bijvoorbeeld revenue."),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("velden", invoer.site, async () => {
        const gekozen = vindSite(sites, invoer.site);
        return veldenTekst(await ga().getMetadata(`properties/${gekozen.propertyId}/metadata`), gekozen, invoer.zoek);
      })
  );

  return server;
}
