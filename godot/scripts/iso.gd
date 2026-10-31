class_name Iso
extends RefCounted
## The web game's iso projection. World units are the game's pixels (22.5 to a
## metre, the map 8000 x 5000); the canvas holds the projected point at zoom 1:
## x stays, y is halved (seen from 30 degrees up), and ground raised h metres
## shows h * LIFT metres higher. The camera does the zooming and panning.

const PPM := 22.5
const SQ := 0.5
const LIFT := 0.866
const SPRITE_PPM := 128.0 / 3.1
## Sprites were rendered at SPRITE_PPM pixels a metre; at zoom 1 a metre is PPM.
const SPRITE_SCALE := PPM / SPRITE_PPM
const WORLD := Vector2(8000, 5000)
const DIRECTIONS := ["e", "se", "s", "sw", "w", "nw", "n", "ne"]

## Ground heights in metres on a grid of game metres (ground.json "relief").
static var _heights := PackedFloat32Array()
static var _x0 := 0.0
static var _y0 := 0.0
static var _cell := 1.0
static var _cols := 0
static var _rows := 0


static func load_relief(meta: Dictionary) -> void:
	var relief: Dictionary = meta.get("relief", {})
	if relief.is_empty():
		return
	_x0 = float(relief["x0"])
	_y0 = float(relief["y0"])
	_cell = float(relief["cell"])
	_cols = int(relief["cols"])
	_rows = int(relief["rows"])
	var bytes := Marshalls.base64_to_raw(String(relief["data"]))
	_heights.resize(_cols * _rows)
	for i in _cols * _rows:
		_heights[i] = bytes.decode_u16(i * 2) / 100.0


## Height of the ground under a world point, in game pixels.
static func height_px(world: Vector2) -> float:
	if _cols < 2 or _rows < 2:
		return 0.0
	var fj := (world.x / PPM - _x0) / _cell
	var fi := (world.y / PPM - _y0) / _cell
	var j := clampi(floori(fj), 0, _cols - 2)
	var i := clampi(floori(fi), 0, _rows - 2)
	var u := clampf(fj - j, 0.0, 1.0)
	var v := clampf(fi - i, 0.0, 1.0)
	var top := lerpf(_heights[i * _cols + j], _heights[i * _cols + j + 1], u)
	var bottom := lerpf(_heights[(i + 1) * _cols + j], _heights[(i + 1) * _cols + j + 1], u)
	return lerpf(top, bottom, v) * PPM


static func to_screen(world: Vector2) -> Vector2:
	return Vector2(world.x, world.y * SQ - height_px(world) * LIFT)


## The ground point shown at a canvas point. Raised ground shows higher, so the
## point lies south of the flat one; a few steps settle it (slopes are gentle).
static func to_world(screen: Vector2) -> Vector2:
	var world := Vector2(screen.x, screen.y / SQ)
	for _step in 6:
		world.y = (screen.y + height_px(world) * LIFT) / SQ
	return world


## Sprite direction for a heading in world space (radians, y down).
static func direction(angle: float) -> String:
	return DIRECTIONS[posmod(roundi(angle / (PI / 4.0)), 8)]


static func read_json(path: String) -> Variant:
	return JSON.parse_string(FileAccess.get_file_as_string(path))
