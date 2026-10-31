extends Node3D
## Proof of a 3D look: a piece of the real map (St.-Martin by the French base)
## built in 3D. The ground is the map's own relief as a mesh with the ground
## picture laid over it exactly (each point takes the colour the iso picture
## shows there); the houses, trees and soldiers are the same Blender models
## the sprites are rendered from (scripts/export-godot-3d-proof.py), lit by a
## sun that casts real shadows. The camera turns and tilts: drag to turn, the
## wheel or a pinch to zoom, the right button or two fingers to move.
## Only a look: nothing moves or fights here.

const REGION := Rect2(80, 380, 2100, 1150)    # game px of the map shown
const STEP := 22.5                            # game px between ground points (1 m)

var _camera: Camera3D
var _target := Vector3.ZERO
var _yaw := 0.0
var _pitch := deg_to_rad(38.0)
var _distance := 62.0
var _sun: DirectionalLight3D
var _turning := false
var _panning := false
var _touches := {}
var _spread := 0.0
var _models := {}


func _ready() -> void:
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	Iso.load_relief(meta)
	_environment()
	add_child(_ground(meta))
	var start: Dictionary = Iso.read_json("res://assets/map/start.json")
	_village(start)
	_trees(start)
	_base()
	_battalion("soldier_france", Vector2(980, 1090), 0.0, 12)
	_battalion("soldier_britain", Vector2(1230, 1090), PI, 12)
	_camera = Camera3D.new()
	_camera.fov = 40.0
	_camera.far = 900.0
	add_child(_camera)
	_target = _at(Vector2(1000, 950))
	_place_camera()
	_hud()


## A point of the map (game px) in 3D: metres, y up, on the ground.
func _at(world: Vector2) -> Vector3:
	return Vector3(world.x / Iso.PPM, Iso.height_px(world) / Iso.PPM, world.y / Iso.PPM)


func _environment() -> void:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.36, 0.52, 0.74)
	sky_mat.sky_horizon_color = Color(0.74, 0.78, 0.8)
	sky_mat.ground_horizon_color = Color(0.5, 0.5, 0.44)
	sky_mat.ground_bottom_color = Color(0.25, 0.25, 0.2)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	var env := Environment.new()
	env.background_mode = Environment.BG_SKY
	env.sky = sky
	env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	env.ambient_light_energy = 0.38
	env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	env.tonemap_exposure = 0.92
	env.fog_enabled = true
	env.fog_light_color = Color(0.72, 0.76, 0.8)
	env.fog_density = 0.0012
	var world := WorldEnvironment.new()
	world.environment = env
	add_child(world)
	_sun = DirectionalLight3D.new()
	_sun.light_color = Color(1.0, 0.95, 0.86)
	_sun.light_energy = 1.05
	_sun.shadow_enabled = true
	_sun.directional_shadow_max_distance = 160.0
	_sun.rotation = Vector3(deg_to_rad(-42.0), deg_to_rad(-35.0), 0.0)
	add_child(_sun)


## The relief as a mesh, the ground picture over it: each point takes the
## picture's colour where the iso view shows that point.
func _ground(meta: Dictionary) -> MeshInstance3D:
	var tex: Texture2D = load("res://assets/map/" + String(meta["image"]))
	var k := float(meta["pxPerM"]) / float(meta["gamePxPerM"])
	var pad := float(meta["padTop"])
	var cols := int(REGION.size.x / STEP) + 1
	var rows := int(REGION.size.y / STEP) + 1
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for r in rows:
		for c in cols:
			var w := REGION.position + Vector2(c, r) * STEP
			var screen := Iso.to_screen(w)
			st.set_uv(Vector2(screen.x * k / tex.get_width(), (pad + screen.y * k) / tex.get_height()))
			st.add_vertex(_at(w))
	for r in rows - 1:
		for c in cols - 1:
			var i := r * cols + c
			st.add_index(i)
			st.add_index(i + 1)
			st.add_index(i + cols)
			st.add_index(i + 1)
			st.add_index(i + cols + 1)
			st.add_index(i + cols)
	st.generate_normals()
	var mat := StandardMaterial3D.new()
	mat.albedo_texture = tex
	# The picture has its own light and shade already: less of the sun's.
	mat.albedo_color = Color(0.8, 0.8, 0.78)
	mat.roughness = 1.0
	mat.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	mesh.material_override = mat
	return mesh


func _model(name_: String) -> Node3D:
	if not _models.has(name_):
		_models[name_] = load("res://proof3d/models/%s.glb" % name_)
	var scene: PackedScene = _models[name_]
	return scene.instantiate()


func _put(name_: String, world: Vector2, angle: float, size := 1.0) -> Node3D:
	var m := _model(name_)
	m.position = _at(world)
	m.rotation.y = angle
	m.scale = Vector3.ONE * size
	add_child(m)
	return m


## The village's houses as the map has them.
func _village(start: Dictionary) -> void:
	var kinds := {"cottage": "cottage", "cottage2": "cottage", "farmhouse": "farmhouse", "farmhouse2": "farmhouse",
		"chapel": "farmhouse", "inn": "farmhouse", "barn": "farmhouse"}
	for v: Dictionary in start["villages"]:
		for h: Dictionary in v["houses"]:
			var at := Vector2(h["x"], h["y"])
			if REGION.has_point(at):
				# As small as the 2D game draws its village houses.
				_put(kinds.get(h["kind"], "cottage"), at, -float(h["angle"]) + PI / 2.0, float(h.get("scale", 0.5)) * 1.3)
		var middle := Vector2(v["x"], v["y"])
		if REGION.has_point(middle):
			_put("well", middle, 0.3)
			_put("haystack", middle + Vector2(70, 60), 0.0)


