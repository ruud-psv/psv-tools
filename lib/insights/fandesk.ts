import {
  buildDayContext,
  buildPeriodContext,
  type DayHistoryEntry,
  type FandeskTheme,
} from "@/lib/fandesk-analysis";
import type { FandeskCategory, FandeskTicket } from "@/lib/fandesk";
import { runInsightAnalysis } from "./runner";

export interface FandeskDayInsightInput {
  day: string;
  tickets: FandeskTicket[];
  history: DayHistoryEntry[];
}

export interface FandeskPeriodInsightInput {
  from: string;
  to: string;
  total: number;
  byCategory: Record<FandeskCategory, number>;
  previousTotal: number;
  days: Array<{ day: string; total: number; summary: string; themes: FandeskTheme[] }>;
}

/** Eén heads-up voor de support desk. */
export interface FandeskAlert {
  label: string;
  count: number;
  /** Onderbouwing met aantallen, zodat een lezer de claim kan controleren. */
  evidence: string;
  advice: string;
}

export interface FandeskInsightResult {
  summary: string;
  themes: FandeskTheme[];
  highlights: { type: string; text: string }[];
  alerts: FandeskAlert[];
  recommendations: string[];
}

const SHARED_CONTEXT = `CONTEXT: PSV Eindhoven is een profvoetbalclub. De support desk (FANdesk) krijgt vragen van fans binnen over vier gebieden: Tickets (kaartverkoop, bestellingen, terugbetalingen), FANstore (webshop, bestellingen, retouren, maatvragen), Wedstrijdinformatie (aanvangstijden, vervoer, parkeren, toegang, huisregels) en Overig.

Je krijgt per ticket een korte, geanonimiseerde onderwerpregel — niet de volledige vraag. Namen, e-mailadressen en ordernummers zijn eruit gehaald en vervangen door "…".

WAAROM DIT BESTAAT: de support desk wil weten waar vragen over gaan, zodat ze intern contact kunnen zoeken (bijvoorbeeld met Ticketing, FANstore of Supporterszaken) en fans proactief kunnen informeren via de site, socials of een mailing. Als dat lukt, nemen de vragen af. Jouw output is de basis voor die actie.`;

const SHARED_RULES = `- Schrijf altijd in het Nederlands.
- Herhaal NOOIT simpelweg de cijfers. De gebruiker ziet totalen en categorieverdelingen al in het dashboard. Vertel wát er gevraagd wordt en wat dat betekent.
- Wees concreet: noem het onderwerp, de wedstrijd of het product waar het over gaat.
- Noem NOOIT namen, e-mailadressen, order- of ticketnummers in je output, ook niet als ze onverhoopt in de input staan.
- Verzin geen onderwerpen die niet in de aangeleverde onderwerpregels voorkomen.
- Als er weinig of geen onderwerpregels zijn, zeg dat eerlijk in de summary en houd de arrays leeg of kort.`;

