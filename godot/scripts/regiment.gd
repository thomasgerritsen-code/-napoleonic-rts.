class_name Regiment
extends RefCounted
## A battalion as in the web game: 12 to 36 musketeers with an officer and a
## drummer, in line (two ranks) or in march column (four files, quicker but
## with little fire). It owns its men's places; an order sets the formation at
## the destination, facing the way it marched. Standing, it fires on the
## nearest enemy battalion or men in musket range; it can charge with the
## bayonet, and breaks and runs when it has lost too many men.

const MIN_MEN := 12
const MAX_MEN := 36
const FILE_GAP := 15.0       # game px between neighbours in a rank
const RANK_GAP := 19.0       # and between the ranks
const RANKS := 2
const COLUMN_FILES := 4
const COLUMN_SPEED := 1.25
const COLUMN_FIRE := 0.35
const SQUARE_SPEED := 0.45   # a square shuffles
const SQUARE_FIRE := 0.6     # and fires from every face, each with fewer muskets
const RANGE := 200.0         # the web game's musket range
const BREAK_AT := 0.45
const CHARGE_REACH := 380.0
const CHARGE_SPEED := 1.6
const MELEE_REACH := 18.0
const MELEE_KILL := 0.7
const MELEE_LOSS := 0.4

static var _numbers := {"france": 0, "britain": 0}
static var _squadrons := {"france": 0, "britain": 0}
const CAV_MIN := 4
const CAV_MAX := 12
const CAV_FILE_GAP := 29.0
const CAV_RANK_GAP := 31.0
const CAV_CHARGE_REACH := 520.0

var id := 0                  # online: the same battalion on both ends
var name := ""
var side := "france"
## "infantry" (a battalion) or "cavalry" (a regiment of horse: riders of one
## kind and an officer on horseback, no drummer).
var kind := "infantry"
var men: Array[Unit] = []
var facing := 0.0
var formation := "line"
var routing := false
var enemy: Regiment = null
var charging: Regiment = null
var destination := Vector2.ZERO
var victories := 0
var _start := 0
var _break_base := 0         # the strength its losses are counted from (since it last rallied)
var _pace := 1.0             # slowed by its walking wounded
## Told to hold its ground (G): it braces and, in line, digs in (Trenches).
var hold := false
## Open order (T): spread out, firing at will a little further, hard to hit
## (harder among trees), easy prey for horse.
var skirmish := false
var braced_at := -1.0
var trench: Variant = null   # the trench it holds or digs
var last_centre := Vector2.INF
var still_seconds := 0
var _lost_officer := false
var _lost_drummer := false
var _safe_for := 0.0         # seconds a routing battalion has been out of danger
const RALLY_MORALE := 62.0
const RALLY_SAFE := 235.0


static func eligible(units: Array[Unit]) -> bool:
	var count := {"infantry": 0, "officer": 0, "drummer": 0}
	for u in units:
		if u.alive() and u.regiment == null and count.has(u.type) and u.troop != "mounted":
			count[u.type] += 1
	return count["infantry"] >= MIN_MEN and count["officer"] >= 1 and count["drummer"] >= 1


## A battalion of the free men among `units` (null if they are too few).
static func raise(units: Array[Unit]) -> Regiment:
	if units.is_empty() or not eligible(units):
		return null
	var side_: String = units[0].side
	_numbers[side_] += 1
	var title: String = ("%de Ligne" if side_ == "france" else "%dth Foot") % _numbers[side_]
	var r := Regiment.new(title, side_)
	var officer := false
	var drummer := false
	var infantry := 0
	for u in units:
		if not u.alive() or u.regiment != null or u.side != side_:
			continue
		if u.type == "infantry" and infantry < MAX_MEN:
			infantry += 1
		elif u.type == "officer" and u.troop != "mounted" and not officer:
			officer = true
		elif u.type == "drummer" and not drummer:
			drummer = true
		else:
			continue
		u.regiment = r
		u.ordered = false
		u.target = null
		r.men.append(u)
	r._start = r.men.size()
	r._break_base = r._start
	all.append(r)
	var at := r.centroid()
	r.facing = 0.0 if side_ == "france" else PI
	r.order_move(at, r.facing)
	return r