## Woods and berry bushes where the map has them, each tree a little different.
func _trees(start: Dictionary) -> void:
	var kinds := ["oak", "birch", "pine", "oak"]
	for r: Dictionary in start["resources"]:
		var at := Vector2(r["x"], r["y"])
		if not REGION.has_point(at):
			continue
		var h := Battle.hash01(int(r["id"]), 3)
		if r["type"] == "wood":
			_put(kinds[int(h * kinds.size()) % kinds.size()], at, h * TAU, 0.85 + 0.35 * Battle.hash01(int(r["id"]), 5))
			# A second and third tree: a wood, not a lone tree.
			for n in 1:
				var off := Vector2.from_angle(h * TAU + n * 2.4) * (40.0 + 25.0 * n)
				_put(kinds[(int(h * 7) + n + 1) % kinds.size()], at + off, h * 5.0 + n, 0.75 + 0.3 * Battle.hash01(int(r["id"]), 7 + n))
		elif r["type"] == "food":
			_put("bush", at, h * TAU, 1.0)


## The French base: the town centre (a large house for now), barracks, a tower.
func _base() -> void:
	_put("farmhouse", Vector2(316, 799), 0.4, 1.0)
	_put("barracks_fr", Vector2(560, 720), -0.3, 0.8)
	_put("tower_fr", Vector2(820, 600), 0.2, 0.8)


## A battalion in line: two ranks, facing `facing` (radians in the world, 0 east).
func _battalion(model: String, centre: Vector2, facing: float, files: int) -> void:
	var forward := Vector2.from_angle(facing)
	var right := forward.orthogonal() * -1.0
	for rank in 2:
		for f in files:
			var at := centre + right * (f - (files - 1) / 2.0) * 15.0 - forward * rank * 19.0
			at += Vector2(Battle.hash01(f, rank) - 0.5, Battle.hash01(rank, f) - 0.5) * 3.0
			# The model looks along -z; turn it to the world's facing.
			_put(model, at, -facing - PI / 2.0)


func _place_camera() -> void:
	var back := Vector3(sin(_yaw), 0.0, cos(_yaw)) * cos(_pitch) + Vector3.UP * sin(_pitch)
	_camera.position = _target + back * _distance
	_camera.look_at(_target, Vector3.UP)


## Seen as the 2D game sees it, or from close by and low: for the screenshots.
func view(yaw_deg: float, pitch_deg: float, distance: float, at := Vector2(1000, 950)) -> void:
	_yaw = deg_to_rad(yaw_deg)
	_pitch = deg_to_rad(pitch_deg)
	_distance = distance
	_target = _at(at)
	_place_camera()


func _hud() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	var label := Label.new()
	label.text = "Proef: 3D-graphics · slepen draait · wiel of knijpen zoomt · rechts slepen of twee vingers verschuift"
	label.position = Vector2(16, 12)
	label.add_theme_font_size_override("font_size", 16)
	label.add_theme_color_override("font_outline_color", Color(0, 0, 0))
	label.add_theme_constant_override("outline_size", 5)
	layer.add_child(label)
	var back := Button.new()
	back.text = "Terug naar het menu"
	back.position = Vector2(16, 44)
	back.pressed.connect(func() -> void: get_tree().change_scene_to_file("res://scenes/menu.tscn"))
	layer.add_child(back)


func _unhandled_input(event: InputEvent) -> void:
	var touch := event as InputEventScreenTouch
	if touch != null:
		if touch.pressed:
			_touches[touch.index] = touch.position
		else:
			_touches.erase(touch.index)
		_spread = _finger_spread()
		return
	var drag := event as InputEventScreenDrag
	if drag != null:
		_touches[drag.index] = drag.position
		if _touches.size() >= 2:
			_pan(drag.relative / _touches.size())
			var spread := _finger_spread()
			if _spread > 0.0:
				_distance = clampf(_distance * _spread / spread, 12.0, 220.0)
			_spread = spread
		else:
			_turn(drag.relative)
		_place_camera()
		return
	var button := event as InputEventMouseButton
	if button != null and button.device != InputEvent.DEVICE_ID_EMULATION:
		match button.button_index:
			MOUSE_BUTTON_LEFT:
				_turning = button.pressed
			MOUSE_BUTTON_RIGHT, MOUSE_BUTTON_MIDDLE:
				_panning = button.pressed
			MOUSE_BUTTON_WHEEL_UP:
				_distance = maxf(12.0, _distance / 1.12)
			MOUSE_BUTTON_WHEEL_DOWN:
				_distance = minf(220.0, _distance * 1.12)
		_place_camera()
		return
	var motion := event as InputEventMouseMotion
	if motion != null and motion.device != InputEvent.DEVICE_ID_EMULATION:
		if _turning:
			_turn(motion.relative)
		elif _panning:
			_pan(motion.relative)
		_place_camera()


func _turn(by: Vector2) -> void:
	_yaw -= by.x * 0.006
	_pitch = clampf(_pitch + by.y * 0.004, deg_to_rad(8.0), deg_to_rad(80.0))


func _pan(by: Vector2) -> void:
	var right := _camera.global_basis.x
	var ahead := Vector3(-sin(_yaw), 0.0, -cos(_yaw))
	_target += (-right * by.x + ahead * by.y) * _distance * 0.0016


func _finger_spread() -> float:
	var points: Array = _touches.values()
	return (points[0] as Vector2).distance_to(points[1]) if points.size() >= 2 else 0.0
