# Database

De tool op `/dashboard/database` legt een campagne-export naast de SSO-database en
telt uit hoeveel deelnemers een nieuw record waren en hoeveel we al kenden.

## Wat er wordt geteld

Voor elk uniek SSO-ID in een campagne-export:

| Uitkomst | Regel |
|---|---|
| **Nieuw** | Het ID staat in de bron met een aanmaakdatum **op of na de startdatum** van de campagne |
| **Bestaand** | Het ID staat in de bron met een aanmaakdatum **vóór de startdatum** |
| **Onbekend** | Het ID staat niet in de bron |

Start een campagne op 1 juli, dan telt een account dat op 1 juli of later is
aangemaakt als opbrengst van die campagne. Ligt de aanmaakdatum ervoor, dan kenden we
die persoon al. Een account dat ná de einddatum is aangemaakt telt ook als nieuw — de
deelnemer is dan wel via de campagne binnengekomen, alleen wat later.

Daarnaast wordt per campagne bijgehouden:

- **Deelnames** — het aantal bruikbare regels in de export.
- **Unieke deelnemers** — het aantal verschillende SSO-ID's. Wie drie keer meedeed
  telt hier één keer, en telt ook maar één keer mee als nieuw of bestaand.

Dit is bewust niet waterdicht. Iemand kan vlak vóór de campagne een account hebben
aangemaakt en pas erna hebben meegedaan; die telt hier als bestaand. Andersom kan
iemand toevallig in dezelfde periode een account hebben aangemaakt zonder dat de
campagne daar iets mee te maken had. Op grote aantallen geeft het een bruikbaar beeld,
niet een exacte attributie.

## Onbekend is een signaal, geen restcategorie

"Onbekend" betekent bijna altijd dat de bronexport ouder is dan de campagne: de
deelnemers die zich tijdens de campagne registreerden staan er dan simpelweg nog niet
in. **Nieuw** is in dat geval te laag en **onbekend** te hoog.

De tool waarschuwt daarvoor zodra het nieuwste account in de bron ouder is dan de
einddatum van de campagne. Upload dan een verse export en analyseer opnieuw.

Blijft er een klein aantal onbekend bij een verse bron, dan gaat het om verwijderde
accounts of om ID's die niet uit de SSO-database komen.

## Bestandsformaat

Beide uploads verwachten hetzelfde: een tekstbestand met per regel een SSO-ID en een
datum. Verder is er veel speling.

- **Scheidingsteken**: tab, puntkomma of komma — wordt geraden uit de eerste regel.
- **Codering**: UTF-8 (met of zonder BOM) of Windows-1252 — wordt geraden uit de
  eerste 64 kB, zodat een Excel-export met accenten niet sneuvelt.
- **Koptekst**: optioneel. Kolomnamen als `SSO ID`, `Creation Date`, `Aanmaakdatum`,
  `Deelnamedatum` worden herkend; zonder koptekst wordt de eerste kolom het ID en de
  tweede de datum. Bij de bron-upload kun je de kolomkeuze corrigeren voordat je
  opslaat.
- **Datums**: `D-M-YYYY`, `DD-MM-YYYY` en `YYYY-MM-DD`, met of zonder tijd erachter.
- **Extra kolommen** worden genegeerd en verlaten je apparaat niet.

Regels zonder ID of zonder leesbare datum worden overgeslagen en apart geteld in het
rapport, zodat je ziet of er iets mis is met het bestand.

## Hoe de gegevens worden opgeslagen

Het bestand wordt **in de browser** gelezen, niet op de server. Dat moet ook: een
bronexport van een miljoen regels is tientallen MB's en een serverless function neemt
maximaal ~4,5 MB request body aan.

Wat er wél omhoog gaat is een compacte index — per record acht bytes:

```
[ 48 bits hash van het SSO-ID ][ 16 bits dagnummer sinds 2000-01-01 ]
```

De SSO-ID's zelf worden dus nergens opgeslagen, alleen een onomkeerbare hash. Dat is
genoeg om te vergelijken en om de overlap tussen campagnes te tellen, maar niet om
terug te rekenen naar een persoon. Een miljoen records is daarmee 8 MB, dat in stukken
van 3 MB wordt verstuurd.

Op Vercel Blob:

```
database/source/versions.json           alle uploads + welke actief is
database/source/<versionId>/part-N.bin  de index van die upload, in shards
database/campaigns/<id>.json            titel, periode en de laatste uitkomst
database/campaigns/<id>.bin             de index van de deelnemers
```

## Een nieuwe bron uploaden

Je uploadt steeds een volledig nieuw bestand; dat vervangt de bron. Oude versies
blijven bewaard met hun aantallen, zodat de grafiek "Uploads" de groei tussen
bestanden kan tonen. Een oude versie kun je verwijderen als je de opslag wilt
opruimen; de actieve versie kan niet weg.

Na een nieuwe bron staan alle campagne-uitkomsten op **verouderd**. Eén knop telt ze
allemaal opnieuw. Aanmaakdatums veranderen niet, dus in de praktijk verschuiven alleen
deelnemers die eerder onbekend waren.

## Groei van de database

Er zijn twee grafieken, en ze beantwoorden verschillende vragen:

- **Groei van de database** komt uit de aanmaakdatums in de huidige export: nieuwe
  accounts per maand, met het cumulatieve totaal eroverheen. Die is er dus meteen na
  de eerste upload, over de volle historie.
- **Uploads** zet de bestanden die je hebt geüpload naast elkaar. Die wordt pas
  interessant vanaf de tweede upload, maar laat wel de werkelijke stand per meetmoment
  zien — inclusief accounts die tussentijds zijn verwijderd.

## Overlap tussen campagnes

Het tabblad Overzicht toont per campagnepaar hoeveel dezelfde mensen aan beide
meededen, plus de verdeling "meegedaan aan 1 / 2 / 3+ campagnes". Omdat er alleen
hashes zijn opgeslagen zijn dit aantallen; wie het precies waren is hier niet te zien.

## Later: via een API in plaats van uploads

`lib/database/source-store.ts` is de naad. Komen de records straks via een API binnen,
dan verandert alleen hoe de index gevuld wordt; `readSourceIndex()` en alles daarboven
— de analyse, de overlap, de schermen — blijven zoals ze zijn.
