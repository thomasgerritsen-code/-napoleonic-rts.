# Graphics Lab v322 — PR A: PNG-atlasbouwer

Dit is een kleine implementatie van het op 20 oktober afgesproken v321-spriteplan: **alleen pakker, contract en automatische validatie**. Er zijn bewust nog geen definitieve PNG-soldaten en geen wijziging aan de game of aan Graphics Lab v320. Bestaande SVG's worden niet als nieuwe schilderachtige frames voorgedaan.

## Contract en mappen

- Beiden legers krijgen 17 verschillende 96x96 RGBA PNG-frames met transparante marge.
- Pixi/Canvas output: per land 576x288 atlas, 6x3 cellen met de 18e leeg, pivot (48,78), anchor (0.5,0.8125), vaste screen-right kijkrichting.
- Animaties: idle 2, march 6, aim 2, fire 3, reload 4. Zie graphics-lab/assets/sprites/unit-animation-config.json.
- Voetgrondlijn over frames maximaal 1 pixel verschil; frames mogen geen exacte duplicaten zijn.
- Alle beelden zijn herleidbaar tot een goedgekeurde bron: zie docs/asset-provenance-v1.md.

Voor de Franse atlas vereist de bouwer onder art/approved/infantry/france/ de bestanden:

    provenance.json
    fr_line_idle_01.png
    fr_line_idle_02.png
    fr_line_march_01.png ... fr_line_march_06.png
    fr_line_aim_01.png ... fr_line_aim_02.png
    fr_line_fire_01.png ... fr_line_fire_03.png
    fr_line_reload_01.png ... fr_line_reload_04.png

De Britse tegenhanger staat in art/approved/infantry/britain/ met prefix br_line_ en exact dezelfde toestanden en posities.

De verplichte provenance.json bevat ingevulde, controleerbare velden:

    {
      "assetId": "french-line-infantry-v1",
      "sourceType": "original",
      "sourceReference": "traceable art / rig source path",
      "license": "documented usage rights",
      "author": "artist / creator",
      "date": "2026-10-21",
      "transformations": ["rig render", "RGBA downsample to 96px"]
    }

Vervang dit voorbeeld door echte herkomst, rechten en de werkelijke auteur. Onbekende licenties zijn niet toegestaan. De herkomst wordt in de gegenereerde JSON ingesloten.

## Commando's

    python3 scripts/build-infantry-atlas.py --side france
    python3 scripts/build-infantry-atlas.py --side britain
    python3 scripts/build-infantry-atlas.py --side all
    python3 scripts/validate-infantry-atlas.py --side all
    node --test tests/headless/infantry-atlas-v322.test.js

Met --source en --out kan een tijdelijke invoer-/uitvoermap worden gekozen. De standaard output is graphics-lab/assets/sprites/infantry/france/fr_line_infantry_atlas.png en .json, of de overeenkomstige Britse map en prefix.

Dit script gebruikt alleen Python 3 en het standaardbibliotheekonderdeel zlib. PNG's worden op CRC, RGBA kleurmodel, voetgrondlijn, doublures en afmetingen gecontroleerd. De output heeft PixiJS-spritesheet-JSON, maar wordt pas na artistieke goedkeuring in de demo aangesloten.

## Tests en scope

De Node-headlesstests creëren tijdelijke unieke pixel-fixtures, bouwen beide atlassen, valideren de JSON en voorkomen fouten zoals missende frames, licentie, foutieve pivots, identieke houdingen of opspringende voetposities. **Testplaatjes zijn geen game-art** en worden niet ingecheckt.

PR B: originele hoogwaardige Franse masterpose en 17 anatomisch consistente poses. PR C: Britse animaties. PR D: schakel beide atlassen in op Graphics Lab, met Pixi/Canvas fallback, telefooncontrole, FPS en echte beeldreview. Pas een latere release verandert eventueel de RTS.
