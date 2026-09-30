# Groepsfoto Creator — bouwplan

> Status: **in aanbouw**. Stap 1 (gedeelde Replicate- en blob-laag) is klaar, de rest volgt.
> Werktitel "Groepsfoto Creator", route `/dashboard/groepsfoto`. De link komt voorlopig
> **niet** in de sidebar of op het dashboard.

## 1. Wat het wordt

Je uploadt een selfie, en een beeldmodel op Replicate zet jou als extra persoon op een vaste
foto van PSV-spelers. Die basisfoto kiest de gebruiker niet zelf: wij leveren hem mee, net
zoals de Kleurplaat Creator altijd dezelfde vaste opdracht meegeeft. Je downloadt het
resultaat als PNG.

**Het is geen officiële groepsfoto.** Het gaat om sfeerfoto's in een groepssetting: een
**kerstkaart** (spelers in kersttruien bij de boom), of een andere groepsfoto, zoals een
huldiging, een trainingskamp of een verjaardag. Dat heeft drie gevolgen voor het ontwerp:

- **Meerdere basisfoto's**, elk voor een gelegenheid. Je kiest er een in de tool, en de
  bibliotheek groeit per seizoen of per campagne.
- **Het tenue volgt de foto.** Op de kerstfoto krijg jij ook een kersttrui, niet per se een
  wedstrijdshirt.
- **Het eindproduct is vaak een kaart.** Na het genereren kun je er een kaartrand met een tekst
  als "Fijne feestdagen" omheen zetten. Dat gebeurt in de browser op een canvas, net als de naam
  op de kleurplaat, zodat de letters foutloos zijn.

Qua opbouw is het vrijwel een kopie van de Kleurplaat Creator (`docs/kleurplaat.md`):

| Kleurplaat Creator | Groepsfoto Creator |
|---|---|
| Referenties van Phoxy (gedeelde bibliotheek) | **Basisfoto's** met spelers per gelegenheid (gedeelde bibliotheek, beheerd door ons) |
| — | **Selfie** van de gebruiker (per generatie, wordt niet bewaard) |
| Scène kiezen | **Basisfoto kiezen** (kerst, huldiging, …) + **positie** in de groep |
| Rugnummer, detailniveau | **Tenue**: passend bij de foto, of eigen kleding |
| Logo + naam via canvas | PSV-logo, **kaarttekst** en **"Gemaakt met AI"-label** via canvas |
| Prompt: zwart-wit lijntekening | Prompt: fotorealistisch invoegen, spelers onaangetast |

Het model krijgt twee beelden: **beeld 1 = de basisfoto**, **beeld 2 = de selfie**. De
prompt verwijst er expliciet op volgorde naar.

## 2. Wat we hergebruiken

De Replicate-laag in `lib/kleurplaat/` was al model-agnostisch. In stap 1 is hij
losgetrokken, zodat beide tools hem delen (**klaar**):

| Was | Is nu | Wat |
|---|---|---|
| `lib/kleurplaat/replicate.ts` | `lib/replicate/client.ts` | schema ophalen, voorspelling starten/pollen, `eersteAfbeelding()` |
| `lib/kleurplaat/schema.ts` | `lib/replicate/schema.ts` | `leesProfiel()`, `bouwInput()`, `kiesVerhouding()`, die nu elke verhouding aanneemt ("4:3", "1600x1200"), niet alleen de drie van de kleurplaat |
| `Model`, `parseerModelId()`, `labelUitId()`, `BewaardModel`, `ModelProfielInfo`, `StatusResponse` uit `lib/kleurplaat/index.ts` | `lib/replicate/model.ts` | gedeelde types; `lib/kleurplaat` exporteert ze opnieuw |
| blob-hulpjes uit `lib/kleurplaat/opslag.ts` | `lib/blob/beelden.ts` | `meldOpslagfout`, `veiligeNaam`, `nieuwId`, `extensieVoor`, `mimeVanPad`, `leesPriveBlob`, `alsDataUrl` |
| modellenlijst uit `lib/kleurplaat/opslag.ts` | `lib/blob/modellen.ts` | `modellenOpslag(prefix)`: één gedeelde lijst per tool |

