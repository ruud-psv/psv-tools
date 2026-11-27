# Playable loader (test)

Beta tool op `/dashboard/playable-loader`. De API van Playable kan de code van
een campagnepagina niet lezen of schrijven (zie [playable-api.md](playable-api.md)).
Daarom draait het om: de code staat in PSV Tools, en Playable laadt hem van
Bunny.

## Hoe het werkt

1. In Playable staat in het `html-element` van de campagne één keer een vast
   stukje code: een lege `<div id="psvk-mount">` en een script dat
   `https://psveindhoven.b-cdn.net/playable/pages/<campagne-ID>/page.js` laadt.
2. In PSV Tools plak of bewerk je de HTML, CSS en JS van de pagina en klik je
   op **Publiceren**. PSV Tools zet de Kit erbij (die staat in
   `lib/playable-loader/kit.ts`), maakt er één bestand van en zet dat op Bunny.
3. Het script in Playable haalt dat bestand op en zet de pagina in de
   `div`. Bouwt Playable het blok opnieuw op, dan zet de bundel de pagina
   terug en start de Kit opnieuw.

De bron (wat de collega invulde) staat in Vercel Blob onder
`playable-loader/<campagne-ID>/huidig.json`, en elke publicatie los onder
`versies/`, zodat we later kunnen terugdraaien.

Bunny bewaart `page.js` in zijn cache en negeert de `?v=` die het script
meestuurt; dat bleek bij de eerste test (de demo toonde een oudere versie).
Daarom leegt PSV Tools na elke publicatie de cache van Bunny voor dat ene
bestand. Daarvoor staat in Vercel `BUNNY_API_KEY`: de API-sleutel van het
Bunny-account (Account settings, API), niet de sleutel van de opslag. Ontbreekt
die, dan publiceert PSV Tools wel maar meldt het dat de cache niet is geleegd;
leeg hem dan in Bunny bij de pull zone onder Purge, met het adres van
`page.js`.

## Meer html-blokken, bijvoorbeeld met een formulier ertussen

Staat er in Playable iets van Playable zelf tussen de pagina, zoals een
formulier, dan is de pagina daar verdeeld over meer html-elementen (boven en
onder het formulier). In PSV Tools is dat één HTML met **html-blokken**,
gescheiden door `<!-- psvk-deel -->`. In de stap Code heeft elk blok een eigen
veld, met **Html-blok toevoegen**; CSS en JavaScript zijn er één keer, voor
alle blokken samen.

- Blok 1 komt in `#psvk-mount` (het eerste html-element, met het script dat
  de bundel laadt), blok 2 in `#psvk-mount-2`, enzovoort. In de andere
  html-elementen staat alleen die ene `div`; hun CSS- en JS-veld zijn leeg.
  Onder **Eenmalig in Playable** staat per html-element wat erin moet.
- Laadt Playable een blok later, of bouwt het een blok opnieuw op, dan zet de
  bundel het (terug) zodra de `div` er is.
- De Kit start op het eerste `#psvk-app` van de pagina. Heeft elk blok een
  eigen `#psvk-app`, dan start de bundel de Kit voor elk blok apart (de andere
  heten daarvoor heel even anders). Zo werken ook de uitklappers onder het
  formulier. `psvk:ready` komt dan per blok, met dat blok in `e.detail.root`.
- Stond de Kit in Playable in de JS of CSS van elk html-element, dan haalt
  PSV Tools elke kopie eruit en zet hem er één keer bij.
- Het voorbeeld toont de blokken onder elkaar, met een grijs vak waar in
  Playable het formulier staat. Aanwijzen en Bewerken werken in elk blok;
  Claude krijgt bij een aangewezen onderdeel "html-blok 2" mee en laat de
  scheidingen staan.

Een pagina met een formulier toevoegen, zoals 243381:

1. Maak op Bunny de map `playable/pages/<campagne-ID>` aan en open de
   campagne in PSV Tools (Vernieuwen in de eerste stap).
2. Stap Code: plak het bovenste html-element in html-blok 1, klik op
   **Html-blok toevoegen** en plak het onderste in html-blok 2. De CSS en JS
   van beide elementen onder elkaar in CSS en JavaScript. Publiceer.
3. Zet in Playable per html-element de code van **Eenmalig in Playable**, en
   laat het formulier ertussen staan. Kijk op de demo.

## Stappen

De pagina werkt in vier stappen, naar het voorbeeld van een flow in Maileon.
In de stappenbalk is rood de stap waar je bent, groen klaar, oranje vraagt
aandacht (het concept wijkt af van live, of Bunny geeft niet de laatste
versie) en grijs komt nog.

