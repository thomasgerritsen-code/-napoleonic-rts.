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

---

# v329 — van colonne naar linie, gaten sluiten

- Soldaten hebben nu een eigen positie en lopen (2,2 m/s, met hun eigen
  pasteller voor de marsframes) naar een plaats (rang, rot) in de opstelling van
  hun regiment:
  - **colonne**: 4 rotten breed, volgt de weg exact;
  - **linie**: bij **Vuur!** ontplooit elk regiment rond zijn midden, met het
    front naar de vijand. Frans 3 rijen diep, Brits 2. Rotten worden van links
    naar rechts verdeeld naar ieders positie over het front, rijen naar afstand
    tot de vijand, zodat niemand door het hele regiment hoeft te lopen.
- **Rangvuur**: pas als het hele regiment staat, opent de voorste rij het vuur,
  de volgende rij(en) 0,8 s later.
- **Gaten sluiten**: valt een man, dan stapt de man achter hem in hetzelfde rot
  naar voren (enzovoort), zodat gaten naar achteren schuiven.
- **Voorwaarts mars** vormt weer een colonne; de mannen lopen eerst naar hun
  plaats en volgen daarna de weg.
- Officier op de rechterflank, vaandeldrager net achter de voorste rij in het
  midden, tamboer achter de linie.
- `getStats()` toont `formations`, `deployed`, `shooters` en `frontGaps`.
- **Tests**: ontplooien in linie (met lopende soldaten), rangvuur waarbij eerst
  een deel en daarna alle 64 musketten vuren, geen marsframes tijdens het vuren,
  nul gaten in de voorste rij na treffers, en terug naar colonne.

---

# v330 — scherpere sprites, compagnieën, nieuwe houdingen, WebP

- **Supersampling**: elk frame wordt 2× zo groot gerenderd en met
  premultiplied alpha teruggeschaald (`--supersample 2`), waardoor randen,
  knopen en bajonetten scherper zijn. De soldaten blijven even groot.
- **Compagnieën**: look 4 zijn grenadiers (Frans: rode epauletten en pluim;
  Brits: wings en witte pluim), look 5 voltigeurs / de Britse light company
  (gele of groene pluim). In het lab staat 1/8 van elk regiment op de rechter-
  flank als grenadier en 1/8 op de linkerflank als lichte compagnie.
- **Nieuwe toestanden** in drie extra atlassen per look:
  - `combat`: knielend richten (2) en vuren (3, met mondingspunt), ketsschot (3),
    bajonetcharge (6), bajonetstoot (3);
  - `morale`: vluchten (6), gewond kruipen (4), juichen (2);
  - `idlex`: rondkijken (4), sjako rechtzetten (4), op musket leunen (2).
- **WebP**: alle atlassen en gebouwen/bomen zijn lossy WebP (q90, alpha
  verliesvrij-kwaliteit). De JSON noemt het bestand (`meta.image`), dus de
  lader hoeft het formaat niet te kennen.
- **Lazy loading**: de basislook per land en de staf laden eerst; de scène
  start meteen en de andere looks stromen daarna binnen (tot dan gebruiken
  soldaten de basislook).

---

# v331 — realistischer vuurgevecht

- **Knielen**: de voorste Franse rij knielt om te richten en te vuren
  (`kaim`/`kfire`, met eigen mondingspunten), zodat de rijen erachter over
  hen heen vuren. Herladen gebeurt staand.
- **Spreiding**: elke man legt tot 0,35 s eerder of later aan dan zijn buren,
  en herlaadt in zijn eigen tempo (±15%). De controller kreeg daarvoor een
  `rate` per eenheid; lussen (mars, rust) houden de gedeelde cadans.
- **Ketsschoten**: 6% van de schoten ketst (`misfire`: vlam op de pan, geen
  kogel, geen rookwolk uit de loop). Knielende mannen ketsen in de demo niet.
- **Rookbank**: elk schot voedt ook een trage, vage rookbank die ~28 s boven de
  linie blijft hangen en langzaam met de wind afdrijft.
- **Rust**: wie niet vuurt, kijkt af en toe rond, zet zijn sjako recht of
  leunt op zijn musket.
- Reparaties: een man die net is geraakt, wordt in dat frame niet meer staand
  getekend; ontbrekende animaties tellen als `missing` in `getStats()`.

---

# v332 — bajonetcharge, man tegen man, vluchten, gewonden

- **Bajonet!** (nieuwe knop): beide regimenten vormen linie; zodra ze staan,
  rukt de Franse linie op in looppas (`charge`, 3 m/s) tot de voorste rijen
  elkaar raken.
