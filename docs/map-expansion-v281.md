# v281: southern strategic theatre — first world expansion

World bounds increase from **4300 × 2500** to **8000 × 5000**
(3.72 times the playable area). Unlike a camera-only zoom, the river
now reaches the new southern border. Two distant bridges are added at
(y=3050) and (y=4580); new main roads connect both banks and the far
east of the map. Four hamlets appear along the long roads.

The original battle zone, spawn locations and four older crossing
IDs/geometries remain intact to avoid breaking the v279 bridge
regression and the current battle while the wider map architecture
is being incrementally introduced. **Next step:** redistribute the
existing closely spaced bridge/road cluster too, and migrate all
historical test and scenario starting points to geometry-derived
fixtures rather than hardcoded coordinates.

The test suite adds two actual full infantry-column crossings in the
new theatre, with no-water, four-file deck and last-soldier clearance
requirements. Do not merge without five successful gates, including
520-unit health and Golden Battle, on the same PR HEAD.
