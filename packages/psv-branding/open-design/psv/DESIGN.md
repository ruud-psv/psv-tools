# PSV

> Category: Sports & Entertainment
> Rood, wit en zwart. Strak, hoekig en vol energie: de huisstijl van PSV Eindhoven.

Dit design system is afgeleid van `@psv/branding` (tokens, fonts, componenten), de PSV-brandguidelines en Het Rood-Witte Boekje. Elke waarde hieronder staat ook in `tokens.css`. Wijkt dit document af van `tokens.css`, dan is `tokens.css` leidend en moet dit document worden bijgewerkt.

## Sfeer en karakter

PSV ziet eruit als een voetbalclub: krachtig, direct, trots. Het beeld wordt gedragen door drie kleuren: **PSV-rood** (`#e82026`), **wit** en **zwart**. Grote koppen in een smalle, vette letter, altijd in hoofdletters. Strakke rechte hoeken, en waar beweging nodig is een **schuine snede** in plaats van een ronding.

Kenmerken:
- Grote koppen in PSV Condensed, hoofdletters, strak op elkaar (regelafstand 1,1 of kleiner).
- Vlakken in rood of zwart als sectie of hero; foto's volle breedte, vaak met een donkere verloop-overlay.
- Diagonalen: schuine knoppen (`clip-path`), schuin afgesneden foto's, een donkerrode wig in een rode hero.
- Geen afgeronde hoeken, geen pastels, geen zachte gradients tussen kleuren.
- Goud (`#bb9753`) alleen als accent voor iets bijzonders: kampioenschappen, jubilea, premium.

## Kleur en rollen

| Rol | Token | Waarde | Gebruik |
|---|---|---|---|
| Achtergrond pagina | `--bg` | `#eeeeee` | Lichtgrijze basis waarop witte kaarten liggen |
| Oppervlak | `--surface` | `#ffffff` | Kaarten, panelen, witte secties |
| Oppervlak licht | `--surface-warm` | `#f5f5f5` | Rustige tussenvlakken, tabelrijen |
| Tekst | `--fg` | `#000000` | Koppen en bodytekst |
| Tekst secundair | `--fg-2` | `#333333` | Labels in formulieren, secundaire knop |
| Tekst gedempt | `--muted` / `--meta` | `#666666` | Intro (`.lead`), metadata, hints |
| Rand | `--border` | `#cccccc` | Invoervelden, scheidingslijnen |
| Rand zacht | `--border-soft` | `#eeeeee` | Rijen binnen een lijst of tabel |
| Accent | `--accent` | `#e82026` | PSV-rood: knoppen, links, accentlijnen, rode vlakken |
| Accent hover | `--accent-hover` | `#9c1006` | Hover en actief op rode elementen |
| Tekst op accent | `--accent-on` | `#ffffff` | Altijd wit op rood |
| Goud | `--tag-bg-gold` | `#bb9753` | Gouden tag, met **zwarte** tekst |
| Succes / waarschuwing / fout | `--success` / `--warn` / `--danger` | `#287d3c` / `#b95000` / `#da1414` | Alleen voor status, nooit decoratief |

Overige merkkleuren uit `@psv/branding` die je in vlakken mag gebruiken: donkerrood `#c00d0d` (secundair) en neutral dark `#09101d` (donkere interface-achtergrond).

**Rood gebruiken.** Rood is de clubkleur en mag groot: een rode hero, een rode sectie of de rode header zijn gewoon PSV. Binnen één scherm geldt wel: één rode primaire knop per blok, en rode tekst alleen voor links en korte accenten. Komen er te veel rode elementen op een scherm, dan valt de belangrijkste niet meer op.

**Donkere variant** (`[data-theme="dark"]`): zwart als basis, `#09101d` voor panelen, wit voor tekst, `#cccccc` voor gedempte tekst. Rood blijft rood.

## Typografie

Drie families, elk met een eigen taak:

| Familie | Token | Gewicht | Waarvoor |
|---|---|---|---|
| PSV Condensed (`psv-condensed`) | `--font-display` | Bold 700 | Koppen h1 t/m h4, knoppen, tags, labels, scores. **Altijd hoofdletters.** |
| PSV Sans (`psv-sans`) | — | Regular 400, Bold 700 | Alleen kopteksten die niet in PSV Condensed staan. Nooit in hoofdletters. |
| PSV Text (`psv-text`) | `--font-body` | Regular 400, Bold 700 | Alle bodytekst; de standaard op `body`. Nooit in hoofdletters. |

