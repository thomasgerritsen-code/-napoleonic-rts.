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
var troop := ""
var grenade_clock := 0.0
## Fallen but wounded (FieldMedics): "lying", "carried", "healing", "healed" or "dead".
var wound := ""
## Nerve, 0 to 100 (the web game's morale): shaken by hits and by comrades
## falling near him, steadied by his officer and drummer.
var morale := 100.0
## Wind, 0 to 100 (the web game's stamina): marching and charging tire a man,
## standing he gets it back; a tired man goes slower.
var stamina := 100.0
## A gun's charge, round shot or grapeshot ("grape"), and what it has left
## of each (the web game: 24 round, 10 grape).
var shot := "round"
var ammo := {"round": 24, "grape": 10}
const GRAPE_REACH := 145.0
var wounded_at := 0.0
var heal_until := 0.0
var hospital: Building = null
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
var _crew: Array[AnimatedSprite2D] = []
var _path: Array[Vector2] = []
var _goal := Vector2(INF, INF)
var _prefix := "fr"
var _anim := ""
## The last animation state played and how often one was restarted (online:
## the client plays the same).
var anim_state := ""
var anim_seq := 0
## Online, on the client: where the host last had this man.
var net_target := Vector2.INF
## In a trench (Trenches dresses the men each frame): leaning on the bank
## (resting and firing over it), and the cut that hides him below its lip.
var leaning := false
var _cut: ShaderMaterial = null
const CUT_SHADER := """shader_type canvas_item;
uniform float cut_y = 1.0e6;
varying float local_y;
void vertex() { local_y = VERTEX.y; }
void fragment() { if (local_y > cut_y) { discard; } }
"""
static var _cut_shader: Shader = null
var _clock := 0.0
var _look := 0.0
## How he is shown, as the web iso view's unit presentation: the feet driven
## by the ground he covers (a full step cycle every stride), walking or
## standing by his smoothed speed (with some give, so a short pause or a
## slow shuffle does not flicker), and turning one of the eight directions at
## a time, only once his way is well past the one he shows.
const STRIDE := 1.5            # m per step cycle (on foot)
const SECTOR := PI / 4.0
const GAITS := ["march", "walk", "trot", "gallop", "roll"]
var _seen := Vector2.INF
var _ground_speed := 0.0       # m/s, smoothed
var _striding := false
var _step_phase := 0.0         # 0..1 through the step cycle
var _shown_dir := -1           # 0..7, east round to north-east
var _turn_wait := 0.0
var _gait := "walk"            # for horses: walk, trot or gallop
var _dust_clock := 0.0
## A man in a battalion who has made no way towards his place for a second
## (it lies in a house, in the water, or the crowd holds him) is stuck: the
## battalion does not wait for him.
var stuck := false
## How far from his place he is after his own step (before the crowd jostles him).
var slot_gap := 0.0
var _stuck_clock := 0.0
var _stuck_from := INF
var _detour := Vector2.ZERO     # a step aside round what holds him
var _detour_left := 0.0


func setup(battle_: Battle, side_: String, type_: String, at: Vector2, troop_ := "") -> void:
	battle = battle_
	side = side_
	type = type_
	troop = troop_
	world = at
	slot = at
	facing = 0.0 if side == "france" else PI
	_prefix = "fr" if side == "france" else "br"
	var info := Rules.unit_type(type)
	max_hp = float(info.get("hp", 100)) * stat("hp")
	hp = max_hp
	speed = float(info.get("speed", 57)) * stat("speed")
	_sprite = AnimatedSprite2D.new()
	_sprite.centered = false
	_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE
	add_child(_sprite)
	_wear(_coats())
	if type == "artillery":
		_man_the_gun()
	position = Iso.to_screen(world)
	_play("idle")


func alive() -> bool:
	return state != State.DEAD


func military() -> bool:
	return type != "worker"


