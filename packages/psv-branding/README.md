# @psv/branding

PSV huisstijl pakket: design tokens, fonts, iconen, logo's en component styles.

## Installatie

```bash
npm install @psv/branding
```

## Snel starten

### Alles in één keer (CSS)

```css
@import '@psv/branding/css/psv.css';
```

Dit laadt design tokens, font declaraties en component styles in één import.

### Selectief importeren (CSS)

```css
/* Alleen design tokens (kleuren, spacing, typografie, etc.) */
@import '@psv/branding/css/tokens.css';

/* Alleen @font-face declaraties */
@import '@psv/branding/css/fonts.css';

/* Alleen component classes (buttons, cards, hero, etc.) */
@import '@psv/branding/css/components.css';
```

### SCSS

```scss
// Alle SCSS variabelen ($color-red-primary, $font-sans, etc.)
@import '@psv/branding/scss/tokens';

// Font declaraties met configureerbaar pad
$psv-font-path: '../font' !default;  // overschrijf indien nodig
@import '@psv/branding/scss/fonts';
```

De `_tokens.scss` bevat ook een `psv-tokens` mixin om CSS custom properties te genereren vanuit de SCSS variabelen:

```scss
@import '@psv/branding/scss/tokens';
@include psv-tokens;  // genereert :root { --color-red-primary: #e82026; ... }
```

### JavaScript / TypeScript

```js
import tokens from '@psv/branding/tokens/tokens.json';

console.log(tokens.color.red.primary); // "#e82026"
console.log(tokens.spacing['4']);       // "16px"
console.log(tokens.font.sans);         // "'psv-sans', 'Helvetica Neue', Helvetica, sans-serif"
```

### Tailwind CSS

```js
// tailwind.config.js
const tokens = require('@psv/branding/tokens/tokens.json');

module.exports = {
  theme: {
    colors: {
      red: tokens.color.red,
      gold: tokens.color.gold,
      black: tokens.color.black,
      white: tokens.color.white,
      gray: tokens.color.gray,
      success: tokens.color.success,
      warning: tokens.color.warning,
      error: tokens.color.error,
      info: tokens.color.info,
    },
    fontFamily: {
      branding: ['psv-condensed', 'sans-serif'],
      sans: ['psv-sans', 'Helvetica Neue', 'Helvetica', 'sans-serif'],
      text: ['psv-text', 'Georgia', 'serif'],
    },
    spacing: tokens.spacing,
  },
};
```

---

## Inhoud

### Design Tokens (`css/tokens.css`, `scss/_tokens.scss`, `tokens/tokens.json`)

| Categorie | Voorbeelden |
|---|---|
| **Kleuren** | `--color-red-primary: #e82026`, `--color-gold: #bb9753`, grijs schaal, status kleuren |
| **Typografie** | Font families, 10 groottes (12px–96px), 4 lijnhoogtes |
| **Spacing** | 11 stappen van 4px tot 80px |
| **Layout** | Max-width, header hoogte, 5 breakpoints |
| **Effecten** | Border radius, schaduwen, transities |
| **Buttons** | Padding, line-height, skew offset |

### Fonts (`font/`)

| Font Family | Gewichten | Stijlen |
|---|---|---|
| `psv-condensed` | Bold (700) | Normal |
| `psv-sans` | Regular (400), Bold (700) | Normal, Italic |
| `psv-text` | Regular (400), Bold (700) | Normal, Italic |

Gebruik via CSS custom properties:
```css
font-family: var(--font-condensed);  /* Koppen, knoppen, labels */
font-family: var(--font-sans);       /* Body tekst */
font-family: var(--font-text);       /* Lange teksten, artikelen */
```

### Component Classes (`css/components.css`)

| Component | Classes |
|---|---|
| **Typografie** | `h1`–`h4`, `.h1`–`.h4`, `.lead`, `.label`, `.branding-display` |
| **Knoppen** | `.btn`, `.btn--medium`, `.btn--secondary`, `.btn--outlined`, `.btn--ghost`, `.btn--skewed`, `.btn--white` |
| **Tags** | `.tag`, `.tag--black`, `.tag--gold`, `.tag--outlined` |
| **Kaarten** | `.card`, `.card--overlay`, `.card--list`, `.card__image`, `.card__body`, `.card__title` |
| **Wedstrijd** | `.match-card`, `.match-card__score`, `.match-card__teams` |
| **Accordeon** | `details.accordion`, `.accordion__content` |
| **Formulieren** | `.form-group`, `.form-label`, `.form-hint`, `.form-error` |
| **Alerts** | `.alert`, `.alert--success`, `.alert--warning`, `.alert--error`, `.alert--info` |
| **Hero/Banner** | `.hero`, `.hero--red`, `.hero__title`, `.hero__content` |
| **Secties** | `.section`, `.section--white`, `.section--gray`, `.section--red`, `.section--black` |
| **Grid** | `.grid-2`, `.grid-3`, `.grid-4` (responsive) |

### Iconen (`icons/`)

531 SVG iconen in drie kleurvarianten en twee stroke-diktes:

```
icons/
├── BLACK/          # Zwarte iconen (4px stroke)
│   └── 2px/        # Zwarte iconen (2px stroke)
├── RED/            # Rode iconen (4px stroke)
│   └── 2px/        # Rode iconen (2px stroke)
└── WHITE/          # Witte iconen (4px stroke)
    └── 2px/        # Witte iconen (2px stroke)
```

Gebruik:
```html
<img src="node_modules/@psv/branding/icons/RED/ICON_PSV_red_arrow_right_4px.svg" alt="">
```

### Logo's (`logo/`)

Logo's voor PSV corporate, 15+ subbrands en Philips Stadion in meerdere formaten:

- **Online**: SVG, PNG (RGB)
- **Print**: EPS, PDF, JPG (CMYK)
- **Bewerkbaar**: AI (Adobe Illustrator)

```
logo/
├── PSV LOGO 2020/        # Corporate logo
│   ├── LOGO_PSV_corporate/
│   ├── LOGO_PSV-EMM/
│   └── LOGO_PSV_merch/
├── PSV Subbrands/        # PSV-Business, PSV-Esports, PSV-FANclub, etc.
└── Philips Stadion/      # Stadion logo
```

### Guidelines (`guidelines/`)

Officieel PDF-document met branding richtlijnen (maart 2026).

---

## Visuele referentie

Open `psv-design-system.html` in een browser voor een interactief overzicht van alle tokens, componenten en typografie.

---

## Bundler configuratie

Bij gebruik met webpack, Vite of andere bundlers worden de `url()` verwijzingen in `fonts.css` automatisch opgelost naar de TTF-bestanden in `node_modules/@psv/branding/font/`.

**Webpack**: Zorg dat `css-loader` is geconfigureerd (standaard bij Create React App, Next.js, etc.).

**Vite**: Werkt out-of-the-box.

---

## Versioning

Zie [CHANGELOG.md](CHANGELOG.md) voor wijzigingen. We gebruiken [Semantic Versioning](https://semver.org/):

| Versie bump | Wanneer |
|---|---|
| **Major** | Bestanden hernoemd/verwijderd, bestaande imports breken |
| **Minor** | Nieuwe assets of tokens toegevoegd |
| **Patch** | Correcties aan bestaande assets |
