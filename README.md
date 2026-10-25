# Napoleonic RTS — v1.4.6

Een browser-RTS geïnspireerd door klassieke Napoleontische strategiespellen. De game draait in HTML5 Canvas + JavaScript en wordt vóór iedere GitHub Pages-release automatisch getest in Chromium.

## v1.4.6 — eerste online multiplayer

Twee spelers kunnen via een WebSocket-spelserver een kamer maken en deelnemen:
Frankrijk tegen Groot-Brittannië. De server berekent de strijd; clients tonen
zichtgefilterde updates met vloeiende beweging. Opdrachten, economie en productie
worden op de server verwerkt. Bij uitval pauzeert de strijd, met 90 seconden om
opnieuw te verbinden. Singleplayer blijft beschikbaar zonder serververbinding.

Start lokaal met `npm ci`, `npx playwright install --with-deps chromium` en
`npm run start:server`. Open daarna `http://localhost:8080/?view=iso` en kies
**Online → Spel hosten**. De uitnodigingslink is voor een tweede speler.
Voor internetspel moet deze server publiek op HTTPS/WSS draaien. Een lokaal
localhost-adres werkt alleen op dezelfde computer. Hosting, grenzen en de
stapsgewijze servermigratie staan in [de multiplayerhandleiding](docs/online-multiplayer.md).
`Dockerfile` en `railway.json` staan klaar voor één blijvende serverinstantie;
er wordt geen openbare server of hostingaccount aangemaakt door deze bestanden.

## v1.4.5 — vier seizoenen

Lente, zomer, herfst en winter volgen elkaar op: vier minuten per seizoen,
zestien minuten voor een volledig jaar. De laatste 45 seconden gaan geleidelijk
over naar het volgende seizoen. De klok toont nu ook het seizoen.

De zomer krijgt warmere grond, de herfst koperkleurig loof en de winter sneeuw
op grond en bomen. Winterse buien vallen als sneeuw; schoen- en hoefsporen zijn
ook op droge sneeuw zichtbaar. Na de winter keert het groene landschap terug.

Boomafbeeldingen worden gedeeld en hergebruikt, met maximaal 12 MiB extra cache
en hoogstens één nieuwe kleurvariant per frame. De bestaande dag/nachtcyclus,
regen, besturing en spelregels blijven behouden.

## v1.4.4 — dag- en nachtcyclus

Een volledige dag duurt tien minuten speeltijd. De slag begint om 08:00;
rond 3:45 speeltijd wordt het avond, rond 5:00 is het nacht en rond 8:45 komt
de zon weer op. Het licht verloopt geleidelijk van daglicht naar warme
schemering en blauw maanlicht. Een compacte klok toont de fase en het tijdstip.

De kleurlaag gebruikt maximaal één tekenactie per frame en geen extra
beeldbuffers. Bediening, regen, mist en sporen blijven werken; een nieuwe slag
zet de klok terug op 08:00.

## v1.4.3 — regenbuien en zichtbare voet- en hoefsporen

De eerste natuurlijke bui begint rond 1:45 speeltijd, voorafgegaan door bewolking.
Buien duren ongeveer 65–100 seconden, met droge tussenpozen van 150–240 seconden.
Op natte grond laten lopende soldaten afwisselende schoenafdrukken achter;
cavalerie en officieren te paard laten hoefsporen achter. De afdrukken blijven
na de bui even zichtbaar en vervagen wanneer de grond opdroogt.

De sporen worden als kleine vectorvormen samen getekend, met maximaal 2600
bewaarde afdrukgroepen. Stilstaande en ongeziene eenheden maken geen nieuwe
sporen; brugdekken worden overgeslagen. Een nieuwe slag wist de oude sporen.

## v1.4.2 — minder tekenwerk met hetzelfde beeld

Onveranderde mistvormen worden hergebruikt en de schermprojectie leest de
schermmaten eenmaal per frame. Dit vermindert herhaalde tekenberekeningen
zonder extra terrein- of spritebuffers toe te voegen.
Bewegende eenheden, weer, zachte mistranden en wolken blijven actief; resolutie,
sprites, effecten en verversingsfrequenties blijven gelijk aan v1.4.1.

## v1.4.1 — mobiel herstel

