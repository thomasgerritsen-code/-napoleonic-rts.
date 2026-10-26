# Online multiplayer

## Spelen

De eerste online versie is een privéwedstrijd voor twee spelers. De host speelt
Frankrijk, de deelnemer Groot-Brittannië. Op beide toestellen moet dezelfde versie
van de game draaien. Kies in het startmenu **Multiplayer** en daarna **Spel hosten** en deel de uitnodiging.
De tweede speler opent die link op een ander toestel of in een aparte browsersessie.
De strijd begint als beide spelers verbonden zijn, hun kaart geladen hebben en
allebei op **Gereed** hebben gedrukt. Met **Niet gereed** kun je dat vóór de start
weer intrekken.

De spelserver verwerkt beweging, verzamelen, bouwen, productie, regimenten,
officiertoewijzing, formaties, gevechtsbevelen, verzamelpunten en bijzondere
acties zoals verdedigen en tirailleurs. Camera, selectie en menu's blijven lokaal.
Singleplayer heeft geen onlineknop, multiplayerlobby of online sessie. Ga via
**Hoofdmenu → Multiplayer** naar online spelen; uitnodigingslinks blijven
rechtstreeks de juiste kamer openen.
Een nieuwe slag starten tijdens een online wedstrijd opent de lobby; eerst de
wedstrijd verlaten voorkomt dat één speler onbedoeld alleen zijn spel reset.

Kies je spelersnaam in de lobby. Ook een uitgenodigde speler kan zijn naam na
het deelnemen aanpassen, zolang hij nog niet gereed is. De naam wordt bij de
partij op de server bewaard en blijft behouden bij opnieuw verbinden. De lobby
toont per speler de verbinding, laadstatus en gereedmelding. De onlineknop en de
lobby tonen je gemeten ping naar de spelserver, ongeveer iedere vijf seconden.
Die waarde is de retourtijd van een bericht over de WebSocketverbinding.

Bij een verbroken verbinding pauzeert de simulatie voor beide spelers. Dezelfde
browser kan met een geheim sessietoken maximaal 90 seconden opnieuw verbinden.
Dat token staat uitsluitend in `sessionStorage`, nooit in de uitnodigingslink.
Ook vernieuwen van de pagina hervat de eigen partij. Een speler die al gereed
was, hervat na het laden automatisch; een nieuwe slag wacht op een nieuwe
gereedmelding van beide spelers. Op een derde toestel geeft
de uitnodiging geen toegang tot een al bezette partij.

## Gelijke start

Op de speelbare kaart beginnen beide partijen met 1100 voedsel, 1100 hout,
100 ijzer en 45 populatieruimte. Elk startleger telt 6 boeren, 12 musketiers,
4 cavaleristen, een officier te voet, een drummer en een officier te paard.
Hiermee kunnen beide spelers meteen een infanterie- en cavalerieregiment vormen.
Beide partijen hebben hetzelfde hoofdkwartier en dezelfde basisgebouwen om te bouwen.
De kaart heeft verschillende terreinen; de beginvoorraad en legers zijn gelijk.

Online wachten boeren van beide partijen op een opdracht. Na het uitputten
van een bron zoeken ze een nieuwe bron van hetzelfde opgedragen type; als
die niet meer bestaat, blijven ze staan. De singleplayercomputer blijft
zelfstandig zijn werk verdelen.

## Vrije startplekken en zichtbaarheid

De startlegers staan als hele opstelling op vrij terrein, met ruimte voor
soldaten en paarden naast woningen, hoofdkwartieren, grondstofbomen en bosranden.
De plaatsing houdt rekening met de grotere zichtbare dorpswoningen en met water.
Ook nieuwe eenheden en hun verzamelpunten worden bij voltooiing van de training
op een vrije plek gezet. Deze controle loopt alleen bij plaatsing, niet iedere
simulatiestap. De begincamera richt zich op het eigen leger.

Tijdens het spelen blijven bossen toegankelijk voor verzamelen en dekking.
Als zichtbare soldaten achter woningen of boomkruinen lopen, worden hun bestaande
sprites nogmaals boven de bedekkende scenery getekend. Zo kunnen meerdere
halfdoorzichtige boomkruinen een soldaat niet samen laten verdwijnen. De normale
mist, dieptevolgorde tussen soldaten en loopgraafclipping blijven van kracht;
onzichtbare vijanden worden niet getoond. Er worden geen nieuwe afbeeldingsbuffers
of textures aangemaakt.

