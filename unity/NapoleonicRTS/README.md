# Napoleonic RTS — Unity native prototype

Open this folder as a Unity project with **Unity 6.3 LTS** (the project is pinned to 6000.3.16f1).

On first import the Editor bootstrap creates `Assets/Scenes/Prototype.unity` and adds it to Build Settings. Press Play. The runtime bootstrap creates an orthographic camera, battlefield host and strategic map renderer automatically.

The prototype deliberately uses no prefab or GameObject per soldier. It creates soldiers as simulation records and sends their transforms to the GPU with `Graphics.RenderMeshInstanced` in batches. The simulation runs at a fixed 60 Hz and rendering interpolates between simulation states.

The native map contains the same eight active strategic roads from Battlefield V7 plus the browser river and four legal crossings. The route graph rejects road edges that cut through blocked water; crossing delays are included in route cost. Right-click movement uses this planner.

Regiments progressively compress from their chosen field formation into a narrow bridge column near a crossing. The bridge formation is temporary: after clearing the crossing the stored line/column/square formation redeploys. Followers that would otherwise cut a river corner use incremental legal corridor waypoints; crossing ownership remains active until every living member has cleared the far bank.

Controls:

- WASD / arrow keys: camera
- mouse wheel: zoom
- left-click or drag: select French regiment(s)
- Shift + selection: add regiment(s)
- right-click: route selected regiment(s) through the strategic road/bridge graph
- 1 / 2 / 3: line / column / square for the current selection
- `Load 1k map`: reload the route/bridge prototype
- `Stress 10k`: load 10,000 data-driven soldiers / 200 regiments for native render+simulation stress testing

CI compiles the engine-independent C# simulation and runs both a route/bridge smoke test and a 10,000-unit fixed-step scale benchmark. The Unity rendering/bootstrap layer is authored in the same project, but this repository CI does not currently launch Unity Editor, so Editor/runtime compilation still needs a real Unity installation before this draft PR is merged.
