# Napoleonic RTS Architecture v2

Baseline: **v0.7.1** (`29b038d3655d05be968bff6a80cb8f3162f1c8e8`)

## Doel

Nieuwe gameplayontwikkeling mag niet langer worden toegevoegd als een volgende globale versiepatch (`v072.js`, `v073.js`, enz.). De bestaande v0.7.1 patchketen blijft tijdelijk bevroren als compatibiliteitslaag en wordt vervolgens per subsystem vervangen.

## Regels

1. **Gedrag eerst behouden.** Iedere migratiestap moet de bestaande Playwright regressies blijven doorstaan.
2. **Een eigenaar per verantwoordelijkheid.** Movement verplaatst, formation berekent slots, navigation maakt routes, roads classificeert weggebruik, combat behandelt gevechten, AI production produceert, AI tactics geeft orders, rendering tekent alleen.
3. **Geen directe cross-system mutaties.** Nieuwe subsystemen communiceren via publieke API's of de foundation eventbus.
4. **Geen nieuwe versiepatchbestanden.** Nieuwe functionaliteit gaat naar een bestaand of nieuw domeinsubsystem.
5. **Configuratie buiten logica.** Nieuwe tuningwaarden horen in de centrale configlaag en niet verspreid in featurecode.
6. **Expliciete states.** Bataljons gebruiken de gedefinieerde state machine in plaats van nieuwe combinaties van losse booleans.
7. **Simulatie is leidend.** Rendering mag authoritative state niet wijzigen.
8. **AI-productie en tactiek blijven onafhankelijk.** Een beëindigde of mislukte aanval mag de productiecyclus niet stoppen.

## Doelstructuur

```text
src/
  foundation/
    runtime.js
    config.js
    contracts.js
    legacy-manifest.js
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
    production.js
    strategy.js
    tactics.js
  rendering/
    renderer.js
  input/
    orders.js
  debug/
    diagnostics.js
```

## Migratievolgorde

1. Foundation/runtime en contracten.
2. Test- en debugfacade stabiliseren.
3. Movement + formation consolideren uit `v06x/v07x`.
4. Roads + navigation consolideren.
5. Artillerie als samengestelde gameplay-unit consolideren.
6. AI-productie losmaken van attack/tactical planning.
7. Combat/morale consolideren.
8. Rendering volledig read-only maken.
9. Oude patchbestanden per subsystem verwijderen zodra regressies groen blijven.
10. Pas daarna nieuwe features toevoegen.

## Definition of done per migratiestap

- Bestaande algemene RTS-tests groen.
- Bestaande v0.6.7–v0.7.1 regressies groen, inclusief battalion speed parity.
- Geen nieuwe page errors/unhandled rejections.
- Geen nieuwe `v0xx-*.js` featurepatch.
- Nieuwe subsystemverantwoordelijkheid gedocumenteerd en geregistreerd.
