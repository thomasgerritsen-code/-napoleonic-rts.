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

De beginsituatie en de plaatjes komen uit de webversie via
`node scripts/export-godot-scenario.js` (met het spel lokaal geserveerd).

Besturing: klik of sleep om te selecteren (Shift voegt toe), rechtsklik voor
een opdracht (lopen, aanvallen, verzamelen, bouwen, op de akker werken), rechts
slepen zet de richting van een bataljon. Toetsen: 1 linie, 2 colonne, 3 carré, C charge, G stelling houden, T tirailleurs,
F bataljon vormen, Escape annuleert een bouwplan; WASD/pijltjes, middelste
muisknop en wieltje voor de camera, R voor een nieuwe slag na afloop.

GitHub controleert het project bij elke wijziging (`tests/smoke_test.gd`,
headless) en maakt een Windows-`.exe` (workflow *Godot*).
