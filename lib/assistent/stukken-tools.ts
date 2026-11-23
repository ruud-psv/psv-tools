import { ToolFout, type ChatTool } from "./toegang";
import { StukFout, nieuweInhoud, nieuweVersie, pasToe, samenvatting, type Stuk } from "../stukken/model";

/**
 * De tools waarmee de assistent een stuk (rapport of slide deck) maakt en
 * bijwerkt. Eén stuk per gesprek; het staat bij de collega die het gesprek
 * voert. Dit zijn de enige tools die iets opslaan, en alleen het stuk zelf:
 * in de bronnen leest de assistent alleen.
 */

export interface StukOpslag {
  get(): Promise<Stuk | null>;
  save(stuk: Stuk): Promise<void>;
}

const OPMAAK_SCHEMA = {
  type: "object",
  description:
    "De vorm van het blok, los van de inhoud; alles optioneel. grootte: half (naast een ander half blok; in een deck delen twee halve blokken na elkaar één slide), heel (standaard) of groot (meer ruimte, grotere grafiek). achtergrond: wit, grijs, rood of zwart (in een deck: de slide; een conclusie is daar standaard rood). nadruk: de naam van de reeks (grafiek), de eerste cel van een rij (tabel) of het label van een kerngetal dat eruit moet springen. kernboodschap: de boodschap van het blok als korte stelling, bijvoorbeeld \"Nog 312 stoelen te koop\"; in een deck de titel van de slide, in een rapport een kop boven het blok.",
  properties: {
    grootte: { type: "string", enum: ["half", "heel", "groot"] },
    achtergrond: { type: "string", enum: ["wit", "grijs", "rood", "zwart"] },
    nadruk: { type: "string" },
    kernboodschap: { type: "string" },
  },
};