func reach() -> float:
	if type == "artillery" and shot == "grape":
		return GRAPE_REACH
	var open_order := Battle.depth_rule_static("skirmishRange", 1.15) if regiment != null and regiment.skirmish else 1.0
	return float(Rules.unit_type(type).get("range", 20)) * stat("range") * open_order


## A troop kind's factor on the base type (1 for the plain kind).
func stat(key: String) -> float:
	return float(Rules.troop(troop).get(key, 1.0)) if troop != "" else 1.0


func reload_time() -> float:
	var hurt := 1.35 if injury() < 0.7 else (1.15 if injury() < 1.0 else 1.0)
	if regiment != null and battle.trenches.braced(regiment):
		hurt *= float(Rules.orders()["defendReload"])
	return float(Rules.unit_type(type).get("reload", 3.0)) * stat("reload") * hurt


## Walking wounded (the web game's field care): below 65% of his health a man
## goes at 0.82 of his pace, below 30% at 0.62; he reloads slower too.
func injury() -> float:
	if not alive() or not (type in ["infantry", "cavalry", "officer", "drummer"]):
		return 1.0
	var share := hp / max_hp
	return 0.62 if share < 0.3 else (0.82 if share < 0.65 else 1.0)


## The atlases this man wears, as the web iso view picks them: the line in
## three company coats, grenadiers, voltigeurs, guard or riflemen, sappers;
## horse by regiment; heavy guns, howitzers and horse guns.
func _coats() -> Array:
	var p := _prefix
	match type:
		"infantry":
			var coat: String = {"grenadier": "4", "voltigeur": "5", "guard": "6", "rifle": "6", "sapper": "7"}.get(troop,
				["", "2", "3"][int(Battle.hash01(id, 13) * 3)])
			var dig := "%s%s_iso_dig" % [p, coat]
			if not ResourceLoader.exists("res://assets/units/%s_atlas.webp" % dig):
				dig = "%s_iso_dig" % p
			return ["%s%s_iso_infantry" % [p, coat], "%s%s_iso_fallen" % [p, coat], dig]
		"cavalry":
			var coat: String = {"cuirassier": "ck", "lancer": "cl", "greys": "cg", "hussar": "c"}.get(troop,
				"c" if Battle.hash01(id, 5) < 0.5 else "c2")
			if not ResourceLoader.exists("res://assets/units/%s%s_iso_cavalry_atlas.webp" % [p, coat]):
				coat = "c"
			return ["%s%s_iso_cavalry" % [p, coat], "%s%s_iso_cavfight" % [p, coat]]
		"artillery":
			var model: String = {"heavy12": ["g12", "gun12"], "howitzer": ["gh", "gunh"], "horseart": ["gl", "gunl"]}.get(troop, ["g", "gun"])[0]
			var sheet: String = {"heavy12": "gun12", "howitzer": "gunh", "horseart": "gunl"}.get(troop, "gun")
			return ["%s%s_iso_%s" % [p, model, sheet]]
		"officer":
			if troop == "mounted":
				return ["%sco_iso_cavalry" % p, "%sco_iso_cavfight" % p]
	var names: Array = []
	for n: String in SETS.get(type, SETS["infantry"]):
		names.append(n % p)
	return names


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
	_grenade(delta)
	var was := world
	if regiment != null:
		_step_in_regiment(delta)
		_watch_stuck(delta)
	elif type == "worker":
		_step_worker(delta)
	else:
		_step_free(delta)
	if type != "worker":
		var drain := -7.5
		if regiment != null and regiment.charging != null:
			drain = 10.0
		elif world.distance_squared_to(was) > 0.0001:
			drain = 4.5 if type == "cavalry" else 2.8
		stamina = clampf(stamina - drain * delta, 0.0, 100.0)
	position = Iso.to_screen(world)
	present(delta)


func wind() -> float:
	return 0.68 + 0.32 * stamina / 100.0


