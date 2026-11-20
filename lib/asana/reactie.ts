import { escapeAsana } from "./client";
import type { Punt } from "./brief";

/**
 * De reactie die PSV Tools in Asana zet nadat het concept in Maileon staat.
 * Asana accepteert in `html_text` alleen een paar tags (onder meer strong,
 * code, a, ul, li); een regeleinde blijft een regeleinde.
 */
export function conceptReactie(opties: {
  mailingId: number;
  naam: string;
  nieuw: boolean;
  voorbeeldUrl: string;
  punten: Punt[];
}): string {
  const lijst = (punten: Punt[]) => `<ul>${punten.map((p) => `<li>${escapeAsana(p.tekst)}</li>`).join("")}</ul>`;
  const nodig = opties.punten.filter((p) => p.soort === "nodig");
  const letOp = opties.punten.filter((p) => p.soort === "let-op");
  const url = escapeAsana(opties.voorbeeldUrl);

  const delen = [
    `<strong>🤖 PSV Tools · ${opties.nieuw ? "Concept in Maileon gezet" : "Concept in Maileon bijgewerkt"}</strong>`,
    `Mailing ${opties.mailingId}: <code>${escapeAsana(opties.naam)}</code>`,
    `Voorbeeld (werkt zonder inloggen, blijft dezelfde link): <a href="${url}">${url}</a>`,
  ];
  if (nodig.length) delen.push(`\n<strong>Nog nodig</strong>${lijst(nodig)}`);
  if (letOp.length) delen.push(`${nodig.length ? "" : "\n"}<strong>Let op</strong>${lijst(letOp)}`);
  delen.push("Daarna in Maileon: doelgroep (met de preference-regel), testmail en inplannen. PSV Tools verstuurt niets.");
  return `<body>${delen.join("\n")}</body>`;
}

function puntenHtml(punten: Punt[]): string {
  const lijst = (p: Punt[]) => `<ul>${p.map((x) => `<li>${escapeAsana(x.tekst)}</li>`).join("")}</ul>`;
  const nodig = punten.filter((p) => p.soort === "nodig");
  const letOp = punten.filter((p) => p.soort === "let-op");
  return [nodig.length ? `<strong>Nog nodig</strong>${lijst(nodig)}` : "", letOp.length ? `<strong>Let op</strong>${lijst(letOp)}` : ""]
    .filter(Boolean)
    .join("");
}

/** De brief is nog niet compleet: wat er mist, en dat PSV Tools het opnieuw probeert. */
export function wachtReactie(punten: Punt[]): string {
  return `<body><strong>🤖 PSV Tools · Nog niet klaar voor Maileon</strong>
Er mist nog iets in de content brief. Pas de beschrijving van de taak aan; PSV Tools kijkt elke 5 minuten opnieuw en zet de mail dan als concept in Maileon.
${puntenHtml(punten)}</body>`;
}

/** Maileon weigerde het concept, of PSV Tools kon het niet bewaren. */
export function foutReactie(melding: string): string {
  return `<body><strong>🤖 PSV Tools · Concept niet gezet</strong>
${escapeAsana(melding)}
Pas de brief aan om het opnieuw te proberen, of zet de mail met de hand via de testpagina Maileon-concept.</body>`;
}
