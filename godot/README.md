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
