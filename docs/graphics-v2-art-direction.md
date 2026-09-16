# GRAPHICS-V2 art direction

## Goal
Move the browser RTS toward the approved master keyframe: a high-angle 2.5D Napoleonic battlefield with warm historical daylight, muted natural terrain, readable regiment silhouettes, soft contact shadows, organized formations, restrained smoke and visually distinct French/British forces.

This document is the art-direction contract. Rendering work may improve presentation but must not take authority over gameplay, movement, facing, targeting or formation state.

## Visual pillars

1. **Readable regiments first** — formations must remain legible at normal strategy zoom.
2. **Warm muted 1815 palette** — natural grass, dirt, wood, stone and smoke; avoid oversaturation.
3. **2.5D depth without gameplay drift** — keep simulation coordinates authoritative; rendering adds depth, not new physics.
4. **Soft grounded shadows** — units, cavalry, artillery, trees and buildings should sit on the terrain rather than float.
5. **Historically inspired silhouettes** — shakos, muskets, horses, guns, flags and crew proportions should read clearly without over-detailing.
6. **Terrain supports gameplay** — roads, fields, trees and settlements enrich the scene but cannot hide formation fronts or order feedback.
7. **Atmosphere, not obstruction** — musket/cannon smoke may add depth but must preserve target and formation readability.

## Reference composition
The approved master look contains:
- high-angle strategy camera;
- French line infantry in blue/white;
- British line infantry in red/white;
- cavalry and artillery as clearly different silhouettes;
- grassland with dirt roads, field wear, stream/bridge, scattered trees and a compact hamlet;
- soft warm daylight from the upper-left region of the scene;
- smoke puffs that are locally dense but leave the battlefield readable;
- organized regiment spacing with clear facing.

## GRAPHICS-V2 sequence

- **GFX-01 Style foundation**: palette, atmosphere, terrain variation, contact shadows, load the existing staged 3D visual-detail stack.
- **GFX-02 Terrain materials**: grass variation, road edge/wheel wear, mud/dry decals, field patches.
- **GFX-03 Infantry presentation**: detailed French/British infantry silhouettes, stable 8-direction facing/readability where sprite assets are introduced.
- **GFX-04 Cavalry + artillery**: role-specific silhouettes and crew readability.
- **GFX-05 Smoke/VFX**: layered musket/cannon smoke, muzzle flash and dust with strict visibility budget.
- **GFX-06 Scenery**: trees, fences, carts, buildings and battlefield props with shared lighting/palette.
- **GFX-07 Golden visual scenes**: fixed camera/seed captures for road turn, approach, deploy, first attack and reform.

## First vertical-slice acceptance criteria
- 3D battlefield loads without uncaught page/console errors.
- Existing 3D detail layers load successfully and remain performance-budget aware.
- Terrain is no longer a visually flat single-color field at strategy zoom.
- Units receive soft contact shadows without changing simulation positions.
- French/British/regiment-facing readability remains intact.
- 2D fallback remains available and unchanged.
- No movement, combat, targeting, navigation or formation-authority code is changed by GRAPHICS-V2.

## Asset policy
Generated or third-party image assets must have known usage rights and an explicit source/license record before entering production. Prefer transparent, consistent-scale, fixed-camera assets. Until final sprites/textures are ready, procedural Three.js presentation is an acceptable bridge as long as it follows this art-direction contract.
