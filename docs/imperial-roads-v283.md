# v283: connected Empire-period road system across the whole playable map

The map is **8000 × 5000**; its previous short road segments often ended in
open countryside, and visually adjacent roads could be disconnected in the
navigation graph.

**New architecture:** 25 traversable roads use exact shared waypoints and the
real v7 road lookup, route graph, 2D drawing and minimap. Includes:
- Two north-to-south Imperial-style postal routes **on opposite river banks**.
- Exactly one identified bridge/ford connector for each of the six approved
  river crossings; no new invented shortcuts through the water.
- Provincial long-distance routes from the former compact battle area to
  the far eastern hinterland and British camp.
- Secondary departmental roads joining postal stations, markets and hamlets.
- Narrow **chemins vicinaux**, farm/cart/forest tracks.
- Eight new named postal-relay locations at the actual new junctions.

The original legacy road geometry remains where needed for existing scenarios
and is still rendered by the same authority. The original French and far-SE
British camp starting positions, bridge traffic reservation, 4-file columns,
combat and AI remain unchanged. The road graph's Dijkstra pathfinder can now
navigate long trips using connected physical nodes rather than apparent
paint-only intersections.

Sources for historical *road type inspiration* (fictional places/geometry):
- Fondation Napoléon, 1812 routes des postes and 1811 classification:
  https://www.napoleon.org/histoire-des-2-empires/objets/cartes-et-livre-de-postes-de-lempire-francais-1812
- Atlas de Trudaine road engineering and main roads:
  https://www.institutparisregion.fr/nos-travaux/publications/atlas-des-routes-de-france-dit-atlas-de-trudaine/

**CI regression:** tests/imperial-road-network-v283.spec.js verifies all 25
new roads belong to one navigable graph, every segment respects water, a real
route reaches the far opposing camp, both camps have road access, and the
network spans the entire world. It runs in the compulsory Movement coverage
gate alongside all 9 real bridge/column simulator cases, mobile playability,
520-unit health and the deterministic Golden Battle.

Release 1.3.31. Any test failures block merging and publishing.
