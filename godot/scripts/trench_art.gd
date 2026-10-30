class_name TrenchArt
extends RefCounted
## How a trench looks, as the web iso view draws it (iso-view-v1.js:
## trenchFrame, trenchOutline, drawTrenchBeds, parapetShape, parapetDrawable,
## revetmentDrawables). A rounded cut with hand-dug uneven edges: inside the lip
## the far wall runs down with layers of soil to a narrower bed ~1.1 m deep; a
## fire-step ledge along the parapet side; a duckboard down the bed. On the
## enemy side a rounded bank of thrown-up earth that tapers off round the ends,
## a shallow ditch in front of it. Level 2 revets the walls with fascines,
## level 3 sets gabions along the bank (gaps for the muskets) and, on a bank
## running across the screen, a course of sandbags. Lengths here are game px
## (as the trench's own length and width); heights are metres.

const PPM := 22.5                 # game px per metre
const LIFT := 0.866               # screen px per px of height
const SINK := 1.1                 # depth of the bed, m
const FIRE_STEP := 0.5            # the ledge the front rank stands on, m
const FIRE_STEP_NEAR := 0.9       # ...lower when the bank is on the camera side
const PARAPET_H := 0.5            # height of the bank, m
const LEAN_GAP := 3.0             # px between the leaning men and the bank
const DITCH_FROM := 34.0
const DITCH_TO := 50.0
const GABION_GAP := 1.25          # m between gabions

const WALL_TOP := Color("#7a6242")
const WALL_MID := Color("#4d3c28")
const WALL_LOW := Color("#2a2016")
const BED := Color("#3b2e20")


static func h(a: int, b: int) -> float:
	return Battle.hash01(a, b)


## A trench's frame: centre, along (axis) and out (towards the enemy) unit
## vectors in the world, half length and half width.
class Frame:
	var t: Dictionary
	var c: Vector2
	var along: Vector2
	var out: Vector2
	var half: float
	var w: float

	func _init(t_: Dictionary) -> void:
		t = t_
		c = t["centre"]
		out = Vector2.from_angle(t["facing"])
		along = out.rotated(PI / 2.0)
		half = t["length"] / 2.0
		w = t["width"] / 2.0

	## Screen point `u` along, `v` out (px), `up` metres above the ground.
	func at(u: float, v: float, up := 0.0) -> Vector2:
		return Iso.to_screen(c + along * u + out * v) - Vector2(0.0, up * TrenchArt.PPM * TrenchArt.LIFT)

	## Half-width of the cut at `u`: straight sides, round ends.
	func across(u: float) -> float:
		var e := maxf(0.0, absf(u) - (half - w)) / w
		return 0.0 if e >= 1.0 else w * sqrt(1.0 - e * e)


static func id_of(t: Dictionary) -> int:
	return int(t.get("id", 1))


## The cut's outline (or the bed's: inset and lowered), a little uneven: dug by hand.
static func outline(f: Frame, inset := 0.0, up := 0.0, grow := 0.0) -> PackedVector2Array:
	var n := maxi(14, roundi(f.half / 4.0))
	var pts := PackedVector2Array()
	var tid := id_of(f.t)
	for side: int in [1, -1]:
		for i in n + 1:
			var u := (-1.0 if side > 0 else 1.0) * f.half * cos(PI * i / n) * (1.0 + grow / f.half)
			var wob := 1.0 + 0.08 * (h(tid * 7 + i, side + 3) - 0.5)
			pts.append(f.at(u, side * maxf(0.0, f.across(u / (1.0 + grow / f.half)) * wob - inset + grow), up))
	return pts


## For each screen x across the cut, the lowest point of its lip (the near
## edge): what lies below it is hidden by the near wall.
static func lower_lip(lip: PackedVector2Array) -> PackedVector2Array:
	var x0 := INF
	var x1 := -INF
	for p in lip:
		x0 = minf(x0, p.x)
		x1 = maxf(x1, p.x)
	var low := PackedVector2Array()
	var n := 28
	for k in n + 1:
		var x := x0 + (x1 - x0) * k / n + (0.01 if k == 0 else (-0.01 if k == n else 0.0))
		var y := -INF
		for i in lip.size():
			var a := lip[i]
			var b := lip[(i + 1) % lip.size()]
			if (a.x - x) * (b.x - x) > 0.0 or a.x == b.x:
				continue
			y = maxf(y, a.y + (b.y - a.y) * (x - a.x) / (b.x - a.x))
		if y > -INF:
			low.append(Vector2(x, y))
	return low


