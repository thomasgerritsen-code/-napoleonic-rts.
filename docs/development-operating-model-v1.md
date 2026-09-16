# Napoleonic RTS Development Operating Model v1

## North Star build
The primary product target is one polished 10–15 minute battle that feels complete before expanding scope. It should contain 2–4 regiments per side, roads, at least one bridge/chokepoint, a compact village, infantry, cavalry and artillery. New features are secondary unless they directly improve this battle, increase replayable tactical choice, or remove a blocker.

The North Star battle is the canonical product reference. Material gameplay, movement, renderer, UX and performance changes must improve it or at minimum leave it demonstrably no worse.

## Feature preservation
Previously working player-facing capabilities are protected product value. New work may not silently remove, hide, disable or materially degrade them. `docs/feature-preservation-v1.md` is the policy and `docs/feature-preservation-matrix-v1.json` is the machine-readable capability inventory.

Every material gameplay, movement, renderer, UX or refactor PR declares `PRESERVATION IMPACT: none`, `compatible change`, or `intentional retirement`. Intentional retirement is exceptional and requires an explicit product decision, reason, replacement/migration or explicit retirement rationale, updated tests/docs and Integrator approval. Absence from a replacement renderer/UI still counts as removal.

Replacement coverage must be green before superseded controls/behaviour/tests are removed. After a material merge, verify the new `main` workflow and core smoke before overlapping work starts. If an accepted capability regresses, restoring or reverting it outranks new feature work.

## Long-term product ladder
Depth is added in layers so later systems are built on stable foundations rather than hiding weak fundamentals.

1. **M1 Movement & Contact** — roads/off-road flow, formation-first movement, turning, traffic, deploy/engage/reform and bridge/chokepoint reliability.
2. **M2 Combat, Morale & Unit Roles** — understandable fire/melee/charge flow, morale/cohesion, infantry/cavalry/artillery differentiation and battle pacing.
3. **M3 North Star Battle Polish** — renderer decision, approved art pipeline, readable terrain/village, VFX, mobile UX, performance, onboarding and first production audio slice.
4. **M4 Command & Tactics** — brigade-level orders, reserves, coordinated attacks, flanking, artillery support and command friction without excessive micromanagement.
5. **M5 Replayability & Content** — additional battle setups, doctrine/faction differentiation and objectives only after the core battle is stable and fun.

Do not skip a milestone because a later feature is easier or more exciting. A later milestone may be prototyped behind a feature flag only when it does not compete with an active blocker.

## Release train
Treat milestone completions as playable releases rather than a stream of unrelated commits. Suggested product labels are:

- `0.2 Movement & Contact`
- `0.3 Combat & Morale`
- `0.4 North Star Battle`
- `0.5 Command & Tactics`
- `0.6 Replayability`

A release candidate requires the applicable Definition of Done, quality scorecard review, exact-head Preview evidence, required CI, a structured North Star playtest and a green feature-preservation baseline. Release numbering is a planning device, not a deadline promise.

## Authority contract
- Gameplay/AI owns intent and state: march, approach, deploy, engage, disengage/reform, targets, role decisions and morale/routing.
- Movement/Simulation owns physical execution: route/corridor, speed, acceleration, turning/facing convergence, formation anchors/slots, spacing, traffic, collision, bridge/chokepoint flow and regrouping.
- Rendering owns presentation and input adaptation only. It must not correct or override authoritative position, facing, targeting or engagement state.

Maintain one short architecture map of authoritative owners. When two systems appear to own the same truth, resolving that duplication outranks adding another behaviour layer.

## Experiment cap
Keep at most three risky technical experiments active at once, normally no more than one in each category:

- movement/gameplay mechanics;
- renderer/visual pipeline;
- observability/tooling.

A new experiment starts only when a slot is free or an existing route is merged, stopped or marked BLOCKED. Draft branches may exist, but they do not receive active development capacity unless they occupy an explicit experiment slot.

## Feature flags
Risky renderer, AI, pathfinding, formation or telemetry changes should remain opt-in/flagged until their exact-head Preview, deterministic tests, playtest evidence and feature-preservation evidence show they are better than the current production path. Flags are temporary safety tools, not permanent duplicate systems. Remove obsolete flags during cleanup cadence once a KEEP/STOP decision is final.

## Browser renderer decision
PixiJS PR #133 is the current GRAPHICS-V2 candidate. Compare Pixi against the current Three.js/2D stack on:
1. visual quality versus the approved 2.5D keyframe;
2. desktop and mobile performance;
3. runtime stability and fallback behaviour;
4. asset-production speed and consistency;
5. implementation and maintenance complexity.

