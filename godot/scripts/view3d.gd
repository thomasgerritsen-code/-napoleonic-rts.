class_name View3D
extends Node3D
## The battle in 3D: the same battle (its men, buildings, woods and rules, the
## British commander, saving, online play), seen as a 3D world instead of the
## iso pictures. Switched on and off in the battle (F3, or from the menu).
##
## The ground is the map's relief with the ground picture laid over it; the
## houses, trees, buildings, soldiers, horsemen and guns are the Blender
## models the sprites come from (scripts/export-godot-3d.py), the men playing
## the same animations the sprites were drawn from; trenches, fog, territories,
## smoke and dust as in 2D (Field3D, Smoke3D). A sun goes round with the
## hour and casts real shadows; at night the light falls and the windows
## glow. The camera: WASD or the arrows (or the middle button) to move, Q/E
## to turn, the wheel to zoom; by touch two fingers move and pinch. Select
## and give orders as in 2D (left: select or drag a box, right: order, right
## drag: the front; a finger with men selected: order).

const MODELS := "res://assets3d/%s.glb"
## Building types to models (the side's own where there is one).
const BUILDINGS := {"towncenter": ["farmhouse", 1.45], "house": ["cottage", 1.0], "barracks": ["barracks_%s", 1.0],
	"stable": ["barn", 1.0], "foundry": ["barracks_%s", 0.85], "tower": ["tower_%s", 1.0], "hospital": ["hospital_%s", 1.0],
	"lumbercamp": ["lumbercamp_%s", 1.0], "mine": ["well", 1.3], "farm": ["field_ripe", 1.0]}
## Village houses to models.
const HOUSES := {"cottage": "cottage", "cottage2": "cottage", "farmhouse": "farmhouse", "farmhouse2": "farmhouse",
	"chapel": "farmhouse", "inn": "farmhouse", "barn": "barn"}
## Animations that go with the ground covered (their length is a stride).
const STRIDES := {"march": 1.5, "walk": 2.4, "trot": 2.8, "gallop": 3.6, "roll": 1.2, "charge": 1.5, "rout": 1.6}
const RING := Color(1.0, 0.85, 0.35)

var battle: Battle
var camera: Camera3D
var _sun: DirectionalLight3D
var _env: Environment
var _target := Vector3.ZERO
var _yaw := 0.0
var _pitch := deg_to_rad(52.0)
var _distance := 45.0
var _scenes := {}            # model name -> PackedScene (or null)
var _men := {}               # Unit -> {node, player, anim, ring}
var _halls := {}             # Building -> Node3D
var _scenery: Array = []     # [sprite, MultiMesh, index, transform]
var _labels := {}            # Regiment -> Label3D
var _lamps := {}             # Building -> OmniLight3D
var _flash_pool: Array[OmniLight3D] = []
var _flash_next := 0
var _aim: MeshInstance3D
var _box_from: Variant = null
var _order_from: Variant = null
var _touches := {}
var _spread := 0.0
var _cam2d_seen := Vector2.INF
var _sync_clock := 0.0
var _box: Panel
## The trenches, fog, territories and placing (Field3D); smoke, earth and dust (Smoke3D).
var field: Field3D
var fx: Smoke3D


func _ready() -> void:
	_environment()
	field = Field3D.new()
	field.battle = battle
	field.view = self
	add_child(field)
	fx = Smoke3D.new()
	fx.battle = battle
	add_child(fx)
	add_child(_ground())
	camera = Camera3D.new()
	camera.fov = 42.0
	camera.near = 0.5
	camera.far = 1200.0
	add_child(camera)
	camera.make_current()
	_aim = MeshInstance3D.new()
	_aim.mesh = ImmediateMesh.new()
	var gold := StandardMaterial3D.new()
	gold.albedo_color = RING
	gold.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	gold.no_depth_test = true
	_aim.material_override = gold
	add_child(_aim)
	for i in 12:
		var flash := OmniLight3D.new()
		flash.light_color = Color(1.0, 0.75, 0.42)
		flash.omni_range = 9.0
		flash.visible = false
		add_child(flash)
		_flash_pool.append(flash)
	var layer := CanvasLayer.new()
	add_child(layer)
	_box = Panel.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.95, 0.9, 0.6, 0.12)
	style.border_color = Color(0.95, 0.9, 0.6, 0.85)
	style.set_border_width_all(2)
	_box.add_theme_stylebox_override("panel", style)
	_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_box.visible = false
	layer.add_child(_box)
	_scenery_from_sprites()
	var home := battle.town_centre(battle.me)
	_target = at(home.world + Vector2(260, 60) if home != null else Iso.WORLD / 2.0)
	_place_camera()


