class_name Battle
extends Node2D
## The battle: the web game's map and soldiers in Godot. France (the player)
## and Britain (the computer) each field three battalions on open ground east
## of the river. Select with a click or a dragged box, order with a right
## click (drag it to set the facing); the camera pans with WASD, the arrow
## keys or the middle mouse button and zooms with the wheel.

const ARMY := 3              # battalions a side
const MEN := 24              # men a battalion
const FRANCE_X := 4300.0
const BRITAIN_X := 5500.0
const LINE_YS := [2950.0, 3250.0, 3550.0]
const AI_EVERY := 2.5
const DEPLOY_AT := 480.0     # the computer forms line this close to the enemy
const CHARGE_ODDS := 1.6     # and charges when this much stronger

var regiments: Array[Regiment] = []
var selected: Array[Regiment] = []
var result := ""

var _units: Node2D
var _effects: Node2D
var _overlay: Overlay
var _camera: BattleCamera
var _hud: Hud
var _smoke: Texture2D
var _ai_clock := 0.0
var _drag_start: Variant = null      # canvas point where a left drag began
var _order_start: Variant = null     # world point where a right drag began


func _ready() -> void:
	randomize()
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	Iso.load_relief(meta)
	_add_ground(meta)
	_units = Node2D.new()
	_units.name = "Units"
	_units.y_sort_enabled = true
	add_child(_units)
	_effects = Node2D.new()
	_effects.name = "Effects"
	_effects.z_index = 10
	add_child(_effects)
	_overlay = Overlay.new()
	_overlay.battle = self
	_overlay.z_index = 20
	add_child(_overlay)
	_add_trees()
	_smoke = _puff_texture()
	for i in ARMY:
		_add_regiment("%de Ligne" % (i + 1), "france", "fr", Vector2(FRANCE_X, LINE_YS[i]), 0.0)
		_add_regiment("%dth Foot" % (i + 1), "britain", "br", Vector2(BRITAIN_X, LINE_YS[i]), PI)
	_camera = BattleCamera.new()
	add_child(_camera)
	_camera.focus(Iso.to_screen(Vector2((FRANCE_X + BRITAIN_X) / 2.0, LINE_YS[1])))
	_hud = Hud.new()
	add_child(_hud)


func _process(delta: float) -> void:
	for r in regiments:
		r.update(delta, regiments)
	_ai_clock -= delta
	if _ai_clock <= 0.0:
		_ai_clock = AI_EVERY
		_command_britain()
	for r in selected.duplicate():
		if r.destroyed() or r.routing:
			for s in r.soldiers:
				s.selected = false
			selected.erase(r)
	_check_result()
	_hud.show_state(self)


# ---- the field ----

func _add_ground(meta: Dictionary) -> void:
	var ground := Sprite2D.new()
	ground.name = "Ground"
	ground.texture = load("res://assets/map/" + String(meta["image"]))
	ground.centered = false
	# The picture holds pxPerM to a metre; the canvas holds the game's 22.5.
	var k := float(meta["pxPerM"]) / float(meta["gamePxPerM"])
	ground.scale = Vector2.ONE / k
	ground.position = Vector2(0.0, -float(meta.get("padTop", 0.0)) / k)
	ground.z_index = -10
	add_child(ground)


## Trees in the woods of the web game's map, kept off its roads and river.
func _add_trees() -> void:
	var map: Dictionary = Iso.read_json("res://assets/map/gamemap.json")
	var props: Dictionary = Iso.read_json("res://assets/props/props.json")["props"]
	var kinds := ["oak", "beech", "oak", "pine", "spruce", "birch"]
	var textures := {}
	for kind in props:
		textures[kind] = load("res://assets/props/%s.webp" % kind)
	var rng := RandomNumberGenerator.new()
	rng.seed = 1807
	for wood: Dictionary in map["woods"]:
		var x0 := float(wood["x"])
		var y0 := float(wood["y"])
		var y := y0 + 30.0
		while y < y0 + float(wood["h"]) - 10.0:
			var x := x0 + 30.0
			while x < x0 + float(wood["w"]) - 10.0:
				var at := Vector2(x + rng.randf_range(-25.0, 25.0), y + rng.randf_range(-20.0, 20.0))
				x += 70.0
				if rng.randf() < 0.12 or _on_way(map, at):
					continue
				var kind: String = kinds[rng.randi() % kinds.size()]
				var prop: Dictionary = props[kind]
				var tree := Sprite2D.new()
				tree.texture = textures[kind]
				tree.centered = false
				tree.offset = -Vector2(prop["pivot"]["x"], prop["pivot"]["y"])
				tree.scale = Vector2.ONE * Iso.SPRITE_SCALE * rng.randf_range(0.5, 0.75)
				tree.position = Iso.to_screen(at)
				_units.add_child(tree)
			y += 62.0


