/**
 * Zet de bestanden van de PSV Campaign Kit (uit de skill playable-page-builder)
 * als tekst in `lib/playable-loader/kit.ts`, zodat de Playable loader ze in
 * elke bundel kan meenemen.
 *
 *   node scripts/kit-bijwerken.mjs <map-van-de-skill>
 *
 * De map is die met `SKILL.md` en `assets/`. Draai dit opnieuw als de kit een
 * nieuwe versie heeft, en publiceer daarna de pagina's opnieuw.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const dir = process.argv[2];
if (!dir) {
  console.error("Gebruik: node scripts/kit-bijwerken.mjs <map-van-de-skill>");
  process.exit(1);
}

const lees = (naam) => readFileSync(join(dir, "assets", naam), "utf8");
const css = lees("psv-framework.css");
const js = lees("psv-framework.js");
const starter = lees("psv-page-starter.html");
const versie = /PSV CAMPAIGN KIT\s*[—-]\s*(v[\d.]+)/.exec(css)?.[1] ?? "onbekend";

const uit = `/**
 * De PSV Campaign Kit, ${versie}. Gegenereerd met \`scripts/kit-bijwerken.mjs\`
 * uit de skill playable-page-builder; niet met de hand aanpassen.
 */

export const KIT_VERSIE = ${JSON.stringify(versie)};

/** \`assets/psv-framework.css\`: hoort ongewijzigd in elke pagina. */
export const FRAMEWORK_CSS = ${JSON.stringify(css)};

/** \`assets/psv-framework.js\`: hoort ongewijzigd in elke pagina. */
export const FRAMEWORK_JS = ${JSON.stringify(js)};

/** \`assets/psv-page-starter.html\`: het skelet met alle sectietypes. */
export const STARTER_HTML = ${JSON.stringify(starter)};
`;

writeFileSync(new URL("../lib/playable-loader/kit.ts", import.meta.url), uit);
console.log(`lib/playable-loader/kit.ts bijgewerkt (${versie}).`);

/* De regels en de naslag voor de assistent. Uit SKILL.md alleen vanaf
   "Uitgangspunten": de werkwijze daarvoor gaat over drie blokken leveren,
   en dat doet de assistent niet; die geeft wijzigingen. */
const skill = readFileSync(join(dir, "SKILL.md"), "utf8");
const vanaf = skill.indexOf("## Uitgangspunten");
const regels = vanaf >= 0 ? skill.slice(vanaf) : skill.replace(/^---[\s\S]*?---\s*/, "");
const referentie = (naam) => readFileSync(join(dir, "references", naam), "utf8");

const skillUit = `/**
 * Regels en naslag van de skill playable-page-builder (${versie}), voor de
 * assistent van de Playable loader. Gegenereerd met
 * \`scripts/kit-bijwerken.mjs\`; niet met de hand aanpassen. Alleen op de server.
 */

export const KIT_REGELS = ${JSON.stringify(regels)};

export const KIT_COMPONENTEN = ${JSON.stringify(referentie("componenten.md"))};

export const KIT_VALKUILEN = ${JSON.stringify(referentie("playable.md"))};

export const KIT_ACHTERGRONDEN = ${JSON.stringify(referentie("achtergronden.md"))};
`;
writeFileSync(new URL("../lib/playable-loader/skill.ts", import.meta.url), skillUit);
console.log("lib/playable-loader/skill.ts bijgewerkt.");