Telefoons gebruiken weer de gecachte Canvas2D-route, een pixelverhouding van
maximaal 1,5 en geen automatische HD-spritevergroting tijdens het spelen.
Hierdoor vervallen de extra GPU-kopieën en het decoderen van zware HD-atlassen.
De desktop-GPU-route en de multiplayerbasis blijven beschikbaar.

## v1.4.0 — isometrische GPU-weergave en multiplayerfundament

De speelbare isometrische kaart heeft nu WebGL2-batches voor terrein en sprites,
met een begrensd texturegeheugen en Canvas2D als terugval. De gewone bediening
gebruikt een gedeeld opdrachtprotocol; een transportonafhankelijke autoriteitsmodule
voor een toekomstige spelserver controleert eigendom, volgorde en wachtrijen.
Online wedstrijden, lobby's en de serveradapter moeten nog worden aangesloten.
Daarnaast zijn riviercontroles na langere speelsessies goedkoper en krijgen
infanterie en cavalerie ieder het passende type officier.

Zie [GPU en multiplayer](docs/gpu-and-multiplayer.md) voor werking en grenzen.

## ▶ Speel nu

GitHub Pages:

https://thomasgerritsen-code.github.io/-napoleonic-rts./

## v1.3.59 — musket- en kanonskogels in bestaande GPU-rookbatch (update 311)

De kleine, zichtbare 2D-projectielen van musketten en kanonnen worden op geschikte desktopbrowsers nu als echte posities uit de bestaande projectielsimulatie getekend in **dezelfde instanced WebGL2-batch als het kruitrook**. Er wordt nadrukkelijk géén nieuwe canvas- of WebGL-context toegevoegd. De stippen worden over de rook heen gerenderd, met dezelfde kleuren en grootte als de voorgaande Canvas-weergave. De rendercode leest uitsluitend de projectielen; geen wijziging aan snelheid, baan, botsingen, trefkansen, schade of AI.

Wanneer de GPU-rooklaag ontbreekt, is uitgeschakeld met `?gpuSmoke=off` / `?gpu=off`, of op mobiel wordt gespeeld, gebruikt de game nog steeds de originele 2D-projectielrenderer. De projectielen worden bij GPU-activering **niet dubbel getekend**. De bestaande kruitrook heeft zijn eigen telling behouden, met aanvullende `projectileDraws`, `lastProjectiles` en `projectileFrames` in `window.__GPU_SMOKE_V309__.metrics()`.

Deze kleine renderwijziging verandert niets aan de nog apart te beoordelen zoomverbetering uit v310.

## v1.3.58 — vloeiender zoomen op desktop en telefoon (update 310)

Tijdens het in- en uitzoomen werden op desktop bij elke 0,025 zoomverschil tientallen grote terreintegels opnieuw gerasterd en bestaande GPU-texturen weggegooid. De cache heeft nu vier grovere, herbruikbare rasterdetailniveaus (met kleinere 640px tegels) zodat de camerazoom binnen een niveau door de GPU wordt geschaald. Zoomwisselingen **maken de volledige cache niet langer leeg**, zolang schermresolutie en DPR gelijk blijven.

Op de telefoon gebruikt de bestaande statische Canvas2D-terreinlaag tussen twee volledige landschapsopnames een zeer korte CSS-transformatie om de camerabeweging/knijpzoom visueel te volgen. De kaart wordt uiterlijk na 95 ms of bij zichtbare kaartranden opnieuw getekend; eenheden, bediening, simulatie, selectie, botsingen en marsorders behouden hun oorspronkelijke actuele posities. Geen extra WebGL-functie of 3D. Muisscroll en trackpad geven nu pixelnauwkeurige kleinere zoomstappen, met behoud van het wereldpunt onder de cursor. Een regressietest controleert hergebruik bij meerdere zoomstappen, mobiele voorlopige weergave en een fallback naar een volledig nieuw terreinbeeld.

## v1.3.57 — kruitrook op een eigen transparante GPU-laag (update 309)

De bestaande 2D-kruitrookwolken van musketten, salvo's en kanonnen worden op desktop door één **WebGL2-instanced batch** getekend op een transparant canvas **boven** de soldaten en onder de DOM-bediening. Hierdoor blijft de rook voor de soldaten zichtbaar in plaats van achter het landschap te verdwijnen. De opbouw, levendige pluimen, mondingsstraal, ontwikkelende kleuren, roosterlimiet van 80 wolken en autonome **winddrift** gebruiken dezelfde simulatievrije gebeurtenisgegevens en seeds als de bestaande Canvas2D-rook.

