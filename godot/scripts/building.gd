class_name Building
extends Node2D
## A building of the web game, drawn with its art: the town centre and
## barracks (the Blender barracks), houses (a cottage), stable and foundry (a
## barn), tower, field hospital, lumber camp and mine (the web game's own
## drawings), and fields drawn here. It rises while peasants work on it,
## trains units in a queue, and a field grows grain for its farmers.

const PROP := {"towncenter": "barracks", "barracks": "barracks", "house": "cottage", "stable": "barn",
	"foundry": "barn", "tower": "tower", "hospital": "hospital"}
const SIDED := ["barracks", "tower", "hospital"]

var id := 0
var side := "france"
var type := "house"
var battle: Battle
var world := Vector2.ZERO
var size := Vector2(60, 50)
var hp := 100.0
var max_hp := 100.0
var complete := true
var progress := 1.0          # share built
var queue: Array[String] = []
var production := 0.0        # share of the first in the queue done
var crop := 0.0              # grain standing on a field
var tower_level := 1
## Where trained men go (right click with the building selected), or null.
var rally: Variant = null
## A barracks forms a battalion by itself once enough men are free near it.
var auto_regiment := false
var upgrade_to := 0          # the level a tower is being strengthened to
var upgrade_progress := 0.0
var selected := false:
	set(value):
		selected = value
		queue_redraw()

var _sprite: Sprite2D


func setup(battle_: Battle, side_: String, type_: String, at: Vector2, built: bool) -> void:
	battle = battle_
	side = side_
	type = type_
	world = at
	var info := Rules.building_type(type)
	size = Vector2(float(info.get("w", 60)), float(info.get("h", 50)))
	max_hp = float(info.get("hp", 500))
	complete = built
	progress = 1.0 if built else 0.0
	hp = max_hp if built else max_hp * 0.1
	crop = Rules.FARM_CAPACITY / 3.0 if built else 0.0
	position = Iso.to_screen(world)
	_add_art()
	_show_progress()


func _add_art() -> void:
	if type == "farm":
		return
	_sprite = Sprite2D.new()
	_sprite.centered = false
	var nation := "france" if side == "france" else "britain"
	if type in ["lumbercamp", "mine"]:
		# The web game draws these sites 1.5 footprints wide, foot at 0.64 of 224.
		_sprite.texture = load("res://assets/art/%s_%s.png" % [type, nation])
		var k := size.x * 1.5 / 256.0
		_sprite.scale = Vector2.ONE * k
		_sprite.offset = -Vector2(128, 144)
	else:
		var prop_name: String = PROP.get(type, "cottage")
		if prop_name in SIDED:
			prop_name += "_fr" if side == "france" else "_br"
		var prop: Dictionary = battle.props[prop_name]
		_sprite.texture = load("res://assets/props/%s.webp" % prop_name)
		_sprite.offset = -Vector2(prop["pivot"]["x"], prop["pivot"]["y"])
		var k := size.x * 1.45 / float(prop["w"])
		if type == "tower":
			k = Iso.SPRITE_SCALE * 0.55
		elif type == "hospital":
			k = Iso.SPRITE_SCALE * 0.7
		_sprite.scale = Vector2.ONE * k
	add_child(_sprite)


func standing() -> bool:
	return hp > 0.0


## How close a peasant must come to work on it or deliver to it.
func reach_radius() -> float:
	return maxf(size.x, size.y) * 0.62 + 8.0


func raise(amount: float) -> void:
	if complete:
		return
	progress = minf(1.0, progress + amount)
	hp = maxf(hp, max_hp * progress)
	if progress >= 1.0:
		complete = true
		hp = max_hp
		if type == "farm":
			crop = Rules.FARM_CAPACITY / 3.0
	_show_progress()


func hit(damage: float) -> void:
	if not standing():
		return
	hp -= damage
	queue_redraw()
	if hp <= 0.0:
		hp = 0.0
		battle.on_destroyed(self)
		_collapse()


func _collapse() -> void:
	var fade := create_tween()
	fade.tween_property(self, "modulate", Color(0.3, 0.28, 0.25, 0.0), 2.5)
	fade.tween_callback(hide)


const HOSPITAL_REACH := 160.0
const HEAL_SHARE := 0.025    # of a man's health a second

var _reload := 0.0


func step(delta: float) -> void:
	if not standing() or not complete:
		return
	if type == "tower":
		_strengthen(delta)
		_guard(delta)
	elif type == "hospital":
		battle.heal_near(world, side, HOSPITAL_REACH, HEAL_SHARE * delta)
	if type == "farm":
		var farmers := battle.farmers_on(self)
		if farmers > 0:
			crop = minf(Rules.FARM_CAPACITY, crop + Rules.FARM_REGROW * delta)
		queue_redraw()
	if queue.is_empty():
		return
	var item := queue[0]
	production += delta / Rules.item_time(item)
	if production < 1.0:
		return
	if not battle.has_room(side, Rules.item_type(item)):
		production = 0.99
		return
	queue.pop_front()
	production = 0.0
	battle.spawn_trained(self, item)


