# Napoleonic RTS — v0.4

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Wat is nieuw in v0.4

### Echte regimenten
- Een infanterieregiment vereist minimaal **12 vrije musketiers + 1 vrije officier + 1 vrije drummer**
- De officier en drummer worden bij het vormen permanent aan het regiment toegewezen
- Klikken op één lid van een regiment selecteert het volledige regiment
- Sleepselectie die een regiment raakt selecteert eveneens het hele regiment
- Regimenten bewaren hun eigen formatie en bewegen als groep
- Linie, Colonne en Carré worden direct op het regiment toegepast
- Regimenten kunnen maximaal 36 musketiers bevatten

### Officier en drummer
- Nieuwe trainbare eenheden in de Barracks
- Officier kost 160 voedsel + 60 hout
- Drummer kost 90 voedsel + 20 hout
- Een regiment kan niet worden gevormd zonder beide rollen
- Verlies van de officier veroorzaakt een grote morale-schok
- Verlies van de drummer vermindert de morale-ondersteuning

### Britse ontwikkel-AI
De Britse tegenstander speelt nu niet meer met alleen een vooraf geplaatst leger:
- Britse boeren verzamelen zelfstandig voedsel en hout
- De AI traint extra boeren
- De AI bouwt zelfstandig een Barracks
- De AI bouwt Houses wanneer de population cap krap wordt
- Later kan de AI een tweede Barracks bouwen
- De AI produceert musketiers, officieren en drummers
- De AI vormt alleen regimenten wanneer een officier én drummer beschikbaar zijn
- De AI kan meerdere regimenten opbouwen
- Het eerste regiment verdedigt de basis tijdens de opbouwfase
- Daarna trekken Britse regimenten in formaties naar de Franse positie
- De Britse ontwikkelstatus is rechtsboven zichtbaar

### Bestaande systemen
- Hout- en voedseleconomie
- Boeren en gebouwen
- Barracks en Houses
- Population cap
- Morale en vluchtgedrag
- Musketvuur en salvo-cyclus
- Bajonetaanval
- Cavaleriecharge
- Artillerie met ronde kogel en grapeshot

## Regiment vormen

1. Selecteer minstens 12 losse musketiers.
2. Voeg 1 losse officier toe.
3. Voeg 1 losse drummer toe.
4. Klik **Maak regiment**.
5. Kies Linie, Colonne of Carré.

De startpositie bevat precies genoeg infanterie, een officier en een drummer om het systeem direct te proberen.

## Productie

**Town Center**
- Boer: 50 voedsel

**Barracks**
- Musketier: 80 voedsel + 20 hout
- Officier: 160 voedsel + 60 hout
- Drummer: 90 voedsel + 20 hout

## Automatische browsertests

Vanaf v0.4 gebruikt het project **Playwright 1.62.1 + Chromium** in GitHub Actions. Een nieuwe GitHub Pages-release wordt pas gepubliceerd nadat de browser-regressietests zijn geslaagd.

De huidige tests controleren in een echte headless Chromium-browser:
- de game laadt en het Canvas wordt gerenderd zonder JavaScript-errors
- regimentvorming via de echte UI-knop
- officier en drummer zijn structureel aan het regiment toegewezen
- Linie, Colonne en Carré werken via echte UI-klikken
- Barracks-productie van musketier, officier en drummer via echte UI-klikken
- grondstofkosten, productiequeue en voltooide productie
- de Britse AI ontwikkelt zijn economie gedurende een versnelde 180-seconden simulatie
- de Britse AI bouwt een complete Barracks en produceert nieuwe eenheden
- de Britse AI vormt minimaal één geldig regiment met officier en drummer

De eerste volledige Chromium-run eindigde met **4/4 tests geslaagd**.

Bij een testfout bewaart GitHub Actions automatisch het Playwright HTML-rapport, traces, screenshots en video's als artifact. De Pages-deploy is afhankelijk van de testjob en wordt bij een mislukte test niet uitgevoerd.

## Test lokaal

```bash
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

## Roadmap v0.5

- Regimentsrotatie en richting/front
- Betere collision en pathfinding tussen regimenten
- Minimap en fog of war
- Stable en cavalerieproductie
- Artillery Foundry en artillerieproductie
- Meerdere nationale AI-strategieën
- Meer terreinsoorten en kaartobjecten