Record an explicit KEEP or STOP decision within two days of starting this evaluation, or earlier when evidence is sufficient. Until then, do not expand Three.js cosmetically; only accept required fixes, safety work and regression repairs. The existing renderer fallback remains a protected capability until KEEP plus replacement coverage is proven.

## Art Bible
Graphics work must follow one versioned style contract:
- high-angle 2.5D strategy camera;
- consistent world/unit scale;
- warm muted historical palette;
- French and British silhouettes readable at normal play zoom;
- main light from the upper-left and consistent soft contact shadows;
- fixed sprite anchor/footpoint conventions;
- 8-direction-ready unit assets;
- stable animation cadence;
- terrain supports readability instead of overpowering units;
- smoke and flashes add atmosphere without hiding fronts, orders or targets.

The approved master keyframe is the visual reference. Assets that materially break these rules do not enter production.

## Golden Battlefield
Maintain one deterministic visual test scene containing French/British line infantry, cavalry, artillery + crew, road/road exit, bridge/chokepoint, vegetation, buildings and musket/cannon smoke.

Capture stable comparison frames at road turn/exit, approach, deploy, first attack and reform. Graphics work also captures desktop and representative mobile landscape/portrait views. A numerically green build with a visibly worse result is not green.

## Replay-first bug handling
Every material structured-playtest FAIL should become a deterministic replay, compact bug capture or reproducible scenario following `docs/replay-bug-capture-v1.md`. Prefer fixing a reproducible failure over collecting more anecdotal symptoms.

For movement/contact, keep same-seed before/after traces and classify root cause before tuning. For visuals, use stable golden captures. For runtime failures, record exact head, Preview URL/status, console/runtime evidence and browser/device conditions.

## Playtest cadence
Use `docs/playtest-protocol-v1.md` whenever:
- a milestone is approaching release-candidate status;
- a material gameplay/movement/renderer change lands;
- approximately five material player-facing PRs have merged since the last structured playtest;
- automated evidence is green but product feel remains uncertain.

The playtest output is a short ranked irritation list, not a wishlist. The highest-impact reproducible irritation feeds the next Director queue.

## Performance budget
Keep these hard protections:
- 520-unit Game Health remains mandatory;
- track frame/update/draw p95 when renderer work changes cost;
- retain a larger stress scenario for scale regressions;
- track sprite/particle counts and texture memory when available;
- no visual improvement may knowingly damage the core interaction loop without an explicit accepted trade-off.

## Asset production pipeline
Preferred pipeline:
`master reference -> source asset -> cleanup -> 8-direction-ready asset -> atlas/metadata -> anchor/scale validation -> integration -> Golden Battlefield capture`.

Automate naming, atlas metadata, anchors and scale checks where practical. Keep source/license/prompt/reference records for generated and third-party production assets according to `docs/asset-provenance-v1.md`.

## Change sizing
Prefer one coherent subject per PR. Examples: terrain materials, infantry presentation, smoke/VFX, cavalry/artillery, scenery/props, one movement root cause, or one gameplay-state issue. Avoid broad mixed overhauls because they obscure regressions and make rollback harder.

## Three-gate merge rule
For browser-facing gameplay, movement and graphics changes, all applicable gates are required:
1. functional/CI tests including affected feature-preservation evidence;
2. exact-head Vercel Preview runtime evidence;
3. visual or structured playtest evidence when the change is player-visible.

A Vercel deployment success alone proves deployment, not runtime or visual quality. Production/main is never the experiment environment.

## Stop rule
If the same approach receives 2–3 serious iterations without measurable or visible improvement, mark it BLOCKED/STOP, document the evidence and choose another approach. Do not continue because of sunk cost.

## Technical cleanup cadence
After roughly 8–10 successful feature/quality PRs, or sooner when duplicated authorities/flags/dependencies are clearly slowing work, schedule at most one small cleanup PR. Cleanup may remove obsolete flags, duplicate systems, unused dependencies and stale documentation, but never outranks an active North Star blocker or regression and must pass the same feature-preservation audit before removal.

## Priority order
1. regressions that remove/break a previously working protected feature;
2. runtime/CI/flicker/blank-frame blockers;
3. bridge/mobile/core-order regressions;
4. weakest high-impact North Star scorecard dimension;
5. current milestone blocker (currently MOVEMENT-CONTACT-V1);
6. renderer decision / visual pipeline evidence;
7. performance regressions;
8. polish inside the North Star build;
9. later-milestone depth features.

The definition of progress is a more convincing, reliable and replayable North Star battle that retains accepted player value—not more code, commits, subsystems or feature count.