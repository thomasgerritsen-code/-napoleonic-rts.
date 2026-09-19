# GRAPHICS-V2 Art Bible

## Goal
Move the browser RTS toward the approved master keyframe: a high-angle 2.5D Napoleonic battlefield with warm historical daylight, muted natural terrain, readable regiment silhouettes, soft contact shadows, organized formations, restrained smoke and visually distinct French/British forces.

This document is the visual production contract. Rendering may improve presentation and adapt pointer input, but must never take authority over gameplay, movement, position, facing, targeting, engagement or formation state.

## Visual pillars
1. **Readable regiments first** — formations must remain legible at normal strategy zoom.
2. **Warm muted historical palette** — natural grass, dirt, wood, stone and smoke; avoid oversaturation.
3. **2.5D depth without gameplay drift** — simulation coordinates remain authoritative.
4. **Soft grounded shadows** — units, cavalry, artillery, trees and buildings must sit on the terrain rather than float.
5. **Historically inspired silhouettes** — shakos, muskets, horses, guns, flags and crew proportions should read clearly without excessive micro-detail.
6. **Terrain supports gameplay** — roads, fields, trees and settlements enrich the scene but cannot hide formation fronts or order feedback.
7. **Atmosphere, not obstruction** — smoke and flashes add depth while preserving target and formation readability.

## Fixed visual rules
- Camera: high-angle RTS / 2.5D view; no cinematic low-angle framing in normal play.
- Scale: all unit classes use one stable world-to-visual scale system. Cavalry/artillery may have larger silhouettes but cannot be arbitrarily rescaled per scene.
- Light: principal daylight comes from the upper-left of the visual composition.
- Shadows: soft, low-contrast contact shadows fall consistently away from the upper-left light. Shadows never encode gameplay state.
- Factions: French line infantry is primarily blue/white; British line infantry is primarily red/white. Faction recognition must survive normal play zoom.
- Facing: unit assets must be architected for 8 directions: N, NE, E, SE, S, SW, W, NW.
- Anchor: sprite/visual footpoint is the authoritative simulation x/y location. Rotations and cosmetic offsets must not move the gameplay footprint.
- Animation: cadence must be stable between units in the same role; avoid hyperactive idle motion and frame-to-frame silhouette jumps.
- Terrain contrast: ground remains lower contrast than units and order feedback.
- VFX: muzzle flash is brief; smoke expands/fades and may drift subtly, but must not produce long-lived opaque walls over contact fronts.
- Selection/order feedback: readable above terrain and below critical unit silhouettes where practical; no excessive glow or neon palette.

## Reference composition
The approved master look contains:
- high-angle strategy camera;
- French line infantry in blue/white;
- British line infantry in red/white;
- cavalry and artillery as clearly different silhouettes;
- grassland with dirt roads, field wear, stream/bridge, scattered trees and a compact hamlet;
- soft warm daylight from the upper-left;
- smoke puffs that are locally dense but leave the battlefield readable;
- organized regiment spacing with clear facing.

## Asset contract
Production unit assets should follow this path:
`master reference -> source asset -> cleanup -> 8-direction-ready frames -> atlas/metadata -> anchor/scale check -> integration -> golden capture`.

Requirements:
- transparent background for sprite assets;
- consistent camera and light across all facings;
- explicit anchor/footpoint metadata;
- consistent scale between factions for equivalent unit roles;
- no baked selection circles, UI, text or terrain in unit sprites;
- known source/license record before production use;
- deterministic file naming and atlas metadata where possible.

Initial unit state target: idle, march and fire for line infantry. Reload, melee, routing and death are later additions after the first vertical slice proves the pipeline.

## GRAPHICS-V2 sequence
- **GFX-01 Style foundation**: palette, atmosphere, terrain variation, contact shadows and stable renderer toggle/fallback.
- **GFX-02 Terrain materials**: grass variation, road edge/wheel wear, mud/dry decals, field patches.
- **GFX-03 Infantry presentation**: French/British infantry with 8-direction-ready architecture.
- **GFX-04 Shadows + VFX**: consistent shadows, musket/cannon smoke, muzzle flash and dust within visibility budget.
- **GFX-05 Cavalry + artillery**: role-specific silhouettes and crew readability.
- **GFX-06 Scenery**: trees, fences, carts, buildings and battlefield props with shared lighting/palette.
- **GFX-07 Golden Battlefield**: fixed deterministic visual scene and captures.

## Golden Battlefield contract
The fixed visual QA scene must contain French line infantry, British line infantry, cavalry, artillery + crew, road/road exit, bridge or chokepoint, trees/vegetation, at least one building and musket/cannon smoke.

Capture points:
1. road turn/exit;
2. approach;
3. deploy;
4. first attack;
5. reform.

Graphics changes also require representative desktop and mobile captures. A build is **ONBESLIST** when automated metrics are green but visual comparison shows worse readability, flicker, blank frames, inconsistent scale/shadows or a clear step away from the master reference.

## Performance contract
- 520-unit Game Health remains mandatory.
- Track frame/update/draw p95 when renderer work changes cost.
- Use a larger stress scenario to catch scaling regressions when relevant.
- Track sprite/particle count and texture memory where tooling exposes them.
- Do not trade away core input responsiveness or battlefield readability for cosmetic density.

## Renderer decision
PixiJS PR #133 is the current browser GRAPHICS-V2 candidate. Compare it to the existing Three.js/2D paths on visual quality, desktop/mobile performance, runtime stability, asset-production speed and maintenance complexity. Record an explicit **KEEP** or **STOP** decision within two days of the evaluation start, or earlier when evidence is sufficient. Until then, avoid new cosmetic Three.js expansion; fixes and safety/regression work remain allowed.

## First vertical-slice acceptance criteria
- Pixi battlefield loads only when enabled and fails back cleanly.
- No uncaught page/console errors, blank frames or canvas resets.
- Terrain is no longer a visually flat single-color field at strategy zoom.
- French/British regiment and facing readability remains intact.
- Soft shadows are consistent with upper-left lighting.
- The render layer changes no movement, combat, targeting, navigation or formation authority.
- Existing fallback renderer remains available until the renderer decision is complete.
- Golden Battlefield desktop/mobile captures show a clear visual improvement over the approved previous baseline.

## Stop rule
If a visual or renderer approach receives 2–3 serious iterations without a clear measurable or visible improvement, document it as BLOCKED/STOP and test an alternative instead of continuing from sunk cost.
