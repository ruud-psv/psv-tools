# Teamfoto Creator — bouwplan

> Status: **plan**, nog niet gebouwd. Werktitel "Teamfoto Creator", route
> `/dashboard/teamfoto`. De link komt voorlopig **niet** in de sidebar of op het dashboard.

## 1. Wat het wordt

Je uploadt een selfie, en een beeldmodel op Replicate zet jou als extra persoon op een vaste
foto van PSV-spelers. Die basisfoto kiest de gebruiker niet zelf: wij leveren hem mee, net
zoals de Kleurplaat Creator altijd dezelfde vaste opdracht meegeeft. Je downloadt het
resultaat als PNG (of JPG).

Qua opbouw is het vrijwel een kopie van de Kleurplaat Creator (`docs/kleurplaat.md`):

| Kleurplaat Creator | Teamfoto Creator |
|---|---|
| Referenties van Phoxy (gedeelde bibliotheek) | **Basisfoto('s)** met spelers (gedeelde bibliotheek, beheerd door ons) |
| — | **Selfie** van de gebruiker (per generatie, wordt niet bewaard) |
| Scène kiezen | **Positie** kiezen: waar sta je op de foto |
| Rugnummer, detailniveau | **Tenue** (PSV-shirt of eigen kleding), eventueel rugnummer |
| Logo + naam via canvas | PSV-logo + **"Gemaakt met AI"-label** via canvas |
| Prompt: zwart-wit lijntekening | Prompt: fotorealistisch invoegen, spelers onaangetast |

Het model krijgt twee beelden: **beeld 1 = de basisfoto**, **beeld 2 = de selfie**. De
prompt verwijst er expliciet op volgorde naar.

## 2. Wat we hergebruiken

De Replicate-laag in `lib/kleurplaat/` is al model-agnostisch en bevat niets
kleurplaat-specifieks. Die trekken we in stap 1 los, zodat beide tools hem delen:

| Nu | Straks | Waarom |
|---|---|---|
| `lib/kleurplaat/replicate.ts` | `lib/replicate/client.ts` | schema ophalen, voorspelling starten/pollen, `eersteAfbeelding()` |
| `lib/kleurplaat/schema.ts` | `lib/replicate/schema.ts` | `leesProfiel()`, `bouwInput()`, `kiesVerhouding()` |
| `parseerModelId()`, `labelUitId()`, `Model`, `StatusResponse` uit `lib/kleurplaat/index.ts` | `lib/replicate/model.ts` | gedeelde types |
| `app/api/kleurplaat/status/[id]` | blijft, of `app/api/replicate/status/[id]` | pollen is identiek |
| `app/api/kleurplaat/download` | parametriseren (prefix bestandsnaam) of kopiëren | alleen `replicate.delivery`, geen open proxy |
| blob-hulpjes uit `lib/kleurplaat/opslag.ts` (`veiligeNaam`, `extensieVoor`, `mimeVanPad`, data-URL's) | `lib/blob/beelden.ts` | zelfde privé-blob-patroon |
| canvas-compositie `lib/kleurplaat/compositie.ts` | eigen, kleinere `lib/teamfoto/compositie.ts` | logo + AI-label op een foto, geen lijnversie nodig |

`lib/kleurplaat/*` houdt re-exports, zodat de Kleurplaat Creator niet breekt. Deze
refactor is een eigen commit zonder functionele wijziging.

## 3. Nieuwe bestanden

```
app/dashboard/teamfoto/page.tsx              pagina (kop + <TeamfotoCreator />)
components/teamfoto-creator.tsx              de UI
lib/teamfoto/index.ts                        types, modellen, posities, bouwPrompt()
lib/teamfoto/opslag.ts                       basisfoto's in Vercel Blob (privé)
lib/teamfoto/compositie.ts                   logo + AI-label op canvas
app/api/teamfoto/route.ts                    POST: start een generatie
app/api/teamfoto/basisfotos/route.ts         GET/POST/DELETE bibliotheek basisfoto's
app/api/teamfoto/basisfotos/bestand/route.ts privé basisfoto naar de browser
app/api/teamfoto/modellen/route.ts           gedeelde modellenlijst (kopie van kleurplaat)
app/api/teamfoto/model/route.ts              model controleren (kopie van kleurplaat)
docs/teamfoto.md                             documentatie zodra het werkt
```

`lib/tools.ts` blijft ongemoeid: de pagina is alleen bereikbaar via de URL. `middleware.ts`
zet hem automatisch achter de login, omdat hij onder `/dashboard` staat.

## 4. De basisfoto ("system message")

- **Opslag:** Vercel Blob, privé, onder `teamfoto/basisfotos/`. Het zijn spelersfoto's met
  beeldrechten; die horen niet op een openbare URL en ook niet in de repo.
- **Beheer:** in de tool zelf, net als het logo bij de kleurplaat. Er is een kleine
  bibliotheek (max. ~6 foto's) met per foto een label, bijvoorbeeld "Selectie 2026/27 —
  staand". In eerste instantie is er **één actieve** foto; kiezen tussen meerdere is een
  kleine uitbreiding.
- **Metadata per foto** (in de blob-naam of een JSON ernaast): label, verhouding (breedte ×
  hoogte, bij upload in de browser uitgelezen), en een optionele **plaatsingshint** (zie §6).
- **Naar het model:** de server leest de blob en stuurt hem als data-URL mee, net als de
  referenties nu. De browser stuurt alleen het pad.
- Upload verkleind tot max. ~2048px aan de lange kant (hoger dan de 1024px van de
  kleurplaat: gezichten van spelers moeten scherp blijven).

## 5. De selfie

- **Upload** met slepen of kiezen, plus op mobiel `capture="user"` zodat de camera direct opent.
- **In de browser voorbewerken:** EXIF-oriëntatie rechtzetten, verkleinen tot max. 1024px,
  opnieuw coderen als JPEG. Dat haalt meteen alle EXIF-metadata (GPS!) eraf.
- **Geen opslag.** De selfie gaat als data-URL in de body van `POST /api/teamfoto` en de
  server stuurt hem door naar Replicate. Hij komt nooit in Blob. Dat houdt ons buiten
  "we bewaren gezichten"-terrein. Let op de body-limiet van Vercel-functies (4,5 MB):
  een verkleinde JPEG van ~300 KB past ruim.
- **Tips in de UI:** alleen jij in beeld, gezicht recht naar de camera, goed licht, geen zonnebril.
- **Toestemmingsvinkje** vóór het genereren: "Ik upload een foto van mezelf, of van iemand die
  daar toestemming voor gaf." Genereren kan pas als het vinkje aanstaat.

## 6. De prompt

`bouwPrompt()` in `lib/teamfoto/index.ts`, met dezelfde vaste opbouw van breed naar specifiek:

1. **Opdracht:** "Edit the first image, a team photo of PSV Eindhoven football players. Add the
   person from the second image into the photo as one extra team member."
2. **Identiteit:** "Keep the added person's face, facial features, skin tone, hair and age
   exactly as in the second image. It must clearly be recognisable as the same person."
3. **Positie:** uit `POSITIES`, bijvoorbeeld:
   - `achter-midden`: "standing in the back row, in the middle between the players"
   - `links` / `rechts`: "standing at the far left/right end of the row"
   - `vooraan`: "crouching in the front row"
   - `automatisch`: "wherever it looks most natural"
   Plus de optionele plaatsingshint van de basisfoto ("there is a natural gap between the
   third and fourth player from the left").
4. **Tenue:** "wearing the same PSV home shirt as the players" of "wearing their own clothes
   from the second image". Eventueel rugnummer, net als bij de kleurplaat.
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
zou de basisfoto óf de selfie missen. `/api/teamfoto/model` meldt dat als fout, en de
generatieroute weigert zo'n model.

## 8. De UI (`components/teamfoto-creator.tsx`)

Dezelfde twee-kolommenopzet als de kleurplaat, met PSV-componentklassen (`.card__*`,
`.btn`, `.form-group`, `.alert--*`, `.label`) en koppen in `font-heading uppercase`:

**Links: instellingen**
1. **Jouw selfie**: dropzone met voorbeeld, tips en toestemmingsvinkje.
2. **Foto**: de actieve basisfoto als thumbnail. Onder "Beheer" zitten uploaden, verwijderen
   en actief maken, met een plaatsingshint per foto.
3. **Positie**: segmented control of dropdown (`POSITIES`).
4. **Tenue**: PSV-shirt / eigen kleding, plus optioneel rugnummer.
5. **Model**: dropdown en "Model toevoegen" (hergebruik van de kleurplaat-UI; eventueel
   eerst als gedeeld subcomponent `components/replicate/model-kiezer.tsx` uittrekken).
6. **Extra wensen**: vrij tekstveld, max. 400 tekens.
7. **Genereer** (`.btn`), met voortgangsbalk en statustekst tijdens het pollen.

**Rechts: resultaat**
- Het resultaat met een **voor/na-slider** (basisfoto ↔ resultaat), zodat je meteen ziet of de
  spelers onaangetast zijn gebleven.
- Knoppen: **Download PNG**, **Opnieuw** (zelfde instellingen, andere uitkomst), **Prompt tonen**.
- Historie van deze sessie onderaan, net als bij de kleurplaat.

Omdat de uitkomst per keer verschilt, is het optioneel om **2 varianten tegelijk** te vragen
(`num_outputs`/`max_images` als het model dat kent, anders twee voorspellingen parallel).
Dat kost dan wel twee keer zoveel.

## 9. API-flow

```
browser                               Next.js                     Blob        Replicate
  ├─ selfie verkleinen (canvas, JPEG)     │                          │             │
  ├─ POST /api/teamfoto ────────────────▶│ ─ get basisfoto ────────▶│             │
  │  { selfie: dataURL, basisfoto: pad,   │ ─ GET /models/{id} ────────────────────▶│
  │    positie, tenue, model, … }         │ ─ POST /predictions ───────────────────▶│
  │                                       │    image_input: [basis, selfie]         │
  │◀─ { id, prompt, model } ─────────────┤                          │             │
  ├─ GET /api/kleurplaat/status/:id ────▶│ ─ GET /predictions/:id ────────────────▶│
  │◀─ { status, imageUrl } ──────────────┤                          │             │
  ├─ GET …/download?inline=1 ───────────▶│  (canvas: logo + AI-label erop)         │
  └─ download PNG                         │                          │             │
```

Validatie in `POST /api/teamfoto`:
- `requireEmail()` zoals overal.
- `selfie` moet een `data:image/(jpeg|png|webp);base64,`-URL zijn, met een maximale grootte
  (bijv. 3 MB gedecodeerd).
- `basisfoto` moet een pad onder `teamfoto/basisfotos/` zijn (`isBasisfotoPad()`).
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
  deepfake en moet als AI-gegenereerd herkenbaar zijn. Daarom zet de canvasstap standaard een
  klein label "Gemaakt met AI" op de foto, naast het PSV-logo.
- **Misbruik.** Iemand uploadt een foto van een ander, of van iets ongepasts. Het
  toestemmingsvinkje en de login dekken dat intern af. Voor een publieke versie is er meer
  nodig: safety-filter van het model aan, rate limit per bezoeker, en geen vrije promptvelden.
- **Kwaliteit.** Gezichtsgelijkenis wisselt per model, en groepsfoto's met veel kleine koppen
  zijn lastig. Kies bij voorkeur een basisfoto met niet te veel spelers en met ruimte
  voor een extra persoon. Dat is een redactionele keuze, geen code.
- **Kosten.** ± $0,04 per beeld (Nano Banana), hoger bij Pro en gpt-image. Voor intern gebruik
  verwaarloosbaar; bij een publieke campagne is er een rem per bezoeker nodig.

## 11. Bouwvolgorde

| Stap | Wat | Oplevering |
|---|---|---|
| 1 | Replicate- en blob-laag loskoppelen naar `lib/replicate/` en `lib/blob/`, kleurplaat via re-exports | kleurplaat werkt ongewijzigd, `npm run build` groen |
| 2 | `lib/teamfoto/index.ts`: types, `POSITIES`, `TENUES`, `AANBEVOLEN_MODELLEN`, `bouwPrompt()` | promptbouwer met vaste opbouw |
| 3 | Basisfoto-opslag + routes `basisfotos` en `basisfotos/bestand` | foto uploaden, tonen en verwijderen |
| 4 | `POST /api/teamfoto` met validatie, 2-beeldencheck en vaste volgorde | generatie start, status via bestaande route |
| 5 | `app/dashboard/teamfoto/page.tsx` + `components/teamfoto-creator.tsx` (selfie, basisfoto, positie, tenue, model, genereren, resultaat) | end-to-end werkend achter de login, niet in de sidebar |
| 6 | `lib/teamfoto/compositie.ts`: logo en "Gemaakt met AI"-label, download als PNG | nette download met bestandsnaam `psv-teamfoto-….png` |
| 7 | Voor/na-slider, varianten, historie | afwerking |
| 8 | Testronde met 3 modellen × ~10 selfies (verschillende huidskleuren, leeftijden, brillen en licht), prompt bijschaven | keuze voor standaardmodel |
| 9 | `docs/teamfoto.md` + eventueel toevoegen aan `lib/tools.ts` | pas na akkoord |

Stap 1 t/m 5 is het minimum om intern te kunnen testen. De stappen 3 en 4 kunnen parallel.

## 12. Later (buiten dit plan)

- Publieke versie onder `/share/teamfoto` met rate limit en zonder vrije tekst. Kan op een
  Playable-campagnepagina worden ingebed.
- Meerdere basisfoto's om uit te kiezen (per seizoen of per gelegenheid, zoals de huldiging).
- Modus "neem de plek in van…" met een face-swap-model, alleen met expliciet akkoord.
- Printklaar formaat, of een frame met datum en wedstrijd eromheen.
