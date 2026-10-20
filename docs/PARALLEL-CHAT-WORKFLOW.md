# Werkwijze: Napoleonic RTS ontwikkelen in vier ChatGPT-chats

Dit is het gedeelde werkcontract voor handmatige, gelijktijdige ontwikkeling. Lees ook \`AGENTS.md\`.

**Repository:** \`thomasgerritsen-code/-napoleonic-rts.\` (de punt aan het einde hoort bij de naam).  
**Basisbranch:** \`main\`.  
**Speelbare game:** https://thomasgerritsen-code.github.io/-napoleonic-rts./

## Rollen en grenzen

| Chat | Rol | Eigen taken | Raak liever niet aan |
| --- | --- | --- | --- |
| 1 | Gameplay | Units, boeren, bouwen/hervatten, grondstoffen, gevecht, marsformaties, brugpassages, simulatie | Renderer- of performance-refactors zonder afstemming |
| 2 | Wereld & 2D-graphics | Rivier/oevers/stroming, kaart, wegen, bomen, bessen, visuele effecten, 2D-assets | Orders, AI, bouwkosten, pathfindinglogica |
| 3 | Performance & mobiele bediening | FPS, rendering/caching, browserrespons, pan/zoom/touch, regressies op telefoon | Gameplaymechanica zonder expliciete opdracht |
| 4 | Integratie & release | Overlap detecteren, PR-beoordeling, CI, mergevolgorde, releaseversies en controle van de gepubliceerde game | Nieuwe gameplay- of graphics-features |

Dit zijn **logische verantwoordelijkheden, geen exclusieve bestandsrechten**. Als twee taken dezelfde bestanden of gedeelde interfaces gebruiken, kan er alsnog een conflict ontstaan. In dat geval eerst werk verdelen via aparte kleine veranderingen of wijzigingen na elkaar integreren.

Het spel blijft **2D**. Start geen nieuwe 3D-engine of grote renderer-migratie zonder expliciete toestemming. Behoud bestaande gameplay en bediening.

## Afspraak voor elke ontwikkelchat

1. Lees \`AGENTS.md\` en dit document. Controleer de **actuele** \`main\` en open PR's, inclusief welke bestanden ze veranderen; vertrouw niet op een status uit een vorige chat.
2. Formuleer **één** afgebakende wijziging met acceptatiecriterium en controleer of een andere open PR die wijziging al doet.
3. Begin vanaf de **nieuwste main** met een **nieuwe branch per taak**, bijvoorbeeld \`chat1/gameplay-resume-build-20261020\`, \`chat2/river-visuals-20261020\` of \`chat3/mobile-zoom-20261020\`. Geen gedeelde, langlevende schrijfbranch.
4. Wijzig zo min mogelijk bestanden en refactor geen andere subsystemen. Wijzig \`main\` niet rechtstreeks. Force-push niet en schrijf niet in de branch van een andere chat.
5. Voeg een gerichte regressietest toe als dat nodig is om het aangetoonde probleem te voorkomen; voer **alleen relevante lokale tests** uit. Laat de bestaande vereiste CI-controles op de PR draaien. Verwijder of omzeil geen verplichte repository-controles.
6. Maak **één PR naar \`main\` per afgebakende wijziging** en vermeld duidelijk de werkelijk gewijzigde onderdelen.
7. De ontwikkelchat **merget nooit** zelf en presenteert een open PR niet als een uitgegeven spelupdate. Alleen Chat 4 behandelt het samenvoegen.
8. Rapporteer: branch, PR-nummer/link, head-commit, gewijzigde bestanden, korte testresultaten, resterende risico's, eventuele previewlink, en de **bestaande** speelbare GitHub Pages-link. Als iets niet is uitgevoerd, benoem het als zodanig.

Chats communiceren niet automatisch met elkaar; **GitHub is de gedeelde bron van waarheid**. Werk begint alleen wanneer de gebruiker de chat een concrete opdracht geeft. Plan geen periodieke of automatische taken in.

## Testbeleid: gericht, snel en betrouwbaar

- Gebruik bij JavaScript/gameplaywijzigingen de relevante headless-tests; \`npm run test:fast\` is een bestaande projectopdracht.
- Gebruik voor browser- of touchwijzigingen een gerichte Playwright-test. Bij mobiele aanrakingen test ook echte taps, pan/pinch en het ontbreken van spookorders wanneer relevant.
- Controleer op regressies die door de gewijzigde code geraakt kunnen worden: colonne vier breed op wegen/bruggen, bouw hervatten op mobiel, rivier-collision, grondstoffen, camerabediening, of performance.
- Geen zware volledige testbatch voor puur documentatiewerk, behalve wanneer repo/CI die vereist. Herhaal brede tests niet zonder aanleiding; **vereiste CI-gates blijven leidend**.
- Vermeld expliciet of een test is uitgevoerd, niet uitgevoerd of mislukt. Maak nooit een groene status op basis van alleen aannames.

## Integratiechat: vaste mergevolgorde

1. Haal op het moment van integreren opnieuw actuele \`main\`, open PR's en de **huidige** head-SHA op.
2. Geef prioriteit aan een kleine PR die geen gedeelde bestanden of gedragingen raakt; voor overlappende PR's: bepaal een volgorde en laat de latere PR veilig synchroniseren met de nieuwe \`main\` vóór merge.
3. Controleer per PR: afbakening, wijzigingsdiff, review, actuele CI, mobile/2D-relevantie, mergeability en behoud van bestaande functies.
4. Merge alleen bij toestemming van de gebruiker of op basis van de expliciete integratieopdracht voor deze chat; geen force merge, geen beschermingen omzeilen.
5. Controleer daarna de actuele \`main\`, eventuele deploy en de speelbare URL. Claim pas een release wanneer die daadwerkelijk is verschenen.
6. **Één eigenaar voor zichtbare versienummers:** Chat 4 verzorgt versie-/releasewijzigingen in een afzonderlijke, kleine release-PR of gecontroleerde integratiestap. Chats 1-3 veranderen niet zelfstandig \`package.json\`, README-releasekoppen en gedeelde globale build-/cacheversies voor hun eigen PR, zodat parallelle wijzigingen niet dezelfde versie claimen. Een feature-PR is identificeerbaar via PR-nummer en head-SHA tot de release.
7. Publiceer een kort integratieoverzicht met samengevoegde PR's, nieuwe versie (alleen indien geverifieerd), test-/deploystatus, open blokkades en altijd de speelbare gamelink.

## Minimale PR-beschrijving

\`\`\`markdown
## Doel
[De ene concrete verandering]

## Scope
[Wat gewijzigd is, en wat bewust niet]

## Acceptatie
[Observeerbaar gedrag]

## Tests
- Uitgevoerd: ...
- Niet uitgevoerd + reden: ...
- CI: pending / groen / rood (controle op huidige head)

## Afstemming
- Mogelijke overlap met PR #: ...
- Branch/head-SHA: ...
- Preview: [alleen indien daadwerkelijk beschikbaar]
\`\`\`

## Beginprompts voor de vier chats

### Chat 1 — Gameplay

> Jij bent de Gameplay-ontwikkelaar van \`thomasgerritsen-code/-napoleonic-rts.\`. Lees eerst de actuele \`main\`, open PR's, \`AGENTS.md\` en \`docs/PARALLEL-CHAT-WORKFLOW.md\`. Werk alleen aan gameplay, eenheden, boeren, gebouwen, marsformaties en grondstoffen. Voorkom overlap met andere open PR's. Gebruik voor iedere opdracht een nieuwe branch vanaf \`main\`, voer gerichte tests uit en open maximaal één PR per opdracht. Merge niet zelf. Rapporteer branch, PR, commit, tests en geef altijd de game-URL. Begin pas na mijn concrete opdracht.

### Chat 2 — Wereld en 2D-graphics

> Jij bent de 2D-wereld- en graphicsontwikkelaar van \`thomasgerritsen-code/-napoleonic-rts.\`. Lees eerst de actuele \`main\`, open PR's en de twee samenwerkingsdocumenten. Werk aan 2D-terrein, rivier, oevers, stroming, vegetatie, wegen en visuele effecten zonder gameplaylogica onbedoeld te veranderen. Voorkom overlappende bestanden met andere PR's. Nieuwe branch en één gerichte PR per opdracht, beperkte relevante tests, nooit zelf mergen. Geef PR/commit, teststatus en altijd de speelbare game-URL. Begin pas na mijn concrete opdracht.

### Chat 3 — Performance en mobiel

> Jij bent de browserperformance- en mobiele-bedieningsontwikkelaar van \`thomasgerritsen-code/-napoleonic-rts.\`. Lees eerst de actuele \`main\`, open PR's en de twee samenwerkingsdocumenten. Werk aan frametijd/FPS, 2D-rendering, cache, touch, pan/zoom en mobiele responsiviteit. Behoud orders, gameplay en de bestaande 2D-fallback. Controleer overlap met Gameplay-PR's bij touch-afhandeling. Nieuwe branch en één PR per opdracht; meet verbetering en test uitsluitend relevante regressies. Merge niet zelf. Rapporteer PR, commit, meetresultaten, tests en speelbare game-URL. Begin pas na mijn concrete opdracht.

### Chat 4 — Integrator

> Jij bent de enige Integrator voor \`thomasgerritsen-code/-napoleonic-rts.\`. Lees actuele \`main\`, alle open PR's en de twee samenwerkingsdocumenten voordat je iets doet. Controleer samenhang, test-/CI-status, reviews en conflicten op actuele SHAs. Merge alleen met mijn opdracht, één veilige PR tegelijk; pas geen branch protection aan en forceer geen merges. Laat ontwikkelchats overlappende branches veilig synchroniseren. Beheer als enige releaseversies en controleer een echte deploy voordat je een nieuwe versie claimt. Rapporteer exact wat gemerged, getest en gepubliceerd is, blokkades en altijd de speelbare game-URL. Begin pas na mijn concrete opdracht.

## Belangrijk

Meerdere chats kunnen gelijktijdig openstaan en opdrachten ontvangen. Ze draaien **niet als één autonoom team op de achtergrond** en delen geen live geheugen of automatische planning. De centrale bron is GitHub; de gebruiker start en bewaakt de werkzaamheden vanuit de vier chats.
