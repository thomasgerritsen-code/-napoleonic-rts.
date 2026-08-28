# Napoleonic RTS — v0.6.7

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.7 — rivier, bruggen en doorwaadbare plaats

Het wegenstelsel uit v0.6.6 wordt nu doorsneden door de **Ruisseau de la Campagne**, een meanderende waterloop die van noord naar zuid over het slagveld loopt. De rivier is een echte navigatiebarrière: troepen kunnen niet meer willekeurig dwars door diep water lopen en moeten een geschikte oversteek zoeken.

### Vier strategische oversteekpunten

De kaart bevat nu:

**3 bruggen**
- **Pont de la Chaussée** — stenen brug op de Grande Chaussée
- **Pont de la Crête** — houten brug bij de heuvel-/kamroutes
- **Pont des Fermes** — houten brug bij de zuidelijke boerderijwegen

**1 voorde**
- **Gué de la Colline** — brede doorwaadbare plaats waar eenheden wel kunnen oversteken, maar duidelijk langzamer dan over een brug

Hierdoor zijn bruggen en voorden echte tactische knooppunten. Een leger dat de belangrijkste brug beheerst kan beweging tussen beide oevers sterk beïnvloeden.

### Water is een echte terreinbarrière

De rivier is gekoppeld aan dezelfde navigatielogica die formaties en losse eenheden gebruiken:
- het terrein-A* beschouwt diep water als onbegaanbaar
- wegsegmenten die illegaal door de rivier zouden snijden worden uit het wegennet-graafmodel geweerd
- groepsankers mogen bij scherpe bochten niet door een rivierbocht heen snijden
- losse eenheden en arbeiders zoeken bij een oeverwissel een legale brug of voorde
- een klik midden in diep water wordt naar een bruikbaar oversteekpunt verplaatst

De game tekent de rivier dus niet alleen: de waterloop verandert daadwerkelijk welke routes mogelijk zijn.

### Brug of voorde is een echte keuze

Oversteken kost snelheid. Bruggen zijn relatief efficiënt; de voorde veroorzaakt een veel grotere vertraging.

Indicatieve maximumsnelheid tijdens de passage:

| Passage | Infanterie | Cavalerie | Artillerie |
| --- | ---: | ---: | ---: |
| Brug | 38 | 52 | 18 |
| Voorde | 28 | 36 | 12 |

Daarnaast telt de routeplanner een extra passagevertraging mee. Voor artillerie is een voorde bewust het zwaarst. Daardoor kan een iets langere route naar een brug sneller zijn dan de kortere route door de voorde.

### Gecombineerd met het wegennet

Lange marsorders combineren nu twee strategische systemen:
1. veldverplaatsing naar een geschikte route
2. chaussées, lokale wegen en karrensporen uit v0.6.6
3. een legale rivieroversteek
4. eventueel een andere wegklasse aan de overzijde
5. ontplooiing in Linie, Colonne of Carré bij het einddoel

Een bataljon dat van west naar oost over de Grande Chaussée wordt gestuurd kiest bijvoorbeeld de **Pont de la Chaussée** en blijft tijdens de hele route buiten diep water.

### Rivier op de minimap

Verkende delen van de rivier worden op de minimap weergegeven. Bruggen en de voorde krijgen kleine markeringen, zodat belangrijke passages ook tijdens het manoeuvreren op grotere schaal herkenbaar blijven.

## Tests voor v0.6.7

De releasegate draait nu **18 effectieve Chromium-tests**. Daarin blijven de bestaande economie-, formatie-, artillerie-, AI-, wegen-, 520-unit stress- en 10-minuten soak-regressies actief. Daarbovenop controleert v0.6.7 specifiek dat:
- de release exact als v0.6.7 laadt zonder JavaScript-fouten
- de rivier precies drie bruggen en één voorde bevat
- diep water als geblokkeerd terrein wordt herkend
- brug- en voordegebieden wel passeerbaar zijn
- een brug sneller is dan de voorde
- een bataljon dat de rivier moet kruisen een legale passage in zijn route heeft
- de route-audit nul illegale watersegmenten vindt
- het bewegende groepsanker nooit in diep water terechtkomt
- het bataljon de Pont de la Chaussée daadwerkelijk passeert en aan de andere oever aankomt
- F3-snapshots en bugrapporten v0.6.7 rapporteren

De gameplaybuild behaalde **18/18 geslaagde Chromium-tests** en werd succesvol naar GitHub Pages gedeployed voordat deze definitieve releasebeschrijving werd toegevoegd. Deze README-commit gaat opnieuw door dezelfde gate voordat hij als definitieve v0.6.7-release geldt.

## v0.6.6 — Napoleontisch wegenstelsel

De oude enkele rechte weg werd vervangen door een netwerk met **13 wegen in drie klassen**:
- 4 hoofdwegen / chaussées
- 5 lokale wegen
- 4 karrensporen

Zes gehuchten/kruispunten vormen natuurlijke knooppunten, waaronder **Les Quatre Chemins**. Lange orders gebruiken een apart wegennet-graafmodel om de snelste combinatie van wegen te kiezen; korte tactische orders blijven rechtstreeks door het veld gaan.

Wegkwaliteit beïnvloedt de snelheid:

| Terrein | Infanterie | Cavalerie | Artillerie |
| --- | ---: | ---: | ---: |
| Open veld | 36 | 64 | 22 |
| Karrenspoor | 42 | 70 | 22 |
| Lokale weg | 49 | 80 | 26 |
| Chaussée | 56 | 90 | 30 |

Een spatial index voor wegsegmenten voorkomt dat honderden eenheden continu het complete netwerk hoeven te doorzoeken.

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
- bruggen zijn veel geschikter voor kanonnen dan de voorde

### Boeren
Een boer onthoudt zijn grondstoftype en zoekt automatisch een volgende boom of voedselbron wanneer de huidige bron leeg is. Bij een noodzakelijke oeverwissel gebruikt ook een losse arbeider een legale oversteek.

### Terrein en fog of war
- wegen versnellen en activeren bataljonsmarcheren
- rivierwater blokkeert gewone passage
- bruggen en voorden maken gecontroleerde rivieroversteek mogelijk
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

Na verdere handmatige feedback kan v0.7 zich richten op firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, verkeersdrukte en bottlenecks bij bruggen/kruispunten, mogelijke vernietigbare bruggen, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