func _on_way(map: Dictionary, at: Vector2) -> bool:
	for road: Dictionary in map["roads"]:
		if _near_line(road["points"], at, float(road.get("width", 60)) / 2.0 + 14.0):
			return true
	var river: Dictionary = map["river"]
	return _near_line(river["points"], at, float(river["width"]) / 2.0 + 40.0)


func _near_line(points: Array, at: Vector2, reach: float) -> bool:
	for i in range(1, points.size()):
		var a := Vector2(points[i - 1][0], points[i - 1][1])
		var b := Vector2(points[i][0], points[i][1])
		if Geometry2D.get_closest_point_to_segment(at, a, b).distance_to(at) < reach:
			return true
	return false


# ---- armies ----

func _add_regiment(title: String, side: String, look: String, at: Vector2, face: float) -> Regiment:
	var regiment := Regiment.new(title, side)
	regiment.facing = face
	regiment.destination = at
	for i in MEN:
		var soldier := Soldier.new()
		soldier.setup(side, look, at, face)
		soldier.fired.connect(_on_fired)
		_units.add_child(soldier)
		regiment.add(soldier)
	regiment.order_move(at, face)
	# Start in place, not walking there.
	for s in regiment.soldiers:
		s.world = s.slot
		s.position = Iso.to_screen(s.world)
	regiments.append(regiment)
	return regiment


## The computer's battalions close to musket range of the nearest French one,
## in column while far off and deploying into line once near.
func _command_britain() -> void:
	for r in regiments:
		if r.side != "britain" or r.routing or r.destroyed() or r.charging != null:
			continue
		# A much stronger battalion in a firefight goes in with the bayonet.
		if r.enemy != null:
			if r.strength() > r.enemy.strength() * CHARGE_ODDS:
				r.charge(regiments)
			continue
		var here := r.centroid()
		var target: Regiment = null
		var best := INF
		for other in regiments:
			if other.side == "france" and not other.routing and not other.destroyed():
				var d := other.centroid().distance_to(here)
				if d < best:
					best = d
					target = other
		if target == null:
			continue
		var near := best < DEPLOY_AT
		if r.moving() and (r.formation == "line" or not near):
			continue
		r.set_formation("line" if near else "column")
		var there := target.centroid()
		var stand := there + (here - there).normalized() * (Regiment.RANGE - 30.0)
		r.order_move(stand, (there - stand).angle())


# ---- musketry ----

func _on_fired(soldier: Soldier) -> void:
	_puff(soldier.muzzle(), 0.55, 2.6)
	var target_regiment := soldier.regiment.enemy if soldier.regiment != null else null
	if target_regiment == null:
		return
	var men := target_regiment.living()
	if men.is_empty():
		return
	var target: Soldier = men.pick_random()
	var distance := soldier.world.distance_to(target.world)
	var chance := clampf(0.45 - distance / 600.0, 0.06, 0.4) * soldier.regiment.fire_factor()
	if randf() < chance:
		target.hit(randf_range(45.0, 100.0))


func _puff(world_at: Vector2, size: float, life: float) -> void:
	var puff := Sprite2D.new()
	puff.texture = _smoke
	puff.position = Iso.to_screen(world_at) + Vector2(0.0, -10.0)
	puff.scale = Vector2.ONE * size * 0.4
	puff.modulate = Color(0.93, 0.92, 0.88, 0.85)
	_effects.add_child(puff)
	var tween := puff.create_tween().set_parallel(true)
	tween.tween_property(puff, "scale", Vector2.ONE * size * 1.6, life)
	tween.tween_property(puff, "position", puff.position + Vector2(randf_range(4.0, 14.0), -16.0), life)
	tween.tween_property(puff, "modulate:a", 0.0, life).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(puff.queue_free)


