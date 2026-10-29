class_name Supply
extends Node2D
## Something to gather, from the web game's map: a tree (wood), a berry bush
## (food) or an iron deposit. Trees may be cut only within reach of the
## gatherer's own finished lumber camp, iron only at his own finished mine.

var id := 0
var kind := "wood"
var world := Vector2.ZERO
var amount := 0.0
var full := 0.0
var radius := 12.0
var deposit := false
var battle: Battle

var _sprite: Sprite2D


func setup(battle_: Battle, data: Dictionary, props: Dictionary) -> void:
	battle = battle_
	id = int(data["id"])
	kind = String(data["type"])
	world = Vector2(data["x"], data["y"])
	amount = float(data.get("amount", 100))
	full = amount
	radius = float(data.get("radius", 12))
	deposit = bool(data.get("deposit", false))
	position = Iso.to_screen(world)
	_sprite = Sprite2D.new()
	_sprite.centered = false
	if kind == "iron":
		_sprite.texture = load("res://assets/art/deposit.png")
		# The web game draws a deposit 2r wide, 0.875 of that high, its foot at 0.6.
		var w := radius * 2.0
		_sprite.scale = Vector2.ONE * w / _sprite.texture.get_width()
		_sprite.offset = -Vector2(_sprite.texture.get_width() * 0.5, _sprite.texture.get_height() * 0.62)
	else:
		var look := _look()
		var prop: Dictionary = props[look]
		_sprite.texture = load("res://assets/props/%s.webp" % look)
		_sprite.offset = -Vector2(prop["pivot"]["x"], prop["pivot"]["y"])
		var size := 0.55 + Battle.hash01(id, 5) * 0.25 if kind == "wood" else 0.75
		_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE * size
	add_child(_sprite)


## As the web iso view: a tree's kind and a bush's look follow its id.
func _look() -> String:
	if kind == "wood":
		return ["oak", "beech", "birch", "pine", "spruce", "oak", "birch"][int(Battle.hash01(id, 3) * 7)]
	return "hawthorn" if Battle.hash01(id, 9) < 0.5 else "bush"


func gone() -> bool:
	return amount <= 0.0


## Whether a peasant of this side may gather here now.
func usable_by(side: String) -> bool:
	if gone():
		return false
	if kind == "wood":
		return battle.camp_covering(self, side) != null
	if kind == "iron":
		return battle.mine_on(self, side) != null
	return true


func take(wanted: float) -> float:
	var got := minf(wanted, amount)
	amount -= got
	if gone():
		_fall()
	return got


## A felled tree tips over and fades; a picked bush or worked-out vein goes.
func _fall() -> void:
	if kind == "iron":
		_sprite.texture = load("res://assets/art/deposit_empty.png")
		return
	var tween := create_tween()
	if kind == "wood":
		var side := -1.0 if Battle.hash01(id, 11) < 0.5 else 1.0
		tween.tween_property(_sprite, "rotation", side * 1.45, 1.1).set_ease(Tween.EASE_IN).set_trans(Tween.TRANS_QUAD)
		tween.tween_interval(0.7)
	tween.tween_property(self, "modulate:a", 0.0, 0.9)
	tween.tween_callback(hide)
