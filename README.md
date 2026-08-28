# Napoleonic RTS — v0.6.1

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait volledig in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.1 — artillerie als één eenheid

De artilleriebemanning is opnieuw opgebouwd om het trillen rond een bewegend kanon te verwijderen.

- een operationele batterij bestaat nog steeds uit **1 kanon + 2 toegewezen musketiers**
- het kanon is nu het bewegende hoofdelement; de bemanningsleden volgen vaste crew-slots
- toegewezen musketiers voeren tijdens het bedienen geen eigen infantry-pathfinding of losse gevechtsbeweging meer uit
- de twee bemanningsleden blijven daardoor stabiel op dezelfde relatieve positie ten opzichte van het kanon
- tijdens verplaatsing staan beide musketiers zichtbaar achter het affuit en lijken ze het kanon voort te duwen
- de bemanning heeft een kleine loopanimatie en zichtbare armen richting het kanon tijdens het rijden
- stilstaand nemen de musketiers vaste posities naast de achterkant van het kanon in
- kanon + bemanning worden als één samengesteld object getekend, met één selectiering, één morale-indicator en één `2/2` crew-indicator
- de normale regel blijft gelden: als één van de twee toegewezen musketiers sneuvelt, breekt de batterij en moet het kanon opnieuw bemand worden

### Chromium-regressietest voor de artilleriefix

De testsuite controleert nu tijdens meerdere opeenvolgende simulatiestappen dat:
- het kanon daadwerkelijk vooruit beweegt
- beide musketiers exact dezelfde lokale positie ten opzichte van het kanon behouden
- beide bemanningsleden tijdens beweging op de vaste duwposities staan
- de afstand tussen beide bemanningsleden stabiel blijft
- de bestaande batterijbreuk bij verlies van bemanning blijft werken

De eerste v0.6.1-run eindigde met **9/9 tests geslaagd in Chromium**.

## Belangrijkste systemen uit v0.6

### Rallypoints en productie zonder stapelen
- Town Center, Barracks, Stable en Artillery Foundry hebben een eigen **verzamelpunt/rallypoint**
- selecteer een productiegebouw en klik **🚩 Verzamelpunt**, daarna op de gewenste positie op de kaart
- nieuwe eenheden verschijnen op een vrije positie rond het gebouw en lopen naar een willekeurige vrije plek rond het rallypoint
- het rallypoint is zichtbaar als vlag op het slagveld

### Zichtbare productiewachtrij
Bij selectie van een Town Center, Barracks, Stable of Foundry verschijnt een apart productievenster met de complete wachtrij, voortgang, wachtende eenheden en het ingestelde rallypoint.

### Regimenten kunnen breken
- infanterieregiment breekt bij groepsmoraal onder **32%**
- cavalerie-regiment breekt bij groepsmoraal onder **28%**
- groepen breken ook als maximaal **één derde** van de oorspronkelijke gevechtssterkte over is
- overlevenden worden losse eenheden en kunnen bij lage moraal vluchten

### Kanonnen hebben bemanning nodig
- selecteer **1 kanon + 2 vrije musketiers**
- klik **Kanonbemanning**
- zonder twee levende toegewezen bemanningsleden kan het kanon niet bewegen of vuren

### Boeren blijven automatisch doorwerken
Een boer onthoudt zijn grondstoftype. Als een boom of voedselbron leeg raakt, zoekt hij automatisch een volgende bron van hetzelfde type.

### Regiment-level pathfinding en drag-to-face
- formele groepen gebruiken A*-pathfinding om gebouwen heen
- rechtsklik-slepen bepaalt eindpositie én uiteindelijke richting/front
- Q/E en de 15°-rotatieknoppen blijven beschikbaar

### Terrein en fog of war
- wegen versnellen beweging
- bossen vertragen maar bieden bescherming
- heuvels vertragen beklimming en geven een aanvalbonus
- verkend terrein blijft gedeeltelijk zichtbaar in fog of war

### Formele groepen
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

## Britse AI
De Britse AI:
- verzamelt voedsel en hout
- bouwt Barracks, Houses, Stable en Artillery Foundry
- vormt infanterie- en cavaleriegroepen
- wijst automatisch twee musketiers toe aan kanonnen
- produceert ontbrekende kanonbemanning
- combineert infanterie, cavalerie en artilleriebatterijen in militaire orders
- kiest per slag een aggressive, balanced of defensive strategie

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

Het project gebruikt **Playwright 1.62.1 + Chromium** in GitHub Actions. GitHub Pages wordt alleen gedeployed wanneer alle browsertests slagen. Bij een fout worden Playwright-rapport, screenshots, traces en video's als artifact bewaard.

## Test lokaal

```bash
npm install
npx playwright install --with-deps chromium
npm run test:e2e
```

## Mogelijke volgende stap — v0.7

- zichtbare laad-, richt- en vuuranimatie voor de kanonbemanning
- bemanning die tijdens het laden fysiek van positie wisselt
- doelbewuste firing arcs en echte line-of-fire voor artillerie
- betere formatiecohesie tijdens lange marsen en scherpe bochten
- gebouwen kunnen aanvallen en uitgebreidere belegering
- meer economische ketens en grondstoffen
- historische facties en unieke regimenten
- save/load en scenarioselectie
