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
| `eventName` | `Catalog.display_name`, anders `manifests.event_name` | `Catalog` is de publieksnaam |
| `eventDate` | `Catalog.event_datetime_local` | `products.event_date` is een string, `manifests.event_date` een timestamp |
| `saleStatus` | `products.event_sales_status` | |
| `totalCapacity` | som van `manifests.capacity` | exclusief `is_excluded_from_reported_capacity` |
| `soldTickets` | aantal rijen in `sales` per product | filteren op `current_status` |
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

#### Wat de schema's niet vertellen

Drie vragen die alleen echte data kan beantwoorden. Gebruik `?distinct=` (zie
hieronder) — dat geeft aggregaten, geen rijen:

1. **Is `manifests.capacity` per stoel altijd 1?** Als een GA-vak één rij met
   een hogere capaciteit is, moet `totalCapacity` een som zijn en geen telling.
   `?path=/v1/manifests&rows=0&distinct=capacity,is_ga`
2. **Wat betekent `is_counted_as_available` precies?** Actuele beschikbaarheid,
   of een vaste instelling van de stoel? Het verschil bepaalt of
   `availableCapacity` een aftreksom is of rechtstreeks af te lezen.
3. **Hoe verhouden `products` en `Catalog` zich?** Beide hebben `product_id`,
   maar `Catalog` heeft ook een eigen numerieke `id`. Welke is de sleutel waar
   `manifests` en `sales` op aansluiten?

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
| `distinct` | kolommen (komma-gescheiden) waarvan je de voorkomende waarden wil tellen |
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

1. **Verkennen** — de drie open vragen onder **De mapping naar `TicketEvent`**
   beantwoorden met `?distinct=`. Daarmee ligt vast hoe capaciteit, verkoop en
   de sleutel tussen de tabellen berekend worden.
2. **Opslag kiezen** — de change-feed moet ergens landen. Vercel Blob is wat we
   hebben, maar is per-key georiënteerd en minder geschikt om op te queryen dan
   Postgres; welke van de twee past hangt af van hoeveel rijen stap 1 oplevert.
3. **Repliceren** — een cron die vanaf de laatste cursor de mutaties ophaalt en
   verwerkt. De cursor moet bewaard blijven, anders begint elke run opnieuw.
   Houd er rekening mee dat de eerste run de hele tabel is: de proefrespons van
   `payments` bevatte rijen uit 2018. Neem daarbij alleen de kolommen over die
   we echt nodig hebben, zodat er geen persoonsgegevens in onze opslag belanden
   die Ticket Inzichten toch niet gebruikt.
4. **Omzetten** — de opgeslagen rijen mappen naar `TicketEvent` en
   `/api/ticket-feed` omzetten. Pas daarna kan de XML-feed eruit.

Stap 1 is de enige die nu kan; de rest hangt ervan af wat daar uitkomt.
