class_name Overlay
extends Node2D
## Drawn over the field: each battalion's colour with its strength, the box
## being dragged, a marker where an order was given, and the outline of a
## building being placed (green where it may stand, red where not).

const FLAG := {"france": [Color(0.12, 0.24, 0.62), Color(0.95, 0.94, 0.9), Color(0.8, 0.14, 0.16)],
	"britain": [Color(0.78, 0.12, 0.14), Color(0.95, 0.94, 0.9), Color(0.1, 0.18, 0.5)]}

var battle: Battle
var box := Rect2()

var _mark := Vector2.ZERO
var _mark_life := 0.0


func mark(canvas_at: Vector2) -> void:
	_mark = canvas_at
	_mark_life = 0.8


func _process(delta: float) -> void:
	_mark_life = maxf(0.0, _mark_life - delta)
	queue_redraw()


func _draw() -> void:
	if battle != null:
		for r in battle.regiments:
			if not r.destroyed():
				_draw_colour(r)
		if battle.placing != "":
			_draw_plan(battle.placing)
	if box.size != Vector2.ZERO:
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.12))
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.85), false, 1.5)
	if _mark_life > 0.0:
		var a := clampf(_mark_life / 0.8, 0.0, 1.0)
		draw_set_transform(_mark, 0.0, Vector2(1.0, Iso.SQ))
		draw_arc(Vector2.ZERO, 18.0 + (1.0 - a) * 14.0, 0.0, TAU, 32, Color(0.95, 0.85, 0.4, a), 2.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


func _draw_plan(type: String) -> void:
	var at := Iso.to_world(get_global_mouse_position())
	var site: Variant = battle.site_for(type, at)
	var where: Vector2 = site if site != null else at
	var info := Rules.building_type(type)
	var size := Vector2(float(info.get("w", 60)), float(info.get("h", 50)))
	var centre := Iso.to_screen(where)
	var rect := Rect2(centre - Vector2(size.x, size.y * Iso.SQ) / 2.0, Vector2(size.x, size.y * Iso.SQ))
	var colour := Color(0.4, 0.9, 0.4) if site != null else Color(0.95, 0.3, 0.25)
	draw_rect(rect, Color(colour, 0.22))
	draw_rect(rect, colour, false, 2.0)
	if type == "lumbercamp":
		draw_set_transform(centre, 0.0, Vector2(1.0, Iso.SQ))
		draw_arc(Vector2.ZERO, Rules.logging_radius(), 0.0, TAU, 64, Color(colour, 0.5), 1.5)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## A small colour on a pole above the battalion, and a bar for its strength.
func _draw_colour(r: Regiment) -> void:
	var foot := Iso.to_screen(r.centroid()) + Vector2(0.0, -34.0)
	var colours: Array = FLAG[r.side]
	var top := foot + Vector2(0.0, -22.0)
	draw_line(foot, top, Color(0.25, 0.18, 0.1), 1.5)
	if r.routing:
		draw_rect(Rect2(top, Vector2(14, 9)), Color(0.92, 0.92, 0.88))
	else:
		for i in 3:
			draw_rect(Rect2(top + Vector2(i * 6.0, 0.0), Vector2(6, 10)), colours[i])
	if r in battle.selected:
		draw_rect(Rect2(top - Vector2(1, 1), Vector2(20, 12)), Color(1.0, 0.86, 0.35), false, 1.5)
	var share := float(r.strength()) / maxf(1.0, float(r.full_strength()))
	var bar := Rect2(foot + Vector2(-14.0, 3.0), Vector2(28.0, 3.5))
	draw_rect(bar, Color(0.0, 0.0, 0.0, 0.55))
	draw_rect(Rect2(bar.position, Vector2(bar.size.x * share, bar.size.y)), Color(0.85, 0.2, 0.15).lerp(Color(0.35, 0.8, 0.3), share))
