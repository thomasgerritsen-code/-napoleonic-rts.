# v276 — Realistic 2D musket-volley front

Replaces the v271 on-screen "SALVO ×N" caption and centred oval marker with
short, individual muzzle wisps positioned at **actual firing soldiers' muzzles**.
At least three real shots from the same regiment within the existing .23 s
grouping window create a visually joined firing front. The old persistent
black-powder smoke (v269/v270) remains the sole owner of the long-lived plume.

- Uses the live global `fire()` event after gameplay has oriented each unit.
- Samples no more than 32 muzzle origins per salvo, draws at most 240
  lightweight 2D ellipses per frame; no additional animation timer.
- Uses the existing automatic wind direction, never exposes a manual setter.
- Disables collection as well as rendering in 3D view.
- Makes no changes to reload, hit probability, damage, AI, movement, bridges
  or any route/formation authority.
- Existing v271–275 Playwright integration plus focused v276 headless tests
  protect 12-man, capacity, 3D and reset behaviour.

Version: **1.3.24**. The visual smoke is stylised 2D artwork; it is not a
fluid-dynamics or historical ballistics simulation.