## Grenadiers and the guard lob a grenade at an enemy within reach while
## they fight, then wait (the web game: 45 to 135 px, every 16 s).
func _grenade(delta: float) -> void:
	if troop != "grenadier" and troop != "guard":
		return
	grenade_clock -= delta
	if grenade_clock > 0.0 or not (state in [State.AIM, State.RELOAD, State.FIRE]):
		return
	var g: Dictionary = Rules.start()["grenades"] if Rules.start().get("grenades") is Dictionary else {}
	var foe := battle.nearest_foe(world, side, float(g.get("maxRange", 135)))
	if foe is Unit and world.distance_to(Battle.spot(foe)) >= float(g.get("minRange", 45)):
		grenade_clock = float(g.get("cooldown", 16)) * randf_range(0.8, 1.2)
		battle.throw_grenade(self, Battle.spot(foe))
	else:
		grenade_clock = 1.0


## Walk towards `to`, by a bridge if the river lies between; true once there.
func walk(to: Vector2, delta: float, pace := 1.0) -> bool:
	if to.distance_squared_to(_goal) > 1.0:
		_goal = to
		_path = Nav.route(world, Nav.dry(world, to))
	var next: Vector2 = _path[0] if not _path.is_empty() else to
	var way := next - world
	if _detour_left > 0.0:
		_detour_left -= delta
		way = _detour * 24.0 + way.normalized() * 6.0
	if way.length() <= 3.0:
		if _path.size() > 1:
			_path.pop_front()
			return false
		return true
	if battle.weather != null:
		pace *= battle.weather.pace(type)
	if regiment == null:
		pace *= injury() * wind()
	if type == "cavalry" and not battle.trenches.list.is_empty() and battle.trenches.obstacle_at(world):
		pace *= float(Rules.orders()["cavalryTrenchSpeed"])
	world += way.limit_length(speed * pace * delta)
	facing = way.angle()
	state = State.MOVE
	if regiment != null and regiment.charging != null and (type == "cavalry" or troop == "mounted"):
		_play("gallop")
	else:
		_play("walk" if troop == "mounted" else MOVE_ANIM.get(type, "march"))
	return false


func _watch_stuck(delta: float) -> void:
	slot_gap = world.distance_to(slot)
	_stuck_clock += delta
	if _stuck_clock < 1.0:
		return
	_stuck_clock = 0.0
	var d := world.distance_to(slot)
	var was := stuck
	stuck = d > 3.0 and d > _stuck_from - 3.0
	_stuck_from = d
	# Held fast: a step to one side, to come round the house or the crowd.
	if stuck and not was and d > 12.0:
		_detour = (slot - world).normalized().orthogonal() * (1.0 if Battle.hash01(id, int(battle.clock)) < 0.5 else -1.0)
		_detour_left = 1.2


func idle() -> void:
	state = State.IDLE
	_play("idle")


func _step_in_regiment(delta: float) -> void:
	var r := regiment
	if not walk(slot, delta, r.speed_factor() if not r.routing else 1.4):
		return
	if r.marching() and not r.routing:
		# In his place in the marching body: in step with it, the way it goes.
		facing = r.heading
		state = State.MOVE
		_play("walk" if troop == "mounted" else MOVE_ANIM.get(type, "march"))
		return
	if r.routing or type != "infantry":
		facing = r.facing
		idle()
		return
	var foe := r.enemy if not r.skirmish else null
	if foe == null:
		# No battalion before it, or in open order: the men fire at will on
		# any enemy in musket reach.
		_look -= delta
		if _look <= 0.0:
			_look = LOOK_AROUND
			target = battle.nearest_foe(world, side, reach())
		if target == null or not battle.is_foe(target, side):
			facing = r.facing
			idle()
			if not battle.trenches.list.is_empty() and battle.trenches.digging_at(world):
				_play("dig")
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
			_clock = reload_time()
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
	var reload := reload_time()
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
				_play("reload", true)
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
	if type != "worker":
		_shaken((8.0 + damage * 0.08) * battle.trenches.shock_factor(self))
	if hp > 0.0:
		return
	morale = 0.0
	state = State.DEAD
	selected = false
	z_index = -1
	if type == "artillery":
		var fade := create_tween()
		fade.tween_property(self, "modulate:a", 0.25, 2.0)
	else:
		if not _sprite.sprite_frames.has_animation("die_e"):
			_wear(["%s_iso_infantry", "%s_iso_fallen"])
		_play(["die", "diefwd", "dieside"].pick_random() if type != "cavalry" and troop != "mounted" else "die", true)
	battle.on_death(self)
	if type != "worker":
		_witnessed()
	if regiment != null:
		regiment.lost(self)


