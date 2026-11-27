import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  DATUM,
  FILTERVELD,
  MAX_RIJEN,
  MAX_VELDEN,
  MetaConfigError,
  MetaFout,
  MetaInvoerFout,
  NIVEAUS,
  OBJECT_EDGE,
  OPERATORS,
  PERIODES,
  STANDAARD_RIJEN,
  VELDNAAM,
  objectenParams,
  objectenTekst,
  rapportParams,
  rapportTekst,
  type MetaAccount,
  type MetaLijst,
} from "../../meta-ads/rapport";
import {
  CREATIVE_VELDEN,
  creativeTekst,
  metPostTekst,
  normaliseerCreative,
  postZonderTekst,
  type MetaCreativeRaw,
} from "../../meta-ads/creative";

/**
 * De MCP-server voor Meta Ads, gehost in PSV Tools op `/api/mcp/meta-ads`.
 * Algemene tools: het model stelt zelf de vraag samen (niveau, velden,
 * periode, uitsplitsing, filters).
 *
 * Alle tools lezen alleen, en alleen het advertentieaccount van Paid Ads
 * (`META_ADS_ACCOUNT_ID`), met hetzelfde token.
 */

/** Wat de server van de Graph API nodig heeft; in de tests een nepversie. */
export interface MetaApi {
  accountPath: string;
  account(): Promise<MetaAccount>;
  insights(params: Record<string, string>): Promise<MetaLijst>;
  objecten(edge: "campaigns" | "adsets" | "ads", params: Record<string, string>): Promise<MetaLijst>;
  /** Eén object op ID, zoals een post. */
  object(id: string, params: Record<string, string>): Promise<Record<string, unknown>>;
}

export const META_SERVER_INFO = { name: "psv-tools-meta-ads", version: "1.0.0" };

const ALLEEN_LEZEN = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

const RAPPORT_BESCHRIJVING = `Cijfers uit Meta Ads (Facebook en Instagram) van het advertentieaccount van PSV: kies zelf het niveau, de velden en de periode.

Voorbeelden:
- Uitgaven en linkkliks per campagne de afgelopen 7 dagen: niveau "campaign", velden ["spend", "inline_link_clicks", "cost_per_inline_link_click"], periode "last_7d".
- Verloop per dag: per "dag".
- Uitgesplitst naar leeftijd en geslacht: uitsplitsing ["age", "gender"]; naar plaatsing: ["publisher_platform", "platform_position"].
- Alleen campagnes met "Seizoenkaart" in de naam: filters [{"veld": "campaign.name", "operator": "CONTAIN", "waarde": "Seizoenkaart"}].

Veelgebruikte velden: spend, impressions, reach, frequency, clicks, inline_link_clicks, ctr, inline_link_click_ctr, cpc, cost_per_inline_link_click, cpm, actions, action_values, cost_per_action_type, purchase_roas, video_play_actions. Bij actions, action_values en cost_per_action_type kies je met actie_types welke soorten je ziet, bijvoorbeeld link_click, landing_page_view, purchase, lead of offsite_conversion.fb_pixel_purchase.

Periode: een vaste periode zoals yesterday, last_7d, last_30d, this_month of last_month, of van en tot als JJJJ-MM-DD, in de tijdzone van het account. Bedragen zijn in de valuta van het account. Een lange periode op advertentieniveau kan bij Meta mislukken; neem dan een kortere periode of een hoger niveau. Zoek namen of id's eerst op met campagnes.`;

const CAMPAGNES_BESCHRIJVING =
  "De campagnes, advertentiesets of advertenties van het advertentieaccount van PSV, met status, doel, budget en looptijd. Gebruik dit om te zien wat er loopt, of om een naam of id te vinden voor een filter in rapport.";

const CREATIVES_BESCHRIJVING = `De creatives van advertenties in het advertentieaccount van PSV: de copy (hoofdtekst, kop, beschrijving, knop, link) en de opbouw (afbeelding, video, carrousel met de tekst per kaart, of Advantage+ met alle varianten). Geen cijfers; combineer met rapport op niveau "ad" om te zien welke copy het best presteert.

Kies advertenties op ID (uit rapport of campagnes), of zoek op naam van de advertentie.`;

