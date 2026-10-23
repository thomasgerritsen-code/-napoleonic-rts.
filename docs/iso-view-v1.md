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

## Regimenten: verdedigen, grotere regimenten (open kaart)

`src/systems/combat/regiment-orders-v1.js`, aan met `NRTS_CONFIG.regimentOrders`.

- **Verdedigende houding** (knop **🛡 Verdedig** of toets **V**): een regiment dat stilstaat
  in linie of carré graaft zich na 4 seconden in: het lijdt dan 30% minder verlies,
  verliest bijna de helft minder moraal per treffer en herlaadt 15% sneller. Bij een
  verplaatsing vervalt het voordeel; waar het weer stilstaat bouwt het zich opnieuw op.
  In de iso-weergave staat er een schild boven het regiment: open terwijl het zich
  ingraaft, gevuld zodra het ingegraven is. De Britse commandant graaft zijn regimenten
  in zolang hij verdedigt of hergroepeert.
- **Loopgraven**: een ingegraven regiment in linie begint 3 seconden later een loopgraaf
  te graven langs zijn front (ongeveer 25 seconden, onder vijandelijk vuur binnen
  ~12 m ruim twee keer zo lang). De hele lijn wordt meteen uitgezet en wordt
  donkerder en dieper naarmate er gegraven wordt; de musketiers leggen hun geweer
  weg en graven zichtbaar met de spade (Blender-animatie in 6 beelden: steken,
  intrappen, wrikken, optillen, de aarde naar voren op de wal gooien, terug), elk
  in zijn eigen tempo, en zakken mee de grond in. De aarden wal komt aan de
  vijandkant en groeit mee; de officier en tamboer kijken toe. De loopgraaf is een
  afgeronde kuil (ronde kopse kanten, met de hand gegraven ongelijke rand): je ziet
  de achterwand met grondlagen naar beneden lopen naar een smallere bodem ~1,1 m
  diep, de voorwand verbergt de benen van de mannen erin. De wal is een ronde
  aarden rug die aan de uiteinden afloopt. In een voltooide loopgraaf stapt de
  voorste rij op de vuurtrede langs de wal (een richel halverwege de diepte) en
  leunt erop, het geweer over de rug gelegd (en vuurt er ook overheen); de rijen
  erachter staan dieper, op de bodem. De wanden zijn bekleed met takkenbossen (fascines, Blender-
  textuur), langs de binnenkant van de wal staan schanskorven (gevlochten manden
  met aarde) met gaten ertussen voor de musketten, en op een wal die dwars over
  het scherm loopt ligt een rij zandzakken. Vóór de wal ligt een ondiepe gracht.
  Dekking geldt alleen tegen vuur van de walkant (binnen ~80° van de richting van
  de loopgraaf); van opzij of van achteren staan de mannen in het open (alleen de
  ingegraven-bonus blijft). Ruiterij kan er niet overheen stormen: in de gracht,
  over de wal en door de loopgraaf gaat een ruiter stapvoets (30% snelheid), zijn
  charge breekt en hij krijgt 40% meer schade.
- **Loopgraaf versterken** (knop als je één regiment in een voltooide loopgraaf
  selecteert): niveau 1 *Veldschans* (gegraven: kuil, wal, gracht; 50% minder
  verlies van voren), niveau 2 *Bekleed* (120 hout, 10 s: takkenbossen tegen de
  wanden; 62% minder), niveau 3 *Versterkt* (160 hout + 40 ijzer, 14 s:
  schanskorven en zandzakken; 72% minder). Het regiment doet het werk zolang het
  erin blijft staan (zichtbaar aan het graven; takkenbossen en korven verschijnen
  gaandeweg); loopt het weg, dan wacht het werk. De Britse commandant versterkt
  zijn eigen loopgraven als hij hout en ijzer over heeft. De tamboer en de officier gaan mee de loopgraaf
  in, elk aan een uiteinde achter de rijen (al tijdens het graven). Wie in een voltooide
  loopgraaf staat - van welke kant ook - lijdt 50% minder verlies en verliest nog
  minder moraal dan alleen ingegraven. In de iso-weergave staan de mannen erin lager,
  en de wal verbergt hun benen. Een loopgraaf blijft liggen als het regiment vertrekt;
  elk regiment dat vlak bij een lege voltooide loopgraaf tot stilstand komt, stelt
  zich erin op - ook bij de tweede of derde keer - front de kant op die de
  loopgraaf heeft, en gaat in verdedigende houding. Wie wegloopt, laat de loopgraaf
  los, zodat hij vrij is voor de volgende (of voor hetzelfde regiment). Ook de Britse
  commandant graaft in waar hij verdedigt.
