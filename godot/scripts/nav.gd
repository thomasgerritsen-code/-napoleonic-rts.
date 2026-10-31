class_name Nav
extends RefCounted
## The river runs the length of the map between the two bases; men cross it
## only on the web game's five bridges. A route that would cross the water
## goes by the bridge that makes the shortest way: to its near end, over the
## deck, and on from its far end.

const BANK := 30.0           # keep this far from the water's middle, past half its width

static var _points := PackedVector2Array()
static var _width := 58.0
static var _bridges: Array[Dictionary] = []


static func setup(river: Dictionary, crossings: Array) -> void:
	_points = PackedVector2Array()
	for p: Array in river["points"]:
		_points.append(Vector2(p[0], p[1]))
	_width = float(river.get("width", 58))
	_bridges.clear()
	for c: Dictionary in crossings:
		var centre := Vector2(c["x"], c["y"])
		var along := Vector2.from_angle(float(c.get("angle", 0.0)))
		var half := float(c["length"]) / 2.0 + 14.0
		var a := centre - along * half
		var b := centre + along * half
		# `west` is the end on the side of lower x (the French bank).
		_bridges.append({"name": c.get("name", ""), "centre": centre, "west": a if a.x < b.x else b,
			"east": b if a.x < b.x else a, "width": float(c.get("width", 100))})


static func bridges() -> Array[Dictionary]:
	return _bridges


## The river's middle at height y.
static func river_x(y: float) -> float:
	if _points.size() < 2:
		return -INF
	for i in range(1, _points.size()):
		var a := _points[i - 1]
		var b := _points[i]
		if y <= b.y or i == _points.size() - 1:
			var t := 0.0 if is_equal_approx(b.y, a.y) else clampf((y - a.y) / (b.y - a.y), 0.0, 1.0)
			return lerpf(a.x, b.x, t)
	return _points[_points.size() - 1].x


## -1 on the west (French) bank, +1 on the east.
static func bank(p: Vector2) -> int:
	return -1 if p.x < river_x(p.y) else 1


static func on_bridge(p: Vector2) -> bool:
	for b in _bridges:
		var a: Vector2 = b["west"]
		var e: Vector2 = b["east"]
		if Geometry2D.get_closest_point_to_segment(p, a, e).distance_to(p) < float(b["width"]) / 2.0:
			return true
	return false


static func in_water(p: Vector2) -> bool:
	return absf(p.x - river_x(p.y)) < _width / 2.0 + 6.0 and not on_bridge(p)


## Waypoints from `from` to `to`; just [to] when no water lies between.
static func route(from: Vector2, to: Vector2) -> Array[Vector2]:
	var way: Array[Vector2] = []
	# On a bridge: off it at the end on the bank where `to` lies.
	if on_bridge(from) and not on_bridge(to):
		for b in _bridges:
			var a: Vector2 = b["west"]
			var e: Vector2 = b["east"]
			if Geometry2D.get_closest_point_to_segment(from, a, e).distance_to(from) < float(b["width"]) / 2.0:
				# (Once at the end, straight on: else he turns back to it.)
				var off := e if bank(to) > 0 else a
				if from.distance_to(off) > 10.0:
					way.append(off)
				break
		way.append(to)
		return way
	if _bridges.is_empty() or bank(from) == bank(to) or on_bridge(to):
		way.append(to)
		return way
	var best: Dictionary = {}
	var best_d := INF
	var going_east := bank(from) < 0
	for b in _bridges:
		var near: Vector2 = b["west"] if going_east else b["east"]
		var far: Vector2 = b["east"] if going_east else b["west"]
		var d := from.distance_to(near) + near.distance_to(far) + far.distance_to(to)
		if d < best_d:
			best_d = d
			best = b
	way.append(best["west"] if going_east else best["east"])
	way.append(best["east"] if going_east else best["west"])
	way.append(to)
	return way


## A point on the same bank as `from`, pulled back out of the water.
static func dry(from: Vector2, p: Vector2) -> Vector2:
	if not in_water(p):
		return p
	var x := river_x(p.y)
	return Vector2(x + bank(from) * (_width / 2.0 + BANK), p.y)
