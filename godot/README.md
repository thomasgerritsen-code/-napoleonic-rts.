# Napoleonic RTS in Godot

De Godot-versie van het spel, stap voor stap opgebouwd naast de webversie.
Open deze map (`godot/`) in Godot 4.7 of nieuwer: *Import* → `project.godot`,
en druk op F5.

**Versie 0.2** – het echte spel uit de webversie: dezelfde kaart, dorpen,
bruggen en grondstoffen, en dezelfde opening (stadhuizen, zes boeren per kant,
voorraden). Boeren verzamelen voedsel, kappen hout bij een houthakkerskamp,
winnen ijzer bij een mijn en werken op akkers; gebouwen (huis, akker, kamp,
mijn, kazerne, stal, gieterij, toren, hospitaal) worden gebouwd door boeren;
kazerne, stal en gieterij leiden musketiers, officieren, tamboers, cavalerie en
kanonnen op; 12–36 musketiers met een officier en een tamboer vormen een
bataljon. De Britse computer bouwt zijn basis op, vormt bataljons en valt aan.
Wie zijn stadhuis verliest, verliest.

Verder uit de webversie: de troepsoorten (grenadiers met granaten, voltigeurs,
garde, sappeurs, riflemen, kurassiers, lansiers, huzaren, Scots Greys,
12-ponders, houwitsers, rijdende artillerie, bereden officieren), carré tegen
cavalerie, ervaring van bataljons (Recruut tot Elite), schiettorens die twee
keer versterkt kunnen worden, en gewonden: wie valt kan gewond blijven liggen,
brancardiers van het veldhospitaal halen hem op en na herstel keert hij terug
naar zijn bataljon. Lichtgewonden lopen en herladen trager. Een bataljon dat
stelling houdt (G) zet zich schrap en graaft in linie een loopgraaf, die met
hout en ijzer bekleed en versterkt kan worden. Moreel: treffers en vallende
kameraden schokken de mannen, officier en tamboer houden ze bijeen; een
bataljon dat breekt slaat op de vlucht en verzamelt zich buiten gevaar weer.
Vuur in flank of rug treft harder; tirailleurs (T) staan verspreid en zijn
moeilijk te raken, maar kwetsbaar voor ruiterij. Kogels en granaten slaan
kraters en beschadigen loopgraven en torens. Marcheren en chargeren vermoeit.
De Britse computer valt aan in golven, breekt een verloren aanval af en
hergroepeert.

## In 3D

Dezelfde veldslag kan ook in 3D gespeeld worden: F3 in een slag (of de knop
"2D / 3D" bij aanraakbediening), of Singleplayer → *Veldslag in 3D*. De regels,
de Britse bevelhebber, opslaan en online spelen blijven gelijk; alleen het beeld
en de camera verschillen. In 3D: het reliëf van de kaart met de grondafbeelding,
de Blender-modellen van de plaatjes (de mannen met dezelfde animaties), loopgraven
met wal en schanskorven, kraters, kruitdamp, aarde en stof, de mist van de
oorlog, de gebieden, een zon met echte schaduwen die met het uur meedraait.
Camera: WASD/pijltjes of de middelste muisknop verschuift, Q/E draait, het wieltje
zoomt; twee vingers verschuiven en knijpen. De modellen komen uit
`scripts/export-godot-3d.py` (Blender; zie de uitleg bovenin dat script).

De mijn heeft een eigen 3D-model: een gesteunde mijningang, een houten
ertskar op houten rails, stortstenen, een pikhouweel en een materiaalschuurtje.
Beide landen gebruiken hetzelfde model en dezelfde bouwvoortgang en zichtregels.
De mijn bestaat uit één mesh met één 512×512-kleurtextuur; materialen en
schaduwen reageren op de bestaande verlichting van de veldslag.
Opnieuw maken met Blender (4.3 of nieuwer):

```sh
blender -b --python scripts/export-godot-3d.py -- --only mine
```

De bewerkbare modelbeschrijving staat in `scripts/godot_mine.py`.

## Blender-modellen

Dorpsgebouwen en nieuwe gebouwen staan met hun hele voet op het terrein,
met een stenen fundering aan de lagere kant van een helling. Zie
[gebouwplaatsing](../docs/godot-building-ground.md) voor de controles en vergelijking.

De 3D-gieterij, dorpskerk en herberg hebben eigen modellen. Speciale infanterie,
kurassiers, lansiers, Scots Greys en bereden officieren dragen hun eigen
uitrusting; gewone lijninfanterie heeft meerdere campagne-uiterlijken.
De bestaande animaties en troepstatistieken blijven behouden. Herkomst,
exportopdrachten en budgetten staan bij [de Blender-modellen](../docs/godot-blender-art-v3.md).

## Weer en bouwwerk in 3D

De rivier stroomt; regen, sneeuw en voet- en hoefsporen worden in vaste GPU-batches
getekend. Natte grond en daken veranderen mee. De vier seizoenen lopen vloeiend
over: herfstbladeren, kale loofbomen en besneeuwde grond in de winter. Zon,
maanlicht, bewolking en verlichte ramen volgen de bestaande spelklok. Tijdens
het bouwen verschijnen fundering, muren en dak op hun echte hoogte, met houten
steigers die bij voltooiing verdwijnen. Opslaan, laden en online spelen gebruiken
de bestaande bouwvoortgang en het weer van de host.

Budgetten, beperkingen en controles staan bij [de 3D-wereld](../docs/godot-world-v4.md).

De rivier ligt in een uitgewerkte bedding met oplopende oevers en een overgang
naar de bestaande grastextuur, binnen hetzelfde aantal tekenlagen. Uitleg en de echte voor-en-na-controle
staan bij [de rivier](../docs/godot-river.md).

