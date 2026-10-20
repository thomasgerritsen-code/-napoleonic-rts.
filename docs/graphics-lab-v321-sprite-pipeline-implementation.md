# Graphics Lab v321 — uitvoerbaar implementatieplan voor geanimeerde infanterie-atlassen

**Status:** goedgekeurde scope / bouwplan, **geen al geïmplementeerde v321-gameupdate**.  
**Basis:** `main`, Graphics Lab v320 (geïsoleerd op `/graphics-lab/`).  
**Richting:** historisch semi-realistisch, schilderachtig, strak orthografisch 2D; géén nieuwe 3D-engine.  
**Doel:** originele, aanzienlijk rijkere Franse en Britse lijninfanterie in afzonderlijke PNG-atlassen met reproduceerbare frames, herlaad-/vuuranimaties en dezelfde gedragsstaat op PixiJS én de Canvas-fallback.

## 0. Wat er daadwerkelijk in de code staat

- `graphics-lab/scene.js` laadt op dit moment tien losse SVG-afbeeldingen (`files`), rendert PixiJS via een vanaf CDN geladen ESM-module en valt terug op Canvas2D met `?pixi=off`.
- `formationCycle()` bepaalt momenteel uit de tijd een demo met oprukken, halt/vuren, terugtrekken. `soldierPose()` heeft maar twee houdingen per land; `drawFrame()` vervangt in Pixi textures per frame. In Canvas gebeurt dezelfde keuze in `painter()`.
- `drawAtmosphere()` verzorgt een afzonderlijke musketrookoverlay. `#gesture` en de cameracode zijn onafhankelijk van de kunst.
- `scripts/generate-art.mjs`, `art-pipeline/prompts.json` en `docs/AI_ART_PIPELINE.md` bestaan al voor generatie, review en herkomstregistratie. Gebruik deze herkomstketen; niet opnieuw bedenken.
- **Niets** aan `index.html` in de ROOT, economie, formatie, AI, route-/bruglogica of productie-simulatie veranderen in deze fase.
- Bij een graphics-lab-bouwverandering krijgt de demo het label **v321**. De reguliere RTS behoudt haar eigen semantische versie totdat die daadwerkelijk verandert.

## 1. Eerst de artistieke bron, dan de atlas

Het echte kwaliteitsverschil komt van hoogwaardige bronframes met **consistent personage en lichaamsdelen** — niet van hetzelfde SVG-figuurtje zeventienmaal verschuiven. De huidige tekst-naar-afbeelding-artpipeline kan conceptart helpen genereren, maar garandeert nog geen frame-to-frame-identiteit. Daarom:

1. Ontwerp één Franse en één Britse **master pose** (uniform, shako, wapens, silhouet) en controleer die op de werkelijke game-schaal.
2. Maak posevarianten vanuit **één rig / 3D- of 2D-puppetbron**, met een vergrendelde camera, lichtbron en model. Een rendering naar transparante PNG's is toegestaan; de **runtime blijft 2D**.
3. Gebruik AI-conceptart alleen als goedgekeurde stijlreferentie of bron voor professioneel opgeschoonde onderdelen; losse AI-beelden zijn geen betrouwbare animatiecyclus.
4. Render masters in minstens `192×192` RGBA (of hoger) en schaal gecontroleerd terug naar `96×96` per frame. Bewaar de masters buiten de gebundelde webassets; bewaar auditbare herkomst/bronmetadata.
5. Controleer kledinghistorie (Frans donkerblauw vs Brits rood, kruisbandeleer, shako, houten musket), dezelfde karakterlengte en herkenbaarheid bij **ca. 29 px spriteschaal**.
6. Licht valt altijd linksboven; schaduw kort naar rechtsonder. Voorkom wisselende lichtval of perspectief tussen frames; geen matte achtergrond in transparante sprites.

**Artistieke acceptatie:** bij normale telefoonzoom is in één oogopslag te zien welk leger en of de soldaat loopt, richt, schiet of herlaadt. Geen vervormde benen/handen/bajonetten.

## 2. Exacte atlas-/framecontracten

| Contract | v321 |
|---|---|
| Zijdes | `france` en `britain`, exact dezelfde framing |
| Standaard outputframe | **96 × 96 px**, RGBA met transparante achtergrond |
| Referentiepunt (pivot) | **(48, 78) px** = `anchor: (0.5, 0.8125)`, gelijk in elk frame |
| Illustratierichting | één vastgelegde referentierichting (rechts op het scherm) |
| Atlas per natie | **576 × 288 px**: 6 kolommen × 3 rijen, 17 bezette cellen en 1 lege cel |
| Assets | `fr_line_infantry_atlas.png/.json` en `br_line_infantry_atlas.png/.json` |
| Standaard layout | links-naar-rechts, boven-naar-beneden; zonder trimming/rotatie |
| Kleur/alphakanaal | sRGB 8-bit RGBA, zuiver transparant, geen achtergrondkleur |
| Schaduw | korte zachte contactschaduw voor leesbaarheid, zonder dubbele versterking in renderer |
| Resolutie-/schaalbeleid | frame blijft fysiek 96 px, visueel formaat instelbaar onafhankelijk van Zoom/DPR |
| Extensie | 4 of 8 anatomisch juiste richtingen in aparte atlasvakken bij volgende stap |

