# Test architecture

Napoleonic RTS uses a layered test strategy so most regressions are rejected before an expensive browser run starts.

## Gate 1 — fast headless simulation

Run:

```bash
npm run test:fast
```

These tests use Node's built-in test runner and `tests/headless/harness.js`. They can load real production scripts in an isolated VM context with deterministic random numbers and only the minimum game globals required by that subsystem.

Use this gate for pure or mostly-pure game logic: speed models, formation math, bridge/crossing geometry, route scoring, state machines, combat formulas, AI decisions and fixed-step scenarios. Prefer a fixed 60 Hz simulation and deterministic seeds.

A scenario that represents tens of seconds of game time should normally complete in milliseconds or low hundreds of milliseconds. Do not add sleeps or rendering to headless tests.

## Gate 2 — focused browser integration

Use Playwright when the test genuinely depends on browser integration, global script load order, input handling, canvas/render integration or the debug/test adapters.

Keep simulation work inside a single `page.evaluate` whenever practical. Avoid a loop that alternates `RTS_SIM.step(...)` and a separate `page.evaluate(...)` on every frame; hundreds of browser round-trips can turn a fast simulation into a 30-second timeout.

## Gate 3 — full regression suite

Before merge, run the complete Chromium regression suite. This remains the release gate while legacy subsystems are being migrated.

As Architecture v2 grows, move deterministic game-logic assertions from Playwright into Gate 1. Browser tests should increasingly become integration/smoke tests rather than the primary place where simulation logic is validated.

## Scenario rules

New gameplay fixes should normally add a deterministic regression scenario before or with the fix. A scenario should state its start state, command, simulation duration or stop condition, and measurable acceptance criteria such as progress, maximum stall time, formation error, crossing width, damage result or final state.

For geometry-sensitive behaviour such as bridges, use parameter sweeps rather than one lucky angle. The headless harness exposes `sweep(...)` specifically so a crossing can later be tested at many approach angles and unit types cheaply.

## CI order

The GitHub Pages workflow runs headless tests immediately after Node setup and before npm/Chromium installation. If core logic is broken, CI fails early. Only a green fast gate proceeds to the heavier browser suite and, on `main`, deployment.
