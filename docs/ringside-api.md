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

## 3. Controleren of het werkt

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
dus filters en paginatie zijn direct te proberen. Alleen GET, alleen paden
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

## 4. Vervolg: van XML-feed naar Ringside

`/api/ticket-feed` is het enige punt waar de XML-feed de applicatie binnenkomt.
Alle vijf de consumenten (het Ticket Inzichten-dashboard, de rapportagewizard,
het dashboard-overzicht en twee share-pagina's) lezen dezelfde vorm:

```ts
{ events: TicketEvent[], count: number, fetchedAt: string }
```

De migratie kan daardoor achter die ene route blijven: zodra we via de probe
weten welke Ringside-endpoints en veldnamen er zijn, mappen we die naar
`TicketEvent` en blijft de rest van de applicatie ongemoeid. Hetzelfde geldt
voor de dagelijkse cron `/api/ticket-history/snapshot`, die nu dezelfde XML
ophaalt via `lib/ticket-snapshot-feed.ts`.

Dat mappen kan pas als we de echte respons hebben gezien — daarvoor is stap 3
de eerste stap.
