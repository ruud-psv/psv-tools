# Playable API: wat wel en niet kan

Uitkomst van de Playable API-test (november 2026, campagne 244347, een
landingspagina met de PSV Campaign Kit). De API-beschrijving staat op
`https://api.playable.com/openapi.yaml`.

## De pagina-code zit niet in de API

Een campagnepagina met de Kit staat in Playable in een sectie met het onderdeel
`html-element` (bij 244347: "Game flow section"). De API geeft per sectie alleen
het ID, de titel, de plek (`area`) en welke onderdelen erin zitten
(`unique_addons`), niet de inhoud. Geen van de 41 endpoints geeft de HTML, CSS
of JS van een `html-element` terug, en geen enkel endpoint kan die aanpassen:

| Endpoint | Wat je mag meesturen |
|---|---|
| `POST /v1/campaign/{campaign}` (Update Campaign) | naam, template aan/uit, template-afbeelding, start- en einddatum |
| `POST /v1/campaign/copy/{campaign}` | naam van de kopie, wel of geen bulkprijzen; de kopie krijgt een nieuw ID en een nieuwe URL |
| `PATCH /v1/campaign/{campaign}/game-settings` | alleen Poll, Rad van fortuin en Spin the bottle; een landingspagina geeft *"Landingpage" type is not supported* |
| `POST /v1/media/upload` | afbeeldingen, fonts, svg, pdf en een paar andere bestanden; geen html, css of js |
| `POST /v1/campaign/{campaign}/clear-cache` | niets; leegt de cache van de campagne (hooguit eens per 5 minuten) |

Daarom laadt de [Playable loader](playable-loader.md) de pagina-code van buiten
Playable, in plaats van dat PSV Tools hem in Playable zet.

## Rechten van de sleutels

De rechten (scopes) stel je per app in, in Playable onder Global settings →
Developer apps. De app die PSV Tools nu gebruikt (`PLAYABLE_CLIENT_ID` en
`PLAYABLE_SECRET` in Vercel) kreeg bij de test alle rechten, ook campagnes en
registraties verwijderen en `user.create-login-token`, waarmee je een inloglink
maakt voor een nieuwe Playable-gebruiker met de rol Admin.

PSV Tools heeft genoeg aan:

| Recht | Waarvoor |
|---|---|
| `campaigns.list` | Landingspagina's: het overzicht van campagnes |
| `campaigns.view` | Landingspagina's: de cijfers per campagne |
| `campaigns.sections.list`, `campaigns.sections.view` | controleren of een campagne een `html-element` heeft (optioneel) |
| `campaigns.clear-cache` | de cache van een campagne legen na een wijziging (optioneel) |
| `media.upload`, `media.list` | beelden in de mediabibliotheek van Playable zetten en terugvinden (optioneel) |

Alles met registraties, vouchers, e-mail- en sms-logs, verwijderen, wijzigen,
kopiëren, activeren, pauzeren en `user.create-login-token` is niet nodig.

Een nieuwe app betekent nieuwe sleutels: zet die in Vercel in
`PLAYABLE_CLIENT_ID` en `PLAYABLE_SECRET` en zet de app opnieuw live. Controleer
voordat je de oude app weghaalt of inperkt of er nog iets anders mee werkt,
zoals een koppeling in n8n.

## Overig

- Token: `POST /oauth/token` met `grant_type: client_credentials`. Een token is
  een uur geldig; Playable vraagt tokens te hergebruiken en kan anders
  afremmen.
- De demo-URL staat op `appv2.leadfamly.com` (de oude naam van Playable), de
  live-URL op `club.psv.nl`.
- `campaigns.game-data-statistics` en `.../statistics/registrations` geven
  cijfers per spel en per dag; niet nodig voor landingspagina's.
