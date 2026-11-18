import { ToolFout, type ChatTool } from "./toegang";
import { StukFout, nieuweInhoud, nieuweVersie, pasToe, samenvatting, type Stuk } from "../stukken/model";

/**
 * De tools waarmee de assistent een stuk (rapport of one-pager) maakt en
 * bijwerkt. Eén stuk per gesprek; het staat bij de collega die het gesprek
 * voert. Dit zijn de enige tools die iets opslaan, en alleen het stuk zelf:
 * in de bronnen leest de assistent alleen.
 */

export interface StukOpslag {
  get(): Promise<Stuk | null>;
  save(stuk: Stuk): Promise<void>;
}

const BLOK_SCHEMA = {
  type: "object",
  description:
    "Eén blok. Velden per type: kop {tekst}; tekst {tekst, met **vet** en regels die met \"- \" beginnen}; kerngetallen {items: [{label, waarde, toelichting?}] (1-6), bron}; tabel {titel?, kolommen (1-8), rijen (lijsten met evenveel cellen als kolommen, hooguit 40), bron}; grafiek {titel, soort: lijn|staaf, labels, reeksen: [{naam, waarden (getallen, evenveel als labels)}] (1-4), eenheid?, bron}; conclusie {punten (1-6)}. bron is verplicht bij kerngetallen, tabel en grafiek: de bron en de periode, bijvoorbeeld \"Google Analytics psv.nl, 1 t/m 30 oktober 2026\".",
  properties: {
    type: { type: "string", enum: ["kop", "tekst", "kerngetallen", "tabel", "grafiek", "conclusie"] },
    tekst: { type: "string" },
    titel: { type: "string" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: { label: { type: "string" }, waarde: { type: "string" }, toelichting: { type: "string" } },
        required: ["label", "waarde"],
      },
    },
    kolommen: { type: "array", items: { type: "string" } },
    rijen: { type: "array", items: { type: "array", items: { type: "string" } } },
    soort: { type: "string", enum: ["lijn", "staaf"] },
    labels: { type: "array", items: { type: "string" } },
    reeksen: {
      type: "array",
      items: {
        type: "object",
        properties: { naam: { type: "string" }, waarden: { type: "array", items: { type: "number" } } },
        required: ["naam", "waarden"],
      },
    },
    eenheid: { type: "string" },
    punten: { type: "array", items: { type: "string" } },
    bron: { type: "string" },
  },
  required: ["type"],
};

const DATA_TYPES = new Set(["kerngetallen", "tabel", "grafiek"]);

/** Komt er in deze bewerking nieuwe of gewijzigde data bij? Dan schuift de peildatum op. */
function raaktData(invoer: unknown): boolean {
  const acties = (invoer as { acties?: unknown })?.acties;
  return Array.isArray(acties) && acties.some((a) => DATA_TYPES.has((a as { blok?: { type?: string } })?.blok?.type ?? ""));
}

function alsObject(invoer: unknown): { invoer: Record<string, unknown> } | { fout: string } {
  return invoer && typeof invoer === "object" && !Array.isArray(invoer)
    ? { invoer: invoer as Record<string, unknown> }
    : { fout: "De invoer moet een object zijn." };
}