Er wordt geen rookfysica, wapenballistiek, schade, schotlimiet, wegvinding of gamestate verplaatst of aangepast. Schotflitsen, gevallen soldaten, impact-effecten en het uiterlijk op mobiel blijven via de oorspronkelijke 2D-canvasrenderer. Bij ontbrekende WebGL2, contextverlies of `?gpuSmoke=off` (of `?gpu=off`) neemt Canvas2D de rook automatisch over.

## v1.3.56 — GPU-rivierstroming met behoud van bochten en brugkolken (update 308)

De eerder bestaande 2D-v299-stromingsberekeningen sturen nu op desktop een **instanced WebGL2-rimpelbatch** aan. Het gaat om dezelfde 7 stroombanen, bocht-afhankelijke snelheid, vertraging langs de oevers en vloeiend bewegende wereldcoördinaten. De statische waterlagen, glooiende oevers, brugposities en eigenlijke water-/wegcollision blijven volledig ongewijzigd.

De kleine kringen rondom brugpijlers blijven op de originele Canvas2D-overlay, zodat hun vorm en zachte alpha in stand blijven. Bij geen WebGL2, op mobiel of met `?gpuWater=off` gebruikt de game de oorspronkelijke Canvas2D-stroming. Belangrijk: de desktop-terreintegelcache tekent nu altijd de bewegende water-overlay ook wanneer die GPU-versnelling niet beschikbaar is. De engine blijft strikt 2D en de simulatie blijft op de CPU. De WebGL2-rimpelbatch is texture-vrij en deelt de GPU-context met terrein, objecten en soldaten.

## v1.3.55 — GPU-daken zonder verlies van bouwvoortgang (update 307)

De **bestaande** 2D-daken van speelbare gebouwen worden nu op desktop met WebGL2 één keer per uniek daktype, afmeting, kamp en bouwfase vastgelegd als GPU-textuur. Herhaalde gebouwen worden in één GPU-batch weergegeven; bij opnieuw tekenen worden de texturen hergebruikt. De originele planzicht-dakvormen, schoorstenen en dakpannen blijven exact dezelfde Canvas-tekenbron gebruiken.

**Selectierand, bouw-/productievoortgang en schadebalk** blijven live op het oorspronkelijke 2D-canvas boven op het GPU-dak en reageren direct op veranderingen in de simulatie. Dorpshuizen en hun tuinen worden niet aangepast. De AI, hitboxes, beweging, gebouwenplaatsing en andere regels veranderen niet. Mobiel en sterk ingezoomde beelden gebruiken Canvas2D. Als GPU-rendering ontbreekt, terugvalt of uitgeschakeld is (`?gpuBuildings=off`), tekent de oorspronkelijke gebouwenrenderer alles. De GPU-gebouwenmodule heeft eigen upload-/regebruik-/fallbackstatistieken.

## v1.3.54 — natuurlijke grondstoffen op de GPU (update 306)

Op desktop met WebGL2 worden de bestaande **2D-boomkruinen, bessenstruiken en met mos begroeide ijzerstenen** eerst door hun originele deterministische Canvas2D-renderer in een beperkte GPU-textuuratlas vastgelegd. Daarna zijn alle zichtbare, gewone natuurlijke grondstoffen per frame samen te tekenen in **één instanced GPU-opdracht**. Texturen worden bij herhaald tekenen hergebruikt, en passen zich aan bij het oogsten. De originele variatie, plaatsing en bekende rivier-/weg-uitsluitingen zijn behouden.

Mobiel, geselecteerde/nabije Canvas-elementen en de gegarandeerde bessenstruiken bij dorpen blijven in hun bestaande Canvas 2D-pad. Als de videokaart ontbreekt, de atlas volloopt of de camera sterk inzoomt, blijft de oorspronkelijke Canvas-resourceweergave beschikbaar. Met `?gpuProps=off` kun je de GPU-grondstoffen apart uitschakelen. **Gebouwen, rook en het stromende water zijn nog geen onderdeel van deze GPU-update.**

## v1.3.53 — herkenbare GPU-soldaten en echte marcheerbeweging (update 305)

