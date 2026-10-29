class_name Minimap
extends Control
## The whole map in a corner: the ground, both sides' men and buildings (the
## enemy only where France sees), the posts, and the camera's view. A click
## or drag moves the camera there.

const SIZE := Vector2(240, 150)

var battle: Battle
var camera: BattleCamera

var _ground: Texture2D
var _source := Rect2()
var _clock := 0.0


func _ready() -> void:
	custom_minimum_size = SIZE
	size = SIZE
	mouse_filter = Control.MOUSE_FILTER_STOP
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	_ground = load("res://assets/map/" + String(meta["image"]))
	var pad := float(meta.get("padTop", 0.0))
	_source = Rect2(0, pad, _ground.get_width(), _ground.get_height() - pad)


func _process(delta: float) -> void:
	_clock -= delta
	if _clock <= 0.0:
		_clock = 0.2
		queue_redraw()


func _to_map(world: Vector2) -> Vector2:
	return world / Iso.WORLD * SIZE


func _draw() -> void:
	draw_rect(Rect2(Vector2(-2, -2), SIZE + Vector2(4, 4)), Color(0.55, 0.47, 0.28, 0.9))
	draw_texture_rect_region(_ground, Rect2(Vector2.ZERO, SIZE), _source)
	if battle == null:
		return
	for p in battle.territories:
		var owner: String = p["owner"]
		var colour := Color(0.9, 0.85, 0.6) if owner == "" else (Color(0.3, 0.5, 1.0) if owner == "france" else Color(1.0, 0.35, 0.3))
		draw_arc(_to_map(p["world"]), 4.0, 0.0, TAU, 12, colour, 1.5)
	for b in battle.buildings:
		if b.standing() and (b.side == "france" or b.visible):
			var c := Color(0.25, 0.45, 1.0) if b.side == "france" else Color(0.95, 0.25, 0.2)
			draw_rect(Rect2(_to_map(b.world) - Vector2(2.5, 2.5), Vector2(5, 5)), c)
	for u in battle.units:
		if u.alive() and (u.side == "france" or u.visible):
			var c := Color(0.55, 0.7, 1.0) if u.side == "france" else Color(1.0, 0.45, 0.4)
			draw_rect(Rect2(_to_map(u.world) - Vector2(1, 1), Vector2(2, 2)), c)
	if camera != null:
		var view := get_viewport_rect().size / camera.zoom
		var centre := Iso.to_world(camera.position)
		var half := Vector2(view.x, view.y / Iso.SQ) / 2.0
		draw_rect(Rect2(_to_map(centre - half), _to_map(half * 2.0)), Color(1.0, 0.92, 0.6), false, 1.2)


func _gui_input(event: InputEvent) -> void:
	var button := event as InputEventMouseButton
	var motion := event as InputEventMouseMotion
	var at := Vector2(-1, -1)
	if button != null and button.pressed and button.button_index == MOUSE_BUTTON_LEFT:
		at = button.position
	elif motion != null and (motion.button_mask & MOUSE_BUTTON_MASK_LEFT) != 0:
		at = motion.position
	if at.x >= 0.0 and camera != null:
		camera.focus(Iso.to_screen(at / SIZE * Iso.WORLD))
		accept_event()
