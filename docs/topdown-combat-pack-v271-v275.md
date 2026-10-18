# 2D Battle Pack v271–275

Five independent **Canvas2D** improvements. They reuse existing combat, morale, charge, square and bridge authorities. They do **not** replace marching/navigation, projectile ballistics, hit points, reload duration, morale shock thresholds, or the 3D renderer.

| ID | Feature | Visible effect | Authority / integration |
|---|---|---|---|
| v271 | Regiment volleys | Infantry shoulders muskets before the existing global salvo gate, actual synchronized shots generate pooled salvo effect | `volleyClock`, `engagementV069.mode`, real `fire` events; no new shot scheduling |
| v272 | Casualties | 3 distinct fallen-soldier silhouettes, fallen musket, hit flinch | Current `applyDamage` and `combatVisualV1`; fixed 160-event history and 130-draw limit |
| v273 | Artillery crew | Carriage visual recoil, crew sponge/charge/ram/ready motions | Cannon's real shot/reload value; artillery compound positions untouched |
| v274 | Morale and panic | Shakiness under low morale, visible panic and rout markers | Existing `moraleShock`, `routeUnit`, `reg.morale`; never issues orders |
| v275 | Cavalry and square | Real speed-driven gallop, momentum accents, bounded hoof dust and visible infantry square | Existing `chargeMomentumV1`, `chargeVsSquare=.35`; does not change road routing or auto-form squares |

### Historical/gameplay limitations
This is deliberately a **presentation-first** update. A real synchronized musket firing-line animation should not secretly modify hit probability or the AI's movement. The existing game already permits genuine cavalry charges, routs after morale collapse, and square defence. The new features make those behaviours readable in the 2D battlefield and provide incremental art improvements without introducing a second combat authority.

The artillery loading cycle is a stylised two-gunner presentation, not a full six- to twelve-person authentic gun crew. A future major artillery realism simulation could assign distinct animated roles and align actual reloading with their completion, but that is outside this low-risk visual update.

### Performance constraints
No additional packages, fonts or networks. Volleys pooled per regiment (max 50); fallout history max 160 and draw max 130; cavalry dust capped at 140. Visibility culling and 2D/3D separation. No persistent animation timer; time comes from deterministic `elapsed`. The 520-unit game-health, golden-battle, mobile, movement and focused Chromium tests must pass before publishing.