## Online: what the client needs to show this man.
func net_state() -> Array:
	return [id, side, type, troop, roundi(world.x), roundi(world.y), snappedf(facing, 0.01), snappedf(hp, 0.1), max_hp,
		anim_state, anim_seq, state == State.DEAD, regiment.id if regiment != null else 0, wound,
		roundi(morale), roundi(stamina), shot, ammo["round"], ammo["grape"], task, snappedf(modulate.a, 0.01)]


## Online, on the client: take on the host's state for this man.
func net_apply(a: Array) -> void:
	var to := Vector2(a[4], a[5])
	if net_target == Vector2.INF or to.distance_to(world) > 220.0:
		world = to
	net_target = to
	facing = a[6]
	var hurt := not is_equal_approx(hp, a[7])
	hp = a[7]
	max_hp = a[8]
	wound = a[13]
	morale = a[14]
	stamina = a[15]
	shot = a[16]
	ammo["round"] = a[17]
	ammo["grape"] = a[18]
	task = a[19]
	modulate.a = a[20]
	if a[11] and state != State.DEAD:
		state = State.DEAD
		selected = false
		z_index = -1
		if not _sprite.sprite_frames.has_animation("die_e"):
			_wear(["%s_iso_infantry", "%s_iso_fallen"])
		hurt = true
	if a[9] != "" and (a[9] != anim_state or a[10] != anim_seq):
		_play(a[9], a[10] != anim_seq)
		anim_seq = a[10]
	if hurt:
		queue_redraw()


## Online, on the client: glide towards the host's position between snapshots.
func net_glide(delta: float) -> void:
	if net_target != Vector2.INF and state != State.DEAD:
		world = world.lerp(net_target, minf(1.0, delta * 10.0))
	position = Iso.to_screen(world)
	present(delta)


## Dressed by the trench he stands in: drawn `offset` lower (sunk, or moved
## to the bank), cut off below screen y `lip_y` (the near wall hides him
## there), leaning on the bank or not. `lip_y` INF takes him out again.
func trench_look(offset: Vector2, lip_y: float, lean: bool) -> void:
	if lean != leaning:
		leaning = lean
		_play(anim_state if anim_state != "rest" and anim_state != "rfire" else "idle", true)
	_sprite.position = offset
	if lip_y == INF:
		if _cut != null:
			_sprite.material = null
			_cut = null
		return
	if _cut == null:
		if _cut_shader == null:
			_cut_shader = Shader.new()
			_cut_shader.code = CUT_SHADER
		_cut = ShaderMaterial.new()
		_cut.shader = _cut_shader
		_sprite.material = _cut
	_cut.set_shader_parameter("cut_y", (lip_y - position.y - offset.y) / _sprite.scale.y)


## A hit shakes the man, and a little those beside him in the ranks.
func _shaken(amount: float) -> void:
	morale = maxf(0.0, morale - amount)
	if regiment == null:
		return
	for u in regiment.men:
		if u != self and u.alive() and u.world.distance_squared_to(world) < 80.0 * 80.0:
			u.morale = maxf(0.0, u.morale - amount * 0.16)