- **Moraal**: boven elk regiment in zicht een balkje van groen naar rood; een
  knipperend rood "!" als het wankelt (onder 45), een witte vlag als het merendeel
  vlucht; een zwaardje en trommel tonen dat officier en tamboer er nog zijn (die
  houden de moraal op peil).
- **Flank en rug**: een regiment (niet in carré) dat van opzij geraakt wordt krijgt
  25% meer schade en 50% meer moraalverlies; van achteren 50% en het dubbele.
  Bij een cavaleriecharge rekent de charge de flank al mee; het moraalverlies groeit wel.
- **Artillerie**: kanonskogels vliegen in een boog met een schaduw eronder en
  stuiteren na de inslag verder, met opspattende aarde en een krater die anderhalve
  minuut zichtbaar blijft. Een kogel op een loopgraaf beschadigt hem: genoeg
  treffers en hij zakt een niveau, op niveau 1 ontstaat een bres (veel minder
  dekking); een kogel naast een schiettoren raakt de toren. Mannen in de loopgraaf
  herstellen hem zolang ze erin staan.
- **Tirailleurs** (knop 🌿 bij Formatie): het regiment stelt zich verspreid op (ruim
  twee keer zo ver uit elkaar), vuurt naar believen en 15% verder, is moeilijk te
  raken (28% minder, tussen bomen 45% minder), maar ruiterij doet er 70% meer schade.
  Nog eens drukken (of carré) sluit de gelederen.
- **Weer** (rechts naast de wind in de bovenbalk): helder, bewolkt, regen en mist
  wisselen elkaar af (elke 2,5 tot 5 minuten, met een overgang van ~25 s; regen
  komt uit bewolking). Regen valt schuin met de wind, maakt het beeld donkerder en
  doorweekt de bodem (in een minuut; drogen duurt vier minuten): natte grond is
  donkerder met plassen, en wie erover loopt laat sporen achter - voetafdrukken,
  hoefafdrukken, wielsporen van kanonnen - die vervagen naarmate het opdroogt.
  In de regen ketsen musketten (tot 30% van de schoten), modder vertraagt (18%,
  kanonnen 30%) en het zicht is 20% korter; mist legt een waas over het veld en
  halveert ongeveer het zicht.
- **Regiment maken** (⚑): selecteer een paar losse soldaten en tik *Regiment maken*:
  het neemt hen en vult aan met de dichtstbijzijnde vrije musketiers (tot 12, of meer
  als je er meer koos, tot 36), een officier en een tamboer, stelt ze in linie op
  naar de vijand en selecteert het regiment. Bij de kazerne staat dezelfde knop
  (voor de vrije mannen rond het verzamelpunt), *Train ontbrekende* (zet wat er
  nog mist in de wachtrij) en *Auto-regiment* (aan: de kazerne vormt zelf een
  regiment bij het verzamelpunt zodra er genoeg vrije mannen zijn). De knop laat
  zien wat er is (bv. 12/12 · O✓ · T✗) en noemt wat er ontbreekt.