1. **Campagne**: ID invullen of een campagne kiezen. Alleen campagnes die
   volgens het **stramien op Bunny** staan zijn te openen: met een map
   `playable/pages/<campagne-ID>` in de opslag van Bunny. Een ander ID kan
   niet worden geopend (de knop Openen gaat uit, en de server weigert het ook
   bij openen en publiceren). Een nieuwe campagne erbij: maak in Bunny de map
   `playable/pages/<campagne-ID>` aan en klik op **Vernieuwen**.
   Bovenaan staan je eigen recente campagnes: die waar jij op hebt
   gepubliceerd (per collega in Blob onder `playable-loader/gebruikers/`, met
   een hash van het e-mailadres); staat er een niet (meer) op Bunny, dan is
   hij grijs. Daaronder de andere campagnes op Bunny, met de laatste
   publicatie uit PSV Tools of anders de naam uit Playable
   (`/api/playable-loader/campagnes`). Wat je alleen in de chat aanpast wordt
   niet bewaard, dus dat staat er niet in. Bij het openen controleert PSV
   Tools:
   - of Playable de campagne kent (naam, actief of niet, links naar demo en
     live; recht `campaigns.view`). Een onbekend ID zonder pagina in PSV Tools
     opent niet;
   - welke versie Bunny geeft, dus wat de demo en de livepagina laden,
     vergeleken met de laatste publicatie in PSV Tools. Is die ouder, dan
     staat er een knop om de cache te legen.
   Of het vaste stukje code in Playable staat, kan PSV Tools niet zien: de API
   van Playable kijkt niet in het `html-element`.
2. **Aanpassen**: de chat met Claude en het voorbeeld van het concept. Het
   voorbeeld staat standaard op **Passend**: zo breed als er naast de chat
   ruimte is, op ware grootte; de hoogte volgt het scherm en het voorbeeld
   blijft in beeld als je scrolt. Daarnaast vaste breedtes: Desktop (1920,
   1440, 1280 px), Tablet (1024, 768) of Mobiel (430, 390, 360). Die vallen in
   de verschillende breekpunten van de Kit; past een breedte niet, dan wordt
   het voorbeeld verkleind getoond. **Groot scherm** legt het voorbeeld over
   de hele pagina (Esc of Terug sluit het).
3. **Publiceren**: het concept live zetten, met daarna meteen opnieuw de
   controle van Bunny.
4. **Code**: de HTML, CSS en JS zelf, en het vaste stukje voor Playable.

Het campagne-ID staat in de adresbalk (`?campagne=244347`), zodat de campagne
open blijft na verversen.

## Aanpassen met Claude

Bovenaan de pagina zegt een collega in gewone taal wat er anders moet. Claude
(`claude-opus-5-5`, zie `lib/playable-loader/assistent.ts`) krijgt de regels
en de naslag van de Kit (uit de skill playable-page-builder, via
`scripts/kit-bijwerken.mjs` in `lib/playable-loader/skill.ts`) en de huidige
code zonder de Kit, en geeft gerichte wijzigingen terug: per veld een stuk
code dat er precies één keer in staat, en wat ervoor in de plaats komt.

- PSV Tools voert de wijzigingen uit op het **concept**, niet op wat live
  staat. Alles of niets: past één wijziging niet, of klopt de JavaScript daarna
  niet, dan krijgt Claude de fout terug en probeert het opnieuw (maximaal drie
  keer).
- Naast de chat staat een **voorbeeld** van het concept, op desktop- en
  mobielbreedte, met dezelfde bundel die op Bunny komt. Zonder de opmaak van
  Playable zelf, dus kijk na het publiceren op de demo.
- **Aanwijzen**: zet je het voorbeeld op Aanwijzen, dan krijgt wat onder de
  muis zit een kader, en kies je met een klik een onderdeel. Links en knoppen
  doen in die stand niets; Esc stopt. Boven het invoerveld staat dan wat je
  koos, met de lagen erboven (bijvoorbeeld kop › blok › sectie) om een groter
  stuk te kiezen. Bij je volgende vraag krijgt Claude het onderdeel mee: het
  pad in de pagina, de tekst en de HTML zoals de browser hem toont (zie
  `lib/playable-loader/selectie.ts`). Zo slaat "maak deze knop donker" op die
  ene knop. De keuze blijft staan tot je hem weghaalt; na een wijziging zoekt
  het voorbeeld hetzelfde onderdeel terug, en lukt dat niet zeker, dan
  vervalt de keuze. Bij eerdere vragen gaat alleen het pad mee.
- **Bestand**: onder de chat zet je een foto of ander bestand (jpg, png, webp,
  avif, gif, svg, pdf, mp4 of webm, hooguit 4 MB) op Bunny, in
  `playable/editor/`. Het adres komt in je vraag, zodat Claude het kan
  gebruiken ("zet deze foto in de hero"). De naam op Bunny begint met het
  campagne-ID en de tijd, bijvoorbeeld
  `244347-20261120-143005-a1b2c3-hero-foto.jpg`, zodat er nooit iets wordt
  overschreven (`/api/playable-loader/upload`, `lib/playable-loader/bunny.ts`).
- **Ongedaan maken** zet het concept terug naar voor de laatste wijziging.
- Pas **Publiceren** zet het live.
- Vraagt de collega iets wat niet kan of onduidelijk is, dan vraagt Claude door
  en verandert er niets.

