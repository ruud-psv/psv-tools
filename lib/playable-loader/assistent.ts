import Anthropic from "@anthropic-ai/sdk";
import { FRAMEWORK_CSS } from "./kit";
import { KIT_ACHTERGRONDEN, KIT_COMPONENTEN, KIT_REGELS, KIT_VALKUILEN } from "./skill";
import { PageSourceError, preparePage, zonderKit, type PageSource } from "./bundle";

export { zonderKit };

/**
 * De assistent van de Playable loader: een collega zegt in gewone taal wat er
 * anders moet, Claude geeft gerichte wijzigingen (zoek en vervang per veld) en
 * PSV Tools voert ze uit op het concept. Publiceren blijft een aparte stap.
 *
 * Gerichte wijzigingen in plaats van hele bestanden: minder kans dat er
 * ongemerkt iets anders verandert, sneller, en de collega ziet precies wat er
 * gebeurt. Lukt een wijziging niet (zoektekst niet of vaker gevonden, of de
 * JavaScript klopt daarna niet), dan krijgt Claude dat terug en probeert het
 * opnieuw, op de ongewijzigde code.
 */

/** Opus: het gaat om precieze wijzigingen in grote bestanden die live gaan. */
export const MODEL = "claude-opus-5-5";
const MAX_POGINGEN = 3;
const MAX_TOKENS = 16_000;

export type Veld = keyof PageSource;

export interface Wijziging {
  veld: Veld;
  /** Letterlijk stuk uit de huidige code; leeg = achteraan toevoegen. */
  zoek: string;
  vervang: string;
}

export interface Bericht {
  rol: "gebruiker" | "assistent";
  tekst: string;
}

export interface AssistentAntwoord {
  antwoord: string;
  /** De nieuwe code, als er iets is gewijzigd. Altijd zonder de Kit. */
  bron: PageSource | null;
  wijzigingen: Wijziging[];
}

export class AssistentError extends Error {}

/* ---------- Wijzigingen toepassen ---------- */

function aantalKeer(tekst: string, stuk: string): number {
  if (!stuk) return 0;
  let n = 0;
  for (let i = tekst.indexOf(stuk); i !== -1; i = tekst.indexOf(stuk, i + stuk.length)) n++;
  return n;
}

const VELDNAAM: Record<Veld, string> = { html: "HTML", css: "CSS", js: "JavaScript" };

/**
 * Voert alle wijzigingen uit, of geen: lukt er één niet, dan blijft de code
 * zoals hij was en komen de fouten terug.
 */
export function pasToe(bron: PageSource, wijzigingen: Wijziging[]): { bron: PageSource; fouten: string[] } {
  const nieuw: PageSource = { ...bron };
  const fouten: string[] = [];

  wijzigingen.forEach((w, i) => {
    const nr = `Wijziging ${i + 1} (${VELDNAAM[w.veld] ?? w.veld})`;
    if (!(w.veld in VELDNAAM)) {
      fouten.push(`${nr}: onbekend veld.`);
      return;
    }
    if (w.zoek === "") {
      nieuw[w.veld] = nieuw[w.veld] ? `${nieuw[w.veld].trimEnd()}\n\n${w.vervang}` : w.vervang;
      return;
    }
    const keer = aantalKeer(nieuw[w.veld], w.zoek);
    if (keer === 0) fouten.push(`${nr}: de zoektekst staat niet in de code.`);
    else if (keer > 1) fouten.push(`${nr}: de zoektekst staat ${keer} keer in de code; neem meer omringende tekst mee.`);
    else nieuw[w.veld] = nieuw[w.veld].replace(w.zoek, () => w.vervang);
  });

  return fouten.length > 0 ? { bron, fouten } : { bron: nieuw, fouten };
}

/* ---------- Het gesprek ---------- */

export const ANTWOORD_SCHEMA = {
  type: "object",
  properties: {
    antwoord: {
      type: "string",
      description: "Kort antwoord aan de collega, in het Nederlands, zonder code.",
    },
    wijzigingen: {
      type: "array",
      items: {
        type: "object",
        properties: {
          veld: { type: "string", enum: ["html", "css", "js"] },
          zoek: { type: "string" },
          vervang: { type: "string" },
        },
        required: ["veld", "zoek", "vervang"],
        additionalProperties: false,
      },
    },
  },
  required: ["antwoord", "wijzigingen"],
  additionalProperties: false,
} as const;