## Grondstofgebieden

Drie neutrale vlaggen liggen op gelijke afstand van beide hoofdkwartieren.
Stuur gevechtseenheden naar een vlag en houd die 15 seconden vast:

| Gebied | Opbrengst voor de eigenaar |
| --- | --- |
| Landgoed | 3 voedsel per seconde |
| Houtkamp | 2 hout per seconde |
| IJzermijn | 1 ijzer per seconde |

Boeren, officieren, drummers, dode en vluchtende eenheden veroveren niet.
Bij troepen van beide partijen stopt het veroveren én de opbrengst. Als
alleen de vijand aanwezig is, stopt de oude opbrengst en kan hij het gebied
in 15 seconden overnemen. Een leeg, veroverd gebied blijft van de eigenaar
en blijft produceren; onvoltooide verovering vervalt zodra iedereen vertrekt.

Gebruik **Gebieden** om eigenaars, voortgang en opbrengsten te bekijken en
de camera naar een vlag te verplaatsen. Vlaggen staan ook op de minimap.
Hun locatie en gebiedsstatus zijn openbaar; vijandelijke eenheden blijven
onder het normale zicht vallen. De server verwerkt verovering en inkomen,
pauzeert die met de wedstrijd en bewaart ze bij opnieuw verbinden. Nieuwe
wedstrijden beginnen weer met neutrale gebieden. De singleplayercomputer
kiest grondstofgebieden als strategisch doel wanneer zijn basis veilig is.

## Overwinning en eindscherm

Er zijn op de speelbare kaart twee manieren om te winnen:

- Vernietig het vijandelijke hoofdkwartier én schakel alle gevechtstroepen uit.
  Boeren tellen niet mee; nog levende vluchtende troepen wel. Als beide legers
  tegelijk zijn uitgeschakeld, wordt het gelijkspel.
- Beheers alle drie grondstofgebieden 120 seconden onafgebroken en onbetwist.
  De aftelling begint pas na volledige verovering. Eén vijandelijke gevechtseenheid
  bij een vlag onderbreekt de controle en zet de aftelling terug op nul, ook
  voordat het gebied van eigenaar wisselt. Lege eigen gebieden blijven meetellen.

**Gebieden** toont de regels en de resterende tijd voor gebiedsoverwinning.
De tijd volgt de echte simulatie: tijdens een verbroken verbinding of pauze telt
hij niet door. Beide online spelers zien dezelfde partij, tijd en uitslag.
De gebruikelijke uitschakeling krijgt voorrang als beide voorwaarden in dezelfde
simulatiestap ontstaan. Bestaande gevechten zonder de open kaart behouden hun regels.

Het eindscherm toont de winnaar, reden, speelduur en per partij de getrainde,
verloren en resterende eenheden, verloren en resterende gebouwen en gebieden in
bezit. De beginlegers tellen niet als getraind. Verliezen tellen iedere unieke
eenheid één keer; een medische herleving telt niet als nieuwe training of nogmaals
als verlies. Daardoor zijn de aantallen geen eenvoudige begin-plus-min-balans.
De gezamenlijke statistieken worden pas bij de uitslag openbaar; tijdens de slag
blijven vijandelijke aantallen en voorraden onder het normale zicht vallen.

De uitslag en speelduur worden vastgezet zodra de strijd eindigt. De server
weigert verdere spelopdrachten. Opnieuw verbinden haalt dezelfde uitslag op zolang
de kamer nog bestaat. Een singleplayerslag kan via **Nieuwe slag** opnieuw beginnen.
Online kiezen beide verbonden spelers op het eindscherm **Opnieuw spelen**.
Eén verzoek wacht op instemming van de tegenstander. Daarna sluit de server de
oude simulatie en maakt hij binnen dezelfde kamer een nieuwe slag. Partijen,
namen, sessies en uitnodigingslink blijven behouden. Legers, voorraden, rangen,
gebieden, speelduur en uitslag beginnen opnieuw. Beide spelers kiezen daarna
opnieuw **Gereed**. **Hoofdmenu** verlaat de kamer en brengt je terug naar het
startmenu.
Er worden geen ranglijsten of permanente wedstrijdresultaten opgeslagen.

## Schiettorens versterken