## Zelf bewerken in het voorbeeld

Naast **Aanwijzen** staat **Bewerken**: zelf iets aanpassen zonder Claude,
zoals bij Bewerken in de stukken van de Assistent. Klik een onderdeel aan in
het voorbeeld; er verschijnt een werkbalk bij:

| Knop | Wat het doet |
|---|---|
| Potlood | De tekst ter plekke typen. Enter bewaart, Esc annuleert, Shift+Enter is een nieuwe regel; buiten de tekst klikken bewaart ook. Dubbelklikken op een tekst begint meteen. |
| Foto | Een andere foto: uploaden naar Bunny (`playable/editor/`), slepen, of een adres plakken, met de alt-tekst. Werkt op een `<img>` (ook als het de enige foto in een blok is) en op een achtergrond in het `style`-attribuut. |
| Link | Een ander adres voor een link of knop, en wel of niet in een nieuw tabblad. |
| Pijlen | Het onderdeel omhoog of omlaag in zijn blok. |
| Dupliceren | Een kopie direct eronder. |
| Prullenbak | Het onderdeel weghalen. |
| Stippelvak | Het blok eromheen kiezen (bijvoorbeeld de hele kaart in plaats van de kop). |

Elke wijziging komt in het concept, als regel in de chat (die gaat niet mee
naar Claude) en is terug te draaien met **Ongedaan maken**, ook bovenin het
voorbeeld. Pas Publiceren zet het live.

Hoe het werkt (`lib/playable-loader/bewerken.ts`): in het voorbeeld krijgt
elke starttag uit de bron een nummer (`data-psvk-bron`), het hoeveelste
element in de HTML. Een aangeklikt element wijst zo altijd naar zijn eigen
plek in de bron, ook als de Kit er klassen bij zet. De bewerkingen zijn
tekstbewerkingen op precies die tag; de rest van de HTML blijft letter voor
letter staan. Op Bunny komen de nummers niet.

Wat niet kan, staat grijs met de reden erbij, en dan vraag je het Claude:

- een tekst die de pagina zelf verandert (zoals een teller), want dan klopt
  wat je ziet niet met de bron;
- een onderdeel dat de JavaScript zelf maakt;
- een achtergrond die in de CSS staat in plaats van in de HTML;
- een stuk HTML dat niet netjes is afgesloten.

Na een wijziging bouwt het voorbeeld opnieuw op, op dezelfde scrollpositie en
met hetzelfde onderdeel gekozen. Bij alleen een andere tekst hoeft dat niet.

Het gesprek staat alleen in de browser; na verversen begint het opnieuw. Per
vraag logt de route het aantal tokens, om de kosten te volgen. Met Opus 5.5
($4 in, $20 uit per miljoen tokens) is dat bij een pagina als 244347 een paar
dubbeltjes per wijziging (een schatting, nog niet gemeten). Sonnet 5.5 kost de
helft; dat is de constante `MODEL`.

## Testen met campagne 244347

1. Open **Beta tools → Playable loader** en open campagne 244347.
2. Plak de huidige inhoud van de drie velden van het `html-element` uit
   Playable in de drie velden en klik op **Publiceren**. Zo is de huidige
   pagina bewaard.
3. Vervang in Playable de inhoud van de drie velden door de drie blokken onder
   **Eenmalig in Playable** en sla op.
4. Open de demo. Controleer:
   - staat de pagina er, met de juiste opmaak en lettertypes;
   - werken de knoppen, uitklappers en de plakkende kop, ook op mobiel;
   - geeft de browserconsole geen fout met `[psvk]`.
5. Pas in PSV Tools een tekst aan, publiceer opnieuw en ververs de demo na een
   halve minuut. Komt de nieuwe tekst door? Geeft PSV Tools een gele melding
   over de cache, dan staat `BUNNY_API_KEY` niet (goed) in Vercel.

Lukt stap 4 niet, kijk dan in de console of Playable het script van
`psveindhoven.b-cdn.net` blokkeert. Terug naar de oude situatie: plak de
bewaarde code weer in de drie velden in Playable.

## Waar je op let

- **Publiceren is meteen live** op elke campagne waar de loader in staat. Er
  is nog geen voorbeeld en geen akkoordstap; die horen erbij voordat dit
  breder gebruikt wordt.
- **Wie publiceert, zet JavaScript op club.psv.nl.** De tool staat bij de
  beta tools, en die ziet standaard iedereen. Beperk de toegang in
  Beheer > Gebruikers voordat er een live campagne aan hangt.
- **Valt Bunny weg of zit er een fout in de JS, dan is de pagina leeg.**
  PSV Tools weigert JavaScript die niet te lezen is, maar een fout die pas in
  de browser optreedt, vangt hij niet.

## Kit bijwerken

Heeft de skill playable-page-builder een nieuwe versie van de Kit:

```bash
node scripts/kit-bijwerken.mjs <map-van-de-skill>
```

en publiceer de pagina's daarna opnieuw.
