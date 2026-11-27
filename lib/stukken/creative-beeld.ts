import { fetchMetaCreativeImageUrls, isMetaCdnUrl } from "@/lib/paid-ads/connectors/meta";
import { MAX_KOPIE_BYTES, controleerAfbeelding, uploadAfbeelding } from "./afbeelding";
import { verkleinVoorStuk } from "./verkleinen";

/**
 * Kopieert het beeld van een Meta-advertentie naar de map voor stukken op
 * Bunny, zodat het in een rapport of deck kan (een stuk neemt alleen beelden
 * van onze eigen CDN). Eerst de volledige afbeelding, dan de thumbnail (bij
 * een video het stilstaande beeld). Geeft het CDN-adres terug.
 */
export async function creativeBeeldVoorStuk(adId: string): Promise<string> {
  const urls = (await fetchMetaCreativeImageUrls(adId)).filter(isMetaCdnUrl).reverse();
  let laatsteFout: unknown = new Error("Meta gaf geen afbeelding.");
  for (const url of urls) {
    try {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok || !(res.headers.get("content-type") ?? "").startsWith("image/")) {
        throw new Error(`Meta-afbeelding niet geladen (${res.status}).`);
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      controleerAfbeelding(bytes, MAX_KOPIE_BYTES);
      const klein = await verkleinVoorStuk(bytes);
      return await uploadAfbeelding(klein.bytes, klein.soort);
    } catch (error) {
      laatsteFout = error;
    }
  }
  throw laatsteFout;
}
