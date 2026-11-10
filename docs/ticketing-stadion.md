# Ticketing Stadion

De ticketverkoop van de thuiswedstrijden van PSV 1 in het Philips Stadion. Vervangt Ticket
Inzichten, dat op de XML-feed van de ticketshop draaide, en de Ringside-pagina. Overige
events (tours, museum, jeugd) zijn daarmee weggevallen.

Pagina: `/dashboard/ticketing-stadion`.

## Fase 1: overzicht

Een tabel van de komende thuiswedstrijden, de eerstvolgende bovenaan. Per wedstrijd verkocht, vrij, bezetting, verkocht in de laatste 7 dagen en het verschil met eerder; klik op een rij voor de details:

- **Bezetting:** verkocht gedeeld door de capaciteit, met vrij, gereserveerd en in de resale.
  Dezelfde definities als [Ticketing Herdgang](ticketing-herdgang.md)
  (`lib/ticketing-herdgang/occupancy.ts`). Alleen de vakken op de plattegrond van het
  Philips Stadion tellen mee (`lib/aangrenzende-stoelen/stadium.ts`); parkeren niet.
- **Tempo:** verkocht vandaag en in de laatste 7 dagen.
- **Vergelijking:** op hetzelfde aantal dagen voor de aftrap tegen dezelfde tegenstander de
  laatste keer thuis, en tegen het gemiddelde van de thuiswedstrijden van vorig seizoen.
  De tegenstander komt uit de naam (`opponentOf()`: `PSV - AFC Ajax` en `PSV - Ajax` zijn
  dezelfde).
- **Meeste vrije plaatsen:** de drie vakken met de meeste vrije plaatsen.

Bovenaan: de bezetting van de volgende wedstrijd, verkocht in de laatste 7 dagen, vrije
plaatsen en het aantal (bijna) uitverkochte wedstrijden (95% of meer).

Welke wedstrijden: `isPsvHomeMatch()` uit `lib/aangrenzende-stoelen/events.ts`, dus de naam
begint met `PSV -` en bevat geen Jong PSV of Vrouwen.

## Bronnen

Er gaat bij het openen van de pagina geen verzoek naar Ringside. De pagina leest wat twee
crons al klaarzetten:

| Bron | Cron | Levert |
|---|---|---|
| Stoelstatus (`lib/ringside/seat-*.ts`) | `/api/ringside/stoelen`, elk kwartier | bezetting per vak |
| Verkoop per dag (`lib/ringside/store.ts`) | `/api/ringside/ingest`, elk uur | tempo en vergelijking, ook van gespeelde wedstrijden; zie [ticketing-verloop.md](ticketing-verloop.md) |

De cron van de stoelstatus heeft alle komende wedstrijden al in het geheugen. Na elke run
schrijft hij daarom een kleine samenvatting weg: `ticketing-stadion/summary.json` in Vercel
Blob, met per thuiswedstrijd de bezetting per vak (`refreshStadionSummary()` in
`lib/ticketing-stadion/store.ts`). Een fout daarbij breekt de cron niet af. Staat het
bestand er nog niet, dan rekent de API het eenmalig zelf uit.

Het tempo en de vergelijking komen allebei uit de verkoop per dag, zodat appels met appels
vergeleken worden. Die telt alleen afgenomen tickets, dus geen reserveringen. Daardoor kan
"verkocht" in de vergelijking iets afwijken van "verkocht" bij de bezetting.

Code: `lib/ticketing-stadion/summary.ts` (rekenwerk, getest in `summary.test.ts`),
`lib/ticketing-stadion/store.ts`, `app/api/ticketing-stadion/route.ts` en
`components/ticketing-stadion.tsx`.

## Fase 2: wedstrijdpagina

Pagina: `/dashboard/ticketing-stadion/<eventId>`, via "Meer info" in de
opengeklapte rij van het overzicht.

- **Cijfers:** bezetting, vrij, gereserveerd, resale, verkocht in de laatste 7 dagen,
  vrije stoelen naast elkaar en de vergelijking met eerder, zoals in het overzicht.
- **Plattegrond:** het Philips Stadion met per vak de bezetting, in dezelfde vier
  kleurklassen als De Herdgang (`components/stadium-occupancy-map.tsx`). Wijs een vak aan
  voor de cijfers en de stoelen, net als bij Aangrenzende stoelen
  (`components/area-seat-view.tsx`). Hier tellen alle vakken mee, ook de sfeervakken en
  rolstoelvakken die Aangrenzende stoelen uitsluit. Onder "Als tabel" staan de cijfers per
  vak.
- **Groepjes vrije stoelen:** vrije stoelen (of alleen in de resale) met opeenvolgende
  nummers in dezelfde rij, voor het hele stadion en per vak (`countFreeGroups()`).
- **Aanbod:** wat er nu nog te koop is, als gestapeld staafdiagram
  (`components/stadion-supply-chart.tsx`): vrije plaatsen in de vrije verkoop en kaarten
  die houders in de resale hebben aangeboden. Bovenaan het totaal met de verdeling,
  daaronder per vak (de dertig vakken met het meeste aanbod; de rest staat in de tabel).
  Het is de stand van nu; het verloop over de tijd volgt uit de meting per uur (fase 2 in
  [ticketing-verloop.md](ticketing-verloop.md)).