Selecteer een voltooide eigen schiettoren en kies **Upgrade**. Net als een
loopgraaf heeft de toren drie niveaus. Het menu toont de kosten en voortgang;
de bezetting versterkt de toren terwijl deze blijft schieten.

| Niveau | Versterking | Kosten upgrade | Bouwtijd | HP | Bereik | Salvo |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Basistoren | Bouwprijs: 260 hout | Normale bouw | 1100 | 240 | 2 × 18 |
| 2 | Houten palissade | 180 hout, 40 ijzer | 20 s | 1600 | 270 | 3 × 18 |
| 3 | Zandzakken | 260 hout, 90 ijzer | 30 s | 2200 | 300 | 3 × 22 |

Kosten worden eenmalig bij het starten afgeschreven. De nieuwe eigenschappen
gelden pas na voltooiing; het resterende HP-percentage blijft behouden.
Een vernietigde toren wordt niet afgebouwd. Online controleert de server de
eigenaar, grondstoffen en bouwtijd. Voortgang pauzeert met de wedstrijd en
blijft behouden bij opnieuw verbinden. Vijanden zien alleen het voltooide
niveau van torens binnen hun zicht, niet de lopende upgrade.

## Regimentservaring en rangen

Een regiment verdient één overwinning als een vijandelijk regiment door
gevechtsverliezen uiteenvalt. Het nog bestaande regiment dat de meeste
manschappen uitschakelde krijgt de overwinning; bij gelijke bijdrage wint
het laagste regimentnummer. Alleen het laatste schot lossen is dus niet genoeg.
Losse soldaten en torens verdienen zelf geen regimentservaring.

| Rang | Verslagen regimenten | Extra schade | Minder moraalverlies bij treffers |
| --- | --- | --- | --- |
| Recruut | 0 | 0% | 0% |
| Ervaren | 1 | 5% | 5% |
| Veteraan | 3 | 10% | 10% |
| Elite | 6 | 15% | 15% |

Dit geldt voor infanterie, cavalerie en artillerie, inclusief granaten en
gebiedsschade. De rang staat bij de selectie; de details tonen overwinningen,
bonussen en de volgende drempel. Aanvullen behoudt de ervaring en nieuwe
manschappen profiteren direct. Promotie geneest geen verwondingen. Een nieuwe
slag begint zonder overgenomen ervaring. Online kent uitsluitend de server
overwinningen toe; opnieuw verbinden behoudt rang en voortgang. Alleen de
zichtbare rang en overwinningen zijn openbaar, niet de interne verliesregistratie.

## Lokaal starten

Vereist Node.js 22 of hoger en Chromium. De browser is alleen nodig **op de
server** om de huidige simulatie zonder tekenen te draaien; spelers downloaden
geen extra runtime of serverpakketten.

```sh
npm ci
npx playwright install --with-deps chromium
npm run start:server
```

Open `http://localhost:8080/?view=iso`. De server biedt zowel de gamebestanden als
de WebSocketverbinding `/multiplayer` aan. `/healthz` meldt pas klaar nadat de
simulatieruntime gestart is. Een localhost-link is alleen op dezelfde computer
bereikbaar. Voor internetspel is openbare HTTPS/WSS-hosting nodig.

Een bestaande systeeminstallatie kan via `CHROMIUM_EXECUTABLE_PATH` worden
gekozen. `CHROMIUM_NO_SANDBOX=1` is alleen nodig in omgevingen waar de sandbox
niet beschikbaar is; de meegeleverde container draait als gebruiker `node`.

## Openbaar hosten

De huidige testserver staat op
`https://napoleonic-rts-multiplayer.onrender.com` in Frankfurt. De Vercel-game
vult `wss://napoleonic-rts-multiplayer.onrender.com/multiplayer` automatisch in.
Kies **Multiplayer**, maak een kamer en deel de uitnodiging met de tweede speler.
De gratis server is begrensd op één gelijktijdige kamer en kan na inactiviteit
in slaap vallen. Dit is een testopstelling; meet de simulatiesnelheid voordat
je deze hosting voor grotere of langdurige wedstrijden gebruikt.
De eerste openbare proef met de oude statusoverdracht slaagde functioneel,
maar haalde slechts 7,5 seconden simulatie in 37,44 seconden echte tijd.
Daarom gebruikt de server nu de native JSON-encoder voor de overdracht tussen
Chromium en Node, in plaats van Playwright ieder statusveld apart te laten
verpakken. Zichtberekeningen worden per speler en moment hergebruikt; beweging,
zichtbereik en de andere speler krijgen steeds een nieuwe zichtcontrole.
In een lokale proef daalde de tijd voor honderd statusoverdrachten van circa
6,4 naar 0,5 seconde. De openbare herhaling op hetzelfde gratis abonnement
haalde 7,65 seconden simulatie in 9,13 seconden echte tijd; beide spelers
konden bewegen en trainen. Dat is ruim vier keer sneller dan de eerste proef.
Dit is geen garantie voor grotere legers of langdurige wedstrijden; controleer
ook de openbare simulatieklok voordat je meer kamers toestaat.
Een geaccepteerd verzoek om een kamer te maken valt onder de begrensde
simulatiestart (maximaal 60 seconden laden plus 15 seconden initialiseren).
Ongebruikte verbindingen blijven na 30 seconden vervallen.

