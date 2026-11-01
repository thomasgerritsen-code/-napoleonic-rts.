class_name GroundNavigation
extends RefCounted
## Shared, lazy native A* only when a straight leg is obstructed. Keeps the
## existing bridge waypoints, routes around real wall footprints, and never
## clips a walking man into a wall or the river. The grid is shared by a
## battle; buildings update only their affected cells.

const CELL := 16.0
const WALL_CELL := 80.0
const CLEARANCE := 6.0
var revision := 0
var queries := 0
var searches := 0
var _walls: Array[Rect2] = []
var _buckets := {}
var _grid: AStarGrid2D
var _water := {}
var _wall_cells := {}


func set_walls(rects: Array[Rect2]) -> void:
	_walls = rects.duplicate()
	_buckets.clear()
	for i in _walls.size():
		var r := _walls[i].grow(CLEARANCE + 1.0)
		for x in range(floori(r.position.x / WALL_CELL), floori(r.end.x / WALL_CELL) + 1):
			for y in range(floori(r.position.y / WALL_CELL), floori(r.end.y / WALL_CELL) + 1):
				var key := Vector2i(x, y)
				if not _buckets.has(key):
					_buckets[key] = []
				(_buckets[key] as Array).append(i)
	revision += 1
	if _grid != null:
		_update_solids()


func _ensure_grid() -> void:
	if _grid != null:
		return
	_grid = AStarGrid2D.new()
	_grid.region = Rect2i(0, 0, ceili(Iso.WORLD.x / CELL), ceili(Iso.WORLD.y / CELL))
	_grid.cell_size = Vector2.ONE * CELL
	_grid.offset = Vector2.ONE * CELL / 2.0
	_grid.diagonal_mode = AStarGrid2D.DIAGONAL_MODE_ONLY_IF_NO_OBSTACLES
	_grid.default_compute_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.default_estimate_heuristic = AStarGrid2D.HEURISTIC_OCTILE
	_grid.update()
	# The river is narrow: inspect its strip, rather than every map cell.
	for y in _grid.region.size.y:
		var wy := (y + 0.5) * CELL
		var rx := Nav.river_x(wy)
		if not is_finite(rx):
			continue
		var span := Nav._width / 2.0 + CELL * 2.0
		for x in range(maxi(0, floori((rx - span) / CELL)), mini(_grid.region.size.x, ceili((rx + span) / CELL))):
			var c := Vector2i(x, y)
			if Nav.in_water(_grid.get_point_position(c)):
				_water[c] = true
				_grid.set_point_solid(c)
	_update_solids()


func _update_solids() -> void:
	for c: Vector2i in _wall_cells:
		_grid.set_point_solid(c, _water.has(c))
	_wall_cells.clear()
	for wall in _walls:
		var r := wall.grow(CLEARANCE + CELL * 0.5)
		for x in range(maxi(0, floori(r.position.x / CELL)), mini(_grid.region.size.x, ceili(r.end.x / CELL))):
			for y in range(maxi(0, floori(r.position.y / CELL)), mini(_grid.region.size.y, ceili(r.end.y / CELL))):
				var c := Vector2i(x, y)
				_wall_cells[c] = true
				_grid.set_point_solid(c)


func _at_wall(p: Vector2) -> bool:
	var key := Vector2i(floori(p.x / WALL_CELL), floori(p.y / WALL_CELL))
	for i: int in _buckets.get(key, []):
		if _walls[i].grow(CLEARANCE).has_point(p):
			return true
	return false


func walkable(p: Vector2) -> bool:
	return p.x >= 1.0 and p.y >= 1.0 and p.x < Iso.WORLD.x and p.y < Iso.WORLD.y \
		and not _at_wall(p) and not Nav.in_water(p)


