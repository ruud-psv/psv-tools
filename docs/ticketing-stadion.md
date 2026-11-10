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

## Instroom (eerste versie)

Pagina: `/dashboard/ticketing-stadion/instroom`, via de knop boven het overzicht. Het
Philips Stadion met elke stoel als punt, en een tijdlijn die de stoelen laat oplichten op
het moment dat de kaart is gescand.

De scans worden alleen op verzoek opgehaald. Op de pagina kies je een gespeelde
thuiswedstrijd van PSV 1 uit seizoen 26/27 (`playedHomeMatches()` en `INSTROOM_SEASON` in
`lib/instroom/match.ts`, uit de productenlijst van de verkoop-ingest) en klik je op "Lees
scans in". Er is plaats voor één wedstrijd tegelijk: een andere kiezen vervangt de vorige
en begint het inlezen opnieuw.

- **Scherm:** een canvas (`components/stadion-instroom-player.tsx`). Rood is gescand, wit
  net binnen, grijs een kaart die niet is gescand, donkergrijs geen kaart. Onderin de klok
  in Nederlandse tijd, de tijd tot de aftrap, het aantal binnen, de snelheid (30× tot
  600×) en de tijdlijn met het aantal scans per stukje tijd. Volledig scherm, zoomen
  (knoppen, of het muiswiel in volledig scherm of met Ctrl/Cmd), slepen, vaknamen, en
  spatie voor afspelen en pauze.
- **Tijdstip:** `scan_date` uit `/v1/attendance`, op de seconde, in UTC. Per plaats telt de
  vroegste geslaagde scan naar binnen (`Entry` of `Re-Entry`). `first_scan` is daarvoor
  niet bruikbaar, zie [ringside-api.md](ringside-api.md).
- **Stoel:** staat niet op de scan zelf. Hij komt van het ticket in `/v1/sales`, via
  `primary_ticket_id`. De code probeert ook `product_item_id`, `sales_item_id` en
  `scanned_item_id`, en gebruikt de plek op de scan als die er wel staat. Welke koppeling
  werkte, staat in `joins` in het antwoord van de API en als tekst onder het stadion.
  **Dat is nog niet met echte data gecontroleerd:** kijk na de eerste keer inlezen of
  bijna alle gescande tickets een plaats kregen.
- **Plek op het scherm:** Ringside kent alleen vak, rij en stoelnummer. De vakken liggen
  zoals op de plattegrond; binnen een vak staan rij en stoelnummer als raster in de vorm
  van het vak (`lib/instroom/geometry.ts`): rij 1 aan het veld, het hoogste stoelnummer
  links als je naar het veld kijkt, in de hoeken met de bocht mee. Een staanvak heeft
  geen plaatsen; daar vult elke scan een willekeurige plek.
- **Stoelenkaart:** de stoelstatus bewaart alleen komende wedstrijden. De stoelen komen
  daarom uit de stoelenkaart van de eerstvolgende thuiswedstrijd, aangevuld met de
  plaatsen waar voor deze wedstrijd een kaart was.
- **Tijdlijn:** van de eerste tot de laatste scan, maar niet verder dan zes uur voor en
  vier uur na de aftrap. Scans daarbuiten vallen op het begin of het eind.
- **Ingang:** nog niet. Ringside geeft op de scan alleen de naam van de scanner; welke
  scanner bij welke ingang hoort, moet van Ticketing komen.

### Inlezen

Ringside kan niet op wedstrijd filteren en de stoelstatus is na de wedstrijd weg. De route
`/api/ringside/instroom` leest daarom `/v1/sales` en `/v1/attendance` één keer helemaal
door en bewaart alleen de rijen van deze wedstrijd (`lib/instroom/ingest.ts`). Dat duurt
een paar uur. Je start het met "Lees scans in" op de pagina; een run start zelf de
volgende, tot alles binnen is. Er is geen cron: het is eenmalig werk. Tijdens het inlezen
toont de pagina wat er al is.

- `?productId=<id>` kiest de wedstrijd (alleen een uit de keuzelijst), `?restart=1` begint
  opnieuw, `?chain=0`
  doet één run en `?force=1` negeert het slot.
- **Opslag:** `ringside/instroom/state.json` (cursors, voortgang, slot) en
  `ringside/instroom/<product-id>.json.gz` in Vercel Blob.
- **Persoonsgegevens:** er worden geen namen, relatienummers of barcodes bewaard; ids van
  tickets en scans alleen gehasht. Stoel plus scantijd is bij een seizoenkaarthouder wel
  tot een persoon te herleiden. Er is daarom geen deellink, en er is nog geen
  bewaartermijn afgesproken.

"Bekijk een voorbeeld" toont hetzelfde scherm met nagebootste scans
(`lib/instroom/demo.ts`): een raster van stoelen en verzonnen aankomsttijden, voor zolang
de echte wedstrijd nog niet is ingelezen. Het scherm zet er "voorbeeld" bij.

API: `GET /api/ticketing-stadion/instroom` (`?status=1` voor alleen de voortgang,
`?demo=1` voor het voorbeeld). Code: `lib/instroom/` (getest) en
`components/stadion-instroom*.tsx`.

## Later (fase 3)

Seizoensoverzicht en seizoenkaart tegenover losse verkoop (eerst nagaan met
`/api/ringside/probe` of de data dat toelaat).

## Open punten

- Telt het bezoekersvak mee in de capaciteit? Nu wel, net als de sfeervakken en de
  rolstoelplaatsen.