## The kind most of the free riders among `units` are.
static func _main_kind(units: Array[Unit]) -> String:
	var count := {}
	for u in units:
		if u.alive() and u.regiment == null and u.type == "cavalry":
			count[u.troop] = count.get(u.troop, 0) + 1
	var best := ""
	var most := 0
	for k: String in count:
		if count[k] > most:
			most = count[k]
			best = k
	return best


static func eligible_cavalry(units: Array[Unit]) -> bool:
	var riders := 0
	var officer := false
	var kind_ := _main_kind(units)
	for u in units:
		if not u.alive() or u.regiment != null:
			continue
		if u.type == "cavalry" and u.troop == kind_:
			riders += 1
		elif u.type == "officer" and u.troop == "mounted":
			officer = true
	return riders >= CAV_MIN and officer


## A regiment of horse from the free riders of the commonest kind and a
## mounted officer among `units` (null if there are too few).
static func raise_cavalry(units: Array[Unit]) -> Regiment:
	if units.is_empty() or not eligible_cavalry(units):
		return null
	var side_: String = units[0].side
	var kind_ := _main_kind(units)
	_squadrons[side_] += 1
	var title: String = ("%de Cavalerie" if side_ == "france" else "%dth Dragoons") % _squadrons[side_]
	var r := Regiment.new(title, side_)
	r.kind = "cavalry"
	var officer := false
	var riders := 0
	for u in units:
		if not u.alive() or u.regiment != null or u.side != side_:
			continue
		if u.type == "cavalry" and u.troop == kind_ and riders < CAV_MAX:
			riders += 1
		elif u.type == "officer" and u.troop == "mounted" and not officer:
			officer = true
		else:
			continue
		u.regiment = r
		u.ordered = false
		u.target = null
		r.men.append(u)
	r._start = r.men.size()
	r._break_base = r._start
	all.append(r)
	r.facing = 0.0 if side_ == "france" else PI
	r.order_move(r.centroid(), r.facing)
	return r


func _init(name_: String, side_: String) -> void:
	name = name_
	side = side_


func living() -> Array[Unit]:
	var list: Array[Unit] = []
	for u in men:
		if u.alive():
			list.append(u)
	return list


func strength() -> int:
	return living().size()


func full_strength() -> int:
	return _start


## Online, on the client: the host's count.
func set_full_strength(n: int) -> void:
	_start = n
	_break_base = n


func destroyed() -> bool:
	return strength() == 0


func centroid() -> Vector2:
	var list := living()
	if list.is_empty():
		return destination
	var sum := Vector2.ZERO
	for u in list:
		sum += u.world
	return sum / list.size()


func moving() -> bool:
	for u in living():
		if u.world.distance_to(u.slot) > 6.0:
			return true
	return false


func order_move(to: Vector2, face: Variant = null) -> void:
	if routing:
		return
	var from := centroid()
	if face != null:
		facing = float(face)
	elif to.distance_to(from) > 4.0:
		facing = (to - from).angle()
	destination = to
	enemy = null
	charging = null
	_form(to)


func set_formation(kind: String) -> void:
	if kind == formation or routing:
		return
	if kind == "square":
		if self.kind == "cavalry":
			return
		skirmish = false
	formation = kind
	_form(destination)


func set_skirmish(on: bool) -> void:
	if routing or on == skirmish:
		return
	skirmish = on
	if on and formation == "square":
		formation = "line"
	_form(destination)


func speed_factor() -> float:
	if charging != null:
		return CHARGE_SPEED * _pace
	if formation == "square":
		return SQUARE_SPEED * _pace
	return (COLUMN_SPEED if formation == "column" else 1.0) * _pace


func fire_factor() -> float:
	if formation == "square":
		return SQUARE_FIRE
	return COLUMN_FIRE if formation == "column" else 1.0