Het daglicht is afgestemd op de pc-renderer: lichte gevels, daken en uniformen
houden detail, met behoud van de bestaande nachtverlichting. De lichtbalans
en pixelcontroles staan bij [de belichting](../docs/godot-lighting.md).

## Prestaties en beweging

Nieuwe militairen verzamelen zich op afzonderlijke vrije plekken bij de kazerne
of verzamelvlag. Een opgestelde loopgraafrij blijft rustig staan; rust ademt
langzaam, terwijl schieten en nieuwe marsorders direct blijven reageren.
Zie [verzamelplaatsen en loopgraven](../docs/godot-recruits-and-trenches.md).

Grote veldslagen gebruiken gedeelde zoekvakken voor doelen en een gezamenlijke
routeplanner rond gebouwen en boomstammen. Bevriende troepen houden rechts bij
het passeren; de bestaande brugroutes blijven behouden. Bij een charge blijven
mannen op contactafstand staan voor bajonet- en sabelslagen.

In 3D pauzeren verborgen spriteanimaties en animaties buiten de camera; de
volledige Blender-modellen en grafische details blijven behouden. F3 herstelt
de actuele 2D-weergave. Meetresultaten, regressies en reproduceerbare opdrachten
staan in [prestaties en navigatie](../docs/godot-performance-navigation.md).

Zichtbare manschappen gebruiken een gedeelde, samengevoegde GPU-skin per model.
Alle oorspronkelijke onderdelen, animaties, materialen en afstandsdetails
blijven beschikbaar; de duizenden losse mesh-nodes verdwijnen. Zie
[grote zichtbare legers](../docs/godot-visible-army-performance.md) voor de
metingen en de vergelijking met de oorspronkelijke Blender-rigs.

## Op de iPad (Xogot)

Xogot is Godot voor iPad en iPhone (Godot 4.7, net als dit project).

1. Open in Safari op de iPad
   `https://github.com/thomasgerritsen-code/-napoleonic-rts./releases/download/godot-latest/NapoleonicRTS-project.zip`
   (na elke geslaagde controle bijgewerkt).
2. Tik in de Bestanden-app op de zip: hij pakt uit tot een map `NapoleonicRTS`.
3. Open die map in Xogot en druk op afspelen. De eerste keer importeert Xogot
   de plaatjes; dat duurt even.

Wie liever met git werkt: kloon de repository (bijvoorbeeld met Working Copy) en
open daarin de map `godot/`.

Bediening met de vingers: tik op een eigen soldaat of gebouw om te selecteren;
met troepen geselecteerd tik je op de grond voor een order, of druk je en sleep
je voor de frontrichting (de gouden pijl). Twee vingers verschuiven de kaart,
knijpen zoomt in en uit. Een werkbalk bovenin doet wat op de computer de
toetsen doen: menu, opslaan, laden, volgend bataljon, naar de selectie, Kader
(de volgende veeg trekt een selectiekader), niets selecteren en geluid.

De beginsituatie en de plaatjes komen uit de webversie via
`node scripts/export-godot-scenario.js` (met het spel lokaal geserveerd).

Besturing: klik of sleep om te selecteren (Shift voegt toe), rechtsklik voor
een opdracht (lopen, aanvallen, verzamelen, bouwen, op de akker werken), rechts
slepen zet de richting van een bataljon. Toetsen: 1 linie, 2 colonne, 3 carré, C charge, G stelling houden, T tirailleurs,
F bataljon vormen, Escape annuleert een bouwplan; WASD/pijltjes, middelste
muisknop en wieltje voor de camera, R voor een nieuwe slag na afloop.

**Online spelen** (twee spelers, elk met het spel): de een kiest in het menu
*Online hosten als Frankrijk* of *als Groot-Brittannië*; het menu toont zijn
adres. De ander vult dat adres in bij *Meedoen* en speelt de andere kant. De
slag begint zodra beiden verbonden zijn. Valt de verbinding weg, dan staat de
slag stil en verbindt de ander vanzelf opnieuw; wie het spel opnieuw heeft
gestart, komt via *Meedoen* terug in de lopende slag. Na afloop beginnen
beiden met *Opnieuw spelen* een nieuwe slag. De host rekent de slag door en stuurt de
stand tien keer per seconde; de bevelen van de ander gaan naar de host. Op
hetzelfde netwerk werkt het direct; over internet moet de host UDP-poort
47300 in zijn router doorsturen (of gebruik samen een VPN zoals Tailscale of
ZeroTier).

**Bijwerken:** het menu toont de versie en zoekt bij het openen naar een
nieuwere. Is die er, dan haalt *Bijwerken* de nieuwe `NapoleonicRTS.exe` van
de GitHub-release *Godot-versie (nieuwste)*, zet die op de plaats van de oude
en start het spel opnieuw. Zet het spel daarvoor in een map waarin het mag
schrijven (bijvoorbeeld Documenten of het Bureaublad).

GitHub controleert het project bij elke wijziging (`tests/smoke_test.gd`,
headless) en maakt een Windows-`.exe` (workflow *Godot*).
# Gedetailleerde wegen

De native wegen hebben bestrating, grindbermen, karrensporen en regenreactie
in de bestaande terreinpass. Zie [de wegdocumentatie](../docs/godot-roads.md).

De woonhuizen, boerderijen, schuren, herbergen en kerken hebben meer detail in
gevels, ramen en daken, met behoud van de bestaande funderingen en één mesh
per model. Zie [de huizendocumentatie](../docs/godot-house-details.md).