## A comrade falling unnerves those who see it, an officer most; their own
## officer and drummer close by keep them steady.
func _witnessed() -> void:
	var base := 11.0 if type == "officer" else (8.0 if type == "drummer" else 6.0)
	if regiment != null:
		for u in regiment.men:
			if u.alive():
				u.morale = maxf(0.0, u.morale - 5.0)
	for u in battle.units:
		if u == self or u.side != side or not u.alive() or u.type == "worker":
			continue
		var d := u.world.distance_to(world)
		if d >= 190.0:
			continue
		var steady := 1.0
		if u.regiment != null:
			steady = (0.68 if u.regiment.leader_near(u, "officer", 210.0) else 1.0) * (0.86 if u.regiment.leader_near(u, "drummer", 170.0) else 1.0)
		u.morale = maxf(0.0, u.morale - minf(11.0, base * (1.0 - d / 190.0) * steady))


## Where the flash and smoke appear, in world space.
func muzzle() -> Vector2:
	return world + Vector2.from_angle(facing) * (26.0 if type == "artillery" else 14.0)


func _wear(names: Array) -> void:
	var resolved: Array = []
	for n: String in names:
		resolved.append(n % _prefix if n.contains("%s") else n)
	var look := AtlasLibrary.get_set(resolved)
	_sprite.sprite_frames = look["frames"]
	_sprite.offset = -Vector2(look["pivot"])
	_anim = ""


## Three gunners stand behind a gun: they haul it on the march, ram and
## load between shots, and one touches off the charge.
func _man_the_gun() -> void:
	var look := AtlasLibrary.get_set(["%sa_iso_gunner" % _prefix])
	for i in 3:
		var man := AnimatedSprite2D.new()
		man.sprite_frames = look["frames"]
		man.centered = false
		man.offset = -Vector2(look["pivot"])
		man.scale = Vector2.ONE * Iso.SPRITE_SCALE
		add_child(man)
		_crew.append(man)


func _crew_play(state_name: String) -> void:
	if _crew.is_empty():
		return
	var forward := Vector2.from_angle(facing)
	var right := forward.orthogonal()
	var dir := shown_direction()
	for i in _crew.size():
		var man := _crew[i]
		var place := -forward * (20.0 + (i % 2) * 9.0) + right * (float(i) - 1.0) * 14.0
		man.position = Vector2(place.x, place.y * Iso.SQ)
		var job := state_name
		if state_name == "fire":
			job = "touch" if i == 0 else "ready"
		elif state_name == "reload":
			job = ["ram", "load", "ready"][i]
		elif state_name == "roll":
			job = "haul"
		var anim := "%s_%s" % [job, dir]
		if man.sprite_frames.has_animation(anim) and man.animation != anim:
			man.play(anim)


func _play(state_name: String, restart := false) -> void:
	# On the fire-step the musket lies over the bank: resting, firing over it.
	if leaning and state_name in ["idle", "aim", "reload"]:
		state_name = "rest"
	elif leaning and state_name == "fire":
		state_name = "rfire"
	if state_name != anim_state or restart:
		anim_seq += 1
	anim_state = state_name
	_show(restart)


## The direction he is shown facing (see present).
func shown_direction() -> String:
	if _shown_dir < 0:
		return Iso.direction(facing)
	return Iso.DIRECTIONS[_shown_dir]


func _horse() -> bool:
	return type == "cavalry" or troop == "mounted"


## Put up the picture for his state: on the move only while he is really
## going, standing while he is not; the feet of a moving one are set by
## present, from the ground covered.
func _show(restart := false) -> void:
	var shown := anim_state
	if state != State.DEAD:
		if shown in GAITS and not _striding:
			shown = "idle"
		elif shown == "idle" and _striding:
			shown = MOVE_ANIM.get(type, "march")
		if _horse() and shown in GAITS:
			shown = "gallop" if regiment != null and regiment.charging != null else _gait
	var dir := shown_direction()
	_crew_play(shown)
	var anim := "%s_%s" % [shown, dir]
	if not _sprite.sprite_frames.has_animation(anim):
		anim = "walk_" + dir if shown in GAITS and _sprite.sprite_frames.has_animation("walk_" + dir) else "idle_" + dir
		if not _sprite.sprite_frames.has_animation(anim):
			return
	if anim == _anim and not restart:
		return
	_anim = anim
	_sprite.play(anim)