Een verdere optimalisatie maakt de statuskopie in één doorgang, met minder
tijdelijke arrays. Elke verbinding bewaart alleen de laatst verzonden
vergelijkingswaarden, zodat de vorige status niet opnieuw wordt omgezet.
De eerste status en iedere hervatte verbinding blijven een volledig beginbeeld
krijgen; spelers delen geen vergelijkingsgeheugen. In lokale metingen daalde
het maken van honderd statusparen van circa 133 naar 74 ms en het verwerken
van duizend netwerkupdates van circa 490 naar 258 ms. Het aantal simulatietikken,
de frequentie van netwerkupdates en de weergave blijven gelijk.

De klok bewaart nu ook het nog niet uitgevoerde deel van een simulatietik.
Voorheen ging dat deel verloren wanneer een inhaalbatch de limiet van 250 ms
bereikte: een gerichte proef voerde daardoor slechts 45 van 49 aangeboden
seconden uit. Nu worden alle 980 echte tikken uitgevoerd (49 seconden).
De kamerklok bewaart daarnaast maximaal vier seconden tijdelijke achterstand,
verdeeld over batches van hoogstens 250 ms. Pauzeren en opnieuw verbinden
zetten die tijdsrekening terug; offline tijd wordt niet gesimuleerd.
Dit vangt ook de eerste zware marsopdrachten op de gratis server op. Elke
inhaalbatch blijft hoogstens 250 ms; alle verschuldigde simulatietikken worden
echt uitgevoerd, zonder de weergaveklok kunstmatig vooruit te zetten.
Gevechtszoekopdrachten slaan lege gebieden buiten de vijandelijke index over,
met dezelfde afstandsgrenzen, doelkeuze en volgorde bij gelijke afstanden.

De verschillen worden inmiddels al in de simulatie berekend, vóór de overdracht
naar Node. Beide omgevingen gebruiken dezelfde codec. Daardoor worden vaste
kaartgegevens en ongewijzigde eenheden niet telkens opnieuw doorgegeven en
ingelezen. In een lokale proef met honderd updates daalde deze interne
overdracht van circa 14,3 MB naar 3,0 MB. Dit verandert de netwerkfrequentie en
de inhoud van de berichten aan spelers niet.
Elke nieuwe of hervatte verbinding krijgt een nieuw verbindingsnummer en een
volledig beginbeeld. Een nog onderweg zijnde update voor het oude nummer wordt
weggegooid. Voor een afwezige speler wordt geen status gecodeerd.

Render bouwt het bestaande `Dockerfile` vanaf de branch
`claude/continue-updates-o6whr4`. Laat **Docker Command** leeg, zodat de container
zelf `node server/index.js` start. Stel `PUBLIC_ORIGIN` in op de bovenstaande
HTTPS-oorsprong, `PORT=10000`, `MAX_ROOMS=1` en de hieronder genoemde
`ALLOWED_ORIGINS`. Gebruik één instantie; meerdere instanties delen geen kamers.
Voor een HTTP-gezondheidscontrole is `/healthz` beschikbaar.

`Dockerfile` en `railway.json` beschrijven één blijvende Node-server met een
gezondheidscontrole. Verbind het GitHub-repository en selecteer de branch met
de online spelserver. Publiceer één replica met een HTTPS-domein. Railway levert hiervoor
`RAILWAY_PUBLIC_DOMAIN`; daarmee kiest de server automatisch zijn WSS-adres.
Bij andere hosting stel je `PUBLIC_ORIGIN=https://jouw-domein` in.

