# Napoleonic RTS Quality Scorecard v1

The scorecard exists to make prioritisation evidence-driven. Scores are never based on commit count or effort spent; they reflect current product evidence from deterministic tests, Vercel Preview runtime, visual captures and playtests.

## Dimensions

Each dimension is recorded as RED / AMBER / GREEN plus evidence links or commit/PR references.

- Playability: selection, orders, formations, camera and battle flow work without blockers.
- Movement feel: route completion, road/bridge flow, turning, cohesion, overlap, stalls and reforming.
- Combat clarity: approach/deploy/engage/reform state is understandable; roles behave sensibly; no target ping-pong or hidden state churn.
- Visual quality: approved Art Bible, Golden Battlefield comparison, unit readability, terrain hierarchy, VFX clarity and visual stability.
- Mobile UX: landscape core loop, portrait fallback, no gesture ghost-orders, readable HUD and acceptable touch targets.
- Performance: frame/update/draw p95, 520-unit Game Health, larger stress scenario and renderer-specific budgets.
- Audio feel: music/ambience/foley clarity, musket/cannon impact, no clipping or fatiguing repetition; initially AMBER until a production audio slice exists.
- Runtime stability: no blank/flicker, uncaught errors, broken CDN/dependency fallback or stale Preview evidence.
- Maintainability: authority boundaries respected, no duplicated state machines, small PRs, manageable technical debt.

## Evidence precedence

1. Reproducible automated replay/test evidence.
2. Exact-head Vercel Preview runtime evidence.
3. Golden screenshots / visual diff.
4. Structured 10-minute playtest notes.
5. Telemetry from real sessions.
6. Developer judgement when stronger evidence is unavailable.

## Decision rule

The Director should choose the next task from the weakest high-impact dimension that blocks the North Star battle. A RED runtime/bridge/core-order issue outranks cosmetic work. A visual or feel issue can outrank a numerically small technical debt item when it is the main player-visible gap.

## Suggested thresholds

- GREEN: no known blocker, current acceptance tests pass, and no material visual/playtest regression.
- AMBER: playable but incomplete, uncertain, or a known moderate regression/debt item remains.
- RED: blocks the North Star core loop, repeatedly fails a required gate, or has a material player-visible regression.

## Reporting template

For each Director/Integrator cycle record only changed dimensions:

`dimension | status | evidence | delta | next action`

Do not convert subjective judgements into fake precision. Prefer RED/AMBER/GREEN with a short evidence statement over unsupported numeric scores.