const ROL = `Je bent de pagina-assistent van PSV Tools. Je past campagnepagina's van PSV aan die in Playable staan en gebouwd zijn met de PSV Campaign Kit. Collega's van PSV Marketing vragen in gewone taal wat er anders moet; veel van hen programmeren niet. Jij past de HTML, CSS en JavaScript van de pagina aan.

Je krijgt in het laatste bericht de huidige code van de pagina, in <pagina_html>, <pagina_css> en <pagina_js>. Daar zit de Kit zelf (de basis-CSS en -JS) niet in: die zet PSV Tools er bij het publiceren bij, en die pas je nooit aan. Wat de Kit biedt staat hieronder.

Zo werk je:
- Doe wat gevraagd is en niet meer. Verander geen teksten, links, beelden of opmaak waar niet om gevraagd is.
- Geef je wijzigingen als zoek en vervang. "zoek" is een letterlijk stuk uit de huidige code van dat veld, met precies dezelfde tekens en spaties, dat er precies één keer in voorkomt. Neem genoeg omringende code mee om het uniek te maken, maar niet meer dan nodig. "vervang" is wat er voor dat stuk in de plaats komt. Wil je iets achteraan een veld toevoegen, laat "zoek" dan leeg.
- Volg de Kit: bestaande klassen en tokens, alles onder #psvk-app, pagina-eigen klassen met een eigen prefix. Geen nieuwe kleuren, maten of lettertypes.
- Pagina-eigen JavaScript start via het event psvk:ready, zoals in de naslag.
- Teksten op de pagina: Nederlands, tegenwoordige tijd, "je" en niet "u". PSV FANstore, Philips Stadion, seizoen als 2026-2027.
- Beelden en links: gebruik alleen adressen die de collega geeft of die al in de code staan. Verzin geen adressen.
- Voeg geen scripts van buiten, trackingcode, of formulieren die gegevens versturen toe. Zeg dat dat via het digital team loopt.
- Is de vraag onduidelijk, of mis je iets (een tekst, een beeldadres, een link), vraag het dan en geef geen wijzigingen.
- Kan iets niet binnen de Kit of Playable, leg uit waarom en geef geen wijzigingen.

"antwoord" is voor de collega: kort, in gewone taal, zonder code. Zeg wat je hebt aangepast, of wat je nog nodig hebt. De collega ziet daarna een voorbeeld en publiceert zelf.`;

export function systemPrompt(): string {
  return [
    ROL,
    `# Regels van de Kit\n\n${KIT_REGELS}`,
    `# Naslag: onderdelen en klassen\n\n${KIT_COMPONENTEN}`,
    `# Valkuilen van Playable\n\n${KIT_VALKUILEN}`,
    `# Achtergronden\n\n${KIT_ACHTERGRONDEN}`,
    `# De CSS van de Kit (alleen ter naslag, niet aanpassen)\n\n\`\`\`css\n${FRAMEWORK_CSS}\n\`\`\``,
  ].join("\n\n");
}

export function codeBericht(bron: PageSource, vraag: string): string {
  return `<pagina_html>\n${bron.html}\n</pagina_html>\n\n<pagina_css>\n${bron.css}\n</pagina_css>\n\n<pagina_js>\n${bron.js}\n</pagina_js>\n\nVraag van de collega:\n${vraag}`;
}

/** Leest het JSON-antwoord; geeft null bij iets onbruikbaars. */
export function leesAntwoord(tekst: string): { antwoord: string; wijzigingen: Wijziging[] } | null {
  try {
    const data = JSON.parse(tekst) as { antwoord?: unknown; wijzigingen?: unknown };
    if (typeof data.antwoord !== "string" || !Array.isArray(data.wijzigingen)) return null;
    const wijzigingen = data.wijzigingen.filter(
      (w): w is Wijziging =>
        !!w &&
        typeof w === "object" &&
        typeof (w as Wijziging).veld === "string" &&
        typeof (w as Wijziging).zoek === "string" &&
        typeof (w as Wijziging).vervang === "string"
    );
    return { antwoord: data.antwoord, wijzigingen };
  } catch {
    return null;
  }
}