Nog te beslissen bij de volgende stappen:

| Wat | Aanpak |
|---|---|
| `app/api/kleurplaat/status/[id]` | hergebruiken vanuit de nieuwe tool: pollen is identiek |
| `app/api/kleurplaat/download` | prefix van de bestandsnaam als parameter, of een kopie |
| canvas-compositie | eigen `lib/groepsfoto/compositie.ts`: logo, kaartrand, tekst en AI-label op een foto, geen lijnversie nodig |

## 3. Nieuwe bestanden

```
app/dashboard/groepsfoto/page.tsx              pagina (kop + <GroepsfotoCreator />)
components/groepsfoto-creator.tsx              de UI
lib/groepsfoto/index.ts                        types, modellen, posities, bouwPrompt()
lib/groepsfoto/opslag.ts                       basisfoto's in Vercel Blob (privé)
lib/groepsfoto/compositie.ts                   logo + AI-label op canvas
app/api/groepsfoto/route.ts                    POST: start een generatie
app/api/groepsfoto/basisfotos/route.ts         GET/POST/DELETE bibliotheek basisfoto's
app/api/groepsfoto/basisfotos/bestand/route.ts privé basisfoto naar de browser
app/api/groepsfoto/modellen/route.ts           gedeelde modellenlijst (kopie van kleurplaat)
app/api/groepsfoto/model/route.ts              model controleren (kopie van kleurplaat)
docs/groepsfoto.md                             documentatie zodra het werkt
```

`lib/tools.ts` blijft ongemoeid: de pagina is alleen bereikbaar via de URL. `middleware.ts`
zet hem automatisch achter de login, omdat hij onder `/dashboard` staat.

## 4. De basisfoto ("system message")

- **Opslag:** Vercel Blob, privé, onder `groepsfoto/basisfotos/`. Het zijn spelersfoto's met
  beeldrechten; die horen niet op een openbare URL en ook niet in de repo.
- **Beheer:** in de tool zelf, net als het logo bij de kleurplaat. Er is een bibliotheek
  (max. ~12 foto's) met per foto een label, bijvoorbeeld "Kerst 2026 — bij de boom" of
  "Huldiging — op de bus". De gebruiker kiest er een als thumbnail, en de nieuwste staat
  standaard geselecteerd.
- **Metadata per foto** in een JSON naast het beeld (`<id>.json`):
  - `label` en `gelegenheid` (`kerst`, `huldiging`, `overig`)
  - `breedte` en `hoogte`, bij upload in de browser uitgelezen
  - `plaatsingshint`, optioneel: waar in de groep ruimte is (zie §6)
  - `kleding`, optioneel: wat de groep draagt, bijvoorbeeld "a red knitted Christmas jumper
    with a white PSV pattern". Die zin gaat de prompt in als je kiest voor "passend bij de foto".
- **Goede basisfoto's** hebben ruimte voor één extra persoon, niet te veel spelers (4 tot 8
  werkt beter dan 25), en gezichten die groot genoeg in beeld zijn. Dat is een redactionele
  keuze bij het maken van de foto, en hij maakt het grootste verschil in de kwaliteit.
- **Naar het model:** de server leest de blob en stuurt hem als data-URL mee, net als de
  referenties nu. De browser stuurt alleen het pad.
- Upload verkleind tot max. ~2048px aan de lange kant (hoger dan de 1024px van de
  kleurplaat: gezichten van spelers moeten scherp blijven).

## 5. De selfie

- **Upload** met slepen of kiezen, plus op mobiel `capture="user"` zodat de camera direct opent.
- **In de browser voorbewerken:** EXIF-oriëntatie rechtzetten, verkleinen tot max. 1024px,
  opnieuw coderen als JPEG. Dat haalt meteen alle EXIF-metadata (GPS!) eraf.
- **Geen opslag.** De selfie gaat als data-URL in de body van `POST /api/groepsfoto` en de
  server stuurt hem door naar Replicate. Hij komt nooit in Blob. Dat houdt ons buiten
  "we bewaren gezichten"-terrein. Let op de body-limiet van Vercel-functies (4,5 MB):
  een verkleinde JPEG van ~300 KB past ruim.
