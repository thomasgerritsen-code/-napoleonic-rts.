class_name BritishCommand
extends RefCounted
## The computer's side, after the web game's AI: it keeps its peasants at
## work (food first, wood from a lumber camp, iron from a mine once it has
## the means), builds houses before it runs out of room, a farm when the
## berries run out, a barracks, and trains musketeers with officers and
## drummers. Full companies become battalions. It attacks in waves as the
## web game's campaign pressure: the first after two and a half minutes,
## then every three (give or take half a minute), when it has a dozen men
## and at least 0.8 of the French strength (or the wave is two minutes
## late). It marches on the French town centre in column, deploys into line
## near the enemy, breaks off when the fight is lost or has lasted long
## enough, regroups at home, and turns back to defend its own base.

const SIDE := "britain"
const THINK_EVERY := 1.0
const WORKERS := 14
const DEFEND_REACH := 900.0
const DEPLOY_AT := 480.0
const CHARGE_ODDS := 1.6
const CAVALRY := 8
const GUNS := 3

var battle: Battle
var plan := "opbouwen"
## On the test field: no economy, the battalions attack at once.
var army_only := false
var _clock := 0.0
var _home := Vector2.ZERO
## The wave: "verdedigen", "aanval", "hergroeperen".
var stance := "verdedigen"
var waves := 0
var _next_wave := 150.0
var _stance_since := 0.0
var _losing_since := -1.0


func _init(battle_: Battle) -> void:
	battle = battle_
	var tc := battle.town_centre(SIDE)
	_home = tc.world if tc != null else Iso.WORLD - Vector2(600, 600)
	_next_wave = _pressure("firstWave", 150)


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
	elif battle.clock > 360.0 and _count("stable") == 0 and stock["wood"] >= 360.0:
		_lay_out("stable", _near_home(400.0))
	elif battle.clock > 420.0 and _count("foundry") == 0 and stock["wood"] >= 420.0 and stock["iron"] >= 90.0:
		_lay_out("foundry", _near_home(420.0))
	elif battle.clock > float(Rules.medics()["aiAfter"]) and _count("hospital") == 0 and stock["wood"] >= 280.0 and stock["food"] >= 160.0:
		# Behind the town centre, away from the French.
		_lay_out("hospital", _home - (Iso.WORLD / 2.0 - _home).normalized() * 170.0)
	elif battle.clock > Rules.tower_ai()["after"] and _count("tower") < Rules.tower_ai()["max"] and _count("tower") == _count("tower", true) \
			and stock["wood"] >= Rules.cost_of("tower").get("wood", 260) + 120.0:
		_lay_out("tower", _towards_france(250.0 + 60.0 * _count("tower")))


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


## In front of the town centre, towards the French, a little to either side.
func _towards_france(distance: float) -> Vector2:
	var angle := (Iso.WORLD / 2.0 - _home).angle() + randf_range(-0.6, 0.6)
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
			var kind := Rules.item_type(queued)
			men[kind] = men.get(kind, 0) + 1
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
					battle.queue_unit(b, _pick("infantry", ["grenadier", "voltigeur", "rifle"]))
			"stable":
				if men.get("cavalry", 0) < CAVALRY:
					battle.queue_unit(b, _pick("cavalry", ["hussar", "greys"]))
			"foundry":
				if men.get("artillery", 0) < GUNS:
					battle.queue_unit(b, _pick("artillery", ["heavy12", "howitzer", "horseart"]))


func _form() -> void:
	var free: Array[Unit] = []
	for u in _mine():
		if u.regiment == null and u.type in ["infantry", "officer", "drummer"] and u.world.distance_to(_home) < 900.0:
			free.append(u)
	# Free musketeers first fill a battalion that has lost men.
	for r in battle.regiments:
		if r.side == SIDE and not r.routing and not r.destroyed() and r.strength() < Regiment.MAX_MEN and r.centroid().distance_to(_home) < 1200.0:
			if r.reinforce(free) > 0:
				return
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
	_choose_stance(mine, threat)
	var attacking := army_only or stance == "aanval"
	var goal: Variant = threat
	if goal == null and stance == "hergroeperen":
		goal = _muster()
	if goal == null and attacking:
		var tc := battle.town_centre("france")
		goal = tc.world if tc != null else null
		if army_only:
			goal = _nearest_french_battalion(mine[0].centroid())
	for r in mine:
		# Defending its base, a battalion holds its ground and digs in.
		r.hold = threat != null and r.centroid().distance_to(_home) < DEFEND_REACH
		if r.charging != null:
			continue
		# Horse close by: form square until it has gone.
		var horse := _horse_near(r.centroid())
		if horse and r.formation != "square":
			r.set_formation("square")
			continue
		if not horse and r.formation == "square":
			r.set_formation("line")
		if horse:
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


