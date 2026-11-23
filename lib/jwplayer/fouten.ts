import { JwFout } from "./client";
import { PeriodeFout } from "./periode";
import { JwConfigError } from "./sites";

/** Een fout naar een melding en status voor de pagina of de MCP-tool. Het secret komt nooit in een melding. */
export function foutAntwoord(err: unknown): { status: number; melding: string } {
  if (err instanceof PeriodeFout) return { status: 400, melding: err.message };
  if (err instanceof JwConfigError) return { status: 503, melding: err.message };
  if (err instanceof JwFout) {
    if (err.status === 401 || err.status === 403) {
      return { status: 502, melding: `JW Player weigerde de sleutel (${err.status}): controleer JWPLAYER_SECRET in Vercel. ${err.message}` };
    }
    return { status: 502, melding: `JW Player gaf een fout (${err.status}): ${err.message}` };
  }
  return { status: 502, melding: `JW Player is niet bereikbaar: ${err instanceof Error ? err.message : String(err)}` };
}