const BLOK_SCHEMA = {
  type: "object",
  description:
    "Eén blok. Velden per type: kop {tekst}; tekst {tekst, met **vet** en regels die met \"- \" beginnen}; kerngetallen {items: [{label, waarde, toelichting?}] (1-6), bron}; tabel {titel?, kolommen (1-8), rijen (lijsten met evenveel cellen als kolommen, hooguit 40), bron}; grafiek {titel, soort: lijn|staaf, labels, reeksen: [{naam, waarden (getallen, evenveel als labels)}] (1-4), eenheid?, bron}; conclusie {punten (1-6)}; afbeelding {wens: wat er op de foto moet, bijvoorbeeld \"Een vol Philips Stadion bij avond\", bijschrift?, alt?}: een lege plek waar de collega een foto in zet; geef nooit een url. bron is verplicht bij kerngetallen, tabel en grafiek: de bron en de periode, bijvoorbeeld \"Google Analytics psv.nl, 1 t/m 30 oktober 2026\". Elk blok kan opmaak hebben.",
  properties: {
    opmaak: OPMAAK_SCHEMA,
    type: { type: "string", enum: ["kop", "tekst", "kerngetallen", "tabel", "grafiek", "conclusie", "afbeelding"] },
    wens: { type: "string" },
    bijschrift: { type: "string" },
    alt: { type: "string" },
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

const TITELBEELD_SCHEMA = {
  type: "object",
  description:
    "Een foto achter de titel (titelslide van een deck, boven een rapport). Geef alleen wens: wat erop moet; de collega uploadt de foto. Bij stuk_bijwerken haalt null hem weg.",
  properties: { wens: { type: "string" } },
};

const SLIDE_SCHEMA = {
  type: "object",
  description:
    'Eén slide in het PowerPoint-template van PSV. layout bepaalt de vorm en welke velden er staan: welkom {titel, subkop?} (opening); hoofdstuk {titel, subkop?} (begin van een onderdeel); tekst {titel, subkop?, tekst}; tekst-2 {titel, subkop?, tekst, tekst2}; beeld {titel, subkop?, tekst, foto, fotoBreedte 1-5} (tekst links, foto rechts; 1 smal, 5 bijna de hele slide); speciaal {titel, tekst?, foto} (foto groot met rode schuine vorm, tekst in een wit vak); quote {quote, naam?, foto?}; foto {foto} (alleen een foto); grafiek {titel, subkop?, tekst (2-3 punten uitleg), grafiek, nadruk?}; tabel {titel, subkop?, tekst, tabel, nadruk?}; cijfers {titel, kerngetallen, nadruk?}; rood / zwart {titel, tekst?}; afsluiting {}. titel staat wit op een zwart blok en moet op één regel passen: kort, een stelling. tekst: "- " voor een opsomming, **vet**. foto: {wens} met wat erop moet; de collega kiest de foto (geef nooit een url). grafiek, tabel en kerngetallen: dezelfde velden als bij de blokken, met bron.',
  properties: {
    layout: { type: "string", enum: ["welkom", "hoofdstuk", "tekst", "tekst-2", "beeld", "speciaal", "quote", "foto", "grafiek", "tabel", "cijfers", "rood", "zwart", "afsluiting"] },
    titel: { type: "string" },
    subkop: { type: "string" },
    tekst: { type: "string" },
    tekst2: { type: "string" },
    foto: { type: "object", properties: { wens: { type: "string" } } },
    fotoBreedte: { type: "integer", minimum: 1, maximum: 5 },
    quote: { type: "string" },
    naam: { type: "string" },
    grafiek: { type: "object", description: "{titel, soort: lijn|staaf, labels, reeksen: [{naam, waarden}], eenheid?, bron}" },
    tabel: { type: "object", description: "{titel?, kolommen, rijen, bron}" },
    kerngetallen: { type: "object", description: "{items: [{label, waarde, toelichting?}], bron}" },
    nadruk: { type: "string" },
  },
  required: ["layout"],
};

const DATA_TYPES = new Set(["kerngetallen", "tabel", "grafiek"]);

/** Komt er in deze bewerking nieuwe of gewijzigde data bij? Dan schuift de peildatum op. */
function raaktData(invoer: unknown): boolean {
  const acties = (invoer as { acties?: unknown })?.acties;
  return (
    Array.isArray(acties) &&
    acties.some((a) => {
      const x = a as { blok?: { type?: string }; slide?: Record<string, unknown> };
      return DATA_TYPES.has(x?.blok?.type ?? "") || Boolean(x?.slide && (x.slide.grafiek || x.slide.tabel || x.slide.kerngetallen));
    })
  );
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
        "Maakt het stuk bij dit gesprek: een rapport of een slide deck, opgebouwd uit blokken. Is er al een stuk, dan vervangt dit de hele inhoud (de vorige versie blijft bewaard). Gebruik dit alleen als de collega om een rapport, one-pager, presentatie, deck of iets om te delen vraagt. Voor kleine aanpassingen: stuk_bijwerken.",
      inputSchema: {
        type: "object",
        properties: {
          soort: {
            type: "string",
            enum: ["rapport", "deck"],
            description:
              "rapport: een pagina met blokken; een one-pager is een kort rapport met halve blokken naast elkaar. deck: slides in het PowerPoint-template van PSV; geef dan slides in plaats van blokken.",
          },
          titel: { type: "string" },
          ondertitel: { type: "string" },
          titelbeeld: TITELBEELD_SCHEMA,
          blokken: { type: "array", items: BLOK_SCHEMA, description: "Bij een rapport." },
          slides: { type: "array", items: SLIDE_SCHEMA, description: "Bij een deck: de slides in volgorde, beginnend met welkom en eindigend met afsluiting." },
        },
        required: ["soort", "titel"],
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
        'Past het stuk bij dit gesprek aan, zonder de rest opnieuw te maken. Bij een deck: {actie: "slide_toevoegen", slide, na?: slide-id of "begin"} (zonder na: vóór de afsluiting), {actie: "slide_wijzigen", slide_id, slide} (alleen de velden die je meegeeft veranderen; null haalt een veld weg; ook layout), {actie: "slide_verwijderen", slide_id}, {actie: "slide_verplaatsen", slide_id, na}. Bij een rapport: {actie: "toevoegen", blok, na?: blok-id of "begin"}, {actie: "wijzigen", blok_id, blok} (vervangt de inhoud; zonder opmaak blijft de opmaak staan), {actie: "opmaken", blok_id, opmaak} (alleen de vorm: grootte, achtergrond, nadruk, kernboodschap; null of "" haalt een veld weg), {actie: "verwijderen", blok_id}, {actie: "verplaatsen", blok_id, na: blok-id of "begin"}. Met titel, ondertitel of soort verander je die; soort "deck" zet hetzelfde stuk op slides. Alles of niets: klopt één actie niet, dan verandert er niets.',
      inputSchema: {
        type: "object",
        properties: {
          acties: {
            type: "array",
            items: {
              type: "object",
              properties: {
                actie: {
                  type: "string",
                  enum: ["toevoegen", "wijzigen", "opmaken", "verwijderen", "verplaatsen", "slide_toevoegen", "slide_wijzigen", "slide_verwijderen", "slide_verplaatsen"],
                },
                blok_id: { type: "string" },
                slide_id: { type: "string" },
                slide: SLIDE_SCHEMA,
                na: { type: "string" },
                blok: BLOK_SCHEMA,
                opmaak: OPMAAK_SCHEMA,
              },
              required: ["actie"],
            },
          },
          titel: { type: "string" },
          ondertitel: { type: "string" },
          titelbeeld: TITELBEELD_SCHEMA,
          soort: { type: "string", enum: ["rapport", "deck"] },
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
