# v280 — Local bridge choice with a measured improvement

Issue #272 is reproduced as a new seventh deterministic **real-engine**
scenario in the mandatory bridge-column autosimulator.

The previous bridge route resolver preserved the coarse A* choice unless
another local bridge improved the simple waypoint score by at least **55**
world units. At the eastern off-axis approach to Pont de la Crête, its
actual score was appreciably better than the detour via Pont de la
Chaussée, but did not exceed that oversized buffer.

We now require a **20-unit** improvement before a local preferred bridge
can replace the existing route. The existing endpoint-distance limits,
bank-side checks, obstacle-aware path building and blocked-water segment
validation are unchanged. This never modifies the bridge width, movement
speeds, column slot generation, collision, water rules, or 3D.

Regression test: six established bridge crossings plus the previously
failing eastern Crête off-axis route; all **14 members including the
officer and drummer** must physically finish across the desired bridge.
Four physically occupied deck files, no water, no stranded tail.

Release 1.3.28. All mandatory CI gates before merging.
