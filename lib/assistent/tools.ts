/**
 * De tools van de assistent: per databron van PSV Tools een paar functies die
 * het model kan aanroepen. Elke tool leest alleen (er wordt niets aangemaakt
 * of gewijzigd) en geeft tekst terug die het model kan lezen.
 *
 * De tools gebruiken dezelfde functies als de pagina's, zodat een antwoord
 * over precies de cijfers gaat die een collega op het dashboard ziet.
 *
 * Een bron toevoegen: zet hier een tool bij, met de pagina waar hij bij hoort.
 * De rechten, de chat en de bronvermelding volgen daaruit.
 */

import {
  amsterdamDayBounds,
  buildTaxonomy,
  countsByGroup,
  dayCount,
  hasGroup,
  isValidDayKey,
  shiftDayKey,
  type TaxonomyNode,
} from "../fandesk";
import { aggregateThemes } from "../fandesk-analysis";
import { readRange } from "../fandesk-store";
import { dayKeysInRange, periodSig } from "../fandesk-summarize";
import { getDaySummaries, getPeriodSummary } from "../fandesk-summary-store";
import { getToolBySlug, getToolSections, kennisbankToolContext, kennisbankTools } from "../kennisbank";
import { todayInAmsterdam } from "../ringside/seat-state";
import { readEventSeats, readSeatIndex, readSeatState } from "../ringside/seat-store";
import { readMatchSales } from "../ringside/store";
import { isHerdgangMatch } from "../ticketing-herdgang/events";
import { isHerdgangStand } from "../ticketing-herdgang/herdgang";
import { occupancyByArea, type Occupancy } from "../ticketing-herdgang/occupancy";
import { matchContext, overviewContext } from "../ticketing-stadion/context";
import { loadStadionMatch, loadStadionOverview, MAX_COMPARISONS, pickSalesSeries } from "../ticketing-stadion/load";
import type { AssistentTool } from "./toegang";

const UUID = "^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$";
const DAG = "^\\d{4}-\\d{2}-\\d{2}$";

/** Zoveel dagen FANdesk in één keer: per dag wordt een samenvatting gelezen. */
const MAX_FANDESK_DAGEN = 92;
/** Zoveel eerdere wedstrijden noemt de tool als vergelijkingsmateriaal. */
const MAX_VERGELIJKBAAR = 20;

const nl = new Intl.NumberFormat("nl-NL");
const pct = (deel: number, geheel: number) => (geheel > 0 ? `${Math.round((deel / geheel) * 100)}%` : "–");

function bezettingRegel(o: Occupancy): string {
  return `capaciteit ${nl.format(o.capacity)}, verkocht ${nl.format(o.sold)} (${pct(o.sold, o.capacity)}), gereserveerd ${nl.format(o.reserved)}, in de resale ${nl.format(o.resale)}, vrij ${nl.format(o.free)}`;
}

/* ---------- Ticketing Stadion ---------- */

const stadionOverzicht: AssistentTool = {
  name: "ticketing_stadion_overzicht",
  label: "Ticketing Stadion",
  page: "/dashboard/ticketing-stadion",
  description:
    "Alle komende thuiswedstrijden van PSV in het Philips Stadion: capaciteit, verkocht, gereserveerd, resale en vrij, het verkooptempo en de vergelijking met eerdere wedstrijden. Geeft per wedstrijd ook het wedstrijd-id dat ticketing_stadion_wedstrijd nodig heeft. Gebruik deze tool eerst bij vragen over de ticketverkoop van het eerste elftal.",
  velden: {},
  verplicht: [],
  async run() {
    const overzicht = await loadStadionOverview();
    if (overzicht.matches.length === 0) return "Er staan geen komende thuiswedstrijden in de stoelstatus.";
    const ids = overzicht.matches.map((m) => `${m.name ?? "onbekend"} (${m.eventDate ?? "datum onbekend"}): ${m.eventId}`);
    return `${overviewContext(overzicht)}\n\nWEDSTRIJD-ID'S\n${ids.join("\n")}`;
  },
};

