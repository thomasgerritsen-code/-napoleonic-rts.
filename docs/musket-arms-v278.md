# Update v278 — one coherent 2D musket-arm renderer

The preexisting v277 character renderer owns the full single smooth musket
motion: both articulated arms, paper-cartridge hand motion and **one**
ramrod. The v264 effects file previously installed another `drawUnit`
wrapper that painted a second set of hands and ramrod over it; the base
combat-animations module also drew an extra rod in its overlay. These
duplicate drawings are removed.

- Arm elbow/wrist coordinates evolve from the **real** reload status and
  established pre-aim/recoil/reload phase; soldiers have a tiny deterministic
  visual individuality keyed to their unit ID.
- Existing muzzle flashes, pooled white powder smoke, impacts and audio
  remain active, as do 2D/3D separation and per-frame culling.
- Physics, shot time, damage, targeting, commands, army movement, four-wide
  road columns and bridge navigation are **not** changed.
- No new dependency, scheduled timer, data structure per soldier or
  independent simulation authority.

Release version 1.3.26. CI must pass all five production gates before merge;
the post-merge Pages workflow must pass before marking the release playable.
