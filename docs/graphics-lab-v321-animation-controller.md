# v321 PR D1 — deterministische animatiecontroller en atlas-lader

**Status:** technische integratiestap in Graphics Lab, **achter een opt-in vlag**.
De standaarddemo blijft v320 met SVG-soldaten; de reguliere Napoleonic RTS is
niet gewijzigd. Er zijn nog **geen goedgekeurde rasteratlassen** (PR B/C), dus
deze stap voegt ook geen kunst toe.

## Wat is er toegevoegd

| Bestand | Rol |
|---|---|
| `graphics-lab/render/infantry-animation-controller.js` | Pure, deterministische visuele staat per eenheid: `idle → march → aim → fire → reload → idle`. Geen `Math.random`, geen eigen klok. |
| `graphics-lab/render/sprite-atlas-loader.js` | Laadt config + beide Pixi-spritesheet-JSON's parallel, valideert de 6×3-cellen en PNG-maat, biedt alleen `getFrame(side,state,index)` en tekent met het gedeelde anker (48,78). |
| `graphics-lab/scene.js` | Kleine adapter: alleen bij `?sprites=atlas` worden atlasframes via de controller getekend. |

Beide modules zijn klassieke scripts (`globalThis.NRTSInfantryAnimation` /
`NRTSInfantryAtlas`, plus `module.exports` voor Node-tests), zodat de bestaande
codebase-audit ze kan parsen.

## Gedrag van de controller

- **Eén klok:** de lab-tijd (`state.time`) stuurt alles. Pauzeren geeft een
  pixel-identieke pose.
- **Mars** loopt alleen terwijl er werkelijk beweging is; elke eenheid krijgt
  een stabiele, uit zijn id afgeleide faseoffset zodat een regiment niet als
  één kopie stapt. Salvo's (aim/fire/reload) starten wel gelijktijdig.
- **Precies één `muzzle`-gebeurtenis per salvo**, ook bij een grote tijdsprong
  (bijv. een achtergrondtabblad): de controller loopt de one-shot-staten in
  volgorde af.
- **Nieuwe marsorder** onderbreekt aim/fire/reload direct; er blijft geen
  vuurframe of verlate mondingsflits achter.
- Een teruggezette klok (demo-scrubben) start de staat schoon opnieuw.

## Gebruik

```
/graphics-lab/?sprites=atlas
```

- Atlassen gevonden en geldig → `Canvas 2D · atlas-soldaten`.
- Ontbrekend of ongeldig → `Canvas 2D · SVG-terugval`, met de reden in
  `window.__GRAPHICS_LAB_V319__.getStats().atlasError`. Er worden nooit
  plaatsvervangende figuren getekend.
- Zonder vlag worden er géén atlasbestanden opgevraagd.

`getStats().animation` toont `updates`, `transitions`, `muzzleEvents` en `units`.

## Bewuste beperkingen (volgt in D2)

- Atlasmodus gebruikt nu alleen Canvas 2D; het Pixi-texturepad met dezelfde
  controller volgt in **PR D2**.
- Linksgerichte eenheden worden in het lab gespiegeld als tijdelijke oplossing
  tot er eigen linksgerichte kunst is (zie §2 van het implementatieplan).
- De bestaande rookoverlay is nog tijdgestuurd; koppeling aan `muzzle`-events
  volgt in D2.

## Tests

- `tests/headless/infantry-animation-controller-v321.test.js` — transities,
  één mondingsgebeurtenis bij tijdsprong, onderbreking door mars, pauze,
  faseoffsets en weigering van verschoven atlascellen.
- `tests/graphics-lab-v321-atlas.spec.js` — terugval zonder atlassen,
  ongewijzigde standaarddemo (geen atlasverzoeken) en een volledige
  atlas-route met een **synthetische testatlas die alleen in de test bestaat**.
