class_name Unit
extends Node2D
## A man (or a gun) on the field, of any of the web game's types: peasant,
## musketeer, officer, drummer, horseman or gun. He walks to his `slot`; a
## peasant works at his task, a soldier fights: in a battalion he fires on
## the battalion's enemy, on his own he picks the nearest enemy in reach.
## The battle moves everyone each frame and resolves shots and blows.

signal fired(unit: Unit, target: Node2D)

enum State { IDLE, MOVE, AIM, FIRE, RELOAD, WORK, DEAD }

const AIM_TIME := Vector2(0.6, 1.6)
const LOOK_AROUND := 0.5     # seconds between looks for a target
const SETS := {"infantry": ["%s_iso_infantry", "%s_iso_fallen"], "worker": ["%sw_iso_worker"],
	"officer": ["%so_iso_officer"], "drummer": ["%sd_iso_drummer"],
	"cavalry": ["%sc_iso_cavalry", "%sc_iso_cavfight"], "artillery": ["%sg_iso_gun"]}
const MOVE_ANIM := {"cavalry": "walk", "artillery": "roll"}

var id := 0
var side := "france"
var type := "infantry"
var battle: Battle
var regiment: Regiment
var world := Vector2.ZERO
var slot := Vector2.ZERO
var facing := 0.0
var hp := 100.0
var max_hp := 100.0
var speed := 57.0
var state := State.IDLE
## A peasant's work: "", "gather", "deliver", "build", "farm".
var task := ""
var task_target: Node2D = null
var last_supply: Supply = null
var carry := 0.0
var carry_type := ""
## A free soldier's foe, and whether he was told to go somewhere.
var target: Node2D = null
var ordered := false
var selected := false:
	set(value):
		if value != selected:
			selected = value
			queue_redraw()

var _sprite: AnimatedSprite2D
var _prefix := "fr"
var _anim := ""
var _clock := 0.0
var _look := 0.0


func setup(battle_: Battle, side_: String, type_: String, at: Vector2) -> void:
	battle = battle_
	side = side_
	type = type_
	world = at
	slot = at
	facing = 0.0 if side == "france" else PI
	_prefix = "fr" if side == "france" else "br"
	var info := Rules.unit_type(type)
	max_hp = float(info.get("hp", 100))
	hp = max_hp
	speed = float(info.get("speed", 57))
	_sprite = AnimatedSprite2D.new()
	_sprite.centered = false
	_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE
	add_child(_sprite)
	_wear(SETS.get(type, SETS["infantry"]))
	position = Iso.to_screen(world)
	_play("idle")


func alive() -> bool:
	return state != State.DEAD


func military() -> bool:
	return type != "worker"


func reach() -> float:
	return float(Rules.unit_type(type).get("range", 20))


func pop() -> int:
	return int(Rules.unit_type(type).get("pop", 1))


func move_to(at: Vector2) -> void:
	slot = at
	ordered = true
	target = null


func step(delta: float) -> void:
	if state == State.DEAD:
		return
	_clock -= delta
	if regiment != null:
		_step_in_regiment(delta)
	elif type == "worker":
		_step_worker(delta)
	else:
		_step_free(delta)
	position = Iso.to_screen(world)


## Walk towards `to`; true once there.
func walk(to: Vector2, delta: float, pace := 1.0) -> bool:
	var way := to - world
	if way.length() <= 3.0:
		return true
	world += way.limit_length(speed * pace * delta)
	facing = way.angle()
	state = State.MOVE
	_play(MOVE_ANIM.get(type, "march"))
	return false


func idle() -> void:
	state = State.IDLE
	_play("idle")


func _step_in_regiment(delta: float) -> void:
	var r := regiment
	if not walk(slot, delta, r.speed_factor() if not r.routing else 1.4):
		return
	if r.routing or type != "infantry":
		facing = r.facing
		idle()
		return
	var foe := r.enemy
	if foe == null:
		# No battalion before it: the men fire on any enemy in musket reach.
		_look -= delta
		if _look <= 0.0:
			_look = LOOK_AROUND
			target = battle.nearest_foe(world, side, reach())
		if target == null or not battle.is_foe(target, side):
			facing = r.facing
			idle()
			return
		facing = (Battle.spot(target) - world).angle()
		_fire_cycle(target)
		return
	facing = (foe.centroid() - world).angle()
	var men := foe.living()
	if men.is_empty():
		return
	_fire_cycle(men.pick_random())


