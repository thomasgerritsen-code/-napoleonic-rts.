class_name Phone
## Played on a phone: a small touch screen. The game is laid out for a
## computer screen 1400 by 860; on a phone that would make every button and
## letter a third of its size. There the screen is laid out as if it were
## about 780 by 420 (turned on its side: 420 by 780), so a button is a
## finger wide, and the battle's screen takes a compact layout (Hud).

## Landscape: the size the screen is laid out as on a phone.
const BASE := Vector2i(780, 420)
## A screen whose short side is under this many inches is a phone's.
const PHONE_INCHES := 3.6

## Tests (and a computer trying the phone layout) set this.
static var forced := false


static func active() -> bool:
	if forced:
		return true
	if not (OS.has_feature("mobile") or OS.get_name() in ["iOS", "Android"]):
		return false
	var px := DisplayServer.screen_get_size()
	var dpi := float(DisplayServer.screen_get_dpi())
	if dpi <= 0.0:
		return true
	return minf(px.x, px.y) / dpi < PHONE_INCHES


## The layout for a phone, kept as the screen turns.
static func setup(tree: SceneTree) -> void:
	if not active():
		return
	var root := tree.root
	if not root.has_meta("phone"):
		root.set_meta("phone", true)
		if OS.has_feature("mobile"):
			DisplayServer.screen_set_orientation(DisplayServer.SCREEN_SENSOR_LANDSCAPE)
		root.size_changed.connect(func() -> void: _fit(root))
	_fit(root)


static func _fit(root: Window) -> void:
	var tall := root.size.y > root.size.x
	root.content_scale_size = Vector2i(BASE.y, BASE.x) if tall else BASE
