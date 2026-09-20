# Definition of Done v1

A subsystem is not done because code exists or a screenshot looks good. The following evidence is required where applicable.

## Gameplay / AI
- deterministic scenario covers the intended state transition;
- no duplicate movement authority;
- target/role behaviour has regression coverage;
- no new march/engage jitter, target ping-pong or invalid role behaviour;
- exact-head CI + Preview runtime evidence is green.

## Movement / Formation
- before/after replay metrics exist;
- bridge/chokepoint hard gate is green;
- no weave, snap turns, formation explosion, stop-start cadence, teleport recovery or persistent overlap;
- 520-unit Game Health stays green;
- visual replay confirms the movement still looks military rather than merely passing assertions.

## Graphics / Renderer
- follows the current Art Bible;
- Golden Battlefield comparison exists;
- desktop + representative mobile views are checked;
- no blank/flicker/console errors;
- performance budget remains acceptable;
- renderer does not alter authoritative gameplay state;
- asset source/license/provenance is recorded for production assets.

## Unit asset
A production infantry/cavalry/artillery asset is done only when scale, anchor/footpoint, facing convention, faction readability, shadow convention, atlas metadata and required animation states are validated at real game zoom. For directional sprites, architecture must support the agreed 8-facing contract even if an early vertical slice uses fewer finished animations.

## Bug fix
A fix is done only when there is a reproducer or equivalent evidence, the smallest authority-correct change is made, and the original failure plus relevant regressions are demonstrably green.

## Process / architecture change
A decision is done only when rationale, trade-offs and superseded alternatives are recorded. Large architectural choices should receive an ADR.
