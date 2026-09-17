# Kleurplaat Creator — opzet en configuratie

De Kleurplaat Creator (`/dashboard/kleurplaat`) maakt een zwart-wit lijntekening met Phoxy
in de hoofdrol. Je uploadt een paar referentie-illustraties van Phoxy, kiest een scène uit
de lijst of beschrijft er zelf een, en downloadt het resultaat als PNG.

Het is een prototype: de tool staat achter de gewone login en is bedoeld om te genereren en
te testen, nog niet om aan fans te tonen.

## 1. Configuratie

| Variabele | Verplicht | Waarde |
|---|---|---|
| `REPLICATE_API_TOKEN` | ja | API-token van Replicate (`r8_…`), te maken op replicate.com/account/api-tokens |
| `REPLICATE_API_BASE` | nee | Alleen om lokaal tegen een mock te draaien. Standaard `https://api.replicate.com/v1` |

Zet het token lokaal in `.env.local` en in Vercel onder **Settings → Environment Variables**
(Production, Preview én Development). `.env*` staat in `.gitignore`; **zet het token nooit in
de repository**.

Zonder token geeft de tool een nette melding in plaats van een generatie.

## 2. Hoe het werkt

```
browser                          Next.js                         Replicate
  │                                 │                                │
  ├─ upload referenties ────────────┤ (verkleind naar max 1024px,    │
  │  (blijven in localStorage)      │  data-URL, witte achtergrond)  │
  │                                 │                                │
  ├─ POST /api/kleurplaat ─────────▶│ bouwt prompt, filtert input    │
  │                                 ├─ POST /models/…/predictions ──▶│
  │◀─ { id, prompt, model } ────────┤                                │
  │                                 │                                │
  ├─ GET /api/kleurplaat/status/:id▶│ ─ GET /predictions/:id ───────▶│
  │  (elke 1,5 s, max 3 min)        │                                │
  │◀─ { status, imageUrl } ─────────┤                                │
  │                                 │                                │
  └─ GET /api/kleurplaat/download ─▶│ streamt de PNG met een nette bestandsnaam
```

Waarom polling en geen enkele blokkerende call: een generatie duurt 10 tot 60 seconden en
een serverless functie op Vercel wordt afgekapt. Met polling loopt geen enkele request lang.

De download gaat bewust via een eigen route. Rechtstreeks downloaden vanaf Replicate kan wel,
maar dan is de bestandsnaam niet te sturen. Die route accepteert alleen URL's op
`replicate.delivery`, zodat hij geen open proxy wordt.

**Let op:** de links van Replicate verlopen na ongeveer een uur. Wat je wilt bewaren, moet je
downloaden. Er wordt op dit moment niets opgeslagen — geen database, geen blob-opslag.

## 3. Modellen

De modellen staan in `lib/kleurplaat/index.ts` in `MODELLEN`:

| Model | Referenties | Waarom |
|---|---|---|
| `google/nano-banana` | 4 | Gemini 2.5 Flash Image. Houdt een karakter over meerdere referenties het beste vast. Standaardkeuze. |
| `bytedance/seedream-4` | 6 | Strak lijnwerk op 2K, neemt veel referenties mee. |
| `black-forest-labs/flux-kontext-max` | 1 | Bewerkt één referentie en houdt de stijl strak vast. |

Alle drie zijn officiële Replicate-modellen, dus ze draaien op `POST /v1/models/{owner}/{name}/predictions`
zonder version hash.

Een model toevoegen is één item in `MODELLEN`, met een `buildInput` die de model-eigen
veldnamen invult. De input wordt daarna automatisch gefilterd tegen het openapi-schema van
het model (`lib/kleurplaat/replicate.ts`), zodat een veld dat dit model niet kent de aanvraag
niet laat mislukken. Dat schema wordt per proces gecachet.

Een andere aanbieder dan Replicate (bijvoorbeeld `gpt-image-1`) past in dezelfde opzet: die
vraagt om een tweede client naast `replicate.ts` en een veld in `KleurplaatModel` dat zegt
welke client hem moet uitvoeren.

## 4. De prompt

`bouwPrompt()` in `lib/kleurplaat/index.ts` zet de instellingen om in één Engelse prompt. De
volgorde ligt vast, van breed naar specifiek:

1. **Soort plaat** — kleurplaat uit een kleurboek.
2. **Karakter** — Phoxy uit de referenties, met de opdracht kop, oren, snuit, staart en tenue
   over te nemen. Zonder referenties valt hij terug op "een vriendelijke cartoonvos".
3. **Scène** — uit `SCENES` of de vrije tekst van de gebruiker.
4. **Personalisatie** — naam in holle bloklettercontour, rugnummer op het shirt.
5. **Detailniveau** — hoe vol de plaat mag zijn, afhankelijk van de leeftijd.
6. **Harde eisen** — zwarte contouren op wit, geen kleur, geen arcering, geen schaduw, geen
   logo of watermerk. Die staan bewust achteraan, want daar wegen ze het zwaarst.

Valt het lijnwerk tegen (grijstinten, gevulde vlakken, arcering), dan is stap 6 de plek om te
schaven, niet de scène-omschrijving.

De scènes in `SCENES` hebben een Nederlands label voor de dropdown en een Engelse prompt voor
het model. Een scène toevoegen is één item in die lijst.

## 5. Bekende beperkingen

- **Namen op de plaat.** Beeldmodellen schrijven letters niet altijd foutloos. Bij korte namen
  gaat het meestal goed, bij lange namen niet. Altijd controleren voordat je hem verstuurt.
- **Geen opslag.** Gegenereerde platen leven in de sessie en op de link van Replicate. De
  historie onderaan verdwijnt bij een refresh.
- **Geen PDF.** De download is PNG. Een printklare A4-PDF met snijmarges is de logische
  volgende stap.
- **Geen publieke pagina.** De tool zit achter de login. Wil je hem aan ouders en kinderen
  geven, dan hoort hij onder `/share/…` (die routes laat `middleware.ts` ongeauthenticeerd
  door) mét een rem op het aantal generaties per bezoeker — elke generatie kost geld.