## A point of the map (game px) in 3D: metres, y up, on the ground.
static func at(world: Vector2) -> Vector3:
	return Vector3(world.x / Iso.PPM, Iso.height_px(world) / Iso.PPM, world.y / Iso.PPM)


static func flat(p: Vector3) -> Vector2:
	return Vector2(p.x * Iso.PPM, p.z * Iso.PPM)


## The turn of a model (made facing +y in Blender, -z here) to a heading in
## the world (radians, 0 east, y south).
static func turn(facing: float) -> float:
	return -facing - PI / 2.0


func _environment() -> void:
	var sky_mat := ProceduralSkyMaterial.new()
	sky_mat.sky_top_color = Color(0.36, 0.52, 0.74)
	sky_mat.sky_horizon_color = Color(0.74, 0.78, 0.8)
	sky_mat.ground_horizon_color = Color(0.5, 0.5, 0.44)
	sky_mat.ground_bottom_color = Color(0.25, 0.25, 0.2)
	var sky := Sky.new()
	sky.sky_material = sky_mat
	_env = Environment.new()
	_env.background_mode = Environment.BG_SKY
	_env.sky = sky
	_env.ambient_light_source = Environment.AMBIENT_SOURCE_SKY
	_env.ambient_light_energy = 0.4
	_env.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	_env.tonemap_exposure = 0.92
	_env.fog_enabled = true
	_env.fog_light_color = Color(0.72, 0.76, 0.8)
	_env.fog_density = 0.0012
	var world := WorldEnvironment.new()
	world.environment = _env
	add_child(world)
	_sun = DirectionalLight3D.new()
	_sun.light_color = Color(1.0, 0.95, 0.86)
	_sun.shadow_enabled = true
	_sun.directional_shadow_max_distance = 180.0
	add_child(_sun)


## The whole map's relief, the ground picture over it as the iso view shows it.
func _ground() -> MeshInstance3D:
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	var tex: Texture2D = load("res://assets/map/" + String(meta["image"]))
	var k := float(meta["pxPerM"]) / float(meta["gamePxPerM"])
	var pad := float(meta["padTop"])
	var step := 45.0
	var cols := int(Iso.WORLD.x / step) + 1
	var rows := int(Iso.WORLD.y / step) + 1
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for r in rows:
		for c in cols:
			var w := Vector2(c, r) * step
			var screen := Iso.to_screen(w)
			st.set_uv(Vector2(screen.x * k / tex.get_width(), (pad + screen.y * k) / tex.get_height()))
			st.add_vertex(at(w))
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
	var mesh := MeshInstance3D.new()
	mesh.mesh = st.commit()
	# The picture has its light and shade already: less of the sun's; the fog over it.
	mesh.material_override = field.fogged(tex, Color(0.8, 0.8, 0.78))
	return mesh


func _scene(name_: String) -> PackedScene:
	if not _scenes.has(name_):
		var path := MODELS % name_
		_scenes[name_] = load(path) if ResourceLoader.exists(path) else null
	return _scenes[name_]