## Move an order inside a building to its accessible outside face. Workers
## still stop at their existing work/delivery radius; no economy rule changes.
func goal(to: Vector2, from: Vector2) -> Vector2:
	var p := to.clamp(Vector2.ONE, Iso.WORLD - Vector2.ONE)
	p = Nav.dry(from, p)
	for attempt in 12:
		var key := Vector2i(floori(p.x / WALL_CELL), floori(p.y / WALL_CELL))
		var blocked := false
		for i: int in _buckets.get(key, []):
			var r := _walls[i].grow(CLEARANCE + 1.0)
			if not r.has_point(p):
				continue
			var points: Array[Vector2] = [Vector2(r.position.x - 0.5, p.y), Vector2(r.end.x + 0.5, p.y),
				Vector2(p.x, r.position.y - 0.5), Vector2(p.x, r.end.y + 0.5)]
			var best := INF
			var approach := INF
			var next := p
			for q in points:
				var d := q.distance_squared_to(p)
				var travel := q.distance_squared_to(from)
				if d < best or is_equal_approx(d, best) and travel < approach:
					best = d
					approach = travel
					next = q
			p = next.clamp(Vector2.ONE, Iso.WORLD - Vector2.ONE)
			blocked = true
			break
		if not blocked:
			break
	return Nav.dry(from, p)


func clear_segment(from: Vector2, to: Vector2) -> bool:
	# Short, spatially indexed samples also catch same-bank river bends and
	# angled bridge edges. Eight px is smaller than the narrowest wall.
	var count := maxi(1, ceili(from.distance_to(to) / 8.0))
	for i in range(1, count + 1):
		if not walkable(from.lerp(to, float(i) / count)):
			return false
	return true


func route(from: Vector2, to: Vector2) -> Array[Vector2]:
	queries += 1
	var out: Array[Vector2] = []
	var end := goal(to, from)
	var legs := Nav.route(from, end)
	var start := from
	for leg in legs:
		var part := _leg(start, leg)
		if part.is_empty():
			return []
		out.append_array(part)
		start = leg
	return out


func _cell(p: Vector2) -> Vector2i:
	return Vector2i(floori(p.x / CELL), floori(p.y / CELL)).clamp(Vector2i.ZERO, _grid.region.size - Vector2i.ONE)


func _free_cell(p: Vector2) -> Vector2i:
	var centre := _cell(p)
	if not _grid.is_point_solid(centre):
		return centre
	for radius in range(1, 13):
		var best := INF
		var found := centre
		for x in range(centre.x - radius, centre.x + radius + 1):
			for y in range(centre.y - radius, centre.y + radius + 1):
				if absi(x - centre.x) != radius and absi(y - centre.y) != radius:
					continue
				var c := Vector2i(x, y)
				if not _grid.is_in_boundsv(c) or _grid.is_point_solid(c):
					continue
				var q := _grid.get_point_position(c)
				var d := q.distance_squared_to(p)
				if d < best and clear_segment(p, q):
					best = d
					found = c
		if best < INF:
			return found
	return centre


func _leg(from: Vector2, to: Vector2) -> Array[Vector2]:
	if clear_segment(from, to):
		return [to]
	_ensure_grid()
	searches += 1
	var a := _free_cell(from)
	var b := _free_cell(to)
	if _grid.is_point_solid(a) or _grid.is_point_solid(b):
		return []
	var raw := _grid.get_point_path(a, b)
	if raw.is_empty():
		return []
	var out: Array[Vector2] = []
	var anchor := from
	var last := from
	for i in range(0, raw.size(), 3):
		var p: Vector2 = raw[i]
		if clear_segment(anchor, p):
			last = p
		else:
			if last == anchor:
				return []
			out.append(last)
			anchor = last
			# The diagonal grid already excludes solid neighbours.
			if not clear_segment(anchor, p):
				# Preserve the intermediate grid corners around a tight turn.
				for k in range(maxi(0, i - 2), i + 1):
					if not clear_segment(anchor, raw[k]):
						return []
					out.append(raw[k])
					anchor = raw[k]
			last = p
	if not clear_segment(anchor, to):
		if last != anchor:
			out.append(last)
			anchor = last
		if not clear_segment(anchor, raw[-1]):
			return []
		out.append(raw[-1])
		anchor = raw[-1]
	if not clear_segment(anchor, to):
		return []
	out.append(to)
	return out


## A separation/avoidance nudge is accepted only on dry, unobstructed ground.
func nudge(from: Vector2, to: Vector2) -> Vector2:
	if clear_segment(from, to):
		return to
	var x := Vector2(to.x, from.y)
	var y := Vector2(from.x, to.y)
	if clear_segment(from, x) and x.distance_squared_to(from) > 0.0001:
		return x
	if clear_segment(from, y):
		return y
	return from