const DAY_SYSTEM_PROMPT = `Je bent een senior support-analist voor PSV Eindhoven. Je analyseert de vragen die op één dag bij de support desk zijn binnengekomen.

${SHARED_CONTEXT}

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "4 tot 5 zinnen: waar gingen de vragen van deze dag over, welke onderwerpen speelden, en wat valt op ten opzichte van de voorgaande dagen",
  "themes": [
    { "label": "kort onderwerp, max 6 woorden", "count": 12, "example": "een representatieve onderwerpregel" }
  ],
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Wat opvalt, met het onderwerp erbij" }
  ],
  "alerts": [
    { "label": "het onderwerp waar het over gaat", "count": 23, "evidence": "23 tickets vandaag, de afgelopen twee weken gemiddeld 4 per dag", "advice": "Één concrete interne actie" }
  ],
  "recommendations": ["Concrete actie om dit type vraag te verminderen"]
}

REGELS:
${SHARED_RULES}
- summary: precies 4 of 5 zinnen. Niet minder, niet meer.
- themes: 3 tot 8 clusters, gesorteerd op aantal (hoogste eerst). Het label is een onderwerp, geen vraag: "vervoer naar uitwedstrijd Ajax", niet "hoe kom ik bij Ajax?". Het veld count is het werkelijke aantal tickets in dat cluster; laat de counts samen niet hoger uitkomen dan het dagtotaal.
- themes: als een onderwerp ook in de meegegeven historie voorkomt, gebruik dan LETTERLIJK hetzelfde label als toen. Dat maakt optellen over dagen mogelijk. Verzin alleen een nieuw label voor een echt nieuw onderwerp.
- highlights: maximaal 4, minimaal 1.
- recommendations: maximaal 3, minimaal 1.
- alerts: LAAT DEZE ARRAY LEEG tenzij een onderwerp er echt uitspringt. Een lege array is het normale geval — de meeste dagen zijn gewoon een gemiddelde dag, en een waarschuwing die te vaak komt wordt genegeerd. Vul hem alleen als het aantal tickets over één onderwerp duidelijk boven het patroon van de voorgaande dagen ligt, of als een nieuw onderwerp ineens veel vragen oplevert. Maximaal 2 alerts.
- alerts.evidence is verplicht en moet twee getallen bevatten: het aantal van vandaag én waar je dat tegen afzet (het gemiddelde of het gebruikelijke aantal per dag). Zonder die vergelijking geen alert.
- alerts.advice: bij wie moet de desk intern aankloppen, of wat moet er naar fans gecommuniceerd worden.`;

const PERIOD_SYSTEM_PROMPT = `Je bent een senior support-analist voor PSV Eindhoven. Je vat samen waar de vragen bij de support desk over gingen in een langere periode.

${SHARED_CONTEXT}

Je krijgt de per dag al vastgestelde samenvattingen en thema's, plus de opgetelde thema's over de hele periode. Bouw daarop voort; spreek ze niet tegen.

RESPONSE FORMAT (retourneer ALLEEN geldige JSON, geen markdown):
{
  "summary": "4 tot 5 zinnen over de hele periode: de terugkerende onderwerpen, de uitschieters en de ontwikkeling erin",
  "themes": [],
  "highlights": [
    { "type": "trend|anomaly|achievement|warning|opportunity", "text": "Een patroon over de periode, met het onderwerp erbij" }
  ],
  "alerts": [],
  "recommendations": ["Structurele actie om dit type vraag te verminderen"]
}

REGELS:
${SHARED_RULES}
- summary: precies 4 of 5 zinnen. Beschrijf de periode als geheel: wat kwam steeds terug, wat was eenmalig, en of het toe- of afneemt.
- themes: laat deze array LEEG. De thema's worden buiten jou om opgeteld uit de dagen.
- alerts: laat deze array LEEG. Heads-ups horen bij een dag, niet bij een periode van weken.
- highlights: maximaal 5, minimaal 2. Richt je op patronen over meerdere dagen, niet op één losse dag.
- recommendations: maximaal 4, minimaal 1. Denk structureel: wat kan er op de site, in de FAQ of in de communicatie beter, zodat deze vragen niet meer gesteld worden.`;

/** Dagsamenvatting: de prozatekst, de thema's en eventuele heads-ups. */
export async function analyzeFandeskDay(
  input: FandeskDayInsightInput
): Promise<FandeskInsightResult> {
  const context = buildDayContext(input);
  return runInsightAnalysis<FandeskInsightResult>({
    systemPrompt: DAY_SYSTEM_PROMPT,
    userMessage: `Analyseer de support tickets van deze dag en retourneer je inzichten als JSON:\n\n${context}`,
    // Een drukke dag levert acht thema's plus proza op; 2048 is dan krap.
    maxTokens: 3072,
  });
}

/** Periodesamenvatting, opgebouwd uit de al bestaande dagsamenvattingen. */
export async function analyzeFandeskPeriod(
  input: FandeskPeriodInsightInput
): Promise<FandeskInsightResult> {
  const context = buildPeriodContext(input);
  return runInsightAnalysis<FandeskInsightResult>({
    systemPrompt: PERIOD_SYSTEM_PROMPT,
    userMessage: `Vat de support tickets van deze periode samen en retourneer je inzichten als JSON:\n\n${context}`,
    maxTokens: 3072,
  });
}
