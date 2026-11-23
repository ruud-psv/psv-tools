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

Bron: het officiële PowerPoint-template van PSV, seizoen 2026-2027 (`POWERPOINT_PSV_26-27.pptx`). Maten in het template zijn in inch op 13,333 × 7,5 inch; hier omgerekend naar 1280 × 720 px (96 px per inch).

### Basis
- **Formaat** 16:9, 1280 × 720.
- **Titel**: PSV Condensed Bold, 50 pt (67 px), hoofdletters, **wit op een zwart blok** dat precies om de tekst past (binnenmarge links en rechts 11 px, geen afronding). Linksboven op 61 px van links en 68 px van boven. Eén regel; is de titel te lang, maak hem korter.
- **Subkop**: PSV Text Bold, 28 pt (37 px), PSV-rood, geen hoofdletters. Direct boven de tekst.
- **Tekst**: PSV Text Regular, 20 pt (27 px), zwart, regelafstand 85%, 14 pt (19 px) ruimte na elke alinea. Opsommingen met een rond bolletje. Het tekstvak begint op 73 px van links en 192 px van boven.
- **Achtergrond van een tekstslide**: wit, met rechts een grote lichtgrijze schuine vorm (`#F0F0F0`), de PSV-schuine streep die als een 1 of 7 oprijst. Klein PSV-logo (rond embleem) rechtsonder.
- **Geen voetregel en geen paginanummer** in beeld. Het template heeft er wel plekken voor, maar laat ze leeg.

### Soorten slides
| Slide | Wanneer | Hoe |
|---|---|---|
| **Welkom** | Opening | Rood vlak met een patroon van "PSV EINDHOVEN" in grote schuine letters (rood op rood), titel in het zwarte blok in het midden. |
| **Hoofdstuk** (aangepaste indeling) | Begin van een onderdeel | Rood vlak met links een donkerdere rode schuine band, groot PSV-embleem met twee sterren, titel in het zwarte blok rechts ernaast, daaronder datum of ondertitel klein in wit. |
| **Tekst** | Uitleg, opsommingen | Titel, subkop, tekst; grijze schuine vorm rechts, logo rechtsonder. Ook in twee kolommen. |
| **Beeld 1 t/m 5** | Tekst met een foto | Tekst links (smal, ±370 px breed), foto rechts in de PSV-schuine vorm. Hoe hoger het nummer, hoe breder de foto: van ±40% tot bijna de hele slide. |
| **Speciaal** | Nadruk met beeld | Foto over de hele slide, links een rode schuine vorm met de titel en een wit tekstvak met de opsomming. |
| **Quote** | Een citaat | Foto met de rode schuine vorm, de quote wit in **enkele aanhalingstekens** ('…'), de naam eronder klein. |
| **Foto zoom** | Sfeer, een moment | Foto over de hele slide, zonder tekst. |
| **Grafiek** / **Tabel** | Cijfers | Tekst links (±420 px breed: titel, subkop, conclusie in punten), grafiek of tabel rechts (±685 × 460 px) op de grijze schuine vorm. |
| **Video** | Een film | Video over de hele slide, tekst links. |
| **Rood** / **Zwart** / **Leeg** | Overgang, eigen opbouw | Effen vlak. |
| **Afsluiting** | Einde | Rood met de donkerdere schuine band en het grote embleem in het midden. |
| **Wacht-dia** | Voor de start | Rood met het zwarte en rode "PSV EINDHOVEN"-patroon over de hele slide. |

### Opbouw van een deck
1. Welkom (titel van het deck).
2. Per onderdeel een hoofdstukslide, daarna de inhoud.
3. **Eén boodschap per slide.** De titel zegt wat de lezer moet onthouden, kort genoeg voor één regel in het zwarte blok ("Nog 312 stoelen te koop", niet "Aanbod per dag").
4. Cijfers op een grafiek- of tabelslide: links de uitleg in twee of drie punten, rechts de grafiek of tabel.
5. Wissel tekstslides af met beeld: een beeldslide, quote of foto zoom houdt een deck levendig.
6. Afsluiting met het embleem.

### Beeld
- Foto's van spelers, supporters en het stadion: echt, in actie, in PSV-tenue. Ze staan altijd in de PSV-schuine vorm of over de hele slide, nooit als los kader met een rand.
- De schuine vorm loopt van rechtsboven naar linksonder, met een inkeping bovenaan zoals de 1 in "1913".

### Kleur in het template
Het kleurthema van het template heet "PSV 2020": rood `#ED1C24`, donkerrood `#B70E0C`, goud `#BB9753`, zwart, `#333333`, `#666666` en lichtgrijs `#E5E5E5`. Dit rood wijkt licht af van het rood in de design tokens (`#e82026`). Op het scherm is het verschil niet te zien; gebruik in code de tokens.

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