## The one mesh of a static model, for drawing many at once.
func _mesh_of(name_: String) -> Mesh:
	var scene := _scene(name_)
	if scene == null:
		return null
	var node := scene.instantiate()
	var found: MeshInstance3D = node.find_children("*", "MeshInstance3D", true, false)[0] if not node.find_children("*", "MeshInstance3D", true, false).is_empty() else null
	var mesh: Mesh = found.mesh if found != null else null
	node.free()
	return mesh


## The woods, bushes, village houses and bridges as the 2D field has them:
## each picture with a model becomes that model, drawn many at once; a tree
## felled in the battle goes from here too.
func _scenery_from_sprites() -> void:
	var places := {}            # model -> Array of [sprite, transform]
	for node in battle.find_children("*", "Sprite2D", true, false):
		var sprite := node as Sprite2D
		if sprite.get_parent() is Building or sprite.get_parent() is Unit or sprite.texture == null:
			continue
		var path := sprite.texture.resource_path
		var name_ := path.get_file().get_basename()
		var size := 1.0
		var yaw := Battle.hash01(int(sprite.position.x), int(sprite.position.y)) * TAU
		if path.begins_with("res://assets/village/"):
			continue
		if path.begins_with("res://assets/props/"):
			size = sprite.scale.x / Iso.SPRITE_SCALE
		else:
			continue
		if name_.begins_with("bridge"):
			yaw = 0.0
		if not places.has(name_):
			places[name_] = []
		var world := Iso.to_world(sprite.position)
		places[name_].append([sprite, Transform3D(Basis(Vector3.UP, yaw).scaled(Vector3.ONE * size), at(world))])
	# The village houses: their pictures were drawn at VILLAGE_PPM and scaled
	# by the house's own scale; the model as long as the 2D house is.
	var village: Dictionary = Iso.read_json("res://assets/village/village.json")
	var village_ppm := float(village.get("pxPerM", 20.6452))
	var headings := int(village.get("headings", 16))
	for h: Dictionary in battle.houses:
		var model: String = HOUSES.get(h["kind"], "cottage")
		var mesh := _mesh_of(model)
		if mesh == null:
			continue
		var box := mesh.get_aabb().size
		var length_m := float(village["kinds"][h["kind"]].get("lengthM", 8.0)) * village_ppm * float(h["scale"]) / Iso.PPM
		var size := length_m / maxf(0.1, maxf(box.x, box.z))
		if not places.has(model):
			places[model] = []
		var world := Vector2(h["x"], h["y"])
		var facing := TAU * int(h["heading"]) / headings
		places[model].append([null, Transform3D(Basis(Vector3.UP, turn(facing)).scaled(Vector3.ONE * size), at(world))])
	for name_: String in places:
		var mesh := _mesh_of(name_)
		if mesh == null:
			continue
		var list: Array = places[name_]
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = mesh
		mm.instance_count = list.size()
		for i in list.size():
			mm.set_instance_transform(i, list[i][1])
			if list[i][0] != null:
				_scenery.append([list[i][0], mm, i, list[i][1]])
		var node := MultiMeshInstance3D.new()
		node.multimesh = mm
		var source := mesh.surface_get_material(0) as StandardMaterial3D
		if source != null and source.albedo_texture != null:
			node.material_override = field.fogged(source.albedo_texture, source.albedo_color)
		add_child(node)


func _process(delta: float) -> void:
	if battle == null:
		return
	_light()
	_follow_2d_camera()
	_keys(delta)
	_sync_units(delta)
	_sync_clock -= delta
	if _sync_clock <= 0.0:
		_sync_clock = 0.5
		_sync_buildings()
		_sync_scenery()
		_sync_labels()
	_fade_flashes(delta)
	_draw_aim()