- **Tips in de UI:** alleen jij in beeld, gezicht recht naar de camera, goed licht, geen zonnebril.
- **Toestemmingsvinkje** vóór het genereren: "Ik upload een foto van mezelf, of van iemand die
  daar toestemming voor gaf." Genereren kan pas als het vinkje aanstaat.

## 6. De prompt

`bouwPrompt()` in `lib/groepsfoto/index.ts`, met dezelfde vaste opbouw van breed naar specifiek:

1. **Opdracht:** "Edit the first image, a festive group photo of PSV Eindhoven football players.
   Add the person from the second image into the photo as one extra member of the group, as if
   they posed together with the players."
2. **Identiteit:** "Keep the added person's face, facial features, skin tone, hair and age
   exactly as in the second image. It must clearly be recognisable as the same person."
3. **Positie:** uit `POSITIES`, bijvoorbeeld:
   - `achter-midden`: "standing in the back row, in the middle between the players"
   - `links` / `rechts`: "standing at the far left/right end of the row"
   - `vooraan`: "crouching in the front row"
   - `automatisch`: "wherever it looks most natural"
   Plus de optionele plaatsingshint van de basisfoto ("there is a natural gap between the
   third and fourth player from the left").
4. **Kleding** (`TENUES`):
   - `passend` (standaard): "dressed like the players in the first image: <kleding van de
     basisfoto>". Zonder `kleding`-veld wordt het: "dressed in the same style as the players".
   - `eigen`: "wearing their own clothes from the second image".
   - `shirt`: "wearing the PSV home shirt".
5. **Samensmelten:** "Match the lighting, colour grading, camera angle, depth of field, grain
   and scale of the first image, so that the person looks photographed in the same moment.
   Correct head size relative to the players."
6. **Harde eisen (achteraan):** "Do not change the players in any way: same faces, poses,
   kits, number of people and background. Do not add text, logos or watermarks. Keep the
   original framing and aspect ratio of the first image. Photorealistic."

Punt 6 is het belangrijkst: een model dat gezichten van spelers "verbetert" of vervormt, is
voor ons het grootste risico (zie §10). Zo nodig een tweede toets: vergelijk de
spelersgezichten niet automatisch, maar houd een handmatige steekproef aan in de testfase.

**Verhouding:** de uitvoer moet dezelfde verhouding hebben als de basisfoto. Kent het model
`match_input_image` (Nano Banana en FLUX Kontext doen dat), dan sturen we die. Anders rekenen
we de verhouding van de basisfoto om naar de dichtstbijzijnde optie via `kiesVerhouding()`.
Daarvoor breidt het type `Verhouding` uit met `4:3`, `3:4`, `16:9` en `9:16`, of er komt een
losse functie die op getallen werkt.

## 7. Modellen

Er zijn twee soorten modellen, en die doen iets anders:

| Soort | Voorbeelden | Geschikt? |
|---|---|---|
| **Multi-image editing** (instructie + meerdere beelden) | `google/nano-banana`, `google/nano-banana-pro`, `bytedance/seedream-4`, `openai/gpt-image-1.5`, `flux-kontext-apps/multi-image-kontext-max` | **Ja**: dit is wat we willen. Een persoon *toevoegen* aan een groep. |
| **Face swap** (gezicht A op lichaam B) | `cdingram/face-swap`, `codeplugtech/face-swap` | Nee voor de hoofdflow: die vervangen het gezicht van een speler, en dat willen we juist niet. Hooguit later als losse modus "neem de plek in van…". |

`AANBEVOLEN_MODELLEN` voor de start: Nano Banana (standaard), Seedream 4 en gpt-image-1.5.
Via **Model toevoegen** kan het team er zelf meer bij zetten, precies zoals bij de kleurplaat.

**Een eis die de kleurplaat niet heeft:** het model moet **minstens twee beelden** aannemen
(`referentieIsLijst` in het profiel). Een model met één beeldveld, zoals `flux-kontext-max`,
zou de basisfoto óf de selfie missen. `/api/groepsfoto/model` meldt dat als fout, en de
generatieroute weigert zo'n model.

## 8. De UI (`components/groepsfoto-creator.tsx`)

Dezelfde twee-kolommenopzet als de kleurplaat, met PSV-componentklassen (`.card__*`,
`.btn`, `.form-group`, `.alert--*`, `.label`) en koppen in `font-heading uppercase`:

**Links: instellingen**
1. **Jouw selfie**: dropzone met voorbeeld, tips en toestemmingsvinkje.
2. **Foto**: rij thumbnails van de basisfoto's; je klikt er een aan. Onder "Beheer" zitten
   uploaden en verwijderen, met label, gelegenheid, plaatsingshint en kleding per foto.
3. **Positie**: segmented control of dropdown (`POSITIES`).
4. **Kleding**: passend bij de foto / eigen kleding / PSV-shirt.
5. **Model**: dropdown en "Model toevoegen" (hergebruik van de kleurplaat-UI; eventueel
   eerst als gedeeld subcomponent `components/replicate/model-kiezer.tsx` uittrekken).
6. **Extra wensen**: vrij tekstveld, max. 400 tekens.
7. **Genereer** (`.btn`), met voortgangsbalk en statustekst tijdens het pollen.

**Rechts: resultaat**
- Het resultaat met een **voor/na-slider** (basisfoto ↔ resultaat), zodat je meteen ziet of de
  spelers onaangetast zijn gebleven.
- **Als kaart** (aan/uit): een witte of rode kaartrand met een tekst eronder, bijvoorbeeld
  "Fijne feestdagen en een sportief 2027!". De tekst staat in `psv-condensed`, het PSV-logo
  komt in de hoek. De standaardtekst hoort bij de gelegenheid van de foto en is vrij aan te
  passen. Tekst veranderen kost geen nieuwe generatie.
- Knoppen: **Download PNG** (foto of kaart), **Opnieuw** (zelfde instellingen, andere uitkomst), **Prompt tonen**.
- Historie van deze sessie onderaan, net als bij de kleurplaat.

Omdat de uitkomst per keer verschilt, is het optioneel om **2 varianten tegelijk** te vragen
(`num_outputs`/`max_images` als het model dat kent, anders twee voorspellingen parallel).
Dat kost dan wel twee keer zoveel.

## 9. API-flow

```
browser                               Next.js                     Blob        Replicate
  ├─ selfie verkleinen (canvas, JPEG)     │                          │             │
  ├─ POST /api/groepsfoto ────────────────▶│ ─ get basisfoto ────────▶│             │
  │  { selfie: dataURL, basisfoto: pad,   │ ─ GET /models/{id} ────────────────────▶│
  │    positie, tenue, model, … }         │ ─ POST /predictions ───────────────────▶│
  │                                       │    image_input: [basis, selfie]         │
  │◀─ { id, prompt, model } ─────────────┤                          │             │
  ├─ GET /api/kleurplaat/status/:id ────▶│ ─ GET /predictions/:id ────────────────▶│
  │◀─ { status, imageUrl } ──────────────┤                          │             │
  ├─ GET …/download?inline=1 ───────────▶│  (canvas: logo + AI-label erop)         │
  └─ download PNG                         │                          │             │
```

Validatie in `POST /api/groepsfoto`:
- `requireEmail()` zoals overal.
- `selfie` moet een `data:image/(jpeg|png|webp);base64,`-URL zijn, met een maximale grootte
  (bijv. 3 MB gedecodeerd).
- `basisfoto` moet een pad onder `groepsfoto/basisfotos/` zijn (`isBasisfotoPad()`).
- `positie` en `tenue` uit een vaste lijst, `extra` afgekapt op 400 tekens.
- Het model moet ≥ 2 beelden aannemen.
- **Volgorde vastzetten:** `bouwInput()` krijgt `[basisfoto, selfie]` en zet die volgorde
  ongewijzigd in het referentieveld. Dat testen we expliciet, want de prompt leunt erop.

## 10. Risico's en open vragen (vóór livegang afstemmen)

- **Portretrecht en beeldrechten van de spelers.** Het gaat om AI-bewerkingen van echte
  spelers. Is dat binnen hun contract en de afspraken met de spelersvakbond (VVCS)
  toegestaan, en voor welke foto's? **Dit is de belangrijkste open vraag. Juridisch/Legal
  moet dit bevestigen voordat het naar fans gaat.**
- **AVG.** Een selfie is een persoonsgegeven, en we verwerken hem via Replicate (VS). Doordat
  we niets opslaan, blijft het beperkt, maar Replicate bewaart API-inputs en -outputs
  standaard ongeveer een uur. Voor intern testen is dat prima. Bij een publieke versie horen
  een privacytekst, een check met de FG/privacy officer en eventueel een DPIA.
- **AI Act, transparantie (art. 50).** Een realistisch bewerkte foto van echte mensen geldt als
  deepfake en moet als AI-gegenereerd herkenbaar zijn, ook op een kerstkaart. Daarom zet de canvasstap standaard een
  klein label "Gemaakt met AI" op de foto, naast het PSV-logo.
- **Misbruik.** Iemand uploadt een foto van een ander, of van iets ongepasts. Het
  toestemmingsvinkje en de login dekken dat intern af. Voor een publieke versie is er meer
  nodig: safety-filter van het model aan, rate limit per bezoeker, en geen vrije promptvelden.
- **Kwaliteit.** Gezichtsgelijkenis wisselt per model, en groepsfoto's met veel kleine koppen
  zijn lastig. Zie de tips voor goede basisfoto's in §4.
- **Kosten.** ± $0,04 per beeld (Nano Banana), hoger bij Pro en gpt-image. Voor intern gebruik
  verwaarloosbaar; bij een publieke campagne is er een rem per bezoeker nodig.

## 11. Bouwvolgorde

| Stap | Wat | Oplevering |
|---|---|---|
| 1 ✅ | Replicate- en blob-laag loskoppelen naar `lib/replicate/` en `lib/blob/`, kleurplaat via re-exports | kleurplaat werkt ongewijzigd, `npm run build` groen |
| 2 | `lib/groepsfoto/index.ts`: types, `POSITIES`, `TENUES`, `AANBEVOLEN_MODELLEN`, `bouwPrompt()` | promptbouwer met vaste opbouw |
| 3 | Basisfoto-opslag (beeld + JSON met metadata) + routes `basisfotos` en `basisfotos/bestand` | foto's uploaden, labelen, tonen en verwijderen |
| 4 | `POST /api/groepsfoto` met validatie, 2-beeldencheck en vaste volgorde | generatie start, status via bestaande route |
| 5 | `app/dashboard/groepsfoto/page.tsx` + `components/groepsfoto-creator.tsx` (selfie, basisfoto, positie, tenue, model, genereren, resultaat) | end-to-end werkend achter de login, niet in de sidebar |
| 6 | `lib/groepsfoto/compositie.ts`: logo, "Gemaakt met AI"-label en de kaartmodus met rand en tekst, download als PNG | nette download als foto of kaart, bestandsnaam `psv-groepsfoto-….png` |
| 7 | Voor/na-slider, varianten, historie | afwerking |
| 8 | Testronde met 3 modellen × ~10 selfies (verschillende huidskleuren, leeftijden, brillen en licht), prompt bijschaven | keuze voor standaardmodel |
| 9 | `docs/groepsfoto.md` + eventueel toevoegen aan `lib/tools.ts` | pas na akkoord |

Stap 1 t/m 5 is het minimum om intern te kunnen testen. De stappen 3 en 4 kunnen parallel.

## 12. Later (buiten dit plan)

- Publieke versie onder `/share/groepsfoto` met rate limit en zonder vrije tekst. Kan op een
  Playable-campagnepagina worden ingebed.
- Printklare kerstkaart als PDF (A6 of A5 gevouwen, met snijmarge).
- Modus "neem de plek in van…" met een face-swap-model, alleen met expliciet akkoord.
- Meer kaartontwerpen per gelegenheid (kerst, verjaardag, seizoensstart).