func _step_free(delta: float) -> void:
	if ordered:
		if walk(slot, delta):
			ordered = false
			idle()
		return
	_look -= delta
	if _look <= 0.0:
		_look = LOOK_AROUND
		if not battle.is_foe(target, side) or world.distance_to(Battle.spot(target)) > reach() * 1.3 + 40.0:
			target = battle.nearest_foe(world, side, _engage_reach())
	if target == null:
		if not walk(slot, delta):
			return
		idle()
		return
	var at := Battle.spot(target)
	if type == "cavalry":
		# Horsemen ride at their foe and strike when they reach him.
		if world.distance_to(at) > reach():
			walk(at, delta, 1.35)
			_play("gallop")
			return
		facing = (at - world).angle()
		if _clock <= 0.0:
			_clock = float(Rules.unit_type(type).get("reload", 1.0))
			_play("slash", true)
			fired.emit(self, target)
		return
	if world.distance_to(at) > reach():
		walk(at, delta)
		return
	facing = (at - world).angle()
	_fire_cycle(target)


func _engage_reach() -> float:
	return 240.0 if type == "cavalry" else reach() + 60.0


## Aim, fire, reload; a gun has no aim or reload pictures and only fires.
func _fire_cycle(foe: Node2D) -> void:
	var reload := float(Rules.unit_type(type).get("reload", 3.0))
	match state:
		State.AIM:
			if type != "artillery":
				_play("aim")
			if _clock <= 0.0:
				state = State.FIRE
				_clock = 0.3
				_play("fire", true)
				fired.emit(self, foe)
		State.FIRE:
			if _clock <= 0.0:
				state = State.RELOAD
				_clock = reload * randf_range(1.4, 2.1)
				_play("idle" if type == "artillery" else "reload", true)
		State.RELOAD:
			if _clock <= 0.0:
				state = State.AIM
				_clock = randf_range(AIM_TIME.x, AIM_TIME.y)
		_:
			state = State.AIM
			_clock = randf_range(AIM_TIME.x, AIM_TIME.y)
			_play("idle" if type == "artillery" else "aim")


# ---- peasants ----

func _step_worker(delta: float) -> void:
	match task:
		"gather":
			_gather(delta)
		"deliver":
			_deliver(delta)
		"build":
			_build(delta)
		"farm":
			_farm(delta)
		_:
			if walk(slot, delta):
				idle()


func set_task(kind: String, on: Node2D) -> void:
	task = kind
	task_target = on
	ordered = false
	if on is Supply:
		last_supply = on
	_clock = Rules.GATHER_EVERY


func _gather(delta: float) -> void:
	var supply := task_target as Supply
	if supply == null or not supply.usable_by(side):
		if carry > 0.0:
			set_task("deliver", null)
			return
		var next := battle.nearest_supply(world, supply.kind if supply != null else carry_type, side, supply)
		if next == null:
			task = ""
			slot = world
			battle.notice_idle(self, supply)
			return
		set_task("gather", next)
		return
	if world.distance_to(supply.world) > supply.radius + 11.0:
		walk(supply.world, delta)
		return
	facing = (supply.world - world).angle()
	state = State.WORK
	_play({"wood": "work", "iron": "mine"}.get(supply.kind, "farm"))
	if _clock > 0.0:
		return
	_clock = Rules.GATHER_EVERY
	var take := supply.take(minf(Rules.GATHER_TAKE, Rules.CARRY - carry))
	carry += take
	carry_type = supply.kind
	if carry >= Rules.CARRY or not supply.usable_by(side):
		set_task("deliver", null)


