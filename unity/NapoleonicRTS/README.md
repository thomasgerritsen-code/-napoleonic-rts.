# Napoleonic RTS — Unity native prototype

Open this folder as a Unity project with **Unity 6.3 LTS** (the project is pinned to 6000.3.16f1).

On first import the Editor bootstrap creates `Assets/Scenes/Prototype.unity` and adds it to Build Settings. Press Play. The runtime bootstrap creates an orthographic camera and a battlefield host automatically.

The prototype deliberately uses no prefab or GameObject per soldier. It creates 1,000 soldiers as simulation records and sends their transforms to the GPU with `Graphics.RenderMeshInstanced` in batches. The simulation runs at a fixed 60 Hz and rendering interpolates between simulation states.

Controls:

- WASD / arrow keys: camera
- mouse wheel: zoom
- left-click or drag: select French regiment(s)
- Shift + selection: add regiment(s)
- right-click: move selected regiment(s), with regiment-level destination spacing
- 1 / 2 / 3: line / column / square for the current selection
- UI buttons: same formation commands plus prototype march/home cycle

The browser game remains the source-of-truth for full gameplay while systems are migrated one at a time. Selection is performed directly against compact simulation data; there are no unit colliders or per-unit scene objects.
