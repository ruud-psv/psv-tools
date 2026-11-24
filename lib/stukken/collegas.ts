import { isValidEmail, normalizeEmail } from "@/lib/access";

/**
 * Een stuk delen met collega's binnen PSV Tools, puur zodat de API, de
 * pagina's en de tests dezelfde regels gebruiken.
 *
 * Anders dan een deellink (een momentopname voor wie de link heeft) is dit
 * een uitnodiging op naam: de collega ziet het stuk in Mijn documenten onder
 * "Gedeeld met mij", altijd in de nieuwste versie, en kan het alleen lezen,
 * presenteren en afdrukken. Bewerken blijft bij de maker.
 */

export const MAX_COLLEGAS = 50;

export interface GedeeldMet {
  email: string;
  /** De naam zoals de collega in PSV Tools bekend is, als die er is. */
  naam?: string;
  gedeeldOp: string;
}

/** Leest het e-mailadres uit een verzoek om te delen; geeft een fout in gewone taal. */
export function leesCollegaInvoer(body: unknown, eigenaar: string): { email: string; naam?: string } | { fout: string } {
  const raw = body && typeof body === "object" ? (body as Record<string, unknown>).email : undefined;
  if (typeof raw !== "string" || !raw.trim()) return { fout: "Kies een collega om mee te delen." };
  const email = normalizeEmail(raw);
  if (!isValidEmail(email)) return { fout: "Dit is geen geldig e-mailadres." };
  if (email === normalizeEmail(eigenaar)) return { fout: "Dit stuk is al van jou." };
  const naamRaw = (body as Record<string, unknown>).naam;
  const naam = typeof naamRaw === "string" && naamRaw.trim() ? naamRaw.trim().slice(0, 120) : undefined;
  return { email, ...(naam && { naam }) };
}

/** Zet een collega erbij; staat hij er al, dan blijft alles zoals het was. */
export function voegCollegaToe(lijst: GedeeldMet[] | undefined, collega: GedeeldMet): GedeeldMet[] {
  const huidig = lijst ?? [];
  if (huidig.some((c) => c.email === collega.email)) return huidig;
  if (huidig.length >= MAX_COLLEGAS) throw new Error(`Je kunt een stuk met hooguit ${MAX_COLLEGAS} collega's delen.`);
  return [...huidig, collega];
}

export function haalCollegaWeg(lijst: GedeeldMet[] | undefined, email: string): GedeeldMet[] {
  const key = normalizeEmail(email);
  return (lijst ?? []).filter((c) => c.email !== key);
}

/** Mag deze collega het stuk lezen? De maker altijd, anderen alleen als het met hen gedeeld is. */
export function magLezen(stuk: { eigenaar: string; gedeeldMet?: GedeeldMet[] }, email: string): boolean {
  const key = normalizeEmail(email);
  return normalizeEmail(stuk.eigenaar) === key || Boolean(stuk.gedeeldMet?.some((c) => c.email === key));
}

export interface Collega {
  email: string;
  naam?: string;
}

/**
 * De collega's om uit te kiezen bij het delen: wie al eens heeft ingelogd en
 * wie in het gebruikersbeheer staat, zonder dubbelen en zonder jezelf. Een
 * naam wint van geen naam. Met `zoek` alleen wie op naam of e-mail past.
 */
export function collegaSuggesties(bronnen: Collega[][], jezelf: string, zoek = "", max = 8): Collega[] {
  const ik = normalizeEmail(jezelf);
  const opEmail = new Map<string, Collega>();
  for (const c of bronnen.flat()) {
    const email = normalizeEmail(c.email);
    if (!isValidEmail(email) || email === ik) continue;
    const bekend = opEmail.get(email);
    if (!bekend || (!bekend.naam && c.naam)) opEmail.set(email, { email, ...(c.naam && { naam: c.naam }) });
  }
  const termen = zoek.toLowerCase().split(/\s+/).filter(Boolean);
  return [...opEmail.values()]
    .filter((c) => termen.every((t) => c.email.includes(t) || Boolean(c.naam?.toLowerCase().includes(t))))
    .sort((a, b) => (a.naam ?? a.email).localeCompare(b.naam ?? b.email, "nl"))
    .slice(0, max);
}