De huidige Vercel-site blijft de browsergame aanbieden. Voeg die exacte oorsprong
toe aan `ALLOWED_ORIGINS` op de spelserver, bijvoorbeeld:

```text
ALLOWED_ORIGINS=https://napoleonic-rts-git-claude-continue-upd-c04728-tgerritsen-5-5923.vercel.app
```

Open vervolgens de Vercel-game, kies **Multiplayer**, vul
`wss://jouw-serverdomein/multiplayer` in en maak een kamer. Het openbare serveradres
wordt lokaal onthouden en staat ook in de uitnodiging. Je kunt daarnaast de game
direct op het serverdomein spelen; die gebruikt automatisch zijn eigen server.
Een HTTPS-game accepteert alleen WSS, zodat iPhones geen gemengde verbinding
blokkeren. Er worden geen accountwachtwoorden of geheime sleutels in de client
opgenomen. Deze bestanden alleen activeren geen hosting of abonnement.

| Instelling | Standaard | Betekenis |
| --- | --- | --- |
| `PORT` | `8080` | HTTP- en WebSocketpoort |
| `PUBLIC_ORIGIN` | eigen HTTP-oorsprong / Railway-domein | Openbare HTTPS-oorsprong achter een proxy |
| `ALLOWED_ORIGINS` | leeg | Extra toegestane browseroorsprongen, door komma's gescheiden |
| `MAX_ROOMS` | `2` | Gelijktijdige kamers; bereik 1–16 |
| `CHROMIUM_EXECUTABLE_PATH` | Playwright-browser | Optioneel pad naar geïnstalleerd Chromium |

Begin met één instantie en voldoende geheugen, bijvoorbeeld 1 GiB voor een kleine
proefserver. Meet CPU, geheugen en tikduur bij echte legers voordat je het
kamermaximum verhoogt. De server weigert nieuwe kamers wanneer hij vol is;
bestaande wedstrijden blijven afzonderlijk. De applicatie begrenst kamers,
verbindingen, opdrachten, berichtgrootte, achterstallige berichten en bewaartijden.
Een lege wachtkamer vervalt na tien minuten, een wedstrijd na maximaal twee uur,
en het eindresultaat blijft vijf minuten beschikbaar. `SIGTERM` sluit kamers en
de simulatieruntime netjes af.

## Eén gezaghebbende strijd

Een serverklok draait op 20 tikken per seconde. Elke tik voert de bestaande
simulatie in drie stappen van 1/60 seconde uit.
Korte vertragingen over de asynchrone simulatieverbinding worden ingehaald met
hoogstens vijf tikken (250 ms) per batch; verbindingspauzes worden niet ingehaald.
De client wacht op zijn eerste volledige spelstatus en afbeeldingen voordat
hij geladen meldt. Alleen de expliciete gereedmelding start een nieuwe slag.
Een hervatte sessie bewaart de eerdere instemming. Opnieuw spelen vereist twee
verzoeken na afloop. De server vervangt de simulatie zonder twee kamers of
simulaties tegelijk te laden. Hij nummert de slagen en weigert opdrachten uit
oude slagen; iedere nieuwe slag of verbinding begint met een volledige status.
Lopende antwoorden van de vorige simulatie of verbinding worden weggegooid.
Opdrachten krijgen identiteit en
volgorde van de verbinding, met controles bij ontvangst én uitvoering. Clients
kunnen geen partij, spelklok, levenspunten of grondstoffen kiezen. Dubbele oude
opdrachten worden afgewezen. Strategische Britse AI en automatische AI-bouw
staan uit voor een menselijke Britse speler; automatisch terugschieten en
bestaande regels voor moreel en vluchten blijven onderdeel van de simulatie.

Tien keer per seconde ontvangt elke speler zijn eigen zichtgefilterde beeld:
de eigen economie en eenheden, alleen zichtbare vijanden, zichtbare effecten en
het gedeelde weer. Vijandelijke opdrachten, bestemmingen en productiewachtrijen
worden weggelaten. De geografie van grondstoflocaties is openbare kaartinformatie;
uitputting wordt alleen binnen zicht bijgewerkt. Verschillen tussen opeenvolgende
beelden verminderen verkeer; een herstelde verbinding krijgt altijd een volledig
beginbeeld. Trage verbindingen worden afgebroken voordat onbeperkte achterstand
kan ontstaan. De client tekent tussen ontvangen posities zonder zelf te simuleren.

