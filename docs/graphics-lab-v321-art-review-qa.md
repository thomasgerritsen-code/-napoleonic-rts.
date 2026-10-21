# v321 – Controle op visuele kwaliteit van soldatensprites

De bestaande atlasvalidator controleert bestandsformaat, pivots en rechten.
Deze **aanvullende visuele controle** beoordeelt per 96×96-frame de
silhouetten, been-/voetpixels, verschuiving, ongewenste losse delen en
voetlijn. Een enkele atlas wordt beoordeeld zonder een nieuwe afbeelding te
genereren.

## Voorbeeld

```bash
npm run art:review -- --atlas graphics-lab/assets/sprites/infantry/france/fr_line_infantry_atlas.png \
 --metadata graphics-lab/assets/sprites/infantry/france/fr_line_infantry_atlas.json \
 --html /tmp/franse-infanterie-review.html --json /tmp/franse-infanterie-review.json
```

Open de HTML lokaal om **alle 17 frames op originele 96px-grootte en op
24px gamegrootte** te vergelijken, met opmerkingen onder de afzonderlijke
frames. De pagina is zelfstandig: er is geen CDN, server of afbeelding naast
de HTML nodig. De JSON bevat per frame alpha-bounding-box,
been-/voetdekking, fragmenten, voetlijn, SHA-256 en waarschuwingen.

Voor Britse concepten werkt exact hetzelfde commando met `br_line_...`.

## Belangrijke beperkingen

- **Waarschuwingen zijn aanwijzingen, geen diagnose.** Niet elke losse
  component is een fout; een musket of uitrustingsstuk kan met opzet los
  zitten. Een voet die onder een ander been verdwijnt hoeft evenmin een
  anatomisch ontbrekend been te zijn. De controle is bedoeld om
  problematische frames sneller te vinden.
- **Geen automatische goedkeuring.** De status is altijd
  `VISUAL_REVIEW_REQUIRED`. Er is menselijke beeldcontrole nodig voor
  historische correctheid, anatomie, overeenkomende 2D-camerahoek,
  schaalgevoel en echte geloofwaardige cyclische marsbeweging.
- Bestaande `reviewedForUse:false` in de conceptprovenance wordt **niet**
  veranderd. Een art-reviewtool kan geen rechtenvrijgave verlenen.
- De handzame HTML toont 17 afbeeldingen per atlas maar opent geen live
  spelbesturing: de bestaande Graphics Lab blijft de plek voor animaties,
  touch en FPS-vergelijking.
- Deze tooling past geen PNG-pixels aan: onvolledige benen, onjuiste
  kijkhoeken en AI-inconsistenties moeten aan de artbron worden gerepareerd.

Testen: `node --test tests/headless/infantry-art-review-v321.test.js`.
De test gebruikt synthetische RGBA-frames met één bewust afgeknotte
`march_02` en toont aan dat de waarschuwing wordt gegeven. De testdata
zijn geen productie-assets.