## Fill the ranks from free musketeers among `units`, up to the full 36.
func reinforce(units: Array[Unit]) -> int:
	if routing:
		return 0
	var added := 0
	var infantry := 0
	var line_type := "cavalry" if kind == "cavalry" else "infantry"
	var line_troop := ""
	for u in living():
		if u.type == line_type:
			infantry += 1
			line_troop = u.troop
	var most := CAV_MAX if kind == "cavalry" else MAX_MEN
	for u in units:
		if infantry >= most:
			break
		if u.alive() and u.side == side and u.regiment == null and u.type == line_type and (kind != "cavalry" or u.troop == line_troop):
			u.regiment = self
			u.ordered = false
			u.target = null
			men.append(u)
			infantry += 1
			added += 1
	if added > 0:
		_start = maxi(_start, strength())
		_break_base = maxi(_break_base, strength())
		_form(destination)
	return added


## A man back from the field hospital: a musketeer fills the ranks, an
## officer or drummer takes his place again if nobody has.
func take_back(u: Unit) -> bool:
	if routing or destroyed():
		return false
	if u.type == "infantry":
		var one: Array[Unit] = [u]
		return reinforce(one) > 0
	if u.type == "officer" and u.troop == "mounted":
		return false
	for m in living():
		if m.type == u.type:
			return false
	u.regiment = self
	u.ordered = false
	men.append(u)
	_form(destination)
	return true


func shape(count: int) -> Vector2i:
	if formation == "column":
		var files_ := 3 if kind == "cavalry" else COLUMN_FILES
		return Vector2i(mini(files_, count), ceili(float(count) / files_))
	return Vector2i(ceili(float(count) / RANKS), mini(RANKS, count))


## Places at `at`: the musketeers in files (keeping their order across the
## front and from front to back), the officer before the centre and the
## drummer behind it.
func _form(at: Vector2) -> void:
	var forward := Vector2.from_angle(facing)
	var right := forward.orthogonal() * -1.0
	var rank_and_file: Array[Unit] = []
	var file_gap := CAV_FILE_GAP if kind == "cavalry" else FILE_GAP
	var rank_gap := CAV_RANK_GAP if kind == "cavalry" else RANK_GAP
	for u in living():
		if u.type == "infantry" or u.type == "cavalry":
			rank_and_file.append(u)
		elif u.type == "officer":
			u.slot = at + forward * (0.0 if formation == "square" else (34.0 if kind == "cavalry" else 22.0))
		else:
			u.slot = at + right * 12.0 if formation == "square" else at - forward * (RANK_GAP * 2.0 + 14.0) + right * 10.0
	if rank_and_file.is_empty():
		return
	if formation == "square":
		_form_square(at, rank_and_file)
		return
	var grid := shape(rank_and_file.size())
	var files := grid.x
	rank_and_file.sort_custom(func(a: Unit, b: Unit) -> bool:
		return (a.world - at).dot(right) < (b.world - at).dot(right))
	var per_file := ceili(float(rank_and_file.size()) / files)
	for file in files:
		var group: Array[Unit] = []
		for i in range(file * per_file, mini((file + 1) * per_file, rank_and_file.size())):
			group.append(rank_and_file[i])
		group.sort_custom(func(a: Unit, b: Unit) -> bool:
			return (a.world - at).dot(forward) > (b.world - at).dot(forward))
		for r in group.size():
			var lateral := (file - (files - 1) / 2.0) * file_gap
			var depth := r * rank_gap
			if formation == "column":
				depth -= (grid.y - 1) * rank_gap / 2.0
			if skirmish:
				# Spread out, each man a little off his file.
				var u := group[r]
				lateral = lateral * Battle.depth_rule_static("skirmishSpread", 2.3) + (Battle.hash01(u.id, 21) - 0.5) * 18.0
				depth = depth * Battle.depth_rule_static("skirmishSpread", 2.3) + (Battle.hash01(u.id, 22) - 0.5) * 18.0
			group[r].slot = at + right * lateral - forward * depth


