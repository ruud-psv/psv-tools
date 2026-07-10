/**
 * Deelbare rapportpagina's zijn zonder login bekijkbaar. De data-endpoints
 * (analytics, fanstore-analytics, share/insights) accepteren daarom een
 * base64url-gecodeerd token in plaats van een sessiecookie. Dit is de enige
 * plek waar dat tokenformaat wordt gevalideerd — houd het hier centraal zodat
 * een toekomstige verscherping (bv. HMAC-signering) op één plek gebeurt.
 */
export function isValidShareToken(token: string): boolean {
  try {
    const parsed = JSON.parse(Buffer.from(token, "base64url").toString());
    return parsed !== null && typeof parsed === "object";
  } catch {
    return false;
  }
}
