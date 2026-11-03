/**
 * Een privé blob lezen, met een paar nieuwe pogingen bij een netwerkfout.
 *
 * `put()` van @vercel/blob probeert het zelf opnieuw als de verbinding wegvalt;
 * `get()` niet. Die doet één fetch en gooit bij de eerste hapering een kale
 * `TypeError: fetch failed`. Een pagina die een paar grote bestanden leest
 * (zoals "Maak lijst" bij Aangrenzende stoelen) liep daardoor stuk op iets wat
 * een seconde later gewoon lukt.
 */

import { get } from "@vercel/blob";

/** Wachttijden voor een nieuwe poging; samen zes seconden. */
const RETRY_DELAYS_MS = [500, 1_500, 4_000];

/**
 * Of een fout tijdelijk is. undici (de fetch onder `get()`) geeft
 * `fetch failed` als er geen antwoord kwam en `terminated` als de verbinding
 * halverwege de inhoud wegviel; `get()` zelf gooit bij een foutstatus
 * `Failed to fetch blob: 503 Service Unavailable`.
 */
export function isTransientBlobError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.name === "TypeError" && (error.message === "fetch failed" || error.message === "terminated")) return true;
  const status = /Failed to fetch blob: (\d{3})/.exec(error.message)?.[1];
  return status !== undefined && (status === "429" || Number(status) >= 500);
}

/**
 * De foutmelding met de oorzaak erbij. undici zet de echte reden in `cause`
 * (`other side closed`, `read ECONNRESET`); zonder die zegt `fetch failed` niets.
 */
export function describeBlobError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause;
  if (!(cause instanceof Error)) return error.message;
  const code = (cause as { code?: unknown }).code;
  const detail = typeof code === "string" && !cause.message.includes(code) ? `${code}: ${cause.message}` : cause.message;
  return `${error.message} (${detail})`;
}

export class BlobReadError extends Error {
  readonly path: string;

  constructor(path: string, cause: unknown) {
    super(`Lezen uit de opslag (Vercel Blob) mislukt voor ${path}: ${describeBlobError(cause)}`, { cause });
    this.name = "BlobReadError";
    this.path = path;
  }
}

/**
 * Voert `read` uit en probeert het opnieuw bij een tijdelijke fout. Het hele
 * lezen hoort erin, niet alleen de fetch: ook halverwege de inhoud kan de
 * verbinding wegvallen.
 */
export async function withBlobRetry<T>(
  path: string,
  read: () => Promise<T>,
  delays: readonly number[] = RETRY_DELAYS_MS
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await read();
    } catch (error) {
      const delay = delays[attempt];
      if (delay === undefined || !isTransientBlobError(error)) throw new BlobReadError(path, error);
      console.warn(`[blob] ${path}: ${describeBlobError(error)}; nieuwe poging over ${delay} ms`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
}

/** De inhoud van een privé blob, of `null` als hij niet bestaat. */
export function readPrivateBlob(path: string): Promise<Buffer | null> {
  return withBlobRetry(path, async () => {
    const result = await get(path, { access: "private", useCache: false });
    if (!result || !result.stream) return null;
    return Buffer.from(await new Response(result.stream).arrayBuffer());
  });
}