De uitgezoomde **2D-soldaten** in de bestaande WebGL2-batch hebben duidelijkere Napoleontische uniformen, kruisbands, hoofddeksels, musketten en paard/ruiter-silhouetten. Ze blijven herkenbaar als Frans of Brits en als infanterist, officier, drummer, cavalerist of werker.

De GPU-tekenaar meet alleen de daadwerkelijke verplaatsing tussen frames. Een regiment dat bij een brug stilstaat, blijft visueel staan in plaats van op de plaats te marcheren. Er worden geen posities, orders, formaties of andere simulatieregels gewijzigd.

Alleen desktop met meer dan 360 levende eenheden en zoom onder 0,82 gebruikt dit GPU-pad. De gekozen eenheden en kanonnen blijven gedetailleerd op Canvas2D. Op mobiel, bij gebrek aan WebGL2 en bij `?gpuUnits=off` of `?gpu=off` geldt de bestaande Canvas2D-weergave. De teller `animatedSoldiers` en `motionSamples` zijn zichtbaar via `window.__GPU_UNITS_V304__.metrics()`. Soldaten worden nog steeds in één GPU-batch per frame getekend.

## v1.3.52 — GPU-batch voor soldaten op afstand (update 304)

De GPU-compositor tekent nu bij **meer dan 360 eenheden en zoom kleiner dan 0,82** de verre, niet-geselecteerde 2D-eenheden in één WebGL2-instanced batch. Franse en Britse infanterie, cavalerie, officieren, drummers en werkers hebben herkenbare vereenvoudigde silhouetten en behouden hun oriëntatie en actuele (geïnterpoleerde) positie. Kanonnen, geselecteerde soldaten en eenheden van dichtbij blijven bij de bestaande gedetailleerde Canvas2D-tekenlaag. Geen enkele opdracht, schade-, positie- of formatieregel verandert.

De GPU gebruikt dezelfde WebGL2-context als de terreintegels uit v303; er komt **geen tweede 3D-engine** bij. Zonder WebGL2, op mobiele apparaten of met `?gpu=off` of `?gpuUnits=off` blijft het bestaande Canvas2D-pad behouden. Meet de batch via `window.__GPU_UNITS_V304__.metrics()`. Deze gefaseerde stap versnelt alleen verafgetekende soldaten, niet alle nabije detailanimaties.

## v1.3.51 — GPU-textures voor de bestaande 2D-kaart (update 303)

De standaard desktopweergave gebruikt nu **WebGL2** voor het weergeven van de wereldvaste 2D-terreintegels als herbruikbare GPU-textures, mits de browser en videokaart dit ondersteunen. Geen externe renderbibliotheek en geen 3D-modus. De bestaande Canvas 2D-code bepaalt nog steeds het uiterlijk van iedere terreintegel en tekent de bewegende rivier, soldaten, rook en HUD. De CPU houdt de simulatie, formatie- en bruglogica volledig in beheer.

Bij ontbrekende WebGL2-ondersteuning of een verloren GPU-context schakelt het terreinbeeld terug naar Canvas 2D. De mobiele versie blijft in Canvas 2D. Handmatig vergelijken op desktop kan met `?gpu=off` in de URL. GPU-textures worden bij cacheverwijdering vrijgegeven en tellers voor uploads, draws en geheugengebruik zijn beschikbaar via `window.__GPU_TERRAIN_V303__.metrics()`. De GPU-versie is een **eerste technische stap**, niet een belofte dat de hele simulatie of alle eenheden al op de GPU draaien.

## v1.3.50 — alleen 2D, experimentele 3D-modus verwijderd (update 302)

De experimentele 3D-scène is definitief uit de speelbare game verwijderd: geen 3D-canvas, geen renderkeuzeknop, geen Three.js-import en geen 3D-modules in de browser of de repository. De bijbehorende uitsluitend 3D-gerichte tests zijn verwijderd. Alle tests voor 2D-water, oevers, bronnen, dorpen, touchbesturing, marsformaties en bruggen blijven bestaan. De desktop-tegelcache uit update 301 blijft actief; dit is **geen nieuwe GPU-renderer**. Eventuele GPU-versnelling voor de 2D-game krijgt een zelfstandige implementatie.

De onderstaande oudere release-notities zijn historische beschrijvingen; vermeldingen van de vroegere 3D-experimenten beschrijven geen huidige spelmodus.