## A musketry tower fires its garrison's shots at the nearest enemy in reach;
## each level reaches further, fires more often and harder.
func _guard(delta: float) -> void:
	_reload -= delta
	if _reload > 0.0:
		return
	var level := Rules.tower_level(tower_level)
	var foe := battle.nearest_foe(world, side, float(level["range"]))
	if not foe is Unit:
		_reload = 0.4
		return
	_reload = float(level["reload"]) * randf_range(0.9, 1.1)
	battle.tower_fires(self, foe as Unit, int(level["shots"]), float(level["damage"]))


## Start strengthening a finished tower to its next level (paid by the caller).
func can_upgrade() -> bool:
	return type == "tower" and complete and standing() and upgrade_to == 0 and not Rules.tower_level(tower_level + 1).is_empty()


func start_upgrade() -> void:
	upgrade_to = tower_level + 1
	upgrade_progress = 0.0


## The garrison builds while it keeps firing; the damage share stays (an
## upgrade is not a free repair).
func _strengthen(delta: float) -> void:
	if upgrade_to == 0:
		return
	var next := Rules.tower_level(upgrade_to)
	upgrade_progress = minf(1.0, upgrade_progress + delta / float(next.get("seconds", 20)))
	queue_redraw()
	if upgrade_progress < 1.0:
		return
	hp = hp / max_hp * float(next["hp"])
	max_hp = float(next["hp"])
	tower_level = upgrade_to
	upgrade_to = 0
	upgrade_progress = 0.0
	if _sprite != null:
		_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE * (0.55 + 0.04 * (tower_level - 1))
	battle.refresh_hud()
	battle.say("%s gereed · niveau %d/3." % [next["label"], tower_level], side)


## Online: what the client needs to show this building.
func net_state() -> Array:
	return [id, side, type, roundi(world.x), roundi(world.y), snappedf(hp, 0.1), max_hp, complete, snappedf(progress, 0.001),
		queue.duplicate(), snappedf(production, 0.001), snappedf(crop, 0.1), tower_level, upgrade_to, snappedf(upgrade_progress, 0.001),
		rally, auto_regiment]


## Online, on the client: take on the host's state for this building.
func net_apply(a: Array) -> void:
	var was_standing := standing()
	hp = a[5]
	max_hp = a[6]
	complete = a[7]
	progress = a[8]
	queue.assign(a[9])
	production = a[10]
	crop = a[11]
	if tower_level != a[12] and _sprite != null:
		_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE * (0.55 + 0.04 * (int(a[12]) - 1))
	tower_level = a[12]
	upgrade_to = a[13]
	upgrade_progress = a[14]
	rally = a[15]
	auto_regiment = a[16]
	_show_progress()
	if was_standing and not standing():
		battle.on_destroyed(self)
		_collapse()


func _show_progress() -> void:
	if _sprite != null:
		_sprite.modulate = Color(1, 1, 1, 1) if complete else Color(1, 1, 1, 0.3 + 0.5 * progress)
	queue_redraw()


func _draw() -> void:
	if type == "farm":
		_draw_field()
	var ground := Rect2(-size.x / 2.0, -size.y * Iso.SQ / 2.0, size.x, size.y * Iso.SQ)
	if selected:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, Iso.SQ))
		draw_arc(Vector2.ZERO, maxf(size.x, size.y) * 0.62, 0.0, TAU, 40, Color(1.0, 0.86, 0.35, 0.9), 2.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	if selected or hp < max_hp or not complete:
		var bar := Rect2(Vector2(-24.0, ground.position.y - 56.0), Vector2(48.0, 4.0))
		draw_rect(bar, Color(0, 0, 0, 0.6))
		var share := progress if not complete else hp / max_hp
		var colour := Color(0.95, 0.8, 0.35) if not complete else Color(0.85, 0.2, 0.15).lerp(Color(0.35, 0.8, 0.3), share)
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * share, bar.size.y)), colour)
	if upgrade_to != 0:
		var bar := Rect2(Vector2(-24.0, ground.position.y - 49.0), Vector2(48.0, 3.0))
		draw_rect(bar, Color(0, 0, 0, 0.5))
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * upgrade_progress, bar.size.y)), Color(0.95, 0.8, 0.35))
	if complete and not queue.is_empty():
		var bar := Rect2(Vector2(-24.0, ground.position.y - 49.0), Vector2(48.0, 3.0))
		draw_rect(bar, Color(0, 0, 0, 0.5))
		draw_rect(Rect2(bar.position, Vector2(bar.size.x * production, bar.size.y)), Color(0.6, 0.75, 1.0))


## A ploughed field in furrows, golden as the grain stands.
func _draw_field() -> void:
	var w := size.x
	var h := size.y * Iso.SQ
	var corners := PackedVector2Array([Vector2(-w / 2, -h / 2), Vector2(w / 2, -h / 2), Vector2(w / 2, h / 2), Vector2(-w / 2, h / 2)])
	var ripe := crop / Rules.FARM_CAPACITY if complete else 0.0
	var soil := Color(0.42, 0.32, 0.2, 0.35 + 0.55 * progress)
	draw_colored_polygon(corners, soil.lerp(Color(0.78, 0.66, 0.3), ripe * 0.85))
	var rows := 9
	for i in rows + 1:
		var y := -h / 2 + h * i / rows
		draw_line(Vector2(-w / 2, y), Vector2(w / 2, y), Color(0.3, 0.22, 0.12, 0.45), 1.0)
	draw_polyline(corners + PackedVector2Array([corners[0]]), Color(0.36, 0.27, 0.15, 0.9), 1.5)