func _farm(delta: float) -> void:
	var field := task_target as Building
	if field == null or not field.standing() or not field.complete:
		task = ""
		return
	if world.distance_to(field.world) > 30.0:
		walk(field.world, delta)
		return
	state = State.WORK
	_play("farm")
	if _clock > 0.0:
		return
	_clock = Rules.GATHER_EVERY
	var take := minf(minf(Rules.GATHER_TAKE, Rules.CARRY - carry), field.crop)
	field.crop -= take
	carry += take
	carry_type = "food"
	if carry >= Rules.CARRY:
		task = "deliver"
		last_supply = null
		task_target = field


func _deliver(delta: float) -> void:
	var store := battle.store_for(carry_type, side, world)
	if store == null:
		task = ""
		return
	if world.distance_to(store.world) > store.reach_radius():
		walk(store.world, delta)
		return
	battle.credit(side, carry_type, carry)
	carry = 0.0
	# Back to the field, the same tree or bush, or the nearest of its kind.
	var field := task_target as Building
	if field != null and field.type == "farm" and field.standing():
		set_task("farm", field)
	elif last_supply != null and last_supply.usable_by(side):
		set_task("gather", last_supply)
	else:
		var next := battle.nearest_supply(world, carry_type, side, last_supply)
		if next != null:
			set_task("gather", next)
		else:
			task = ""
			slot = world
			battle.notice_idle(self, last_supply)


func _build(delta: float) -> void:
	var site := task_target as Building
	if site == null or not site.standing() or site.complete:
		task = ""
		idle()
		return
	if world.distance_to(site.world) > site.reach_radius():
		walk(site.world, delta)
		return
	facing = (site.world - world).angle()
	state = State.WORK
	_play("build")
	site.raise(Rules.BUILD_RATE * delta)
	if site.complete:
		task = ""
		battle.on_built(site, self)


# ---- harm ----

func hit(damage: float) -> void:
	if state == State.DEAD:
		return
	hp -= damage
	queue_redraw()
	if hp > 0.0:
		return
	state = State.DEAD
	selected = false
	z_index = -1
	if type == "artillery":
		var fade := create_tween()
		fade.tween_property(self, "modulate:a", 0.25, 2.0)
	else:
		if not _sprite.sprite_frames.has_animation("die_e"):
			_wear(["%s_iso_infantry", "%s_iso_fallen"])
		_play(["die", "diefwd", "dieside"].pick_random() if type != "cavalry" else "die", true)
	battle.on_death(self)
	if regiment != null:
		regiment.lost(self)


## Where the flash and smoke appear, in world space.
func muzzle() -> Vector2:
	return world + Vector2.from_angle(facing) * (26.0 if type == "artillery" else 14.0)


func _wear(names: Array) -> void:
	var resolved: Array = []
	for n: String in names:
		resolved.append(n % _prefix)
	var look := AtlasLibrary.get_set(resolved)
	_sprite.sprite_frames = look["frames"]
	_sprite.offset = -Vector2(look["pivot"])
	_anim = ""


func _play(state_name: String, restart := false) -> void:
	var anim := "%s_%s" % [state_name, Iso.direction(facing)]
	if not _sprite.sprite_frames.has_animation(anim):
		anim = "idle_" + Iso.direction(facing)
		if not _sprite.sprite_frames.has_animation(anim):
			return
	if anim == _anim and not restart:
		return
	_anim = anim
	_sprite.play(anim)


func _draw() -> void:
	if not selected:
		return
	var color := Color(0.45, 0.65, 1.0, 0.9) if side == "france" else Color(1.0, 0.45, 0.4, 0.9)
	var r := 13.0 if type in ["cavalry", "artillery"] else 8.0
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, Iso.SQ))
	draw_arc(Vector2.ZERO, r, 0.0, TAU, 24, color, 1.6)
	if hp < max_hp:
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		var bar := Rect2(Vector2(-9, 6), Vector2(18, 2.5))
		draw_rect(bar, Color(0, 0, 0, 0.6))
		draw_rect(Rect2(bar.position, Vector2(18.0 * hp / max_hp, 2.5)), Color(0.4, 0.85, 0.3))