De Britse client gebruikt de lokale selectieconventie van de bestaande UI, maar
behoudt echte Britse uniformen via `nativeSide`. Voor Britse opdrachten gebruikt
de legacyserver een synchrone invoerscope die de lokale-partijconventie tijdelijk
omzet en altijd herstelt vóór de volgende simulatietik. Eigendom wordt buiten
deze scope gecontroleerd op de echte partijen. Het is een migratieadapter om de
huidige spelregels te behouden, geen tweede simulatie of browser die als host
de andere speler bestuurt.

## Grenzen en volgende migratie

Dit is een eerste privé-multiplayer, zonder accounts, openbare matchmaking,
ranglijsten of opgeslagen wedstrijden.
De startlegers en voorraden volgen voorlopig de bestaande spelopstelling;
competitieve balans is nog geen onderdeel van deze eerste versie.
Kamers en de strijd staan in het geheugen
van één blijvende server. Een serverrestart of nieuwe deployment beëindigt lopende
wedstrijden. Meerdere replica's of vluchtige Functions vereisen eerst een
kamerrouter, herstelpunten en gedeelde opslag; alleen het replicaaantal verhogen
zou spelers over verschillende simulaties verdelen.

De tijdelijke Chromium-adapter tekent niet, opent geen GPU-renderer en laadt geen
spriteafbeeldingen. Hij gebruikt wel geheugen per kamer. De volgende stap voor
grotere aantallen spelers is de bestaande spelregels verder uit DOM/Franse
UI-conventies halen naar een pure Node-simulatie, met dezelfde opdrachtlaag,
zichtfiltering, verbinding en lobby. Hiervoor hoeft de browserclient niet opnieuw
te worden gebouwd. Fysieke iPhone-framerates en grotere online legers moeten op
echte toestellen en openbare hosting gemeten worden.

## Paardenregimenten

Train een **Officier te paard** in de stal. Selecteer hem en kies
**Paardenregiment maken**: hij verzamelt maximaal twaalf vrije ruiters binnen
320 meter, met minstens vier ruiters van hetzelfde type. Er is geen tamboer
nodig. Expliciet geselecteerde ruiters blijven onderdeel van de keuze; een
officier te voet kan alleen infanterie leiden.

De stal toont ook de regimentknop en **Train ontbrekende cavalerie**. Die zet
alleen de ontbrekende ruiters en de officier te paard in de wachtrij; reeds
ingeplande eenheden tellen mee. Vorm het regiment zodra de opleiding klaar is.
Deze opdrachten lopen online via de server voor de eigen partij.

Bij gevechten naderen ruiters hun tegenstander op contactafstand en houden ze
die vast zolang die leeft, niet vlucht en dichtbij blijft. Hun regiment houdt
bij de strijd halt; een nieuwe loop- of terugtrekopdracht breekt dit contact.
De gewone schade, herlaadtijd, moreel- en loopgraafregels blijven gelden.
Zwaardanimaties volgen echte slagmomenten uit de server, ook wanneer een paard
een kleine stap zet. Een wachtende charge zwaait niet voortdurend in de lucht.

## Verificatie

`npm run test:multiplayer` controleert twee afzonderlijke browsercontexten,
waaronder een telefoonviewport: hosten/deelnemen, bewegen, productie, afzonderlijke
economieën, eigendom, uitval/pauze/hervatten, paginavernieuwing en veilige
uitnodigingen. Echte WebSockets testen herkomstcontrole, protocol, volle kamers
en ongeldige of ontbrekende sessietokens. Een aanvullende test draait echte
regimentvorming, gevechten, zichtfiltering en overwinning door de serveradapter.
Node-tests controleren daarnaast het gedeelde opdrachtprotocol, begrenzingen,
snapshotverschillen en volledige reconstructie zonder informatie van de vorige
verbinding. De browsercontrole gebruikt Chromium met een iPhone-achtige viewport;
dit is geen fysieke Safari- of frameratemeting.

Tijdens een lopende infanterie- of cavaleriecharge kan ongeveer één op twaalf soldaten struikelen. Na 1,9 seconde staat die weer op en vervolgt het bevel; het kost geen gezondheid of regimentlid. De server bepaalt de val eenmalig per charge op basis van echte loopafstand en deelt alleen de zichtbare valtijden/richting. Er wordt niet gestruikeld op bruggen, in water, in een oversteekwachtrij of binnen 45 eenheden van een vijand. De bestaande valbeelden worden gebruikt voor vallen en opstaan, zonder extra beeldbestanden of timers.

