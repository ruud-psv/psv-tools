import type { SessionProfile } from "@/lib/auth";

/**
 * De begroeting bovenaan het dashboard. De server draait op Vercel in UTC, dus
 * het tijdstip wordt expliciet in de tijdzone van het stadion bepaald —
 * anders krijgt iemand die om 21:00 inlogt "Goedemorgen" te zien.
 */
const TIME_ZONE = "Europe/Amsterdam";

export type Greeting =
  | "Goedemorgen"
  | "Goedemiddag"
  | "Goedenavond"
  | "Goedenacht";

/** Het uur (0-23) in Eindhoven op het gegeven moment. */
export function hourInTimeZone(date: Date = new Date()): number {
  const hour = new Intl.DateTimeFormat("nl-NL", {
    timeZone: TIME_ZONE,
    hour: "numeric",
    hour12: false,
  }).format(date);
  // Sommige runtimes formatteren middernacht als "24".
  return Number(hour) % 24;
}

export function greetingForHour(hour: number): Greeting {
  if (hour >= 6 && hour < 12) return "Goedemorgen";
  if (hour >= 12 && hour < 18) return "Goedemiddag";
  if (hour >= 18) return "Goedenavond";
  return "Goedenacht";
}

export function greetingFor(date: Date = new Date()): Greeting {
  return greetingForHour(hourInTimeZone(date));
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

/**
 * De voornaam voor in de begroeting. Bij voorkeur uit de naam in de SAML-sessie
 * ("Ruud Dankers" → "Ruud", "Dankers, Ruud" → "Ruud"). Staat die er niet in —
 * sessies van voor de naam-claim, of een Azure-app zonder die claim — dan een
 * gok op basis van het e-mailadres, waarbij initialen ("r.dankers") worden
 * overgeslagen. Levert een lege string op als er niets bruikbaars is; de UI
 * groet dan zonder naam.
 */
export function firstNameFrom(session: SessionProfile | null): string {
  if (!session) return "";

  const name = session.name?.trim();
  if (name) {
    // "Dankers, Ruud" — achternaam eerst, voornaam na de komma.
    const [last, first] = name.split(",").map((p) => p.trim());
    if (first) return first.split(/\s+/)[0];
    const firstWord = last.split(/\s+/)[0];
    if (firstWord) return firstWord;
  }

  const local = session.email.split("@")[0] ?? "";
  const segment = local.split(/[._-]+/).find((part) => part.length > 1);
  return segment ? capitalize(segment.toLowerCase()) : "";
}
