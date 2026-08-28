# Napoleonic RTS — v0.6.9

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Nieuw in v0.6.9 — vloeiender bewegen, gevechtscohesie en realistischere dorpen

Deze release richt zich op de zichtbare beweging van complete bataljons. Vooral wegmars, het geven van een nieuwe marsorder, vijandcontact en close combat zijn aangepast zodat de soldaten minder als losse individuen tegen elkaar in bewegen.

### Geen achterwaartse sprong meer bij een nieuwe wegorder

Wanneer een bataljon al op een weg staat en verderop op **dezelfde weg** een nieuw doel krijgt, wordt de route nu direct langs de weg in de juiste richting opgebouwd. Een eerder mogelijk eerste waypoint achter de formatie wordt verwijderd.

Daardoor schuift het bataljon niet meer eerst een stuk achteruit voordat het naar het nieuwe doel loopt. De huidige groepssnelheid wordt bovendien behouden wanneer een bestaande mars wordt aangepast, zodat een nieuwe order minder als een complete herstart voelt.

### Wegmars zonder voortdurend bibberen

Tijdens een formele bataljonsmars wordt de loopsnelheid nu gebaseerd op het terrein onder het **groepsanker** en de wegklasse, in plaats van afzonderlijk per soldaat. Soldaten die gedeeltelijk naast de weg lopen krijgen daardoor niet meer een andere snelheid dan hun buurman.

Daarnaast worden collision-correcties tussen leden van hetzelfde marcherende bataljon sterk onderdrukt. De formatieposities regelen de onderlinge afstand al; de oude combinatie van slotcorrectie plus collision-push trok soldaten afwisselend naar hun positie en er weer vanaf. Dat was een belangrijke oorzaak van het zichtbare links-rechts bibberen.

### Bataljon reageert als groep op vijandcontact

Wanneer een bewegend infanteriebataljon contact krijgt met de tegenstander, wordt de overgang nu op groepsniveau afgehandeld:
- bij vuurcontact komt het groepsanker tot stilstand en vormt het bataljon zich voor het gevecht
- bij een bajonetaanval vertraagt het bataljon progressief wanneer het de tegenstander nadert
- vlak vóór diepe overlap stopt de groepsbeweging en blijft de close-combatformatie actief
- collision-correcties tussen vijandelijke formaties worden tijdens dit contact zachter toegepast

Hierdoor hoeven individuele soldaten niet meer tegelijk te stoppen, in te halen, botsen en opnieuw naar hun formatiepositie te corrigeren.

### Drummer blijft achter de infanterie

De drummer stond in de oude marscolonne technisch vóór de musketiers. Dat is gecorrigeerd:
- in marscolonne staat de drummer achter de laatste infanterierij
- in Linie/Colonne blijft hij achter de gevechtslinie
- in Carré blijft hij binnen de formatie
- een drummer in een formeel infanteriebataljon is nu een **support-eenheid** en zoekt niet meer zelfstandig close combat op

Morale- en routingregels blijven actief, maar de drummer stormt niet meer door de musketiers heen om een melee-aanval uit te voeren.

### Realistischere kruispunten en dorpen

De oude dorpsmarkeringen op of vrijwel midden in de weg zijn vervangen door echte kleine nederzettingen:
- elk dorp bestaat uit meerdere afzonderlijke huizen langs beide kanten van een weg
- huizen worden pas geplaatst wanneer ook hun volledige voetafdruk buiten **alle** kruisende wegprofielen ligt
- kruispunten krijgen een bredere versleten aansluiting en sporen, zodat wegen visueel natuurlijker in elkaar overlopen
- dorpsnamen worden niet meer op het speelveld getekend

De plaatsen blijven onderdeel van de kaartstructuur en het wegennet, maar het slagveld oogt minder als een schematische kaart met labels.

## Tests voor v0.6.9

De gameplaybuild behaalde **24/24 geslaagde Chromium-tests**. Naast alle bestaande economie-, formatie-, artillerie-, AI-, rivier-, brugverkeer-, 520-unit stress- en 10-minuten soak-regressies controleert v0.6.9 specifiek dat:
- huizen naast de wegen staan en niet door een ander kruisend wegsegment worden geraakt
- alle zes nederzettingen uit meerdere huizen bestaan
- dorpsnamen niet meer op de kaart worden weergegeven
- een nieuw doel verderop op dezelfde weg geen eerste waypoint achter het bataljon oplevert
- het groepsanker bij zo'n nieuwe order niet eerst achteruit beweegt
- de drummer in zowel marscolonne als veldlinie achter de infanterie blijft
- de drummer als support-eenheid actief blijft
- vijandcontact het complete bataljon naar een coherente combat-formatie schakelt
- de bestaande brugwachtrijen, waterroutering, AI, stress- en soaktests geldig blijven

De gecorrigeerde gameplaycommit `7811953999c727768e68cefc5f44fd1a4cb1bb94` behaalde 24/24 tests en werd succesvol naar GitHub Pages gedeployed voordat deze definitieve releasebeschrijving werd toegevoegd. Deze README-commit gaat opnieuw door dezelfde releasegate.

## v0.6.8 — verkeersdrukte bij bruggen

De rivierovergangen uit v0.6.7 zijn echte tactische bottlenecks. Bruggen laten maximaal één bataljon tegelijk toe; de bredere Gué de la Colline maximaal twee. Regimenten versmallen tijdelijk naar marscolonne, wachten op afzonderlijke posities op de oever en ontvouwen na de passage weer naar hun gekozen veldformatie.

De brug wordt pas vrijgegeven wanneer ook de achterste soldaten van het passerende bataljon van het brugdek af zijn. De kaart toont bij gebruikte passages een compacte bezettings- en wachtrijstatus.

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

Zes nederzettings-/kruispuntlocaties vormen natuurlijke knooppunten. Lange orders gebruiken een wegennet-graafmodel om de snelste combinatie van wegen te kiezen; korte tactische orders blijven rechtstreeks door het veld gaan.

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
