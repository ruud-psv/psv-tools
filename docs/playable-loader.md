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

## Stappen

De pagina werkt in vier stappen, naar het voorbeeld van een flow in Maileon.
In de stappenbalk is rood de stap waar je bent, groen klaar, oranje vraagt
aandacht (het concept wijkt af van live, of Bunny geeft niet de laatste
versie) en grijs komt nog.

1. **Campagne**: ID invullen of een campagne kiezen uit de lijst met recent
   gepubliceerde. Bij het openen controleert PSV Tools:
   - of Playable de campagne kent (naam, actief of niet, links naar demo en
     live; recht `campaigns.view`). Een onbekend ID zonder pagina in PSV Tools
     opent niet;
   - welke versie Bunny geeft, dus wat de demo en de livepagina laden,
     vergeleken met de laatste publicatie in PSV Tools. Is die ouder, dan
     staat er een knop om de cache te legen.
   Of het vaste stukje code in Playable staat, kan PSV Tools niet zien: de API
   van Playable kijkt niet in het `html-element`.
2. **Aanpassen**: de chat met Claude en het voorbeeld van het concept, op
   Desktop (1920, 1440, 1280 px), Tablet (1024, 768) of Mobiel (430, 390,
   360). Die breedtes vallen in de verschillende breekpunten van de Kit; een
   breed scherm wordt verkleind getoond.
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
- **Ongedaan maken** zet het concept terug naar voor de laatste wijziging.
- Pas **Publiceren** zet het live.
- Vraagt de collega iets wat niet kan of onduidelijk is, dan vraagt Claude door
  en verandert er niets.

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
  Gebruikersbeheer voordat er een live campagne aan hangt.
- **Valt Bunny weg of zit er een fout in de JS, dan is de pagina leeg.**
  PSV Tools weigert JavaScript die niet te lezen is, maar een fout die pas in
  de browser optreedt, vangt hij niet.

## Kit bijwerken

Heeft de skill playable-page-builder een nieuwe versie van de Kit:

```bash
node scripts/kit-bijwerken.mjs <map-van-de-skill>
```

en publiceer de pagina's daarna opnieuw.
