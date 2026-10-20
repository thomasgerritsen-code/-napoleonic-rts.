# v321 — Atlasgenerator en validatie (PR A)

Dit is **werkende productietooling**, niet nog een update van de visuele demo. Graphics Lab blijft v320 totdat echte nieuwe frames zijn goedgekeurd en zichtbaar geïntegreerd.

## Invoer: geen plaatsvervangende/kunstmatige afbeeldingen

Maak/render voor elk land **17 verschillende hoogwaardige transparante PNG-frames** van exact 96×96 pixels, in de volgorde van `unit-animation-config.json`. Maak de houdingen vanuit **één vaste rig of 2D-puppet met dezelfde camera en lichtbron**. Eén gegenereerd portret is geen volledige animatie. De tijdelijke gekleurde testblokjes in de regressietests zijn **nooit** bestemd voor de game.

```text
art/frames/infantry/
  france/
    provenance.json
    fr_line_idle_01.png ... fr_line_idle_02.png
    fr_line_march_01.png ... fr_line_march_06.png
    fr_line_aim_01.png ... fr_line_aim_02.png
    fr_line_fire_01.png ... fr_line_fire_03.png
    fr_line_reload_01.png ... fr_line_reload_04.png
  britain/
    provenance.json
    br_line_idle_01.png ... (dezelfde 17 frames)
```

Per map is een goedgekeurde `provenance.json` vereist met daadwerkelijke bron- en gebruiksrechteninformatie:

```json
{
  "assetId": "france-line-infantry-v321",
  "sourceType": "original",
  "author": "Naam/rol daadwerkelijke maker",
  "usageRights": "Eigen werk, volledige gebruiksrechten (indien werkelijk van toepassing)",
  "sourceRef": "Locatie masterbestanden of reproduceerbare renderbron",
  "reviewedForUse": true,
  "referenceFacing": "screen-right",
  "pivot": {"x": 48, "y": 78},
  "feetAligned": true
}
```

Britse `assetId`: `britain-line-infantry-v321`. Zet **nooit** `reviewedForUse: true` zonder echte review. Gebruik de bestaande herkomstprocedures (`docs/AI_ART_PIPELINE.md` en `docs/asset-provenance-v1.md`).

## Bouwen

```bash
npm run art:atlas:pack -- --source-root art/frames/infantry
npm run art:atlas:validate
```

Standaard output: `art/generated/infantry-atlases/france/` en `britain/` (gitignored). Per land:
- PNG-atlas 576×288 px, 6×3 cellen met 17 volle frames en één transparante cel.
- Pixi-compatibele JSON-frame-/animatielijst.
- `atlas-provenance.json` met bron-/reviewgegevens, SHA-256 per pose, totaaldigest en voetlijnspreiding.

Alle invoer wordt eerst gecontroleerd vóór de output. Als eerst alleen de Franse set bestaat:

```bash
npm run art:atlas:pack -- --source-root art/frames/infantry --side france
npm run art:atlas:validate -- --side france
```

Een goedgekeurde set kan later apart worden gepromoveerd naar `graphics-lab/assets/sprites/infantry/` via de CLI-opties `--out` / `--input` en een gereviewde PR.

## Harde contracten

- 8-bit niet-geïnterlinieerde **RGBA PNG**; filters 0–4 worden zonder Pip-installatie verwerkt.
- Alle 17 namen exact, geen ontbrekende/extra/pixel-identieke poses.
- Exact 96×96, transparante rand zonder clipping, constante Pivot (48,78).
- Voet-/schaduwonderrand verandert maximaal 1 px tussen frames.
- Zinvolle maker, bron, rechten en expliciete review; onvolledige herkomst blokkeert compilatie.
- Geen sprite-trimming of automatische rotatie; de 18e cel blijft volledig transparant.
- Originele high-resolution masters (bij voorkeur 192×192 of groter) blijven buiten de web-runtime.

## Regressies

```bash
node --test tests/headless/infantry-atlas-v321.test.js
# of alle bestaande snelle checks:
npm run test:fast
```

Acht tijdelijke Python-testscenario's controleren beide echte PNG-bewerkingen, animatiemetadata, exacte SHA-herhaalbaarheid, ontbrekende frame/abort, reviews, duplicaten, clipping, afmetingen en CRC. Dit bewijst de **tooling**, niet de artistieke kwaliteit of de iPhone-FPS.

## Wat hierna volgt

**PR B:** Franse originele 17 frames produceren en beoordelen. **PR C:** Britse set met dezelfde rig/camera/schaal. **PR D:** één deterministische animatiecontroller en identieke frameselectie voor Pixi/Canvas; demo stijgt pas dan naar v321.

Een atlasgenerator maakt de sprites zelf niet mooier. De kwaliteitsverbetering volgt pas zodra echte goedgekeurde hoogwaardige beelden zijn gemaakt.
