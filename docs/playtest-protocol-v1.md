# North Star 10-Minute Playtest Protocol v1

Use this protocol whenever the North Star battle is materially changed and before a renderer KEEP/STOP decision.

## Setup

Use a fixed scenario/seed where possible. The battle should include road movement, at least one bridge/chokepoint, a village approach, infantry, cavalry, artillery and enough time to reach deployment/contact/reform.

Record exact commit/PR, renderer mode, viewport/device profile and whether the run is Production, Vercel Preview or local/test harness.

## 10-minute checklist

1. Within the first minute, can a player select a regiment, issue a move, set facing and understand the current formation without outside explanation?
2. Do units follow roads and leave them naturally without weave, stalls or formation explosion?
3. Does a bridge/chokepoint crossing complete without deadlock, oscillation, invalid stacking or teleport recovery?
4. On enemy approach, is march -> deploy -> engage visually and behaviourally understandable?
5. Are infantry, cavalry and artillery roles distinguishable and credible at game scale?
6. Are smoke, terrain, shadows and UI helpful rather than obscuring fronts, orders or targets?
7. Are camera/zoom and selection reliable on desktop and representative mobile landscape?
8. Are there any blank/flicker frames, uncaught errors, obvious frame hitches or input double-fires?
9. Does the battle produce a clear, understandable outcome rather than dissolving into target/state jitter?
10. After disengage/crossing/contact, do formations reform coherently?

## Outcome

Classify the session:
- PASS: core loop is understandable and no blocker was observed.
- PASS WITH DEBT: playable but one or more AMBER issues should be queued.
- FAIL: a RED blocker or major feel/visual regression exists.

Every FAIL must produce either a deterministic reproduction or a compact bug-capture record following `docs/replay-bug-capture-v1.md`.

## Notes format

Keep notes compact:

`timestamp | phase | observed behaviour | expected behaviour | severity | reproducibility`

Do not fix during the playtest unless the run is already invalid. Finish the run first so secondary symptoms are not lost.