## v1.3.47 — realistischere stroming in 2D (update 299)

De voormalige 78 gelijkmatig bewegende, rechte waterstreepjes zijn in de **2D-versie** vervangen door een gebogen stromingsveld. Subtiele waterglinsteringen volgen de werkelijke rivierlijn, bewegen in het midden sneller dan bij de oevers, versnellen of vertragen licht in bochten en verdwijnen vanzelf buiten beeld. Verschillende transparanties, gebogen golfsporen, rustige ondieptes en kleine bewegende draaikolken bij brugpijlers maken het beeld natuurlijker. De beweging is afgeleid van de spelklok en vooraf berekende reistijd per stroomstrook: geen willekeurige sprongen tussen frames of zware simulatie op de telefoon.

De nieuwe effecten lezen alleen de v296-riviercurve. **De 3D-weergave, vijf bruggen, navigatie, grondstoffen, dorpen en regimentbeweging zijn niet aangepast.** Automatische regresstests controleren stromingsverschil tussen hoofdgeul en oever, doorlopende stroomrichting en stabiele mobiele tekenbelasting.

## v1.3.46 — natuurlijkere 2D-rivieroevers, 3D blijft ongewijzigd (update 298)

Op verzoek zijn alle toekomstige rivierverbeteringen op de **2D-weergave** gericht. De bestaande stroming uit update 297 blijft behouden; in binnenbochten verschijnen nu subtiele zand- en slibafzettingen, buitenbochten krijgen een donkerdere erosierand en grasplukjes verbinden de rivier met het weiland. De details volgen de bestaande spline uit update 296 en worden alleen in het zichtbare gebied gerenderd. Direct bij de vijf bruggen worden oeveraccenten overgeslagen.

De 3D-weergave, alle 3D-bestanden, het waterbotsingsmodel, de navigatie, de vijf bruggen, de dorpen en de economische simulatie zijn **niet gewijzigd**. De nieuwe `tests/river-banks-2d-v298.spec.js` controleert de renderautoriteit, scherpe/geleidelijke bochtentypes, bewegende stroming, brugbescherming en behoud van de 3D-modules.

## v1.3.45 — stromend water en natuurlijke oevers in 2D en 3D (update 297)

De in update 296 gedeelde riviergeometrie krijgt **zichtbaar stromend water**. De 2D-tekenaar bouwt zes vloeiende water- en oeverlagen op: modderige grasranden, licht ondiep water en donkerder rivierdiepte. Subtiele, langs de riviertangent bewegende schuim- en rimpelstrepen en turbulentie nabij de vijf bruggen geven de rivier leven. De golfjes werken op spelklok en zijn begrensd tot het zichtbare cameragebied.

In de 3D-weergave krijgt de hele rivier een afzonderlijk waterlint met natuurlijke silt-oeverschouders, variabele gedempte waterkleuren en langzaam verschuivende watertextuur. Er is slechts één watermesh plus twee oevermeshes; er worden geen nieuwe geometrieën per frame gebouwd. De 3D- en 2D-lagen lezen de **dezelfde geometrie als de waternavigatie**, zodat geen extra visuele rivier buiten de bewegingsgrenzen kan ontstaan.

**Ongewijzigd**: alle vijf brugcentra, wegen, vier-breedse wegmars, soldatenpathfinding, huizen-, ijzer- en begroeiing-terreincontrole.

## v1.3.44 — natuurlijke meanders, één riviermodel (update 296)

De rivier is omgebouwd van rechte segmenten naar één vloeiende, op 20 spel-eenheden gesamplede C1-Hermitecurve. Alle oorspronkelijke knooppunten en vijf brugcentra blijven op hun plaats. De vorm wordt nu gedeeld door waterblokkade, grondstof- en huisplaatsing, minimap en 2D-waterlijn. Een lokale binaire zoekmethode vermijdt dure checks langs de hele rivier.

**Geen wijziging aan de vijf bruggen, wegen of de bestaande vier-breedse colonneformatie.** `tests/river-meanders-v296.spec.js` controleert vloeiende segmenten, alle brugcentra, droge dorpshuizen en doorlopende bevaarbare watergeometrie.

## v1.3.43 — woningen en dorpen op droge oevers (update 295)