**Hoofdletters zijn voorbehouden aan PSV Condensed.** Tekst in PSV Sans of PSV Text staat nooit in all caps, ook niet in knoppen of labels: zet die dan in PSV Condensed.

Schaal:

| Niveau | Token | Grootte | Regelafstand |
|---|---|---|---|
| Hero / display | `--text-4xl` | 96px | 0,9 |
| H1 | `--text-3xl` | 72px | 1,1 (`--leading-tight`) |
| H2 / sectietitel | `--text-2xl` | 36px | 1,1 |
| H3 | `--text-xl` | 26px | 1,2 |
| H4 / kaarttitel | — | 22px | 1,2 |
| Intro (`.lead`) | `--text-lg` | 20px | 1,5 |
| Body | `--text-base` | 16px | 1,5 (`--leading-body`) |
| Label, tag, meta | `--text-sm` | 14px | 1,25 |
| Hint, voetnoot | `--text-xs` | 12px | 1,25 |

Spatiëring tussen letters: koppen `0` (`--tracking-display`), knoppen `0.03em`, labels `0.05em`.

**Fonts zijn eigendom van PSV.** Ze staan in `@psv/branding/font/` en moeten op de machine geïnstalleerd zijn (of via `@font-face` geladen worden) om goed te renderen. De fallbacks in `tokens.css` zijn alleen een noodoplossing.

## Ruimte, raster en compositie

- Spacing in stappen van 4px: `--space-1` (4) t/m `--space-12` (48); in `@psv/branding` ook 64 en 80 voor grote secties.
- Maximale contentbreedte `--container-max` = 1248px. Zijmarge 32px desktop, 24px tablet, 16px telefoon.
- Secties: 48px verticaal op desktop (`--section-y-desktop`), 40px tablet, 32px telefoon. Afwisselend wit en lichtgrijs, met af en toe een rood of zwart vlak voor nadruk.
- Rasters met 2, 3 of 4 kolommen, gap 24px (4 kolommen: 20px). Onder 960px gaan 3 en 4 kolommen naar 2, onder 580px alles naar 1.
- Breakpoints: 375 / 580 / 960 / 1280 / 1920px.
- Sectietitel: kop in PSV Condensed met daaronder een **rood streepje** van 48 × 4px. Op een rood of zwart vlak is dat streepje wit.
- Een accentrand bovenaan een sectie is 4px rood.

## Componenten

**Knoppen.** PSV Condensed, hoofdletters, `0.03em` spatiëring, geen afronding.
- Primair: rood vlak `#e82026`, witte tekst; hover/focus `#9c1006`. Padding 7px × 13px; medium 17px × 25px.
- Secundair: `#333333`, hover zwart.
- Outlined: transparant met 1px rode rand en rode tekst; hover wordt rood vlak.
- Ghost: alleen rode tekst, geen padding opzij.
- Wit: wit vlak met zwarte tekst, voor op rode of zwarte vlakken.
- **Skewed** (kenmerkend PSV): parallellogram via `clip-path: polygon(20px 0, 100% 0, calc(100% - 20px) 100%, 0 100%)`. Gebruik hem voor de belangrijkste call-to-action op een pagina.

**Tags.** Klein blok in PSV Condensed, 14px, hoofdletters, padding 2px × 10px. Rood (standaard), zwart, goud (met zwarte tekst) of outlined.

**Kaarten.** Wit, geen afronding, schaduw `0 1px 3px rgba(0,0,0,.5)`. Foto 16:9 bovenaan, body met 16px padding. Titel in PSV Condensed 22px hoofdletters, meta 14px in `#666666`.
- Overlay-kaart: foto vult de kaart, titel wit op een zwart verloop van onder (`rgba(0,0,0,.85)` naar transparant).
- Titel-highlight: elke regel van de titel op een zwart blokje, witte tekst (`box-decoration-break: clone`).
- Lijstkaart: foto 130px links, tekst rechts, onderrand 2px rood.
- Diagonale foto: `clip-path: polygon(0 0, 100% 0, 76% 100%, 0 100%)`.

**Wedstrijdkaart.** Witte kaart, centraal. Score in PSV Condensed, cursief, vet, groot (52px), zwart. Teamnamen in PSV Condensed hoofdletters; datum en competitie als meta.