## The sun goes round with the hour (east at morning, west at evening) and
## the light falls at night.
func _light() -> void:
	var hour := DayNight.hour_at(battle.clock)
	var dark := DayNight.darkness_at(battle.clock)
	var day := clampf((hour - 5.0) / 15.0, 0.0, 1.0)
	_sun.rotation = Vector3(-deg_to_rad(18.0 + 50.0 * sin(day * PI)), deg_to_rad(90.0 - 180.0 * day), 0.0)
	_sun.light_energy = 1.1 * (1.0 - dark) + 0.08
	var tint := DayNight.light_at(battle.clock, battle.weather.wetness if battle.weather != null else 0.0)
	# Warmer low in the sky, at morning and evening.
	_sun.light_color = Color(1.0, 0.95, 0.86).lerp(Color(1.0, 0.72, 0.48), 1.0 - sin(day * PI))
	_env.ambient_light_energy = 0.45 * (1.0 - dark) + 0.12
	_env.ambient_light_color = tint
	_env.background_energy_multiplier = 1.0 - 0.8 * dark
	for b: Variant in _lamps.keys():
		var lamp: OmniLight3D = _lamps[b]
		lamp.light_energy = dark * (1.2 + 0.2 * sin(battle.clock * 7.0 + lamp.position.x))


## Where the 2D camera goes (the minimap, Space, Tab), the 3D camera follows;
## and the 2D camera follows the 3D one, for the minimap's frame.
func _follow_2d_camera() -> void:
	var cam2d := battle.camera
	if _cam2d_seen != Vector2.INF and cam2d.position.distance_to(_cam2d_seen) > 1.0:
		_target = at(Iso.to_world(cam2d.position))
		_place_camera()
	cam2d.position = Iso.to_screen(flat(_target))
	_cam2d_seen = cam2d.position


func _keys(delta: float) -> void:
	var move := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		move.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		move.x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		move.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		move.y += 1.0
	if Input.is_physical_key_pressed(KEY_Q):
		_yaw += 1.6 * delta
	if Input.is_physical_key_pressed(KEY_E):
		_yaw -= 1.6 * delta
	if move != Vector2.ZERO:
		_pan(move.normalized() * delta * _distance * 0.9)
	_place_camera()


## Move the camera's aim over the ground by `by` metres (x right, y away).
func _pan(by: Vector2) -> void:
	var right := Vector3(cos(_yaw), 0.0, -sin(_yaw))
	var ahead := Vector3(-sin(_yaw), 0.0, -cos(_yaw))
	_target += right * by.x - ahead * by.y
	_target.x = clampf(_target.x, 0.0, Iso.WORLD.x / Iso.PPM)
	_target.z = clampf(_target.z, 0.0, Iso.WORLD.y / Iso.PPM)
	_target.y = Iso.height_px(flat(_target)) / Iso.PPM


func _place_camera() -> void:
	var back := Vector3(sin(_yaw), 0.0, cos(_yaw)) * cos(_pitch) + Vector3.UP * sin(_pitch)
	camera.position = _target + back * _distance
	camera.look_at(_target, Vector3.UP)


## Seen from: for screenshots and tests.
func view(world: Vector2, yaw_deg: float, pitch_deg: float, distance: float) -> void:
	_target = at(world)
	_yaw = deg_to_rad(yaw_deg)
	_pitch = deg_to_rad(pitch_deg)
	_distance = distance
	_place_camera()
	battle.camera.position = Iso.to_screen(world)
	_cam2d_seen = battle.camera.position


# ---- the men ----

func _sync_units(delta: float) -> void:
	for u in battle.units:
		var m: Dictionary = _men.get(u, {})
		if m.is_empty():
			m = _make_man(u)
			if m.is_empty():
				continue
			_men[u] = m
		var node: Node3D = m["node"]
		var seen := u.visible and u.modulate.a > 0.05
		node.visible = seen
		if not seen:
			continue
		node.position = at(u.world) - Vector3.UP * field.sink(u)
		node.rotation.y = lerp_angle(node.rotation.y, turn(u.facing), minf(1.0, delta * 10.0))
		var ring: MeshInstance3D = m["ring"]
		ring.visible = u.selected
		_animate(u, m)
	for u: Variant in _men.keys():
		if not is_instance_valid(u):
			(_men[u]["node"] as Node3D).queue_free()
			_men.erase(u)