- **Verkoop per dag:** zonder seizoenkaarten en vrijkaarten (`readMatchSales()` in
  `lib/ringside/store.ts`), dus alleen losse verkoop en resale. Dat geldt ook
  voor het tempo, de vergelijking met eerder, de lijst met gespeelde wedstrijden en de
  chat. De grafiek van de Ringside-pagina (`components/ticket-sales-chart.tsx`),
  afgezet tegen het aantal dagen tot de aftrap. Standaard staat dezelfde tegenstander de
  vorige keer ernaast; er kunnen tot drie eerdere thuiswedstrijden naast. "Tempo" zet de
  lijnen om naar het aandeel van de eigen eindstand.

API: `GET /api/ticketing-stadion/<eventId>` leest één stoelenkaart en de verkoop per dag;
`GET /api/ticketing-stadion/verkoop?ids=…` geeft de verkoop per dag van de gekozen
eerdere wedstrijden. Geen van beide doet een verzoek naar Ringside.

## Fase 4: Ticket Inzichten vervangen

- **Menu:** Ticket Inzichten en de beta-pagina Ringside zijn weg; Ticketing Stadion staat
  op hun plek, zonder Beta-label. `/dashboard/ticket-inzichten` (ook `/upload`) en
  `/dashboard/ticket-inzichten-new` verwijzen door (`next.config.ts`).
- **Toegang:** wie bij "specifieke pagina's" Ticket Inzichten of Ringside had
  aangevinkt, mag Ticketing Stadion zien (`REPLACED_PAGES` in `lib/access.ts`).
- **Gespeelde wedstrijden vergelijken:** de zoekfunctie van de Ringside-pagina staat onder
  het overzicht (`components/ringside-match-sales.tsx`, alleen thuiswedstrijden van PSV 1).
- **`/api/ticket-feed`** leest niet meer de XML-feed maar de samenvatting van Ticketing
  Stadion, in dezelfde vorm (`lib/ticketing-stadion/feed.ts`). Daardoor werken de
  rapportage-generator en de deellinks door, maar alleen nog met thuiswedstrijden van
  PSV 1. In de rapportage-generator is "Wedstrijden" de enige categorie.
- **`/api/ticket-history`** geeft voor een wedstrijd uit Ringside het verloop uit de
  verkoop per dag; voor oude events uit de XML-feed nog de opgeslagen metingen, zodat
  bestaande deellinks blijven werken.
- **Weg:** het dashboard en de uploadpagina van Ticket Inzichten, de AI-routes
  `/api/ticket-insights`, en de cron `/api/ticket-history/snapshot` die de XML-feed elke
  twee uur uitlas. De eerder geüploade historie (`/api/ticket-history/historical`) blijft
  staan voor de vergelijking op bestaande deellinks, maar is niet meer aan te vullen.

## Deellink

"Deel link" op de wedstrijdpagina maakt een link naar `/share/stadion?token=…`. Wie die
heeft, ziet de wedstrijdpagina zonder in te loggen: dezelfde cijfers, plattegrond en
grafiek, zonder de chat, de deelknop en links naar interne pagina's.

- **Token:** alleen het wedstrijd-id, ondertekend met een sleutel afgeleid van
  `SESSION_SECRET` (`lib/ticketing-stadion/share.ts`). Een verzonnen of aangepast token
  geeft "Deze link is ongeldig". Wordt `SESSION_SECRET` vervangen, dan werken alle
  deellinks niet meer.
- **Geen vervaldatum:** na de wedstrijd verdwijnt hij uit de stoelstatus en meldt de link
  dat hij niet meer beschikbaar is.
- **Routes:** `POST /api/ticketing-stadion/<id>/deel` (met login) maakt de link;
  `GET /api/share/stadion` en `/api/share/stadion/verkoop` (zonder login, met token) geven de
  data. Ze gebruiken dezelfde `loadStadionMatch()` als de pagina zelf.

## Vraag het de data (chat)

Op het overzicht en de wedstrijdpagina staat een chat: vragen over wat op de pagina staat,
zoals "hoeveel tweetjes zijn er nog?" of "loopt de verkoop voor op de vorige keer?". Niet
op de deellink.

- **Data:** de browser stuurt alleen de vragen en welke pagina hij toont (wedstrijd en de
  wedstrijden in de grafiek). De server rekent de data opnieuw uit met dezelfde functies
  als de pagina en zet die als tekst in de prompt (`lib/ticketing-stadion/context.ts`).
  Voor een wedstrijd zijn dat de cijfers, per vak de bezetting en elk groepje vrije stoelen
  met rij en stoelnummers, en de verkoop per dag. Bij een vol stadion is dat zo'n 6.500
  tokens.
- **Model:** `claude-opus-5-5` op effort `low`, met de refusal-fallback van de API
  (`fallbacks: "default"`). De data staat in een gecachet deel van de systeemprompt, zodat
  vervolgvragen goedkoper zijn.
- **Sleutel:** `ANTHROPIC_API_KEY` in Vercel, dezelfde als de andere AI-functies.
- Route: `POST /api/ticketing-stadion/vraag` (met login).

## Later (fase 3)

Seizoensoverzicht en seizoenkaart tegenover losse verkoop (eerst nagaan met
`/api/ringside/probe` of de data dat toelaat).

## Open punten

- Telt het bezoekersvak mee in de capaciteit? Nu wel, net als de sfeervakken en de
  rolstoelplaatsen.
