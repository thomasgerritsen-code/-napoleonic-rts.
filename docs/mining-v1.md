# IJzermijnen

In de open, isometrische wereld zijn de losse ijzerbrokken vervangen door
steenrijke afzettingen. Iedere afzetting heeft een eindige ijzerreserve.

1. Selecteer een of meer boeren en kies **Bouwen → IJzermijn** (250 hout).
2. Plaats de mijn op een vrij steenrijk gebied. De mijn sluit op de afzetting aan.
   Je kunt geen mijn op willekeurige grond of op een bezette/uitgeputte afzetting bouwen.
3. Laat de boeren de bouw voltooien. De bouwers gaan daarna vanzelf aan het werk.
   Met **Werk → Werk in mijn** kun je extra geselecteerde boeren inzetten in de
   dichtstbijzijnde voltooide eigen mijn. Rechtsklikken op de mijn werkt ook.
4. Boeren delven ijzer buiten de mijningang en brengen hun lading naar het eigen
   hoofdgebouw. Een lege mijn levert geen gratis grondstoffen op.

Een bouwplaats of vijandelijke mijn geeft geen toegang tot het ijzer. Bij
vernietiging stopt de winning; reeds gedolven lading wordt nog afgeleverd. Je kunt
op een niet-uitgeputte afzetting een nieuwe mijn bouwen. Een uitgeputte afzetting
blijft zichtbaar maar levert niets meer op. Begin een nieuwe slag om de nieuwe
wereldindeling te laden; de bestaande startvoorraad blijft behouden.

De computertegenstander betaalt en bouwt dezelfde mijnen. Online controleert de
server plaatsing, eigendom, bouwstatus, winning en aflevering voor beide spelers.
De geologische afzetting onthult geen verborgen vijandelijke mijn. Het gedeelde
commandoformaat gebruikt een nieuw toegestaan gebouwtype; protocolversie 1 blijft
gelijk. De klassieke 2D-scenario's houden hun bestaande economie.

De mijn en afzetting gebruiken maximaal vier kleine, gedeelde Canvas-texturen
(minder dan 1 MB). De isometrische renderer gebruikt ze zowel met WebGL als met
de mobiele Canvas-renderer; er zijn geen extra afbeeldingsdownloads of timers.

Validatie: `tests/mining-v1.spec.js` test bouwkosten, plaatsing, voltooide bouw,
echte aflevering, eindige reserves, vernietiging, reset, AI, native serverregels
en mobiele bediening in beide renderstanden. `tests/mining-online.spec.js` test
twee verbonden spelers met dezelfde autoritatieve simulatie en de echte UI.