- **Man tegen man** (4,5 s): de voorste rijen stoten met de bajonet (`thrust`),
  de rijen erachter houden de bajonet geveld. Elke 0,4 s kan aan beide kanten
  een man in de voorste rij vallen; de aanvaller (diepere linie, vaart)
  verliest er minder. De man erachter sluit aan.
- **Vluchten**: daarna slaat het regiment met de minste mannen op de vlucht
  (`rout`), elk op zijn eigen lijn weg van de vijand, en verdwijnt van het
  veld. De winnaars juichen (`cheer`) en gaan dan in rust.
- **Gewonden**: 30% van de getroffenen is gewond: hij draait zich om, gaat
  neer en kruipt zo'n 2 m naar achteren (`crawl`), daarna blijft hij liggen.
- `getStats()` toont `charge` (fase), `loser`, `gone` en `wounded`; de
  reviewstrook bovenaan doorloopt nu alle houdingen.

---

# v333 — geluid

- Nieuwe knop **Geluid** (standaard uit; de AudioContext ontstaat pas na de
  klik). Alles wordt gesynthetiseerd in `graphics-lab/iso-audio.js`, zonder
  geluidsbestanden:
  - **musketschot**: ruisknal met lage dreun en nagalm, links/rechts gepand
    naar waar de schutter op het scherm staat en zachter verder weg; schoten
    binnen 60 ms worden na 6 samengevoegd, zodat een salvo niet clipt;
  - **ketsschot**: klik en kort gesis, geen knal;
  - **trommels**: de tamboer slaat de pas zolang zijn regiment marcheert, en
    sneller (pas de charge) tijdens de bajonetcharge;
  - **commando’s** via spraaksynthese: Frans (fr-FR) „Apprêtez armes! Joue!
    Feu!”, „En avant! À la baïonnette!”, „Vive l’Empereur!”; Brits (en-GB)
    „Make ready! Present! Fire!”, „Steady, lads!”, „Huzzah!”.
- `getStats().sound` telt schoten, samengevoegde schoten, ketsschoten,
  trommelslagen en commando’s.

---

# v334 — artillerie

- **Model** (`scripts/render-iso-artillery.py`): een 6-ponder op affuit (Frans
  Gribeauval-olijfgroen, Brits grijs), bronzen loop met versterkingsringen,
  dolfijnen en cascabel, wielen met 12 spaken en ijzeren band, emmer onder de
  staart. Toestanden: rust 1, vuren 2 (mondingsvuur, opslaande loop), rollen 4
  (wielen draaien) in 256×176-cellen, as op de grond in (128,112);
  `muzzle.json` geeft per richting de mondingspixel.
- **Kanonniers**: het fuselierlichaam in artillerie-uniform (Frans blauw met rood,
  rode epauletten; Brits blauw met rode kraag en opslagen, gele tressen, witte
  broek), zonder ransel en geweer. Toestanden met eigen gereedschap: rust,
  wissen/stampen (wisser-stamper), laden (kardoes), richten (handspaak),
  gereed en afvuren (lontstok), terugduwen, marcheren en de drie vallen.
- **Atlassen**: `frg/brg_iso_gun` (1792×1408) en `fra/bra_iso_gunner` +
  `gunner2` (elk 3168×1024).
- **Lab**: elk regiment heeft twee stukken met elk vier man. In colonne worden
  ze achter het regiment aan geduwd (#3 en #4 aan de wielen, #1 en #2 lopen
  naast de staart); bij het ontplooien gaan ze naar de flanken van de linie,
  één aan elke kant, en vuren pas als ze staan. Bij
  **Vuur!** werkt elke ploeg de dril af (cyclus 8 s, het tweede stuk 2,7 s later):
  #1 wist en stampt voor de monding, #2 laadt de kardoes, #3 richt met de
  handspaak achter de staart, #4 vuurt met de lontstok. Het stuk slaat 0,9 m
  terug; #3 en #4 duwen het daarna weer naar voren (wielen draaien mee). Een
  grote rookwolk rolt voor de monding uit en voedt de rookbank.
- **Kogel**: eerste stuit vlak vóór de vijandelijke linie, daarna steeds lagere
  sprongen met een stofwolkje bij elke stuit, en uitrollen. Waar de kogel lager
  dan 1,7 m door de rijen gaat, vallen tot vier man.
