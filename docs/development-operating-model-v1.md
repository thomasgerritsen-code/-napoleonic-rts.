# Napoleonic RTS Development Operating Model v1

## North Star build
The primary product target is one polished 10–15 minute battle that feels complete before expanding scope. It should contain 2–4 regiments per side, roads, at least one bridge/chokepoint, a compact village, infantry, cavalry and artillery. New features are secondary unless they directly improve this battle or remove a blocker.

## Authority contract
- Gameplay/AI owns intent and state: march, approach, deploy, engage, disengage/reform, targets, role decisions and morale/routing.
- Movement/Simulation owns physical execution: route/corridor, speed, acceleration, turning/facing convergence, formation anchors/slots, spacing, traffic, collision, bridge/chokepoint flow and regrouping.
- Rendering owns presentation and input adaptation only. It must not correct or override authoritative position, facing, targeting or engagement state.

## Browser renderer decision
PixiJS PR #133 is the current GRAPHICS-V2 candidate. Compare Pixi against the current Three.js/2D stack on:
1. visual quality versus the approved 2.5D keyframe;
2. desktop and mobile performance;
3. runtime stability and fallback behaviour;
4. asset-production speed and consistency;
5. implementation and maintenance complexity.

Record an explicit KEEP or STOP decision within two days of starting this evaluation, or earlier when evidence is sufficient. Until then, do not expand Three.js cosmetically; only accept required fixes, safety work and regression repairs.

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
Maintain one deterministic visual test scene containing:
- French line infantry;
- British line infantry;
- cavalry;
- artillery + crew;
- road/road exit;
- bridge or chokepoint;
- trees/vegetation;
- one or more buildings;
- musket/cannon smoke.

Capture stable comparison frames at road turn/exit, approach, deploy, first attack and reform. Graphics work also captures desktop and representative mobile landscape/portrait views. A numerically green build with a visibly worse result is not green.

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

Automate naming, atlas metadata, anchors and scale checks where practical. Keep source/license records for generated and third-party production assets.

## Change sizing
Prefer one coherent subject per PR. Examples: terrain materials, infantry presentation, smoke/VFX, cavalry/artillery, scenery/props, one movement root cause, or one gameplay-state issue. Avoid broad mixed overhauls because they obscure regressions and make rollback harder.

## Three-gate merge rule
For browser-facing gameplay, movement and graphics changes, all applicable gates are required:
1. functional/CI tests;
2. exact-head Vercel Preview runtime evidence;
3. visual comparison evidence.

A Vercel deployment success alone proves deployment, not runtime or visual quality.

## Stop rule
If the same approach receives 2–3 serious iterations without measurable or visible improvement, mark it BLOCKED/STOP, document the evidence and choose another approach. Do not continue because of sunk cost.

## Priority order
1. runtime/CI/flicker/blank-frame blockers;
2. bridge/mobile/core-order regressions;
3. Movement-Contact correctness and visual feel;
4. Pixi/renderer decision and North Star visual slice;
5. performance regressions;
6. polish inside the North Star build;
7. new features.

The definition of progress is a more convincing, reliable and playable North Star battle—not simply more code, commits or subsystems.
