class_name BritishCommand
extends RefCounted
## The computer's side, after the web game's AI: it keeps its peasants at
## work (food first, wood from a lumber camp, iron from a mine once it has
## the means), builds houses before it runs out of room, a farm when the
## berries run out, a barracks, and trains musketeers with officers and
## drummers. Full companies become battalions; with two (or after ten
## minutes, one) it marches on the French town centre in column and deploys
## into line near the enemy, and it turns back to defend its own base.

const SIDE := "britain"
const THINK_EVERY := 1.0
const WORKERS := 14
const ATTACK_WITH := 2
const ATTACK_ANYWAY_AFTER := 600.0
const DEFEND_REACH := 900.0
const DEPLOY_AT := 480.0
const CHARGE_ODDS := 1.6

var battle: Battle
var plan := "opbouwen"
## On the test field: no economy, the battalions attack at once.
var army_only := false
var _clock := 0.0
var _home := Vector2.ZERO


func _init(battle_: Battle) -> void:
	battle = battle_
	var tc := battle.town_centre(SIDE)
	_home = tc.world if tc != null else Iso.WORLD - Vector2(600, 600)


func update(delta: float) -> void:
	_clock -= delta
	if _clock > 0.0 or battle.town_centre(SIDE) == null:
		return
	_clock = THINK_EVERY
	if not army_only:
		_economy()
		_build()
		_train()
		_form()
	_command()


func on_trained(u: Unit) -> void:
	if u.type == "worker":
		_put_to_work(u)
	else:
		# Soldiers muster before the town centre.
		u.move_to(_muster() + Vector2(randf_range(-60, 60), randf_range(-40, 40)))


func _mine() -> Array[Unit]:
	var list: Array[Unit] = []
	for u in battle.units:
		if u.side == SIDE and u.alive():
			list.append(u)
	return list


func _count(kind: String, complete_only := false) -> int:
	var n := 0
	for b in battle.buildings:
		if b.side == SIDE and b.type == kind and b.standing() and (b.complete or not complete_only):
			n += 1
	return n


func _muster() -> Vector2:
	return _home + (Iso.WORLD / 2.0 - _home).normalized() * 260.0


# ---- economy ----

func _economy() -> void:
	for u in _mine():
		if u.type == "worker" and u.task == "":
			_put_to_work(u)


func _put_to_work(u: Unit) -> void:
	# Help raise an unfinished building first.
	for b in battle.buildings:
		if b.side == SIDE and not b.complete and b.standing() and _builders(b) < 2:
			u.set_task("build", b)
			return
	var stock: Dictionary = battle.economy[SIDE]
	var order := ["food", "wood", "iron"]
	if stock["wood"] < stock["food"]:
		order = ["wood", "food", "iron"]
	if battle.clock > 70.0 and stock["iron"] < 400.0 and _gatherers("iron") < 2:
		order.push_front("iron")
	for kind: String in order:
		var s := battle.nearest_supply(u.world, kind, SIDE)
		if s != null and s.world.distance_to(_home) < 1600.0:
			u.set_task("gather", s)
			return
	for b in battle.buildings:
		if b.side == SIDE and b.type == "farm" and b.complete and b.standing() and battle.farmers_on(b) < 3:
			u.set_task("farm", b)
			return


func _builders(b: Building) -> int:
	var n := 0
	for u in battle.units:
		if u.alive() and u.task == "build" and u.task_target == b:
			n += 1
	return n


func _gatherers(kind: String) -> int:
	var n := 0
	for u in battle.units:
		if u.alive() and u.side == SIDE and u.task == "gather" and u.last_supply != null and u.last_supply.kind == kind:
			n += 1
	return n


func _build() -> void:
	var stock: Dictionary = battle.economy[SIDE]
	var room := battle.pop_cap(SIDE) - battle.pop_used(SIDE)
	if _count("lumbercamp") == 0:
		_lay_out("lumbercamp", _wood_site())
	elif room < 4 and _count("house") - _count("house", true) == 0:
		_lay_out("house", _near_home(260.0))
	elif _count("barracks") == 0 and stock["wood"] >= 300.0:
		_lay_out("barracks", _near_home(300.0))
	elif battle.clock > 70.0 and _count("mine") == 0 and stock["wood"] >= 250.0:
		var deposit := _free_deposit()
		if deposit != null:
			_lay_out("mine", deposit.world)
	elif battle.nearest_supply(_home, "food", SIDE) == null and _count("farm") < 3 and stock["wood"] >= 180.0:
		_lay_out("farm", _near_home(330.0))
	elif battle.clock > 300.0 and _count("barracks") == 1 and stock["wood"] >= 700.0:
		_lay_out("barracks", _near_home(380.0))


