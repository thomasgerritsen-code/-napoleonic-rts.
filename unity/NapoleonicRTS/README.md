# Napoleonic RTS — Unity native prototype

Open this folder as a Unity project with **Unity 6.3 LTS** (the project is pinned to 6000.3.16f1).

On first import the Editor bootstrap creates `Assets/Scenes/Prototype.unity` and adds it to Build Settings. Press Play. The runtime bootstrap creates an orthographic camera, battlefield host and strategic map renderer automatically.

The prototype deliberately uses no prefab or GameObject per soldier. It creates 1,000 soldiers as simulation records and sends their transforms to the GPU with `Graphics.RenderMeshInstanced` in batches. The simulation runs at a fixed 60 Hz and rendering interpolates between simulation states.

The native map contains the same eight active strategic roads from Battlefield V7 plus the browser river and four legal crossings. The route graph rejects road edges that cut through blocked water; crossing delays are included in route cost. Right-click movement uses this planner.

Regiments now progressively compress from their chosen field formation into a narrow bridge column near a crossing. The bridge formation is temporary: after clearing the crossing the stored line/column/square formation redeploys. Followers that would otherwise cut a river corner are redirected to the legal bridge mouth/exit rather than entering blocked water.

Controls:

- WASD / arrow keys: camera
- mouse wheel: zoom
- left-click or drag: select French regiment(s)
- Shift + selection: add regiment(s)
- right-click: route selected regiment(s) through the strategic road/bridge graph
- 1 / 2 / 3: line / column / square for the current selection
- UI buttons: same formation commands plus prototype march/home cycle

The browser game remains the source-of-truth for full gameplay while systems are migrated one at a time. Selection and navigation are performed directly against compact simulation data; there are no unit colliders or per-unit scene objects.