## The lip's height at screen `x` (INF beside the cut).
static func lip_y(low: PackedVector2Array, x: float) -> float:
	if low.size() < 2 or x < low[0].x or x > low[low.size() - 1].x:
		return INF
	for i in low.size() - 1:
		if x <= low[i + 1].x:
			var k := (x - low[i].x) / maxf(0.001, low[i + 1].x - low[i].x)
			return lerpf(low[i].y, low[i + 1].y, k)
	return low[low.size() - 1].y


## Whether Godot can fill this outline (a degenerate one is skipped, not an error).
static func fillable(pts: PackedVector2Array) -> bool:
	return pts.size() >= 3 and not Geometry2D.triangulate_polygon(pts).is_empty()


static func fill(canvas: CanvasItem, pts: PackedVector2Array, color: Color) -> void:
	if fillable(pts):
		canvas.draw_colored_polygon(pts, color)


## Fill `pts` with a top-to-bottom gradient through `colors` (evenly spaced).
static func gradient_fill(canvas: CanvasItem, pts: PackedVector2Array, colors: Array, top: float, bottom: float, alpha := 1.0) -> void:
	if not fillable(pts):
		return
	var cols := PackedColorArray()
	for p in pts:
		var k := clampf((p.y - top) / maxf(1.0, bottom - top), 0.0, 1.0) * (colors.size() - 1)
		var i := mini(int(k), colors.size() - 2)
		var c: Color = (colors[i] as Color).lerp(colors[i + 1], k - i)
		c.a *= alpha
		cols.append(c)
	canvas.draw_polygon(pts, cols)


## Fill the parts of `pts` that lie inside `clip`.
static func clipped_fill(canvas: CanvasItem, pts: PackedVector2Array, clip: PackedVector2Array, color: Color) -> void:
	if not fillable(pts):
		return
	for part in Geometry2D.intersect_polygons(pts, clip):
		fill(canvas, part, color)


static func clipped_line(canvas: CanvasItem, pts: PackedVector2Array, clip: PackedVector2Array, color: Color, width: float) -> void:
	var line := pts.duplicate()
	line.append(pts[0])
	for part in Geometry2D.intersect_polyline_with_polygon(line, clip):
		if part.size() >= 2:
			canvas.draw_polyline(part, color, width, true)


