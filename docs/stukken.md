# Stukken: rapporten en slide decks uit de assistent

Vraag je in de assistent om een rapport, een one-pager, een presentatie of "iets om te delen", dan
maakt de assistent een **stuk** bij het gesprek. Onder het invoerveld staan ook knoppen: **Maak van
dit gesprek een rapport / slide deck**. Is er al een stuk, dan zet de knop het om naar de andere
soort. Het staat naast de chat (op kleinere schermen achter de
knop **Stuk**) en werkt meteen bij als je in de chat om een aanpassing vraagt. Is het goed, dan
deel je het met een link of druk je het af als PDF.

## Hoe het werkt

- **Vaste blokken, geen vrije HTML.** Een stuk bestaat uit blokken: kop, tekst, kerngetallen,
  tabel, grafiek en conclusie. PSV Tools zet die in de huisstijl op het scherm. Zo ziet het er
  altijd uit als PSV, draait er op een gedeelde link geen code van het model, en kan één blok
  worden aangepast zonder de rest.
- **Twee soorten, dezelfde blokken.** Een *rapport* is een pagina; een one-pager is gewoon een kort
  rapport met halve blokken naast elkaar. Een *slide deck* zet dezelfde blokken op slides van
  1280 × 720 (zie hieronder). Wisselen kan met de schakelaar boven het stuk, zonder de assistent:
  de inhoud blijft gelijk. Oude stukken met soort "onepager" worden bij het lezen een rapport.
- **Opmaak per blok.** Los van de inhoud heeft elk blok een optionele vorm: *grootte* (half naast
  een ander half blok, heel, of groot), *achtergrond* (wit, grijs, rood, zwart), *nadruk* (de reeks,
  rij of het kerngetal dat eruit springt) en een *kernboodschap* (een korte stelling: de titel van
  de slide, of een kop boven het blok in een rapport). Vraag je in de chat "maak de grafiek groter"
  of "zet de conclusie op zwart", dan past de assistent alleen de opmaak aan (actie `opmaken`). Een
  nadruk die niet in het blok bestaat, wordt geweigerd; verandert de inhoud later, dan valt hij weg.
- **Bijschaven via de chat.** De assistent heeft twee tools: `stuk_maken` (een nieuw stuk, of de
  hele inhoud vervangen) en `stuk_bijwerken` (blokken toevoegen, wijzigen, opmaken, verwijderen of
  verplaatsen, en de titel of soort aanpassen). Alles of niets: klopt één bewerking niet, dan verandert er
  niets en krijgt het model te horen waarom. Bij elke vraag krijgt het model het huidige stuk mee,
  zodat het weet welke blokken er zijn.
- **Terugvinden.** In de lijst met gesprekken staat een icoon bij gesprekken met een stuk.
- **Versies.** Elke wijziging is een nieuwe versie. Met **Vorige** ga je een stap terug, zoals
  ongedaan maken; de laatste 20 versies blijven bewaard.
- **Cijfers alleen uit het gesprek.** De instructies verbieden het model getallen te gebruiken die
  het niet met een tool heeft opgehaald. Elk blok met cijfers heeft een verplichte bron (bron en
  periode); onderaan het stuk staan alle bronnen en de peildatum.

## Slide deck

`slidesVan` in `lib/stukken/model.ts` bepaalt welk blok op welke slide komt:

- Eerst een titelslide (zwart met de rode schuine wig), aan het eind een slide met de bronnen.
- Een **kop** wordt geen slide, maar het hoofdstuk (klein, rood) boven de slides erna.
- Elk ander blok krijgt een eigen slide, met de kernboodschap als titel. Zonder kernboodschap: de
  titel van de grafiek of tabel, "In cijfers" of "Conclusie".
- **Twee halve blokken na elkaar** delen één slide; een kop ertussen breekt het paar.
- Een **conclusie** staat standaard op rood; de rest op wit, tenzij de opmaak iets anders zegt.
- Het uitgelichte kerngetal staat groot op zwart; de uitgelichte rij in een tabel en de uitgelichte
  reeks in een grafiek zijn rood, de andere reeksen neutraal.

Op het scherm worden de slides geschaald naar de breedte van het paneel. **Afdrukken** maakt van
elke slide een pagina van 1280 × 720 (`@page deck` in `app/globals.css`), dus "Opslaan als PDF"
geeft een PDF die je kunt presenteren. De vormregels komen uit
`packages/psv-branding/open-design/psv/DESIGN.md`.

## Zelf bewerken

Klik in het paneel op **Bewerken** (tijdens een antwoord van de assistent kan dat niet):

