# Ticketing Stadion

De ticketverkoop van de thuiswedstrijden van PSV 1 in het Philips Stadion. Vervangt straks
Ticket Inzichten, dat op de XML-feed van de ticketshop draait. Overige events (tours,
museum, jeugd) vallen daarmee weg.

Pagina: `/dashboard/ticketing-stadion`.

## Fase 1: overzicht (nu)

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
| Verkoop per dag (`lib/ringside/store.ts`) | `/api/ringside/ingest`, elk uur | tempo en vergelijking, ook van gespeelde wedstrijden |

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

## Volgende fases

2. **Wedstrijddetail:** plattegrond met bezetting per vak, verkoopcurve met vergelijkingen
   en groepjes vrije stoelen.
3. **Seizoen, AI-analyse en deellinks.** Seizoenkaart tegenover losse verkoop, als de data
   dat toelaat (eerst nagaan met `/api/ringside/probe`).
4. **Vervangen:** menu, doorverwijzing van `/dashboard/ticket-inzichten`, de Ringside-pagina
   erin laten opgaan, de rapportagewizard en de deelpagina's omzetten, en de XML-feed, de
   snapshot-cron en de upload van historie weghalen.

## Open punten

- Telt het bezoekersvak mee in de capaciteit? Nu wel, net als de sfeervakken en de
  rolstoelplaatsen.