func _model_for(u: Unit) -> String:
	var p := "fr" if u.side == "france" else "br"
	match u.type:
		"infantry":
			return "infantry_" + p
		"officer":
			return ("cavalry_" if u.troop == "mounted" else "officer_") + p
		"drummer":
			return "drummer_" + p
		"worker":
			return "worker_" + p
		"cavalry":
			return "cavalry_" + p
		"artillery":
			return "gun_" + p
	return "infantry_" + p


func _make_man(u: Unit) -> Dictionary:
	var scene := _scene(_model_for(u))
	if scene == null:
		return {}
	var node: Node3D = scene.instantiate()
	add_child(node)
	var player: AnimationPlayer = node.find_child("AnimationPlayer", true, false)
	if player != null:
		for name_ in player.get_animation_list():
			var a := player.get_animation(name_)
			a.loop_mode = Animation.LOOP_LINEAR if name_ in ["idle", "march", "walk", "trot", "gallop", "roll", "work", "farm",
				"mine", "build", "dig", "rest", "command", "charge", "rout", "haul", "look", "adjust"] else Animation.LOOP_NONE
	if u.type == "artillery":
		# The gun's crew stand by it.
		var crew := _scene("gunner_" + ("fr" if u.side == "france" else "br"))
		if crew != null:
			for i in 2:
				var man: Node3D = crew.instantiate()
				man.position = Vector3(-0.9 + i * 1.8, 0.0, 1.6)
				node.add_child(man)
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = 0.42 if u.type != "cavalry" else 1.1
	torus.outer_radius = torus.inner_radius + 0.08
	ring.mesh = torus
	var mat := StandardMaterial3D.new()
	mat.albedo_color = RING
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	ring.material_override = mat
	ring.scale = Vector3(1.0, 0.2, 1.0)
	ring.position.y = 0.05
	node.add_child(ring)
	return {"node": node, "player": player, "anim": "", "ring": ring}


## The animation of the man's state; feet going with the ground covered.
func _animate(u: Unit, m: Dictionary) -> void:
	var player: AnimationPlayer = m["player"]
	if player == null:
		return
	var want := u.anim_state if u.anim_state != "" else "idle"
	if not u.alive():
		want = "die"
	elif want in ["march", "walk", "trot", "gallop", "roll"] and not bool(u.get("_striding")):
		want = "idle"
	elif bool(u.get("_striding")) and want == "idle":
		want = "march" if player.has_animation("march") else ("walk" if player.has_animation("walk") else "roll")
	if u.type == "cavalry" or u.troop == "mounted":
		if want in ["march", "walk"]:
			want = String(u.get("_gait"))
	if not player.has_animation(want):
		want = "idle" if player.has_animation("idle") else ""
	if want == "":
		return
	if want != m["anim"]:
		m["anim"] = want
		player.play(want, 0.12)
		if want == "fire" or want == "rfire" or want == "kfire":
			_flash(u)
	if STRIDES.has(want):
		var a := player.get_animation(want)
		var speed: float = u.get("_ground_speed")
		player.speed_scale = clampf(speed * a.length / float(STRIDES[want]), 0.0, 4.0)
	else:
		player.speed_scale = 1.0


# ---- buildings, scenery, colours over the battalions ----

## The model and size of a building: the very picture the 2D field draws it
## with, as large as 2D draws it beside the men (the 2D field fits each
## building to its footprint, so sizes follow the game, not the model).
func _building_look(b: Building) -> Array:
	var sprite: Sprite2D = b.get("_sprite")
	if sprite != null and sprite.texture != null and sprite.texture.resource_path.begins_with("res://assets/props/"):
		var name_ := sprite.texture.resource_path.get_file().get_basename()
		if _scene(name_) != null:
			return [name_, sprite.scale.x / Iso.SPRITE_SCALE]
	var spec: Array = BUILDINGS.get(b.type, ["cottage", 1.0])
	var model := String(spec[0])
	if "%s" in model:
		model = model % ("fr" if b.side == "france" else "br")
	# Drawn from another picture (a mine): as wide as its footprint, like 2D.
	var mesh := _mesh_of(model)
	var size := float(spec[1])
	if mesh != null:
		var box := mesh.get_aabb().size
		size = b.size.x * 1.5 / Iso.PPM / maxf(0.1, maxf(box.x, box.z))
	return [model, size]


