# Ticketing Herdgang

De bezetting van thuiswedstrijden van Jong PSV en PSV Vrouwen op De Herdgang, per vak.
De Herdgang heeft geen genummerde stoelen, alleen staanvakken. Daarom gaat deze pagina
over aantallen per vak en niet over losse stoelen zoals [Aangrenzende stoelen](aangrenzende-stoelen.md).

Pagina: `/dashboard/ticketing-herdgang`.

De keuzelijst toont standaard alleen wedstrijden waarvan de naam begint met `Jong PSV -`
of `PSV Vrouwen -` (`lib/ticketing-herdgang/events.ts`). Ringside geeft in de stroom die
we bijhouden geen locatie mee; de thuisploeg staat wel altijd voorop. Met "Toon alle
evenementen" komt de rest terug.

## Bron

Dezelfde stoelstatus als Aangrenzende stoelen (`lib/ringside/seat-state.ts`, zie
"Stoelstatus uit Ringside" in `docs/aangrenzende-stoelen.md`). Er komt niets extra's
uit Ringside bij; alleen de capaciteit wordt nu ook bewaard.

- **Staanvak:** in `/v1/manifests` één rij per vak, met `is_ga = true` en een
  `capacity` (bijvoorbeeld 703). Elk ticket in `/v1/sales` wijst via `manifest_id`
  naar die rij.
- **Capaciteit:** de som van `capacity` per vak, zonder rijen met
  `is_excluded_from_reported_capacity`.
- **Verkocht:** geldige tickets, met dezelfde regel als bij Aangrenzende stoelen. Een
  openstaande reservering telt dus mee, en een ticket dat in de resale staat ook.
- **In de resale:** het deel van verkocht met `resale_status = 'Posted'`.
- **Vrij:** per rij die te koop is (`is_counted_as_available`) de capaciteit min de
  tickets erop. Een geblokkeerd vak heeft dus 0 vrij.
- **Bezetting:** verkocht gedeeld door capaciteit.

De berekening staat in `lib/ticketing-herdgang/occupancy.ts` en is getest.

## Capaciteit aanvullen

De stoelstatus bewaarde eerst geen capaciteit. Na deze wijziging leest de cron
(`/api/ringside/stoelen`) `/v1/manifests` nog één keer helemaal door, alleen om de
capaciteit aan te vullen (`applyManifestCapacity()`). Dat gebeurt alleen met de tijd
die over is als de gewone stromen bij zijn, dus Aangrenzende stoelen merkt er niets
van. Tot die ronde klaar is (`capacityComplete` in de toestand), toont de pagina een
waarschuwing: een staanvak kan dan op capaciteit 1 staan.

## Plattegrond

Na "Toon bezetting" toont de pagina de plattegrond van De Herdgang met per vak de
bezetting (`components/herdgang-map.tsx`). De vakken zijn nagetekend van de officiële
plattegrond (`lib/ticketing-herdgang/herdgang.ts`, oktober 2026): Noord A t/m J, Oost
K t/m O, Zuid P t/m V (V is het bezoekersvak). Vak E ligt aan twee kanten van de
rolstoelplaatsen en staat er twee keer op. De rolstoelplaatsen en het blok in Zuid
zonder vak zijn alleen decor.

- **Kleur:** bezetting (verkocht gedeeld door capaciteit) in vier klassen van licht-
  naar donkerrood: tot 25%, 25–50%, 50–80% en 80% of meer. Lichtgrijs is niets verkocht.
  Het percentage staat altijd als getal in het vak.
- **Cijfers:** wijs een vak aan en ernaast verschijnen capaciteit, verkocht, resale,
  vrij en bezetting. Klikken zet het vak vast.
- **Vaknamen:** Ringside mag `Vak A` of `a` geven; op de kaart wordt dat `A`
  (`mapArea()`). Vakken die niet op de kaart passen, worden eronder genoemd en staan
  wel in de tabel ("Als tabel").

## Nog te doen

- **Lijst seizoenkaarthouders** voor De Herdgang: wat de pagina daarmee moet doen, is
  nog open.
- Nagaan met `/api/ringside/probe?path=/v1/catalog&rows=0&distinct=venue` of Ringside
  De Herdgang als locatie kent; dan kan de keuzelijst daarop filteren in plaats van op
  de naam.
