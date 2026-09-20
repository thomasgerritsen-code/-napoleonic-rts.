# Replay Bug Capture v1

Every reproducible gameplay/movement/input bug should become replayable instead of remaining a prose-only report.

## Minimum capture

Store or log:
- exact commit SHA and branch/PR;
- scenario/seed;
- renderer mode and viewport/device profile;
- ordered player/AI commands with timestamps or tick numbers;
- relevant regiment IDs and authoritative state transitions;
- key positions/facing/formation/target state around the failure;
- first failing tick/time and a short expected-vs-observed description;
- console/runtime error if present.

## Preferred artifact

Emit one compact JSON artifact from the deterministic harness:

```json
{
  "schema": 1,
  "commit": "<sha>",
  "seed": "<seed>",
  "ordersHash": "<hash>",
  "failure": {"timeMs": 0, "phase": "deploy", "summary": "..."},
  "trace": []
}
```

Do not include personal data or unrelated browser information.

## Fix gate

A bug fix is not considered proven when only the original symptom disappears manually. Prefer:
1. failing deterministic replay/test before the fix;
2. smallest authority-correct fix;
3. same replay green after the fix;
4. standard CI, Vercel Preview and visual gate where applicable.

If a bug cannot be made deterministic after two serious attempts, label it `NONDETERMINISTIC` and capture timing/performance/context evidence instead of repeatedly guessing.
