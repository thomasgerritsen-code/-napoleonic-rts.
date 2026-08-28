# Napoleonic RTS — v0.6.4

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.4 — marcheren alleen op wegen en vloeiendere formaties

### Wegen bepalen het marsgedrag
Bataljons gebruiken nu twee verschillende bewegingsvormen:

- **Op een weg:** het bataljon gaat over naar een compactere marscolonne en wordt als marcherend behandeld.
- **Buiten een weg:** het bataljon blijft in de gekozen veldformatie (Linie, Colonne of Carré) en verplaatst zich als samenhangende formatie, maar gebruikt geen marscolonne/marsstatus.

Wanneer een bataljon een weg op- of afloopt, veranderen de formatie-afstanden geleidelijk. De eenheden klappen daardoor niet abrupt van veldformatie naar marscolonne of andersom.

### Minder schokkerig bewegen
De oude beweging kon zichtbaar gaan trekken en afremmen doordat:
- de groepssnelheid in grote discrete stappen veranderde wanneer soldaten achterliepen
- individuele soldaten tegelijk hun formatievak en lokale ontwijking probeerden te volgen
- een groep bij het laatste waypoint met te veel snelheid een kleine draaicirkel kon blijven maken

v0.6.4 gebruikt daarom:
- een continu gesmoothde groepssnelheid
- geleidelijke draaiing van het groepsanker
- directe, vloeiende beweging van iedere soldaat naar zijn bewegende formatievak tijdens formele groepsorders
- zachte vertraging bij het uiteindelijke doel
- extra draaimogelijkheid bij lage snelheid vlak bij het eindpunt
- afgeronde tussenliggende routehoeken zonder het eindpunt over te schieten

Het resultaat is dat het bataljon als één massa beweegt zonder het eerdere trekken–afremmen–bijtrekken.

### Rechts vasthouden + slepen blijft de eindrichting bepalen
Voor een geselecteerd bataljon:
1. houd de **rechtermuisknop** ingedrukt op de gewenste eindpositie
2. sleep in de richting waarin het bataljon moet kijken
3. laat de rechtermuisknop los

De bestemming en gekozen front-richting blijven dus los van de vraag of de route over een weg of over open terrein loopt.

## Tests voor v0.6.4

De regressiesuite bevat nu **14 Chromium-tests**. Nieuw en aangepast zijn onder andere:
- een echte rechtsklik-sleeptest op open terrein die controleert dat de groep in `field-formation` beweegt, niet als marcherend wordt gemarkeerd en de gekozen eindrichting behoudt
- een aparte wegtest die controleert dat een bataljon op `road` wel `road-march` gebruikt en dat alle bataljonsleden als marcherend gelden
- een bewegingsstabiliteitstest die de afgelegde afstand van het groepsanker iedere 0,2 seconde meet en grote tempo-sprongen afkeurt
- controle dat zowel weg- als veldbeweging het eindpunt werkelijk bereiken en correct ontplooien
- de bestaande Britse versterkingstest, 520-unit stresstest en versnelde 10-minuten soak-test

De definitieve v0.6.4-code behaalde **14/14 geslaagde Chromium-tests** voordat GitHub Pages werd gedeployed.

## v0.6.3 — blijvende Britse versterkingen

De Britse AI beoordeelt zijn leger op **werkelijke levende gevechtssterkte + reeds bestelde versterkingen** in plaats van alleen op het aantal nog bestaande regimenten. Daardoor blijft de tegenstander na de eerste aanval infanterie, cavalerie en artillerie aanvullen en nieuwe aanvalsgolven opbouwen.

Verloren zware eenheden krijgen na een veldslag extra prioriteit, officieren en drummers worden als aparte noodzakelijke reserve onderhouden en de AI breidt huisvesting en productiecapaciteit uit wanneer dat nodig is.

## Testlab en performance

Druk tijdens het spelen op **F3** voor het test/debugpaneel. Het toont onder andere FPS, frametime, update- en rendertijd, aantallen units en groepen, collision-correcties, combat-targetingbelasting, vastgelopen routes en Britse AI-status.

Directe testscenario's omvatten onder andere regiment versus regiment, cavaleriecharge, drie bemande kanonnen, lage moraal, lage regimentsterkte, 520 musketiers en een vooruitgesimuleerde Britse basis.

De knop **Kopieer bugrapport** maakt een JSON-rapport met gameversie, speeltijd, selectie, economie, AI, units, gebouwen, groepen, performance en auditresultaten.

Combat-targeting gebruikt een **combat spatial hash**. De renderer-onafhankelijke `window.RTS_SIM` interface biedt `snapshot()`, `dispatch(command)`, `step(seconds)`, `audit()` en `getMetrics()` als voorbereiding op verdere schaalvergroting en een latere 3D-renderer.

## Bestaande gameplay

### Rallypoints en productie
- Town Center, Barracks, Stable en Artillery Foundry hebben een verzamelpunt
- geproduceerde eenheden verschijnen verspreid en lopen naar willekeurige vrije plekken rond het rallypoint
- geselecteerde productiegebouwen tonen hun complete wachtrij en voortgang

### Regimenten breken
- infanterie onder 32% groepsmoraal
- cavalerie onder 28% groepsmoraal
- formele gevechtsgroepen breken ook wanneer maximaal één derde van de oorspronkelijke sterkte overblijft

### Artillerie
- 1 kanon vereist 2 toegewezen vrije musketiers
- kanon + bemanning bewegen visueel als één samengestelde eenheid
- zonder twee levende bemanningsleden kan het kanon niet bewegen of vuren
- verlies van een bemanningslid breekt de batterij

### Boeren
Een boer onthoudt zijn grondstoftype en zoekt automatisch een volgende boom of voedselbron wanneer de huidige bron leeg is.

### Terrein en fog of war
- wegen versnellen en activeren bataljonsmarcheren
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

Na verdere handmatige feedback kan v0.7 zich richten op firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, betere interactie tussen meerdere bataljons tijdens manoeuvres, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