## The cut, the trodden ground round it, the ditch, the fascines, the soil
## layers, the bed, the fire-step and the flying earth (under everything else).
static func draw_bed(canvas: CanvasItem, t: Dictionary, clock: float, fascine: Texture2D, fascine_meta: Dictionary) -> void:
	var f := Frame.new(t)
	var p: float = minf(1.0, t["progress"])
	var depth := SINK * p
	var tid := id_of(t)
	var lip := outline(f)
	var ps := parapet_shape(f)
	# The ditch in front of the bank (enemy side): a shallow trough.
	if p >= 0.5:
		var inner := PackedVector2Array()
		var outer := PackedVector2Array()
		for u: float in ps["us"]:
			inner.append(f.at(u * 1.04, lip_v(f, u) + DITCH_FROM))
			outer.append(f.at(u * 1.04, lip_v(f, u) + DITCH_TO))
		outer.reverse()
		var trough := inner + outer
		var a := minf(1.0, (p - 0.5) * 2.0)
		gradient_fill(canvas, trough, [Color(0.31, 0.25, 0.16, 0.85), Color(0.18, 0.15, 0.1, 0.95), Color(0.47, 0.41, 0.27, 0.55)],
			f.at(0, f.w + DITCH_FROM).y, f.at(0, f.w + DITCH_TO).y, a)
	# Trodden, spoil-strewn ground round the cut.
	var trod := 0.5 + 0.5 * p
	fill(canvas, outline(f, 0.0, 0.0, 7.0), Color(0.41, 0.34, 0.23, 0.55 * trod))
	fill(canvas, outline(f, 0.0, 0.0, 3.0), Color(0.36, 0.29, 0.2, 0.8 * trod))
	# The cut: the far wall from the lip down to the bed, darker downwards.
	var top := INF
	var bottom := -INF
	for q in lip:
		top = minf(top, q.y)
		bottom = maxf(bottom, q.y)
	bottom += depth * PPM * LIFT
	gradient_fill(canvas, lip, [WALL_TOP, WALL_MID, WALL_LOW], top, bottom)
	# Fascines on the walls (level 2), growing in while the men put them up.
	var level := int(t.get("level", 1))
	var revet := 1.0 if level >= 2 else (float(t.get("upgrade_progress", 0.0)) if int(t.get("upgrade_to", 0)) == 2 else 0.0)
	if fascine != null and p > 0.6 and revet > 0.0 and fillable(lip):
		var k := PPM / float(fascine_meta.get("pxPerM", PPM))
		var tile := Vector2(fascine.get_width(), fascine.get_height()) * k
		var origin := Vector2(f.at(0, 0).x, top)
		var uvs := PackedVector2Array()
		for q in lip:
			uvs.append((q - origin) / tile)
		var tint := Color(1, 1, 1, minf(1.0, (p - 0.6) / 0.4) * revet)
		var tints := PackedColorArray()
		for q in lip:
			# Darker towards the bottom, as in shadow.
			tints.append(tint.darkened(0.55 * clampf((q.y - top) / maxf(1.0, bottom - top), 0.0, 1.0)))
		canvas.draw_polygon(lip, tints, uvs, fascine)
	# Layers of soil showing in the far wall.
	for k: float in [0.3, 0.62]:
		clipped_line(canvas, outline(f, f.w * 0.12 * k, -depth * k), lip, Color(0.12, 0.09, 0.05, 0.28), 1.0)
	# The bed, narrower and lower, where the near wall does not hide it.
	clipped_fill(canvas, outline(f, f.w * 0.18, -depth), lip, BED)
	# The fire-step along the parapet wall.
	if p > 0.5:
		var n := maxi(8, roundi(f.half / 6.0))
		var edge := PackedVector2Array()
		var back := PackedVector2Array()
		var riser := PackedVector2Array()
		for i in n + 1:
			var u := -(f.half - f.w * 0.4) * cos(PI * i / n)
			edge.append(f.at(u, f.across(u) * 0.5, -FIRE_STEP * p))
			back.append(f.at(u, f.across(u) * 0.97, -FIRE_STEP * p))
			riser.append(f.at(u, f.across(u) * 0.5, -depth))
		var rev_edge := edge.duplicate()
		rev_edge.reverse()
		var rev_back := back.duplicate()
		rev_back.reverse()
		clipped_fill(canvas, riser + rev_edge, lip, Color("#2f2419"))
		clipped_fill(canvas, edge + rev_back, lip, Color("#6a5536"))
		for part in Geometry2D.intersect_polyline_with_polygon(edge, lip):
			if part.size() >= 2:
				canvas.draw_polyline(part, Color(0.63, 0.53, 0.36, 0.6), 1.2, true)
	# A trodden duckboard line down the middle of the bed.
	if p >= 1.0:
		var duck := PackedVector2Array([f.at(-f.half + f.w, 0, -depth), f.at(f.half - f.w, 0, -depth)])
		for part in Geometry2D.intersect_polyline_with_polygon(duck, lip):
			if part.size() >= 2:
				canvas.draw_polyline(part, Color(0.43, 0.34, 0.22, 0.55), 2.2, true)
	# A crumbly light lip.
	var rim := lip.duplicate()
	rim.append(lip[0])
	canvas.draw_polyline(rim, Color(0.66, 0.56, 0.39, 0.6), 1.1, true)
	# Earth flying from the spades towards the bank while they dig.
	if (p < 1.0 or int(t.get("upgrade_to", 0)) != 0) and clock - float(t.get("dug_at", -99.0)) < 2.0:
		for i in 9:
			var ph := fmod(clock * 1.7 + i * 0.37, 1.0)
			var u := (h(tid, i) * 2.0 - 1.0) * (f.half - f.w * 0.5)
			canvas.draw_circle(f.at(u, f.w * (0.2 + ph), 0.5 + sin(ph * PI) * 0.9), 2.4 * (1.0 - ph * 0.5), Color(0.47, 0.38, 0.24, 0.9))


static func lip_v(f: Frame, u: float) -> float:
	return maxf(f.across(u), 2.0)


## The bank's crest along the cut: where along it (us) and how high (lift, m).
static func parapet_shape(f: Frame) -> Dictionary:
	var n := maxi(8, roundi(f.half / 6.0))
	var us: Array[float] = []
	for i in n + 1:
		us.append(-(f.half + 6.0) * cos(PI * i / n))
	return {"n": n, "us": us}


static func lift(f: Frame, u: float) -> float:
	var height := PARAPET_H * minf(1.0, float(f.t["progress"]) * 1.4)
	var e := clampf((f.half + 6.0 - absf(u)) / (f.w * 1.2), 0.0, 1.0)
	var bump := 0.88 + 0.22 * h(id_of(f.t) * 31 + roundi(u), 5)
	# A breached bank has a gap where the shot struck.
	if f.t.get("breached", false):
		var at := (h(id_of(f.t), 17) - 0.5) * f.half
		bump *= clampf(absf(u - at) / 14.0, 0.15, 1.0)
	return height * e * e * (3.0 - 2.0 * e) * bump


