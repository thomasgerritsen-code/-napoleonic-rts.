# Napoleonic RTS — v0.6.6

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.6 — Napoleontisch wegenstelsel

De oude enkele rechte weg is vervangen door een compleet, historisch geïnspireerd wegennet. De kaart is opgebouwd rond het type netwerk dat voor Napoleontische legers strategisch belangrijk was: een beperkt aantal belangrijke chaussées tussen plaatsen, aangevuld met smallere lokale wegen en eenvoudige karrensporen. Grote kruispunten en gehuchten vormen natuurlijke knooppunten.

### 13 wegen in drie klassen

**4 hoofdwegen / chaussées**
- Grande Chaussée
- Route du Nord
- Route du Sud-Ouest
- Route du Nord-Est

**5 lokale wegen**
- Chemin de la Crête Ouest
- Chemin de la Crête Est
- Chemin du Bois
- Chemin des Fermes Est
- Chemin des Fermes Sud

**4 karrensporen**
- Voie du Moulin
- Voie de la Ferme
- Voie du Verger
- Voie de la Lisière

Op de kaart zijn daarnaast zes kleine gehuchten/kruispunten gemarkeerd, waaronder **Les Quatre Chemins** als centraal strategisch knooppunt.

### Wegkwaliteit heeft invloed op snelheid

De verschillende wegklassen zijn niet alleen visueel anders; ze hebben verschillende marskwaliteiten.

| Terrein | Infanterie | Cavalerie | Artillerie |
| --- | ---: | ---: | ---: |
| Open veld | 36 | 64 | 22 |
| Karrenspoor | 42 | 70 | 22 |
| Lokale weg | 49 | 80 | 26 |
| Chaussée | 56 | 90 | 30 |

Een chaussée is dus de beste route voor een lange strategische verplaatsing. Een karrenspoor kan nuttig zijn, maar levert veel minder voordeel op.

### Echte kruispuntroutering

Lange bataljonsorders gebruiken nu naast de gewone terrein-A* een apart **wegennet-graafmodel**. De planner kent de echte knooppunten van het netwerk en berekent de snelste combinatie van wegen op basis van:
- afstand naar de weg
- type weg
- werkelijke marsnelheid van het geselecteerde groepstype
- lengte van de omweg
- geschatte totale reistijd

Een bataljon kan daardoor bijvoorbeeld:
1. in veldformatie naar een lokale weg lopen
2. via een kruispunt een chaussée nemen
3. versneld over de hoofdweg marcheren
4. bij een volgend kruispunt afslaan
5. de weg verlaten en in veldformatie naar zijn eindpositie gaan
6. daar ontplooien in de gekozen Linie, Colonne of Carré

Korte tactische verplaatsingen blijven rechtstreeks door het veld gaan. De planner stuurt een bataljon dus niet onnodig naar een weg als dat geen voordeel oplevert.

### Marsregels blijven intact

- **Op een weg:** het bataljon gebruikt marscolonne/marsstatus.
- **Buiten een weg:** het bataljon beweegt in de gekozen veldformatie en marcheert niet formeel.
- Rechts vasthouden + slepen blijft de uiteindelijke front-richting bepalen.
- Overgangen tussen wegmars en veldformatie blijven gesmoothd.

### Wegennet op de minimap

Verkende delen van het wegennet worden ook op de minimap getekend. Hoofdwegen zijn duidelijker zichtbaar dan lokale wegen en tracks, zodat kruispunten en strategische marsassen ook op grotere schaal leesbaar zijn.

### Performance

Omdat wegdetectie bij honderden soldaten zeer vaak wordt aangeroepen, gebruikt v0.6.6 een **spatial index voor wegsegmenten**. Een unit controleert daardoor alleen wegsegmenten in zijn directe kaartcel in plaats van steeds alle wegen te doorzoeken.

## Tests voor v0.6.6

De regressiesuite bevat **17 Chromium-tests**. Naast alle bestaande gameplaycontroles wordt nu onder andere getest dat:
- het netwerk exact 4 chaussées, 5 lokale wegen en 4 tracks bevat
- meerdere wegen samenkomen bij het centrale kruispunt
- chaussée > lokale weg > track > veld geldt voor infanteriesnelheid
- een bataljon vloeiend en versneld over de Grande Chaussée marcheert
- een lange verplaatsing het wegennet kiest wanneer dat sneller is
- een korte veldorder geen onnodige omweg maakt
- een lange route meerdere wegverbindingen kan combineren
- rechtsklik-vasthouden + slepen op open terrein nog steeds bestemming en front bepaalt
- 520 units structureel geldig blijven
- een versnelde simulatie van 10 speelminuten geen corrupte state, ghost groups of vastgelopen productie veroorzaakt

De gameplaycommit van v0.6.6 behaalde **17/17 geslaagde Chromium-tests** voordat deze releasebeschrijving werd toegevoegd. De uiteindelijke releasecommit moet dezelfde gate opnieuw passeren voordat GitHub Pages hem publiceert.

## Eerdere verbeteringen

### v0.6.5 — wegen bewust opzoeken
Lange orders vergelijken veldtijd met wegmars-tijd. Wegen worden alleen gekozen wanneer de hogere snelheid de omweg voldoende terugverdient.

### v0.6.4 — wegmars versus veldformatie
Alleen op wegen wordt formeel gemarcheerd. Buiten de weg blijft het bataljon geordend in Linie, Colonne of Carré. Groepssnelheid, draaiing en aankomst zijn gesmoothd om schokkerig bewegen te verminderen.

### v0.6.3 — blijvende Britse versterkingen
De Britse AI kijkt naar daadwerkelijke levende gevechtssterkte en blijft na verliezen infanterie, cavalerie en artillerie aanvullen en nieuwe aanvalsgolven opbouwen.

## Testlab en performance

Druk tijdens het spelen op **F3** voor het test/debugpaneel. Het toont onder andere FPS, frametime, update- en rendertijd, aantallen units en groepen, collision-correcties, combat-targetingbelasting, vastgelopen routes en Britse AI-status.

De knop **Kopieer bugrapport** maakt een JSON-rapport met gameversie, speeltijd, selectie, economie, AI, units, gebouwen, groepen, performance en auditresultaten.

Combat-targeting gebruikt een spatial hash. De renderer-onafhankelijke `window.RTS_SIM`-interface biedt `snapshot()`, `dispatch(command)`, `step(seconds)`, `audit()` en `getMetrics()` als voorbereiding op verdere schaalvergroting en een latere 3D-renderer.

## Bestaande gameplay

### Rallypoints en productie
- Town Center, Barracks, Stable en Artillery Foundry hebben een verzamelpunt
- geproduceerde eenheden verschijnen verspreid rond het rallypoint
- geselecteerde productiegebouwen tonen hun wachtrij en voortgang

### Regimenten breken
- infanterie onder 32% groepsmoraal
- cavalerie onder 28% groepsmoraal
- formele gevechtsgroepen breken ook wanneer maximaal één derde van de oorspronkelijke sterkte overblijft

### Artillerie
- 1 kanon vereist 2 toegewezen musketiers
- kanon + bemanning bewegen visueel als één samengestelde eenheid
- zonder twee levende bemanningsleden kan het kanon niet bewegen of vuren

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

Na verdere handmatige feedback kan v0.7 zich richten op firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, verkeersdrukte en passage bij smalle kruispunten, bruggen/doorwaadbare plaatsen, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