Dorpshuizen worden bij het vastleggen van de kaartlocaties gecontroleerd tegen de volledige rivierstrook, inclusief brugdekken, natte oevers en de oppervlakte van het hele erf. Een botsend huis krijgt een andere veilige locatie; zonder geschikte locatie wordt het overgeslagen. Ook bouwbare huizen en andere gebouwen krijgen deze controle. De 2D- en 3D-scènes gebruiken dezelfde vaste posities en de mars- en brugsystemen blijven ongewijzigd.

De browsertest `tests/dry-village-footprints-v295.spec.js` controleert huislocaties en erven, bruglocaties, 3D-huizen en drie opeenvolgende resets.

## v1.3.42 — bomen en bessenstruiken buiten het water (update 294)

Alle **houtbomen** en **bessenstruiken** worden voortaan gegenereerd of verplaatst naar **droge grond met voldoende oevermarge**. Dit geldt ook voor de vijf gegarandeerde bessenstruiken bij elk startdorp, bij iedere nieuwe ronde én voor extra grondstoffen die later worden aangemaakt. De controle gebruikt de echte rivierbedding, dus ook de overgangen en brugdekken blijven vrij. Het plantenrijk vermijdt nog steeds wegen, huizen, dorpsbebouwing en andere grondstoffen. De bestaande ijzerertsregeling blijft intact.

De 2D-tekenaar verbergt eventueel toch fout aangeleverde bomen en struiken uit voorzorg bij de rivier. Ook decoratieve boskruinen en de groene dorps- en erfbeplanting blijven nu buiten het water. De 3D-bomen komen uit dezelfde veilige locaties. **Geen wijzigingen aan routes, bruggen, legereenheden of economie.**

Nieuwe browserregressies in `tests/vegetation-river-clearance-v294.spec.js` controleren alle levende bronnen na meerdere resets, minstens vijf droge bessenstruiken bij ieder dorp, kunstmatige spawnpogingen op oever/rivier/brug, de 2D- en 3D-locaties en de renderbeveiliging.

## v1.3.41 — natuurlijke ijzerstenen op droge oevers (update 293)

IJzererts komt **niet meer in de rivier of op bruggen** voor. De bestaande ecologische terreinkeuring verplaatst erts bij het genereren en na het herstarten naar een droge plek, met een veilige afstand van de rivieroevers. Ook wegen, gebouwen, dorpen en andere grondstoffen blijven vrij. De plaatsing blijft deterministisch en wijzigt de vier-breedse brug- en wegmars niet.

In 2D zijn de voormalige losse lichtgrijze rotsjes vervangen door **half ingegraven, onregelmatige ijzerhoudende stenen** met gedempte kleuren, mos, grassprieten en zachtere bodemschaduwen. In 3D verschijnen kleine, lage, verschillende rotsvormen op de werkelijke ertsposities; ze verdwijnen na uitputting. Beide weergaven blijven geschikt om erts met boeren te verzamelen.

Een extra browserregressie `tests/iron-natural-shores-v293.spec.js` controleert alle ertslocaties na meerdere resets, nieuwe ertspogingen in rivier en brugvakken, en de zichtbaarheid in 2D en 3D. Kosten en late-game vrijspelen van kanonnen zijn ongewijzigd.

## v1.3.40 — ijzerwinning en latere kanonnen (update 292)

**Derde grondstof: ijzer (⛏️).** Zowel de Franse als de Britse economie begint met **0 ijzer**. Op de speelkaart liggen herkenbare ijzerertsstukken die boeren via het bestaande verzamel-/afleversysteem kunnen winnen. Het Franse grondstoffenoverzicht en de Britse AI-economie tonen vanaf nu ook de ijzervoorraad. De Britse AI begint na circa 70 spel-seconden mijnwerkers in te zetten.

**Geen gratis kanonnen meer bij aanvang.** Beide legers starten zonder artillerie. Een **geschutsgieterij** kost nu **420 hout + 90 ijzer**. Daarna kan pas na **120 spel-seconden** een kanon worden geproduceerd voor **120 voedsel + 140 hout + 160 ijzer**, met een productietijd van 24 seconden. De Britse AI bouwt de gieterij pas nadat voldoende ijzer beschikbaar is en de vroege infanterierekrutering is begonnen. Zo blijft artillerie een investering voor later in het spel.

