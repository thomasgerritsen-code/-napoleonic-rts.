# ADR-0001: Gameplay, Movement and Rendering Authority Boundaries

Status: Accepted

## Context
The browser RTS contains legacy 2D rendering, Three.js experiments, PixiJS GRAPHICS-V2 work, gameplay/AI and multiple movement/navigation layers. Visual or convenience code must not silently become a second simulation authority.

## Decision
- Gameplay/AI owns intent and combat state: march, approach, deploy, engage, disengage/reform, target selection, role decisions and morale/routing.
- Movement/Simulation owns authoritative physical execution: positions, velocity, route/corridor, turning/facing convergence, formation anchors/slots, collision/traffic, bridge flow and regrouping.
- Rendering owns presentation only. Renderer-specific code may interpolate/animate visual presentation but must not write authoritative unit position, facing, target or engagement state.
- Input adapters may translate clicks/touches into the existing simulation command contract; they may not execute movement directly.

## Consequences
A renderer bug is fixed in rendering unless evidence shows the authoritative state is wrong. A movement bug is not hidden with sprite offsets or renderer-facing corrections. New renderers can be compared or replaced without changing gameplay semantics.

## Rejected alternatives
- Renderer-specific simulation patches: rejected because they produce inconsistent behaviour across render modes.
- Multiple independent movement loops: rejected because they create race conditions and hidden state divergence.

Any future exception requires a new ADR and explicit regression plan.
