# Ringside API (SeatGeek) — koppeling en credentials

Ticket Inzichten draait nu op de XML-feed `https://ticketshop.psv.nl/feed/eventsavailability`.
Die feed heeft twee problemen: hij is niet waterdicht, en een event verdwijnt er
zodra het voorbij is — waardoor we de verkoophistorie van een gespeelde
wedstrijd kwijtraken. De Ringside API van SeatGeek is de vervanger.

Dit document beschrijft de authenticatie (Locksmith), welke environment
variables er in Vercel moeten staan, en hoe je controleert of het werkt.

## 1. Authenticatie: Locksmith

Ringside gebruikt geen statische API key. Authenticatie loopt via **Locksmith**,
het machine-to-machine systeem van SeatGeek, met de OAuth 2.0 Client Credentials
Flow ([RFC 6749 §4.4](https://www.rfc-editor.org/rfc/rfc6749#section-4.4)):

1. De server stuurt `client_id`, `client_secret` en `audience` naar de
   token-endpoint van Locksmith.
2. Locksmith geeft een `access_token` terug met een `expires_in` in seconden.
3. Dat token gaat als `Authorization: Bearer …` mee naar Ringside.

SeatGeek vraagt nadrukkelijk om een token zo lang mogelijk te hergebruiken.
`lib/ringside/auth.ts` cachet het daarom in het geheugen tot een minuut voor het
verloopt, en haalt daarna automatisch een nieuw token op. Gelijktijdige requests
delen één tokenaanvraag.

## 2. Environment variables

Zet deze in Vercel onder **Settings → Environment Variables** (Production,
Preview én Development), en lokaal in `.env.local`. `.env*` staat in
`.gitignore`; **zet de client secret nooit in de repository**.

| Variabele | Verplicht | Waarde |
|---|---|---|
| `RINGSIDE_CLIENT_ID` | ja | Client ID uit de mail van SeatGeek |
| `RINGSIDE_CLIENT_SECRET` | ja | Client Secret uit de mail van SeatGeek |
| `RINGSIDE_TOKEN_URL` | nee | Standaard `https://auth.seatgeek.com/oauth/token` |
| `RINGSIDE_AUDIENCE` | nee | Standaard `https://ringside.seatgeek.com` |
| `RINGSIDE_BASE_URL` | nee | Standaard `https://ringside.seatgeek.com` |

Markeer `RINGSIDE_CLIENT_SECRET` in Vercel als **Sensitive**, dan is de waarde
na opslaan ook in het dashboard niet meer terug te lezen.

In de praktijk zijn alleen het client ID en het secret nodig; de andere drie
hebben de juiste standaardwaarde. `RINGSIDE_TOKEN_URL` bestaat als ontsnapping
voor het geval SeatGeek de endpoint verplaatst — dat is dan een wijziging in
Vercel en niet in de codebase.

### Body-formaat van de tokenaanvraag

De Authentication API van SeatGeek schrijft een JSON-body voor, afwijkend van
RFC 6749 dat form-encoded voorschrijft. `requestToken()` stuurt daarom JSON:

```
curl --location 'https://auth.seatgeek.com/oauth/token' \
--header 'Content-Type: application/json' \
--data '{
    "client_id": "$CLIENT_ID",
    "client_secret": "$CLIENT_SECRET",
    "audience": "https://ringside.seatgeek.com",
    "grant_type": "client_credentials"
}'
```

Het antwoord bevat een `access_token` (JWT), `token_type: Bearer` en een
`expires_in` van 2.592.000 seconden — 30 dagen. Tokens zijn dus lang geldig,
wat de cache in `auth.ts` des te nuttiger maakt.

## 3. Wat voor API Ringside is

Belangrijk om te weten voordat je de migratie plant: **Ringside is geen gewone
REST-API die je per wedstrijd de actuele beschikbaarheid geeft.** Het is een
change-feed over de databasetabellen van SeatGeek. Elk antwoord ziet er zo uit:

```json
{
  "has_more": true,
  "cursor": "MDAxOWExYzM6MDAwMm...LTJlMGM2MGQzZTk0MA==",
  "data": [
    {
      "_ringside_sequence": "0019a1c3:0002a20d:0004/0019a1c3:0002a20d:0003",
      "_ringside_operation": "U",
      "id": "00000009-2800-4eac-8099-ea31fc74980c",
      "datetime_utc": "2022-02-23T17:18:40.917000",
      "operation_kind": "Transaction"
    }
  ],
  "metadata": {
    "version": "0.0.1",
    "table_definition": [
      { "column": "id", "postgres_type": "uuid" }
    ]
  }
}
```

Drie dingen vallen op:

- `_ringside_operation` is de soort mutatie op de rij (`U` voor update), en
  `_ringside_sequence` de plaats in de stroom. Je krijgt dus wijzigingen, geen
  momentopname.
- `metadata.table_definition` beschrijft de kolommen met hun Postgres-type —
  het is letterlijk een tabel die naar buiten wordt gerepliceerd.
- `has_more` en `cursor` maken elk antwoord een pagina. `ringsidePages()` in
  `lib/ringside/client.ts` loopt die af.

Endpoints staan onder `/v1/`, bijvoorbeeld `/v1/payments`. De basis-URL is
gelijk aan de audience: `https://ringside.seatgeek.com`.

### Beschikbare tabellen

Ringside biedt deze categorieën:

`attendance` · `attribution` · `behaviors` · `Catalog` · `clients` ·
`installments` · `manifests` · `payments` · `pricing` · `products` · `sales` ·
`SeatGeekIQ Deal Terms` · `SeatGeekIQ Ledger`

Voor Ticket Inzichten zijn drie daarvan kansrijk, af te leiden uit wat een
`payments`-rij prijsgeeft:

| Tabel | Verwachting | Levert |
|---|---|---|
| `products` / `Catalog` | events en per-stoel producten | eventnaam, datum |
| `manifests` | de stoelindeling van het stadion | totale capaciteit |
| `sales` | verkochte items | verkochte tickets |
| `attendance` | scans bij de poortjes | werkelijke opkomst (later) |

`attendance` is geen vervanging voor de verkoopcijfers maar wel een tabel die de
XML-feed nooit had: per scan `scan_date`, `scan_succeeded`,
`scan_failure_reason_code`, `gate_id`, `turnstile_name` en de plek
(`section_name`, `row_name`, `seat`). Daarmee is het verschil tussen verkocht en
daadwerkelijk aanwezig te zien — een inzicht dat nu volledig ontbreekt.

Een `payments`-rij bevat namelijk al `product_name` in de vorm
`2022-11-12 20:00:00 PSV - AZ 22/23 Seat:31 Row:38 Sector:UU`, plus losse
`manifest_sector_name`, `manifest_row_name` en `manifest_seat_name`. De
administratie is dus per stoel, niet per event — `soldTickets` en
`totalCapacity` uit de oude XML-feed worden hier aggregaties.

### De mapping naar `TicketEvent`

Uit de schema's van `products`, `Catalog`, `manifests` en `sales` valt de
vertaling naar de bestaande `TicketEvent` grotendeels af te leiden:

| `TicketEvent` | Ringside | Opmerking |
|---|---|---|
| `eventId` | `manifests.event_id` / `products.product_id` | welke van de twee stabiel is, moet blijken |
| `eventName` | `getProductDisplayName()` uit `lib/ringside/products.ts` | `Display_Name` uit `product_details`, anders `product_description` |
| `eventDate` | `Catalog.event_datetime_local` | `products.event_date` is een string, `manifests.event_date` een timestamp |
| `saleStatus` | `products.event_sales_status` | |
| `totalCapacity` | **som** van `manifests.capacity` | exclusief `is_excluded_from_reported_capacity`; een staanvak is één rij met capaciteit 703 |
| `soldTickets` | `countSoldTickets()` uit `lib/ringside/sales.ts` | officiële definitie uit de sample queries |
| `availableCapacity` | `totalCapacity − soldTickets` | of direct uit `is_counted_as_available` |
| `lastUpdate` | `last_touched_at` | |

Twee dingen die `manifests` biedt en de XML-feed niet had: de capaciteit is
uit te splitsen naar vak, rij en prijsniveau (`section`, `stand`, `price_level`,
`seat_type`), en de flags `is_held_for_subscriber`, `is_hospitality` en `is_ga`
maken onderscheid tussen wat écht vrij verkoopbaar is en wat vastzit.

En `sales` heeft `transaction_date` per verkocht item. Dat is een wezenlijke
verbetering: de verkoop per dag hoeft niet langer gereconstrueerd te worden uit
metingen om de twee uur, maar komt rechtstreeks uit de transacties — met
terugwerkende kracht, ook voor wedstrijden die al gespeeld zijn.

#### Wat de echte data liet zien

Gemeten met `?distinct=` op de eerste pagina van elke tabel. **Let op de
strekking:** zo'n pagina is een willekeurige snede van 5000 rijen uit de
change-feed, geen doorsnede van één event. De verhoudingen zeggen dus niets
over de bezetting van een wedstrijd — wel welke waarden een kolom aanneemt.

**`manifests.capacity` is niet altijd 1.** Van de 5000 rijen hadden er 4999 een
capaciteit van 1 en één rij 703 — dezelfde rij die als enige `is_ga: true` had.
Een staanvak is dus één rij met de capaciteit van het hele vak.

> `totalCapacity` is daarmee een **som** van `capacity`, geen telling van rijen.
> Rijen tellen zou een vak van 703 plaatsen als één plek meerekenen.

**`is_counted_as_available` heeft drie waarden, niet twee:** 3675 × `false`,
1324 × `true` en één keer `null`. Die `null` moet een expliciete keuze krijgen —
in JavaScript is `null` falsy, dus zonder aandacht verdwijnt zo'n stoel stil uit
de telling.

**`products.product_type` vervangt het raden op namen.** Negen waarden:

| Waarde | Aantal |
|---|---|
| `Event` | 4630 |
| `Merchandise` | 179 |
| `Price Modifier` | 69 |
| `Memberships` | 38 |
| `Gift Voucher` | 33 |
| `Delivery` | 19 |
| `Series` | 16 |
| `Fund` | 8 |
| `Deposit Category` | 8 |

Dit is een wezenlijke verbetering. `categorizeEvent()` in `/api/ticket-feed`
raadt de categorie nu uit de Nederlandse eventnaam, met regels als
`n.includes("stadiontour")` en `n.includes("minivoetbal")`. Elk nieuw producttype
vraagt daar een nieuwe regel, en een naam die niet past valt in "Overig".
Ringside geeft het type gewoon mee.

**`products.event_sales_status`** kent vijf waarden: `Open` (4571), `null` (370),
`Closed` (50), `Closing` (7) en `Canceled` (2). Dat wordt `saleStatus`.

**In `sales` is een rij niet hetzelfde als een verkocht ticket.** Drie kolommen
bepalen samen wat meetelt:

| Kolom | Waarden |
|---|---|
| `item_type` | `Ticket` (4678), `Membership` (266), `Subscription` (42), `Merchandise` (8), `Delivery` (6) |
| `sale_type` | `Sale` (3853), `Reservation` (475), `Reservation Cancellation` (278), `Reservation Confirmation` (196), `Return` (190), `Confirmed Reservation Return` (8) |
| `current_status` | `true` (4122), `false` (878) |

`item_type = 'Ticket'` is het eerste filter — abonnementen en merchandise horen
niet in een ticketteller. Daarna is de vraag wat `sale_type` en `current_status`
samen betekenen: een `Return` is een teruggave en een `Reservation` een
optie die nog geen verkoop is. Opvallend: 190 + 278 + 8 = 476 rijen met een
annulerings- of retour-achtig type, tegenover 878 rijen met
`current_status: false`. Die getallen lopen niet gelijk, dus `current_status`
is niet simpelweg "niet teruggegeven".

De kruistabel legt dat bloot:

```
/api/ringside/probe?path=/v1/sales&rows=0&distinct=sale_type+current_status
```

### De SQL draait in je eigen warehouse

De sample queries in de portal zagen er even uit als een uitweg: kun je SQL
sturen, dan vraag je de aggregatie rechtstreeks op en hoef je niets te bewaren.
Dat gaat niet op. De documentatie zegt het zelf:

> All sample queries are written using postgresql syntax and functions. You may
> need to translate them to syntax native to **your data warehouse provider**.

En de bijbehorende tabel koppelt elke dataset aan zowel een endpoint als een
tabelnaam:

| Dataset | Endpoint | Tabelnaam |
|---|---|---|
| SeatGeekIQ Deal Terms | `/v1/sgiq/deal_terms` | `sgiq_deal_terms` |
| SeatGeekIQ Ledger | `/v1/sgiq/ledger` | `sgiq_ledger` |
| Catalog | `/v1/catalog` | `catalog` |

Die tabelnamen — `ringside_sales`, `ringside_products`, `ringside_attribution`,
`ringside_clients` — zijn dus hoe de data heet *nadat je hem zelf hebt
binnengehaald*. SeatGeek biedt geen query-endpoint. **Repliceren is nodig**, en
het migratieplan onderaan blijft staan zoals het is.

### Wat de sample queries wél opleveren

Ze zijn de officiële definitie van begrippen die je anders zou moeten raden.

#### Wat telt als verkocht ticket

In drie afzonderlijke rapportages staat woordelijk dezelfde voorwaarde:

```sql
WHERE RS.current_status = 'True'
  AND RS.sale_type IN ('Sale', 'Reservation Confirmation', 'Update - New')
  AND RS.forward_item_id IS NULL
  AND RS.item_type = 'Ticket'
```

en geteld wordt `COUNT(DISTINCT product_item_id)`, niet het aantal rijen.

Dit staat in `lib/ringside/sales.ts` als `isSoldTicket()` en
`countSoldTickets()`. Drie dingen die je zonder deze queries mis zou hebben:

- **`forward_item_id IS NULL`.** Zonder die regel telt een doorgezet ticket
  twee keer.
- **`Update - New`** hoort bij de verkopen, maar zat niet in de eerste pagina
  die we maten. Alleen naar de data kijken had die waarde niet opgeleverd.
- **Ontdubbelen op `product_item_id`**: één ticket kan meerdere verkoopregels
  hebben.

Let op wat je **niet** moet overnemen: die queries hebben ook
`AND RS.application_channel = 'eSRO'`. Dat filtert op het online verkoopkanaal
en hoort bij die specifieke marketingrapportage, niet bij de definitie van een
verkocht ticket.

#### De eventnaam zit in JSON

```sql
COALESCE(PROD.product_details::json->'Display_Name'->>0, PROD.product_description)
```

`products.product_details` is tekst met JSON erin, en `Display_Name` is daarin
een array. Een `Series`-product heeft daarnaast `Event_Id` met de events die
erbij horen. Beide zitten in `lib/ringside/products.ts`.

#### SeatGeekIQ is niet onze bron

Het eerdere vermoeden klopt: `sgiq_ledger` gaat over deals, marketplaces,
commissie en revenue share — de tickets die SeatGeek zelf beheert en
doorverkoopt. Voor de stadioncapaciteit en de primaire verkoop hebben we
`manifests` en `sales` nodig.

#### Twee tabellen voor later

- **`attribution`** koppelt via `transaction_id` een verkoop aan
  `sales_channel`, `affiliate_id` en `placement_id`. Verkoop per kanaal, dus —
  en daarmee te koppelen aan wat er in Paid Ads en de campagnetools gebeurt.
- **`behaviors`** bevat `checkout:start` en `checkout:success` met de winkelwagen
  erin (`product_id`, `section`, `row`, `seat`, prijs) en een `expires_at`. Het
  verschil tussen die twee is een verlaten winkelwagen, uit te splitsen naar
  vak. Net als `attendance` geen vervanging van wat er nu is, wel iets dat er
  nu helemaal niet is.

#### De ingest

`/api/ringside/ingest` leest de verkoop in stappen in en draait als cron elk
uur. Elke run werkt binnen een tijdsbudget, onthoudt met een cursor waar hij
gebleven is, en telt de verkoop op bij wat er al lag.

De meting gaf 2.366 rijen per seconde. Bij een run van vier minuten is dat ruim
een half miljoen rijen; hoeveel runs de eerste vulling kost hangt af van de
omvang van de tabel, maar het is eenmalig. Daarna staat de cursor aan het eind
en leest elke run alleen nog de nieuwe mutaties — dan kan het uurschema omlaag.

Bijzonderheden:

- **Producten gaan eerst.** Zonder wedstrijddatum is er geen "dagen tot de
  wedstrijd" om verkoop op te boeken, en verkoop van een onbekend product zou
  stilletjes wegvallen.
- **Optellen, niet vervangen.** Een run leest maar een deel, en de rijen van één
  wedstrijd liggen verspreid over de hele tabel. Pas na een volledige doorloop
  klopt een totaal; tot die tijd zijn het ondergrenzen, en dat staat als melding
  op de pagina.
- **Ontdubbelen kan alleen binnen een pagina.** Over pagina's heen zou dat alle
  ticket-ids in het geheugen vragen. De filters op `sale_type`,
  `current_status` en `forward_item_id` horen dat overbodig te maken; wijkt een
  totaal straks af van wat je verwacht, dan is dit de eerste plek om te kijken.
- **Eén aanroep maakt het af.** Een serverless functie mag maximaal 300
  seconden draaien, dus één run kan de tabel nooit uitlezen. In plaats van dat
  handmatig te herhalen start een run aan het eind zijn eigen opvolger, tot
  twintig keer. `?chain=50` maakt die ketting langer, `?chain=0` zet hem uit.
  De ketting stopt vanzelf bij een fout, bij een run zonder vooruitgang, en als
  alles binnen is.
- **Eén run tegelijk.** Zonder slot kan de cron afgaan terwijl een ketting nog
  loopt. Beide runs lezen dan dezelfde cursor en tellen dezelfde rijen op bij de
  aggregaten — dubbeltellen, en aan de cijfers niet te zien. Een tweede run
  krijgt daarom een 409 en doet niets. Het slot verloopt vanzelf, zodat een
  gecrashte run niets blokkeert; `?force=1` negeert het.
- **Handmatig te starten.** De route accepteert naast het cron-geheim ook een
  ingelogde sessie, zodat de eerste vulling op gang geholpen kan worden.
  `?restart=1` begint opnieuw vanaf nul.

#### Wat er werkelijk nodig is

De vraag is niet "een dashboard met alle 212 events en hun actuele
beschikbaarheid", maar: **zoek een wedstrijd op, zie de verkoop per dag
afgezet tegen de wedstrijddag, en vergelijk met andere wedstrijden.**

Dat scheelt de zwaarste tabel. Voor die vraag is nodig:

| Tabel | Waarvoor | Omvang |
|---|---|---|
| `sales` | verkoop per dag per wedstrijd | één rij per verkocht item |
| `products` | naam, datum, type | één rij per product |

**`manifests` valt daarmee buiten scope.** Die tabel is stoelniveau en daarmee
de enige die in de tientallen miljoenen rijen loopt. Hij is alleen nodig voor
capaciteit en bezettingspercentage — en dat is niet waar de vraag om draait.
Wil je dat later toch, dan is het te beperken tot de lopende wedstrijden in
plaats van de hele historie.

Ook de opslag wordt daarmee klein. Per wedstrijd bewaren we niet de
verkoopregels maar het aggregaat: verkocht per dagen-tot-de-wedstrijd. Dat is
een paar honderd getallen per wedstrijd, oftewel enkele kilobytes — ruim binnen
wat Vercel Blob comfortabel aankan, zonder database.

`lib/ticket-sales-comparison.ts` kan die vergelijking al tekenen: de x-as is
daar `D-14` / `EVENT` / `D+2` en meerdere series naast elkaar zijn voorzien.
Wat ontbrak was de data. `buildOffsetSales()` en `buildComparisonInput()` in
`lib/ringside/daily-sales.ts` vullen dat gat.

#### Historie is geen bijvangst maar de reden

De feed doorlopen vanaf het begin kost tijd, maar levert precies op wat de
XML-feed nooit kon: het verleden. Twee dingen worden daarmee mogelijk die nu
buiten bereik liggen.

**Verkoop per dag wordt exact in plaats van benaderd.** De huidige pagina leidt
het af uit snapshots om de twee uur, met drie beperkingen: geen historie vóór
de eerste meting, gaten wanneer de cron niet draaide, en niets meer zodra een
event uit de feed verdween. `sales.transaction_date` staat per verkocht ticket
vast, dus het verloop is exact te tellen — met terugwerkende kracht, ook voor
wedstrijden die al gespeeld zijn. Dat zit in
`lib/ringside/daily-sales.ts`, met dezelfde uitvoervorm als
`lib/ticket-daily-sales.ts` zodat de bestaande grafiek het kan tekenen.

**Seizoenen worden vergelijkbaar.** Zodra de historie binnen is, is het verloop
van deze wedstrijd naast dezelfde wedstrijd vorig seizoen te leggen, of naast
het gemiddelde van alle thuiswedstrijden. De vergelijkingsfunctie in
`lib/ticket-sales-comparison.ts` bestaat al; wat ontbreekt is de data.

Een gevolg voor het ontwerp: **een gespeeld event verandert niet meer.** Zodra
het voorbij is staat het aggregaat vast en hoeft het nooit meer bijgewerkt.
Alleen de lopende en toekomstige events — enkele tientallen tegelijk — hebben
doorlopend actuele standen nodig. Dat maakt het bijhouden na de eerste
inleesronde een stuk kleiner dan die ronde zelf.

#### De feed begint bij het begin van de historie

De eerste meting op de nieuwe pagina liet zes wedstrijden zien: Bayern
München 2016, Roda JC 2017, AZ 2017, Haugesund 2019, Real Sociedad 2021. Geen
enkele uit het lopende seizoen.

Dat is geen fout maar de aard van een change-feed: je begint bij de oudste
mutatie en werkt vooruit. De eerste pagina's zijn dus het verleden. Wat Ticket
Inzichten nodig heeft — de huidige verkoop — staat aan het *eind*.

Twee gevolgen:

- **Een begrensde leesactie vanaf het begin is nutteloos voor de dagelijkse
  pagina.** Je moet ofwel helemaal doorlopen, ofwel een manier vinden om
  verderop te beginnen.
- **`is_counted_as_available` is hieraan niet te beoordelen.** Roda JC 2017 gaf
  27.181 beschikbaar bij 226 verkocht. Dat kan betekenen dat de kolom statisch
  is, maar net zo goed dat de verkoopregels van die wedstrijd verderop in de
  feed staan en wij alleen het begin lazen. Zolang we niet bij een actueel
  event zijn, zegt dat getal niets.

`/api/ringside/scan` meet daarom hoe diep een tabel gaat: hij loopt binnen een
tijdsbudget zo ver mogelijk en geeft terug hoeveel rijen hij zag, hoe snel, tot
welke datum hij gekomen is en met welke cursor je verder kunt.

```
/api/ringside/scan?path=/v1/manifests&seconds=45
/api/ringside/scan?path=/v1/manifests&seconds=45&cursor=<nextCursor uit het vorige antwoord>
```

`dateRange.latest` is daarbij de meter: zodra die in het lopende seizoen komt,
zijn we bij bruikbare data. Ook `/api/ringside/ticket-feed` accepteert nu
`cursorManifests`, `cursorSales` en `cursorProducts` om verderop te beginnen.

#### Wat nog open staat

1. **Kan Ringside filteren?** Waarschijnlijk niet. Het code-voorbeeld van
   `/v1/catalog` in de portal kent twee parameters — `cursor` en `limit` — en
   geen enkele filter op event of product. Is dat bij `manifests` en `sales`
   net zo, dan is de REST-kant puur "de hele stroom doorlopen" en blijft
   aggregeren tijdens het inlezen nodig, tenzij de SQL-weg hierboven begaanbaar
   is. `limit` is wel meteen bruikbaar: de standaardpagina is 5000 rijen, en met
   `&limit=100` verken je een tabel een stuk sneller.
2. **Wat betekent `is_counted_as_available` precies?** Nog niet te beoordelen:
   daarvoor moeten we eerst bij een actueel event zijn. `manifests` heeft
   daarnaast `locks`, `ga_locks`, `allocations` en `ga_allocations` als `jsonb`
   — mogelijk zit de actuele stand dáár.
5. **Hoe groot zijn de tabellen?** Bepaalt of doorlopen tot het heden een kwestie
   van minuten of van dagen is, en daarmee of deze aanpak houdbaar is. Meet met
   `/api/ringside/scan`.
6. **Kunnen we verderop beginnen?** Als SeatGeek een manier heeft om vanaf een
   datum of vanaf "nu" te lezen in plaats van vanaf het begin van de historie,
   vervalt het grootste deel van het probleem. Waard om te vragen.
3. **Hoe verhouden `products` en `Catalog` zich?** Beide hebben `product_id`,
   maar `Catalog` heeft ook een eigen numerieke `id`.
4. ~~Wat telt in `sales` als verkocht ticket?~~ Beantwoord door de sample
   queries; vastgelegd in `lib/ringside/sales.ts`.

### Persoonsgegevens

**De tabellen bevatten persoonsgegevens.** Een `payments`-rij draagt voor- en
achternaam, `crm_id`, `client_id`, de laatste cijfers en provider van de
creditcard en een betalingsreferentie. Dat is AVG-materiaal, en SeatGeek wijst
er in de credentials-mail expliciet op: "principle of least privilege".

Twee gevolgen:

- De probe maskeert persoonsvelden standaard (zie `PERSONAL_COLUMN_PATTERN` in
  de route). `?unmasked=1` zet dat uit — gebruik dat alleen als het echt moet,
  en plak de uitkomst nergens waar hij blijft staan.
- Let bij het uitbreiden van dat patroon op de naamgeving per tabel: in
  `payments` heten de velden `fname` en `crm_id`, in `attendance`
  `primary_first_name` en `primary_crm_id`. Het patroon ankert daarom op het
  achtervoegsel. Komt er een tabel bij, controleer dan of de persoonsvelden
  daarvan ook echt geraakt worden — `?rows=1` laat het direct zien.
- Ook een `barcode` wordt gemaskeerd: dat is geen persoonsgegeven maar wel een
  toegangsbewijs.
- Ticket Inzichten werkt op aantallen, niet op personen. Wat we straks
  repliceren moet dus zo min mogelijk van deze velden bevatten. `payments` is
  waarschijnlijk helemaal niet de tabel die we nodig hebben.

### Wat dat betekent voor Ticket Inzichten

De XML-feed kon je bij elke pageview opnieuw ophalen. Een change-feed niet: je
leest hem één keer door, houdt de laatste cursor vast, en haalt daarna alleen
nog de mutaties op. De actuele stand leeft dan bij ons, niet bij SeatGeek.

Precies dát lost het oorspronkelijke probleem op — een gespeelde wedstrijd
verdwijnt niet meer, want wij bewaren de rijen zelf. Maar het maakt de migratie
groter dan het vervangen van de bron achter `/api/ticket-feed`: er moet opslag
bij. Dit project gebruikt Vercel Blob (`lib/blob-snapshots.ts`); Postgres is er
ooit uit gehaald en `lib/db.ts` is nog een lege stub.

## 4. Controleren of het werkt

Er is een diagnose-endpoint: `GET /api/ringside/probe` (inloggen vereist).

```
# Werken de credentials? Geeft tokengeldigheid terug, niet het token zelf.
/api/ringside/probe

# Forceer een vers token in plaats van het gecachete.
/api/ringside/probe?refresh=1

# Roep een Ringside-tabel aan: samenvatting plus een paar voorbeeldrijen.
/api/ringside/probe?path=/v1/payments

# Alleen de kolommen, geen enkele rij — de veiligste manier om een tabel te leren kennen.
/api/ringside/probe?path=/v1/payments&rows=0

# Meer rijen (max 50), of de volgende pagina.
/api/ringside/probe?path=/v1/payments&rows=25
/api/ringside/probe?path=/v1/payments&cursor=cGF5bWVudHMv…
```

| Parameter | Betekenis |
|---|---|
| `path` | het Ringside-pad, bijvoorbeeld `/v1/sales` |
| `rows` | aantal voorbeeldrijen, standaard 3, maximaal 50, `0` voor geen |
| `unmasked=1` | toon persoonsvelden onbewerkt — zie **Persoonsgegevens** |
| `distinct` | kolommen (komma-gescheiden) waarvan je de voorkomende waarden wil tellen; `a+b` kruist twee kolommen |
| `refresh=1` | negeer het gecachete token |

`distinct` telt per kolom welke waarden er in deze pagina voorkomen. Dat
beantwoordt vragen die een schema openlaat — of `capacity` altijd 1 is, welke
waarden `event_sales_status` aanneemt — zonder rijen met persoonsgegevens op te
hoeven halen. Gemaskeerde kolommen telt hij niet mee, tenzij je `unmasked=1`
meegeeft. Combineer met `rows=0`:

```
/api/ringside/probe?path=/v1/manifests&rows=0&distinct=capacity,is_ga,is_counted_as_available
```

Alle andere querystring-parameters gaan door naar Ringside, dus filters en
paginatie zijn direct te proberen. Herkent de probe een Ringside-pagina, dan
geeft hij een `ringside`-samenvatting (aantal rijen, `hasMore`, `cursor`, en de
kolommen met hun Postgres-type) plus een `sample` met de eerste rijen. De volle
pagina komt nooit terug: bij tabellen van dit formaat is dat megabytes aan
persoonsgegevens in je browser. Alleen GET, alleen paden
binnen `RINGSIDE_BASE_URL`, en het antwoord wordt op 20.000 tekens afgekapt.

De probe geeft nooit het access token terug, en het client secret wordt uit
foutmeldingen geknipt — een probe-respons is dus veilig om te delen bij vragen
aan SeatGeek.

Wat de probe teruggeeft:

| Antwoord | Betekenis |
|---|---|
| `503` + `configured: false` | Een verplichte variabele ontbreekt |
| `502` + `authenticated: false` | Locksmith wees de credentials af of was onbereikbaar |
| `200` + `authenticated: true` | Token opgehaald; `status` is dan die van Ringside zelf |

## 5. Vervolg: van XML-feed naar Ringside

`/api/ticket-feed` is het enige punt waar de XML-feed de applicatie binnenkomt.
Alle vijf de consumenten (het Ticket Inzichten-dashboard, de rapportagewizard,
het dashboard-overzicht en twee share-pagina's) lezen dezelfde vorm:

```ts
{ events: TicketEvent[], count: number, fetchedAt: string }
```

Die vorm kan blijven staan: `/api/ticket-feed` gaat straks niet meer naar
SeatGeek maar naar onze eigen opslag, en de rest van de applicatie merkt er
niets van. Hetzelfde geldt voor de cron `/api/ticket-history/snapshot`, die nu
dezelfde XML ophaalt via `lib/ticket-snapshot-feed.ts`.

De stappen, in volgorde:

1. **Verkennen** — de open vragen onder **Wat nog open staat** beantwoorden.
   De belangrijkste is of Ringside filtering op `event_id` of `product_id`
   ondersteunt: kan dat, dan halen we per event op en vervalt het grootste deel
   van stap 2 en 3.
2. **Opslag kiezen** — de change-feed moet ergens landen, maar niet rij voor
   rij. `manifests` is stoelniveau: één rij per stoel per event. Met 4630
   `Event`-producten en een stadion van tienduizenden plaatsen loopt dat in de
   tientallen miljoenen rijen. Dat is geen Blob-vraagstuk en geen
   Postgres-vraagstuk — dat is een reden om het niet op te slaan.

   De uitweg is aggregeren tijdens het inlezen: per event de som van `capacity`
   en het aantal beschikbare plaatsen bijhouden, en de stoelrijen weggooien. Wat
   overblijft is één regel per event — precies de vorm van de huidige
   `TicketEvent`, en klein genoeg voor wat we al hebben. Alleen als we later
   willen uitsplitsen naar vak of prijsniveau, wordt het een rij per
   event-en-vak; ook dat blijft overzichtelijk.
3. **Repliceren** — een cron die vanaf de laatste cursor de mutaties ophaalt en
   verwerkt. De cursor moet bewaard blijven, anders begint elke run opnieuw.
   Houd er rekening mee dat de eerste run de hele tabel is: de proefrespons van
   `payments` bevatte rijen uit 2018. Neem daarbij alleen de kolommen over die
   we echt nodig hebben, zodat er geen persoonsgegevens in onze opslag belanden
   die Ticket Inzichten toch niet gebruikt.
4. **Omzetten** — de opgeslagen rijen mappen naar `TicketEvent` en
   `/api/ticket-feed` omzetten. Pas daarna kan de XML-feed eruit.

Stap 1 is de enige die nu kan; de rest hangt ervan af wat daar uitkomt.
