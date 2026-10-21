# Graphics Lab v322 — isometrische Blender-proef

**Status:** proef in Graphics Lab (`/graphics-lab/iso.html`). De speelbare game
en de standaard-lab (v320) zijn niet gewijzigd.

## Doel
Toetsen of vooraf gerenderde 3D → 2D-sprites in een schuine (isometrische)
camera de grote stap richting Age of Empires / Cossacks / Stronghold geven.

## Pijplijn
1. `scripts/render-iso-infantry.py` (Blender 5.x via `pip install bpy`) bouwt
   een **eigen procedureel model** van een fuselier uit eenvoudige vormen:
   jas met revers/kraag/manchetten/panden, witte kruisbanden, ransel met rol,
   shako met plaat en pompon, geschouderd musket met bajonet. Frans en Brits
   delen exact dezelfde rig; alleen het kleurenschema verschilt.
2. Vaste orthografische camera (30° elevatie), vaste zon linksboven, korte
   schaduw via een kleine schaduwvanger. Cycles CPU, 48 samples, denoise.
3. Per natie 8 richtingen × (2 idle + 6 mars) = 64 frames van 128×128 px,
   voetanker (64,104).
4. `scripts/pack-iso-atlas.py` maakt per natie één 1024×1024 RGBA-atlas +
   Pixi-JSON (`graphics-lab/assets/sprites/iso/`). Het controleert lege frames,
   identieke frames en afgesneden randen, en wist alleen render-ruis onder
   ~6 % dekking. `--preview` maakt vergrote beoordelingsvellen.

```bash
python3 -m venv .bvenv && .bvenv/bin/pip install bpy
.bvenv/bin/python scripts/render-iso-infantry.py --side france --out art/frames/iso-proof
.bvenv/bin/python scripts/render-iso-infantry.py --side britain --out art/frames/iso-proof
python3 scripts/pack-iso-atlas.py --frames art/frames/iso-proof --out graphics-lab/assets/sprites/iso
```
Volledige render van beide naties duurt ongeveer 1 minuut op CPU.

## De proefscène
- Ruitvormige graszone met zachte vlekken en een zandweg in een achthoek,
  zodat elk regiment alle 8 richtingen loopt.
- Projectie past exact bij de Blender-camera: grond verkort met sin 30° = 0,5;
  de spritekeuze volgt uit de looprichting op de grond.
- Marscadans hangt aan afgelegde afstand (regiment loopt in de pas, nooit op
  de plaats). Halt → idle-frames. Pauze bevriest het beeld.
- Bovenin een strook met de Franse soldaat in alle 8 richtingen.
- Schuiven, knijp-/scrollzoom; 2 × 16/32/64 soldaten. Canvas 2D.

## Herkomst
`graphics-lab/assets/sprites/iso/provenance.json`: origineel, geen modellen,
texturen of animaties van derden. `reviewedForUse:false` totdat de eigenaar
de beelden heeft goedgekeurd voor de game.

## Bekende beperkingen / volgende stappen
- Eenvoudige vormen: leesbaar en consistent, maar nog geen AoE-detailniveau.
  Volgende winst: betere modellering (handen, gezicht, plooien), textuur,
  randverlichting en teamkleurmasker.
- Nog geen richt-/vuur-/herlaadanimaties in 8 richtingen.
- Bochten in de colonne zijn nog abrupt (geen echte zwenkbeweging).
- Grond en weg zijn eenvoudig; gebouwen en bomen in dezelfde camera volgen.

## Tests
- `tests/headless/iso-atlas-v322.test.js` — atlasindeling, PNG-maat, herkomst.
- `tests/graphics-lab-iso-v322.spec.js` — laden, alle 8 richtingen zichtbaar,
  pauze, halt en knijpzoom op een telefoon.
