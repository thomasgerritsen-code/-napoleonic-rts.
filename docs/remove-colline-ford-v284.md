# v284 / release 1.3.32 — close the Colline ford

Map-edit request: remove numbered crossing **3** (Gué de la Colline).

- Removed `gue-colline` from `WATER_CROSSINGS_V067`.
- Removed the `imperial-colline-ford` road polyline crossing that location.
- The river still exists throughout y≈1920: no ford clearance, crossing traffic
  state, minimap marker, or water-safe navigation slot exists there.
- Five actual bridges remain, with exactly 5 crossing IDs and 0 fords.
- The wider 8000×5000 map, roads, and two camps remain as before.
- After this removal, an artillery convoy near Pont de la Crête incorrectly
  detoured to Pont de la Chaussée. Extend the local bridge-intent correction to
  artillery and synchronise cannon/crew waypoint targets with the newly chosen
  corridor. All nine physical four-file infantry bridge auto-simulations remain.
- The recovery test uses two existing bridges instead of the removed ford.
- The main crossing matrix tests all five bridges, both directions and all
  relevant unit classes, and river-water safety.
- A frozen old browser test allowed only the old Grande Chaussée label at a
  location shared with the v283 Grand Pont road; accept either real roadway.
- The initial French town hall can be repositioned by placement exclusions.
  The base remains in the NW theatre, so test a NW 30% threshold rather than
  a brittle 25% threshold.

The map illustration previously circulated in chat represents v283 and shows
a ford that should no longer exist. Use the live v284 game as map authority.