const stadionWedstrijd: AssistentTool = {
  name: "ticketing_stadion_wedstrijd",
  label: "Ticketing Stadion · wedstrijd",
  page: "/dashboard/ticketing-stadion",
  description:
    "Eén komende thuiswedstrijd in het Philips Stadion in detail: bezetting per vak, groepjes vrije stoelen naast elkaar per rij, de verkoop per dag en de vergelijking met eerdere wedstrijden. Geeft ook de id's van eerdere thuiswedstrijden waarmee je kunt vergelijken.",
  velden: {
    wedstrijd_id: { type: "string", description: "Het wedstrijd-id uit ticketing_stadion_overzicht.", pattern: UUID },
    vergelijk_met: {
      type: "string",
      description: `Optioneel: id's van maximaal ${MAX_COMPARISONS} eerdere thuiswedstrijden, gescheiden door komma's, om de verkoop per dag naast deze wedstrijd te leggen.`,
      pattern: `^[0-9a-fA-F-]{36}(\\s*,\\s*[0-9a-fA-F-]{36})*$`,
    },
  },
  verplicht: ["wedstrijd_id"],
  async run({ wedstrijd_id, vergelijk_met }) {
    const [data, sales] = await Promise.all([loadStadionMatch(wedstrijd_id.toLowerCase()), readMatchSales()]);
    if (!data) return "Voor deze wedstrijd is geen stoelstatus gevonden. Hij is gespeeld of het id klopt niet.";
    const ids = (vergelijk_met ?? "")
      .split(",")
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean);
    const eerder = data.comparable
      .slice(0, MAX_VERGELIJKBAAR)
      .map((m) => `${m.name} (${m.season}, ${m.eventDate}), eindstand ${nl.format(m.total)}: ${m.productId}`);
    return [
      matchContext(data, pickSalesSeries(sales, ids)),
      "",
      "EERDERE THUISWEDSTRIJDEN OM MEE TE VERGELIJKEN (naam: id)",
      eerder.join("\n") || "geen",
    ].join("\n");
  },
};

/* ---------- Ticketing Herdgang ---------- */

async function herdgangWedstrijden() {
  const index = await readSeatIndex();
  const vandaag = todayInAmsterdam();
  return Object.values(index)
    .filter((e) => isHerdgangMatch(e.name) && e.eventDate && e.eventDate.slice(0, 10) >= vandaag && e.seats > 0)
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""));
}

const herdgangOverzicht: AssistentTool = {
  name: "ticketing_herdgang_wedstrijden",
  label: "Ticketing Herdgang",
  page: "/dashboard/ticketing-herdgang",
  description:
    "De komende thuiswedstrijden van Jong PSV en PSV Vrouwen op De Herdgang, met het wedstrijd-id dat ticketing_herdgang_bezetting nodig heeft en het aantal uitgegeven tickets.",
  velden: {},
  verplicht: [],
  async run() {
    const wedstrijden = await herdgangWedstrijden();
    if (wedstrijden.length === 0) return "Er staan geen komende wedstrijden op De Herdgang in de stoelstatus.";
    return [
      "KOMENDE WEDSTRIJDEN OP DE HERDGANG (naam, datum, tickets: id)",
      ...wedstrijden.map((e) => `${e.name}, ${e.eventDate}, ${nl.format(e.tickets)} tickets: ${e.eventId}`),
    ].join("\n");
  },
};