- **Troepsoorten** (train in de kazerne en de stal, tegen een meerprijs; de Britten
  hebben ze ook):
  - *Grenadier* (🎩, uniform met berenmuts): 40% meer leven, 30% sterker met de
    bajonet, 30% minder moraalverlies — maar 15% trager en duurder (+60 🍞 +30 🪵).
  - *Voltigeur* (🪶, lichte compagnie): 25% verder schieten, vuurt naar believen, 15%
    sneller — maar 25% minder leven en zwak van dichtbij (+30 🍞).
  - *Oude Garde* (🦅, berenmuts met rode bovenlap, rode epauletten): de veteranen
    van de keizer — 60% meer leven, 50% sterker met de bajonet, 15% treffender,
    wijken bijna nooit — maar heel duur (+150 🍞 +80 🪵 +30 ⛏️), traag op te leiden
    en hooguit 24 man.
  - *Sapeur* (🪓, genie met berenmuts, baard, leren schort en bijl): een regiment
    met sapeurs graaft, versterkt en herstelt loopgraven sneller (half sapeurs = 2x,
    allemaal = 3x) — maar 20% zwakker vuur.
  - *Kurassier* (🛡, stalen kuras en helm met paardenstaart, zwarte paarden): 50% meer
    leven, het kuras houdt 30% van het musketvuur tegen, 30% zwaardere charge — maar
    15% trager en kost ijzer.
  - *Poolse Lansier* (🚩, czapka en lans met rood-witte wimpel): 80% zwaarder tegen
    infanterie die niet in carré staat en tegen vluchtende troepen — maar 25% zwakker
    tegen andere ruiters.
  - *Huzaar* (🐎, bruine paarden): 25% sneller, 40% verder zicht, sneller weer klaar —
    maar 25% minder leven en een lichtere charge.
  De Britten werven hun eigen soorten, met Britse namen: *Grenadiers*, *Light
  Companies* (voltigeurs), *95th Rifles* (groene jassen, Baker-geweer: 60% verder,
  25% treffender, schiet naar believen, scherpe ogen — maar laadt 60% trager),
  *Light Dragoons* (huzaren) en de *Scots Greys* (zware dragonders met berenmuts op
  grijze paarden: 35% meer leven, 40% zwaardere charge — maar 10% trager).
  Een regiment dat vooral uit één soort bestaat heet ernaar (bv. "Franse Grenadiers 4",
  "Britse 95th Rifles 7").
- **Menu onderin**: toont alleen wat bij je selectie past, in groepen met een kopje
  en een vaste volgorde. Boeren: *Werk* (akker, bouw hervatten) en *Bouwen*
  (woning, graanakker, kazerne, schiettoren, stal, gieterij). Soldaten: *Bevel*
  (halt, bajonet/charge, verdedig, loopgraaf versterken), *Formatie* (linie,
  colonne, carré, draaien) en *Regiment* (maken, versterken, selectie). Een gebouw:
  *Productie* (trainen, verzamelpunt). Niets geselecteerd: een korte uitleg.
  De knoppen hebben een eigen stijl: donker gelakt hout met een messingrand,
  een serif-letter, een icoon boven elk label en een gekleurde bovenrand per groep
  (Bevel rood, Formatie blauw, Regiment goud, Productie groenblauw, Werk groen,
  Bouwen bruin); de gekozen formatie licht goud op, wat je niet kunt betalen is
  grijs met een gestippelde rand.
- **Schietbereik**: selecteer je soldaten (of artillerie) of een schiettoren, dan
  ligt hun bereik als een licht geel veld met een duidelijke rand op de grond (het
  bereik van alle schutters samen; rood bij een vijandelijke selectie). Vijanden
  binnen dat veld krijgen een rode ring aan hun voeten. Musketiers vuren op de open
  kaart tot 200 px (het standaardspel houdt 122): wat je in het veld ziet, wordt
  beschoten, en een marcherende lijn houdt halt zodra er een vijand binnen komt.
  Mannen in een loopgraaf of een ingegraven linie (verdedigend) vuren naar
  believen: geladen en een vijand binnen bereik, dan schieten ze meteen, zonder op
  de gezamenlijke salvo-maat (tot 3 s) te wachten.
- **Schiettoren**: boeren bouwen hem met de knop **Schiettoren** (260 hout). Een
  vierkante toren (Blender-model): stenen voet met schietgaten, een uitkragende
  houten schutterskamer met schietsleuven en musketlopen, een piramidedak en de
  vlag van de eigen kant. Klaar? Dan vuurt het garnizoen elke ~2,6 s een salvo van
  2 schoten op de dichtstbijzijnde vijand binnen ~240 px (en zichtbaar), met
  kruitdamp uit de sleuven. Vanaf de toren zie je ver (zicht 420, hoger op een
  heuvel). De vijand kan hem beschieten en slopen (1100 HP). De Britse commandant
  bouwt er na 5 minuten zelf één of twee, aan de kant van de Fransen.
- **Grotere regimenten**: 12 tot 36 musketiers. "Selecteer nabij" vult aan tot 36, een
  officier verzamelt alle vrije musketiers in zijn buurt (tot 36), en **Versterk
  regiment** (één regiment + losse musketiers geselecteerd) voegt ze toe.

## Selecteren en aanwijzen in de iso-weergave

- Een klik op een soldaat gaat vóór het gebouw erachter (soldaten bij de deur van een
  kazerne staan binnen diens voetafdruk, en gebouwen gingen eerst).
