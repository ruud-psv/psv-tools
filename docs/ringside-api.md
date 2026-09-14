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

# Roep een Ringside-endpoint aan en bekijk het antwoord.
/api/ringside/probe?path=/events&limit=1
```

Alle querystring-parameters behalve `path` en `refresh` gaan door naar Ringside,
dus filters en paginatie (`?cursor=…`) zijn direct te proberen. Herkent de probe
een Ringside-pagina, dan zet hij er een `ringside`-samenvatting boven met het
aantal rijen, `hasMore`, de `cursor` en de kolommen met hun Postgres-type — bij
het verkennen is dat meestal het enige wat je hoeft te lezen. Alleen GET, alleen paden
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

1. **Verkennen** — met de probe uitzoeken welke tabellen onder `/v1/` staan en
   welke de events, capaciteit en verkochte tickets bevatten. Zonder dat weten
   we niet wat we moeten repliceren.
2. **Opslag kiezen** — de change-feed moet ergens landen. Vercel Blob is wat we
   hebben, maar is per-key georiënteerd en minder geschikt om op te queryen dan
   Postgres; welke van de twee past hangt af van hoeveel rijen stap 1 oplevert.
3. **Repliceren** — een cron die vanaf de laatste cursor de mutaties ophaalt en
   verwerkt. De cursor moet bewaard blijven, anders begint elke run opnieuw.
4. **Omzetten** — de opgeslagen rijen mappen naar `TicketEvent` en
   `/api/ticket-feed` omzetten. Pas daarna kan de XML-feed eruit.

Stap 1 is de enige die nu kan; de rest hangt ervan af wat daar uitkomt.