/** Zoveel posts tegelijk opvragen voor advertenties die op een bestaande post draaien. */
const POSTS_TEGELIJK = 4;

export function createMetaAdsServer({ meta }: { meta: () => MetaApi }): McpServer {
  const server = new McpServer(META_SERVER_INFO, {
    instructions:
      "Cijfers, campagnes en creatives uit Meta Ads van het advertentieaccount van PSV. Alleen lezen. Gebruik rapport voor cijfers over een periode, campagnes om te zien wat er loopt en creatives voor de copy en opbouw van advertenties.",
  });

  const veldnaam = z.string().regex(VELDNAAM);
  const limiet = (standaard: number) =>
    z.number().int().min(1).max(MAX_RIJEN).optional().describe(`Hoeveel rijen, standaard ${standaard}, hooguit ${MAX_RIJEN}.`);

  async function voerUit(tool: string, werk: (api: MetaApi) => Promise<string>) {
    const start = Date.now();
    try {
      const text = await werk(meta());
      console.info(`[mcp/meta-ads] ${tool}: ok in ${Date.now() - start} ms`);
      return { content: [{ type: "text" as const, text }] };
    } catch (err) {
      const text =
        err instanceof MetaInvoerFout || err instanceof MetaConfigError
          ? err.message
          : err instanceof MetaFout
            ? `Meta gaf een fout (${err.status}): ${err.message}`
            : `Meta is niet bereikbaar: ${err instanceof Error ? err.message : String(err)}`;
      console.error(`[mcp/meta-ads] ${tool}: ${text}`);
      return { isError: true, content: [{ type: "text" as const, text }] };
    }
  }

  server.registerTool(
    "rapport",
    {
      title: "Rapport",
      description: RAPPORT_BESCHRIJVING,
      inputSchema: {
        niveau: z.enum(NIVEAUS).describe("Per account (totaal), campaign, adset of ad."),
        velden: z.array(veldnaam).min(1).max(MAX_VELDEN).describe(`1 tot ${MAX_VELDEN} velden, met hun API-naam.`),
        periode: z.enum(PERIODES).optional().describe("Een vaste periode. Of gebruik van en tot."),
        van: z.string().regex(DATUM).optional().describe("Eerste dag, JJJJ-MM-DD."),
        tot: z.string().regex(DATUM).optional().describe("Laatste dag, JJJJ-MM-DD."),
        per: z.enum(["dag", "week", "maand"]).optional().describe("Uitsplitsen in de tijd; zonder dit één rij over de hele periode."),
        uitsplitsing: z.array(veldnaam).max(3).optional().describe("Bijvoorbeeld age, gender, country, region, publisher_platform, platform_position, device_platform."),
        filters: z
          .array(
            z.object({
              veld: z.string().regex(FILTERVELD).describe("Bijvoorbeeld campaign.name, adset.name, ad.name, campaign.id of spend."),
              operator: z.enum(OPERATORS),
              waarde: z.string().min(1).max(500).describe("Bij IN en NOT_IN: waarden gescheiden door komma's."),
            })
          )
          .max(10)
          .optional()
          .describe("Filters; alle filters moeten kloppen."),
        actie_types: z
          .array(z.string().regex(/^[a-z0-9_.]{1,80}$/))
          .max(20)
          .optional()
          .describe("Welke soorten acties je ziet bij actions, action_values en cost_per_action_type."),
        sorteer_op: veldnaam.optional().describe("Veld om op te sorteren; standaard het eerste veld."),
        oplopend: z.boolean().optional().describe("true: van laag naar hoog. Standaard van hoog naar laag."),
        limiet: limiet(STANDAARD_RIJEN),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("rapport", async (api) => {
        const params = rapportParams(invoer);
        const [account, lijst] = await Promise.all([api.account(), api.insights(params)]);
        return rapportTekst(lijst, invoer, account, api.accountPath);
      })
  );

  server.registerTool(
    "campagnes",
    {
      title: "Campagnes",
      description: CAMPAGNES_BESCHRIJVING,
      inputSchema: {
        niveau: z.enum(["campaign", "adset", "ad"]).describe("Campagnes, advertentiesets of advertenties."),
        alleen_actief: z.boolean().optional().describe("true: alleen wat nu loopt."),
        zoek: z.string().max(100).optional().describe("Alleen namen waar dit in staat."),
        limiet: limiet(50),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("campagnes", async (api) => {
        const [account, lijst] = await Promise.all([api.account(), api.objecten(OBJECT_EDGE[invoer.niveau], objectenParams(invoer))]);
        return objectenTekst(lijst, invoer, account, api.accountPath);
      })
  );

  server.registerTool(
    "creatives",
    {
      title: "Creatives",
      description: CREATIVES_BESCHRIJVING,
      inputSchema: {
        advertentie_ids: z
          .array(z.string().regex(/^\d{1,30}$/))
          .min(1)
          .max(50)
          .optional()
          .describe("ID's van advertenties, hooguit 50."),
        zoek: z.string().max(100).optional().describe("Alleen advertenties waar dit in de naam staat."),
        alleen_actief: z.boolean().optional().describe("true: alleen advertenties die nu lopen."),
        limiet: z.number().int().min(1).max(50).optional().describe("Hoeveel advertenties, standaard 20, hooguit 50."),
      },
      annotations: ALLEEN_LEZEN,
    },
    async (invoer) =>
      voerUit("creatives", async (api) => {
        const filters: { field: string; operator: string; value: string | string[] }[] = [];
        if (invoer.advertentie_ids?.length) filters.push({ field: "id", operator: "IN", value: invoer.advertentie_ids });
        if (invoer.zoek?.trim()) filters.push({ field: "name", operator: "CONTAIN", value: invoer.zoek.trim() });
        const params: Record<string, string> = {
          fields: `id,name,effective_status,campaign{name},adset{name},${CREATIVE_VELDEN}`,
          limit: String(invoer.limiet ?? (invoer.advertentie_ids?.length || 20)),
        };
        if (filters.length) params.filtering = JSON.stringify(filters);
        if (invoer.alleen_actief) params.effective_status = JSON.stringify(["ACTIVE"]);

        const lijst = await api.objecten("ads", params);
        const rijen = (lijst.data ?? []).map((rij) => ({
          rij,
          details: normaliseerCreative(rij.creative as MetaCreativeRaw | undefined),
        }));

        // Advertenties op een bestaande post: de tekst staat in de post.
        const zonderTekst = rijen.filter((r) => postZonderTekst(r.details));
        for (let i = 0; i < zonderTekst.length; i += POSTS_TEGELIJK) {
          await Promise.all(
            zonderTekst.slice(i, i + POSTS_TEGELIJK).map(async (r) => {
              try {
                const post = await api.object(postZonderTekst(r.details)!, { fields: "message" });
                r.details = metPostTekst(r.details, typeof post.message === "string" ? post.message : undefined);
              } catch (err) {
                console.error(`[mcp/meta-ads] creatives: post van advertentie ${String(r.rij.id)} niet opgehaald`, err);
              }
            })
          );
        }

        const naam = (v: unknown) => (v && typeof v === "object" && typeof (v as { name?: unknown }).name === "string" ? (v as { name: string }).name : null);
        const kop = [
          `META ADS · creatives${invoer.alleen_actief ? " (alleen actief)" : ""}${invoer.zoek ? ` met "${invoer.zoek}"` : ""}`,
          rijen.length === 0 ? "Geen advertenties gevonden." : `${rijen.length} advertenties.`,
        ];
        const blokken = rijen.map(({ rij, details }) => {
          const waar = [naam(rij.campaign), naam(rij.adset)].filter(Boolean).join(" › ");
          return [
            `## ${String(rij.name ?? "(naamloos)")} (id ${String(rij.id)}, ${String(rij.effective_status ?? "status onbekend")})`,
            ...(waar ? [`Campagne › set: ${waar}`] : []),
            ...creativeTekst(details),
          ].join("\n");
        });
        const regels = [...kop, ...blokken.flatMap((b) => ["", b])];
        if (lijst.paging?.next) regels.push("", "Er zijn er meer; vraag een hogere limiet of zoek specifieker.");
        return regels.join("\n");
      })
  );

  return server;
}
