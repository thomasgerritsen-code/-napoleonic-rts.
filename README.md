# Napoleonic RTS — v0.5

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Wat is nieuw in v0.5

### Regimenten met richting en front
- Een infanterieregiment vereist nog steeds minimaal **12 musketiers + 1 officier + 1 drummer**
- Regimenten hebben nu een echte richting/facing
- Tijdens mars draaien regimenten automatisch naar de marsrichting
- Met **Q/E** of de knoppen **↺/↻** roteer je een geselecteerd regiment 15°
- Linie, Colonne en Carré worden rond de gekozen richting geroteerd
- De regimentsmarker toont de huidige richting in graden

### Betere beweging en collision
- Nieuwe spatial-hash voor lokale unitqueries
- Eenheden sturen lokaal om gebouwen heen
- Separation voorkomt dat grote groepen op exact dezelfde positie samenklappen
- Overlapcorrectie is zachter binnen hetzelfde regiment zodat formaties intact blijven

### Stable en cavalerie
- Nieuw gebouw: **Stable** — 360 hout
- Cavalerie trainen: **150 voedsel + 50 hout**
- De Britse AI kan zelf een Stable bouwen en cavalerie produceren

### Artillery Foundry
- Nieuw gebouw: **Artillery Foundry** — 420 hout
- Artillerie trainen: **120 voedsel + 100 hout**
- De Britse AI kan zelf een Foundry bouwen en extra artillerie produceren

### Minimap en fog of war
- Nieuwe klikbare minimap rechtsonder
- Klik op de minimap om de camera te verplaatsen
- Vijandelijke eenheden en gebouwen zijn alleen zichtbaar binnen Franse zichtafstand
- De minimap toont eveneens alleen vijanden die op dat moment zichtbaar zijn
- Franse cavalerie en artillerie hebben een iets grotere zichtafstand

### Britse v0.5 ontwikkel-AI
De Britse tegenstander ontwikkelt zich nu verder dan alleen infanterie:
- verzamelt voedsel en hout
- bouwt Barracks en Houses
- vormt regimenten met officier en drummer
- bouwt na de eerste regimenten zelfstandig een Stable
- bouwt daarna een Artillery Foundry
- produceert cavalerie en artillerie
- bouwt uitbreidingsgebouwen sequentieel af zodat bouwers geen half voltooid project verlaten
- gebruikt de geproduceerde cavalerie en artillerie in militaire orders

## Productie

**Town Center**
- Boer: 50 voedsel

**Barracks**
- Musketier: 80 voedsel + 20 hout
- Officier: 160 voedsel + 60 hout
- Drummer: 90 voedsel + 20 hout

**Stable**
- Cavalerie: 150 voedsel + 50 hout

**Artillery Foundry**
- Artillerie: 120 voedsel + 100 hout

## Automatische Chromium-tests

Het project gebruikt **Playwright 1.62.1 + Chromium** in GitHub Actions. GitHub Pages wordt alleen gedeployed wanneer de browsertests slagen.

De v0.5-suite controleert:
- v0.5 laadt zonder JavaScript-errors en Canvas/minimap worden gerenderd
- regimenten behouden hun toegewezen officier en drummer
- regimentsrotatie werkt via echte UI-knoppen en Q/E
- Linie, Colonne en Carré blijven werken
- Stable-productie van cavalerie via een echte browserklik
- Foundry-productie van artillerie via een echte browserklik
- fog of war verbergt een verre Britse eenheid
- minimap is zichtbaar en interactief
- Britse AI bouwt in een versnelde simulatie Barracks, Stable en Foundry
- Britse AI vormt geldige regimenten en produceert cavalerie en artillerie

De eerste volledige v0.5 Chromium-run eindigde met **5/5 tests geslaagd**.

Bij een testfout bewaart GitHub Actions het Playwright-rapport en screenshots als artifact. De Pages-deploy wordt dan niet uitgevoerd.

## Test lokaal

```bash
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

## Mogelijke volgende stap — v0.6

- echte regiment-level pathfinding rond grote obstakels
- drag-to-face: marsdoel slepen om positie én front in één beweging te bepalen
- fog-of-war met verkend-terrein-geheugen
- terreinbonussen voor bos, wegen en hoogte
- cavalry-regimenten en artillery batteries als formele groepen
- grotere kaarten en meerdere AI-strategieën
