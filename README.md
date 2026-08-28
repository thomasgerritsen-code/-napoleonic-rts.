# Napoleonic RTS — v0.6.3

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.3 — blijvende versterkingen en realistisch bataljonsmarcheren

### Britse AI blijft na de eerste aanval produceren
De Britse AI beoordeelt zijn leger nu op **werkelijke levende gevechtssterkte + reeds bestelde versterkingen** in plaats van alleen op het aantal nog bestaande regimenten.

Daardoor:
- worden zwaar uitgedunde regimenten niet meer als een volledig leger meegeteld
- blijft infanterie worden aangevuld na verliezen
- blijft cavalerie worden aangevuld na verliezen
- blijft artillerie worden aangevuld na verliezen
- worden officieren en drummers als aparte noodzakelijke reserve onderhouden
- worden extra Houses gebouwd op basis van huidig én reeds besteld bevolkingsgebruik
- kan een tweede Barracks de versterkingsproductie versnellen
- krijgen verloren kanonnen en cavalerie na een veldslag prioriteit, zodat een lange infanteriewachtrij de zware eenheden niet blokkeert

De AI bouwt nieuwe aanvalsgolven op. Verse regimenten verzamelen eerst rond de Britse basis en worden daarna opnieuw naar het front gestuurd in plaats van dat de tegenstander na zijn eerste aanval stilvalt.

### Realistischer in formatie lopen
Een bataljon verplaatst zich bij een langere mars niet meer alsof iedere soldaat afzonderlijk rechtstreeks naar zijn uiteindelijke positie loopt.

De beweging verloopt nu in fasen:
1. **Marscolonne vormen** — de soldaten sluiten eerst aan in een compactere colonne.
2. **Gezamenlijk marcheren** — het bataljon beweegt rond één gezamenlijke formatie-ankerpositie.
3. **Geleidelijk draaien** — bij bochten verandert het front stapsgewijs in plaats van dat alle soldaten onmiddellijk omklappen.
4. **Ontplooien** — vlak bij het doel gaat de groep terug naar de gekozen Linie, Colonne of Carré.
5. **Gevormd** — de eenheden nemen hun definitieve posities en front in.

Wanneer achterblijvers te ver uit de formatie raken, vertraagt de groep tijdelijk zodat de samenhang behouden blijft.

### Rechts vasthouden + slepen bepaalt het bataljonsfront
Voor een geselecteerd bataljon:
- houd de **rechtermuisknop** ingedrukt op de gewenste eindpositie
- sleep in de richting waarin het bataljon moet kijken
- laat de rechtermuisknop los

Het beginpunt van de sleepactie is dus de **bestemming** en de sleeprichting bepaalt het **uiteindelijke front**.

Tijdens het slepen wordt zichtbaar:
- een richtingspijl
- de geplande frontlijn van het bataljon
- de front-hoek in graden

De invoer wordt op window/capture-niveau gevolgd, zodat de gekozen richting niet verloren gaat wanneer de muis bij het loslaten over een HUD-element terechtkomt.

## Tests voor v0.6.3

De regressiesuite bevat nu **13 Chromium-tests**. Nieuw zijn onder andere:
- een echte Playwright-rechtermuissleep die controleert op `marscolonne → mars → ontplooien → gevormd`
- controle dat de uiteindelijke formatie exact de gesleepte richting aanneemt
- een volwassen Britse legertest waarin zware verliezen aan infanterie, cavalerie en artillerie worden toegebracht en vervolgens wordt gecontroleerd dat **alle drie opnieuw worden geproduceerd**
- de bestaande 520-unit stresstest
- de versnelde 10-minuten soak-test

De laatste pre-release Chromium-run voor v0.6.3 eindigde met **13/13 geslaagd**.

## Testlab en performance uit v0.6.2

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

Na verdere handmatige feedback kan v0.7 zich richten op firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, betere interactie tussen meerdere bataljons tijdens manoeuvres, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