func _sync_buildings() -> void:
	for b in battle.buildings:
		var node: Node3D = _halls.get(b)
		if node == null:
			var look := _building_look(b)
			var model: String = look[0]
			var scene := _scene(model)
			if scene == null:
				continue
			node = scene.instantiate()
			node.position = at(b.world)
			node.scale = Vector3.ONE * float(look[1])
			node.set_meta("model", model)
			add_child(node)
			field.fog_model(node)
			_halls[b] = node
		# A farm shows its crop (its picture changes); a site goes up as it is built; a ruin sinks.
		if b.type == "farm" and String(node.get_meta("model")) != String(_building_look(b)[0]):
			node.queue_free()
			_halls.erase(b)
			continue
		node.visible = b.visible
		var up := 1.0 if b.complete else 0.25 + 0.75 * b.progress
		if not b.standing():
			up = 0.25
		node.scale.y = node.scale.x * up
		if b.standing() and b.complete and not _lamps.has(b) and b.type != "farm":
			var lamp := OmniLight3D.new()
			lamp.light_color = Color(1.0, 0.72, 0.38)
			lamp.omni_range = 10.0
			lamp.position = node.position + Vector3(0, 3.0, 2.5)
			add_child(lamp)
			_lamps[b] = lamp
	for b: Variant in _halls.keys():
		if not is_instance_valid(b):
			(_halls[b] as Node3D).queue_free()
			_halls.erase(b)
	for b: Variant in _lamps.keys():
		if not is_instance_valid(b) or not (b as Building).standing():
			(_lamps[b] as OmniLight3D).queue_free()
			_lamps.erase(b)


## A felled tree, a stripped bush: gone here too.
func _sync_scenery() -> void:
	for s: Array in _scenery:
		var sprite: Sprite2D = s[0]
		# (The 2D field is hidden as a whole: its own flags are what count.)
		var shown: bool = is_instance_valid(sprite) and sprite.visible and sprite.modulate.a > 0.1 \
			and (not (sprite.get_parent() is Supply) or (sprite.get_parent() as Supply).visible)
		var mm: MultiMesh = s[1]
		mm.set_instance_transform(s[2], s[3] if shown else Transform3D(Basis().scaled(Vector3.ZERO), Vector3.ZERO))


## Each battalion's name and strength over it, in its side's colour.
func _sync_labels() -> void:
	for r in battle.regiments:
		var label: Label3D = _labels.get(r)
		if r.destroyed():
			if label != null:
				label.queue_free()
				_labels.erase(r)
			continue
		if label == null:
			label = Label3D.new()
			label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
			label.no_depth_test = true
			label.font_size = 40
			label.pixel_size = 0.012
			label.outline_size = 10
			add_child(label)
			_labels[r] = label
		var visible_ := r.living().any(func(u: Unit) -> bool: return u.visible)
		label.visible = visible_
		label.position = at(r.centroid()) + Vector3(0, 4.2, 0)
		label.modulate = Color(0.55, 0.7, 1.0) if r.side == "france" else Color(1.0, 0.5, 0.45)
		if r in battle.selected:
			label.modulate = RING
		label.text = "%s · %d" % [r.name, r.strength()]


# ---- light of a shot ----

func _flash(u: Unit) -> void:
	var flash := _flash_pool[_flash_next]
	_flash_next = (_flash_next + 1) % _flash_pool.size()
	flash.position = at(u.world) + Vector3.UP * 1.4
	flash.light_energy = 2.5 if u.type == "artillery" else 1.2
	flash.visible = true
	flash.set_meta("life", 0.12)


