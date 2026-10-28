import { get, put } from "@vercel/blob";

import {
  normalizeEmail,
  parseAdminEmails,
  resolveAccess,
  type EffectiveAccess,
  type UserAccess,
} from "@/lib/access";

/**
 * De toegangslijst van het gebruikersbeheer staat als één JSON-bestand in
 * Vercel Blob. Er zijn hooguit een paar honderd collega's en alleen admins
 * schrijven, dus één bestand is genoeg en laat zich in één keer lezen.
 *
 * De middleware leest de lijst bij elk request. Daarom een korte cache per
 * serverinstantie: een wijziging is binnen `CACHE_MS` overal actief.
 */
const PATH = "gebruikersbeheer/toegang.json";
const CACHE_MS = 15_000;

let cache: { users: UserAccess[]; at: number } | null = null;

export async function readUsers({ fresh = false } = {}): Promise<UserAccess[]> {
  if (!fresh && cache && Date.now() - cache.at < CACHE_MS) return cache.users;
  try {
    const result = await get(PATH, { access: "private", useCache: false });
    const users: UserAccess[] = result?.stream
      ? ((JSON.parse(await new Response(result.stream).text()) as { users?: UserAccess[] }).users ?? [])
      : [];
    cache = { users, at: Date.now() };
    return users;
  } catch (err) {
    // Opslag even onbereikbaar: liever de laatst bekende lijst dan iedereen
    // terug op het standaardniveau. Zonder eerdere lijst kan het niet anders.
    console.error("[gebruikersbeheer] Toegangslijst lezen mislukt:", err);
    return cache?.users ?? [];
  }
}

export async function writeUsers(users: UserAccess[]): Promise<void> {
  const sorted = [...users].sort((a, b) => a.email.localeCompare(b.email, "nl"));
  await put(PATH, JSON.stringify({ users: sorted }, null, 2), {
    access: "private",
    contentType: "application/json",
    addRandomSuffix: false,
    allowOverwrite: true,
  });
  cache = { users: sorted, at: Date.now() };
}

export function adminEmails(): string[] {
  return parseAdminEmails(process.env.ADMIN_EMAILS);
}

export async function getAccess(email: string): Promise<EffectiveAccess> {
  return resolveAccess(normalizeEmail(email), await readUsers(), adminEmails());
}
