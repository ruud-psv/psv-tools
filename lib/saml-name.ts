/**
 * Haalt de weergavenaam van de ingelogde gebruiker uit een SAML-profiel.
 * Apart van de ACS-route zodat de claim-afhandeling los te testen is.
 */

/**
 * Claims met de volledige naam, de voornaam en de achternaam. node-saml zet
 * attributen onder hun volledige `Name` in het profiel (bij Azure AD de
 * claim-URI), dus we zoeken op URI én op de laatste naam in het pad — zo
 * werkt het ook als de claim onder een kortere naam binnenkomt.
 */
const DISPLAY_NAME_CLAIMS = ["displayname", "name", "cn", "commonname"];
const GIVEN_NAME_CLAIMS = ["givenname", "given_name", "firstname"];
const SURNAME_CLAIMS = ["surname", "sn", "lastname", "familyname", "family_name"];

/** De laatste naam in een claim-pad: ".../claims/givenname" → "givenname". */
export function claimKey(key: string): string {
  return key.split(/[/#]/).pop()?.toLowerCase() ?? "";
}

/**
 * De waarden van de gevraagde claims, in de volgorde van `names` (dus op
 * voorkeur, niet op volgorde in de assertion).
 */
function claimValues(
  profile: Record<string, unknown> | null | undefined,
  names: string[]
): string[] {
  if (!profile) return [];
  const entries = Object.entries(profile).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string" && entry[1].trim() !== ""
  );
  return names
    .map((name) => entries.find(([key]) => claimKey(key) === name)?.[1].trim())
    .filter((value): value is string => !!value);
}

/** "Dankers, Ruud" → "Ruud Dankers"; een naam zonder komma blijft zoals hij is. */
function normalizeFullName(name: string): string {
  const parts = name.split(",");
  if (parts.length !== 2) return name.replace(/\s+/g, " ").trim();
  const [last, first] = parts.map((p) => p.trim());
  return first && last ? `${first} ${last}` : name.trim();
}

/**
 * De volledige naam uit de SAML-assertion: bij voorkeur de displayName-claim,
 * anders voornaam + achternaam, anders wat er wél is. Levert een lege string
 * op als de assertion geen naam bevat; de UI valt dan terug op het
 * e-mailadres.
 */
export function fullNameFromProfile(profile: Record<string, unknown> | null | undefined): string {
  // De "name"-claim bevat bij Azure vaak de UPN (een e-mailadres); die is als
  // weergavenaam waardeloos, dus sla waarden met een @ over.
  const display = claimValues(profile, DISPLAY_NAME_CLAIMS).find((v) => !v.includes("@"));
  if (display) return normalizeFullName(display);

  const given = claimValues(profile, GIVEN_NAME_CLAIMS)[0] ?? "";
  const surname = claimValues(profile, SURNAME_CLAIMS)[0] ?? "";
  if (given && surname) return `${given} ${surname}`;
  return given || surname || "";
}
