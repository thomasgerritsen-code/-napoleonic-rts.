# Napoleonic RTS — v0.4

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript en heeft geen externe dependencies.

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

## Testresultaten v0.4

Voor publicatie zijn alle bronmodules door een JavaScript-syntaxcontrole gehaald en is een geautomatiseerde DOM/integratietest uitgevoerd op dezelfde v0.4-code.

Getest:
- regimentknop blijft stabiel tijdens game-updates
- Frans regiment kan alleen geldig worden gevormd
- officier en drummer worden structureel toegewezen
- Linie, Colonne en Carré
- Barracks-productie van musketier, officier en drummer
- grondstofkosten en productiequeue
- Britse AI bouwt zelfstandig een complete Barracks
- Britse AI traint nieuwe eenheden
- Britse AI vormt zelfstandig regimenten
- elk AI-regiment heeft bij vorming een officier en drummer
- Britse basis groeit gedurende een 150 seconden versnelde simulatie

De integratietest eindigde met `FINAL PASS`.

Een echte headless-Chromium-run kon in de ontwikkelcontainer niet betrouwbaar starten door de GPU/DBus-omgeving; daarom is daarvoor niet ten onrechte een browser-pass geclaimd.

## Roadmap v0.5

- Regimentsrotatie en richting/front
- Betere collision en pathfinding tussen regimenten
- Minimap en fog of war
- Stable en cavalerieproductie
- Artillery Foundry en artillerieproductie
- Meerdere nationale AI-strategieën
- Meer terreinsoorten en kaartobjecten
