# Naamconventie — Paid Ads

Het Paid Ads dashboard (`/dashboard/paid-ads`) splitst campagnes uit naar exploitatie,
funnelfase, doelgroeptype en advertentieformat. Geen enkel advertentieplatform levert die
velden aan: Meta, Google, TikTok en LinkedIn kennen ze niet. Het dashboard leidt ze af uit de
**naam** van de campagne, de advertentieset en de advertentie.

Hoe consequenter de naamgeving, hoe scherper het dashboard. Wat niet in de naam staat, kan
nergens vandaan komen — een advertentie die `AD | A` heet, kan onmogelijk in de
formatvergelijking belanden.

De vertaalregels staan op één plek: `lib/paid-ads/mapping.ts`.

## De conventie

Scheidingsteken is de **pipe** (`|`), met spaties eromheen. Niet het streepje: dat komt ook
binnen namen voor (`DMID26-11694`, `t/m 14 juli`, `- Kopie`), waardoor niet te bepalen is waar
een veld begint of eindigt.

### Campagne

```
PSV | <Exploitatie> | <Fase> | <Campagne> | <DMID>
```

```
PSV | Ticketing | Conversie | CL Shakhtar     | DMID26-18497
PSV | Mijn PSV+ | Conversie | Gratis Magazine | DMID26-10478
PSV | Campus    | Bereik    | Stadiontour     | DMID26-15201
```

Het vierde deel — *Campagne* — is wat het dashboard gebruikt om dezelfde actie over meerdere
kanalen heen bij elkaar op te tellen. Houd die tekst identiek op Meta, Google, TikTok en
LinkedIn, dan vult de weergave "Campagne totaal — alle platformen" zich vanzelf.

Het DMID-nummer erachter wordt niet gelezen door het dashboard, maar blijft handig voor
mensen. Zet het wel als eigen deel achter de campagnenaam, niet erin: anders telt het mee als
onderdeel van de campagnenaam en mislukt het koppelen tussen kanalen.

### Advertentieset

```
SET | <Doelgroeptype> | <Omschrijving>
```

```
SET | Interesse   | Niet-leden met baby's
SET | Database    | Nieuwe Mijn PSV+ leden
SET | Broad       | Eindhoven en omliggende dorpen
SET | Retargeting | Websitebezoekers 30 dagen
```

De omschrijving is vrije tekst voor de collega die in Ads Manager kijkt. Het doelgroeptype
ervoor is wat het dashboard leest.

### Advertentie

```
AD | <Format> | Hook: <naam> | <Variant>
```

```
AD | Video 9:16   | Hook: Bekende speler | A
AD | Statisch 1:1 | Hook: Prijsvoordeel  | B
```

De variantletter blijft zoals hij nu is; er komt alleen betekenis vóór. Zonder format is de
Creative Intelligence-weergave leeg, en zonder hook werkt de hookvergelijking niet.

## Toegestane waarden

Andere woorden zijn niet verboden, maar worden niet herkend — de campagne belandt dan onder
"Overig" of blijft leeg.

| Veld | Waarden |
|---|---|
| Exploitatie | `Ticketing` · `Merchandise` · `Mijn PSV+` · `PSV Business` · `Museum & Tours` · `Campus` · `Esports` · `Vitality` |
| Fase | `Bereik` · `Verkeer` · `Conversie` |
| Doelgroeptype | `Broad` · `Interesse` · `Lookalike` · `Retargeting` · `Database` |
| Format | `Video 9:16` · `Video 1:1` · `Video 16:9` · `Carousel` · `Collection` · `Statisch 1:1` · `Search tekst` · `Display` |

**De exploitatie is waar de campagne vóór is, niet wie hem maakt.** "PSV Marketing & Media" is
een afdeling en geen exploitatie; campagnes die zo beginnen vallen terug op trefwoorden verderop
in de naam.

## Als je afwijkt

Het dashboard valt in dat geval terug op trefwoordherkenning over de hele naam. Dat werkt vaak,
maar is een benadering:

- `PSV Kaartverkoop - CL - Shakhtar` wordt herkend als Ticketing, via "kaart".
- `PSV Marketing & Media - Vacatures horeca` wordt niets, en komt onder "Overig".

Campagnes onder "Overig" verdwijnen niet uit het dashboard — ze vallen juist op. Dat is bewust:
een campagne die buiten de conventie valt hoort zichtbaar te zijn, niet stilletjes bij een
verkeerde exploitatie opgeteld te worden.

De fase wordt bij afwijking afgeleid uit de doelstelling die het platform meegeeft
(`OUTCOME_SALES` → conversie, en zo verder). Dat klopt meestal, maar de naam wint als die
duidelijk is: een campagne die op "Conversie" staat maar met doelstelling Verkeer draait, hoort
in de rapportage bij conversie.

## Hernoemen van lopende campagnes

Het dashboard leest de namen **live** bij elke aanroep; er wordt niets opgeslagen. Hernoem je
een bestaande campagne, dan verandert daarmee ook met terugwerkende kracht hoe hij in eerdere
periodes geclassificeerd wordt. Voor consistente reeksen is dat meestal juist wenselijk, maar
het is goed om te weten voordat iemand een bulk-hernoeming doet.

## Open punten

- Er is nog geen exploitatie voor **werving en vacatures** (bijvoorbeeld "Vacatures horeca").
  Zulke campagnes vallen onder "Overig" tot er een categorie bij komt in `BUSINESS_UNITS`.
- Doelgroeptypes zijn maar beperkt uit vrije omschrijvingen af te leiden. "Niet-leden met
  baby's" zegt niet of dat brede targeting met een interessefilter is, een lookalike of een
  geüploade lijst. Alleen het expliciete veld in de naam lost dat op.
