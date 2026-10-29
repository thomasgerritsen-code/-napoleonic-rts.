class_name Woods
extends RefCounted
## The woods of the web game's map as it draws them: rows of trees with
## undergrowth and clearings, a mix of leaf and conifer per wood, kept off
## roads and the river. Each tree belongs to the nearest tree the peasants
## may cut; as that one is worked, its neighbours fall one by one (the
## farthest first) and the wood thins, as in the web game.

const MIX := {
	"leaf": [["oak", 0.38], ["beech", 0.3], ["birch", 0.2], ["poplar", 0.12]],
	"conifer": [["spruce", 0.55], ["pine", 0.38], ["birch", 0.07]],
	"mixed": [["oak", 0.22], ["beech", 0.18], ["spruce", 0.22], ["pine", 0.18], ["birch", 0.2]]}
const UNDERGROWTH := [["fern", 0.45], ["hazel", 0.3], ["hawthorn", 0.25]]
const LINK := 260.0

var _trees: Array[Dictionary] = []     # {sprite, supply, fall_at, down}


static func pick(table: Array, r: float) -> String:
	for entry: Array in table:
		r -= float(entry[1])
		if r < 0.0:
			return entry[0]
	return table[table.size() - 1][0]


func plant(battle: Battle, layer: Node2D, map: Dictionary) -> void:
	var textures := {}
	var groups := {}
	for i in map["woods"].size():
		var wood: Dictionary = map["woods"][i]
		var mix: String = ["leaf", "mixed", "conifer"][int(Battle.hash01(i * 31 + 7, 11) * 3)]
		var y := float(wood["y"]) + 30.0
		while y < float(wood["y"]) + float(wood["h"]) - 10.0:
			var x := float(wood["x"]) + 30.0
			while x < float(wood["x"]) + float(wood["w"]) - 10.0:
				var r := Battle.hash01(roundi(x), roundi(y) + i)
				var at := Vector2(x + (r - 0.5) * 50.0, y + (Battle.hash01(roundi(y), roundi(x)) - 0.5) * 40.0)
				var u := Battle.hash01(roundi(x) + 17, roundi(y) + i)
				var under := Vector2(x + 35.0 + (u - 0.5) * 20.0, y + 20.0)
				if u < 0.45 and not _blocked(map, under):
					_add(battle, layer, textures, pick(UNDERGROWTH, u / 0.45), under, 0.55 + u * 0.3, null, groups)
				if r >= 0.12 and not _blocked(map, at):
					var kind := pick(MIX[mix], Battle.hash01(roundi(at.x), roundi(at.y)))
					_add(battle, layer, textures, kind, at, 0.5 + r * 0.25, _nearest_tree(battle, at), groups)
				x += 70.0
			y += 62.0
	# The k-th of n trees falls when its tree has k/(n+1) of its wood left.
	for supply: Supply in groups:
		var list: Array = groups[supply]
		list.sort_custom(func(a: Dictionary, b: Dictionary) -> bool:
			return supply.world.distance_squared_to(a["at"]) > supply.world.distance_squared_to(b["at"]))
		for k in list.size():
			list[k]["fall_at"] = 1.0 - float(k + 1) / (list.size() + 1)


func _add(battle: Battle, layer: Node2D, textures: Dictionary, kind: String, at: Vector2, size: float, supply: Supply, groups: Dictionary) -> void:
	if not battle.props.has(kind):
		kind = "oak"
	if not textures.has(kind):
		textures[kind] = load("res://assets/props/%s.webp" % kind)
	var prop: Dictionary = battle.props[kind]
	var sprite := Sprite2D.new()
	sprite.texture = textures[kind]
	sprite.centered = false
	sprite.offset = -Vector2(prop["pivot"]["x"], prop["pivot"]["y"])
	sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE * size
	sprite.position = Iso.to_screen(at)
	layer.add_child(sprite)
	if supply != null:
		var tree := {"sprite": sprite, "supply": supply, "at": at, "fall_at": 0.0, "down": false}
		_trees.append(tree)
		if not groups.has(supply):
			groups[supply] = []
		groups[supply].append(tree)


func _nearest_tree(battle: Battle, at: Vector2) -> Supply:
	var best: Supply = null
	var best_d := LINK * LINK
	for s in battle.supplies:
		if s.kind == "wood":
			var d := s.world.distance_squared_to(at)
			if d < best_d:
				best_d = d
				best = s
	return best


func _blocked(map: Dictionary, at: Vector2) -> bool:
	for road: Dictionary in map["roads"]:
		if _near(road["points"], at, float(road.get("width", 60)) / 2.0 + 12.0):
			return true
	return _near(map["river"]["points"], at, float(map["river"]["width"]) / 2.0 + 52.0)


func _near(points: Array, at: Vector2, reach: float) -> bool:
	for i in range(1, points.size()):
		var a := Vector2(points[i - 1][0], points[i - 1][1])
		var b := Vector2(points[i][0], points[i][1])
		if Geometry2D.get_closest_point_to_segment(at, a, b).distance_to(at) < reach:
			return true
	return false


## Trees whose wood has been cut far enough tip over and fade.
func update() -> void:
	for tree in _trees:
		if tree["down"]:
			continue
		var supply: Supply = tree["supply"]
		if supply.amount < supply.full * float(tree["fall_at"]) or supply.gone():
			tree["down"] = true
			var sprite: Sprite2D = tree["sprite"]
			var side := -1.0 if Battle.hash01(roundi(sprite.position.x), 3) < 0.5 else 1.0
			var tween := sprite.create_tween()
			tween.tween_property(sprite, "rotation", side * 1.45, 1.1).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
			tween.tween_interval(0.7)
			tween.tween_property(sprite, "modulate:a", 0.0, 0.9)
			tween.tween_callback(sprite.hide)
