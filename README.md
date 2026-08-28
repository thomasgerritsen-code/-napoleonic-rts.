# Napoleonic RTS — v0.6.2

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.2 — testlab, performance en voorbereiding op 3D

Deze release is vooral bedoeld om handmatig testen veel waardevoller te maken en de simulatie technisch klaar te zetten voor verdere schaalvergroting.

### 1. F3 debug/testpaneel
Druk tijdens het spelen op **F3**. Het paneel toont live:
- FPS en frametime
- update- en rendertijd
- aantal levende eenheden
- aantal actieve groepen
- collision-correcties
- gemiddeld aantal combat-kandidaten per targeting-query
- vastgelopen groepsroutes
- actuele Britse AI-status
- details van de geselecteerde groep, gebouw of losse eenheden

### 2. Directe testscenario's
Vanuit het F3-paneel kun je zonder opbouwfase direct laden:
- normale slag
- regiment versus regiment
- cavaleriecharge tegen infanterie
- drie bemande kanonnen
- regiment rond 35% moraal
- regiment rond 40% resterende sterkte
- 520 musketiers voor performance-testing
- Britse basis vijf minuten vooruitgesimuleerd

### 3. Kopieerbaar bugrapport
De knop **Kopieer bugrapport** maakt een JSON-rapport met onder andere:
- gameversie en speeltijd
- browser/viewport
- huidig testscenario
- performancecijfers
- geselecteerde groep of eenheden
- economie en AI-plan
- alle levende units, gebouwen en groepen
- huidige auditresultaten

Dit rapport kan rechtstreeks in een bugmelding of ChatGPT-bericht worden geplakt.

### 4. Performanceverbetering
Combat-targeting gebruikte eerder voor veel eenheden herhaaldelijk een volledige lijstscan. v0.6.2 gebruikt daarvoor een aparte **combat spatial hash**. Alleen vijanden in relevante gridcellen worden bekeken. Gebouwen blijven lineair gecontroleerd omdat hun aantal klein is.

Het F3-paneel toont `combat candidates/query`, zodat zichtbaar wordt hoeveel potentiële doelen daadwerkelijk per targeting-query worden bekeken.

### 5. Scheiding simulatie en rendering
Er is nu een `window.RTS_SIM` simulatie-interface met:
- `snapshot()` — renderer-onafhankelijke state
- `dispatch(command)` — orders zoals bewegen, formatie en rotatie
- `step(seconds)` — gecontroleerd simuleren
- `audit()` — integriteitscontrole
- `getMetrics()` — performancegegevens

Canvas blijft voorlopig de renderer, maar tests/debugtools kunnen nu via dezelfde simulatie-interface werken. Dit is de eerste concrete stap richting een latere 3D-renderer zonder de gameplaylogica volledig opnieuw te schrijven.

### 6. Langere Chromium-tests
Naast de bestaande regressies zijn toegevoegd:
- F3/testlab + bugrapport-test
- 520-unit stresstest
- versnelde **10-minuten soak-test**

De audit controleert onder meer op:
- NaN of oneindige unitposities
- units buiten het slagveld
- actieve groepen zonder levende leden
- actieve artilleriebatterijen zonder operationele bemanning
- ongeldige productiewachtrijen
- ongeldige/negatieve economie-state
- groepen die langer dan 20 seconden geen voortgang maken op hun route
- langdurig onveranderd AI-plan als waarschuwing

## v0.6.1 — artillerie als één eenheid

Een operationele batterij bestaat uit **1 kanon + 2 toegewezen musketiers**. Het kanon is het bewegende hoofdelement en de bemanningsleden volgen vaste crew-slots. Daardoor bewegen kanon en musketiers visueel als één samengesteld object en ontstaat geen jitter door afzonderlijke infantry-pathfinding/collision.

## Belangrijkste gameplay uit v0.6

### Rallypoints en productie
- Town Center, Barracks, Stable en Artillery Foundry hebben een verzamelpunt
- geproduceerde eenheden verschijnen verspreid en lopen naar willekeurige vrije plekken rond het rallypoint
- geselecteerde productiegebouwen tonen hun complete wachtrij en voortgang

### Regimenten breken
- infanterie onder 32% groepsmoraal
- cavalerie onder 28% groepsmoraal
- iedere formele gevechtsgroep ook wanneer maximaal één derde van de oorspronkelijke sterkte overblijft

### Artillerie
- 1 kanon vereist 2 toegewezen vrije musketiers
- zonder twee levende bemanningsleden kan het kanon niet bewegen of vuren
- verlies van een bemanningslid breekt de batterij

### Boeren
Een boer onthoudt het grondstoftype en zoekt automatisch een volgende boom of voedselbron wanneer de huidige bron leeg is.

### Regiment-level pathfinding en drag-to-face
- groepen gebruiken A*-pathfinding rond gebouwen
- rechtsklik-slepen bepaalt doelpositie en eindrichting
- Q/E draait een geselecteerde groep 15 graden

### Terrein en fog of war
- wegen versnellen
- bossen vertragen maar beschermen
- heuvels vertragen en geven aanvalbonus
- verkend terrein blijft onthouden

## Formele groepen

**Infanterieregiment**
- minimaal 12 musketiers
- 1 officier
- 1 drummer

**Cavalerieregiment**
- minimaal 4 cavaleristen
- 1 officier

**Artilleriebatterij**
- 1 kanon
- 2 toegewezen musketiers

## Automatische Chromium-tests

Het project gebruikt **Playwright 1.62.1 + Chromium** in GitHub Actions. GitHub Pages wordt alleen gedeployed wanneer alle browsertests slagen. Bij fouten worden rapporten, screenshots, traces en video's als artifact bewaard.

Lokaal:

```bash
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

Alleen de soak-test:

```bash
npm run test:soak
```

## Richting v0.7

Na handmatige feedback kan v0.7 zich richten op betere formatiecohesie, firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, belegering, verdere economische ketens en verdere loskoppeling van de 2D-renderer.
