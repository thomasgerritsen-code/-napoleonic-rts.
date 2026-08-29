# Napoleonic RTS Architecture v2

Baseline: **v0.7.1** (`29b038d3655d05be968bff6a80cb8f3162f1c8e8`)

## Status

- ✅ Foundation runtime, config, contracts en subsystem registry
- ✅ Stabiele facades voor movement, formation, navigation, AI, combat en simulation
- ✅ Architecture guard tegen nieuwe `v072+` globale patchlagen
- ✅ AI production en AI tactics fysiek losgemaakt van combat
- ⏭ Movement + formation consolidatie
- ⏭ Roads + navigation consolidatie
- ⏭ Artillerie als samengestelde gameplay-unit
- ⏭ Combat/morale en read-only rendering

## Doel

Nieuwe gameplayontwikkeling mag niet langer worden toegevoegd als een volgende globale versiepatch (`v072.js`, `v073.js`, enz.). De bestaande v0.7.1 patchketen blijft tijdelijk bevroren als compatibiliteitslaag en wordt vervolgens per subsystem vervangen.

## Regels

1. **Gedrag eerst behouden.** Iedere migratiestap moet de bestaande Playwright regressies blijven doorstaan.
2. **Een eigenaar per verantwoordelijkheid.** Movement verplaatst, formation berekent slots, navigation maakt routes, roads classificeert weggebruik, combat behandelt gevechten, AI production produceert, AI tactics geeft orders, rendering tekent alleen.
3. **Geen directe cross-system mutaties.** Nieuwe subsystemen communiceren via publieke API's of de foundation eventbus.
4. **Geen nieuwe versiepatchbestanden.** Nieuwe functionaliteit gaat naar een bestaand of nieuw domeinsubsystem. De test-suite bewaakt dit automatisch.
5. **Configuratie buiten logica.** Nieuwe tuningwaarden horen in de centrale configlaag en niet verspreid in featurecode.
6. **Expliciete states.** Bataljons gebruiken de gedefinieerde state machine in plaats van nieuwe combinaties van losse booleans.
7. **Simulatie is leidend.** Rendering mag authoritative state niet wijzigen.
8. **AI-productie en tactiek zijn onafhankelijk.** `src/ai/production.js` bezit bouwen, trainen en regimentvorming; `src/ai/tactics.js` bezit militaire orders. Combat bezit geen productie- of attack-planningcode meer.
9. **Nieuwe code gebruikt subsystem-facades.** Tijdens de migratie wijzen `movement`, `formation`, `navigation`, `ai-production`, `ai-tactics`, `combat` en `simulation` naar compatibele implementaties. Daardoor kunnen implementaties één voor één worden vervangen zonder alle callers opnieuw te wijzigen.

## Doelstructuur

```text
src/
  foundation/
    runtime.js
    config.js
    contracts.js
    legacy-manifest.js
    legacy-facades.js
  core/
    game-state.js
    game-loop.js
    commands.js
  world/
    map.js
    terrain.js
    roads.js
    navigation.js
  units/
    battalion.js
    artillery-battery.js
  systems/
    movement.js
    formation.js
    road-movement.js
    combat.js
    morale.js
  ai/
    production.js      # actief
    strategy.js
    tactics.js         # actief
  rendering/
    renderer.js
  input/
    orders.js
  debug/
    diagnostics.js
```

## Migratievolgorde

1. Foundation/runtime, contracten en stabiele facades. **Gereed.**
2. AI production en tactics uit combat halen. **Gereed.**
3. Movement + formation consolideren uit `v06x/v07x`.
4. Roads + navigation consolideren.
5. Artillerie als samengestelde gameplay-unit consolideren.
6. Combat/morale verder consolideren.
7. Rendering volledig read-only maken.
8. Oude patchbestanden per subsystem verwijderen zodra regressies groen blijven.
9. Pas daarna nieuwe features toevoegen.

## Definition of done per migratiestap

- Bestaande algemene RTS-tests groen.
- Bestaande v0.6.7–v0.7.1 regressies groen, inclusief battalion speed parity.
- Geen nieuwe page errors/unhandled rejections.
- Geen nieuwe `v0xx-*.js` featurepatch.
- Nieuwe subsystemverantwoordelijkheid gedocumenteerd en geregistreerd.
- Nieuwe callers gebruiken het subsystem-register in plaats van historische functienamen.
