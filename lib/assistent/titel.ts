import type Anthropic from "@anthropic-ai/sdk";
import { modelVoor } from "@/lib/modellen/store";

/**
 * De titel van een gesprek, zoals in Claude: een paar woorden over waar het
 * gesprek over gaat, in plaats van de eerste vraag afgekapt. Een klein model
 * maakt hem tegelijk met het eerste antwoord, dus de collega wacht er niet op.
 */

const MAX_LENGTE = 60;

const INSTRUCTIES = `Je geeft een gesprek in PSV Tools (de interne tool van het marketingteam van PSV) een titel voor de lijst met gesprekken.
- 2 tot 6 woorden, Nederlands, zoals een onderwerp: "Ticketverkoop PSV - Go Ahead Eagles", "Coen Dillen-campagne in de FANstore", "Paid Ads seizoenskaarten oktober".
- Noem de wedstrijd, campagne, periode of bron als die in de vraag staat. Geen vraagvorm, geen "Vraag over".
- Alleen een hoofdletter aan het begin en bij namen. Geen aanhalingstekens, geen punt aan het eind.
- Antwoord met alleen de titel.`;

/** Maakt de titel van het model schoon; null als er niets bruikbaars staat. */
export function schoneTitel(ruw: string): string | null {
  let titel = (ruw.split("\n").find((regel) => regel.trim()) ?? "").trim();
  titel = titel
    .replace(/^(titel|title)\s*:\s*/i, "")
    .replace(/^[#*\s]+|[*\s]+$/g, "")
    .replace(/^["'“”‘’„]+/, "")
    .replace(/["'“”‘’„.!?:;,\s]+$/, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!titel) return null;
  if (titel.length > MAX_LENGTE) {
    const kort = titel.slice(0, MAX_LENGTE);
    const spatie = kort.lastIndexOf(" ");
    titel = `${spatie > 20 ? kort.slice(0, spatie) : kort}…`;
  }
  return titel;
}

/** Vraagt het kleine model om een titel; null bij een fout of een leeg antwoord. */
export async function maakTitel(
  client: Anthropic,
  berichten: { role: "user" | "assistant"; content: string }[],
  signal?: AbortSignal
): Promise<string | null> {
  // De eerste vragen zijn genoeg om te zien waar het over gaat.
  const gesprek = berichten
    .slice(0, 4)
    .map((b) => `${b.role === "user" ? "Collega" : "Assistent"}: ${b.content.slice(0, 1500)}`)
    .join("\n\n");
  const antwoord = await client.messages.create(
    {
      model: (await modelVoor("assistent-titel")).model,
      max_tokens: 64,
      system: INSTRUCTIES,
      messages: [{ role: "user", content: `Het gesprek:\n\n${gesprek}` }],
    },
    { signal }
  );
  const tekst = antwoord.content.map((blok) => (blok.type === "text" ? blok.text : "")).join("");
  return schoneTitel(tekst);
}
