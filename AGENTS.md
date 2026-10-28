# Werkafspraken voor AI-assistenten (ChatGPT/Codex en Claude)

Twee assistenten werken tegelijk aan dit spel, op dezelfde branch
(`claude/continue-updates-o6whr4`, PR #329). Deze afspraken houden het werk van
de een heel als de ander pusht.

## Voor je begint en voor je pusht

1. Haal eerst de laatste stand op: `git fetch origin` en daarna
   `git merge --ff-only origin/claude/continue-updates-o6whr4` (of een gewone
   merge als je al eigen commits hebt).
2. Nooit `git push --force`, nooit rebasen of amenden van commits die al gepusht
   zijn. Bij een geweigerde push: eerst ophalen en mergen, dan opnieuw pushen.
3. Kleine, losse commits per onderwerp, en meteen pushen als ze klaar en getest
   zijn. Lang ongepusht werk is de grootste bron van conflicten.

## Code van de ander

- Breid uit in plaats van te herschrijven. Een bestand dat de ander recent heeft
  aangepast (`git log -3 -- <bestand>`): alleen het nodige veranderen, en in de
  commit uitleggen waarom.
- Gedrag van de ander niet stilletjes terugdraaien. Is iets echt fout, repareer
  het dan gericht en noem de oorzaak in de commit.
- Nieuwe functionaliteit liefst in een eigen module (`src/systems/...`), aangehaakt
  met de gebruikelijke wrapper (`const base = fn; fn = function (...) { ... }`).

## Laden en cache

- Het spel is `play.html`; `index.html` is het startmenu. Nieuwe scripts komen in
  `play.html`.
- Verander je een script, verhoog dan zijn `?build=`-parameter in `play.html`
  (of in `src/foundation/legacy-facades.js` voor de scripts die daar laden), anders
  ziet de browser de oude versie.
- Online (Vercel en GitHub Pages) voegt `scripts/bundle-play.js` de scripts van
  `play.html` samen tot een paar bundels; in de repository en de tests blijven ze
  los. Een script dat een naam van een later script noemt (ook in `typeof`)
  begint vanzelf een nieuwe bundel, dus de laadvolgorde blijft zoals in `play.html`.
  Houd scripts strict (`'use strict'` bovenaan), anders laadt het los.

## Testen voor een push

- `npm run test:fast` (audit en headless tests).
- De gerichte browsertests:
  `git status --short | awk '{print $2}' | node scripts/select-focused-tests.js`
  en die lijst draaien met `npx playwright test <bestanden> --project=chromium`.
- Raakt het gevecht of de beweging: ook `tests/golden-battle-v1.spec.js`,
  `tests/golden-battle-combat-v11.spec.js` en `tests/movement-coverage.spec.js`.
- Een test nooit uitschakelen of overslaan om groen te krijgen.

## Prestaties

- Het spel moet grote veldslagen (300-400 man) vloeiend draaien. Per eenheid per
  simulatiestap (60 per seconde) zo weinig mogelijk werk: geen scans over alle
  eenheden (gebruik `combatBuckets` of de ruimtelijke index), en zoek doelen niet
  vaker dan nodig (`src/systems/performance/target-search-cadence-v1.js` houdt een
  doel 0,1 s vast).
- Tekenen: plaatjes via `drawScenery`/`drawSprite` in
  `src/systems/rendering/iso-view-v1.js`, zodat de caches ze gebruiken. Geen
  `getImageData` per frame.
