# Testaudit v286 — veilige opschoning

Datum: 18 oktober 2026. Scope: browser-RTS op `main` v1.3.33 → v1.3.34.

## Verwijderd en vervangen waar mogelijk

| Verouderde test | Waarom verwijderd | Vervangende dekking |
| --- | --- | --- |
| **Volledige `tests/rts.spec.js` 0.6.x-verzamelsuite** | Oud opstart-/spelgedrag tegen de oude kaart en AI; acht van de dertien overgebleven checks faalden door verouderde coördinaten, routes en aannames | De actuele gerichte specbestanden voor opstart, productie, artillerie, formatie, brug/weg, AI en gevechtsbenchmark blijven |\n| `rts.spec.js`: v0.6.6 boot | Hardcoded versie 0.6.6 en kaartmaat 3800×2200, werd via `grepInvert` overgeslagen | `smoke-v1.spec.js`, `foundation-v071.spec.js` |
| `rts.spec.js`: v0.6.6 F3 | Hardcoded bugrapportversie 0.6.6, werd via `grepInvert` overgeslagen | `test-lab.spec.js`, `game-health-observer.spec.js` |
| `rts.spec.js`: precies 13 wegen | Onverenigbaar met huidige doorlopende 25-wegennet, kaart 8000×5000 | `imperial-road-network-v283.spec.js` (connectiviteit, rivierveiligheid, wegklassen, bereikbaarheid) |
| `rts.spec.js`: 520 units | Dubbele oude stresstest met beperkter rapport | `game-health-observer.spec.js` + `tests/headless/large-army-performance-v12.test.js` |
| `published-build-version.spec.js` | Vaste verwachte versie 1.3.22 i.p.v. dynamische huidige versie | `tests/headless/published-build-version.test.js` + `smoke-v1.spec.js` |
| Zes losstaande subsystem-load-specs | Iedere spec startte opnieuw een Chromiumpagina terwijl alleen eenvoudige subsystemchecks plaatsvonden | Assertions zijn opgenomen in de bestaande opstarttest in `smoke-v1.spec.js` |

Samengevoegde checks:
`battlefield-weather-v1.spec.js`, `cavalry-artillery-v1.spec.js`, `fog-scouting-v1.spec.js`, `morale-command-v2.spec.js`, `stamina-discipline-v1.spec.js`, `terrain-los-v1.spec.js`.

## Bewust NIET verwijderd

De aparte CI-gates voor **fast headless**, **focused Chromium**, **movement coverage**, **520-unit Game Health** en **Golden Battle** blijven zoals ze zijn. Ook de strenge brugcolonne-autosimulator met controle van de laatste rij, brugverkeer en waterveiligheid blijft verplicht.

De volledige Chromium-release-suite blijft beschikbaar voor releasebranches en handmatig gestarte workflows.

**Aandachtspunt:** de oude test voor een interactieve rally-pointklik had geen exact één-op-één-vervanger. Die miste zijn verwachte positie na de kaartvergroting; de overige productie- en inputtests blijven, maar een nieuwe dynamische rally-pointtest is wenselijk bij verdere wijzigingen aan rallypoints. Ook de oude 10-minuten-soak als afzonderlijke opdracht is vervallen; Golden Battle, 520-unit Game Health en bewegingssimulatoren geven nu gerichte stabiliteitsdekking.

Ook het verouderde npm-script `test:soak` is verwijderd. De selectielogica filtert nu verwijderde spec-paden uit Git-diffs, zodat oude testbestanden niet opnieuw worden ingepland.

## Criteria voor een volgende opschoningsronde

1. Verwijder een test pas als die bewezen duplicaat of onjuist geworden is én dezelfde gedraging aantoonbaar elders gecontroleerd wordt.
2. Verwijder geen echte beweging-, brug-, vierbreed-, mobiele-input-, combat- of winconditiechecks op basis van testduur alleen.
3. Bewaar één snelle rooktest voor opstart en subsystem-contracten; vermijd afzonderlijke browserstarts voor uitsluitend laadcontroles.
4. Als een test een legitieme regressie vangt, repareer productiecode. Verwijder een test niet om rood CI groen te maken.
5. Controleer voor merge de actuele `main`, PR-head en de CI-gates.
