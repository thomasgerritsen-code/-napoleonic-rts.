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

---

# v323 — verfijnd model, gebouwen, natuur en Blender-terrein

## Wat er bij komt
- **Gedeelde basis** `scripts/iso_blender_common.py`: één camera (orthografisch,
  30°), één sleutelzon linksboven plus warm randlicht, en een materiaal-
  bibliotheek met procedurele oppervlakken (stofweefsel, huid, pleister,
  baksteen, dakpannen, leien, planken, riet, bladeren, schors, gras, aarde,
  akkerrijen). Alle onderdelen staan daardoor in dezelfde wereld.
- **Verfijnde soldaat**: knopen, kinschubben, haar, neus, oren, schouder-
  stukken (Brits met wollen kwastjes), koppelplaat, broodzak, bajonetschede,
  Britse veldfles, ranselriemen, musket met loop, slot, banden en draagriem,
  Britse pluim. Voetanker nu (64,108) zodat de bajonet nooit wordt afgesneden.
- **Gebouwen en natuur** `scripts/render-iso-props.py`: Franse kazerne
  (pleister, groene luiken, driekleur), Britse kazerne (baksteen, hoekstenen,
  Union Flag), vakwerkboerderij met pannendak, schuur en stenen huisje met
  rieten dak, put, hooiberg, eik, populier, struik en hek. Gebouwen staan
  schuin (±30°) zodat twee gevels en een topgevel zichtbaar zijn, zoals in
  Age of Empires. Elk object heeft een eigen zachte contactschaduw die naar de
  rand toe uitloopt.
- **Terrein** `scripts/render-iso-ground.py`: gras met vlekken, ~4200
  graspollen, bloemen, zandweg (achthoek + twee uitlopers) met berm en
  steentjes, drie akkers en een vijver, gerenderd als één JPEG.
- **Indeling** `graphics-lab/assets/iso/layout.json` wordt door Blender
  (terrein) én door de lab-pagina (gebouwen, bomen) gelezen, zodat weg en
  objecten exact samenvallen.
- **Lab** (`/graphics-lab/iso.html`, v323): terrein-JPEG als ondergrond,
  objecten en soldaten in één diepte-volgorde; zonder Blender-terrein valt de
  pagina terug op het eenvoudige getekende terrein.

## Opnieuw renderen (ongeveer 4 minuten op CPU)
```bash
.bvenv/bin/python scripts/render-iso-infantry.py --side france --out art/frames/iso-proof
.bvenv/bin/python scripts/render-iso-infantry.py --side britain --out art/frames/iso-proof
python3 scripts/pack-iso-atlas.py --frames art/frames/iso-proof --out graphics-lab/assets/sprites/iso
.bvenv/bin/python scripts/render-iso-props.py
.bvenv/bin/python scripts/render-iso-ground.py
```

## Tests
- `tests/headless/iso-scene-v323.test.js`: atlassen, herkomst, elk object uit
  de indeling heeft een sprite met kloppende PNG-maat, terrein aanwezig en
  geen object op de marsroute.
- `tests/graphics-lab-iso-v323.spec.js`: terrein en alle objecten getekend,
  8 richtingen, pauze/halt, knijpzoom op telefoon.

---

# v324 — richten, vuren en herladen in 8 richtingen

- **Exercitie** in `scripts/render-iso-infantry.py` (tabel `DRILL`), volgens het
  1809-ritme *apprêtez armes – joue – feu – chargez*:
  - richten (2): musket rechtop voor de borst, daarna aangelegd aan de
    rechterschouder;
  - vuren (3): kruit flitst op de pan, schot met mondingsvuur en terugslag,
    musket zakt;
  - herladen (4): halve haan bij de heup, laadstok in de loop (kolf op de
    grond, arm omhoog), laadstok aangedrukt, terug naar de schouder.
  Schiethouding: rechtervoet achter, knieën licht gebogen.
- **Cellen** 176×128 px (anker 88,108) zodat een horizontaal musket met
  bajonet en mondingsvuur nooit wordt afgesneden. Per natie één atlas van
  2992×1024 (8 richtingen × 17 frames). De PNG-hulpmodule accepteert daarvoor
  nu afbeeldingen tot 2048×2048 pixels.
- **Mondingspunt**: de renderer schrijft per richting de schermpixel van de loop
  op het schotframe naar `muzzle.json`; de packer zet die in `meta.muzzle` van
  de atlas. Het schotframe (vuurframe 2) valt samen met `muzzleEvent` uit
  `unit-animation-config.json`, wat een headless test bewaakt.
- **Lab** (`iso.html`, v324): de deterministische v321-controller stuurt
  stilstaan/richten/vuren/herladen op de lab-klok; marcheren blijft gekoppeld
  aan de afgelegde afstand. Knop **Vuur!**: regimenten houden halt, draaien naar
  het midden van de vijand en vuren gelijktijdig salvo's. Elke `muzzle`-
  gebeurtenis zet een rookwolk op de mondingspixel die met de wind meedrijft en
  vervaagt. De strook bovenin toont de hele exercitie in alle 8 richtingen.