De bestaande kanonbemanning met twee musketiers, geschutballistiek, wegen en bruggen zijn behouden. Een bestaande artillerieregressie krijgt nu een expliciet testkanon in plaats van op het vroegere startkanon te vertrouwen. De nieuwe `tests/iron-artillery-v292.spec.js` toetst winbare ijzerertsafzettingen, echte afleveringen, grondstofkosten, het tijdslot en beide legers zonder startartillerie.

## v1.3.39 — AI-herinzet na hergroeperen (update 291)

Een Brits regiment dat na een gevechtsschok **TERUGVAL** of **HERGROEPT** is, behoudt zijn terugtochtbestemming: nieuwe automatische aanvals- en flankbevelen onderbreken het herstel niet. Een dringend defensief bevel en rechtstreekse spelerorders hebben altijd voorrang.

Wanneer het regiment weer **GEREED** is, zoekt het eerst een nabij eigen gezond regiment met levende officier. De mannen sluiten maximaal 16 seconden achter het front als reserve aan, in een colonne via de bestaande formatie- en routeplanner. Ontbreekt steun, een officier of een veilige reservepositie, dan blijft het regiment voorlopig op zijn herstelpositie. Daarna mag het weer normaal aanvallen. Dit verandert geen soldaatcoördinaten, wegen, bruggen, gevechtsballistiek of navigatie.

Nieuw geautomatiseerd scenariotestbestand `tests/ai-regroup-reserve-v291.spec.js` controleert gerichte AI-aanvalsbevelen, behouden herstelbevelen, uitstel zonder leider of reserve, respect voor brugverkeer en terugkeer naar het aanvalsfront.

## v1.3.38 — hergroeperen na terugtocht (update 290)

Na de gecontroleerde terugval van v289 krijgt een regiment nu een echte **hergroepeerfase**. Alleen als het groepscentrum de terugvalpositie heeft bereikt **én minimaal 75% van de mannen hun formatieplaats hebben ingenomen**, start het herstel. Een vijand binnen 235 spel-eenheden pauzeert het herstel; de officier is vereist en de drummer versnelt de moreelopbouw. Na minimaal vijf seconden veilig hergroeperen en voldoende moreel (62%) wordt het regiment weer **GEREED** voor normale bevelen.

Bij een nieuwe spelers- of AI-order wordt de hergroepering afgebroken en gaat de opdracht voor. De kaart, wegen, brugreserveringen en loopcode zijn niet gewijzigd. In de 2D-weergave staat tijdelijk TERUGVAL, HERGROEPT of GEREED boven het regiment. Gerichte browsertests simuleren aankomst, onafgemaakte achterhoede, vijandelijke druk en een nieuwe opdracht.

## v1.3.37 — gecontroleerde terugval bij laag moreel (update 289)

Een infanterieregiment dat onder vuur wankelt (moreel tussen 32 en 46) kan als **gehele gevechtslinie** een korte terugval van circa 180 spel-eenheden inzetten als zijn officier nog leeft. Het gebruikt dezelfde bestaande pad- en formatieplanner, met tijdelijke onderbreking van het vuurcontact. De terugval wordt niet telkens herhaald; na voldoende moreelherstel kan een volgende zware gevechtsschok weer een terugval uitlokken.

**Bescherming:** geen ingreep op bruggen, in riviercorridors of tijdens een lopende mars; geen rechtstreekse wijziging van soldatenposities. Gevaarlijke terugvalroutes over water worden afgewezen. De game blijft het bestaande systeem gebruiken om volledig gebroken regimenten uiteen te laten vallen.

## v1.3.36 — lokaal moreel bij verliezen (update 288)

Wanneer een soldaat sneuvelt, verliezen **nabije bondgenoten** tijdelijk extra moreel; soldaten verder dan 190 spel-eenheden en vijanden ondervinden geen extra effect. Een aanwezige officier en drummer houden een regiment merkbaar rustiger. Het verlies van een officier veroorzaakt juist een sterkere schok. Al vluchtende en gesneuvelde soldaten tellen niet opnieuw mee, en dubbelschade op een dode eenheid wordt niet opnieuw verwerkt. Onder druk kan het bestaande vluchtgedrag daardoor natuurlijker inzetten.

