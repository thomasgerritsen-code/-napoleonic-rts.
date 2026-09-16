# MOVEMENT-CONTACT-V1 combined replay contract

This gate protects the authority boundary and prevents local movement improvements from hiding global regressions.

## Authority contract

- Gameplay/AI owns intent, orders, target selection and engagement state.
- Movement owns physical locomotion, path/formation flow and execution of the requested movement.
- A candidate must not introduce a second state machine or hidden override that competes for position, facing or engagement authority.

## Deterministic replay

Baseline and candidate must use the same seed and orders. A replay report should expose `seed`, `ordersHash`, and these metrics (top-level or under `metrics`):

`routeCompletion`, `roadCorridorError`, `headingJitter`, `headingReversals`, `startStopCycles`, `velocityJerk`, `meanFormationDeviation`, `p95FormationDeviation`, `overlapPenetrationDuration`, `validRouteStationaryTime`, `deployOvershoot`, `timeToDeployFront`, `facingErrorFirstAttack`, `targetSwitchReengageCount`, `reformCohesionRecovery`, `maxStall`, `bridgeThroughput`.

Run:

```sh
node scripts/compare-movement-contact-replay.js baseline.json candidate.json
```

Missing metrics, seed/order mismatch, or a material unaccepted regression fails the automated gate. Current comparator tolerances are deliberately conservative and can be tightened once a stable baseline distribution exists.

## Visual replay

Capture golden frames around road turn/exit, approach, deploy, first attack and reform. Review for zigzag/weave, snap-turning, formation explosion, rubber-band regrouping, prolonged interpenetration, unexplained stop/start cadence, cavalry/artillery role breakage and flicker/blank frames. Numeric PASS plus questionable visual feel is ONBESLIST, not mergeable.

## Bridge hard gate

No deadlock, permanent stall, oscillation, invalid stacking or teleport recovery. Existing Movement Coverage remains mandatory.

## Parallel Movement + Gameplay/AI

Validate and merge the first green PR. Refresh/rebase the second onto the new main and rerun the combined replay plus standard gates on the combined state. Never treat two candidates tested independently against an old base as sufficient.