const herdgangBezetting: AssistentTool = {
  name: "ticketing_herdgang_bezetting",
  label: "Ticketing Herdgang · bezetting",
  page: "/dashboard/ticketing-herdgang",
  description:
    "De bezetting per vak van één wedstrijd op De Herdgang: capaciteit, verkocht, gereserveerd, resale en vrij.",
  velden: {
    wedstrijd_id: { type: "string", description: "Het wedstrijd-id uit ticketing_herdgang_wedstrijden.", pattern: UUID },
  },
  verplicht: ["wedstrijd_id"],
  async run({ wedstrijd_id }) {
    const [event, state] = await Promise.all([readEventSeats(wedstrijd_id.toLowerCase()), readSeatState()]);
    if (!event) return "Voor deze wedstrijd is geen stoelstatus gevonden.";
    const bezetting = occupancyByArea(event, isHerdgangStand);
    const regels = [
      `WEDSTRIJD: ${event.name ?? "onbekend"}, ${event.eventDate ?? "datum onbekend"}`,
      `Totaal (tribunevakken): ${bezettingRegel(bezetting.total)}`,
    ];
    if (bezetting.otherTotal.sold + bezetting.otherTotal.reserved > 0) {
      regels.push(
        `Niet meegeteld (parkeren en vakken buiten de plattegrond): ${nl.format(bezetting.otherTotal.sold)} verkocht, ${nl.format(bezetting.otherTotal.reserved)} gereserveerd`
      );
    }
    regels.push("", "PER VAK: capaciteit | verkocht | gereserveerd | resale | vrij | bezetting");
    for (const vak of bezetting.areas) {
      regels.push(
        `${vak.area}${vak.standing ? " (staanvak)" : ""} | ${vak.capacity} | ${vak.sold} | ${vak.reserved} | ${vak.resale} | ${vak.free} | ${pct(vak.sold, vak.capacity)}`
      );
    }
    regels.push("", `Stand stoelstatus: ${state.caughtUpAt ?? "onbekend"}.`);
    if (!state.capacityComplete || !state.reservationComplete) {
      regels.push("Let op: capaciteit en reserveringen worden nog aangevuld; cijfers kunnen afwijken.");
    }
    return regels.join("\n");
  },
};

/* ---------- Kennisbank ---------- */

const kennisbankOnderwerpen: AssistentTool = {
  name: "kennisbank_onderwerpen",
  label: "Kennisbank",
  page: "/dashboard/kennisbank",
  description:
    "De inhoudsopgave van de kennisbank van PSV Marketing: per pagina de slug, een korte omschrijving en de onderdelen. De kennisbank beschrijft hoe PSV werkt met tools als Maileon, TwoCircles, Playable en Typeform, en afspraken zoals het delen van persoonsgegevens. Gebruik deze tool eerst bij vragen over een werkwijze of proces.",
  velden: {},
  verplicht: [],
  async run() {
    return kennisbankTools
      .map((tool) => {
        const onderdelen = getToolSections(tool).map((s) => s.label).join(", ");
        return `${tool.slug}: ${tool.name} (${tool.category})${tool.comingSoon ? ", nog geen documentatie" : ""}. ${tool.description}${onderdelen ? ` Onderdelen: ${onderdelen}.` : ""}`;
      })
      .join("\n");
  },
};

const kennisbankPagina: AssistentTool = {
  name: "kennisbank_pagina",
  label: "Kennisbank · pagina",
  page: "/dashboard/kennisbank",
  description:
    "De volledige tekst van één pagina uit de kennisbank: toegang, mogelijkheden, stappen, checklists, tabellen en tips.",
  velden: {
    slug: { type: "string", description: "De slug van de pagina uit kennisbank_onderwerpen, bijvoorbeeld maileon.", pattern: "^[a-z0-9-]+$" },
  },
  verplicht: ["slug"],
  async run({ slug }) {
    const tool = getToolBySlug(slug);
    if (!tool) return `Er is geen pagina met de slug "${slug}". Vraag de inhoudsopgave op met kennisbank_onderwerpen.`;
    return `${kennisbankToolContext(tool)}\n\nLink: /dashboard/kennisbank/${tool.slug}`;
  },
};

/* ---------- FANdesk ---------- */

function taxonomieRegels(knopen: TaxonomyNode[], diepte = 0): string[] {
  return knopen.flatMap((knoop) => [
    `${"  ".repeat(diepte)}${knoop.label}: ${nl.format(knoop.count)}`,
    ...taxonomieRegels(knoop.children, diepte + 1),
  ]);
}

