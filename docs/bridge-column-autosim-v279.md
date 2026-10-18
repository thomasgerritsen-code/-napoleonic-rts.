# v279: automated, authoritative bridge-column CI simulator

## What was missing
The normal movement coverage matrix can mark a crossing complete when a
group's **centroid** approaches a destination or the route is marked complete.
This can miss a stalled rear rank, a straggling drummer, a non-physical
four-file target, or a logical crossing reservation that is released too soon.

## Mandatory tests on every pull request and main push

`tests/bridge-column-autosim-v279.spec.js` simulates **six** real production
regiment marches: 3 bridges × both banks, with 12, 18, 24, and 36
infantrymen + officer + drummer, including off-axis approaches.

The suite checks:
- Every single living soldier physically clears the far edge, not a
  centroid-only approximation.
- All members survive, no one stands in water or aims through blocked water.
- Four unique slot files at start AND at least three observed frames with
  **four physically occupied bridge-deck lanes**, not just desired targets.
- No 38-second immobile rear rank while crossing, no reversal once the
  anchor has cleared the far side.
- Exactly the requested bridge is on the selected production route.
- Reproducible seeded simulation, 0.05s real production steps.

The mandatory `Movement coverage gate` also now runs the existing
`bridge-multi-regiment-gridlock.spec.js` traffic test, which sends four
regiments from opposing banks. A failure blocks merge/deployment when branch
protection is enabled; the main Pages deployment always requires a successful
movement job. Full per-unit diagnostics are uploaded as
`movement-coverage-*/bridge-column-autosim-v279.json`.

This is an automatic **CI** simulator, not a scheduled background agent or
an always-running in-game computation. It cannot prove every imaginable
movement scenario correct. In-game reports should be recreated here as
additional deterministic regression cases.

Game version: 1.3.27.