Chargebotsingen gebruiken de recent gemeten aanloopsnelheid, stamina en nabije ondersteunende soldaten; carré en cavalerie bieden meer weerstand. Alleen de eerste echte treffer na een aanloop krijgt de botsing: het paard remt, de chargebonus eindigt, en een overlevende tegenstander kan kort terugwankelen of omvallen. Terugduwen gebeurt in kleine gecontroleerde stappen, met muren, water, bruggen, andere lichamen en wereldranden als grenzen.

Melee gebruikt echte afweer met gedeeltelijke schadevermindering, afwisselende zwaardbewegingen, bajonetsteken zonder kogels of kruitrook en korte reacties op treffers. Een afgeweerde ruiter zoekt met een kleine vloeiende draai een nieuwe opening. De server bepaalt deze gebeurtenissen; beide clients krijgen alleen de zichtbare actie, richting, variant en tijden. Bestaande animatie-atlassen worden hergebruikt. De botsings- en afweerberekeningen zoeken uitsluitend in de lokale gevechtsgrid bij een echte slag.

Regimenten krijgen naast moraal nu zichtbare formatiesamenhang: aarzelen, linie gebroken, terugtrekken, verzamelen, onder druk, formeren en gereed. Werkelijke treffers en verliezen bouwen druk op; terugtrekken gebruikt de bestaande routeplanner, en kleine vaste afwijkingen op de formatieslots maken ontregeling fysiek zichtbaar zonder soldaten te verplaatsen of te teleporteren. Brugkolonnes blijven onder de bestaande verkeersregeling.

Overlevenden behouden hun regiment en rang. Een veilig bereikte verzamelplek, een levende officier in de buurt, voldoende moraal en minstens zes seconden veilig verzamelen zijn nodig voor herstel; daarna lopen de soldaten daadwerkelijk terug in de oorspronkelijke formatie. Nieuwe dreiging of officiersverlies onderbreekt dit. Spelersbevelen en halt houden voorrang, AI-bevelen breken de automatische terugtocht niet af. Ernstig blijvend moreelverlies of te weinig overlevenden kan nog steeds het regiment vernietigen. Tijdelijk formatieverlies levert geen regimentszege op.

Online beslist uitsluitend de server. Zichtbare vijanden delen alleen samenhang, fase en fasetijd; hun terugtochtbestemming blijft privé en een teruggetrokken regiment verdwijnt normaal uit het zicht. Er zijn geen nieuwe afbeeldingen of timers nodig; druk en herstel worden viermaal per spelseconde per regiment beoordeeld.

Een stilstaande infanterielinie vuurt nu per fysieke rang, op een eigen regimentsritme: kort richten, de voorste rang geknield, ongeveer 0,58 seconde later de volgende rang, daarna werkelijk herladen. Individuele herlaadtijd varieert licht met soldaat en vermoeidheid; gewonden laden langzamer. Een enkele fysieke rang blijft één salvo. Marcheren, bajonetten, tirailleurs, brugkolonnes en vuur vanuit een loopgraaf behouden hun eigen regels. Werkelijke schottijden sturen ook de online animatie; een weigeraar geeft geen kogel of mondingsrook.

Lopende gewonden houden hun identiteit, regiment en rang. Onder 65% gezondheid lopen en laden ze trager; onder 30% is het effect sterker. Verband en een lichte mankbeweging maken letsel zichtbaar. Zet gewonden stil naast een eigen veldhospitaal: na drie seconden zonder treffer en zonder vijand in de buurt behandelt het hospitaal twee lopende patiënten tegelijk, de zwaarstgewonden eerst. Herstel kost tijd, stopt bij dreiging of lopen en geneest gezondheid geleidelijk.

Brancardiers geven urgentere, nog bereikbare slachtoffers voorrang. Ze volgen veilige routes om gebouwen en via bruggen, met controle van iedere stap. Niet opgehaalde slachtoffers kunnen ook tijdens een mislukte ophaalpoging overlijden. Patiënten verdwijnen niet als hun hospitaal verloren gaat: ze worden buiten neergelegd en kunnen opnieuw worden opgehaald. Een herstelde soldaat komt op een vrije plek buiten het hospitaal terug en kan aansluiten zonder het bestaande marsbevel van zijn regiment te vervangen.
