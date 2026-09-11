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
| `RINGSIDE_TOKEN_URL` | ja | Token-endpoint van Locksmith — zie hieronder |
| `RINGSIDE_AUDIENCE` | nee | Standaard `https://ringside.seatgeek.com` |
| `RINGSIDE_BASE_URL` | nee | Standaard `https://ringside.seatgeek.com` |

Markeer `RINGSIDE_CLIENT_SECRET` in Vercel als **Sensitive**, dan is de waarde
na opslaan ook in het dashboard niet meer terug te lezen.

> **`RINGSIDE_TOKEN_URL` moeten we nog invullen.** De credentials-mail noemt wel
> het client ID, het secret en de audience, maar niet de URL waar de tokenaanvraag
> naartoe moet. Die staat in de Locksmith-documentatie op
> <https://developer.seatgeek.com/>. Zoek daar naar de token-endpoint (bij een
> Auth0-gebaseerde opzet is dat een URL die eindigt op `/oauth/token`) en zet die
> volledige URL in deze variabele. Lukt dat niet: `ringside-feedback@seatgeek.com`.

De code bepaalt de token-endpoint bewust niet zelf — verhuist SeatGeek hem, dan
is dat een wijziging in Vercel en niet in de codebase.

### Body-formaat van de tokenaanvraag

RFC 6749 schrijft een form-encoded body voor, maar Auth0-gebaseerde servers
accepteren vaak alleen JSON. `requestToken()` probeert daarom eerst
form-encoded en valt bij een 400 of 415 automatisch terug op JSON. Blijkt één
variant structureel de juiste, dan kan de andere eruit.

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