Bron: Het Rood-Witte Boekje, de spellings- en schrijfwijzer van PSV (volledig in `packages/psv-branding/tekst/rood-witte-boekje.md`). De regels hieronder zijn de regels die het vaakst in een ontwerp terugkomen; bij twijfel geldt het boekje.

**Toon.** Energiek, eigenzinnig en nuchter. Actief, direct, positief, in de tegenwoordige tijd. Spreek supporters aan met "je" en waar het kan met de voornaam; zakelijk (PSV Business) mag formeler. Elke zin heeft een functie: schrap woorden die niets toevoegen.

**Spelling en namen**
- Samenstellingen met PSV met een koppelteken: PSV-supporters, PSV-selectie. Maar PSV'er, en eigennamen zonder koppelteken: PSV FANstore, PSV Business, PSV Soccer School.
- Eigennamen van submerken, evenementen, artikelen, afdelingen en functietitels met hoofdletters: PSV Business Golfdag, Phoxy Club Card, Partnerships & New Business.
- Verwijs naar PSV met "het" en "zijn" (PSV presenteert zijn jaarverslag). PSV Vrouwen is enkelvoud.
- **Philips Stadion** of "stadion", nooit "PSV-stadion". PSV Campus De Herdgang, daarna mag "De Herdgang" of "campus".
- URL's: PSV in kapitalen, de rest klein: PSV.nl/tickets. Uitzonderingen: philipsstadion.nl, PSVFANstore.nl, psvmovement.nl.

**Notatie**
| Wat | Zo |
|---|---|
| Wedstrijd | PSV - FC Twente (kort streepje met spaties) |
| Datum | 6 oktober 2026 of 06-10-2026 |
| Tijd | 17.00 uur, 09.00 - 17.00 uur |
| Seizoen | 2026-2027 of 26-27 |
| Bedrag | € 15,- of € 7,50 |
| Getallen | Tot en met twintig en ronde getallen uitschrijven, specifieke getallen in cijfers (467). Gemengd in één zin: alles in cijfers. |
| Rangtelwoord | 1e, 50e |
| Telefoon | +31 (0)40 2505 347 |

**Leestekens**
- **Nooit een em-dash (—).** In een lopende zin een gedachtestreepje (–).
- Enkele aanhalingstekens ('…') in koppen en bij een quote op een slide; dubbele ("…") voor citaten in lopende tekst.
- Een scheidingsteken in een kop tussen plaats en datum: 28-11-2026 | Philips Stadion.
- Na een dubbele punt een kleine letter, behalve bij een citaat, een opsomming van hele zinnen of een eigennaam.

**Hoofdletters in het ontwerp.** Hoofdletters komen uit de opmaak (PSV Condensed met `text-transform: uppercase`), niet uit de tekst. Typ een kop dus gewoon in zinsvorm met de eigennamen zoals ze horen; dan klopt hij ook waar hij niet in hoofdletters staat.

**Knoppen** zijn een handeling: "Koop tickets", "Bekijk het programma", niet "Klik hier".

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
- Een em-dash (—) in tekst, "PSV-stadion", of PSV aanduiden met "haar".
- In een deck: een titel over twee regels, een voetregel met paginanummer, of een foto in een kader met rand.

## Snelreferentie voor de agent

- Achtergrond `#eeeeee`, kaart `#ffffff`, tekst `#000000`, gedempt `#666666`, rand `#cccccc`.
- Accent `#e82026`, hover `#9c1006`, tekst op rood `#ffffff`. Goud `#bb9753` met zwarte tekst.
- Koppen: `font-family: var(--font-display); text-transform: uppercase; line-height: 1.1`.
- Body: `font-family: var(--font-body); font-size: 16px; line-height: 1.5`.
- Primaire knop: rood vlak, wit, PSV Condensed hoofdletters, `letter-spacing: .03em`, `border-radius: 0`, padding 17px 25px, skewed met `clip-path`.
- Sectietitel: kop + rood streepje 48 × 4px eronder.
- Slidetitel (deck): wit PSV Condensed 67px hoofdletters op een zwart blok, linksboven; subkop PSV Text Bold rood; grijze schuine vorm rechts.

Voorbeeldopdrachten:
- *"Maak een presentatie van de Paid Ads-resultaten: welkomstslide in rood met het PSV EINDHOVEN-patroon, per kanaal een hoofdstukslide met het embleem, daarna grafiekslides met links drie punten en rechts de grafiek, titels als korte stelling in het zwarte blok."*
- *"Maak een A4-one-pager voor de seizoenskaartverkoop: rode hero met donkerrode wig rechts, drie kaarten in een raster, één skewed knop 'Koop je seizoenskaart'."*