func _lay_out(type: String, near: Variant) -> void:
	if near == null:
		return
	var builders: Array[Unit] = []
	for u in _mine():
		if u.type == "worker" and u.carry == 0.0 and builders.size() < 2:
			builders.append(u)
	var centre: Vector2 = near
	# Try rings around the wanted spot for a place the building fits.
	for ring in 8:
		for i in 12:
			var at := centre + Vector2.from_angle(TAU * i / 12.0 + ring) * ring * 60.0
			if battle.site_for(type, at) != null:
				if battle.lay_out(SIDE, type, at, builders) != null:
					plan = "%s bouwen" % Rules.label(type).to_lower()
				return


func _near_home(distance: float) -> Vector2:
	var angle := randf_range(-PI, PI)
	return _home + Vector2.from_angle(angle) * distance


## Beside the wood nearest home.
func _wood_site() -> Variant:
	var best: Supply = null
	var best_d := INF
	for s in battle.supplies:
		if s.kind == "wood" and not s.gone():
			var d := s.world.distance_to(_home)
			if d < best_d:
				best_d = d
				best = s
	if best == null:
		return null
	return best.world + (_home - best.world).normalized() * 160.0


func _free_deposit() -> Supply:
	var best: Supply = null
	var best_d := 2400.0
	for s in battle.supplies:
		if s.kind == "iron" and not s.gone() and battle.mine_on_any(s) == null:
			var d := s.world.distance_to(_home)
			if d < best_d:
				best_d = d
				best = s
	return best


# ---- army ----

func _train() -> void:
	var men := {"worker": 0, "infantry": 0, "officer": 0, "drummer": 0}
	for u in _mine():
		if men.has(u.type):
			men[u.type] += 1
	for b in battle.buildings:
		if b.side != SIDE or not b.complete or not b.standing() or b.queue.size() >= 2:
			continue
		for queued in b.queue:
			men[queued] = men.get(queued, 0) + 1
		match b.type:
			"towncenter":
				if men["worker"] < WORKERS:
					battle.queue_unit(b, "worker")
			"barracks":
				# Twelve musketeers to an officer and a drummer.
				var companies := ceili((men["infantry"] + 1) / 12.0)
				if men["officer"] < companies:
					battle.queue_unit(b, "officer")
				elif men["drummer"] < companies:
					battle.queue_unit(b, "drummer")
				else:
					battle.queue_unit(b, "infantry")


func _form() -> void:
	var free: Array[Unit] = []
	for u in _mine():
		if u.regiment == null and u.type in ["infantry", "officer", "drummer"] and u.world.distance_to(_home) < 900.0:
			free.append(u)
	if Regiment.eligible(free):
		var r := battle.form_regiment(free)
		if r != null:
			r.order_move(_muster(), (Iso.WORLD / 2.0 - _home).angle())
			plan = "%s gevormd" % r.name


func _command() -> void:
	var mine: Array[Regiment] = []
	for r in battle.regiments:
		if r.side == SIDE and not r.routing and not r.destroyed():
			mine.append(r)
	if mine.is_empty():
		return
	var threat: Variant = _threat()
	var attacking := army_only or mine.size() >= ATTACK_WITH or battle.clock > ATTACK_ANYWAY_AFTER
	var goal: Variant = threat
	if goal == null and attacking:
		var tc := battle.town_centre("france")
		goal = tc.world if tc != null else null
		if army_only:
			goal = _nearest_french_battalion(mine[0].centroid())
	for r in mine:
		if r.charging != null:
			continue
		if r.enemy != null:
			if r.strength() > r.enemy.strength() * CHARGE_ODDS:
				r.charge(battle.regiments)
			continue
		if goal == null:
			continue
		var here := r.centroid()
		var there: Vector2 = goal
		var near := here.distance_to(there) < DEPLOY_AT
		if r.moving() and (r.formation == "line" or not near):
			continue
		if here.distance_to(there) < Regiment.RANGE * 0.8:
			continue
		r.set_formation("line" if near else "column")
		var stand := there + (here - there).normalized() * (Regiment.RANGE * 0.8)
		r.order_move(stand if near else here + (there - here).limit_length(900.0), (there - here).angle())
		plan = "verdedigen" if threat != null else "aanval op het Franse stadhuis"


## The nearest Frenchman come too close to home, if any.
func _threat() -> Variant:
	var best: Variant = null
	var best_d := DEFEND_REACH
	for u in battle.units:
		if u.side == "france" and u.alive() and u.military():
			var d := u.world.distance_to(_home)
			if d < best_d:
				best_d = d
				best = u.world
	return best


func _nearest_french_battalion(from: Vector2) -> Variant:
	var best: Variant = null
	var best_d := INF
	for r in battle.regiments:
		if r.side == "france" and not r.routing and not r.destroyed():
			var d := r.centroid().distance_to(from)
			if d < best_d:
				best_d = d
				best = r.centroid()
	return best
