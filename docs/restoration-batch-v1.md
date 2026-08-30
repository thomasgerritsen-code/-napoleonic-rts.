# Restoration Batch V1

This pre-merge batch restores lost battlefield/gameplay behavior while keeping new work inside Architecture V2.1 subsystem boundaries.

## Ownership

- `world/ecology-v1.js`: resource placement and village/building exclusion.
- `world/gameplay-building-scale-v1.js`: gameplay-building footprint scale.
- `rendering/map-realism.js`: final terrain, river, crossings and active-road visuals.
- `rendering/natural-resources-v1.js`: tree and berry visuals only.
- `rendering/characters.js`: infantry, officers, drummers, workers and cavalry visuals only.
- `rendering/artillery-topdown-v1.js`: cannon/crew visuals only.
- `artillery/crew-approach-v1.js`: crew joining state and operation gating.
- `input/formation-drag-v1.js`: box-selection/facing drag input authority.
- `ai/authority-v2.js`: final post-legacy AI development and military authority.
- `movement/stuck-recovery-v1.js`: exceptional non-progress recovery only.

## Invariants protected by browser regression

1. Trees and berry bushes do not overlap gameplay buildings or village structures.
2. Berry bushes are excluded from village envelopes.
3. Rivers and legal crossings are drawn by the final terrain renderer.
4. Rendering uses the same active V7 road network as navigation.
5. Road junctions are rendered as continuous surfaces rather than stacked seams.
6. Human/cavalry/artillery visuals use orthographic top-down projection.
7. Artillery crews walk from their current position to their cannon before attachment and operation.
8. Long battalion movement retains strategic-road routing.
9. Drag commands retain explicit final facing.
10. Final AI development/military functions survive the legacy script stack.
11. Stuck recovery is exceptional and does not replace normal formation locomotion.

## Tuning policy

All new numeric tuning values live under `NRTS_CONFIG`. Feature modules consume config instead of adding new magic-number patch layers. This keeps future updates fast and prevents behavior from being scattered across historical version files.