**Belangrijke beperking:** één richting is een bruikbare **proef**, maar één schuin 2D-renderbeeld roteren over 360° oogt vaak onnatuurlijk. Test v321 frontaal onder de vaste referentiehoek. Bouw de data-API nu al richtingbewust, maar claim geen overtuigende 8-richtingenbeweging totdat die art echt bestaat. Niet horizontaal spiegelen als het musket/riemen historisch verkeerd zet.

**Framevolgorde per atlas:**

| Index (zero-based) | Animatie | Frames | Prefix |
|---|---|---:|---|
| 0–1 | idle | 2 | `fr_line_idle_01` … `02` |
| 2–7 | march | 6 | `fr_line_march_01` … `06` |
| 8–9 | aim | 2 | `fr_line_aim_01` … `02` |
| 10–12 | fire | 3 | `fr_line_fire_01` … `03` |
| 13–16 | reload | 4 | `fr_line_reload_01` … `04` |

Gebruik voor Britse frames `br_line_...`. **17 frames per land, 34 totaal**. Output per atlas 6 × 3 cellen; cel 17 blijft volledig transparant.

## 3. Metadata: PixiJS-compatibel, maar engine-onafhankelijk

Genereer per land een **standaard PixiJS-spritesheet-JSON** én een kleine, afzonderlijke `unit-animation-config.json` voor tijden en pivot. De `frames` hebben vaste celcoördinaten en `sourceSize`/`spriteSourceSize`; `meta.image` verwijst relatief naar de PNG; `animations` verwijst naar de framenaamsleutels.

Bijvoorbeeld de eerste atlascel (de overige cellen worden automatisch gegenereerd):

```json
{
  "frames": {
    "fr_line_idle_01": {
      "frame": {"x": 0, "y": 0, "w": 96, "h": 96},
      "rotated": false,
      "trimmed": false,
      "sourceSize": {"w": 96, "h": 96},
      "spriteSourceSize": {"x": 0, "y": 0, "w": 96, "h": 96},
      "anchor": {"x": 0.5, "y": 0.8125}
    }
  },
  "animations": {
    "idle": ["fr_line_idle_01", "fr_line_idle_02"],
    "march": ["fr_line_march_01", "fr_line_march_02", "fr_line_march_03", "fr_line_march_04", "fr_line_march_05", "fr_line_march_06"],
    "aim": ["fr_line_aim_01", "fr_line_aim_02"],
    "fire": ["fr_line_fire_01", "fr_line_fire_02", "fr_line_fire_03"],
    "reload": ["fr_line_reload_01", "fr_line_reload_02", "fr_line_reload_03", "fr_line_reload_04"]
  },
  "meta": {"image": "fr_line_infantry_atlas.png", "size": {"w": 576, "h": 288}, "scale": "1"}
}
```

Dit fragment is **illustratief**, niet een complete atlas; het script produceert alle 17 `frames`. PixiJS ondersteunt het laden van spritesheet-JSON via `Assets.load` en levert `sheet.animations[state]` voor een `AnimatedSprite`. Houd de frameselectie daarnaast **deterministisch in een eigen state-controller**, zodat Pixi en Canvas bij dezelfde tijd altijd dezelfde cel tonen en pauzeerbaarheid niet van een Pixi-ticker afhangt.

Tweede metadata-config, identiek voor beide landen:

```json
{
  "version": 1,
  "frameWidth": 96,
  "frameHeight": 96,
  "pivot": {"x": 48, "y": 78},
  "referenceFacing": "screen-right",
  "states": {
    "idle": {"frames": 2, "frameMs": 500, "loop": true},
    "march": {"frames": 6, "frameMs": 110, "loop": true},
    "aim": {"frames": 2, "frameMs": 260, "loop": false},
    "fire": {"frames": 3, "frameMs": 95, "loop": false},
    "reload": {"frames": 4, "frameMs": 425, "loop": false}
  },
  "muzzleEvent": {"state": "fire", "frame": 1}
}
```

## 4. Precieze wijzigingen per bestand

