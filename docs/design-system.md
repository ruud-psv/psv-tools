# PSV Tools Design System

Het complete overzicht van de styling van PSV Tools: kleuren, typografie, ruimte, vormen, iconen, logo's, componenten en paginapatronen. Bedoeld om te delen met collega's (design, development, marketing) zodat iedereen dezelfde bouwstenen gebruikt.

> **Bron van waarheid:** alle waarden in dit document komen uit het pakket `@psv/branding` (`packages/psv-branding/`), `app/globals.css`, `tailwind.config.ts` en `components/ui/`. Verandert daar iets, werk dit document dan ook bij.

---

## Inhoud

1. [Waar staat wat](#1-waar-staat-wat)
2. [Basisprincipes](#2-basisprincipes)
3. [Kleuren](#3-kleuren)
4. [Typografie](#4-typografie)
5. [Ruimte, layout en breakpoints](#5-ruimte-layout-en-breakpoints)
6. [Vormen, randen, schaduwen en beweging](#6-vormen-randen-schaduwen-en-beweging)
7. [Iconen](#7-iconen)
8. [Logo's en beeld](#8-logos-en-beeld)
9. [React-componenten (`components/ui`)](#9-react-componenten-componentsui)
10. [PSV component classes (CSS)](#10-psv-component-classes-css)
11. [Paginapatronen](#11-paginapatronen)
12. [Grafieken en datavisualisatie](#12-grafieken-en-datavisualisatie)
13. [E-mail (Mail Builder)](#13-e-mail-mail-builder)
14. [Tekst en tone of voice](#14-tekst-en-tone-of-voice)
15. [Toegankelijkheid](#15-toegankelijkheid)
16. [Checklist voor nieuwe UI](#16-checklist-voor-nieuwe-ui)
17. [Bekende afwijkingen en open punten](#17-bekende-afwijkingen-en-open-punten)

---

## 1. Waar staat wat

| Wat | Bestand |
|---|---|
| Design tokens (CSS custom properties) | `packages/psv-branding/css/tokens.css` |
| Design tokens (JSON, voor JS/Tailwind) | `packages/psv-branding/tokens/tokens.json` |
| Design tokens (SCSS) | `packages/psv-branding/scss/_tokens.scss` |
| Font-declaraties (`@font-face`) | `packages/psv-branding/css/fonts.css` |
| Fontbestanden (TTF) | `packages/psv-branding/font/` |
| Componentstijlen (los pakket, incl. reset) | `packages/psv-branding/css/components.css` |
| Componentstijlen zoals de app ze gebruikt | `app/globals.css` (`@layer components`) |
| Tailwind-thema (koppeling tokens naar classes) | `tailwind.config.ts` |
| shadcn/ui semantische tokens | `app/globals.css` (`@layer base`, `:root`) |
| React-basiscomponenten | `components/ui/*.tsx` |
| PSV-iconen (SVG) | `public/icons/psv/` (kopie van `packages/psv-branding/icons/`) |
| Logo's (online en print) | `packages/psv-branding/logo/` |
| App-logo | `public/images/psv-logo.png` |
| Branding Assets Guidelines (co-branding, stadionschermen) | `packages/psv-branding/guidelines/BRANDING ASSETS GUIDELINES_PSV_MRT_2026 NL.pdf` |
| Het Rood-Witte Boekje (schrijfwijzer) | `packages/psv-branding/tekst/4031 Het Rood-Witte boekje w4.pdf` |

Het pakket wordt in de app geladen via `app/globals.css`:

```css
@import "@psv/branding/css/fonts.css";
@import "@psv/branding/css/tokens.css";
```

`components.css` uit het pakket wordt **niet** direct geïmporteerd (die bevat een eigen reset die met Tailwind botst). De component classes staan daarom, zonder reset, in `app/globals.css`.

---

## 2. Basisprincipes

1. **Tokens, geen losse waarden.** Gebruik Tailwind-classes (`bg-psv-red-primary`, `text-muted-foreground`) of CSS custom properties (`var(--color-red-primary)`). Geen hardcoded hex-kleuren in componenten.
2. **PSV-rood is de actiekleur.** Primaire knoppen, actieve navigatie, focus-ring, accenten en links zijn rood. Gebruik rood spaarzaam en doelgericht.
3. **Koppen, labels en knoppen in PSV Condensed, in hoofdletters.** Body-tekst in PSV Sans.
4. **Lichte content, donkere navigatie.** Witte achtergrond voor content, de sidebar is donker (`neutralDark`, `#09101d`).
5. **Strak en sportief.** Weinig afronding, duidelijke rode accentlijnen (bijvoorbeeld de 4px rode bovenrand op kaarten) en de kenmerkende schuine vorm (`.btn--skewed`, diagonale beelden).

---

## 3. Kleuren

### 3.1 Merkkleuren

| Naam | Hex | CSS variabele | Tailwind class | Gebruik |
|---|---|---|---|---|
| PSV rood | `#e82026` | `--color-red-primary` | `psv-red-primary` / `primary` | Primaire actie, accenten, actieve staat |
| Rood secundair | `#c00d0d` | `--color-red-secondary` | `psv-red-secondary` | Tweede tint rood (bijv. in grafieken) |
| Rood donker | `#9c1006` | `--color-red-dark` | `psv-red-dark` | Hover-staat van rode knoppen |
| Rood licht | `#f79da1` | `--color-red-light` | `psv-red-light` | Zachte accenten, grafiekreeksen |
| Rood lichter | `#fbc9ca` | `--color-red-lighter` | `psv-red-lighter` | Achtergrondtint |
| Goud | `#bb9753` | `--color-gold` | `psv-gold` | Premium/uitgelicht, tweede grafiekkleur |

### 3.2 Neutrale kleuren

| Naam | Hex | CSS variabele | Tailwind class | Gebruik |
|---|---|---|---|---|
| Zwart | `#000000` | `--color-black` | `psv-black` | Tekst, zwarte tags, footer |
| Neutral dark | `#09101d` | `--color-neutral-dark` | `psv-neutralDark` | Sidebar, donkere vlakken |
| Grijs 11 | `#333333` | `--color-gray-11` | `psv-gray-11` | Secundaire knop, labels |
| Grijs 10 | `#666666` | `--color-gray-10` | `psv-gray-10` | Lead-tekst, accordeontekst |
| Grijs 09 | `#999999` | `--color-gray-09` | `psv-gray-09` | Meta-tekst, hints, sidebar-kopjes |
| Grijs 08 | `#cccccc` | `--color-gray-08` | `psv-gray-08` | Randen, scheidingslijnen |
| Grijs 07 | `#eeeeee` | `--color-gray-07` | `psv-gray-07` | Grijze secties, progress-track |
| Off-white | `#f5f5f5` | `--color-off-white` | `psv-offWhite` | Zachte achtergrond, hover op witte knop |
| Wit | `#ffffff` | `--color-white` | `psv-white` | Achtergrond, tekst op rood/donker |

### 3.3 Statuskleuren

| Status | Tekst/rand | Achtergrond | Tailwind |
|---|---|---|---|
| Success | `#287d3c` (`--color-success`) | `#edf9f0` (`--color-success-bg`) | `text-success`, `bg-success-bg` |
| Warning | `#b95000` (`--color-warning`) | `#fff4ec` (`--color-warning-bg`) | `text-warning`, `bg-warning-bg` |
| Error | `#da1414` (`--color-error`) | `#feefef` (`--color-error-bg`) | `text-error`, `bg-error-bg` |
| Info | `#2e5aac` (`--color-info`) | `#eef2fa` (`--color-info-bg`) | `text-info`, `bg-info-bg` |

### 3.4 Semantische tokens (pakket)

| Token | Waarde |
|---|---|
| `--color-brand` | PSV rood |
| `--color-interactive` | PSV rood |
| `--color-interactive-hover` | Rood donker |
| `--color-bg-page` | Grijs 07 |
| `--color-bg-header` | PSV rood |
| `--color-bg-footer` | Zwart |
| `--color-text-default` | Zwart |
| `--color-text-inverted` | Wit |
| `--color-border-accent` | PSV rood |

### 3.5 App-thema (shadcn/ui tokens)

De React-componenten gebruiken semantische tokens in HSL, gedefinieerd in `app/globals.css`. Gebruik deze in Tailwind als `bg-background`, `text-foreground`, `border-border`, enzovoort.

| Token | HSL | Komt overeen met | Gebruik |
|---|---|---|---|
| `--background` / `--foreground` | `0 0% 100%` / `0 0% 0%` | wit / zwart | Pagina |
| `--card` / `--popover` | `0 0% 100%` | wit | Kaarten, dropdowns |
| `--primary` | `358 81% 52%` | `#e82026` | Primaire actie |
| `--primary-foreground` | `0 0% 100%` | wit | Tekst op rood |
| `--secondary` | `0 0% 96%` | `#f5f5f5` | Secundaire vlakken |
| `--secondary-foreground` | `0 0% 20%` | `#333333` | |
| `--muted` / `--accent` | `0 0% 93%` | `#eeeeee` | Gedempte vlakken, hover |
| `--muted-foreground` | `0 0% 40%` | `#666666` | Beschrijvende tekst |
| `--destructive` | `0 83% 47%` | `#da1414` | Verwijderen, fouten |
| `--border` / `--input` | `0 0% 80%` | `#cccccc` | Randen, invoervelden |
| `--ring` | `358 81% 52%` | `#e82026` | Focus-ring |
| `--radius` | `0.5rem` | 8px | Basis-afronding |

**Sidebar (donker thema):**

| Token | HSL | Komt overeen met |
|---|---|---|
| `--sidebar-background` | `222 57% 7%` | `#09101d` (neutral dark) |
| `--sidebar-foreground` | `0 0% 100%` | wit |
| `--sidebar-primary` | `358 81% 52%` | PSV rood (actief item) |
| `--sidebar-accent` | `0 0% 20%` | `#333333` (hover) |
| `--sidebar-border` | `0 0% 20%` | `#333333` |
| `--sidebar-ring` | `358 81% 52%` | PSV rood |

Tailwind: `bg-sidebar`, `text-sidebar-foreground`, `bg-sidebar-primary`, `hover:bg-sidebar-accent`, `border-sidebar-border`.

### 3.6 Kleurgebruik in de praktijk

- **Tekst op rood:** altijd wit.
- **Tekst op goud:** altijd zwart (`.tag--gold`, `Badge variant="gold"`).
- **Transparante tinten** mogen via Tailwind-opacity op een token: `bg-psv-red-primary/10` (zoals het icoonvlak op de dashboardkaarten), `bg-black/60` (mobiele overlay).
- **Dark mode:** `tailwind.config.ts` staat op `darkMode: ["class"]`, maar er zijn geen donkere tokens gedefinieerd. De app kent alleen het lichte thema (met donkere sidebar).

---

## 4. Typografie

### 4.1 Lettertypes

| Font | Gewichten | Stijlen | CSS variabele | Tailwind | Gebruik |
|---|---|---|---|---|---|
| **PSV Condensed** (`psv-condensed`) | Bold 700 | Normal | `--font-condensed`, `--font-branding` | `font-heading` | Koppen, knoppen, labels, tags, scores |
| **PSV Sans** (`psv-sans`) | Regular 400, Bold 700 | Normal, Italic | `--font-sans` | `font-sans` (standaard) | Body-tekst, UI-tekst |
| **PSV Text** (`psv-text`) | Regular 400, Bold 700 | Normal, Italic | `--font-text` | `font-text` | Lange teksten, artikelen |

Fallbacks: PSV Condensed valt terug op `sans-serif`, PSV Sans op `Helvetica Neue, Helvetica, sans-serif`, PSV Text op `Georgia, serif`.

> PSV Condensed bestaat alleen in Bold. Zet dus geen `font-weight: 400` op koppen; de browser gaat dan een nep-gewicht renderen.

### 4.2 Typografische schaal (tokens)

| Token | Grootte | Standaardgebruik |
|---|---|---|
| `--text-xs` | 12px | Hints, foutmeldingen |
| `--text-sm` | 14px | Labels, tags, meta, alerts |
| `--text-base` | 16px | Body, knoppen |
| `--text-lg` | 20px | Lead-tekst |
| `--text-xl` | 22px | h4, kaarttitel, accordeonkop |
| `--text-2xl` | 26px | h3 |
| `--text-3xl` | 36px | h2 |
| `--text-4xl` | 52px | Wedstrijdscore |
| `--text-5xl` | 72px | h1 (pakket) |
| `--text-hero` | 96px | Hero-titel, `.branding-display` (Tailwind: `text-hero`) |

**Lijnhoogtes:** `--leading-tight` 1.1 · `--leading-snug` 1.2 · `--leading-normal` 1.25 · `--leading-loose` 1.5

> **Let op bij Tailwind:** alleen `text-hero` is gekoppeld aan de PSV-schaal. De andere Tailwind-groottes (`text-sm`, `text-3xl`, ...) zijn de Tailwind-standaard en wijken af van de tokens. Voorbeeld: Tailwind `text-3xl` = 30px, token `--text-3xl` = 36px. In de app worden de Tailwind-groottes gebruikt; zie 4.4.

### 4.3 Regels

| Element | Regel | Tailwind |
|---|---|---|
| Koppen h1 t/m h4 | PSV Condensed, hoofdletters | `font-heading uppercase` (staat al standaard op `h1`-`h4` via `globals.css`) |
| Labels | PSV Condensed, hoofdletters, ruime spatiëring | `font-heading uppercase tracking-wide` (of class `.label`) |
| Knoppen | PSV Condensed, hoofdletters, ruime spatiëring | `font-heading uppercase tracking-wide` (zit in `<Button>`) |
| Body | PSV Sans, 16px, regelhoogte 1.25 | standaard |
| Lead/intro | 20px, grijs 10, regelhoogte 1.5 | class `.lead` |
| Beschrijvende tekst | Gedempte kleur | `text-muted-foreground` |

**Letterspatiëring:** `.label` 0.05em, `.btn` 0.03em, in Tailwind `tracking-wide` (0.025em) of `tracking-wider` (0.05em, voor sidebar-kopjes). Grote paginakoppen krijgen juist `tracking-tight`.

### 4.4 Koppen in de app

| Niveau | Gebruik in de app | Classes |
|---|---|---|
| Begroeting dashboard | Grote welkomstkop | `font-heading text-4xl sm:text-5xl uppercase tracking-tight` |
| Paginatitel (h1) | Bovenaan elke toolpagina | `text-3xl tracking-tight` (font en hoofdletters komen uit de base-stijl) |
| Kaarttitel | `<CardTitle>` | `font-heading text-2xl uppercase leading-none tracking-tight` |
| Tegeltitel | Dashboardkaart | `font-heading text-lg uppercase leading-tight tracking-wide` |
| Sectiekopje sidebar | "Navigatie", "Tools" | `font-heading text-xs uppercase tracking-wider text-psv-gray-09` |

Het pakket zelf (`components.css`, buiten de app) gebruikt: h1 72px, h2 36px, h3 26px, h4 22px, en losse classes `.h1` t/m `.h4`.

---

## 5. Ruimte, layout en breakpoints

### 5.1 Spacing

De PSV-schaal is gebaseerd op stappen van 4px en valt precies samen met de Tailwind-spacing (`p-4` = 16px = `--space-4`).

| Token | Waarde | Tailwind |
|---|---|---|
| `--space-1` | 4px | `1` |
| `--space-2` | 8px | `2` |
| `--space-3` | 12px | `3` |
| `--space-4` | 16px | `4` |
| `--space-5` | 20px | `5` |
| `--space-6` | 24px | `6` |
| `--space-8` | 32px | `8` |
| `--space-10` | 40px | `10` |
| `--space-12` | 48px | `12` |
| `--space-16` | 64px | `16` |
| `--space-20` | 80px | `20` |

Houd je aan deze stappen. Tussenwaarden als `p-7` of `gap-[18px]` vermijden.

### 5.2 Layout-maten

| Token | Waarde | Gebruik |
|---|---|---|
| `--max-width` | 1248px | Maximale contentbreedte (hero) |
| `--header-height` | 112px | Headerhoogte psv.nl desktop |
| `--header-height-mobile` | 64px | Headerhoogte psv.nl mobiel |

In de app:

| Onderdeel | Maat |
|---|---|
| Sidebar uitgeklapt / ingeklapt | `w-64` (256px) / `w-16` (64px) |
| Paginapadding | `p-4 sm:p-6 lg:p-8` |
| Maximale breedte toolpagina | `max-w-6xl` (1152px), dashboard `max-w-5xl` |
| Mobiele topbalk | vast bovenaan, content krijgt `pt-14` |
| Tailwind `container` | gecentreerd, padding 2rem, max 1400px |

### 5.3 Breakpoints

| Token (pakket) | Waarde | Tailwind (app) | Waarde |
|---|---|---|---|
| `--bp-mobile` | 375px | | |
| `--bp-tablet` | 580px | `sm` | 640px |
| | | `md` | 768px |
| `--bp-desktop` | 960px | `lg` | 1024px |
| `--bp-wide` | 1280px | `xl` | 1280px |
| `--bp-full` | 1920px | `2xl` | 1536px |

De PSV-grid classes (`.grid-2/3/4`) schakelen op 960px en 580px. In Tailwind-code gebruik je de Tailwind-breakpoints; de sidebar wordt vanaf `lg` (1024px) vast in beeld getoond, daaronder is het een uitschuifmenu.

---

## 6. Vormen, randen, schaduwen en beweging

### 6.1 Afronding

| Token | Waarde | Tailwind |
|---|---|---|
| `--radius` (app) | 8px | `rounded-lg` |
| | 6px | `rounded-md` (knoppen, inputs, tabs) |
| | 4px | `rounded-sm` |
| `--radius-sm` (pakket) | 4px | |
| `--radius-md` (pakket) | 8px | |

De PSV CSS-classes (`.btn`, `.tag`, `.card`, `.hero`) zijn bewust **niet** afgerond. Kaarten (`<Card>`) en badges (`<Badge>`) in de app zijn ook rechthoekig.

### 6.2 Randen en accentlijnen

| Element | Rand |
|---|---|
| Standaardrand | 1px `border-border` (`#cccccc`) |
| Kaart (`<Card>`) | 1px rand + **4px rode bovenrand** (`border-t-4 border-t-psv-red-primary`) |
| Sectie-accent (`.section--accent`) | 4px rode bovenrand (`--border-accent-width`) |
| Sectietitel (`.section__title`) | Rood streepje 48 x 4px onder de titel (wit op rode/zwarte sectie) |
| Lijstkaart (`.card--list`) | 2px rode onderrand |
| Alert | 4px linkerrand in statuskleur |

### 6.3 Schaduwen

| Token | Waarde | Tailwind | Gebruik |
|---|---|---|---|
| `--shadow-card` | `0 1px 3px rgba(0,0,0,0.5)` | `shadow-card` | Kaarten in rust |
| `--shadow-lg` | `0 4px 16px rgba(0,0,0,0.2)` | `shadow-psv-lg` | Kaarten bij hover |

### 6.4 Kenmerkende PSV-vormen

- **Schuine knop:** `.btn--skewed` knipt de knop af met `clip-path` (20px offset, `--btn-skew-offset`).
- **Diagonaal beeld:** `.card__image--diagonal` (`polygon(0 0, 100% 0, 76% 100%, 0% 100%)`).
- **Rode hero met diagonaal vlak:** `.hero--red` heeft rechts een donkerrood schuin vlak.
- **Gemarkeerde titel:** `.card__title-highlight span` zet witte tekst op een zwarte balk die over regels heen doorloopt.

### 6.5 Beweging

| Token | Waarde | Gebruik |
|---|---|---|
| `--transition-default` | `all 0.3s ease-out` | Knoppen |
| `--transition-fast` | `all 0.15s ease-out` | Accordeonicoon |
| Tailwind | `transition-colors`, `transition-all duration-200` | Hover op navigatie en kaarten |
| Sidebar in/uitklappen | `transition-all duration-300` | |
| Accordeon (Radix) | `animate-accordion-down/up`, 0.2s ease-out | |

Hover-patroon op klikbare kaarten: `-translate-y-0.5` + `shadow-psv-lg`, pijl schuift `translate-x-1` op.

---

## 7. Iconen

### 7.1 Twee iconensets

| Set | Waar | Wanneer |
|---|---|---|
| **lucide-react** | npm-pakket | Functionele UI-iconen: navigatie, knoppen, menu's, statusindicatie. Dit is de standaard in de app. |
| **PSV-iconen** | `public/icons/psv/` | Merkgebonden en voetbalspecifieke iconen (stadion, shirt, kaart, fluit, trofee) en plekken waar het PSV-gevoel telt. |

Iconen in knoppen en navigatie zijn `h-4 w-4` (in `<Button>` automatisch via `[&_svg]:size-4`). Icoonvlakken op tegels zijn `h-10 w-10` met een `h-5 w-5` icoon.

### 7.2 PSV-iconen: structuur

```
public/icons/psv/
├── BLACK/        82 iconen, 4px lijn   ICON_PSV_black_<naam>.svg
│   └── 2px/     101 iconen, 2px lijn   ICON_PSV_black_<naam>_2px.svg
├── RED/          79 iconen, 4px lijn   ICON_PSV_red_<naam>.svg
│   └── 2px/      92 iconen, 2px lijn   ICON_PSV_red_<naam>_2px.svg
└── WHITE/        82 iconen, 4px lijn   ICON_PSV_white_<naam>.svg
    └── 2px/      91 iconen, 2px lijn   ICON_PSV_white_<naam>_2px.svg
```

Totaal 527 SVG-bestanden. Niet elk icoon bestaat in elke kleur/dikte; controleer of het bestand er is.

**Kiezen:**
- **Kleur:** rood op wit, wit op rood/donker, zwart waar rood te veel aandacht trekt.
- **Dikte:** 4px voor grotere weergave (vanaf circa 32px), 2px voor kleine weergave in UI.

```tsx
<img src="/icons/psv/RED/ICON_PSV_red_arrow_right.svg" alt="" />
<img src="/icons/psv/WHITE/2px/ICON_PSV_white_ticket_2px.svg" alt="" className="h-5 w-5" />
```

Decoratieve iconen krijgen `alt=""`; iconen zonder begeleidende tekst krijgen een betekenisvolle `alt` of `aria-label` op de knop.

### 7.3 Beschikbare PSV-iconen

**4px (RED):** 360, arrow_down, arrow_left, arrow_right, arrow_up, arrow_up-right, beverages, bus, button_play, calendar, card, card_hand, chat, check, coffee, cone, console, contact, cotton_swab, covid, cross, delivery, diagram_down, diagram_up, diamond, document, dots, drinks, eindhoven, elevator, euro, experience, field, first-aid, football, goals, hamburger, home, lock_locked, lock_unlocked, markers, mask, people, person, person_business, person_financial, person_man, person_medical, person_woman, plane, red-card, return, scc, search, shield, shirt, shopping_bag, shopping_cart, site_article, site_photo, site_video, smartphone, stadium, stairs, subtitute, thumb_down, thumb_up, ticket, time, train, trophy, tv, video_PSV, video_PSV-play_button, vision, wheelchair, whistle_2px, wifi, yellow-card

**2px (RED):** PDF, VAR, arrow_cross, arrow_down, arrow_left, arrow_right, arrow_up, arrow_up_down, article, bus, cake, calendar, connect, console, contact, corner, cross, crown, dots, download, expand, filter, fire, football, goal, hamburger, hand_finger, hand_glove, hand_keeper, hand_wave, hands, heart, heart2, highlight, home, injury, language, line, list, lock_locked, medal, minimise, money, note_alert, note_check, note_cross, note_info, note_question, offside, parking, people, person, person_2, person_arrow, person_cross, person_login, person_question, person_running, person_running_ball, red-card_turned, score, search, search_minus, search_plus, settings, share, shirt, shoe, shopping_cart, site_gallery, site_photo, sound, sound_off, sound_on, stopwatch, stopwatch_45, sub, subtitute, tag, telephone, thumbtack, ticket, time, trash, trophy, video, video_play, vision, vision_out, whistle, wifi_bad, yellow-card_turned

---

## 8. Logo's en beeld

### 8.1 Logo's

Alle logo's staan in `packages/psv-branding/logo/`:

| Map | Inhoud |
|---|---|
| `PSV LOGO 2020/LOGO_PSV_corporate/` | Het PSV-logo met sterren: kleur, rood, zwart, wit, goud (PMS) |
| `PSV LOGO 2020/LOGO_PSV-EMM/` | Liggende variant met tekst |
| `PSV LOGO 2020/LOGO_PSV_merch/` | Merchandise-varianten |
| `PSV Subbrands/` | PSV Business, PSV Campus, PSV Coaching Academy, PSV Esports, PSV Experience, PSV FANclub, PSV FANdag, PSV FANdesk, PSV FANstore, PSV Museum, PSV Soccer School, PSV Ticketing, PSV Tours, PSV Vitality, Phoxy, FC PSV, Otten Cup, Official Fan Product lock-up |
| `Philips Stadion/` | Stadionlogo, compact en liggend |

**Formaten:** `ONLINE/` (SVG, PNG in RGB, AI) en `PRINT/` (EPS/AI, PDF, JPG in CMYK).

**Welk bestand:**
- Web/app: SVG uit `ONLINE/SVG/`, bijvoorbeeld `LOGO_PSV_stars_2020_RGB.svg` (kleur), `_white.svg` op rood of donker, `_black.svg` op licht monochroom.
- Drukwerk: CMYK uit `PRINT/`.
- In de app zelf: `public/images/psv-logo.png` (40 x 40 in de sidebar, 28 x 28 in de mobiele topbalk).

### 8.2 Co-branding en stadionschermen

De **Branding Assets Guidelines (maart 2026)** beschrijven de spelregels voor content met partners en sponsors:

- Partners worden met PSV verbonden via een **lock-up**. Beeld voert de boventoon, beperk tekst.
- Maakt PSV de opmaak, dan in de huidige PSV-stijl met voornamelijk een **witte lock-up**. Maakt de partner de opmaak, dan een **full-color lock-up rechtsonder**.
- Video: lock-up de hele video rechtsonder, aan het eind veegt hij naar kleur en eindigt de video met een lock-up. Schaal, verplaats of wijzig de transparantie van de lock-up niet.
- Aanleveren: idee en script eerst, copy en mediaplan uiterlijk 1 week voor livegang, assets uiterlijk 72 uur voor livegang.

**Formaten stadionschermen:**

| Scherm | Formaat | Duur | Export |
|---|---|---|---|
| Giant Screens (Philips Stadion) | 1920 x 1080 px | in overleg | .mov ProRes 4444/422 HQ, 25 fps |
| Perimeter (Philips Stadion) | A: 30000 x 144 px, B: 9456 x 144 px | 20 s | .mov ProRes, 60 fps |
| Facia | North 9240 x 80, South 10680 x 80, East/West 9600 x 80, SE/SW 2680 x 80 px (2 mappings van 1920 x 1080) | 20 s | .mov ProRes, 60 fps |
| Facia Exit | 4 x 240 x 90 px (mapping 1920 x 1080) | 20 s | .mov ProRes 60 fps of .png |
| IP-TV (narrowcasting) | 1920 x 1080 px | 15 tot 30 s, zonder audio | .mov ProRes 25-30 fps of .png |
| LED Wall (buitenzijde) | 1440 x 576 px | in overleg | .mov ProRes, 25 fps |
| Perimeter Jong PSV (De Herdgang) | 19728 x 72 px | 20 s | .mov ProRes, 60 fps |
| Perimeter PSV Vrouwen (De Herdgang) | 9384 x 72 px + centerboard 960 x 72 px | 20 s | .mov ProRes, 60 fps |

Deadline: 5 werkdagen voor de wedstrijddag (LED Wall: 5 werkdagen voor livegang). Vragen: PSV Brand & Design, branddesign@psv.nl.

---

## 9. React-componenten (`components/ui`)

Gebaseerd op shadcn/ui en Radix, aangepast aan de PSV-huisstijl. Gebruik deze componenten in plaats van eigen varianten te bouwen.

### Button (`components/ui/button.tsx`)

Altijd: `font-heading uppercase tracking-wide`, `rounded-md`, rode focus-ring, iconen `size-4`.

| `variant` | Uiterlijk |
|---|---|
| `default` | Rood, witte tekst, hover donkerrood |
| `destructive` | Error-rood, hover 90% |
| `outline` | Witte achtergrond, rode rand en tekst; hover vol rood |
| `secondary` | Grijs 11, witte tekst, hover zwart |
| `ghost` | Transparant, hover grijs vlak |
| `link` | Rode tekst, onderstreept bij hover |

| `size` | Maat |
|---|---|
| `default` | `h-10 px-4 py-2` |
| `sm` | `h-9 px-3` |
| `lg` | `h-11 px-8` |
| `icon` | `h-10 w-10` |

```tsx
<Button>Opslaan</Button>
<Button variant="outline" size="sm"><Download /> Exporteren</Button>
```

### Badge (`components/ui/badge.tsx`)

`font-heading text-xs uppercase tracking-wide`, rechthoekig.

| `variant` | Uiterlijk |
|---|---|
| `default` | Rood met witte tekst |
| `secondary` | Off-white met grijze tekst |
| `destructive` | Error-rood |
| `outline` | Alleen rand |
| `success` / `warning` / `info` | Lichte statusachtergrond met statuskleur als tekst |
| `gold` | Goud met zwarte tekst |

### Card (`components/ui/card.tsx`)

Witte kaart met 1px rand, **4px rode bovenrand** en `shadow-card`.
Onderdelen: `Card`, `CardHeader` (`p-6`), `CardTitle` (`font-heading text-2xl uppercase`), `CardDescription` (`text-sm text-muted-foreground`), `CardContent` (`p-6 pt-0`), `CardFooter`.

### Formuliervelden

| Component | Stijl |
|---|---|
| `Label` | `font-heading text-sm uppercase tracking-wide` |
| `Input` | `h-10 rounded-md border-input px-3 py-2 text-sm`, focus: rode rand + rode ring |
| `Textarea` | Als Input, `min-h-[80px]` |
| `Select` | Trigger als Input, met chevron (Radix Select) |

### Overige

| Component | Stijl |
|---|---|
| `Tabs` | Lijst `h-10 rounded-md bg-muted p-1`, actief tabblad wit met schaduw |
| `Progress` | Track `h-2 bg-psv-gray-07`, indicator rood |
| `Separator` | 1px `bg-border` (in sidebar `bg-sidebar-border`) |

---

## 10. PSV component classes (CSS)

Beschikbaar in de hele app via `app/globals.css` (`@layer components`). Handig voor merkgebonden onderdelen, gedeelde pagina's en snelle prototypes. Werken ook buiten React (bijvoorbeeld in Playable of statische HTML met `@psv/branding/css/psv.css`).

### Typografie

| Class | Effect |
|---|---|
| `.lead` | 20px, regelhoogte 1.5, grijs 10 |
| `.label` | PSV Condensed 14px, hoofdletters, 0.05em spatiëring |
| `.branding-display` | PSV Condensed 96px, hoofdletters, regelhoogte 0.9 |

### Knoppen

| Class | Effect |
|---|---|
| `.btn` | Rood, wit, PSV Condensed 16px, hoofdletters, padding 7 x 13px, hover donkerrood |
| `.btn--medium` | Grotere padding 17 x 25px |
| `.btn--secondary` | Grijs 11, hover zwart |
| `.btn--outlined` | Transparant met rode rand, hover vol rood |
| `.btn--ghost` | Alleen rode tekst, geen zijpadding |
| `.btn--skewed` | Schuine PSV-vorm |
| `.btn--white` | Wit met zwarte tekst (voor rode/donkere vlakken) |

```html
<a class="btn btn--medium btn--skewed" href="#">Koop tickets</a>
```

### Tags

| Class | Effect |
|---|---|
| `.tag` | Rood label, PSV Condensed 14px, hoofdletters |
| `.tag--black` | Zwart |
| `.tag--gold` | Goud met zwarte tekst |
| `.tag--outlined` | Rode rand, rode tekst |

### Kaarten

| Class | Effect |
|---|---|
| `.card__image` | Beeld 16:9, `object-fit: cover` |
| `.card__image--diagonal` | Diagonaal afgesneden beeld |
| `.card__body` | Padding 16/16/20px |
| `.card__label` | Label boven de titel |
| `.card__title` | PSV Condensed 22px, hoofdletters |
| `.card__meta` | 14px, grijs 09 |
| `.card--overlay` | Tekst over het beeld met donker verloop (verhouding 1.41) |
| `.card--list` | Horizontale lijstkaart (130px beeld), rode onderrand |
| `.card__title-highlight` | Titel als witte tekst op zwarte balk (`<span>` binnenin) |

```html
<article class="card card--overlay" style="position:relative">
  <img class="card__image" src="..." alt="">
  <div class="card__body">
    <span class="tag card__label">Nieuws</span>
    <h3 class="card__title">Titel van het artikel</h3>
  </div>
</article>
```

### Wedstrijd

| Class | Effect |
|---|---|
| `.match-card` | Witte kaart met `shadow-card`, gecentreerd |
| `.match-card__teams` | Flex-rij met teams en score |
| `.match-card__team` | PSV Condensed 16px, hoofdletters |
| `.match-card__score` | PSV Condensed 52px, cursief |
| `.match-card__meta` | 14px, grijs 09 (datum, locatie) |

### Accordeon

```html
<details class="accordion">
  <summary>Vraag</summary>
  <div class="accordion__content">Antwoord</div>
</details>
```

Kop in PSV Condensed 22px met rood `+` / `−`, grijze scheidingslijn.

### Formulieren

| Class | Effect |
|---|---|
| `.form-group` | Ruimte van 20px onder het veld |
| `.form-label` | PSV Condensed 14px, hoofdletters, grijs 11 |
| `.form-hint` | 12px, grijs 09 |
| `.form-error` | 12px, error-rood |

### Alerts

```html
<div class="alert alert--warning" role="alert">Je hebt geen toegang tot die pagina.</div>
```

Varianten: `.alert--success`, `.alert--warning`, `.alert--error`, `.alert--info`. Lichte statusachtergrond, 4px linkerrand en tekst in de statuskleur, 14px.

### Hero / Banner

| Class | Effect |
|---|---|
| `.hero` | Zwart vlak, min. 480px hoog, content onderaan |
| `.hero--red` | Rode variant, min. 320px, donkerrood schuin vlak rechts |
| `.hero__bg` | Achtergrondbeeld, 50% dekking |
| `.hero__content` | Max. 1248px breed, padding 48 x 32px |
| `.hero__tag` | Tag boven de titel |
| `.hero__title` | PSV Condensed 96px, hoofdletters |

### Secties

| Class | Effect |
|---|---|
| `.section` | Padding 48 x 32px |
| `.section--white` / `--gray` / `--red` / `--black` | Achtergrondkleur (tekst wit op rood en zwart) |
| `.section--accent` | 4px rode bovenrand |
| `.section__title` | Titel met rood streepje eronder |

### Grid

| Class | Desktop | Onder 960px | Onder 580px |
|---|---|---|---|
| `.grid-2` | 2 kolommen, gap 24px | 2 | 1 |
| `.grid-3` | 3 kolommen, gap 24px | 2 | 1 |
| `.grid-4` | 4 kolommen, gap 20px | 2 | 1 |

In React-code wordt meestal Tailwind gebruikt: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`.

---

## 11. Paginapatronen

### App-shell

```
┌──────────────┬─────────────────────────────────────┐
│  Sidebar     │  Main (bg-background, scrollt)       │
│  bg-sidebar  │                                      │
│  w-64 / w-16 │  p-4 sm:p-6 lg:p-8, max-w-6xl        │
│              │                                      │
│  Logo + naam │  h1 + beschrijving                   │
│  Navigatie   │  Inhoud (kaarten, formulieren)       │
│  Tools       │                                      │
│  ...         │                                      │
└──────────────┴─────────────────────────────────────┘
```

- **Sidebar:** logo 40px + "PSV TOOLS" (`font-heading uppercase tracking-wide`), groepen met kopjes in grijs 09, items `rounded-md px-2 py-2 text-sm`, actief item rood (`bg-sidebar-primary`), hover `bg-sidebar-accent`. In te klappen naar alleen iconen.
- **Mobiel (onder `lg`):** vaste donkere topbalk met hamburger, sidebar schuift in over een `bg-black/60` overlay.

### Toolpagina

```tsx
<div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
  <div className="mb-6">
    <h1 className="text-3xl tracking-tight">Naam van de tool</h1>
    <p className="mt-1 text-muted-foreground">Korte uitleg in één zin.</p>
  </div>
  {/* inhoud */}
</div>
```

### Klikbare tegel (dashboard)

`<Card>` met `p-5`, icoon in een `h-10 w-10 rounded-md bg-psv-red-primary/10 text-psv-red-primary` vlak (hover: vol rood, wit icoon), titel `font-heading text-lg uppercase`, beschrijving `text-sm text-muted-foreground`, en onderaan "Openen" met pijl in `font-heading text-xs uppercase text-psv-red-primary`. Grid: `grid gap-4 sm:grid-cols-2 lg:grid-cols-3`.

### Meldingen

Gebruik `.alert` voor paginabrede meldingen en `<Badge variant="success|warning|info">` voor statuslabels in tabellen en kaarten.

---

## 12. Grafieken en datavisualisatie

Recharts en SVG hebben letterlijke kleurwaarden nodig, geen Tailwind-classes. Neem die waarden dan wel uit de tokens (`@psv/branding/tokens/tokens.json`) en zet ze als benoemde constante bovenaan het bestand, met een commentaar welk token het is.

**Standaardvolgorde voor reeksen** (zoals `CHART_COLORS` in `app/share/rapportage/page.tsx`):

| # | Kleur | Token |
|---|---|---|
| 1 | `#e82026` | `color.red.primary` |
| 2 | `#bb9753` | `color.gold` |
| 3 | `#09101d` | `color.neutralDark` |
| 4 | `#c00d0d` | `color.red.secondary` |
| 5 | `#2e5aac` | `color.info` |
| 6 | `#287d3c` | `color.success` |

**Afspraken:**
- De belangrijkste reeks (of "PSV", "nieuw", "huidig") krijgt **PSV-rood**.
- Vergelijkingsreeksen: goud, dan neutral dark, info-blauw en success-groen.
- Neutraal/overig/verleden: grijs (`#999999` of `#cccccc`).
- Afwijking/signaal (retouren, onbekend): **warning-oranje** `#b95000`.
- Intensiteit in één reeks: rood licht `#f79da1`, rood `#e82026`, rood secundair `#c00d0d`.
- Rasterlijnen: `#333` op 20% dekking, gestippeld (`strokeDasharray="3 3"`); asteksten `#999`.
- Lijnen `strokeWidth={2}`, geen punten (`dot={false}`); staven met afgeronde bovenkant `radius={[3, 3, 0, 0]}`.
- Getallen in Nederlandse notatie (`toLocaleString("nl-NL")`).

---

## 13. E-mail (Mail Builder)

E-mailclients ondersteunen geen CSS-variabelen of externe stylesheets. De Mail Builder (`components/mail-builder-form.tsx`) gebruikt daarom inline hex-waarden en tabellayouts. Dit is de enige plek waar hardcoded kleuren de bedoeling zijn.

De mail gebruikt op dit moment eigen waarden die afwijken van de app-tokens: rood `#E30613` (vlak/knop) en `#EE1C24` (link), lichtgrijs `#F1F1F1`. Zie [punt 17](#17-bekende-afwijkingen-en-open-punten).

---

## 14. Tekst en tone of voice

Alle tekst in de interface volgt **Het Rood-Witte Boekje** (`packages/psv-branding/tekst/`). De belangrijkste regels:

- **Toon:** energiek, eigenzinnig, nuchter. Toegankelijk, positief en direct.
- **Actief en in de tegenwoordige tijd.** "PSV speelt vanavond", niet "Er wordt vanavond gespeeld".
- **Informeel:** spreek de gebruiker aan met je/jij. Zakelijke context (PSV Business) mag formeler.
- **Kort:** elke zin heeft een functie. Schrap woorden die niets toevoegen.
- **Geen em dash (—)** in PSV-communicatie. Gebruik een gewoon streepje, komma of dubbele punt.
- **Samenstellingen met PSV met koppelteken:** PSV-supporters, PSV-selectie. Wel: PSV'er.
- **Eigennamen zonder koppelteken en met hoofdletters:** PSV FANstore, PSV Business, Philips Stadion (nooit "PSV-stadion").
- **PSV is "het" en "zijn":** "PSV presenteert zijn jaarverslag".
- **Notatie:** datum 06-11-2025 of 6 november 2025, tijd 17.00 uur, bedrag € 15,- of € 7,50, wedstrijd PSV - FC Twente, seizoen 2025-2026.
- **URL's:** PSV.nl/tickets (PSV in kapitalen, rest klein).

In de UI: knoplabels kort en als werkwoord ("Opslaan", "Exporteren", "Openen"). Koppen en labels worden via CSS in hoofdletters gezet; typ ze zelf gewoon in zinsnaamval.

---

## 15. Toegankelijkheid

- **Focus:** elk interactief element heeft een zichtbare rode focus-ring (`focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2`). Niet weghalen.
- **Contrast:** wit op PSV-rood en zwart op goud zijn de vaste combinaties. Grijs 09 (`#999999`) haalt op wit maar 2,8:1 en voldoet daar niet aan WCAG AA; gebruik het op wit alleen voor ondergeschikte tekst en kies voor beschrijvende tekst `text-muted-foreground` (`#666666`, 5,7:1). Op de donkere sidebar is grijs 09 wel goed leesbaar.
- **Iconen:** decoratief `alt=""`; een knop met alleen een icoon krijgt `aria-label` of `title`.
- **Taal:** `<html lang="nl">`.
- **Meldingen:** `role="alert"` op alerts die direct aandacht vragen.
- **Uitgeschakeld:** `disabled:opacity-50 disabled:pointer-events-none` (zit in de componenten).

---

## 16. Checklist voor nieuwe UI

- [ ] Kleuren via Tailwind-tokens (`psv-*`, `primary`, `muted-foreground`, ...) of `var(--color-*)`, geen losse hex.
- [ ] Koppen `font-heading uppercase`; labels en knoppen `font-heading uppercase tracking-wide`.
- [ ] Bestaande componenten uit `components/ui` gebruikt (Button, Card, Badge, Input, ...).
- [ ] Spacing in de 4px-stappen (`1, 2, 3, 4, 5, 6, 8, 10, 12, 16, 20`).
- [ ] Paginaopbouw volgens het toolpagina-patroon (padding, `max-w-6xl`, h1 + beschrijving).
- [ ] Iconen: lucide voor functionele UI, PSV-iconen voor merkgebonden onderdelen.
- [ ] Werkt op mobiel (onder `lg` is de sidebar een uitschuifmenu).
- [ ] Zichtbare focus-staat, `alt`-teksten in orde.
- [ ] Teksten volgens Het Rood-Witte Boekje (actief, je/jij, geen em dash).

---

## 17. Bekende afwijkingen en open punten

Gevonden bij het opstellen van dit document. Niet opgelost, wel goed om te weten:

1. **Tailwind-lettergroottes wijken af van de PSV-schaal.** Alleen `text-hero` is gekoppeld; `text-sm` t/m `text-5xl` zijn de Tailwind-standaard (bijv. `text-3xl` = 30px in plaats van 36px).
2. **Breakpoints verschillen.** Het pakket gebruikt 580/960/1280px, de app de Tailwind-standaard 640/768/1024/1280/1536px.
3. **Hardcoded kleuren in grafieken.** Diverse dashboards (`fanstore-dashboard.tsx`, `dm-performance-dashboard.tsx`, `fandesk-dashboard.tsx`, `ticket-sales-chart.tsx`) gebruiken letterlijke hex-waarden. De meeste komen overeen met tokens, maar er staan ook kleuren tussen die niet in het palet zitten (o.a. `#7a2020`, `#595959`, `#8c8c8c`, `#127468`).
4. **Mail Builder-rood wijkt af.** `#E30613` en `#EE1C24` in plaats van PSV-rood `#e82026`.
5. **Aantal iconen.** `CLAUDE.md` en de pakket-README noemen 531 iconen; er staan er 527 in `public/icons/psv/`. De README-voorbeelden gebruiken het achtervoegsel `_4px`, de bestanden heten zonder achtervoegsel (4px) of met `_2px`.
6. **Ontbrekende visuele referentie.** De README van `@psv/branding` verwijst naar `psv-design-system.html`, maar dat bestand zit niet in het pakket.
7. **Bronvermelding tokens.** `tokens.css` noemt "Brand Guidelines OKT 2025"; de meegeleverde guidelines-PDF is van maart 2026 en gaat over co-branding en schermformaten, niet over UI-tokens.
8. **Geen dark mode.** `darkMode: ["class"]` staat aan, maar er zijn geen donkere tokens.