## Every frame, after he has moved: his smoothed speed, the step cycle, the
## direction he shows and the picture.
func present(delta: float) -> void:
	if state == State.DEAD or _sprite == null:
		return
	delta = clampf(delta, 0.0, 0.1)
	if _seen == Vector2.INF:
		_seen = world
		_step_phase = Battle.hash01(id, 31) * 0.35
		_shown_dir = posmod(roundi(facing / SECTOR), 8)
	var covered := world.distance_to(_seen)
	_seen = world
	# A jump (a snapshot catching up) is no stride.
	var jumped := covered > 80.0
	var ppm := Iso.PPM
	var velocity := covered / ppm / delta if delta > 0.0 and not jumped else 0.0
	_ground_speed += (velocity - _ground_speed) * (1.0 - exp(-delta / 0.075)) if delta > 0.0 else 0.0
	_striding = _ground_speed > (0.17 if _striding else 0.34)
	if _horse():
		if _ground_speed > (4.05 if _gait == "gallop" else 4.65):
			_gait = "gallop"
		elif _ground_speed > (2.15 if _gait == "trot" else 2.65):
			_gait = "trot"
		else:
			_gait = "walk"
	# Horses at the trot or gallop kick up dust; wet ground hardly any.
	if _horse() and _striding and _gait != "walk" and battle != null and battle.effects != null:
		_dust_clock -= delta
		if _dust_clock <= 0.0:
			_dust_clock = 0.05 if _gait == "gallop" else 0.11
			var wet := battle.weather.wetness if battle.weather != null else 0.0
			battle.effects.dust(position + Vector2(0.0, 1.0), 1.0 - 0.8 * clampf(wet, 0.0, 1.0))
	var stride := STRIDE
	if _horse():
		stride = {"gallop": 3.6, "trot": 2.8}.get(_gait, 2.4)
	elif type == "artillery":
		stride = 1.2
	elif regiment != null and regiment.routing:
		stride = 1.6
	if not jumped:
		_step_phase = fmod(_step_phase + covered / ppm / stride, 1.0)
	# One sector at a time, and only once well past it.
	_turn_wait = maxf(0.0, _turn_wait - delta)
	var off := angle_difference(_shown_dir * SECTOR, facing)
	if absf(off) > SECTOR / 2.0 + 0.12 and _turn_wait <= 0.0:
		_shown_dir = posmod(_shown_dir + (1 if off > 0.0 else -1), 8)
		_turn_wait = 0.085 if _horse() else 0.06
	_show()
	if _striding and String(_sprite.animation).get_slice("_", 0) in GAITS:
		var count := _sprite.sprite_frames.get_frame_count(_sprite.animation)
		if _sprite.is_playing():
			_sprite.pause()
		_sprite.frame = int(_step_phase * count) % count


func _draw() -> void:
	if wound == "lying":
		# Alive: a white mark with a red cross over him.
		draw_circle(Vector2(0, -10), 3.2, Color(0.98, 0.97, 0.94, 0.85))
		draw_rect(Rect2(-0.6, -12.0, 1.2, 4.0), Color(0.6, 0.08, 0.08))
		draw_rect(Rect2(-2.0, -10.6, 4.0, 1.2), Color(0.6, 0.08, 0.08))
	if alive() and injury() < 1.0:
		# A bandage round his head.
		draw_rect(Rect2(-2.0, -27.0, 4.0, 1.6), Color(0.93, 0.89, 0.82))
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
