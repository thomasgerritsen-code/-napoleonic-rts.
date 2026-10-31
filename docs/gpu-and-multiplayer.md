# Browsergame: GPU-weergave en multiplayerfundament

## Wat nu werkt

De isometrische game heeft een WebGL2-renderpad voor terrein, soldaten, paarden,
kanonnen, bomen en voltooide gebouwen. Opeenvolgende sprites behouden hun
dieptevolgorde en transparantie. Verschillende afbeeldingen delen één texture
array: een aaneengesloten reeks sprites heeft doorgaans één tekenopdracht nodig.
Geclipte loopgraafsoldaten, bouwsteigers, getekende stenen, effecten, mist en HUD
blijven op Canvas2D. Bij zo'n overgang wordt de GPU-reeks eerst samengesteld.
Er wordt dus geen bestaande afbeelding van het hele spel op de GPU vergroot;
bronafbeeldingen en atlasframes worden op de GPU uitgesneden en geschaald.

Afbeeldingen worden verdeeld in blokken van 512 pixels met een rand voor
vloeiende filtering. De texture array reserveert maximaal 96 MiB op desktop en
48 MiB bij een grove aanwijzer. Nieuwe uploads zijn begrensd tot vier blokken
per beeldframe. Ontbrekende blokken gebruiken tijdelijk Canvas2D. Oude blokken
worden hergebruikt of verwijderd; een nieuwe slag geeft de GPU-opslag vrij.
Dit budget is aanvullend op de bestaande afbeeldings- en Canvascaches.

Op desktop start WebGL2 automatisch als het beschikbaar is. Telefoons gebruiken
standaard de gecachte Canvas2D-route: kopieën tussen de GPU en Canvas kunnen daar
de weergave vertragen. Mobiel is de pixelverhouding maximaal 1,5 (voorheen 2):
bij een scherm met hoge pixeldichtheid worden 44% minder beeldpixels getekend.
Automatische HD-spritevergroting staat op mobiel uit, zodat tijdens het spelen
geen extra volledige atlassen worden gedecodeerd (voorheen maximaal 240 MiB).
De bediening blijft in dezelfde CSS-coördinaten werken en de spelregels veranderen
niet. Expliciet `hd` of `gpu=on` blijft beschikbaar voor diagnose. Bekende softwarerenderers zoals
SwiftShader en llvmpipe gebruiken standaard Canvas2D: WebGL betekent daar geen
toegang tot een echte videokaart. Zonder WebGL of bij een contextfout blijft de
game werken. Na herstel van de context kunnen textures opnieuw worden geladen.

Diagnose via de URL:

- `?view=iso`: automatische keuze.
- `?view=iso&gpu=off`: uitsluitend het bestaande Canvas2D-pad.
- `?view=iso&gpu=on`: WebGL forceren, ook op een softwarerenderer.

`window.__ISO_GPU_V1__.stats()` en `__ISO_VIEW_V1__.stats().gpu` geven de actieve
renderer, uploads, tekenopdrachten, geheugenbudget, softwaredetectie en fouten.
Een betere framerate op fysieke videokaarten moet op het doelapparaat worden
gemeten. Geforceerd WebGL op de software-GPU van een testmachine is veel trager
en vormt geen bewijs voor versnelling op hardware.

## Multiplayer: eerste online privéwedstrijden (v1.4.6)

Er is nu een WebSocket-spelserver met kamers voor twee spelers, Frankrijk tegen
Groot-Brittannië. De server verwerkt de bestaande simulatie en opdrachten; de
clients ontvangen zichtgefilterde verschillen en tekenen vloeiende beweging.
Kamerlinks, herverbinden, pauzeren bij uitval en gescheiden economieën zijn
geïmplementeerd. Singleplayer opent geen netwerkverbinding.

De spelserver draait als één blijvende Node-runtime met een tijdelijke,
non-renderende Chromium-adapter voor de bestaande spelregels. Strategische
Britse AI staat in PvP uit. De statische Vercel-site kan de client blijven
leveren, met een WSS-verbinding naar de aparte spelserver. `Dockerfile` en
`railway.json` staan klaar; openbare hosting vereist een verbonden hostingaccount.
Het toevoegen van deze bestanden start op zichzelf geen openbare server.

De oorspronkelijke gedeelde modules blijven de basis:

- `src/network/command-protocol.js`: toegestane opdrachten en eigendom.
- `src/network/match-authority.js`: serverklok, volgorde en uitvoeringscontroles.
- `src/network/browser-command-gateway.js`: bestaande bediening naar opdrachten.
- `src/network/online-simulation-bridge.js`: legacyserveradapter en clientbeeld.
- `src/network/online-client.js`: lobby, verbinding en sessieherstel.
- `server/`: WebSocketkamers, begrensde levensduur, snapshotverschillen en runtime.

Zie [Online multiplayer](online-multiplayer.md) voor spelen, starten, hosting,
veiligheidsgrenzen, tests en de verdere migratie naar een pure Node-simulatie.

## Verificatie

- Browsertests vergelijken GPU-pixels met Canvas2D voor uitsnijden,
  transparantie en tekenvolgorde en controleren geheugen, uitval en herstel.
- Browsertests sturen echte spelopdrachten en controleren selectie, productie,
  herhaalde opdrachten, vijandelijke eenheden en reset.
- Node-tests koppelen twee spelers aan één klok en controleren opdrachtvolgorde,
  spelergebonden snapshots, eigendom, herhaling en wachtrijbegrenzing.
- De CPU-rivieroptimalisatie is apart gemeten op de gepubliceerde referentie:
  bij 134 levende eenheden en 23 gebouwen na 330 simulatieseconden daalde de
  gemiddelde stap van 7,17 naar 5,21 ms (circa 27%). Eindposities en levenspunten
  waren gelijk. Dit is geen frameratebelofte; de daadwerkelijke framerate hangt
  ook af van tekenen, apparaat en legeromvang.