- Bomen, struiken, rotsen en gebouwen worden aangewezen op hoe ze getekend zijn: een
  klik op de kroon van een boom of het dak van een gebouw telt (daarvoor kwam de klik op
  de grond áchter de boom uit). Bij overlap telt wat vooraan staat. Zo is een boer met
  rechtsklik of tik makkelijk aan het hout, ijzer of een gebouw te zetten.
- Een Brits regiment in gevecht blijft in linie: kleine verschuivingen van de
  commandant worden genegeerd, grotere gaan in linie in plaats van via een marskolonne
  (eerder sprongen regimenten om de paar seconden van linie naar colonne en terug).

## Veldslagen en de Britse AI (open kaart)

`src/systems/ai/campaign-pressure-v1.js`, aan met `NRTS_CONFIG.ai.pressure` (alleen met
`?view=iso`). Een versneld potje met een passieve speler liet zien dat de Britse
commandant één keer aanviel en daarna bleef wachten: hij wilde twee volle regimenten,
zijn boeren bleven op voedsel staan (hout raakte op), de productie wachtte op een stal
die hij niet kon betalen, losse musketiers vormden nooit een regiment, en soldaten
konden geen gebouwen beschieten (het snelle doel-zoeken voor grote legers sloeg ze
over), zodat een hoofdgebouw - en dus de slag - nooit te nemen was. De laag houdt de
eigen commandant (verzamelen → opmars → aanval → flank) en voegt toe:

- **Aanvalsgolven op de klok**: de eerste na 2,5 minuut, daarna elke 3 minuten (±30 s),
  ook met één regiment, zodra het leger minstens 80% zo sterk is als het Franse (na
  2 minuten wachten gaat hij toch). Nieuwe regimenten die thuis worden gevormd, volgen
  als versterking en houden de aanval niet op.
- **Gevechten die uitgevochten worden**: een golf vecht door zolang hij niet duidelijk
  verliest (pas na 12 seconden achter elkaar onder de helft van de vijand ter plekke,
  en nooit in de eerste 25 seconden), hoogstens 2,5 minuut; dan hergroeperen thuis en
  de volgende golf. Terugtrekken alleen bij lage moraal én een verloren gevecht ter
  plekke (eerder keerden kolonnes een vijand die ze aan het verslaan waren de rug toe).
- **Een onverdedigd hoofdgebouw wordt belegerd** tot het valt; de linie stelt zich
  binnen musketbereik van de muren op, en gebouwen zijn weer te beschieten (bereik
  gemeten tot de muur). Een speler die niets doet, verliest na 8 à 13 minuten.
- **Vluchters vluchten naar huis**, over de dichtstbijzijnde brug als dat over de
  rivier is (ze bleven tegen de oever of midden tussen de vijand staan), en herstellen
  zich thuis of waar ze vastlopen buiten schot. Voor beide kanten.
- **Economie**: 18 boeren in plaats van 10, verdeeld over voedsel en hout naar wat
  ontbreekt, boeren op de graanakkers als voedsel krap is, en musketiers, officieren
  en tamboers in opleiding terwijl hij voor een gebouw spaart.
- `window.__AI_PRESSURE_V1__.stats()`: golven, volgende golf, stand van de commandant
  en een logboek (`aanvalsgolf 2: 4 regiment(en), 61 man`, `golf 1 afgebroken: …`).

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
- **Wegen** als één wegdek (`RoadField` in het script): voor het hele slagveld wordt op
  een raster van 25 cm uitgerekend hoe ver elk punt van de dichtstbijzijnde weg ligt
  (per soort: chaussee of aarden weg), en het wegdek wordt daaruit getekend. Alle
  wegen vormen zo samen één oppervlak: een **kruispunt is een kruispunt**, geen weg die
  over een andere ligt; de binnenhoeken zijn afgerond (een zacht minimum van de
  afstanden) en doodlopende einden rond. Eerst de bermen (uitgesleten, met gras dat
  naar buiten toe terugkomt), daarover de rijbanen:
  - chaussee: onregelmatige keien (Voronoi-cellen van ~20 cm, elk een eigen tint, met
    donkere voegen) - zonder richting, dus geen naad in het patroon op een kruising;
    grindbermen;
  - zijweg: aangestampte aarde met twee karrensporen en hier en daar een plas erin; de
    sporen vervagen waar twee wegen samenkomen;
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