/**
 * Vraagt Claude om een aanpassing en voert die uit. `berichten` is het
 * gesprek tot nu toe; de laatste is de nieuwe vraag van de collega.
 */
export async function vraagAanpassing(args: {
  berichten: Bericht[];
  bron: PageSource;
  client?: Anthropic;
}): Promise<AssistentAntwoord & { gebruik: { input: number; output: number; cacheRead: number } }> {
  const { berichten } = args;
  const laatste = berichten[berichten.length - 1];
  if (!laatste || laatste.rol !== "gebruiker" || !laatste.tekst.trim()) {
    throw new AssistentError("Er is geen vraag.");
  }

  const client = args.client ?? new Anthropic();
  const bron = zonderKit(args.bron);

  // Eerdere beurten als gewone tekst; de code staat alleen in de laatste,
  // zodat Claude altijd de huidige versie ziet en nooit een oude.
  const messages: Anthropic.MessageParam[] = berichten.slice(0, -1).map((b) => ({
    role: b.rol === "gebruiker" ? "user" : "assistant",
    content: b.tekst,
  }));
  messages.push({ role: "user", content: codeBericht(bron, laatste.tekst) });

  const gebruik = { input: 0, output: 0, cacheRead: 0 };

  for (let poging = 1; poging <= MAX_POGINGEN; poging++) {
    const message = await client.messages
      .stream({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        system: [{ type: "text", text: systemPrompt(), cache_control: { type: "ephemeral" } }],
        messages,
        output_config: {
          effort: "medium",
          format: { type: "json_schema", schema: ANTWOORD_SCHEMA as unknown as Record<string, unknown> },
        },
      })
      .finalMessage();

    gebruik.input += message.usage.input_tokens;
    gebruik.output += message.usage.output_tokens;
    gebruik.cacheRead += message.usage.cache_read_input_tokens ?? 0;

    if (message.stop_reason === "refusal") {
      throw new AssistentError("Claude wil deze vraag niet uitvoeren. Formuleer hem anders of vraag het digital team.");
    }
    if (message.stop_reason === "max_tokens") {
      throw new AssistentError("Het antwoord werd te lang. Vraag om een kleinere wijziging per keer.");
    }

    const tekst = message.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    const gelezen = leesAntwoord(tekst);
    if (!gelezen) throw new AssistentError("Claude gaf een antwoord dat PSV Tools niet kon lezen. Probeer het opnieuw.");

    if (gelezen.wijzigingen.length === 0) {
      return { antwoord: gelezen.antwoord, bron: null, wijzigingen: [], gebruik };
    }

    const resultaat = pasToe(bron, gelezen.wijzigingen);
    let fouten = resultaat.fouten;
    if (fouten.length === 0) {
      try {
        preparePage(resultaat.bron);
      } catch (err) {
        if (!(err instanceof PageSourceError)) throw err;
        fouten = [err.message];
      }
    }
    if (fouten.length === 0) {
      return { antwoord: gelezen.antwoord, bron: resultaat.bron, wijzigingen: gelezen.wijzigingen, gebruik };
    }

    // Het antwoord letterlijk terug, met de denkblokken erin: het gesprek
    // groeit alleen aan, dan blijven die geldig.
    messages.push({ role: "assistant", content: message.content });
    messages.push({
      role: "user",
      content:
        `Je wijzigingen zijn niet uitgevoerd; de code is ongewijzigd (zie hierboven):\n- ${fouten.join("\n- ")}\n\n` +
        "Geef alle wijzigingen opnieuw, met zoekteksten die letterlijk en precies één keer in de huidige code staan.",
    });
  }

  throw new AssistentError(
    "Het lukte Claude niet om de wijziging precies in de code te zetten. Probeer het kleiner of anders te vragen."
  );
}
