import { briefNaarMail, type BriefUitkomst } from "./brief";
import { AsanaFout, vanTestproject, type AsanaApi, type AsanaTaak } from "./client";

/** Vandaag in Nederland, als JJJJ-MM-DD. */
export function vandaag(): string {
  return new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Amsterdam" });
}

/**
 * Haalt een taak op, controleert dat hij in het testproject staat, en zet de
 * content brief om. Afbeeldingen als bijlage worden gemeld: die gaan nog niet
 * automatisch mee in de mail.
 */
export async function taakMetBrief(api: AsanaApi, gid: string): Promise<{ taak: AsanaTaak; uitkomst: BriefUitkomst }> {
  const taak = await api.taak(gid);
  if (!vanTestproject(taak)) {
    throw new AsanaFout("Deze taak staat niet in het Asana-testproject. De koppeling werkt nu alleen daar.", 403);
  }
  const uitkomst = briefNaarMail(taak, { test: true, vandaag: vandaag() });

  const beelden = (await api.bijlagen(gid).catch(() => [])).filter((b) => b.isAfbeelding);
  if (beelden.length) {
    uitkomst.punten.push({
      soort: "let-op",
      tekst: `Afbeelding als bijlage: ${beelden.map((b) => b.naam).join(", ")}. Die gaat nog niet automatisch mee; zet hem in de Mail Builder of in Maileon.`,
    });
  } else if (!uitkomst.velden.header) {
    uitkomst.punten.push({ soort: "let-op", tekst: "Geen header gevonden: geen afbeelding als bijlage en geen link in de brief." });
  }
  return { taak, uitkomst };
}
