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

De beginsituatie en de plaatjes komen uit de webversie via
`node scripts/export-godot-scenario.js` (met het spel lokaal geserveerd).

Besturing: klik of sleep om te selecteren (Shift voegt toe), rechtsklik voor
een opdracht (lopen, aanvallen, verzamelen, bouwen, op de akker werken), rechts
slepen zet de richting van een bataljon. Toetsen: 1 linie, 2 colonne, C charge,
F bataljon vormen, Escape annuleert een bouwplan; WASD/pijltjes, middelste
muisknop en wieltje voor de camera, R voor een nieuwe slag na afloop.

GitHub controleert het project bij elke wijziging (`tests/smoke_test.gd`,
headless) en maakt een Windows-`.exe` (workflow *Godot*).
