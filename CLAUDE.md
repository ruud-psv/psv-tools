## PSV Huisstijl

Dit project volgt de PSV huisstijl. Het pakket `@psv/branding` is geinstalleerd.

### Design bronnen

- Design tokens (CSS): `node_modules/@psv/branding/css/tokens.css`
- Component classes: `node_modules/@psv/branding/css/components.css`
- Font declaraties: `node_modules/@psv/branding/css/fonts.css`
- JSON tokens: `node_modules/@psv/branding/tokens/tokens.json`
- SCSS variabelen: `node_modules/@psv/branding/scss/_tokens.scss`

### Fonts

- `psv-condensed` (Bold 700) — koppen, knoppen, labels
- `psv-sans` (Regular 400, Bold 700) — body tekst
- `psv-text` (Regular 400, Bold 700) — lange teksten, artikelen

### Kleuren

- Primair: `#e82026` (PSV rood)
- Secundair: `#c00d0d` (donker rood)
- Goud: `#bb9753`
- Neutral dark: `#09101d`
- Grijs schaal: `#333` - `#eee`
- Status: success `#287d3c`, warning `#b95000`, error `#da1414`, info `#2e5aac`

### PSV Component Classes

Beschikbaar via `globals.css` (in `@layer components`):

| Component | Classes |
|---|---|
| **Typografie** | `.lead`, `.label`, `.branding-display` |
| **Knoppen** | `.btn`, `.btn--medium`, `.btn--secondary`, `.btn--outlined`, `.btn--ghost`, `.btn--skewed`, `.btn--white` |
| **Tags** | `.tag`, `.tag--black`, `.tag--gold`, `.tag--outlined` |
| **Kaarten** | `.card__image`, `.card__body`, `.card__title`, `.card__meta`, `.card--overlay`, `.card--list`, `.card__title-highlight` |
| **Wedstrijd** | `.match-card`, `.match-card__score`, `.match-card__teams`, `.match-card__team`, `.match-card__meta` |
| **Accordeon** | `details.accordion`, `.accordion__content` |
| **Formulieren** | `.form-group`, `.form-label`, `.form-hint`, `.form-error` |
| **Alerts** | `.alert`, `.alert--success`, `.alert--warning`, `.alert--error`, `.alert--info` |
| **Hero/Banner** | `.hero`, `.hero--red`, `.hero__title`, `.hero__content`, `.hero__bg`, `.hero__tag` |
| **Secties** | `.section`, `.section--white`, `.section--gray`, `.section--red`, `.section--black`, `.section--accent`, `.section__title` |
| **Grid** | `.grid-2`, `.grid-3`, `.grid-4` (responsive) |

### PSV Iconen

531 SVG iconen beschikbaar in `/public/icons/psv/` in drie kleurvarianten:

```
/public/icons/psv/
├── BLACK/          # Zwarte iconen (4px stroke)
│   └── 2px/        # Zwarte iconen (2px stroke)
├── RED/            # Rode iconen (4px stroke)
│   └── 2px/        # Rode iconen (2px stroke)
└── WHITE/          # Witte iconen (4px stroke)
    └── 2px/        # Witte iconen (2px stroke)
```

Gebruik in componenten:
```tsx
<img src="/icons/psv/RED/ICON_PSV_red_arrow_right.svg" alt="" />
```

### Regels

- Bij alle UI-wijzigingen: gebruik de PSV design tokens en component classes
- Koppen (h1-h4): `font-heading` + `uppercase`
- Labels: `font-heading` + `uppercase` + `tracking-wide`
- Knoppen: `font-heading` + `uppercase` + `tracking-wide`
- Geen hardcoded kleuren — gebruik Tailwind tokens of CSS custom properties
- Sidebar: donker thema (neutralDark achtergrond)