- **Geluid**: kanonsknal met lange, lage rommel.
- `getStats()` toont `guns`, `gunsDrawn`, `crewDrawn`, `crewStates`,
  `cannonShots`, `balls`, `ballHits` en `recoiled`.

---

# v335 — cavalerie

- **Model** (`scripts/render-iso-cavalry.py`): een procedureel paard (romp,
  borst, kruis, hals, hoofd met oren en hoofdstel, manen, staart en vier
  benen met twee gewrichten en hoeven), zadel op een gekleurde schabrak met
  boord, holsters en opgerolde mantel. Vachtkleuren: bruin (look 1) en zwart
  (Frans) of schimmel (Brits) als look 2.
- **Ruiter**: het fuselierlichaam als *chasseur à cheval* (groen met rood) of
  *light dragoon* (blauw met buff, grijze overall), met rijlaarzen, sabel en
  schede; zit met de benen om het paard.
- **Toestanden** (224×192-cellen, hoeven in 112,152): rust 2, stap 6
  (viertakt), galop 6 (met zweeffase en meedeinende romp), sabelhouw 3,
  steigeren 2 en sneuvelen 4 (paard en ruiter vallen samen om, weg van de
  camera zodat ze in de cel blijven). Atlassen `frc/frc2/brc/brc2_iso_cavalry`
  (3136×1536) en `_cavfight` (2016×1536).
- **Lab**: elk regiment heeft een eskadron van zes ruiters in twee gelederen,
  dat in colonne achter de kanonnen rijdt en in linie op de linkerflank staat.
  **Cavalerie!** (trompetsignaal en „Chargez!”) stuurt het Franse eskadron op de
  Britse linie af: 1,2 s stap, dan galop (7,5 m/s, hoefgedreun); staat er een
  gebouw op de route, dan rijdt het eskadron er via een tussenpunt omheen. Onderweg kan
  een ruiter door het geweervuur vallen. Bij de vijand volgt 3,2 s man tegen
  man: sabelhouwen en steigerende paarden, en wie binnen bereik staat kan
  vallen. Daarna galopperen ze terug naar hun plaats.
- `getStats()` toont `riders`, `ridersDrawn`, `cavStates`, `cavCharge`,
  `riderFalls` en `sabreHits`.

## v335c — realistischer paard

- Paard opnieuw opgebouwd: borst, schoft, lagere rug en ronde achterhand met
  dij- en schouderspieren; gebogen hals met kam en manen; hoofd voorwaarts en
  omlaag gedragen (schedel, ganaches, smalle neus, muil met neusgaten, oren,
  ogen, kuif, hoofdstel en bit); benen met onderarm/schenkel, knie en hak,
  dunne pijpen met pezen, kogels, schuine koten en hoeven; zwarte onderbenen,
  manen en staart bij bruine en zwarte paarden; smallere, langere staart.
- Zadel: zadelkleed over rug en flanken met boord en punt, gevormd zadel met
  voor- en achterboog, holsters en grijze mantelrol.

---

# v336 — draf, officier en trompetter

- **Draf** (6 frames): tweeslag op diagonale beenparen, de romp veert twee keer
  per pas en de ruiter rijst in de stijgbeugels mee. Atlassen nu: `cavalry`
  (rust, stap, draf; 3136×1536) en `cavfight` (galop, sabelhouw, steigeren,
  sneuvelen; 3360×1536).
- **Officier** (`--role officer`, look `frco`/`brco`): zwart paard, goudboord op
  de schabrak, gouden epauletten en sjakoband, sjerp.
- **Trompetter** (`--role trumpeter`, look `frct`/`brct`): schimmel, karmozijnrode
  (Frans) of scharlakenrode (Brits) jas; de trompet hangt aan de heup en gaat in
  galop en in het gevecht aan de mond in plaats van de sabel.
- **Lab**: elk eskadron heeft nu zes ruiters plus de officier vooraan en de
  trompetter rechts naast hem. Moeten ze ver naar hun plaats, dan draven ze. De
  charge gaat van stap via draf naar galop; officier en trompetter rijden aan de
  uiteinden van het voorste gelid mee.

---

# v337 — Britse tegenaanval

- **Carré**: zodra de Franse cavalerie chargeert, vormt de Britse infanterie een
  hol carré rond haar midden: op elke zijde twee rijen, iedereen met front naar
  buiten, de buitenste rij geknield met gevelde bajonet. Mannen en plaatsen
  worden op hun hoek rond het midden gekoppeld, zodat niemand dwars door het
  carré loopt. Staf en vaandel staan in het midden. Elke zijde vuurt (via de
  animatiecontroller) op ruiters binnen 9 m vóór die zijde; een schot kan een
  paard neerhalen.
