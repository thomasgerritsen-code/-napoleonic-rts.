# Iso-weergave v1 — de game in de Graphics Lab-stijl (opt-in)

`/?view=iso` toont de echte game in de 30°-camera van de Graphics Lab, met de
Blender-sprites uit `graphics-lab/assets/`. Zonder die parameter laadt het bestand
wel, maar doet het niets: de game blijft precies zoals hij is.

**PRESERVATION IMPACT: none for the default game.** Met `?view=iso` speelt de game
op een open kaart (minder wegen en huizen, zie onder); verder wordt de simulatie
(beweging, routes, bruggen, gevecht, moraal, AI, economie) alleen gelezen, nooit
veranderd.

## Wat er te zien is

- **Terrein**: het eigen statische terrein van de game (wegen, rivier, bruggen,
  dorpen, velden) wordt in tegels gebakken en plat op de grond gelegd, half zo hoog
  als breed, zoals in het lab. De tegels worden per zoomniveau (¼, ½ of volle
  resolutie) gemaakt, drie per frame, het midden van het scherm eerst; hoogstens 96
  blijven bewaard.
- **Eenheden** in 8 richtingen:
  - musketiers in vijf uiterlijken, met mars, stilstaan, richten, vuren, herladen,
    vluchten en de bajonetcharge;
  - officieren en tamboers, die commando geven zolang hun regiment vuurt;
  - cavalerie met stap, draf en galop (op snelheid) en de sabelhouw;
  - kanonnen (rollen, vuren) en hun bediening (laden, aanzetten, klaarstaan);
  - boeren nog als eenvoudige getekende figuurtjes (er zijn geen sprites voor).
- **Sneuvelen**: wie valt, speelt een van de drie vallen en blijft liggen (hoogstens 320).
- **Gebouwen en grondstoffen**: hoofdgebouw en kazerne als Blender-kazerne, woningen
  als huisje, graanakkers als veld, bomen als eik of populier, bessen als struik met
  bessen, ijzer als rots. Gebouwen in aanbouw zijn doorschijnend.
- **Rook en kogels**: rook bij elk schot (een grote wolk bij kanonnen), kogels als
  stipjes op schouderhoogte.
- **Mist van oorlog** als wolken, in drie tinten zoals in de klassieke RTS-spellen:
  - nooit gezien: onder wolken - witgrijs, van linksboven belicht met blauwgrijze
    onderkanten, in twee lagen (een wolkendek en fijnere slierten) die elk op hun eigen
    snelheid met de wind meedrijven, met hun schaduw op de grond;
  - eerder gezien (de verkende vakken van de game): een dunne nevel; grond, wegen en
    dorpen zie je, troepen niet;
  - in zicht: helder, rond de Franse eenheden en gebouwen.
  De **randen zijn wolkenranden**: de wolkstructuur duwt de rand naar buiten waar de wolk
  dik is en trekt hem terug waar hij dun is, zodat hij in bollen en uitlopers verloopt
  in plaats van als een vage airbrush-overgang; die vormen liggen vast op de grond en
  drijven mee met het wolkendek. Alles ligt op het reliëf (een heuveltop krijgt zijn
  zichtveld óp de heuvel). Vloeiend: elke nieuwe mist vloeit over in de vorige, de
  mist is iets groter dan het scherm en schuift mee met de camera; de wolken worden op
  een kwart van de schermresolutie getekend. Britten buiten zicht worden niet
  getekend, net als in 2D.
- **Hoogte geeft zicht** (alleen op deze kaart): wie hoger staat ziet verder, 3,5% per
  meter, hoogstens anderhalf keer zo ver (op de hoogste top 322 in plaats van 215). Dat
  geldt voor beide kanten, ook voor wat de Britse AI ziet.
- Selectieringen, het sleepkader en de minimap van de game.

## Open kaart (alleen in de iso-weergave)

Met `?view=iso` speelt de game op een **open kaart**; zonder die parameter blijft de
kaart precies zoals hij is (37 wegen, 224 huizen).

- **Minder wegen**: 18 in plaats van 37. Zijwegen, boerenpaden en de meeste
  strategische wegen vallen weg (`NRTS_CONFIG.world.roads.omittedIds`, ook voor de
  `imperial-`-wegen in `map-expansion-v7.js`); de hoofdwegen en alle vijf de bruggen
  blijven.
- **Minder huizen**: `src/systems/world/open-map-v1.js` houdt hoogstens 9 dorpjes over,
  minstens 900 px (40 m) uit elkaar, elk met de 6 huizen het dichtst bij het midden
  (een kapel of herberg blijft staan). Samen 54 huizen. Omdat dit direct na
  `village-collision-v4` gebeurt, gebruiken looproutes, botsingen, economie en de
  weergave allemaal dezelfde dunne dorpen.
- `NRTS_CONFIG.world.mapVariant` is `'open'` of `'standard'`.

## Reliëf

