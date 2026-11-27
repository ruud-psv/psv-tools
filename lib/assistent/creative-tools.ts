import { creativeTekst, type CreativeDetails } from "@/lib/meta-ads/creative";
import { ToolFout, type ChatTool } from "./toegang";

/**
 * De tool waarmee de assistent Meta-advertenties in de chat laat zien: als
 * kaart met de afbeelding of video en de copy, onder het antwoord. Het model
 * krijgt de copy als tekst terug; de chat krijgt de kaarten via `onGetoond`.
 *
 * Hoort bij Paid Ads: alleen wie die pagina mag zien, krijgt de tool.
 */

/** Eén advertentie zoals de chat hem toont en bij het gesprek bewaart. */
export interface AssistentCreative {
  platform: "meta";
  adId: string;
  naam: string | null;
  campagne: string | null;
  details: CreativeDetails;
}

/** Zoveel kaarten per aanroep; meer leest niet prettig in een chat. */
export const MAX_CREATIVES = 6;

export const CREATIVE_TOOL_NAAM = "meta_creatives_tonen";

const ID = /^\d{1,30}$/;

export function creativeTools({
  haal,
  onGetoond,
}: {
  /** De advertenties bij Meta, op ID; ontbrekende ID's kende Meta niet. */
  haal: (ids: string[]) => Promise<Map<string, Omit<AssistentCreative, "platform" | "adId"> & { id: string }>>;
  onGetoond: (creatives: AssistentCreative[]) => void;
}): ChatTool[] {
  return [
    {
      name: CREATIVE_TOOL_NAAM,
      label: "Paid Ads · Creatives tonen",
      page: "/dashboard/paid-ads",
      description: `Laat Meta-advertenties (Facebook en Instagram) zien in de chat: per advertentie een kaart met de afbeelding of video en de copy, onder je antwoord. Gebruik dit altijd als de collega een creative of advertentie wil zien, en als je in je antwoord specifieke advertenties uitlicht (de beste, de slechtste, een vergelijking). Geef de advertentie-ID's in de volgorde waarin je ze bespreekt, hooguit ${MAX_CREATIVES}. De ID's staan in de kolom ad_id van het rapport op niveau "ad". Je krijgt de copy terug; herhaal die niet woordelijk, de collega ziet hem op de kaart.`,
      inputSchema: {
        type: "object",
        properties: {
          advertentie_ids: {
            type: "array",
            items: { type: "string", pattern: ID.source },
            minItems: 1,
            maxItems: MAX_CREATIVES,
            description: `ID's van Meta-advertenties, hooguit ${MAX_CREATIVES}.`,
          },
        },
        required: ["advertentie_ids"],
        additionalProperties: false,
      },
      lees(invoer) {
        const ids = (invoer as { advertentie_ids?: unknown } | null)?.advertentie_ids;
        if (!Array.isArray(ids) || ids.length === 0) return { fout: "Geef advertentie_ids: een lijst met ID's." };
        if (ids.length > MAX_CREATIVES) return { fout: `Hooguit ${MAX_CREATIVES} advertenties tegelijk.` };
        if (!ids.every((id) => typeof id === "string" && ID.test(id))) {
          return { fout: "Een advertentie-ID bestaat alleen uit cijfers." };
        }
        return { invoer: { advertentie_ids: [...new Set(ids as string[])] } };
      },
      async run(invoer) {
        const ids = invoer.advertentie_ids as string[];
        const gevonden = await haal(ids);
        const creatives: AssistentCreative[] = ids.flatMap((id) => {
          const ad = gevonden.get(id);
          return ad ? [{ platform: "meta" as const, adId: id, naam: ad.naam, campagne: ad.campagne, details: ad.details }] : [];
        });
        if (creatives.length === 0) {
          throw new ToolFout("Meta kent geen van deze advertenties in het account. Controleer de ID's met het rapport op niveau ad.");
        }
        onGetoond(creatives);

        const ontbreekt = ids.filter((id) => !gevonden.has(id));
        return [
          `${creatives.length} ${creatives.length === 1 ? "advertentie staat" : "advertenties staan"} als kaart in de chat, met beeld en copy.`,
          ...(ontbreekt.length ? [`Niet gevonden bij Meta: ${ontbreekt.join(", ")}.`] : []),
          ...creatives.flatMap((c) => [
            "",
            `## ${c.naam ?? "(naamloos)"} (id ${c.adId})${c.campagne ? `, campagne ${c.campagne}` : ""}`,
            ...creativeTekst(c.details),
          ]),
        ].join("\n");
      },
    },
  ];
}

/** Leest bewaarde kaarten terug; laat alles weg wat niet klopt. */
export function leesCreatives(waarde: unknown): AssistentCreative[] {
  if (!Array.isArray(waarde)) return [];
  return waarde.filter(
    (c): c is AssistentCreative =>
      Boolean(c) &&
      typeof c === "object" &&
      (c as AssistentCreative).platform === "meta" &&
      typeof (c as AssistentCreative).adId === "string" &&
      ID.test((c as AssistentCreative).adId) &&
      Boolean((c as AssistentCreative).details) &&
      typeof (c as AssistentCreative).details === "object"
  );
}
