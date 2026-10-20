# AGENTS.md — Napoleonic RTS collaboration

These rules govern work done by multiple manual ChatGPT development chats in this repository.
Read [`docs/PARALLEL-CHAT-WORKFLOW.md`](docs/PARALLEL-CHAT-WORKFLOW.md) before changing game code; it contains the four roles, start prompts, test policy and integration sequence.

## Repository and game

- Canonical repository: `thomasgerritsen-code/-napoleonic-rts.` (including the trailing dot).
- Default and playable branch: `main`.
- Playable build: https://thomasgerritsen-code.github.io/-napoleonic-rts./
- Preserve the existing **2D** browser game, gameplay behavior, mobile controls and fallback paths. Do not introduce 3D or a new engine without explicit user direction.

## Working contract

1. **Manual-only:** do not create recurring tasks or assume chats communicate or continue development without a new user instruction.
2. **Fresh state:** before each coding task, inspect latest `main`, current open PRs, their touched files, and the current task. Never rely only on a previous chat summary.
3. **One scope and branch per task:** create a unique branch from current `main`; do not edit or push to another chat's branch; never push directly to `main`.
4. **Avoid collisions:** work in the assigned lane; coordinate shared files and interfaces through GitHub PRs. If an overlapping PR already exists, stop that overlapping portion and report its link.
5. **Small changes:** retain unrelated behavior; do not broaden a targeted fix into an architectural rewrite.
6. **Targeted evidence:** run focused relevant tests. For mobile gestures, prefer actual touch interaction and verify no ghost orders. Keep required CI checks; never invent passing statuses.
7. **One PR:** developer chats 1–3 may open a PR for a task but never merge it themselves. Only chat 4 (Integrator) owns authorized merges, integration order and release.
8. **Version ownership:** developer chats must not independently bump shared version/release identifiers in `package.json`, README or global cache/build metadata. The Integrator coordinates visible release naming after merging.
9. **Report truthfully:** show PR URL, branch, exact head commit, changed files, tested/not-tested items, current CI/deploy facts, and always link the playable game. A PR is not yet a deployed release.

## Lanes

- **Chat 1 — Gameplay:** orders, troops, workers, building, resources, combat and pathfinding.
- **Chat 2 — World/2D graphics:** terrain, river, shores, roads, vegetation and visual-only effects.
- **Chat 3 — Performance/mobile:** rendering efficiency, FPS, caching, pan/zoom and input responsiveness (coordinate touch overlap with Chat 1).
- **Chat 4 — Integrator:** review overlaps, verify current SHAs/checks, merge only on authorization, manage versions and validate releases.

Existing project commands include `npm run test:fast` and Playwright `npm run test:e2e`. Prefer narrow targeted checks for each change while honoring repository-required CI. Documentation-only PRs do not need gameplay test reruns unless existing CI mandates them.

Never claim that a game update was applied, merged or deployed without verifying the actual GitHub action or release status.