export function stukTools({
  gesprekId,
  email,
  opslag,
  vandaag,
  nu = () => new Date().toISOString(),
  onGewijzigd,
}: {
  gesprekId: string;
  email: string;
  opslag: StukOpslag;
  /** De dag van vandaag in Amsterdam, JJJJ-MM-DD: de peildatum. */
  vandaag: string;
  nu?: () => string;
  onGewijzigd: (stuk: Stuk) => void;
}): ChatTool[] {
  // Eén bewerking tegelijk: het model kan tools parallel aanroepen, en elke
  // bewerking leest en schrijft het hele stuk.
  let rij: Promise<unknown> = Promise.resolve();
  function serieel<T>(werk: () => Promise<T>): Promise<T> {
    const volgende = rij.then(werk);
    rij = volgende.catch(() => undefined);
    return volgende;
  }

  async function bewaar(stuk: Stuk, wat: string): Promise<string> {
    await opslag.save(stuk);
    onGewijzigd(stuk);
    return `${wat}. ${samenvatting(stuk)}\nDe collega ziet het stuk naast de chat en kan het daar delen of afdrukken.`;
  }

  function alsToolFout(err: unknown): never {
    if (err instanceof StukFout) throw new ToolFout(err.message);
    throw err;
  }

  return [
    {
      name: "stuk_maken",
      label: "Stuk · Maken",
      page: "/dashboard/assistent",
      geenBron: true,
      description:
        "Maakt het stuk bij dit gesprek: een rapport of een one-pager, opgebouwd uit blokken. Is er al een stuk, dan vervangt dit de hele inhoud (de vorige versie blijft bewaard). Gebruik dit alleen als de collega om een rapport, one-pager of iets om te delen vraagt. Voor kleine aanpassingen: stuk_bijwerken.",
      inputSchema: {
        type: "object",
        properties: {
          soort: { type: "string", enum: ["rapport", "onepager"], description: "rapport: een langere pagina. onepager: hooguit 8 blokken op één pagina." },
          titel: { type: "string" },
          ondertitel: { type: "string" },
          blokken: { type: "array", items: BLOK_SCHEMA },
        },
        required: ["soort", "titel", "blokken"],
      },
      lees: alsObject,
      run: (invoer) =>
        serieel(async () => {
          const inhoud = (() => {
            try {
              return nieuweInhoud(invoer);
            } catch (err) {
              return alsToolFout(err);
            }
          })();
          const bestaand = await opslag.get();
          const tijd = nu();
          const stuk: Stuk = bestaand
            ? nieuweVersie(bestaand, inhoud, vandaag, tijd)
            : { id: gesprekId, eigenaar: email, ...inhoud, versie: 1, peildatum: vandaag, vorige: [], createdAt: tijd, updatedAt: tijd };
          return bewaar(stuk, bestaand ? "Stuk vervangen" : "Stuk gemaakt");
        }),
    },
    {
      name: "stuk_bijwerken",
      label: "Stuk · Bijwerken",
      page: "/dashboard/assistent",
      geenBron: true,
      description:
        'Past het stuk bij dit gesprek aan, zonder de rest opnieuw te maken. acties is een lijst van: {actie: "toevoegen", blok, na?: blok-id of "begin"}, {actie: "wijzigen", blok_id, blok} (vervangt dat blok), {actie: "verwijderen", blok_id}, {actie: "verplaatsen", blok_id, na: blok-id of "begin"}. Met titel, ondertitel of soort verander je die. Alles of niets: klopt één actie niet, dan verandert er niets.',
      inputSchema: {
        type: "object",
        properties: {
          acties: {
            type: "array",
            items: {
              type: "object",
              properties: {
                actie: { type: "string", enum: ["toevoegen", "wijzigen", "verwijderen", "verplaatsen"] },
                blok_id: { type: "string" },
                na: { type: "string" },
                blok: BLOK_SCHEMA,
              },
              required: ["actie"],
            },
          },
          titel: { type: "string" },
          ondertitel: { type: "string" },
          soort: { type: "string", enum: ["rapport", "onepager"] },
        },
      },
      lees: alsObject,
      run: (invoer) =>
        serieel(async () => {
          const bestaand = await opslag.get();
          if (!bestaand) throw new ToolFout("Er is nog geen stuk bij dit gesprek. Maak er eerst een met stuk_maken.");
          let inhoud;
          try {
            inhoud = pasToe(bestaand, invoer);
          } catch (err) {
            alsToolFout(err);
          }
          const peildatum = raaktData(invoer) ? vandaag : bestaand.peildatum;
          return bewaar(nieuweVersie(bestaand, inhoud!, peildatum, nu()), "Stuk bijgewerkt");
        }),
    },
  ];
}