Deze aanpassing raakt uitsluitend de gevechts-/moraalautoriteit; marsformaties, paden, bruggen en campagnekaart zijn ongewijzigd. De nieuwe automatische browsertest simuleert echte dodelijke schade, leiderschap, plaatselijke paniek, vluchten en ongewijzigde orders. Zie `tests/casualty-morale-v288.spec.js`.

## v1.3.35 — impactbewuste CI (update 287)

Tijdens pull requests draait altijd de snelle headless-codecheck; de gerichte browser-, brug/bewegings-, 520-eenheden- en Golden Battle-gates draaien alleen wanneer de gewijzigde code daar aanleiding toe geeft. Bij onbekende of risicovolle wijzigingen draait uit voorzorg alles. **Elke push naar `main` en iedere handmatige releasecontrole voert ongewijzigd de vijf volledige veiligheidschecks uit voordat GitHub Pages mag publiceren.** De classifier wordt apart getest op versie-only, documenten, kaart, AI, performance en release-scenario's. Zie `docs/ci-impact-v287.md`.

## v1.3.34 — testopschoning (update 286)

De oude, slecht onderhoudbare v0.6.x-verzamelsuite (`tests/rts.spec.js`) is volledig verwijderd, nadat de huidige browserrun acht ongeldige/achterhaalde scenario-aannames bevestigde. De actuele gespecialiseerde tests voor productie, artillerie, wegen, colonnes, bruggen en Game Health blijven beschikbaar. De oude afzonderlijke 10-minuten-soakopdracht is vervallen. Zes losse subsystem-opstarttests zijn zonder verlies van hun assertions samengevoegd in de bestaande Chromium-rooktest. De verouderde v1.3.22-browsercheck voor het buildnummer is verwijderd: de actuele dynamische test voor publicatie-identiteit blijft als snelle headless test bestaan.

Belangrijk: de vijf kritische CI-gates voor snelle checks, gerichte Chromium-controles, bruggen/beweging, Game Health en Golden Battle blijven behouden. De volledige browser-releasecheck blijft optioneel voor releasebranches en handmatige runs. Zie `docs/test-audit-v286.md` voor de beslissingen.

## v1.3.33 — langeafstandsmars Britse AI (update 285)

Op de vergrote kaart (8000 × 5000) behoudt de Britse commandant de **opmars in colonne** tot een meerderheid van zijn levende regimenten op maximaal 760 spel-eenheden van het gekozen doel staat. Een timer van twaalf seconden is niet langer genoeg om over te schakelen naar de gevechtslinie. Daardoor houden regimentsorders voor lange marsen de bestaande wegroute, vier-brede colonne en brugpassage intact. Vlak voor contact ontplooit het leger alsnog, met achterblijvers als reserve. De bestaande tactische contact-, terugtocht- en brugveiligheidsregels blijven leidend.

## v1.0.0 — eerste volledige release

Versie 1.0 bundelt de complete geïntegreerde releasecandidate en markeert het punt waarop de kernsystemen gezamenlijk door de volledige release-regressie zijn gekomen.

Belangrijkste onderdelen van v1.0.0:
- stateful Britse AI met blijvende productie, reserves, aanvalsgolven, flankmanoeuvres en terugtrekken/hergroeperen
- stabiele bataljonsformaties met wegmars, veldformatie, drag-to-facing en vloeiendere road-to-field overgang
- artillerie als samengestelde kanon+bemanning-eenheid
- stamina, discipline, morale en command-systemen
- cavalry charge momentum, carré-counterplay en eindige artilleriemunitie
- fog of war, scouting, tactical terrain, cover en line of sight
- realistischere kaartweergave, vegetatiebeweging, karaktervisuals en gevechtsanimaties
- battlefield aftermath, wind, regen, mist en tijd-van-de-dag-atmosfeer
- capture objectives, victory points en meerdere skirmish-scenario's
- Architecture v2 subsystemen en uitgebreide headless/Chromium regressiedekking

De releasecandidate wordt alleen naar `main` gemerged wanneer de fast headless gate, focused Chromium gate en beide volledige Chromium release-shards slagen.

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

## Verdere ontwikkeling

Na v1.0 kan de game verder worden uitgebreid met onder meer uitgebreidere economische ketens, belegering, vernietigbare infrastructuur, verdere optimalisatie en uiteindelijk een losgekoppelde 3D-renderer bovenop de bestaande simulatiearchitectuur.