func _fade_flashes(delta: float) -> void:
	for flash in _flash_pool:
		if not flash.visible:
			continue
		var life: float = flash.get_meta("life", 0.0) - delta
		flash.set_meta("life", life)
		flash.light_energy *= 0.7
		if life <= 0.0:
			flash.visible = false


# ---- the pointer and the fingers ----

## The ground point under a screen point.
func ground_at(screen: Vector2) -> Vector2:
	var from := camera.project_ray_origin(screen)
	var way := camera.project_ray_normal(screen)
	var y := _target.y
	var hit := from
	for i in 5:
		if absf(way.y) < 0.0001:
			break
		var t := (y - from.y) / way.y
		hit = from + way * t
		y = Iso.height_px(flat(hit)) / Iso.PPM
	var world := flat(hit)
	return Vector2(clampf(world.x, 0.0, Iso.WORLD.x), clampf(world.y, 0.0, Iso.WORLD.y))


func _unhandled_input(event: InputEvent) -> void:
	if _touch(event):
		get_viewport().set_input_as_handled()
		return
	var motion := event as InputEventMouseMotion
	if motion != null:
		if motion.button_mask & MOUSE_BUTTON_MASK_MIDDLE:
			_pan(Vector2(-motion.relative.x, motion.relative.y) * _distance * 0.0016)
			_place_camera()
		elif _box_from != null:
			_draw_box(_box_from, motion.position)
		get_viewport().set_input_as_handled()
		return
	var button := event as InputEventMouseButton
	if button == null:
		return
	get_viewport().set_input_as_handled()
	var finger := button.device == InputEvent.DEVICE_ID_EMULATION
	if finger and not Battle.touched:
		Battle.touched = true
		battle.refresh_hud()
	match button.button_index:
		MOUSE_BUTTON_WHEEL_UP:
			_distance = maxf(10.0, _distance / 1.12)
			_place_camera()
		MOUSE_BUTTON_WHEEL_DOWN:
			_distance = minf(260.0, _distance * 1.12)
			_place_camera()
		MOUSE_BUTTON_LEFT:
			if button.pressed:
				if _touches.size() >= 2:
					return
				if battle.placing != "":
					battle.place(ground_at(button.position))
					return
				if finger and not battle.box_mode and not battle.selected_units.is_empty() and _man_at(button.position) == null:
					_order_from = ground_at(button.position)
					return
				_box_from = button.position
			elif _order_from != null:
				_give_order(button.position)
			elif _box_from != null:
				_select(_box_from, button.position, button.shift_pressed)
				_box_from = null
		MOUSE_BUTTON_RIGHT:
			if battle.placing != "":
				if button.pressed:
					battle.placing = ""
				return
			if button.pressed:
				_order_from = ground_at(button.position)
			elif _order_from != null:
				_give_order(button.position)


func _give_order(screen: Vector2) -> void:
	var to: Vector2 = _order_from
	var end := ground_at(screen)
	_order_from = null
	battle.order(to, (end - to).angle() if end.distance_to(to) > Battle.AIM_DRAG else null)


## The nearest of our men under a screen point (within 22 px).
func _man_at(screen: Vector2) -> Unit:
	var best: Unit = null
	var near := 22.0
	for u in battle.units:
		if not u.alive() or u.side != battle.me:
			continue
		var p := at(u.world) + Vector3.UP * 0.9
		if camera.is_position_behind(p):
			continue
		var d := camera.unproject_position(p).distance_to(screen)
		if d < near:
			near = d
			best = u
	return best