- **Tests**: `tests/headless/iso-scene-v324.test.js` (17 frames × 8 richtingen,
  celindeling, mondingspunten binnen de cel, overeenstemming met de
  controllerconfig) en `tests/graphics-lab-iso-v324.spec.js` (één salvo geeft
  precies 64 schoten, richten/vuren/herladen zichtbaar, geen marsframes,
  rook aanwezig, vuren staken).

---

# v325 — vuren per rang en getroffen soldaten

- **Valanimatie** (`die`, 4 frames) in `scripts/render-iso-infantry.py`
  (tabel `DIE`): geraakt en achterover geslagen, door de knieën, vallen met de
  armen omhoog, liggen met het musket langs het lichaam. Een extra draaipunt
  `fall` tussen voeten en heupen laat het hele lichaam om de voeten kantelen.
  `fall_twist()` kiest per kijkrichting een draai (±25–70°), zodat een liggende
  soldaat nooit precies in de kijkrichting ligt en nooit buiten de cel valt.
- **Atlas** per natie nu 8 × 21 frames (3696×1024).
- **Lab** (`iso.html`, v325):
  - *Lopend vuur*: bij **Vuur!** worden beide regimenten in drie banden
    verdeeld op afstand tot de vijand; de voorste band vuurt eerst, de volgende
    0,8 s en 1,6 s later, daarna houdt elke band zijn eigen ritme.
  - *Treffers*: elk schot heeft 5 % kans (`state.hitChance`) om na 0,25 s een
    willekeurige soldaat van de tegenpartij te laten vallen (deterministische
    hash, minstens 3 overlevenden). De val speelt eenmaal; het laatste frame
    blijft liggen, ook als het regiment weer gaat marcheren.
  - **↺ Herstel** brengt alle soldaten terug en ruimt rook op.
- **Tests**: één lopend salvo geeft precies 64 schoten in drie banden zonder
  doden (`hitChance = 0`); met `hitChance = 1` vallen soldaten, blijven ze
  liggen na de mars en herstelt **Herstel** alles.

---

# v326 — drie manieren van sneuvelen

- `DEATHS` in `scripts/render-iso-infantry.py` vervangt de enkele val door drie
  varianten van elk 4 frames, allemaal met de armen omlaag in de eindhouding:
  - `die` — in de borst geraakt, valt achterover, armen langs het lichaam;
  - `diefwd` — klapt dubbel, zakt door de knieën en valt op zijn gezicht;
  - `dieside` — in de schouder geraakt, draait weg en ligt opgekruld op zijn zij.
  `fall_twist(direction, head)` houdt per variant en kijkrichting het lichaam
  dwars op het scherm.
- **Twee atlassen per natie**: `*_iso_infantry_atlas` (exercitie, 2992×1024)
  en `*_iso_fallen_atlas` (3 × 4 valframes, 2112×1024).
- **Lab** (v326): per gesneuvelde soldaat kiest een deterministische hash een
  van de drie vallen; `getStats().fallKinds` toont welke voorkomen.
- **Tests**: beide atlassen per natie, en een treffertest die minstens twee
  verschillende valvarianten verwacht.

---

# v327 — drie uiterlijken per leger

- `VARIANTS` in `scripts/render-iso-infantry.py` (`--variant 1|2|3`):
  1. het oorspronkelijke model;
  2. veldtenue: donkere huid, zwart haar en snor, iets kleiner (0,96), grijsbruine
     veldbroek (Brits: donkergrijs) in plaats van kniebroek met slobkousen, en een
     zwart wasdoek over de shako zonder plaat of pompon;
  3. lichte huid, rossig haar met bakkebaarden, bruine deken en een tinnen
     eetketel op de ransel.
- Atlassen per variant: `fr`, `fr2`, `fr3`, `br`, `br2`, `br3` (exercitie +
  sneuvelen), samen ongeveer 8 MB.
- **Lab** (v327): elke soldaat krijgt via een vaste hash zijn eigen uiterlijk, ook
  als hij sneuvelt. `getStats().looks` telt de zichtbare varianten.

---

# v328 — officier, tamboer en vaandeldrager

- Nieuw script `scripts/render-iso-roles.py` hergebruikt het fuseliersmodel
  (camera, zon, rig, kleuren), verbergt musket en bepakking en voegt per rol
  eigen uitrusting toe:
  - **officier**: gouden epauletten, ringkraag, goudband op de shako (Brits:
    karmozijnrode sjerp), getrokken sabel;
  - **tamboer**: tressen en chevrons (Brits: buff jas in omgekeerde kleuren),
    trom met hoepels en trommelstokken;
  - **vaandeldrager**: Franse adelaar met vaandel model 1804, Britse Union-vlag;
    de golvende vlag is een onderverdeeld vlak met kleuren per vlakje.
- Per rol en natie: stilstaan 2, marcheren 6 en commando 2 frames (sabel
  geheven, charge slaan, vaandel geheven) in 8 richtingen. Cellen 176×160 met
  voetanker (88,140), zodat een geheven vaandel past (atlas 1760×1280).
  `pack-iso-atlas.py` pakt ze als `fro/frd/fre/bro/brd/bre_iso_<rol>_atlas`.
- **Lab** (v328): de officier loopt voorop, de vaandeldrager in het midden en de
  tamboer achteraan. Bij **Vuur!** geven ze het commando; ze worden niet geraakt.
