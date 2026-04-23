import { createHmac, timingSafeEqual } from "crypto";

const ALG = "sha256";
const SEPARATOR = ".";

function getSecret(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32)
    throw new Error("SESSION_SECRET is niet geconfigureerd of te kort.");
  return Buffer.from(s, "hex");
}

function base64url(buf: Buffer): string {
  return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function sign(payload: string, secret: Buffer): string {
  return base64url(createHmac(ALG, secret).update(payload).digest());
}

export function createSessionToken(email: string, maxAgeSeconds = 28800): string {
  const payload = base64url(
    Buffer.from(JSON.stringify({ email, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds }))
  );
  const sig = sign(payload, getSecret());
  return `${payload}${SEPARATOR}${sig}`;
}

export function verifySessionToken(token: string): string | null {
  try {
    const parts = token.split(SEPARATOR);
    if (parts.length !== 2) return null;
    const [payload, sig] = parts;
    const secret = getSecret();
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(sig);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
    const { email, exp } = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!email || !exp || Math.floor(Date.now() / 1000) > exp) return null;
    return email as string;
  } catch {
    return null;
  }
}

export function authorize(sessionCookie: string | undefined): string | null {
  if (!sessionCookie) return "Geen sessie gevonden. Log opnieuw in.";
  const email = verifySessionToken(sessionCookie);
  if (!email) return "Ongeldige of verlopen sessie. Log opnieuw in.";
  return null;
}
