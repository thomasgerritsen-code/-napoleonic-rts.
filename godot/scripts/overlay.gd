class_name Overlay
extends Node2D
## Drawn over the field: the box being dragged and a brief marker where an
## order was given.

var box := Rect2():
	set(value):
		box = value
		queue_redraw()

var _mark := Vector2.ZERO
var _mark_life := 0.0


func mark(canvas_at: Vector2) -> void:
	_mark = canvas_at
	_mark_life = 0.8
	queue_redraw()


func _process(delta: float) -> void:
	if _mark_life > 0.0:
		_mark_life -= delta
		queue_redraw()


func _draw() -> void:
	if box.size != Vector2.ZERO:
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.12))
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.85), false, 1.5)
	if _mark_life > 0.0:
		var a := clampf(_mark_life / 0.8, 0.0, 1.0)
		draw_set_transform(_mark, 0.0, Vector2(1.0, Iso.SQ))
		draw_arc(Vector2.ZERO, 18.0 + (1.0 - a) * 14.0, 0.0, TAU, 32, Color(0.95, 0.85, 0.4, a), 2.0)