## A hollow square: the men on four faces looking out, officer and drummer
## inside. Each face takes its men from the side of the square they stand on.
func _form_square(at: Vector2, rank_and_file: Array[Unit]) -> void:
	var count := rank_and_file.size()
	var per_face := ceili(count / 4.0)
	var half := (per_face - 1) * FILE_GAP / 2.0 + FILE_GAP
	var faces: Array[Array] = [[], [], [], []]
	var forward := Vector2.from_angle(facing)
	# Fill the faces in turn with the men nearest each.
	var left: Array = rank_and_file.duplicate()
	for f in 4:
		var out := forward.rotated(f * PI / 2.0)
		left.sort_custom(func(a: Unit, b: Unit) -> bool:
			return (a.world - at).dot(out) > (b.world - at).dot(out))
		var take := mini(per_face, left.size())
		for k in take:
			faces[f].append(left[k])
		left = left.slice(take)
	for f in 4:
		var out := forward.rotated(f * PI / 2.0)
		var along := out.orthogonal()
		var face: Array = faces[f]
		face.sort_custom(func(a: Unit, b: Unit) -> bool:
			return (a.world - at).dot(along) < (b.world - at).dot(along))
		for k in face.size():
			(face[k] as Unit).slot = at + out * half + along * ((k - (face.size() - 1) / 2.0) * FILE_GAP)


## The battalion's morale as the web game: its men's average, +5 with its
## officer (-20 without), +5 with its drummer (-8 without).
func morale() -> float:
	var list := living()
	if list.is_empty():
		return 0.0
	var sum := 0.0
	var officer := false
	var drummer := false
	for u in list:
		sum += u.morale
		officer = officer or u.type == "officer"
		drummer = drummer or u.type == "drummer"
	var drum := 0.0 if kind == "cavalry" else (5.0 if drummer else -8.0)
	return clampf(sum / list.size() + (5.0 if officer else -20.0) + drum, 0.0, 100.0)


func morale_label() -> String:
	if routing:
		return "op de vlucht"
	var m := morale()
	return "standvastig" if m > 75.0 else ("geschokt" if m > 50.0 else ("aarzelt" if m > 25.0 else "breekt"))


func leader_near(u: Unit, kind: String, reach: float) -> bool:
	for m in men:
		if m.type == kind and m.alive() and m.world.distance_squared_to(u.world) <= reach * reach:
			return true
	return false


## Nerve: the men steady when no enemy is near (quicker with officer and
## drummer); losing the officer or drummer shakes them all; a battalion whose
## morale gives way breaks, and one that has run out of danger rallies.
func _nerve(delta: float) -> void:
	var list := living()
	var officer := false
	var drummer := false
	for u in list:
		officer = officer or u.type == "officer"
		drummer = drummer or u.type == "drummer"
	if not officer and not _lost_officer:
		_lost_officer = true
		for u in list:
			u.morale = maxf(0.0, u.morale - 25.0)
	if not drummer and not _lost_drummer and kind != "cavalry":
		_lost_drummer = true
		for u in list:
			u.morale = maxf(0.0, u.morale - 10.0)
	var here := centroid()
	var danger := Battle.current != null and Battle.current.soldiers_near(here, side, RALLY_SAFE if routing else 180.0)
	var gain := 0.2 if danger else 1.2 + (0.55 if officer else -0.5) + (0.45 if drummer else 0.0)
	for u in list:
		u.morale = minf(100.0, u.morale + gain * delta)
	if routing:
		_safe_for = 0.0 if danger else _safe_for + delta
		if _safe_for >= 5.0 and officer and list.size() > maxi(3, _start / 3) and morale() >= RALLY_MORALE:
			rally()
	elif morale() < 22.0 and strength() > 0:
		rout()


## Back in order where it stands, facing the way it fled from.
func rally() -> void:
	routing = false
	_safe_for = 0.0
	formation = "line"
	var here := centroid()
	facing = 0.0 if side == "france" else PI
	destination = here
	for u in living():
		u.morale = maxf(u.morale, 55.0)
	_break_base = strength()
	_form(here)