- **Tegencharge**: zodra de Fransen in draf gaan, galoppeert het Britse eskadron
  ze tegemoet. Komen de eskadrons binnen 3,5 m, dan volgt 3,5 s ruiter tegen
  ruiter (sabelhouwen, steigerende paarden); elke halve seconde kan aan beide
  kanten een ruiter vallen, en de grootste ploeg verliest er minder.
- **Afloop**: winnen de Fransen, dan galopperen ze door naar het carré, waar de
  paarden weigeren (meer steigeren, weinig houwen komen door de bajonetten) en
  het vuur van het carré ze uitdunt; daarna verzamelen ze. Verliezen ze, dan
  rijden beide eskadrons terug. Is de Franse cavalerie terug, dan vormen de
  Britten weer linie.
- `state.reaction` (standaard aan) schakelt de Britse reactie; `getStats()` toont
  `cavCounter`, `squareShots` en `clashes`.

---

# v338 — groter slagveld, minimap en volgcamera

- **Terrein** (`render-iso-ground.py`, `layout.json` versie 2): het veld is
  128×128 m (was 96×96) en het terrein is opnieuw in Blender gerenderd. Nieuw:
  - een **beek** (`streams`) die van zuid naar noord door het westen kronkelt:
    een donkere, glanzende waterband op een modderige oever, met afgeronde
    bochten; gras en bloemen blijven er vandaan;
  - een **heuvel** (`hills`) in het noordoosten: een gladde koepel van 6 m
    hoog die de zon laat zien; gras en bloemen volgen de helling;
  - de wegen naar oost en west lopen door tot de rand.
- **Stenen boogbrug** (`render-iso-props.py`, prop `bridge`): landhoofden, een
  boog van gewelfstenen, borstweringen met dekstenen en hoekpalen, en de
  zandweg over het dek; hij ligt waar de westweg de beek kruist.
- **Tweede boerderij** aan de overkant van de beek (boerderij, schuur,
  hooibergen, put, hek) en meer bomen en struiken in het grotere veld.
- **Minimap** rechtsonder: het hele terrein, elke soldaat, elk kanon en elke
  ruiter als stip in de eigen kleur, en het zichtbare deel als kader. Klik of
  tik erop om daarheen te kijken.
- **🎥 Volg**: de camera glijdt mee met het Franse regiment, het Britse
  regiment of de Franse ruiters; slepen zet het volgen uit.
- `getStats()` toont `minimap`, `follow`, `cam` en `half`.

## v338c — sneller, vooral op telefoons

- **Halve-resolutie-atlassen**: het lab tekent sprites op ongeveer de helft van
  hun atlasgrootte (20 tegen 41,3 px per meter), dus de volle atlassen kostten 4×
  zoveel geheugen zonder zichtbare winst: alle 78 samen bijna 1 GB uitgepakt,
  te veel voor een telefoon. `scripts/make-iso-halfres.py` maakt van elke atlas
  een `_half.webp` op 50% (geschaald met voorvermenigvuldigde alpha, dus geen
  donkere randjes) en zet `meta.half` in de JSON; het lab laadt die tenzij `?hd=1`.
  Geheugen ±234 MB in plaats van ±936 MB, download ±12 MB in plaats van ±21 MB.
  Na een nieuwe `pack-iso-atlas.py` het script opnieuw draaien (een test bewaakt dat).
- **Rook**: puffen komen uit drie vooraf getekende verloopplaatjes in plaats van
  honderden nieuwe radiale verlopen per frame, en schoten dicht bij elkaar voeden
  één wolk van de rookbank (die dikker wordt) in plaats van elk een eigen wolk.
- **Minimap**: de terreinachtergrond wordt één keer verkleind en bewaard.
- Gemeten (Chromium, telefoonformaat, tijdens een vuurgevecht): laden 1,9 → 0,9 s,
  frame 43 → 24 ms.

## v339 — eerste bediening

Alleen in het Graphics Lab; de speelbare game verandert niet.

- **Selecteren**: klik of tik op een regiment, batterij of eskadron (Frans of
  Brits). Shift-klik voegt toe of haalt eraf; **▢ Kader** (of Shift+slepen)
  trekt een kader om meerdere eenheden. Esc of **✕** heft de selectie op.
  Geselecteerde mannen, kanonnen en paarden krijgen een ring om de voeten.
