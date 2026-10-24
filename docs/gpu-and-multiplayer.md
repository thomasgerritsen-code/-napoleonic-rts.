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

## Multiplayer: opdrachtlaag is aangesloten, online wedstrijden volgen

De game blijft nu singleplayer. Er wordt nog geen netwerkverbinding geopend en
er is geen online-lobby. Wel gebruiken gewone verplaats-, richt-, formatie-,
halt-, basisproductie-, bouw-, regiment-, bajonet-, charge- en artillerieknoppen
al een gedeeld opdrachtformaat. Speciale troepentraining en de nieuwe
officiertoewijzing gebruiken datzelfde formaat. De huidige Franse bediening
blijft direct reageren, zonder extra netwerkwachttijd.

Een opdracht bevat protocolversie, volgnummer, type, geselecteerde eenheden-ID's,
eventueel een gebouw-ID en alleen de toegestane opdrachtgegevens. Camera,
HTML-elementen, schermcoördinaten, grondstoffen en levenspunten worden niet
meegestuurd. Selectie is lokaal; een opdracht met expliciete ID's kan onafhankelijk
van de huidige selectie worden toegepast. De lokale diagnosegeschiedenis bevat
hoogstens 64 opdrachten en wordt bij een nieuwe slag gewist.

De browser en Node kunnen dezelfde modules gebruiken:

- `src/network/command-protocol.js`: formaat, toegestane velden, grenzen en eigendom.
- `src/network/match-authority.js`: één gezaghebbende klok, opdrachtvolgorde,
  controles bij ontvangst én uitvoering, begrensde wachtrij en bevestigingen.
- `src/network/browser-command-gateway.js`: koppeling met de bestaande bediening.

De autoriteitsmodule bindt maximaal twee vertrouwde speler-ID's aan Frankrijk en
Groot-Brittannië. Een opdracht kan zijn eigen identiteit niet kiezen. Opdrachten
worden op de volgende servertik uitgevoerd; een client bepaalt geen tiknummer of
tijdsverloop. De standaardfrequentie is 20 Hz. Er zijn maximaal 40 opdrachten per
speler per seconde en maximaal 128 wachtende opdrachten. Dubbele of oude
volgnummers en vijandelijke eenheden worden geweigerd.

Een toekomstige server levert de adapter `unit`, `building`, `world`, `apply`,
`step` en **`snapshotFor(side)`**. De adapter blijft verantwoordelijk voor de
echte spelregels, kosten en zichtbaarheid. `snapshotFor` moet mist van oorlog en
eigen economie toepassen; de bestaande volledige debug-snapshot mag niet aan
tegenstanders worden verstuurd. De module bouwt geen veilige zichtfilter uit
een onbegrensde snapshot en maakt de oude simulatie nog niet zelfstandig op
Node uitvoerbaar.

Voor echt online spelen moeten nog worden aangesloten:

1. De volledige simulatie als serveradapter, zonder afhankelijkheid van DOM,
   lokale selectie of Franse spelerbediening; AI uit voor een menselijke Britse
   speler. Ook verzamelen, rallypunten, snelle regimentvorming en de overige
   bijzondere acties krijgen expliciete opdrachten.
2. Een verbinding met een blijvende spelserver, authenticatie, sessie-ID's,
   kamercodes en opnieuw verbinden. De bestaande statische Vercel-site kan de
   browserclient blijven aanbieden; de spelserver heeft een eigen runtime nodig.
3. Zichtgefilterde snapshots, verschillen tussen updates, interpolatie op de
   client en herstel na pakketverlies. Clients sturen uitsluitend opdrachten.
4. Twee echte browsers met verschillende partijen, langere netwerktests met
   vertraging, verbrekingen en pogingen om verborgen informatie op te vragen.

Dit fundament kiest bewust geen transport of hostingdienst: WebSocket en een
dedicated server kunnen op dezelfde opdracht- en autoriteitsmodules aansluiten.

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