**Nieuwe mappen en assets** (2 PNG's + 2 JSON's; echte frames, géén placeholder-png's):

```text
graphics-lab/
  assets/
    sprites/
      infantry/
        france/
          fr_line_infantry_atlas.png
          fr_line_infantry_atlas.json
        britain/
          br_line_infantry_atlas.png
          br_line_infantry_atlas.json
      unit-animation-config.json
  render/
    sprite-atlas-loader.js
    infantry-animation-controller.js
    infantry-pixi-renderer.js
    infantry-canvas-renderer.js
  scene.js                    # kleine adapter; NIET volledig herschrijven
  index.html                 # version badge v321, cache-busting
  README.md                  # links, assets, fallback, beperkingen
scripts/
  build-infantry-atlas.py     # deterministische RGBA PNG packing + metadata
  validate-infantry-atlas.py  # exportkwaliteit, pivots, ontbrekende frames
tests/
  graphics-lab-v321.spec.js
  headless/infantry-atlas-v321.test.js
docs/
  graphics-lab-v321-sprite-pipeline-implementation.md
```

* `scripts/build-infantry-atlas.py` leest per land 17 geordende 96×96 PNG's (bronmappen geen runtime dependencies), plakt rasterdata zonder dynamische trimming tot 576×288 en genereert beide JSON's. Faal op foutieve afmetingen, ontbrekende frames, ongeldige alpha, niet-bestaande bron, duplicaten of ontbrekende licentie/herkomst.
* `scripts/validate-infantry-atlas.py` toetst PNG-signature, 576×288, 17 correcte celrechthoeken, exacte animatiesleutels en pivots, plus controle op alfa-bounding-box en ongewenst springen van de voetpositie.
* `sprite-atlas-loader.js` valideert config/metadata bij opstart, laadt beide landen **parallel**, cachet Pixi-sheets / HTML-image-buffers en geeft uitsluitend `getFrame(side,state,index)` terug.
* `infantry-animation-controller.js` krijgt `unitId`, `nowMs`, `motionState` en optioneel `volleyEvent`, houdt tijden/transities vast en kiest `state`/`frameIndex`. Geen `Math.random` of aparte tijdbron per unit.
* `infantry-pixi-renderer.js` gebruikt één sprite per eenheid, hergebruikt textures en raakt alleen de `texture` bij framewisseling. Animation playback door onze controller, niet een onafhankelijke ticker die de Canvas-fallback uit fase laat lopen.
* `infantry-canvas-renderer.js` tekent `drawImage(atlasImage, sx, sy, 96, 96, dx, dy, dw, dh)` vanuit dezelfde `frameIndex`; de fallback behoudt hetzelfde anker en footprint.
* `graphics-lab/scene.js` blijft eigenaar van camera, regimentpositie, selectie, `formationCycle` en rookeffect. Hij maakt alleen de controller aan, vraagt frames op en voert hun drawcalls uit; bestaande `?pixi=off` moet blijven werken.
* Oude SVG-soldaten blijven tijdelijk beschikbaar achter `?sprites=legacy`; na visuele goedkeuring kan die fallback worden opgeruimd. Oude referentieweergave blijft bestaan; beide tonen exact dezelfde camera, positie en tijd.

## 5. State-machine en demotijdlijn

De **visual state-machine** is onafhankelijk van de gevechtsengine. Dit is een demo, geen verandering van schade, herlaadduur of aanvalskansen in het spel.

```text
idle ── move order ──> march ── stop ──> aim
 ^                                     |
 |                                     v
 └────────── reload <────── fire <─────┘

Bij nieuwe move tijdens aim/reload: visuele overgang naar march,
maar geen onzichtbare gameorders op het echte speelveld.
```

| Gebeurtenis | Verwacht gedrag |
|---|---|
| stilstaand | idle van 2 frames, geen loopvoeten |
| marcherende groep | 6 frames cyclisch, cadans gekoppeld aan afgelegde afstand/snelheid |
| stoppen om te schieten | aim 2 frames, voetpositie blijft vast |
| vuur | fire 3 frames, precies één `muzzleEvent` bij frame 2 |
| herladen | reload 4 frames, keert terug naar idle of aim |
| nieuwe marsorder | eerst veilige onderbreking; geen achterblijvende fire-frame |
| pauze | pose blijft pixel-identiek staan; rook en controller pauzeren mee |

Gebruik een *enkele klok* vanuit Graphics Lab voor beide renderpaden. Voor veel eenheden geef je per unit een kleine **deterministische** faseoffset zodat 128 man niet als één identieke kopie lijken te lopen, maar laat salvo's binnen één regiment wel samen starten.

## 6. Gefaseerde, kleine PR's

**PR A — contract + packer + headless validatie.** Documentatie, scripts, metadata-generatie en voorbeeldverificatierapport. Nog geen demo- of gameswitch. Verwacht: twee definitieve atlasbronnen worden door de packer ondersteund, niet nagemaakt door code.

**PR B — Franse lijninfanterie, 17 definitieve frames.** Eén Frans atlas-PNG+JSON, alfatests, zoom-/silhouet-review, licentie/herkomst. Merge pas na visuele beoordeling.

**PR C — Britse lijninfanterie, 17 definitieve frames.** Exact dezelfde pivots, schaling, posevolgorde en celmaat. Vergelijk rood/blauw bij de echte telefoonzoom.

**PR D — gelijktijdige Pixi/Canvas-integratie in Graphics Lab v321.** Adapter, state-machine, laden, pauze, rook-koppeling, telefoonpan/pinch, vergelijken en FPS. Demo-label pas verhogen wanneer er werkelijk een zichtbare nieuwe sprite-set is.

**PR E (alleen indien noodzakelijk) — optimalisatie uit metingen.** Atlastooling/compressie, LOD/texture reuse en documentatie van de meting; geen ongefundeerde performancebeloftes.

## 7. Toetsen en bewijzen voordat v321 live gaat

### Technisch automatiseren

1. Alle **34 frames** bestaan en corresponderen exact met de 2 JSON-manifests. Geen lege of mislukte frames.
2. Beide png's zijn 576×288, RGBA en hebben niet-transparante persoonspixels en een transparante marge. Pivot identiek; voetpositie tussen frames max. **1 outputpixel** afwijking op de grondlijn.
3. Controller heeft deterministische `idle → march → aim → fire → reload → idle`-transities; geen afvurende marsanimatie.
4. Het `muzzleEvent` wordt **exact eenmaal** per salvo gegenereerd; rook en flash niet dubbel.
5. PixiJS en Canvas-fallback komen overeen in afgebeelde pose, positie, panning en pixelanker op één bevroren frame.
6. Mobiel portrait/landscape: tikselectie en tweevingerige zoom zonder spookorders; `?pixi=off` en geblokkeerde CDN werken.
7. 32/64/128 soldaten met stabiele spritecount; selectie en wisselen van styles laten geen textures/sprites achter.
8. Alle bestaande Graphics Lab v319/v320- en productie-smoke-/bewegingstests blijven groen.

### Performance + visuele keuring

- **Prestatie-doel, geen reeds aangetoonde waarde:** 60 FPS voor 32/64 op een representatieve iPhone, **minstens 30 FPS voor 128** bij standaarddetail. Gebruik **werkelijke iOS Safari** én desktop Chromium voor goedkeuring; browseremulatie alleen is onvoldoende.
- Metingen: na **10 s opwarming**, 30 s opname, rapporteer gemiddelde FPS, p5/95-frametijd, DPR, zoom, browser en hardware; aparte resultaten Pixi/Canvas. `requestAnimationFrame`-FPS meet geen volledige GPU-tijd.
- Screenshots dezelfde camerastand, eenheid, frame en zoom in v320 vs v321. Keur aan op materiaalgevoel, historisch silhouet, variatie en leesbaarheid; **niet** enkel tests slagen.
- Geen generatie van derden promoveren zonder de al bestaande herkomst-/licentieprocedure in `docs/asset-provenance-v1.md`.

## 8. Stopcondities / rollback

- Geen hoogwaardige poseconsistente 17-frame bron? **Niet** 17 quasi-identieke AI-frames als gereed presenteren. Eerst een kleinere echte kwalitatieve `idle/march`-set beoordelen; uitbreiding volgt daarna.
- Instabiel GPU-pad? Hou `?pixi=off` en schakel de atlaslaag uit met `?sprites=legacy`; de gewone game mag nooit afhankelijk worden van het experiment.
- Niet voldoen aan telefoon-FPS of ongewenste spriteschaal? Hergebruik dezelfde pipeline met lager detail / texturebudget; niet aan pathfinding of de HUD sleutelen om het plaatje passend te krijgen.

## 9. Definition of Done v321

- Twee **daadwerkelijke rasteratlassen** + complete JSON, geen placeholderassets.
- 17 unieke correct geanimeerde poses per land, stabiel voetanker en historische herkenbaarheid.
- Echte visuele demonstratie in `/graphics-lab/`, inclusief beide renderpaden en pauze-/vergelijkcontrole.
- Testresultaten én voor-/na-beelden + mobiele hardwareprestatie genoteerd.
- Gewone Napoleonic RTS onveranderd. Pas een latere, afzonderlijk geteste release integreert het resultaat in de hoofdgame.

**Volgende directe uitvoeractie:** PR A (deterministische packer, manifestcontract, headless validatie) starten, daarna één Franse master en een échte marchcyclus realiseren voordat 34 frames tegelijk worden geproduceerd.