- Het landschap golft: zacht glooiend land (zo'n 1 à 3 m), de heuvels van de game als
  brede ruggen (7 tot 14 m; op de open kaart 9 extra heuvels ten oosten en zuiden van de
  rivier, die voor de game ook "heuvel" zijn: iets trager terrein), een dal dat naar de
  rivier afloopt, en een vlak terras onder elk dorpshuis. Hoogste punt ~16 m.
- `scripts/render-iso-gamemap.py` maakt die hoogtes (1 m-raster) en rendert het terrein
  erop: wegen, rivier, erven en bosgrond liggen over de heuvels; een lagere zon laat
  de hellingen zien, en het gras is in het dal groener en op de toppen droger.
- Dezelfde hoogtes staan in `ground.json` (`relief`, 2 m-raster in cm). De
  iso-weergave tilt alles wat op de grond staat erop: soldaten, ruiters, kanonnen,
  lijken, huizen, bomen, bruggen, rook, vlaggetjes, ringen en de mist. Een klik zoekt
  het punt op de helling dat je aanwijst.
- Hellingen naar het noorden blijven onder 30° (steiler zou je vanuit de camera niet
  meer zien).

## Rivier en bruggen

- De **rivier** loopt als één band door, boven de wegen en door de heuvels heen
  (heuvels vlakken af waar rivier en wegen ze doorsnijden): modderige oevers, een
  lichtere ondiepe rand, dieper water in het midden, een breedte die licht varieert
  (4,2 m; het doorwaadbare deel van de game is 6,4 m), en riet langs de oevers.
- **Bruggen** zijn Blender-modellen (`scripts/render-iso-props.py`):
  - `bridge_stone`: een stenen boogbrug met oplopende opritten tussen vleugelmuren,
    een zandweg over het dek en borstweringen met dekstenen;
  - `bridge_wood`: een houten jukbrug op palen in het water, met een plankendek dat
    aan beide kanten afloopt, randbalken en leuningen.
  Elk wordt op de lengte van zijn oversteek in de game geschaald.
- **Mannen op een brug** lopen op het dek: ze worden opgetild (vlak boven het water,
  langs de opritten omhoog) en na de brug getekend. Klikken op hun lichaam werkt ook
  daar.

## Dorpen (Blender)

- De dorpshuizen van de game (`VILLAGE_SCENERY_V4`; op de open kaart 54) staan er als Blender-gebouwen:
  huisje, boerderij (met achtervleugel), schuur, herberg (met vleugel en uithangbord) en
  kapel (met dwarsschip en vieringtoren), elk in **16 draaihoeken**
  (`scripts/render-iso-village.py` → `graphics-lab/assets/iso/village/`). De modellen
  volgen de verhoudingen en vleugels van de 2D-plattegrond van de game.
- **Variatie:** de helft van de huisjes is witgekalkt onder rode pannen, een deel van de
  boerderijen is van steen onder leien.
- **Voordeur naar de weg:** de voorkant wijst naar het toegangspunt van het huis op de
  weg (op de standaardkaart 194 van de 224 huizen recht voor; de rest aan de zijgevel).
- **Aankleding** (vast per dorp, vrij van wegen, rivier en muren): een put bij het
  dorpsplein, hooibergen achter boerderijen en schuren, fruitbomen in de achtertuinen,
  een heg achter huisjes en een hek achter boerderijen.
- **Rook** uit de meeste schoorstenen, dun en met de wind mee.
- Bij het bakken van het terrein worden de platte daken weggeknipt; de tuinen blijven.
- Dorpshuizen zijn in de game ongeveer een derde van ware grootte naast de soldaten;
  ze worden 1,6× hun voetafdruk getekend (`VILLAGE_SCALE`). Waar mannen kunnen lopen
  blijft door de voetafdruk van de game bepaald.

## Overzicht in het gevecht

- Onder elke soldaat, ruiter en elk kanon ligt een **ring in de kleur van zijn kant**
  (blauw Frans, rood Brits).
- **Decor wordt doorzichtig** (32%) zodra er een soldaat achter staat: huizen,
  kazernes, bomen en dorpsaankleding.
- **Kruitdamp** is kleiner en dunner, zodat je de mannen erdoor blijft zien.
- **Minder drukte**: dorpshuizen 1,6× hun voetafdruk (was 2×); minder fruitbomen,
  heggen en hekken.
- **👁 Overzicht** (knop rechtsboven): decor half doorzichtig, geen dorpsaankleding en
  geen schoorsteenrook, kruitdamp nog dunner. Ver uitgezoomd (zoom < 0,55) verdwijnen
  aankleding en schoorsteenrook vanzelf.

## Terrein uit Blender

- `scripts/render-iso-gamemap.py` rendert het hele slagveld (356 × 222 m) in Blender uit
  `graphics-lab/assets/iso/game/gamemap.json` (geëxporteerd uit de draaiende game met
  `?view=iso`: 18 wegen, de rivier met 5 bruggen, bossen, heuvels en 54 dorpshuizen): gras met
  plukjes en bloemen, wegen per klasse met bermen, de rivier (zie boven), donkere bosgrond, het reliëf (zie boven), en
  een erf met moestuin bij elk huis. Resultaat `ground.jpg` (4978 × 1757, 14 px per
  meter, met ruimte boven voor de verhoogde noordrand); de iso-weergave tekent alleen het deel dat in beeld is. Zonder die afbeelding
  valt hij terug op de 2D-kaart.
- **Wegen** (`road_material` in het script): elke weg is één doorlopende band met
  afgeronde bochten (geen naden meer per stukje), breder dan de weg van de game zodat
  de uitgesleten rand met gras erin geleidelijk overgaat in het land; op kruisingen
  schijnt de weg eronder door, en doodlopende einden lopen ook uit.
  - chaussee: een bolle strook kasseien in het midden, grindbermen ernaast;
  - zijweg: aangestampte aarde met twee karrensporen, hier en daar een plas erin, en
    strepen van wielen en hoeven in de rijrichting;
  - pad: twee sporen met gras ertussen.
  Ook de erven en moestuinen bij de huizen lopen zacht uit in het gras.
- **Bomenlanen**: langs de chaussees staan populieren aan weerszijden, om de 10 m met
  hier en daar een gat, zoals langs de routes impériales (niet op wegen, bij bruggen,
  in dorpen, bossen of bij een basis).
- In de **bossen** van de game staan eiken en populieren als sprites (met open plekken,
  niet op wegen of in de rivier), en ze worden doorzichtig over soldaten erachter.

## Bediening zoals in het lab

- **Vlaggetjes**: elk geselecteerd regiment toont een vlag op zijn bestemming met een
  stippellijn vanaf waar het staat, tot het er is.
- **Kijkrichting**: slepen met rechts (de bestaande order van de game) toont een pijl.
- **Aanvalsdoel**: rechtsklik (of tik) op een zichtbare vijand: de selectie marcheert naar
  schootsafstand van die vijand (infanterie 85% van haar bereik, kanonnen 80%, ruiters
  tot contact) met het front naar hem toe — de eigen loop- en frontorders van de game;
  het vechten doet de game zelf. Rode stippelringen en een vizier boven de vijand.
- **Schuiven**: verticaal schuiven met toetsen of één vinger gaat op iso-snelheid.

## Boeren en geluid

- **Boeren** (`scripts/render-iso-roles.py --role worker`): linnen kiel, strohoed,
  bijl; staan, lopen en hakken (bij een taak) in 8 richtingen (`frw`/`brw`).
- **Geluid uit het lab** bovenop dat van de game (schoten, kanonnen, trommels): hoeven
  onder galopperende ruiters, een trompet als ruiters chargeren, gesproken commando's
  ("Joue! Feu!", "Present! Fire!", "En avant! À la baïonnette!"). Volgt de geluidsknop
  van de game.

## Schaal

In linie staan de mannen in de game 18 px uit elkaar en in het lab 0,8 m: 1 m is
22,5 game-pixels. Gebouwen in de game zijn kleiner dan op ware schaal; hun props
worden op de voetafdruk van het gebouw geschaald.

## Bediening

Alles van de game blijft werken: selecteren, slepen, rechtsklik, formaties, de
knoppen, touch en sneltoetsen. Tijdens de iso-weergave rekenen `screenToWorld` en
`worldToScreen` in de iso-projectie. Omdat die alleen de hoogte halveert, blijft een
kader op het scherm een rechthoek in de wereld. Een klik op het lichaam van een
soldaat (boven zijn voeten) selecteert hem.

Met de knop **🗺 2D-kaart / 🏰 Iso-weergave** rechtsboven schakel je tussen de twee
weergaven; terug in 2D begint de terreincache opnieuw.

## Techniek

- `src/systems/rendering/iso-view-v1.js` neemt `renderStableFrameV1` over (het haakje
  waarmee de game elk frame tekent). Eens per seconde draait ook de 2D-tekenaar mee,
  met de 2D-projectie, zodat effecten die hij bijhoudt worden opgeruimd. Zijn beeld
  wordt overgeschilderd.
- Andere canvaslagen (statisch terrein, GPU-lagen) worden verborgen zolang de
  iso-weergave aan staat; de minimap blijft.
- `window.__ISO_VIEW_V1__`: `isOn()`, `setOn(bool)`, `stats()` (getekende eenheden,
  sprites, props, tegels, lijken, rook, tekentijd), `screenOf(x,y)`, `bodyOf(unit)`.
- Test: `tests/iso-view-v1.spec.js` (ook: de standaardkaart blijft 37 wegen en 224
  huizen; open kaart; mannen op het brugdek).

## Nog niet (volgende stappen)

1. De grond opnieuw renderen als de kaart van de game verandert (export + script).
2. Tekenen via de GPU voor 520 eenheden op zwakke telefoons.
3. Hoogte in het spel zelf: hoogte geeft verder zicht, maar heuvels blokkeren het zicht
   (nog) niet en het schootsveld houdt er geen rekening mee.
