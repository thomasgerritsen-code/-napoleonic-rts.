# Napoleonic RTS — v0.6.8

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.8 — verkeersdrukte bij bruggen

De rivierovergangen uit v0.6.7 zijn nu echte tactische bottlenecks. Regimenten kunnen niet langer onbeperkt tegelijk over hetzelfde smalle brugdek bewegen.

### Bruggen hebben capaciteit

- **Pont de la Chaussée:** maximaal 1 bataljon tegelijk
- **Pont de la Crête:** maximaal 1 bataljon tegelijk
- **Pont des Fermes:** maximaal 1 bataljon tegelijk
- **Gué de la Colline:** maximaal 2 bataljons tegelijk, omdat de voorde breder is

Een regiment reserveert een passage pas wanneer het de oversteek nadert. Andere regimenten die dezelfde passage willen gebruiken komen in een wachtrij.

### Automatisch versmallen naar marscolonne

Bij nadering van een oversteek schakelt een infanterie- of cavalerieregiment tijdelijk naar een smalle marscolonne. De gekozen eindformatie wordt niet verloren: Linie, Colonne of Carré blijft de gewenste veldformatie en wordt na de passage weer door het normale formatiesysteem gebruikt.

### Wachtrijen op de oever

Wachtende bataljons krijgen een eigen stoppositie vóór de brug. Elke volgende groep staat verder terug, zodat formaties niet op exact hetzelfde punt stapelen. Zodra de passage vrij is schuift de eerste groep uit de wachtrij door.

De brug wordt pas vrijgegeven wanneer ook de achterste soldaten van het passerende bataljon van het brugdek af zijn. Hierdoor kan een volgend regiment niet door de staart van zijn voorganger heen bewegen.

### Verkeersstatus zichtbaar op de kaart

Bij een gebruikte oversteek verschijnt een compacte status, bijvoorbeeld:

`1/1 bezet · wacht 2`

Daarmee is direct zichtbaar of een brug vrij, bezet of geblokkeerd door meerdere wachtende regimenten.

### Tactisch effect

Bruggen zijn nu echte choke points. Een lange colonne kan zich voor een brug ophopen, een tegenstander kan een passage blokkeren en de bredere voorde kan aantrekkelijk worden wanneer een hoofdbrug overbelast is. De bestaande route-, rivier- en snelheidsregels uit v0.6.6 en v0.6.7 blijven actief.

## Tests voor v0.6.8

De releasegate bevat **20 Chromium-tests**. Naast economie, formaties, artillerie, AI, wegen, rivierroutering, de 520-unit stresstest en de versnelde 10-minuten soak-test wordt nu specifiek gecontroleerd dat:
- v0.6.8 zonder JavaScript-fouten laadt
- bruggen capaciteit 1 hebben
- de voorde capaciteit 2 heeft
- twee bataljons voor dezelfde brug werkelijk een wachtrij vormen
- regimenten bij de brug tijdelijk in brug-/marscolonne gaan
- nooit twee bataljons tegelijk hetzelfde smalle brugdek bezetten
- beide bataljons uiteindelijk de overzijde bereiken
- beide bataljons na de passage weer in hun gekozen Linie eindigen
- F3-snapshots en bugrapporten v0.6.8 rapporteren

GitHub Pages wordt alleen gepubliceerd wanneer de volledige Chromium-gate slaagt.

## v0.6.7 — rivier, bruggen en voorde

De **Ruisseau de la Campagne** doorsnijdt het slagveld als echte navigatiebarrière. De kaart bevat drie bruggen en één voorde:
- Pont de la Chaussée
- Pont de la Crête
- Pont des Fermes
- Gué de la Colline

Diep water is onbegaanbaar. Terrein-A*, het wegennet, groepsankers en losse eenheden gebruiken dezelfde legale oversteekregels. Bruggen zijn sneller dan de voorde; artillerie wordt in de voorde het sterkst vertraagd.

Indicatieve maximumsnelheid tijdens de passage:

| Passage | Infanterie | Cavalerie | Artillerie |
| --- | ---: | ---: | ---: |
| Brug | 38 | 52 | 18 |
| Voorde | 28 | 36 | 12 |

De rivier en oversteekpunten zijn ook zichtbaar op de minimap.

## v0.6.6 — Napoleontisch wegenstelsel

Het slagveld bevat **13 wegen in drie klassen**:
- 4 hoofdwegen / chaussées
- 5 lokale wegen
- 4 karrensporen

Zes gehuchten/kruispunten vormen natuurlijke knooppunten, waaronder **Les Quatre Chemins**. Lange orders gebruiken een wegennet-graafmodel om de snelste combinatie van wegen te kiezen; korte tactische orders blijven rechtstreeks door het veld gaan.

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
- bruggen kunnen wachtrijen en verkeersdrukte veroorzaken
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

Na verdere handmatige feedback kan v0.7 zich richten op firing arcs/line-of-fire, laad- en vuuranimaties voor artillerie, passageprioriteit voor artillerie, vernietigbare bruggen, belegering, uitgebreidere economische ketens en verdere loskoppeling van de 2D-renderer.
