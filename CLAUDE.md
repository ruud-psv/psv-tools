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

### Regels

- Bij alle UI-wijzigingen: gebruik de PSV design tokens en component classes
- Koppen (h1-h4): `font-heading` + `uppercase`
- Labels: `font-heading` + `uppercase` + `tracking-wide`
- Knoppen: `font-heading` + `uppercase` + `tracking-wide`
- Geen hardcoded kleuren — gebruik Tailwind tokens of CSS custom properties
- Sidebar: donker thema (neutralDark achtergrond)
