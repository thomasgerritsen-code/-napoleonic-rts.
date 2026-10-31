class_name Overlay
extends Node2D
## Drawn over the field: each battalion's colour with its strength, the box
## being dragged, a marker where an order was given, the golden arrow of an
## order being dragged out (where the line will stand, as wide as it, and the
## way its front will face), and the outline of a building being placed
## (green where it may stand, red where not).

const FLAG := {"france": [Color(0.12, 0.24, 0.62), Color(0.95, 0.94, 0.9), Color(0.8, 0.14, 0.16)],
	"britain": [Color(0.78, 0.12, 0.14), Color(0.95, 0.94, 0.9), Color(0.1, 0.18, 0.5)]}

var battle: Battle
var box := Rect2()

var _mark := Vector2.ZERO
var _mark_life := 0.0
## The order arrow, in the world: where the line goes, the way it will face,
## how wide it is; `_aim_life` < 0 while it is being dragged, then it fades.
var _aim_at := Vector2.INF
var _aim_way := Vector2.RIGHT
var _aim_width := 0.0
var _aim_life := 0.0
const AIM_FADE := 1.2
const GOLD := Color(0.98, 0.8, 0.3)


## While an order is dragged out: the line at `at`, its front towards `way`.
func aim(at: Vector2, way: Vector2, width: float) -> void:
	_aim_at = at
	_aim_way = way.normalized()
	_aim_width = width
	_aim_life = -1.0


## Let go: the arrow stays a moment and fades.
func aim_done() -> void:
	if _aim_at != Vector2.INF:
		_aim_life = AIM_FADE


func aim_cancel() -> void:
	_aim_at = Vector2.INF


func mark(canvas_at: Vector2) -> void:
	_mark = canvas_at
	_mark_life = 0.8


func _process(delta: float) -> void:
	_mark_life = maxf(0.0, _mark_life - delta)
	if _aim_life > 0.0:
		_aim_life -= delta
		if _aim_life <= 0.0:
			_aim_at = Vector2.INF
	queue_redraw()


func _draw() -> void:
	if battle != null:
		for p in battle.territories:
			_draw_post(p)
		for r in battle.regiments:
			if not r.destroyed():
				_draw_colour(r)
		if battle.placing != "":
			_draw_plan(battle.placing)
	if box.size != Vector2.ZERO:
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.12))
		draw_rect(box, Color(0.95, 0.9, 0.6, 0.85), false, 1.5)
	if _aim_at != Vector2.INF:
		_draw_aim(1.0 if _aim_life < 0.0 else clampf(_aim_life / AIM_FADE, 0.0, 1.0))
	if _mark_life > 0.0:
		var a := clampf(_mark_life / 0.8, 0.0, 1.0)
		draw_set_transform(_mark, 0.0, Vector2(1.0, Iso.SQ))
		draw_arc(Vector2.ZERO, 18.0 + (1.0 - a) * 14.0, 0.0, TAU, 32, Color(0.95, 0.85, 0.4, a), 2.0)
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## The bar where the line will stand and the arrow of its front.
func _draw_aim(a: float) -> void:
	var right := _aim_way.orthogonal()
	var half := maxf(30.0, _aim_width / 2.0)
	var ends := [Iso.to_screen(_aim_at - right * half), Iso.to_screen(_aim_at + right * half)]
	var shaft := clampf(half * 0.6, 45.0, 110.0)
	var base := Iso.to_screen(_aim_at)
	var tip := Iso.to_screen(_aim_at + _aim_way * shaft)
	var neck := Iso.to_screen(_aim_at + _aim_way * (shaft - 18.0))
	var side := Iso.to_screen(_aim_at + _aim_way * (shaft - 18.0) + right * 11.0) - neck
	var dark := Color(0.12, 0.09, 0.03, 0.7 * a)
	var gold := Color(GOLD, 0.95 * a)
	# Dark under, gold over: it reads on grass, road and snow alike.
	draw_line(ends[0], ends[1], dark, 7.0, true)
	draw_line(base, neck, dark, 6.0, true)
	draw_colored_polygon(PackedVector2Array([tip + (tip - neck).normalized() * 2.0, neck + side * 1.25, neck - side * 1.25]), dark)
	draw_line(ends[0], ends[1], gold, 4.0, true)
	for e: Vector2 in ends:
		draw_circle(e, 3.5, gold)
	draw_line(base, neck, gold, 3.5, true)
	draw_colored_polygon(PackedVector2Array([tip, neck + side, neck - side]), gold)


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


## A post: a ring in its owner's colour, filling as it is being claimed.
func _draw_post(p: Dictionary) -> void:
	var centre := Iso.to_screen(p["world"])
	var owner: String = p["owner"]
	var colour := Color(0.85, 0.82, 0.7, 0.8)
	if owner == "france":
		colour = Color(0.3, 0.5, 0.95, 0.9)
	elif owner == "britain":
		colour = Color(0.9, 0.3, 0.25, 0.9)
	if p["contested"]:
		colour = Color(1.0, 0.75, 0.2, 0.95)
	draw_set_transform(centre, 0.0, Vector2(1.0, Iso.SQ))
	draw_arc(Vector2.ZERO, battle.territory_radius, 0.0, TAU, 72, colour, 2.5)
	var progress := float(p["progress"])
	if progress > 0.0:
		var claim := Color(0.3, 0.5, 0.95) if p["claim"] == "france" else Color(0.9, 0.3, 0.25)
		draw_arc(Vector2.ZERO, battle.territory_radius - 8.0, -PI / 2.0, -PI / 2.0 + TAU * progress, 48, claim, 5.0)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	draw_string(ThemeDB.fallback_font, centre + Vector2(-70, -battle.territory_radius * Iso.SQ - 8.0),
		"%s (+%s %s)" % [p["label"], p["rate"], Rules.label(p["resource"])], HORIZONTAL_ALIGNMENT_CENTER, 140, 12, Color(0.97, 0.94, 0.84))
