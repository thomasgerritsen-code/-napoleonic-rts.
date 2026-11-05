class_name RecruitAssembly
extends RefCounted
## Find one free waiting place when training finishes. Existing world/slot
## positions are the reservations, so saves need no extra counters or state.
## This runs per recruit, never per frame; candidate checks use local buckets.

const CELL := 80.0
const FILES := 7
const RANKS := 129
const MARGIN := 4.0
const ROUTE_CHECKS := 16
const SIDES := [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]


static func radius(u: Unit) -> float:
	return 36.0 if u.type == "artillery" else (24.0 if u._horse() else 12.0)


static func point(battle: Battle, recruit: Unit, anchor: Vector2) -> Vector2:
	if battle._walls_dirty:
		battle._build_walls()
	var occupied := {}
	for other: Unit in battle.units:
		if other == recruit or not other.alive():
			continue
		_add(occupied,other.world,radius(other))
		# Include people still on their way, not only those already waiting.
		if other.regiment == null and other.military() and other.slot.distance_squared_to(other.world)>1.0:
			_add(occupied,other.slot,radius(other))
	var size := radius(recruit)
	var gap := size*2.0+MARGIN
	var forward := Vector2.RIGHT if recruit.side == "france" else Vector2.LEFT
	var origin := battle.navigation.goal(recruit.world,recruit.world)
	anchor = battle.navigation.goal(anchor,origin)
	var found: Variant = _find(battle,occupied,origin,anchor,size,forward)
	if found != null:
		return found
	# An unreachable rally courtyard must not run hundreds of A* searches
	# or trap every new recruit at the same point. Try outside the exit.
	found = _find(battle,occupied,origin,origin+forward*gap*2.0,size,forward)
	if found != null:
		return found
	return origin


static func _find(battle: Battle,occupied: Dictionary,origin: Vector2,anchor: Vector2,size: float,forward: Vector2) -> Variant:
	var gap := size*2.0+MARGIN
	var lateral := forward.orthogonal()
	var checked := 0
	for rank in RANKS:
		for file in FILES:
			var at := anchor+forward*_offset(rank)*gap+lateral*_offset(file)*gap
			# Leave the training exit clear, even if the rally flag is on it.
			if at.distance_squared_to(origin)<gap*gap*2.25:
				continue
			if not _standing_room(battle,at,size) or not _free(occupied,at,size):
				continue
			checked += 1
			if not battle.ground_route(origin,at).is_empty():
				return at
			if checked >= ROUTE_CHECKS:
				return null
	return null


static func _standing_room(battle: Battle,at: Vector2,size: float) -> bool:
	if not battle.navigation.walkable(at):
		return false
	# A valid path endpoint can be only 6px from a wall. A waiting soldier
	# there blocks the corner for the next recruit. Keep a passage outside
	# the building as well as a collision-free centre.
	for side: Vector2 in SIDES:
		if not battle.navigation.walkable(at+side*(size+MARGIN)):
			return false
	return true


static func _offset(index: int) -> float:
	return float((index+1)/2) * (1.0 if index%2 == 1 else -1.0)


static func _cell(at: Vector2) -> Vector2i:
	return Vector2i(floori(at.x/CELL),floori(at.y/CELL))


static func _add(buckets: Dictionary,at: Vector2,size: float) -> void:
	var cell := _cell(at)
	if not buckets.has(cell):
		buckets[cell] = []
	buckets[cell].append(Vector3(at.x,at.y,size))


static func _free(buckets: Dictionary,at: Vector2,size: float) -> bool:
	var cell := _cell(at)
	for x in range(-1,2):
		for y in range(-1,2):
			for entry: Vector3 in buckets.get(cell+Vector2i(x,y),[]):
				var distance := size+entry.z+MARGIN
				if at.distance_squared_to(Vector2(entry.x,entry.y))<distance*distance-0.01:
					return false
	return true
