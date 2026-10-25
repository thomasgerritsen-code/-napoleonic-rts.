# Online multiplayer

## Spelen

De eerste online versie is een privéwedstrijd voor twee spelers. De host speelt
Frankrijk, de deelnemer Groot-Brittannië. Op beide toestellen moet dezelfde versie
van de game draaien. Kies in het startmenu **Multiplayer** en daarna **Spel hosten** en deel de uitnodiging.
De tweede speler opent die link op een ander toestel of in een aparte browsersessie.
De strijd begint als beide spelers verbonden zijn en hun afbeeldingen geladen zijn.

De spelserver verwerkt beweging, verzamelen, bouwen, productie, regimenten,
officiertoewijzing, formaties, gevechtsbevelen, verzamelpunten en bijzondere
acties zoals verdedigen en tirailleurs. Camera, selectie en menu's blijven lokaal.
Een nieuwe slag starten tijdens een online wedstrijd opent de lobby; eerst de
wedstrijd verlaten voorkomt dat één speler onbedoeld alleen zijn spel reset.

Bij een verbroken verbinding pauzeert de simulatie voor beide spelers. Dezelfde
browser kan met een geheim sessietoken maximaal 90 seconden opnieuw verbinden.
Dat token staat uitsluitend in `sessionStorage`, nooit in de uitnodigingslink.
Ook vernieuwen van de pagina hervat de eigen partij. Op een derde toestel geeft
de uitnodiging geen toegang tot een al bezette partij.

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
6,4 naar 0,5 seconde. Dit is geen garantie voor alle legers op de gratis server;
controleer ook de openbare simulatieklok voordat je meer kamers toestaat.

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
De client wacht op zijn eerste volledige spelstatus voordat hij klaar meldt.
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
