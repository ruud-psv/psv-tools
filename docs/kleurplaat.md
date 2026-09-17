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
  ├─ POST /api/kleurplaat ─────────▶│ ─ GET /models/{owner}/{name} ─▶│ (schema)
  │                                 │ bouwt prompt en model-input    │
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

### Zelf een model toevoegen

In de tool zit onder het modelveld een knop **Model toevoegen**. Daar plak je de identifier
van een Replicate-model (`openai/gpt-image-1.5`) of gewoon de URL van de modelpagina
(`https://replicate.com/openai/gpt-image-1.5`). Een vastgezette versie mag ook:
`eigenaar/model:<hash>`.

**Controleren** haalt het model op bij Replicate en meldt terug wat de tool ermee kan:
hoeveel referenties het meeneemt en onder welke veldnaam, welke verhoudingen het kent, en of
het wel een afbeelding oplevert. Klopt het, dan zet **Toevoegen** het model in de dropdown.

Toegevoegde modellen staan in `localStorage` van je eigen browser — een collega ziet ze dus
niet, en ze verdwijnen als je je browsergegevens wist. Bevalt een model, zet hem dan in
`AANBEVOLEN_MODELLEN` in `lib/kleurplaat/index.ts`; daarmee staat hij voor iedereen in de lijst.

### Hoe een willekeurig model toch goed wordt aangeroepen

Er staat geen regel code per model. `lib/kleurplaat/schema.ts` leest het openapi-schema dat
Replicate per model publiceert en zoekt daarin op:

| Wat we nodig hebben | Waar het naar zoekt |
|---|---|
| prompt | `prompt`, `text_prompt`, `text`, `description` |
| referenties | `image_input`, `input_images`, `reference_images`, `image_prompt`, `input_image`, … |
| verhouding | `aspect_ratio`, `ratio` |
| bestandsformaat | `output_format`, `format` |
| aantal beelden | `max_images`, `num_outputs`, `number_of_images` |

Uit het type van het referentieveld volgt of het model één afbeelding of een lijst aanneemt —
daarom neemt FLUX.1 Kontext er één mee en Nano Banana meer, zonder dat dat ergens is
ingetypt. Velden die het model niet kent, sturen we niet mee; die zou Replicate weigeren.

De verhouding wordt omgerekend naar wat het model aanbiedt. Staand (2:3) wordt bij Nano Banana
letterlijk `2:3`, maar bij gpt-image-1.5 `1024x1536`, omdat dat de dichtstbijzijnde optie in
zijn keuzelijst is. Kent een model geen bruikbare optie, dan sturen we het veld niet mee en
houdt het model zijn eigen standaard aan.

Het profiel wordt per proces gecachet, dus het kost één extra call bij de eerste generatie met
een model.

### Aanbevolen modellen

`AANBEVOLEN_MODELLEN` in `lib/kleurplaat/index.ts` is puur een lijstje met een label en een
tip erbij; er zit geen model-specifieke code onder.

| Model | Waarom |
|---|---|
| `google/nano-banana` | Gemini 2.5 Flash Image. Houdt een karakter over meerdere referenties het beste vast. Standaardkeuze. |
| `bytedance/seedream-4` | Strak lijnwerk op hoge resolutie, neemt veel referenties mee. |
| `black-forest-labs/flux-kontext-max` | Bewerkt één referentie en houdt de stijl strak vast. |

Een model zonder version hash draait op `POST /v1/models/{owner}/{name}/predictions` (de
nieuwste versie); een gepind model op `POST /v1/predictions` met een `version`.

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
- **Eigen modellen zijn per browser.** Zie hierboven: `localStorage`, niet gedeeld met
  collega's. Een gedeelde lijst zou in Vercel Blob kunnen, net als de ticket-snapshots.
- **Geen publieke pagina.** De tool zit achter de login. Wil je hem aan ouders en kinderen
  geven, dan hoort hij onder `/share/…` (die routes laat `middleware.ts` ongeauthenticeerd
  door) mét een rem op het aantal generaties per bezoeker — elke generatie kost geld.