## The bank: a short steep face to the trench, a long gentle slope out towards
## the enemy that greens over at its foot; a light crest; clods on the slope.
static func draw_bank(canvas: CanvasItem, t: Dictionary, shift: Vector2) -> void:
	var f := Frame.new(t)
	var ps := parapet_shape(f)
	var tid := id_of(t)
	var inner := PackedVector2Array()
	var ridge := PackedVector2Array()
	var outer := PackedVector2Array()
	var i := 0
	for u: float in ps["us"]:
		inner.append(f.at(u, lip_v(f, u)) - shift)
		ridge.append(f.at(u, lip_v(f, u) + 7.0, lift(f, u)) - shift)
		outer.append(f.at(u * 1.05, lip_v(f, u) + 30.0 + 8.0 * h(tid + i, 4)) - shift)
		i += 1
	var rev_ridge := ridge.duplicate()
	rev_ridge.reverse()
	fill(canvas, inner + rev_ridge, Color("#4a3a27"))
	var rev_outer := outer.duplicate()
	rev_outer.reverse()
	var crest_y := f.at(0, f.w + 7.0, PARAPET_H).y - shift.y
	var foot_y := f.at(0, f.w + 36.0).y - shift.y
	var slope := ridge + rev_outer
	var a := minf(crest_y, foot_y)
	var b := maxf(crest_y, foot_y)
	var cols := [Color("#8d7652"), Color("#74663f"), Color(0.35, 0.42, 0.22, 0.0)]
	if crest_y > foot_y:
		cols.reverse()
	gradient_fill(canvas, slope, cols, a, b)
	canvas.draw_polyline(ridge.slice(1, ridge.size() - 1), Color(0.72, 0.63, 0.45, 0.6), 1.6, true)
	for k in ps["n"] * 2:
		var u := (h(tid, k + 40) * 2.0 - 1.0) * f.half * 0.95
		var v := lip_v(f, u) + 9.0 + h(k, tid + 3) * 16.0
		var spot := f.at(u, v, lift(f, u) * (1.0 - (v - lip_v(f, u) - 7.0) / 27.0) * 0.9) - shift
		canvas.draw_set_transform(spot, 0.0, Vector2(1.0, 0.6))
		canvas.draw_circle(Vector2.ZERO, 1.5 + h(k, 7) * 2.0, Color(0.29, 0.23, 0.15, 0.55) if k % 3 else Color(0.59, 0.5, 0.35, 0.5))
		canvas.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)


## Gabions in a row along the inside of the bank (gaps between them for the
## muskets), and sandbags along the crest of a bank running across the screen.
static func draw_revetment(canvas: CanvasItem, t: Dictionary, shift: Vector2, gabion: Texture2D, gabion_meta: Dictionary,
		bags: Texture2D, bags_meta: Dictionary) -> void:
	var level := int(t.get("level", 1))
	var build := 1.0 if level >= 3 else (float(t.get("upgrade_progress", 0.0)) if int(t.get("upgrade_to", 0)) == 3 else 0.0)
	if gabion == null or t["progress"] < 1.0 or build <= 0.0:
		return
	var f := Frame.new(t)
	var tid := id_of(t)
	var near := sin(float(t["facing"])) > 0.0
	var step := GABION_GAP * PPM
	var n := maxi(1, floori((2.0 * f.half - f.w * 1.2) / step))
	var spots: Array[Vector2] = []
	for i in n + 1:
		if build < 1.0 and h(tid * 7 + i, 9) > build:
			continue
		var u := -n * step / 2.0 + i * step + (h(tid * 13 + i, 2) - 0.5) * 3.0
		spots.append(f.at(u, lip_v(f, u) + 3.0, minf(lift(f, u), 0.12)) - shift)
	spots.sort_custom(func(a: Vector2, b: Vector2) -> bool: return a.y < b.y)
	var k := Iso.SPRITE_SCALE
	var baskets := func() -> void:
		for s in spots:
			canvas.draw_texture_rect(gabion, Rect2(s - Vector2(gabion_meta["pivot"]["x"], gabion_meta["pivot"]["y"]) * k,
				Vector2(gabion.get_width(), gabion.get_height()) * k), false)
	var sacks := func() -> void:
		if bags == null or build < 1.0 or absf(sin(float(t["facing"]))) <= 0.82:
			return
		var bs := 1.7 * PPM
		var m := maxi(1, floori((2.0 * f.half - f.w * 1.6) / bs))
		for i in m + 1:
			var u := -m * bs / 2.0 + i * bs
			var s := f.at(u, lip_v(f, u) + 8.0, lift(f, u) * 0.95) - shift
			canvas.draw_texture_rect(bags, Rect2(s - Vector2(bags_meta["pivot"]["x"], bags_meta["pivot"]["y"]) * k * 0.8,
				Vector2(bags.get_width(), bags.get_height()) * k * 0.8), false)
	if near:
		baskets.call()
		sacks.call()
	else:
		sacks.call()
		baskets.call()
