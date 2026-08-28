# Napoleonic RTS — v0.6

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Wat is nieuw in v0.6

### Rallypoints en productie zonder stapelen
- Town Center, Barracks, Stable en Artillery Foundry hebben een eigen **verzamelpunt/rallypoint**
- Selecteer een productiegebouw en klik **🚩 Verzamelpunt**, daarna op de gewenste positie op de kaart
- Nieuwe eenheden verschijnen eerst op een vrije positie rond het gebouw en lopen daarna naar een willekeurige vrije plek rond het rallypoint
- Hierdoor staan geproduceerde eenheden niet meer allemaal exact op dezelfde plek en wordt het rond elkaar heen cirkelen sterk verminderd
- Het rallypoint is zichtbaar als vlag op het slagveld

### Zichtbare productiewachtrij
Bij selectie van een Town Center, Barracks, Stable of Foundry verschijnt een apart productievenster met:
- de complete wachtrij
- huidig product
- voortgang in procenten
- wachtende eenheden
- coördinaten van het ingestelde verzamelpunt

### Regimenten kunnen breken
Infanterieregimenten bestaan niet meer kunstmatig door wanneer vrijwel iedereen is uitgeschakeld.
- Regiment breekt wanneer de groepsmoraal onder **32%** komt
- Regiment breekt ook wanneer nog **maximaal één derde** van de oorspronkelijke gevechtssterkte over is
- Overlevenden worden daarna losse eenheden; een deel kan bij zeer lage moraal vluchten
- Verlies van officier en drummer blijft de moraal negatief beïnvloeden

Cavalerieregimenten hebben een breekgrens van **28% moraal** en dezelfde één-derde-regel.

### Kanonnen hebben bemanning nodig
Een kanon is nu een formele **artilleriebatterij**:
- selecteer **1 kanon + 2 vrije musketiers**
- klik **Kanonbemanning**
- de twee musketiers worden structureel aan het kanon toegewezen
- zonder twee levende bemanningsleden kan het kanon niet bewegen of vuren
- verliest de batterij een bemanningslid, dan valt de batterij uiteen en moet het kanon opnieuw worden bemand
- boven het kanon staat zichtbaar `0/2`, `1/2` of `2/2`

### Boeren blijven automatisch doorwerken
- Een boer onthoudt of hij hout of voedsel aan het verzamelen was
- Is een boom of voedselbron leeg, dan zoekt hij automatisch de dichtstbijzijnde nieuwe bron van hetzelfde type
- De speler hoeft hem dus niet na iedere uitgeputte bron opnieuw een opdracht te geven

### Regiment-level pathfinding
- Formele groepen gebruiken nu een A*-routeplanner op groepsniveau
- De planner ontwijkt gebouwen in plaats van regimenten er recht doorheen te sturen
- Wegen, bossen en heuvels beïnvloeden de routekosten
- Lokale spatial-hash/separation blijft zorgen voor fijnere unitbeweging binnen en tussen groepen

### Drag-to-face
Naast normale rechtsklik kun je nu **met de rechtermuisknop slepen**:
1. begin op de gewenste eindpositie
2. sleep in de richting waarin het front moet staan
3. laat los

Het regiment marcheert via zijn route naar die positie en neemt daarna de gekozen richting aan. Q/E en de 15°-rotatieknoppen blijven beschikbaar.

### Terrein
De kaart bevat nu functionele terreinsoorten:
- **Weg:** hogere bewegingssnelheid
- **Bos:** tragere beweging, vooral voor cavalerie/artillerie, maar minder ontvangen schade en morale-shock
- **Heuvel:** tragere beklimming, maar ongeveer 10% extra aanvalsschade vanaf de hoogte

### Fog of war met geheugen
- De directe zichtcirkel blijft bepalen welke Britse eenheden zichtbaar zijn
- Reeds verkend terrein blijft daarna gedeeltelijk zichtbaar in plaats van weer volledig zwart te worden
- De minimap onthoudt eveneens verkend terrein

### Formele cavaleriegroepen
- Minimaal **4 cavaleristen + 1 officier** kunnen een cavalerie-regiment vormen
- Cavaleriegroepen bewegen via dezelfde regiment-pathfinding
- Ze behouden richting, lijn/kolom en chargegedrag

### Grotere kaart en Britse strategie
- Slagveld vergroot naar **3800 × 2200**
- Britse basis en grondstoffen liggen verder weg zodat verkenning relevanter wordt
- Britse AI kiest per slag een strategie: **aggressive, balanced of defensive**
- De AI ontwikkelt Barracks, Stable en Foundry
- De AI vormt infanterie- en cavaleriegroepen
- Britse artillerie krijgt automatisch twee musketiers als bemanning; ontbreken die, dan traint de AI eerst nieuwe musketiers
- Infanterie, cavalerie en artilleriebatterijen worden gecombineerd in militaire orders

## Regimenten en batterijen

**Infanterieregiment**
- minimaal 12 musketiers
- 1 officier
- 1 drummer

**Cavalerieregiment**
- minimaal 4 cavaleristen
- 1 officier

**Artilleriebatterij**
- 1 kanon
- exact 2 toegewezen musketiers als minimale operationele bemanning

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

Het project gebruikt **Playwright 1.62.1 + Chromium** in GitHub Actions. GitHub Pages wordt alleen gedeployed wanneer alle browsertests slagen.

De v0.6-suite controleert in een echte browser:
1. v0.6 laadt zonder JavaScript-errors, inclusief grotere kaart en minimap
2. rallypoint + productiewachtrij + drie geproduceerde musketiers staan verspreid in plaats van gestapeld
3. regiment valt uiteen bij te lage moraal én bij maximaal één derde resterende sterkte
4. kanon krijgt twee musketiers toegewezen en de batterij breekt wanneer bemanning verloren gaat
5. boer zoekt automatisch een volgende houtbron van hetzelfde type
6. echte right-drag gebruikt groepspathfinding en bewaart de gekozen eindrichting
7. verkend terrein blijft onthouden en weg/bos/heuvel worden correct herkend
8. Britse AI ontwikkelt Barracks, Stable en Foundry, infanterie, cavaleriegroepen en operationeel bemande artilleriebatterijen

De eerste complete v0.6-run eindigde met **8/8 tests geslaagd in Chromium**.

Bij een fout bewaart GitHub Actions het Playwright-rapport, screenshots, traces en video's als artifact. De Pages-deploy wordt dan geblokkeerd.

## Test lokaal

```bash
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

## Mogelijke volgende stap — v0.7

- betere formatiecohesie tijdens lange marsen en bochten
- doelbewuste firing arcs en line-of-fire voor artillerie
- kanonbemanning zichtbaar animeren tijdens laden/vuren
- gebouwen kunnen aanvallen en belegering verbeteren
- meer resource- en economische ketens
- meerdere historische facties en unieke regimenten
- save/load en scenarioselectie