## Honours as in the web game: Recruut, Ervaren (1 victory), Veteraan (3),
## Elite (6); each rank hits a little harder.
func rank() -> Dictionary:
	var best: Dictionary = {}
	for r: Dictionary in Rules.experience_ranks():
		if victories >= int(r["victories"]):
			best = r
	return best


func rank_label() -> String:
	return String(rank().get("label", "Recruut"))


func damage_factor() -> float:
	return float(rank().get("damage", 1.0))


## A beaten foe (broken or destroyed) counts as a victory for those fighting it.
func won() -> void:
	victories += 1


func lost(_unit: Unit) -> void:
	if routing:
		return
	if strength() == 0:
		_credit_victors()
	elif strength() < _break_base * BREAK_AT:
		rout()
	else:
		_form(destination)


func rout() -> void:
	if routing:
		return
	_credit_victors()
	routing = true
	enemy = null
	charging = null
	var home_x := 120.0 if side == "france" else Iso.WORLD.x - 120.0
	for u in living():
		u.slot = Vector2(home_x, u.world.y + randf_range(-160.0, 160.0))


func charge(regiments: Array[Regiment]) -> bool:
	if routing:
		return false
	var here := centroid()
	var best := CAV_CHARGE_REACH if kind == "cavalry" else CHARGE_REACH
	var target: Regiment = null
	for other in regiments:
		if other.side == side or other.routing or other.destroyed():
			continue
		# Horse does not ride at a square's bayonets of its own accord.
		if kind == "cavalry" and other.formation == "square":
			continue
		var d := other.centroid().distance_to(here)
		if d < best:
			best = d
			target = other
	if target == null:
		return false
	charging = target
	enemy = null
	# The cheer of a charge.
	for u in living():
		u.morale = minf(100.0, u.morale + 8.0)
	return true


## Choose the enemy to fire on or keep charging; the men move themselves.
func update(delta: float, regiments: Array[Regiment]) -> void:
	if destroyed():
		return
	_nerve(delta)
	if routing:
		return
	# The battalion keeps together at the pace its wounded can go.
	var list := living()
	var sum := 0.0
	var wind := 0.0
	for u in list:
		sum += u.injury()
		wind += u.wind()
	_pace = (0.7 + 0.3 * sum / list.size()) * wind / list.size()
	if charging != null:
		_melee(delta)
		return
	if kind == "cavalry":
		return
	var here := centroid()
	if enemy != null and (enemy.destroyed() or enemy.routing or enemy.centroid().distance_to(here) > RANGE * 1.15):
		enemy = null
	if enemy == null and not moving():
		var best := RANGE
		for other in regiments:
			if other.side == side or other.routing or other.destroyed():
				continue
			var d := other.centroid().distance_to(here)
			if d < best:
				best = d
				enemy = other


func _melee(delta: float) -> void:
	var foe := charging
	if foe.routing or foe.destroyed():
		charging = null
		destination = centroid()
		_form(destination)
		return
	var them := foe.living()
	var contact := false
	for u in living():
		var nearest: Unit = null
		var best := INF
		for o in them:
			var d := u.world.distance_squared_to(o.world)
			if d < best:
				best = d
				nearest = o
		if nearest == null:
			break
		u.slot = nearest.world
		if best < MELEE_REACH * MELEE_REACH:
			contact = true
			var kill := MELEE_KILL * u.stat("melee") * damage_factor()
			var loss := MELEE_LOSS / nearest.stat("melee")
			if u.type == "cavalry":
				# The shock of horse: hard on men in the open, broken on a square.
				kill *= 1.5 * u.stat("charge") * (u.stat("vsCavalry") if nearest.type == "cavalry" else u.stat("vsInfantry"))
				if foe.formation == "square":
					kill *= 0.2
					loss *= 3.0
			if randf() < kill * delta:
				nearest.hit(1000.0)
			elif randf() < loss * delta:
				u.hit(1000.0)
		if routing:
			return
	if contact and not foe.routing and foe.strength() < strength() * 0.85:
		foe.rout()


static var all: Array[Regiment] = []


func _credit_victors() -> void:
	for other in all:
		if other != self and other.side != side and (other.enemy == self or other.charging == self):
			other.won()