func _puff_texture() -> Texture2D:
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 0.9))
	gradient.set_color(1, Color(1, 1, 1, 0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 64
	texture.height = 64
	return texture


# ---- orders ----

func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo:
		match key.physical_keycode:
			KEY_R:
				if result != "":
					get_tree().reload_current_scene()
			KEY_1:
				set_formation("line")
			KEY_2:
				set_formation("column")
			KEY_C:
				charge()
		return
	if event is InputEventMouseMotion and _drag_start != null:
		_overlay.box = Rect2(_drag_start, Vector2.ZERO).expand(get_global_mouse_position())
		return
	var button := event as InputEventMouseButton
	if button == null:
		return
	var canvas_at := get_global_mouse_position()
	if button.button_index == MOUSE_BUTTON_LEFT:
		if button.pressed:
			_drag_start = canvas_at
		elif _drag_start != null:
			var box := Rect2(_drag_start, Vector2.ZERO).expand(canvas_at)
			_drag_start = null
			_overlay.box = Rect2()
			_select_at(box, button.shift_pressed)
	elif button.button_index == MOUSE_BUTTON_RIGHT:
		if button.pressed:
			_order_start = Iso.to_world(canvas_at)
		elif _order_start != null:
			var to: Vector2 = _order_start
			var end := Iso.to_world(canvas_at)
			_order_start = null
			var face: Variant = (end - to).angle() if end.distance_to(to) > 25.0 else null
			_order(to, face)


func _select_at(box: Rect2, add: bool) -> void:
	var picked: Array[Regiment] = []
	var click := box.size.length() < 6.0
	var best := 14.0
	for r in regiments:
		if r.side != "france" or r.routing:
			continue
		for s in r.living():
			if click:
				var d := s.position.distance_to(box.position)
				if d < best:
					best = d
					picked.clear()
					picked.append(r)
			elif box.has_point(s.position) and not picked.has(r):
				picked.append(r)
	_select(picked, add)


func _select(picked: Array[Regiment], add: bool) -> void:
	if not add:
		for r in selected:
			for s in r.soldiers:
				s.selected = false
		selected.clear()
	for r in picked:
		if not selected.has(r):
			selected.append(r)
	for r in selected:
		for s in r.living():
			s.selected = true


## Several battalions stand side by side across the line of march.
func _order(to: Vector2, face: Variant) -> void:
	if selected.is_empty():
		return
	var from := Vector2.ZERO
	for r in selected:
		from += r.centroid()
	from /= selected.size()
	var facing: float = float(face) if face != null else (to - from).angle()
	var right := Vector2.from_angle(facing).orthogonal() * -1.0
	var widths: Array[float] = []
	var total := 0.0
	for r in selected:
		var w := ceilf(float(r.strength()) / Regiment.RANKS) * Regiment.FILE_GAP + 40.0
		widths.append(w)
		total += w
	# Left to right as they stand now, so they do not cross.
	var order := selected.duplicate()
	order.sort_custom(func(a: Regiment, b: Regiment) -> bool:
		return a.centroid().dot(right) < b.centroid().dot(right))
	var offset := -total / 2.0
	for i in order.size():
		var r: Regiment = order[i]
		var w: float = widths[selected.find(r)]
		r.order_move(to + right * (offset + w / 2.0), facing)
		offset += w
	_overlay.mark(Iso.to_screen(to))


func set_formation(kind: String) -> void:
	for r in selected:
		r.set_formation(kind)


func charge() -> void:
	for r in selected:
		r.charge(regiments)


func _check_result() -> void:
	if result != "":
		return
	var standing := {"france": 0, "britain": 0}
	for r in regiments:
		if not r.routing and not r.destroyed():
			standing[r.side] += 1
	if standing["britain"] == 0:
		result = "Overwinning! De Britten zijn verdreven."
	elif standing["france"] == 0:
		result = "Nederlaag. Uw bataljons zijn gebroken."