func _pressure(key: String, fallback: float) -> float:
	var p: Variant = Rules.start().get("pressure")
	return float(p.get(key, fallback)) if p is Dictionary else fallback


func _set_stance(to: String) -> void:
	stance = to
	_stance_since = battle.clock


## Fighting strength near a point: guns count 3, horse 1.8, each by its health.
func _strength(side: String, at: Vector2, reach: float) -> float:
	var sum := 0.0
	for u in battle.units:
		if u.side == side and u.alive() and u.military() and (u.regiment == null or not u.regiment.routing) and u.world.distance_to(at) < reach:
			sum += (3.0 if u.type == "artillery" else (1.8 if u.type == "cavalry" else 1.0)) * maxf(0.0, u.hp / maxf(1.0, u.max_hp))
	return sum


func _army(side: String) -> float:
	return _strength(side, Iso.WORLD / 2.0, INF)


## The wave clock: defend and gather, attack when ready, break off when the
## fight is lost or long, regroup, and the next wave.
func _choose_stance(mine: Array[Regiment], threat: Variant) -> void:
	var age := battle.clock - _stance_since
	var men := 0
	var morale := 0.0
	for r in mine:
		men += r.strength()
		morale += r.morale()
	morale /= maxf(1.0, mine.size())
	var ratio := _army(SIDE) / maxf(1.0, _army("france"))
	match stance:
		"verdedigen":
			var late := battle.clock >= _next_wave + _pressure("maxDelay", 120)
			if threat == null and battle.clock >= _next_wave and men >= int(_pressure("minWaveUnits", 12)) and (ratio >= _pressure("minRatio", 0.8) or late):
				waves += 1
				_losing_since = -1.0
				_set_stance("aanval")
		"aanval":
			var tc := battle.town_centre("france")
			var at := tc.world if tc != null else Iso.WORLD / 2.0
			var front := mine[0].centroid()
			var ours := _strength(SIDE, front, 900.0)
			var theirs := _strength("france", front, 900.0)
			if theirs > 0.0 and ours / theirs < _pressure("breakRatio", 0.5):
				if _losing_since < 0.0:
					_losing_since = battle.clock
			else:
				_losing_since = -1.0
			var losing := _losing_since >= 0.0 and battle.clock - _losing_since > _pressure("breakAfter", 12) and age > _pressure("minFight", 25)
			var siege := front.distance_to(at) < 700.0 and theirs < 1.0
			var spent := morale < 37.0 and theirs > 0.0 and ours / theirs < 0.9
			if (age > _pressure("maxAttack", 150) + _pressure("maxMarch", 300) and not siege) or losing or spent or ratio < 0.45:
				_next_wave = battle.clock + _pressure("interval", 180) + randf_range(-1.0, 1.0) * _pressure("jitter", 30)
				_set_stance("hergroeperen")
		"hergroeperen":
			if morale > 60.0 and age > 8.0:
				_set_stance("verdedigen")


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


func _horse_near(at: Vector2) -> bool:
	for u in battle.units:
		if u.side == "france" and u.alive() and u.type == "cavalry" and u.world.distance_to(at) < 260.0:
			return true
	return false


## A base type or one of its troop kinds, drawn with the web game's British
## shares (grenadiers 15%, voltigeurs 15%, riflemen 15%, hussars 55%, ...).
func _pick(base: String, kinds: Array) -> String:
	var t: Variant = Rules.start().get("troops")
	var shares: Dictionary = t["britishShare"] if t is Dictionary and t.has("britishShare") else {}
	var roll := randf()
	for kind: String in kinds:
		roll -= float(shares.get(kind, 0.0))
		if roll < 0.0 and SIDE in Rules.troop(kind).get("sides", []):
			return "%s:%s" % [base, kind]
	return base