const fandeskTickets: AssistentTool = {
  name: "fandesk_tickets",
  label: "FANdesk",
  page: "/dashboard/fandesk",
  description:
    `De supportvragen die bij de FANdesk binnenkwamen in een periode van maximaal ${MAX_FANDESK_DAGEN} dagen: het totaal, de vergelijking met de even lange periode ervoor, de indeling type, subtype en soort, de meest voorkomende thema's en een samenvatting per dag. Geen persoonsgegevens: alleen aantallen en geanonimiseerde onderwerpen. Data is er vanaf 10 september 2026.`,
  velden: {
    van: { type: "string", description: "Eerste dag van de periode, als JJJJ-MM-DD.", pattern: DAG },
    tot: { type: "string", description: "Laatste dag van de periode, als JJJJ-MM-DD.", pattern: DAG },
  },
  verplicht: ["van", "tot"],
  async run({ van, tot }) {
    if (!isValidDayKey(van) || !isValidDayKey(tot) || van > tot) return "Ongeldige periode: geef twee bestaande datums, met 'van' niet na 'tot'.";
    const dagen = dayCount(van, tot);
    if (dagen > MAX_FANDESK_DAGEN) return `De periode is ${dagen} dagen; het maximum is ${MAX_FANDESK_DAGEN}. Vraag een kortere periode op, of meerdere periodes na elkaar.`;

    const vorigeTot = shiftDayKey(van, -1);
    const vorigeVan = shiftDayKey(vorigeTot, -(dagen - 1));
    const nu = amsterdamDayBounds(van, tot);
    const vorige = amsterdamDayBounds(vorigeVan, vorigeTot);
    const [tickets, vorigeTickets, dagSamenvattingen, periode] = await Promise.all([
      readRange(nu.fromInstant, nu.toInstant),
      readRange(vorige.fromInstant, vorige.toInstant),
      getDaySummaries(dayKeysInRange(van, tot)),
      getPeriodSummary(van, tot),
    ]);

    const perGroep = Object.entries(countsByGroup(tickets)).sort((a, b) => b[1] - a[1]);
    const vorigePerGroep = countsByGroup(vorigeTickets);
    const ingedeeld = tickets.filter(hasGroup);
    const perDag = dagSamenvattingen
      .filter((d) => d.stored !== null)
      .map(({ day, stored }) => ({ day, ...stored!.result }))
      .sort((a, b) => a.day.localeCompare(b.day));
    const themas = aggregateThemes(perDag.map((d) => d.themes ?? []));

    const regels = [
      `FANDESK ${van} tot en met ${tot} (${dagen} dagen)`,
      `Totaal: ${nl.format(tickets.length)} tickets. Periode ervoor (${vorigeVan} tot en met ${vorigeTot}): ${nl.format(vorigeTickets.length)}.`,
      `Laatste ticket in deze periode: ${tickets.length ? tickets[tickets.length - 1].at : "geen"}.`,
      "",
      "PER GROEP: nu | periode ervoor",
      ...perGroep.map(([groep, aantal]) => `${groep}: ${nl.format(aantal)} | ${nl.format(vorigePerGroep[groep] ?? 0)}`),
      "",
      `INDELING type > subtype > soort (${nl.format(ingedeeld.length)} ingedeelde tickets, ${nl.format(tickets.length - ingedeeld.length)} zonder indeling)`,
      ...taxonomieRegels(buildTaxonomy(ingedeeld)),
    ];
    if (themas.length > 0) {
      regels.push("", "THEMA'S OVER DE PERIODE (opgeteld uit de dagsamenvattingen)");
      for (const thema of themas) regels.push(`${thema.label}: ${nl.format(thema.count)}${thema.example ? ` (bijvoorbeeld: ${thema.example})` : ""}`);
    }
    // De tekst over de hele periode wordt op verzoek gemaakt op het dashboard;
    // alleen meegeven als hij nog bij de data van nu past.
    const handtekening = periodSig(
      perDag.map((d) => ({ day: d.day, total: (d.themes ?? []).reduce((som, t) => som + (Number(t.count) || 0), 0) }))
    );
    if (periode && periode.sig === handtekening) regels.push("", "SAMENVATTING VAN DE PERIODE", periode.result.summary);
    if (perDag.length > 0) {
      regels.push("", "SAMENVATTING PER DAG");
      for (const dag of perDag) regels.push(`${dag.day}: ${dag.summary}`);
    }
    return regels.join("\n");
  },
};

export const ASSISTENT_TOOLS: AssistentTool[] = [
  stadionOverzicht,
  stadionWedstrijd,
  herdgangOverzicht,
  herdgangBezetting,
  kennisbankOnderwerpen,
  kennisbankPagina,
  fandeskTickets,
];
