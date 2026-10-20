# Graphics Lab v320 — realistischere tweede proefscene

Naast de oorspronkelijke v319-assets heeft de demonstratie nu:
- **10 externe assets**: achtergrond, eikenboom, twee kazernes, twee basishoudingen van infanterie, twee alternatieve marsstanden, bevoorradingswagen en wereldvaste gras-/oeverdetails.
- **Geloofwaardiger stilstand**: regimenten gaan in de demo een stukje vooruit, houden halt, demonstreren vuur en trekken weer terug. Op stilstand bewegen de voeten niet langer schijnbaar door.
- **Kruitrook**: kleine, in de wind oplopende transparante rookwolken verschijnen uitsluitend tijdens de halte/vuurfase. De rook zit op een eigen 2D-overlay en onderschept nooit touchgebaren. Geen wijziging van de schotfysica in de echte game.
- **Atmosferisch licht**: uiterst subtiele, vaste sunlight-vignette en materiaaldetails. Op mobiel beperkt het standaard detailniveau de effectieve DPR.
- **Geen externe afbeeldingsdiensten**: alle graphics komen uit de eigen repo, PixiJS blijft een optionele, vastgepinde GPU-bibliotheek. Zonder Pixi werkt dezelfde uitgebreide demo via Canvas 2D.

De nieuwe soldatenanimatie is een **kleine tweestanden-prototypecyclus**, nog geen anatomisch volledig uitgewerkte 8-richtingen-animatie. De illustraties zijn vectorassets en nog geen fotorealistische prerender-sprites. Voor professionele moderne RTS-kwaliteit blijft betere artproductie de grootste volgende stap.

---
# Graphics Lab v319 — assetgedreven 2D-proefscene

## Direct te openen
GitHub Pages: `/graphics-lab/`
Offline/fallbackmodus zonder CDN: `/graphics-lab/?pixi=off`

## Afbakening
De proefscene is **een geïsoleerde technische en artistieke slice**, geen
vervanging van de bestaande Napoleonic RTS-renderer. Er is geen koppeling aan
de productie-simulatie en er zijn geen bestaande gamefuncties gewijzigd.

## Inhoud / assets
* `assets/battlefield.svg`: één historische terreinillustratie (gras, akkers,
  warme karrensporen, meanderende rivier, natte oevers en stenen brug).
* `assets/barracks-france.svg` en `assets/barracks-britain.svg`: afzonderlijke
  gebouwen met dakmateriaal, pannen, binnenplaats, schoorsteen en vlag.
* `assets/infantry-france.svg` en `assets/infantry-britain.svg`:
  legeronderscheid, musket, kruisbandeleer en marsuniform van bovenaf.
* `assets/oak.svg`: afzonderlijke oude loofboom met kroonlagen en schaduw.

Deze versie gebruikt kleine originele SVG-bestanden als **echte extern geladen
2D-sprites**; zij worden tot textures gerasterd en hergebruikt, niet elke frame
uit programmeergeometrie opgebouwd. Art is een kwaliteitsprobe; uitwerking van
loopcyclus, schaduwwerpende daken en afzonderlijke rivieranimatie zijn nog
verbeterpunten.

## Renderer en tests
* PixiJS 8.17.1 **vastgepind** via jsDelivr ESM CDN,
  uitsluitend in deze demo. Alle SVG-sprites zijn in de repository opgeslagen.
* WebGL/GPU-pad na succesvol laden; identieke assets renderen bij CDN-problemen
  via een Canvas2D-fallback. `?pixi=off` forceert de fallback voor regressies.
* Camerapan, muiswielzoom, tweevingerzoom, regimentselectie en statische
  schematische vergelijking (geen exacte screenshot van originele renderer).
* Instelbare soldatenaantallen (32/64/128), pixelresolutie en live RAF-FPS.
  RAF-FPS op zichzelf meet niet de GPU-tijd; een latere performancebenchmark
  moet GPU-frame-time en prestatie bij meerdere eenheden afzonderlijk meten.
* Vóór integratie in de echte game: cross-device beeldreview, asset-licenties
  controleren, schaal/oriëntatie vastzetten, animatie-atlassen ontwerpen,
  gedeelde rendererinterface + harde mobiele FPS-doelstelling invoeren.

## Bewuste beperkingen
De demo is een **bewijs van asset-pipeline en browserweergave**, niet een
bewijs dat de visuele kwaliteit reeds Age of Empires / Cossacks evenaart.
De eenvoudigere voorheen-weergave is **schematisch** en gebruikt dezelfde
punten; om exact vergelijkbare screenshots te krijgen moet dezelfde
spelsimulatie en viewport naar beide renderers worden gevoed.
Geen nieuwe map-, brug- of gameversie wordt in v319 geactiveerd.
