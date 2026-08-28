# Napoleonic RTS — v0.6.5

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.5 — wegen worden echte marsroutes

### Bataljons zoeken bij lange verplaatsingen bewust een weg op
Een lange verplaatsingsorder wordt niet meer alleen op afstand beoordeeld. De routeplanner vergelijkt de verwachte reistijd van een gewone veldverplaatsing met een route die een bruikbaar deel over de weg loopt.

Daardoor kan een bataljon:
- eerst vanuit open terrein naar de weg bewegen
- daarna versneld over de weg marcheren
- bij het juiste punt de weg weer verlaten
- vervolgens in veldformatie naar de eindpositie bewegen en daar ontplooien

De weg is niet verplicht. Een wegroute wordt alleen gekozen wanneer:
- de order lang genoeg is om de omweg zinvol te maken
- een voldoende groot deel van de route daadwerkelijk over de weg loopt
- de extra afstand niet buitensporig groot wordt
- de hogere wegmars-snelheid de omweg qua geschatte reistijd voldoende terugverdient

Korte positioneringsorders blijven daarom rechtstreeks door het veld gaan.

### Duidelijk sneller op de weg
De groepssnelheden zijn bewust verder uit elkaar gezet zodat wegen tactisch merkbaar worden:

**Infanteriebataljon**
- veld: 36
- weg: 54
- ongeveer 50% hogere groepssnelheid op de weg

**Cavalerieregiment**
- veld: 64
- weg: 88
- ongeveer 38% hogere groepssnelheid op de weg

De bestaande cohesieregeling blijft actief: een formatie kan tijdelijk iets vertragen wanneer leden achterlopen. De overgang naar de hogere of lagere snelheid blijft gesmoothd, zodat het bataljon bij het op- en afgaan van een weg niet plotseling verspringt.

### Marsgedrag blijft gekoppeld aan terrein
De regel uit v0.6.4 blijft gelden:
- **op de weg:** compacte marscolonne + marsstatus + hogere snelheid
- **buiten de weg:** de gekozen Linie, Colonne of Carré blijft behouden als bewegende veldformatie, zonder marsstatus

De overgang tussen marscolonne en veldformatie verloopt geleidelijk.

## Tests voor v0.6.5

De regressiesuite bevat nu **15 Chromium-tests**. Nieuw is een route- en snelheidstest die onder andere controleert dat:
- een lange order vanaf open terrein een zinvolle wegroute kiest
- die route meerdere waypoints op de weg bevat
- de weg voldoende deel van de totale route vormt
- de omweg binnen de ingestelde grens blijft
- de geschatte wegroute sneller is dan dezelfde afstand op veldsnelheid
- een korte veldorder geen onnodige wegomweg maakt
- een infanteriebataljon op de weg duidelijk sneller beweegt dan een vergelijkbaar bataljon in het veld

De v0.6.5-code behaalde **15/15 geslaagde Chromium-tests** vóór deployment.

## v0.6.4 — alleen marcheren op wegen en vloeiendere formaties

v0.6.4 introduceerde het onderscheid tussen echte wegmars en veldverplaatsing. Op wegen vormen bataljons een compactere marscolonne; daarbuiten bewegen ze in hun gekozen veldformatie zonder marsstatus.

De schokkerige groepsbeweging werd verminderd met:
- continu gesmoothde groepssnelheid
- geleidelijke draaiing van het groepsanker
- directe beweging naar vloeiend bewegende formatieposities
- zachte vertraging bij het eindpunt
- afgeronde routehoeken

Rechts vasthouden + slepen blijft de bestemming en uiteindelijke front-richting van een geselecteerd bataljon bepalen.

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
- wegen versnellen, activeren bataljonsmarcheren en kunnen bewust als snellere marsroute worden gekozen
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

Na verdere handmatige feedback kan v0.7 zich richten op meerdere wegverbindingen en kruispunten, firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, betere interactie tussen meerdere bataljons tijdens manoeuvres, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