- **Klik op een blok** en het wordt ter plekke een invulvorm: tekst, kop, kerngetallen (label,
  waarde, toelichting), conclusiepunten, tabelcellen met rijen en kolommen, of de data van een
  grafiek (labels, reeksen, lijn of staven, eenheid). Getallen typ je zoals je gewend bent:
  "1.400", "12,4" of "€ 374.610". **Opslaan** maakt er een nieuwe versie van.
- **Titel en ondertitel** pas je direct aan; ze worden opgeslagen als je het veld verlaat of op
  Enter drukt. Bovenin wissel je tussen rapport en slide deck.
- **Per blok** kun je omhoog, omlaag, de opmaak aanpassen (het penseel) en verwijderen. Tussen de blokken staat **Blok toevoegen**.
  Een nieuw blok begint met voorbeeldinhoud en gaat meteen open.
- **Dezelfde regels als de assistent.** De server controleert je wijziging met dezelfde regels
  (`PATCH /api/assistent/stukken/<id>`, `handmatigBewerken` in `lib/stukken/model.ts`), en het
  model ziet je wijzigingen bij je volgende vraag. Zo kun je afwisselen: zelf iets aanpassen en de
  assistent iets laten toevoegen.
- **Geen wijzigingen over elkaar heen.** Elke wijziging gaat uit van de versie die je voor je had.
  Heeft de assistent het stuk intussen veranderd, dan wordt jouw wijziging niet opgeslagen en zie
  je de nieuwste versie, met een melding.
- **Cijfers die je zelf aanpast**, worden niet tegen de bron gecontroleerd. Een nieuw blok met
  cijfers krijgt als bron "Handmatig ingevuld"; pas die aan als het ergens vandaan komt. De
  peildatum verandert niet bij een eigen wijziging.

## Delen

**Delen** maakt een link: `/share/stuk/<id>`, met een willekeurig id dat niet te raden is.

- **Een momentopname.** De link toont de versie van het moment van delen. Pas je het stuk daarna
  aan, dan zie je in het paneel dat de link een oudere versie toont, met **Link bijwerken**.
  De link kan nooit bij live data of bij de rest van PSV Tools.
- **Alleen collega's** (standaard): wie de link opent, moet ingelogd zijn in PSV Tools. Na het
  inloggen kom je op het dashboard; open de link dan opnieuw.
- **Openbaar**: iedereen met de link, ook buiten PSV. Alleen met een verloopdatum (standaard 30
  dagen, hooguit een jaar). Denk na voor je bedrijfscijfers openbaar deelt.
- **Intrekken** maakt de link meteen ongeldig. Verwijder je het gesprek, dan gaan het stuk en de
  link ook weg.
- De titel van een stuk staat niet in de metadata van de deelpagina, zodat een linkvoorbeeld in
  Teams of Slack hem niet toont.

## Afdrukken

**Afdrukken** opent het stuk op `/stuk/<id>`, zonder de rest van PSV Tools eromheen. Kies daar
**Afdrukken of PDF** en in het afdrukvenster eventueel "Opslaan als PDF". Alleen de maker kan deze
pagina openen. De gedeelde link heeft dezelfde knop.

## Bestanden

| Onderdeel | Bestand |
|---|---|
| Blokken, controle, bewerkingen en versies | `lib/stukken/model.ts` (met tests) |
| Regels voor deellinks | `lib/stukken/delen.ts` (met tests) |
| Opslag in Vercel Blob (`stukken/<hash e-mail>/<gesprek>.json`, `stukken-delen/<id>.json`) | `lib/stukken/store.ts` |
| De tools van de assistent | `lib/assistent/stukken-tools.ts` (met tests) |
| API's: stuk, lijst, vorige versie, delen | `app/api/assistent/stukken/*` |
| Weergave van een rapport | `components/stuk/stuk-weergave.tsx` |
| Weergave als slide deck | `components/stuk/deck-weergave.tsx` |
| Verdeling van de y-as | `lib/stukken/as.ts` (met tests) |
| Het paneel naast de chat | `components/stuk/stuk-paneel.tsx` |
| Zelf bewerken in het voorbeeld | `components/stuk/stuk-bewerker.tsx`, `lib/stukken/bewerken.ts` (met tests) |
| De deellink en de afdrukpagina | `app/share/stuk/[id]/page.tsx`, `app/stuk/[id]/page.tsx` |

## Nog niet

- Export naar PowerPoint (bewerkbaar). Een deck gaat nu als PDF.
- HTML-export van een deck, om in Open Design verder te ontwerpen.
- Cijfers in een bestaand stuk verversen.
- Na het inloggen terug naar de gedeelde link.