- **Lopen**: met een selectie tik of klik je op het veld (of klik je rechts) en
  zet je een vlaggetje neer. Een regiment verlaat de weg en marcheert in zijn
  formatie (colonne of linie) naar de vlag; de mannen houden hun plaats rond het
  midden. Een batterij rijdt erheen en zet de stukken naast elkaar, gericht op de
  vijand; een eskadron rijdt erheen in twee rijen. Bij meerdere eenheden houdt
  elk zijn plaats ten opzichte van de andere. Het vlaggetje verdwijnt als ze er zijn.
- **Bevelen** (balk rechtsboven): ═ Linie en ‖ Colonne voor regimenten;
  🔥 Vuren voor regimenten (stoppen, linie naar de vijand, rangvuur) en
  batterijen; ⚔ Charge laat een regiment met de bajonet aanvallen (ook de Britten
  nu) en de Franse ruiters chargeren. Alleen de bevolen eenheid vuurt; de knoppen
  onderaan (Vuur!, Bajonet!, Cavalerie!) werken zoals voorheen voor allen.
- **Voorwaarts mars** heft alle bevelen op: iedereen gaat terug in colonne op de weg.
- Werkt met muis en touch (tikken, slepen om te schuiven, knijpen om te zoomen).
- `getStats()` toont `selected`, `orders`, `flags`, `commands`, `centres`,
  `batteryFire`, `batteryAt` en `squadronAt`; `groupScreen(id)` en
  `screenOfGround(x,y)` geven schermpunten voor de tests.

## v340 — aanvalsdoelen, draaien en sneltoetsen

- **Aanvallen**: met een selectie tik of klik je op een eenheid van de **andere**
  kant (of klik je er rechts op). Doelen krijgen rode stippelringen en staan in de
  balk achter 🎯.
  - Een regiment marcheert tot schootsafstand (20 m), vormt linie naar het doel en
    vuurt; volgt het doel opzij, dan zwenkt de linie mee. Op ruiters of kanonniers
    gericht vuur kan die raken.
  - Een batterij richt op het doel en vuurt; staat het verder dan 50 m, dan rijdt
    ze eerst tot 40 m op. Kogels raken nu ook ruiters en kanonniers.
  - Een eskadron galoppeert erheen (om gebouwen heen) en houwt in op wat het
    bereikt: infanterie, ruiters of kanonniers. Vijandelijke ruiters slaan terug.
    De Franse ruiters op het Britse regiment geven de volledige charge (met carré).
  - Kanonniers kunnen nu sneuvelen; een stuk met minder dan twee man vuurt niet.
  - Een doel waar niemand meer van over is, vervalt.
- **Draaien**: ⟲ en ⟳ (of Q en E) draaien regiment, batterij of eskadron 45°.
  Slepen met rechts zet een vlag waar het slepen begint en geeft de kijkrichting:
  ze marcheren erheen en zwenken daar die kant op.
- **Sneltoetsen**: 1–3 Frans regiment, batterij, ruiters; 4–6 de Britse (Shift
  voegt toe). L linie, C colonne, F vuren, B charge, Q/E draaien, H halt/voorwaarts,
  P of spatie pauze, pijltjes schuiven, + en − zoomen, Esc selectie weg. De knoppen
  tonen hun toets als tooltip.
- `getStats()` toont `attacks`, `turns`, `targets`, `facings`, `batteryTarget`,
  `squadronTarget`, `crewFalls`, `targetHits` en `lastKey`.

## v341 — om gebouwen heen en kijkrichting op de telefoon

- **Om gebouwen heen**: een regiment dat naar een vlag of doel marcheert, kiest
  een omweg rond boerderij, schuur, huisjes en kazernes (breed genoeg voor zijn
  formatie: een linie ruimer dan een colonne). Een colonne zwenkt onderweg mee met
  haar weg; een linie houdt haar front. Kanonnen rijden ook om gebouwen heen.
  Een vlag die in een gebouw valt, wordt net buiten de muren gezet.
- **Vasthouden en slepen**: houd je vinger (of de muisknop) een halve seconde
  stil op het veld; er verschijnt een ring. Sleep dan in de gewenste kijkrichting
  en laat los: de selectie gaat naar de ring en kijkt die kant op. Loslaten zonder
  slepen is een gewone verplaatsing. Op een eenheid vasthouden doet niets bijzonders.
- Een regiment dat op een doel vuurt, rukt pas weer op als het doel duidelijk
  verder weg is (geen heen-en-weer meer rond de grens van de schootsafstand).
- `getStats()` toont `detours` en `arrow`; `orderMove(dest)` staat op de API voor tests.
