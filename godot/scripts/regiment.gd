class_name Regiment
extends RefCounted
## A battalion in line: two ranks, shoulder to shoulder. It owns its men's
## places; an order sets a new line at the destination, facing the way it
## marched. It fights the nearest enemy battalion in musket range once it
## stands, and breaks and runs when it has lost too many men.

const FILE_GAP := 15.0       # game px between neighbours in a rank
const RANK_GAP := 19.0       # and between the ranks
const RANKS := 2
const RANGE := 190.0         # musket range, centre to centre
const BREAK_AT := 0.45       # breaks below this share of its men

var name := ""
var side := "france"
var soldiers: Array[Soldier] = []
var facing := 0.0
var routing := false
var enemy: Regiment = null
var destination := Vector2.ZERO
var _start := 0


func _init(name_: String, side_: String) -> void:
	name = name_
	side = side_


func add(soldier: Soldier) -> void:
	soldier.regiment = self
	soldiers.append(soldier)
	_start = soldiers.size()


func living() -> Array[Soldier]:
	var men: Array[Soldier] = []
	for s in soldiers:
		if s.alive():
			men.append(s)
	return men


func strength() -> int:
	return living().size()


func destroyed() -> bool:
	return strength() == 0


func centroid() -> Vector2:
	var men := living()
	if men.is_empty():
		return destination
	var sum := Vector2.ZERO
	for s in men:
		sum += s.world
	return sum / men.size()


func moving() -> bool:
	for s in living():
		if s.world.distance_to(s.slot) > 6.0:
			return true
	return false


## A new line at `to`, facing `face` (or the way it marches).
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
	_form(to)


## Places in the line at `at`. Men keep their order across the line, so files
## do not cross on the way.
func _form(at: Vector2) -> void:
	var men := living()
	if men.is_empty():
		return
	var forward := Vector2.from_angle(facing)
	var right := forward.orthogonal() * -1.0
	var files := ceili(float(men.size()) / RANKS)
	men.sort_custom(func(a: Soldier, b: Soldier) -> bool:
		return (a.world - at).dot(right) < (b.world - at).dot(right))
	# Front rank takes the men nearest the front within each file.
	for file in files:
		var pair: Array[Soldier] = []
		for r in RANKS:
			var i := file * RANKS + r
			if i < men.size():
				pair.append(men[i])
		pair.sort_custom(func(a: Soldier, b: Soldier) -> bool:
			return (a.world - at).dot(forward) > (b.world - at).dot(forward))
		for r in pair.size():
			var lateral := (file - (files - 1) / 2.0) * FILE_GAP
			pair[r].slot = at + right * lateral - forward * (r * RANK_GAP)


## Close the ranks after losses (the line keeps its place and front).
func lost(_soldier: Soldier) -> void:
	if not routing and strength() > 0 and strength() < _start * BREAK_AT:
		_rout()
	elif not routing:
		_form(destination)


func _rout() -> void:
	routing = true
	enemy = null
	# Back to its own side of the field.
	var home_x := 60.0 if side == "france" else Iso.WORLD.x - 60.0
	for s in living():
		s.slot = Vector2(home_x, s.world.y + randf_range(-120.0, 120.0))


func update(delta: float, regiments: Array[Regiment]) -> void:
	if routing or destroyed():
		var men := living()
		for s in men:
			s.step(delta, null)
		return
	var here := centroid()
	if enemy != null and (enemy.destroyed() or enemy.routing or enemy.centroid().distance_to(here) > RANGE * 1.15):
		enemy = null
	if enemy == null and not moving():
		var best_d := RANGE
		for other in regiments:
			if other.side == side or other.routing or other.destroyed():
				continue
			var d := other.centroid().distance_to(here)
			if d < best_d:
				best_d = d
				enemy = other
	var enemy_at: Variant = enemy.centroid() if enemy != null else null
	for s in living():
		s.step(delta, enemy_at)
