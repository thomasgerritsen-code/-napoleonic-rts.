# Feature Preservation Contract v1

## Purpose
New work must not silently remove, disable or materially degrade a previously working player-facing capability. The default assumption is backward-compatible evolution of the browser RTS.

This contract is a hard merge gate alongside CI, bridge/chokepoint, mobile, Preview/runtime and visual-feel gates.

## Protected capability classes
The exact inventory is maintained against current `main` in `docs/feature-preservation-matrix-v1.json`. At minimum the preservation matrix covers these existing capability classes when present:

- game boot / North Star battle start;
- desktop selection, multi-selection, move orders and facing orders;
- mobile single-tap selection, multi-select/box alternative, move, facing, pan, pinch and essential formation controls;
- formation switching and formation cohesion behaviour already accepted on `main`;
- camera pan/zoom and resize/orientation behaviour;
- roads, road exit, bridges/chokepoints and legal route completion;
- infantry, cavalry and artillery participation in the core battle;
- combat, morale/routing and targeting behaviours already covered by deterministic/golden tests;
- HUD/order feedback required to understand and control the core loop;
- deterministic Test Lab / replay hooks used by regression coverage;
- renderer fallback / stable canvas behaviour while renderer experiments are active.

The matrix describes capabilities, not implementation details. Refactors may replace internals while preserving observable behaviour.

## No silent deletion rule
A PR may not remove or disable a protected capability merely because a new implementation supersedes it locally. Any intentional removal or behaviour-breaking change requires all of the following in the PR:

1. explicit `PRESERVATION IMPACT` declaration naming the affected capability;
2. reason the old behaviour is harmful, obsolete or incompatible with the North Star;
3. replacement/migration path or an explicit product decision that the capability is being retired;
4. updated tests, playtest expectations and documentation;
5. Integrator approval after exact-head CI/Preview evidence.

Absence from a new UI, renderer or code path is still a removal and must follow this rule.

## PR preservation impact declaration
Every material gameplay, movement, renderer, UX or refactor PR states one of:

- `PRESERVATION IMPACT: none` — no protected capability intentionally changes;
- `PRESERVATION IMPACT: compatible change` — capability remains available but implementation/feel changes within acceptance criteria;
- `PRESERVATION IMPACT: intentional retirement` — rare; requires the explicit removal process above.

The declaration also lists the capability IDs from the matrix that the diff can affect. If the PR cannot confidently state the impact, it is not ready to merge.

## Compatibility matrix gate
Before merge, the Integrator checks the exact candidate head against the machine-readable matrix:

- all capabilities touched by the diff have a preservation test or explicit manual/Preview check;
- previously green mapped tests remain green;
- no protected control disappears from desktop or mobile without an approved replacement;
- North Star battle still starts and the complete core loop remains executable;
- bridge/mobile/core-order invariants remain green;
- renderer experiments preserve a tested fallback until KEEP/STOP is final.

A new feature that replaces an old path must add replacement coverage before deleting old coverage. A test may change when requirements intentionally change, but the PR must explain why the old capability is still preserved or explicitly retired.

## Release baseline
At each milestone release candidate, freeze a compact capability baseline from the exact RC head: feature-matrix version, deterministic replay hashes, required golden captures and key core-loop tests. Later releases compare against the latest accepted baseline plus newly accepted capabilities.

This is not pixel-perfect backward compatibility for every visual; it is protection against accidental product regression.

## Refactor/delete safety
Large refactors, file deletions, dependency removals and renderer replacements require a preservation audit before code removal. Search for callers, controls, tests, debug hooks, feature flags and mobile equivalents. Remove obsolete code only after the replacement path is green on Preview and mapped preservation tests pass.

## Post-merge canary
After a material merge, verify the new `main` workflow and core smoke before starting overlapping work. A regression found immediately after merge becomes top priority and the responsible route is repaired or reverted before feature work continues.

## Rollback rule
If an accepted capability unexpectedly disappears or materially regresses on `main`, stop overlapping feature work. Prefer the smallest safe repair; if the cause is not quickly isolated or the repair grows risky, revert the responsible merge and rework it behind a flag/branch. A green new-feature test never outweighs a broken protected capability.

## Architecture exception
Preservation protects player value, not obsolete internal architecture. If preserving an old capability would require duplicate authorities or brittle compatibility shims, do not keep layering patches. Pause, isolate behind a flag, or revert and redesign the migration while keeping the old player-facing path available until the replacement is proven.

## Definition of success
A player upgrading from the last accepted `main` keeps all protected useful controls and core behaviours unless a clearly documented product decision intentionally replaces or retires one.