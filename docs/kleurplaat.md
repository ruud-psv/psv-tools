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
| `BLOB_READ_WRITE_TOKEN` | ja | Token van de Vercel Blob-store. In Vercel staat hij er automatisch zodra een Blob-store aan het project is gekoppeld; lokaal moet je hem zelf in `.env.local` zetten. |
| `REPLICATE_API_BASE` | nee | Alleen om lokaal tegen een mock te draaien. Standaard `https://api.replicate.com/v1` |

Zet het token lokaal in `.env.local` en in Vercel onder **Settings → Environment Variables**
(Production, Preview én Development). `.env*` staat in `.gitignore`; **zet het token nooit in
de repository**.

Zonder token geeft de tool een nette melding in plaats van een generatie.

## 2. Hoe het werkt

```
browser                          Next.js                    Blob        Replicate
  │                                 │                         │             │
  ├─ upload referentie ────────────▶│ ─ put (privé) ─────────▶│             │
  │  (verkleind naar max 1024px)    │                         │             │
  │◀─ pad in de bibliotheek ────────┤                         │             │
  │                                 │                         │             │
  ├─ POST /api/kleurplaat ─────────▶│ ─ get referenties ─────▶│             │
  │  (paden, geen beelden)          │ ─ GET /models/{id} ───────────────────▶│ (schema)
  │                                 │ ─ POST /predictions ─────────────────▶│
  │◀─ { id, prompt, model } ────────┤                         │             │
  │                                 │                         │             │
  ├─ GET …/status/:id ─────────────▶│ ─ GET /predictions/:id ──────────────▶│
  │  (elke 1,5 s, max 3 min)        │                         │             │
  │◀─ { status, imageUrl } ─────────┤                         │             │
  │                                 │                         │             │
  └─ GET …/download ───────────────▶│ streamt de PNG met een nette bestandsnaam
```

### Het logo en de naam komen er ná het genereren op

Het Phoxy Club-logo en de naam zijn geen beeldopdracht maar een opmaakstap, in
`lib/kleurplaat/compositie.ts`, in de browser op een canvas. De reden is simpel: een
beeldmodel kan een merklogo niet natekenen zonder het te verminken, en het kan al helemaal
geen lettertype gebruiken — het benadert letters, met spelfouten als gevolg.

Wat dat oplevert:

- Het logo is exact het logo, elke keer, in de hoek die je kiest.
- De naam staat er foutloos in DynaPuff, ook bij een rare spelling.
- Naam of logo veranderen kost **geen nieuwe generatie**: de plaat wordt opnieuw opgebouwd
  zodra je typt.

De prompt vraagt het model daarom om nergens letters te tekenen, en om de hoek waar het logo
komt rustig te houden. Het **rugnummer** blijft wél een opdracht aan het model: dat moet op het
shirt staan en met de houding meebuigen, en dat is niet los te stempelen.

**Welk** logo erop komt, beheer je in de tool zelf: onder de logo-instellingen zit een eigen
logo te uploaden (png, met doorzichtige achtergrond). Dat gaat naar dezelfde gedeelde opslag als
de referenties, dus iedereen krijgt het meteen. Er geldt er altijd precies één; een nieuwe upload
vervangt de vorige, en "terug naar het standaardlogo" valt terug op
`public/images/phoxy-club-logo.png` uit de repo.

Het logo kan als lijntekening of vol in kleur. De lijnversie wordt uit het kleurenlogo gerekend
door alles wat donker is te bewaren en de rest doorzichtig te maken; het logo heeft overal een
zwarte contourlijn, dus wat overblijft is precies de omtrek — in te kleuren, net als de rest.
Onder het logo ligt een wit vlak, anders valt het weg in een drukke tekening. Staat er een naam,
dan groeit het canvas met een witte strook onderaan; de tekening zelf wordt nooit overschreven.

De tekening wordt voor die stap via `/api/kleurplaat/download?...&inline=1` geladen, dus van onze
eigen oorsprong. Rechtstreeks van Replicate zou het canvas "besmet" raken en er geen PNG meer
uit te halen zijn.

**DynaPuff** staat zelf gehost in `public/fonts/` (SIL Open Font License 1.1) en is in
`app/globals.css` als `@font-face` aangemeld. Het canvas wacht met tekenen tot het font er is,
anders valt het stilletjes terug op een ander lettertype.

### Wat waar staat

