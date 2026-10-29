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
const RANGE := 200.0         # the web game's musket range
const BREAK_AT := 0.45
const CHARGE_REACH := 380.0
const CHARGE_SPEED := 1.6
const MELEE_REACH := 18.0
const MELEE_KILL := 0.7
const MELEE_LOSS := 0.4

static var _numbers := {"france": 0, "britain": 0}

var name := ""
var side := "france"
var men: Array[Unit] = []
var facing := 0.0
var formation := "line"
var routing := false
var enemy: Regiment = null
var charging: Regiment = null
var destination := Vector2.ZERO
var _start := 0


static func eligible(units: Array[Unit]) -> bool:
	var count := {"infantry": 0, "officer": 0, "drummer": 0}
	for u in units:
		if u.alive() and u.regiment == null and count.has(u.type):
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
		elif u.type == "officer" and not officer:
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
	var at := r.centroid()
	r.facing = 0.0 if side_ == "france" else PI
	r.order_move(at, r.facing)
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
	formation = kind
	_form(destination)


func speed_factor() -> float:
	if charging != null:
		return CHARGE_SPEED
	return COLUMN_SPEED if formation == "column" else 1.0


func fire_factor() -> float:
	return COLUMN_FIRE if formation == "column" else 1.0


func shape(count: int) -> Vector2i:
	if formation == "column":
		return Vector2i(mini(COLUMN_FILES, count), ceili(float(count) / COLUMN_FILES))
	return Vector2i(ceili(float(count) / RANKS), mini(RANKS, count))


## Places at `at`: the musketeers in files (keeping their order across the
## front and from front to back), the officer before the centre and the
## drummer behind it.
func _form(at: Vector2) -> void:
	var forward := Vector2.from_angle(facing)
	var right := forward.orthogonal() * -1.0
	var rank_and_file: Array[Unit] = []
	for u in living():
		if u.type == "infantry":
			rank_and_file.append(u)
		elif u.type == "officer":
			u.slot = at + forward * 22.0
		else:
			u.slot = at - forward * (RANK_GAP * 2.0 + 14.0) + right * 10.0
	if rank_and_file.is_empty():
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
			var lateral := (file - (files - 1) / 2.0) * FILE_GAP
			var depth := r * RANK_GAP
			if formation == "column":
				depth -= (grid.y - 1) * RANK_GAP / 2.0
			group[r].slot = at + right * lateral - forward * depth


func lost(_unit: Unit) -> void:
	if routing:
		return
	if strength() > 0 and strength() < _start * BREAK_AT:
		rout()
	else:
		_form(destination)


func rout() -> void:
	if routing:
		return
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
	var best := CHARGE_REACH
	var target: Regiment = null
	for other in regiments:
		if other.side == side or other.routing or other.destroyed():
			continue
		var d := other.centroid().distance_to(here)
		if d < best:
			best = d
			target = other
	if target == null:
		return false
	charging = target
	enemy = null
	return true


## Choose the enemy to fire on or keep charging; the men move themselves.
func update(delta: float, regiments: Array[Regiment]) -> void:
	if routing or destroyed():
		return
	if charging != null:
		_melee(delta)
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
			if randf() < MELEE_KILL * delta:
				nearest.hit(1000.0)
			elif randf() < MELEE_LOSS * delta:
				u.hit(1000.0)
		if routing:
			return
	if contact and not foe.routing and foe.strength() < strength() * 0.85:
		foe.rout()
