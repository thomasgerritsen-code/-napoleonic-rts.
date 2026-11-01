class_name BattleSpace
extends RefCounted
## Exact live unit queries through reusable spatial buckets. World setters
## move entries immediately; casualties are checked at query time. No target
## cadence or combat ranges change, including first-in-list distance ties.

const CELL := 128.0
var _grid := {}
var _cells := {}
var _order := {}
var _active: Array[Vector2i] = []
var tested := 0


func rebuild(units: Array[Unit]) -> void:
	for cell in _active:
		(_grid[cell] as Array).clear()
	_active.clear()
	_cells.clear()
	_order.clear()
	for i in units.size():
		add(units[i], i)
	# Keep the pool bounded even if a malformed order leaves the map.
	if _grid.size() > 4096:
		for cell: Vector2i in _grid.keys():
			if (_grid[cell] as Array).is_empty():
				_grid.erase(cell)


func add(u: Unit, order: int) -> void:
	_order[u] = order
	if not u.alive():
		return
	var cell := Vector2i(floori(u.world.x / CELL), floori(u.world.y / CELL))
	if not _grid.has(cell):
		_grid[cell] = []
	if (_grid[cell] as Array).is_empty():
		_active.append(cell)
	(_grid[cell] as Array).append(u)
	_cells[u] = cell


func moved(u: Unit) -> void:
	if not _cells.has(u):
		return
	var cell := Vector2i(floori(u.world.x / CELL), floori(u.world.y / CELL))
	var old: Vector2i = _cells[u]
	if cell == old:
		return
	(_grid[old] as Array).erase(u)
	if not _grid.has(cell):
		_grid[cell] = []
	if (_grid[cell] as Array).is_empty() and not _active.has(cell):
		_active.append(cell)
	(_grid[cell] as Array).append(u)
	_cells[u] = cell


func state_changed(u: Unit) -> void:
	if u.alive() and not _cells.has(u) and _order.has(u):
		add(u, int(_order[u]))


func nearest(at: Vector2, side: String, reach: float, soldiers_only := false) -> Unit:
	var best: Unit = null
	var best_sq := reach * reach
	for x in range(floori((at.x - reach) / CELL), floori((at.x + reach) / CELL) + 1):
		for y in range(floori((at.y - reach) / CELL), floori((at.y + reach) / CELL) + 1):
			var cell := Vector2i(x, y)
			if not _grid.has(cell):
				continue
			for u: Unit in _grid[cell]:
				tested += 1
				if not is_instance_valid(u) or u.side == side or not u.alive():
					continue
				if soldiers_only and (not u.military() or u.regiment != null and u.regiment.routing):
					continue
				var d := u.world.distance_squared_to(at)
				if d < best_sq or best != null and d == best_sq and int(_order[u]) < int(_order[best]):
					best_sq = d
					best = u
	return best


## Caller-owned result avoids allocating a new array for every walking man.
func around(at: Vector2, reach: float, out: Array[Unit]) -> void:
	out.clear()
	for x in range(floori((at.x - reach) / CELL), floori((at.x + reach) / CELL) + 1):
		for y in range(floori((at.y - reach) / CELL), floori((at.y + reach) / CELL) + 1):
			var cell := Vector2i(x, y)
			if _grid.has(cell):
				for u: Unit in _grid[cell]:
					if is_instance_valid(u) and u.alive() and u.world.distance_squared_to(at) <= reach * reach:
						out.append(u)
