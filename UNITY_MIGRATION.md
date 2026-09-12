# Native Unity migration

The browser game remains the reference implementation and stays deployable. The native version lives in `unity/NapoleonicRTS` and is being built in parallel.

## Target

- Unity 6.3 LTS.
- 2D/2.5D battlefield first; no forced 3D rewrite.
- Authoritative fixed-step simulation remains separate from rendering.
- No GameObject-per-soldier architecture.
- Unit state is compact C# data and is rendered in GPU-instanced batches.
- Regiments remain the command/navigation level; soldiers remain formation followers.
- Browser behavior is migrated feature-by-feature with parity tests before replacement.

## Migration order

1. Native fixed-step simulation + GPU-instanced prototype with 1,000 units.
2. Selection, camera and formation orders.
3. Roads, route planning and bridge traffic.
4. Combat, morale, artillery and smoke.
5. AI/economy and map authoring/import.
6. Rendering upgrades (animation, terrain, lighting, 2.5D) only after simulation parity.

The pure simulation layer deliberately has no `UnityEngine` dependency. `Tools/SimulationSmoke` compiles and exercises that same source with .NET 8 in CI.
