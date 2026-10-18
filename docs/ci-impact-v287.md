# v287 — selectie van GitHub Actions-controles op basis van code-impact

## Doel
Versnel gewone pull requests zonder minder grondige publicatiecontroles. De workflow kan op een PR niet-relevante zware jobs overslaan. Een push naar `main`, een releasebranch of een handmatige workflow-run draait **alle vijf** controles.

## Testroutering
| Gewijzigd onderdeel | Snelle headless checks | Gerichte Chromium | Bruggen/beweging | 520-unit Health | Golden Battle |
| --- | --- | --- | --- | --- | --- |
| Alleen documentatie | Altijd | — | — | — | — |
| Versienummer / alleen HTML-cachekeys | Altijd | ✓ | — | — | — |
| Wegen, kaart, rivieren, formatie | Altijd | ✓ | ✓ | — | — |
| AI-tactiek en AI-opdrachten | Altijd | ✓ | ✓ | — | ✓ |
| Combat / artillerie | Altijd | ✓ | — | — | ✓ |
| Rendering / performance | Altijd | ✓ | — | ✓ | — |
| Onbekende, wijzigingen aan CI, bootstrap, dependencies | Altijd | ✓ | ✓ | ✓ | ✓ |
| Iedere push op `main` of handmatige workflow | Altijd | ✓ | ✓ | ✓ | ✓ |

Bij wijzigingen aan meerdere subsystemen wordt de vereniging van relevante gates uitgevoerd. Extra gerichte tests die passen bij gewijzigde bronbestanden blijven gekozen worden door `scripts/select-focused-tests.js`. Een onleesbaar/ontbrekend diff resulteert in alle controles.

## Beveiliging
- De classifier wordt geïmplementeerd met `scripts/ci-impact.js`, met regressietests onder `tests/headless/ci-impact.test.js`.
- De statusnamen van de bestaande vijf CI-gates blijven ongewijzigd. Een niet-relevante gate kan op een PR bewust als *skipped* eindigen; dit is geen uitgevoerde test.
- Bij publiceren op `main` retourneert de classifier altijd `true` voor alle zware gates. `Deploy GitHub Pages` vereist `impact`, `fast`, `focused`, `health`, `movement` en `golden`.
- De volledige release-shard blijft optioneel beschikbaar voor releasebranches en handmatig starten.
- De kritieke brugcolonne-simulator, mobiele inputtests en alle tests zelf blijven in de codebase; alleen hun uitvoermoment kan veranderen.

## Aandachtspunten
Deze aanpassing bespaart runner- en browsertijd op *gewone pull requests*. Hij versnelt niet automatisch publicaties na merges, want daar draaien alle vijf gates nog. Het verschil in CI-minuten is pas na een reeks representatieve PR's betrouwbaar te meten. Nieuwe bronpaden moeten expliciet geclassificeerd worden; anders lopen uit voorzorg alle gates.

Een overgeslagen gate op een PR is **geen bewijs dat die test geslaagd is**. Alleen de verplichte run op `main` valideert de volledige build vóór publicatie.