**Hero.** Zwart vlak met foto op 50% dekking, inhoud onderaan, titel 96px PSV Condensed hoofdletters met regelafstand 0,9. Rode variant: rood vlak met rechts een donkerrode schuine wig (`#9c1006`).

**Accordeon.** Kop in PSV Condensed 22px hoofdletters, rechts een rood `+` dat `−` wordt. Scheidingslijn 1px `#cccccc`.

**Formulieren.** Label in PSV Condensed 14px hoofdletters, `#333333`. Veld met 1px rand `#cccccc`, padding 12px × 16px, geen afronding; focus maakt de rand rood. Hint 12px `#666666`, fout 12px `#da1414`.

**Meldingen.** Lichte achtergrond met een linkerrand van 4px in de statuskleur: succes `#287d3c` op `#edf9f0`, waarschuwing `#b95000` op `#fff4ec`, fout `#da1414` op `#feefef`, info `#2e5aac` op `#eef2fa`.

**Iconen.** PSV heeft een eigen iconenset (rood, zwart en wit, met lijndikte 4px of 2px). Gebruik geen iconensets van derden als er een PSV-icoon voor bestaat.

## Diepte en beweging

- Diepte is spaarzaam: kaarten liggen op de grijze achtergrond met één harde, korte schaduw (`--elev-raised`). Grote schaduw `0 4px 16px rgba(0,0,0,.2)` alleen voor zwevende lagen (menu's, dialogen).
- Geen glas-effecten, geen gloed, geen gekleurde schaduwen.
- Beweging: overgangen 300ms (`--motion-base`) of 150ms (`--motion-fast`), altijd ease-out. Kleurwissel bij hover, geen schaal- of stuitereffecten.
- Respecteer `prefers-reduced-motion`: zet overgangen en animaties dan uit op de elementen die bewegen.

## Grafieken en data

- **Eén reeks springt eruit.** De reeks waar het om gaat is PSV-rood (op een rood vlak: wit), de andere reeksen zijn neutraal in deze volgorde: `#09101d`, `#666666`, `#999999`. Zonder duidelijke hoofdreeks: rood, `#09101d`, goud `#bb9753`, `#999999`.
- In een lijngrafiek is de uitgelichte lijn dikker (5px op een slide, 3,5px op een pagina) dan de rest (2–2,5px).
- Op zwart: rood, wit, `#999999`, goud. Op rood: wit, zwart, `#fbc9ca`, `#333333`.
- Y-as vanaf nul met ronde stappen (1, 2, 2,5 of 5 × 10ⁿ), getallen met een punt als duizendtal (`2.887`). Rasterlijnen licht en gestippeld, geen verticale lijnen.
- Legenda in de volgorde van de reeksen, niet op alfabet.
- In een tabel: de uitgelichte rij als rood vlak met witte, vette tekst; getallen rechts uitgelijnd met `tabular-nums`.
- Onder elke grafiek, tabel of set kerngetallen een bronregel: "Bron: …" met bron en periode, 11–12px in `#666666`.

## Slide decks

Formaat 1280 × 720 (16:9). Marges 72px opzij, 52px boven; onderaan een voetregel van 36px met de titel links en het slidenummer (`02`) rechts in PSV Condensed.

Opbouw:
1. **Titelslide**: zwart vlak met rechts de rode schuine wig (`#e82026`, daarachter `#9c1006`), een rode tag, de titel in PSV Condensed 80px met regelafstand 0,9, de ondertitel 20px in `#eeeeee`.
2. **In cijfers**: het belangrijkste kerngetal groot (120px) op een zwart tegel met rode bovenrand, de rest als tegels op `#f5f5f5` met zwarte bovenrand van 4px.
3. **Conclusie** op een rood vlak: genummerde punten (`01`, `02`) in PSV Condensed, tekst 21–24px wit.
4. **Eén boodschap per slide**. De titel is een stelling ("Nog 312 stoelen te koop"), geen onderwerp ("Aanbod per dag"). Daarboven het hoofdstuk klein in rood, daaronder het rode streepje van 48 × 4px.
5. Twee halve blokken mogen naast elkaar op één slide, bijvoorbeeld een tabel met een zwart tekstvlak ernaast.
6. **Bronnen** op een zwarte slide aan het eind.

Hooguit 12 slides. Tabellen op een slide hooguit 12 rijen; bij meer wordt de tekst kleiner, dus liever inkorten.

## Toegankelijkheid

Gecontroleerde contrasten (WCAG):

| Voorgrond | Achtergrond | Contrast | Oordeel |
|---|---|---|---|
| Wit | Rood `#e82026` | 4,5:1 | AA, maar krap: gebruik bold of ≥ 16px |
| Rood `#e82026` | Wit | 4,5:1 | Idem: links en knoppen oké |
| Rood `#e82026` | Grijs `#eeeeee` | 3,9:1 | **Alleen grote tekst** (≥ 24px of ≥ 19px bold) |
| Wit | Donkerrood `#9c1006` | 8,4:1 | AA |
| Wit | Donkerrood `#c00d0d` | 6,4:1 | AA |
| `#666666` | Wit / `#eeeeee` | 5,7:1 / 5,0:1 | AA |
| `#999999` | Wit | 2,9:1 | **Onvoldoende** voor tekst; alleen decoratief |
| Zwart | Goud `#bb9753` | 7,7:1 | AA |
| Wit | Goud `#bb9753` | 2,7:1 | **Niet gebruiken** |

- Elk interactief element heeft een zichtbare `:focus-visible` (`--focus-ring`, of dezelfde kleurwissel als hover plus de ring).
- Klikvlakken minimaal 44 × 44px op touch.
- Tekst op foto's alleen met een donkere overlay of verloop eronder.
- Taal van de pagina is Nederlands (`lang="nl"`), tenzij anders gevraagd.

## Tekst en tone of voice

- Schrijf in het Nederlands, kort en direct, met energie maar zonder schreeuwen. Volg Het Rood-Witte Boekje.
- Hoofdletters komen uit de opmaak (PSV Condensed + `text-transform: uppercase`), niet uit de tekst zelf. Typ koppen dus gewoon met een hoofdletter aan het begin.
- Knopteksten zijn een handeling: "Koop tickets", "Bekijk het programma", niet "Klik hier".
- Gebruik de clubnaam als **PSV**, het stadion als **Philips Stadion**.

## Do's en don'ts

**Doe**
- Koppen, knoppen, tags en labels in PSV Condensed, hoofdletters.
- Bodytekst in PSV Text, in gewone zinnen.
- Rechte hoeken; voor dynamiek een schuine snede.
- Rood, wit en zwart als basis; goud alleen voor iets bijzonders.
- Eén duidelijke primaire actie per blok, bij voorkeur de skewed knop.
- Foto's groot en echt: spelers, supporters, het stadion.

**Doe niet**
- Afgeronde knoppen, pillen of kaarten.
- PSV Sans of PSV Text in hoofdletters.
- Andere kleuren als accent (blauw, paars, pastel); statuskleuren alleen voor status.
- Witte tekst op goud, rode tekst op lichtgrijs in kleine maten, of `#999999` voor leesbare tekst.
- Verlopen tussen rood en een andere kleur; glas-effecten; neon.
- Het PSV-logo vervormen, inkleuren of op een drukke foto zonder ondergrond zetten.
- Stockfoto's van generieke voetballers of een ander clubtenue.

## Snelreferentie voor de agent

- Achtergrond `#eeeeee`, kaart `#ffffff`, tekst `#000000`, gedempt `#666666`, rand `#cccccc`.
- Accent `#e82026`, hover `#9c1006`, tekst op rood `#ffffff`. Goud `#bb9753` met zwarte tekst.
- Koppen: `font-family: var(--font-display); text-transform: uppercase; line-height: 1.1`.
- Body: `font-family: var(--font-body); font-size: 16px; line-height: 1.5`.
- Primaire knop: rood vlak, wit, PSV Condensed hoofdletters, `letter-spacing: .03em`, `border-radius: 0`, padding 17px 25px, skewed met `clip-path`.
- Sectietitel: kop + rood streepje 48 × 4px eronder.

Voorbeeldopdrachten:
- *"Maak een presentatie van de Paid Ads-resultaten: titelslide als zwarte hero met foto op 50% en een titel van 96px, daarna witte slides op `#eeeeee` met sectietitels met rood streepje, cijfers groot in PSV Condensed."*
- *"Maak een A4-one-pager voor de seizoenskaartverkoop: rode hero met donkerrode wig rechts, drie kaarten in een raster, één skewed knop 'Koop je seizoenskaart'."*
