# PSV voor Open Design

Een design system voor [Open Design](https://github.com/nexu-io/open-design), afgeleid van `@psv/branding`.

```
psv/
├── manifest.json   # metadata (schema od-design-system-project/v1)
├── DESIGN.md       # de huisstijl in woorden, voor de agent
└── tokens.css      # dezelfde waarden als CSS custom properties
```

## Gebruiken

1. Kopieer de map `psv/` naar `design-systems/psv/` in je Open Design-installatie.
2. Installeer de fonts uit `../font/` (PSV Condensed, PSV Sans, PSV Text) op je computer, anders rendert Open Design met de fallbacks.
3. Kies "PSV" in de design-system-picker en vraag om een deck, one-pager of prototype.

## Bijhouden

`tokens.css` hier is een vertaling van `../css/tokens.css` naar de tokennamen van Open Design (`--bg`, `--accent`, `--font-display`, ...). Verandert er een merkwaarde, pas dan alle drie aan: `../css/tokens.css`, `psv/tokens.css` en `psv/DESIGN.md`.

Niet gevalideerd met `pnpm guard` van Open Design; dat draait alleen in hun eigen repository.