| Wat | Waar | Gedeeld? |
|---|---|---|
| Referentiebeelden van Phoxy | Vercel Blob, privé, `kleurplaat/referenties/` | ja, iedereen ziet dezelfde bibliotheek |
| Toegevoegde modellen | Vercel Blob, privé, `kleurplaat/modellen/` | ja |
| Het logo | Vercel Blob, privé, `kleurplaat/logo/` — of het logo uit de repo | ja |
| Welke referenties meegaan | alleen in het scherm | nee, dat is een keuze per generatie |
| Gegenereerde kleurplaten | nergens — alleen de link van Replicate | nee, en die link verloopt na een uur |
| Standaardlogo en DynaPuff | in de repo: `public/images/phoxy-club-logo.png` en `public/fonts/` | ja, het zit in de build |

De blobs staan **privé**: het zijn clubillustraties die niet op een openbare URL horen. De
browser krijgt ze via `/api/kleurplaat/referenties/bestand`, achter dezelfde login als de rest
van de tool. Replicate kan een privé blob niet zelf ophalen, dus de server leest de referenties
uit en stuurt ze als data-URL mee in de aanvraag; de browser stuurt alleen de paden mee.

Waarom polling en geen enkele blokkerende call: een generatie duurt 10 tot 60 seconden en
een serverless functie op Vercel wordt afgekapt. Met polling loopt geen enkele request lang.

De download gaat bewust via een eigen route. Rechtstreeks downloaden vanaf Replicate kan wel,
maar dan is de bestandsnaam niet te sturen. Die route accepteert alleen URL's op
`replicate.delivery`, zodat hij geen open proxy wordt.

**Let op:** de links van Replicate verlopen na ongeveer een uur. Wat je wilt bewaren, moet je
downloaden — van de gegenereerde platen zelf wordt niets opgeslagen.

## 3. Modellen

### Zelf een model toevoegen

In de tool zit onder het modelveld een knop **Model toevoegen**. Daar plak je de identifier
van een Replicate-model (`openai/gpt-image-1.5`) of gewoon de URL van de modelpagina
(`https://replicate.com/openai/gpt-image-1.5`). Een vastgezette versie mag ook:
`eigenaar/model:<hash>`.

**Controleren** haalt het model op bij Replicate en meldt terug wat de tool ermee kan:
hoeveel referenties het meeneemt en onder welke veldnaam, welke verhoudingen het kent, en of
het wel een afbeelding oplevert. Klopt het, dan zet **Toevoegen** het model in de dropdown.

Toegevoegde modellen staan in de gedeelde opslag, met de naam van degene die hem toevoegde
erbij: een collega ziet hem dus meteen in de lijst onder "Toegevoegd door het team". Verwijderen
haalt hem ook voor iedereen weg. De server controleert bij het toevoegen eerst of het model op
Replicate bestaat, zodat er niets kapots in de gedeelde lijst belandt.

Bevalt een model blijvend, zet hem dan in `AANBEVOLEN_MODELLEN` in `lib/kleurplaat/index.ts`;
dan staat hij er ook zonder de gedeelde opslag.

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
4. **Rugnummer** — als holle cijfers op het shirt.
5. **Vrije hoek** — de hoek waar de browser straks het logo plakt.
6. **Detailniveau** — hoe vol de plaat mag zijn, afhankelijk van de leeftijd.
7. **Harde eisen** — zwarte contouren op wit, geen kleur, geen arcering, geen schaduw, geen
   logo of watermerk, en nergens letters. Die staan bewust achteraan, want daar wegen ze het
   zwaarst.

Valt het lijnwerk tegen (grijstinten, gevulde vlakken, arcering), dan is stap 6 de plek om te
schaven, niet de scène-omschrijving.

De scènes in `SCENES` hebben een Nederlands label voor de dropdown en een Engelse prompt voor
het model. Een scène toevoegen is één item in die lijst.

## 5. Bekende beperkingen

- **Het rugnummer komt van het model.** De naam staat er exact op, maar het nummer op het shirt
  tekent het model zelf; controleer dat even.
- **Gegenereerde platen worden niet bewaard.** Ze leven in de sessie en op de link van
  Replicate. De historie onderaan verdwijnt bij een refresh.
- **Geen PDF.** De download is PNG. Een printklare A4-PDF met snijmarges is de logische
  volgende stap.
- **Geen versiebeheer op de bibliotheek.** Wie een referentie weggooit, gooit hem voor
  iedereen weg; er is geen prullenbak. De bibliotheek is begrensd op 24 referenties.
- **Geen publieke pagina.** De tool zit achter de login. Wil je hem aan ouders en kinderen
  geven, dan hoort hij onder `/share/…` (die routes laat `middleware.ts` ongeauthenticeerd
  door) mét een rem op het aantal generaties per bezoeker — elke generatie kost geld.