## A click picks a man (his whole battalion) or a building; a drag every man
## of ours inside it (soldiers before peasants).
func _select(from: Vector2, to: Vector2, add: bool) -> void:
	var box := Rect2(from, Vector2.ZERO).expand(to)
	if battle.box_mode and box.size.length() >= 6.0:
		battle.box_mode = false
		battle.refresh_hud()
	if box.size.length() < 6.0:
		var man := _man_at(to)
		if man != null:
			var picked: Array[Unit] = []
			if man.regiment != null and not man.regiment.routing:
				picked.append_array(man.regiment.living())
			else:
				picked.append(man)
			battle.select_units(picked, add)
			return
		battle.select_building(battle.call("_thing_at", ground_at(to), false) as Building)
		return
	var picked: Array[Unit] = []
	var soldiers: Array[Unit] = []
	for u in battle.units:
		if not u.alive() or u.side != battle.me:
			continue
		var p := at(u.world) + Vector3.UP * 0.9
		if not camera.is_position_behind(p) and box.has_point(camera.unproject_position(p)):
			picked.append(u)
			if u.military():
				soldiers.append(u)
	battle.select_units(soldiers if not soldiers.is_empty() else picked, add)


## The selection box on the screen (the 2D overlay is hidden: a frame of our own).
func _draw_box(from: Vector2, to: Vector2) -> void:
	var rect := Rect2(from, Vector2.ZERO).expand(to)
	_box.position = rect.position
	_box.size = rect.size
	_box.visible = rect.size.length() >= 6.0


## The golden arrow of an order being dragged out, on the ground.
func _draw_aim() -> void:
	if _box_from == null:
		_box.visible = false
	var mesh: ImmediateMesh = _aim.mesh
	mesh.clear_surfaces()
	if _order_from == null or battle.selected.is_empty():
		return
	var mouse := get_viewport().get_mouse_position()
	var from: Vector2 = _order_from
	var end := ground_at(mouse)
	if end.distance_to(from) <= Battle.AIM_DRAG:
		return
	var way := (end - from).normalized()
	var right := way.orthogonal()
	var width := 0.0
	for r in battle.selected:
		width += ceilf(float(r.strength()) / Regiment.RANKS) * Regiment.FILE_GAP
	var half := maxf(30.0, width / 2.0)
	var lift := Vector3.UP * 0.25
	mesh.surface_begin(Mesh.PRIMITIVE_LINES)
	for pair: Array in [[from - right * half, from + right * half], [from, from + way * 70.0],
			[from + way * 70.0, from + way * 52.0 + right * 12.0], [from + way * 70.0, from + way * 52.0 - right * 12.0]]:
		mesh.surface_add_vertex(at(pair[0]) + lift)
		mesh.surface_add_vertex(at(pair[1]) + lift)
	mesh.surface_end()


## Two fingers: move and pinch.
func _touch(event: InputEvent) -> bool:
	var press := event as InputEventScreenTouch
	if press != null:
		if press.pressed:
			_touches[press.index] = press.position
		else:
			_touches.erase(press.index)
		if _touches.size() >= 2:
			_box_from = null
			_order_from = null
			_spread = _finger_spread()
		return true
	var drag := event as InputEventScreenDrag
	if drag != null:
		if not _touches.has(drag.index):
			return true
		_touches[drag.index] = drag.position
		if _touches.size() >= 2:
			_pan(Vector2(-drag.relative.x, drag.relative.y) / _touches.size() * _distance * 0.0016)
			var spread := _finger_spread()
			if _spread > 0.0 and spread > 0.0:
				_distance = clampf(_distance * _spread / spread, 10.0, 260.0)
			_spread = spread
			_place_camera()
		return true
	var magnify := event as InputEventMagnifyGesture
	if magnify != null:
		_distance = clampf(_distance / magnify.factor, 10.0, 260.0)
		_place_camera()
		return true
	var pan := event as InputEventPanGesture
	if pan != null:
		_pan(pan.delta * _distance * 0.02)
		_place_camera()
		return true
	return false


func _finger_spread() -> float:
	var points: Array = _touches.values()
	return (points[0] as Vector2).distance_to(points[1]) if points.size() >= 2 else 0.0


## Men drawn in 3D: tests.
func men_shown() -> int:
	var n := 0
	for u: Variant in _men:
		if (_men[u]["node"] as Node3D).visible:
			n += 1
	return n
