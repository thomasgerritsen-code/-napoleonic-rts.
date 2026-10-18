# v277 — More natural Canvas2D flintlock motion

The 12+ soldiers of a regiment **prepare to shoulder their muskets** in a
small, deterministic, individual visual phase spread (at most 108 ms).
The actual firing event, projectile trajectory, flash and hit calculations
remain simultaneous according to the existing `volleyClock` authority.

Following a **real** musket fire event, the 2D orthographic soldier animation:
1. Kicks back and settles with a tiny per-soldier recovery variation.
2. Lowers the weapon smoothly while beginning the paper-cartridge handling.
3. Renders ramrod/charging as part of a staged reload.
4. Raises the musket again using the **actual** reload countdown,
   including randomized reloads that outlast the previous visual marker.

Only pose calculations and pixels change. No projectile, damage, morale,
formation, crossing, AI, sound, 3D, new timers or wind settings change.
Headless tests verify varied pre-aim, actual-shot recoil, bridge and 3D
gating, live-reload phases, state immutability, and no invented gunshots.

Visible game release: **v1.3.25**.
