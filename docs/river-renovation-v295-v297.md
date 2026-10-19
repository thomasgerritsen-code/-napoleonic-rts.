# River renovation roadmap (v295–v297)

This plan separates placement correctness, authoritative geometry and visual animation so the existing four-file road/bridge pathfinding cannot silently regress.

## v295 – keep buildings on land (PR #290)
**Authority:** `src/systems/world/village-collision-v4.js`.
- Add a `clearOfRiver(candidate, plotRadius)` constraint in `safeCandidate()`.
- Normalize *after* scaling so roof and entire garden are dry, and before navigation and drawing read immutable canonical houses.
- In `src/systems/world/building-placement.js`, add `clearOfRiver(type,x,y)` to `clearPlacement()` and to the existing safe candidate search.
- In `src/systems/rendering/battlefield-3d-bridge-v1.js`, change `cloneVillages()` to read canonical V4 (not pre-normalized V6) and relocate 3D-only houses away from water/bridge decks.
- Verify in `tests/dry-village-footprints-v295.spec.js` that all houses/plots are dry after multiple resets, a new house cannot be placed on a bridge, and 3D uses the dry village list.
- **Exit criteria**: zero scenery/gameplay buildings touching raw river + shore margin; no failed bridge/column tests, no ghost obstacles.

## v296 – one shared continuous river curve
**Authority:** `src/v067.js` river functions; add `src/systems/world/river-geometry-v296.js` only if it can load before every consumer (otherwise keep in v067).
- Keep `RIVER_POINTS_V067` and `WATER_CROSSINGS_V067` as preserved anchors, including crossing positions and road nodes. Do **not** change road graph / route APIs.
- Derive a sampled monotone-y cubic Hermite/Catmull–Rom curve, clamped to a small lateral offset and required to pass through crossing anchors, then define `riverCenterAt(y)`, `riverTangentAt(y)`, `riverDistanceAt(x,y)`, `riverBankAt(x,y)`.
- Migrate `riverHitV067()`, `riverCenterXAtYV067()`, `waterAtV067()`, and `segmentWaterCrossingV067()` together to the same geometry. No renderer-only curvature that would let units walk through visually wet ground.
- Initially keep the authoritative navigation half-width `RIVER_NAV_HALF_WIDTH_V067` and exact crossing envelopes unchanged. Vary scenic inner water width subtly without widening into walkable terrain; treat the outer channel as muddy wet banks.
- Update `drawRiverV067()` and `drawMinimap` to use the same smooth polyline samples. Update `src/systems/world/ecology-v1.js` and building/village shoreline checks as needed to use the same continuous river query.
- **Tests:** per-crossing orientation/coordinates remain valid; channel continuous; minimum turn radius; river distance symmetric; safe bank positions; legal five crossings; 4-wide formations and road preference stable.

## v297 – visual flowing river and natural banks
**2D:** `src/systems/rendering/map-realism.js`, possibly a dedicated `src/systems/rendering/river-surface-v297.js`.
- Layer irregular silt/gravel margins, semi-transparent shallow water, green-brown deep water, gentle bank shadows, limited sand on inside bends and subtle erosion under outside banks.
- Flow noise/ripple streaks animated along the local river tangent, *not* straight across the river. Use `elapsed` and seeded shapes for frame-deterministic animations, and cap particles to the camera viewport.
- Eddies/ripples near bridge supports, restrained foam and environmental noise; avoid high-contrast white stripes.

**3D:** `src/systems/rendering/battlefield-3d-v1.mjs` (or separate addon).
- Generate one low-depth ribbon mesh from the exact same sampled curve; render bank shoulders with mild downward profile. Animate texture coordinates or simple shader UV drift using local tangents.
- Keep the number of meshes/draw calls fixed; mobile fallback uses fewer segments/ripples, no per-frame new geometries.

**Regression and performance:** `tests/water-v067.spec.js`, `tests/road-vegetation-clearance-v1.spec.js`, new river geometry/animation tests, and unchanged `tests/bridge-column-autosim-v279.spec.js`. Test river shading at two distinct simulation times; 2D/3D water boundaries agree within a documented tolerance; crossings remain visible and accessible; memory and 520-unit stress gates green.

**Rule:** do not merge any geometry change without the full bridge/column/movement suite, and do not add scheduled developer jobs.
