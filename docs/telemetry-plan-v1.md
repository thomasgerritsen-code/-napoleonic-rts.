# Playtest Telemetry Plan v1

Telemetry is for product-quality evidence, not surveillance. It should answer whether the North Star battle is understandable, stable and performant.

## Privacy / scope

- No names, email addresses, account IDs, free-text chat or precise location.
- Prefer anonymous session IDs generated client-side and resettable.
- Do not enable session recording/autocapture by default for this project.
- Collect only events needed for playability, movement, combat clarity, renderer stability and performance.

## Core events

- `rts_game_loaded`: version, environment, renderer, viewport bucket.
- `rts_battle_started`: scenario/seed identifier, renderer, unit-count bucket.
- `rts_order_issued`: order type, selected regiment count, formation, phase; no raw pointer coordinates required for product metrics.
- `rts_renderer_switched`: from/to renderer and whether fallback occurred.
- `rts_regiment_stall`: phase, duration bucket, road/bridge/open-terrain context.
- `rts_bridge_crossing_completed`: duration bucket, unit-count bucket, max-stall bucket.
- `rts_deploy_started` / `rts_deploy_completed`: duration and formation.
- `rts_first_attack`: time-from-approach/deploy bucket, role.
- `rts_target_switched`: role, phase, switch-count bucket.
- `rts_battle_ended`: duration, outcome category, remaining-force buckets.
- `rts_runtime_error`: sanitized error class/module only; never arbitrary user text.
- `rts_performance_sample`: renderer, frame/update/draw p95 buckets, unit-count bucket, device/viewport class.

## Quality metrics derived from events

- order-to-visible-response latency;
- march -> deploy -> first attack time;
- stalls per battle and stall duration;
- bridge completion rate;
- target-switch churn;
- renderer fallback/error rate;
- battle completion rate and median duration;
- frame p95 by renderer and device class.

## Rollout gate

Telemetry must be opt-in for development/Preview until event names and payloads are verified. First validate in Vercel Preview and confirm events arrive without PII. Production enablement is a separate explicit decision.

## Implementation note

An older `observability/posthog-rts-v1` branch exists but is stale relative to current main. Reuse ideas only after refreshing onto current main; do not merge stale telemetry code directly.
