# Napoleonic RTS Architecture v2

Baseline: **v0.7.1** (`29b038d3655d05be968bff6a80cb8f3162f1c8e8`)

## Status

- ✅ Foundation runtime, config, contracts en subsystem registry
- ✅ Stabiele facades voor movement, formation, navigation, AI, combat en simulation
- ✅ Architecture guard tegen nieuwe `v072+` globale patchlagen
- ✅ AI production en AI tactics fysiek losgemaakt van combat
- ✅ Movement + formation geconsolideerd in Architecture v2
- ✅ Road lookup + network route planning geconsolideerd in Architecture v2
- ✅ Finale v0.7.1 bridge/crossing guidance onder navigation-eigenaarschap, inclusief anti-stall bij brughoeken
- ⏭ Water/traffic rendering-adapters verder uit de historische bestanden halen
- ⏭ Artillerie als samengestelde gameplay-unit
- ⏭ Combat/morale en read-only rendering

## Doel

Nieuwe gameplayontwikkeling mag niet langer worden toegevoegd als een volgende globale versiepatch (`v072.js`, `v073.js`, enz.). De bestaande v0.7.1 patchketen blijft tijdelijk bevroren als compatibiliteitslaag en wordt vervolgens per subsystem vervangen.

## Regels

1. **Gedrag eerst behouden.** Iedere migratiestap moet de bestaande Playwright regressies blijven doorstaan.
2. **Een eigenaar per verantwoordelijkheid.** Movement verplaatst, formation berekent slots, navigation maakt routes en crossing-corridors, roads classificeert weggebruik, combat behandelt gevechten, AI production produceert, AI tactics geeft orders, rendering tekent alleen.
3. **Geen directe cross-system mutaties.** Nieuwe subsystemen communiceren via publieke API's of de foundation eventbus.
4. **Geen nieuwe versiepatchbestanden.** Nieuwe functionaliteit gaat naar een bestaand of nieuw domeinsubsystem. De test-suite bewaakt dit automatisch.
5. **Configuratie buiten logica.** Nieuwe tuningwaarden horen in de centrale configlaag en niet verspreid in featurecode.
6. **Expliciete states.** Bataljons gebruiken de gedefinieerde state machine in plaats van nieuwe combinaties van losse booleans.
7. **Simulatie is leidend.** Rendering mag authoritative state niet wijzigen.
8. **AI-productie en tactiek zijn onafhankelijk.** `src/ai/production.js` bezit bouwen, trainen en regimentvorming; `src/ai/tactics.js` bezit militaire orders. Combat bezit geen productie- of attack-planningcode meer.
9. **Nieuwe code gebruikt subsystem-API's.** `movement`, `formation`, `navigation`, `ai-production`, `ai-tactics`, `combat` en `simulation` vormen de stabiele grenzen voor nieuwe callers.
10. **Bruggen zijn corridors, geen punten.** Een oversteek gebruikt een uitlijnpunt, entry/exit-portals en een expliciete clear-fase. Hierdoor mag een unit niet diagonaal door een brughoek proberen te snijden.

## Actieve structuur

```text
src/
  foundation/
    runtime.js
    config.js
    contracts.js
    legacy-manifest.js
    legacy-facades.js
  ai/
    production.js
    tactics.js
  systems/
    movement/
      state.js
      fixed-step.js
      speed-model.js
      api.js
    formation/
      followers.js
    navigation/
      road-index.js
      route-planner.js
      bridge-corridors.js
      bridge-safety.js
      api.js
```

De historische `v067.js`/`v068.js` bestanden leveren voorlopig nog water/crossing-data, traffic-compatibiliteit en rendering. De uiteindelijke v0.7.1 route- en bridge-guidance wordt echter door `systems/navigation` bepaald.

## Migratievolgorde

1. Foundation/runtime, contracten en stabiele facades. **Gereed.**
2. AI production en tactics uit combat halen. **Gereed.**
3. Movement + formation consolideren. **Gereed.**
4. Roads + navigation consolideren. **Gereed voor authoritative route/runtime; historische water/traffic rendering-adapters blijven tijdelijk.**
5. Artillerie als samengestelde gameplay-unit consolideren.
6. Combat/morale verder consolideren.
7. Rendering volledig read-only maken.
8. Oude compatibiliteitsbestanden per subsystem verder verwijderen zodra regressies groen blijven.
9. Pas daarna nieuwe features toevoegen.

## Definition of done per migratiestap

- Bestaande algemene RTS-tests groen.
- Bestaande v0.6.7–v0.7.1 regressies groen, inclusief battalion speed parity.
- Geen nieuwe page errors/unhandled rejections.
- Geen nieuwe `v0xx-*.js` featurepatch.
- Nieuwe subsystemverantwoordelijkheid gedocumenteerd en geregistreerd.
- Nieuwe callers gebruiken het subsystem-register in plaats van historische functienamen.
- Voor navigation: diagonale bridge-corner scenario's mogen niet langdurig stallen en losse units moeten de exit-portal vrijmaken vóór zij de corridor verlaten.
