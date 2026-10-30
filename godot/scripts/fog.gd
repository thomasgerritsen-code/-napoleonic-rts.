class_name Fog
extends Sprite2D
## The fog of war over the map, as in the web game: France sees around its
## men and finished buildings (a town centre furthest); ground it has seen
## stays drawn but dimmed, ground never seen lies under cloud. Enemy men show
## only where France sees, enemy buildings once they have been seen.

const CELL := 40.0
const EVERY := 0.25
const UNSEEN := 235          # alpha of cloud over unexplored ground
const REMEMBERED := 120      # and over ground seen before

var battle: Battle
var enabled := true

var _cols := 0
var _rows := 0
var _explored := PackedByteArray()
var _visible := PackedByteArray()
var _pixels := PackedByteArray()
var _image: Image
var _texture: ImageTexture
var _clock := 0.0


func _ready() -> void:
	_cols = ceili(Iso.WORLD.x / CELL)
	_rows = ceili(Iso.WORLD.y / CELL)
	_explored.resize(_cols * _rows)
	_visible.resize(_cols * _rows)
	_pixels.resize(_cols * _rows * 2)
	_image = Image.create_from_data(_cols, _rows, false, Image.FORMAT_LA8, _pixels)
	_texture = ImageTexture.create_from_image(_image)
	texture = _texture
	centered = false
	scale = Vector2(CELL, CELL * Iso.SQ)
	texture_filter = CanvasItem.TEXTURE_FILTER_LINEAR
	z_index = 15
	refresh()


func vision(node: Node2D) -> float:
	if node is Building and (node as Building).type == "tower":
		return float(Rules.tower_level((node as Building).tower_level)["vision"])
	if node is Building:
		return 330.0 if (node as Building).type == "towncenter" else 250.0
	match (node as Unit).type:
		"cavalry":
			return 270.0
		"artillery":
			return 290.0
		"officer":
			return 250.0
	return 215.0


func sees(at: Vector2) -> bool:
	if not enabled:
		return true
	var c := _cell(at)
	return c >= 0 and _visible[c] == 1


func explored(at: Vector2) -> bool:
	if not enabled:
		return true
	var c := _cell(at)
	return c >= 0 and _explored[c] == 1


func _cell(at: Vector2) -> int:
	var x := floori(at.x / CELL)
	var y := floori(at.y / CELL)
	if x < 0 or y < 0 or x >= _cols or y >= _rows:
		return -1
	return y * _cols + x


func _process(delta: float) -> void:
	_clock -= delta
	if _clock <= 0.0:
		_clock = EVERY
		refresh()


func refresh() -> void:
	visible = enabled
	if battle == null or not enabled:
		return
	_visible.fill(0)
	var sources: Array[Node2D] = []
	for u in battle.units:
		if u.side == battle.me and u.alive():
			sources.append(u)
	for b in battle.buildings:
		if b.side == battle.me and b.complete and b.standing():
			sources.append(b)
	for s in sources:
		var at := Battle.spot(s)
		var r := vision(s)
		var cx := floori(at.x / CELL)
		var cy := floori(at.y / CELL)
		var reach := ceili(r / CELL)
		for y in range(maxi(0, cy - reach), mini(_rows, cy + reach + 1)):
			for x in range(maxi(0, cx - reach), mini(_cols, cx + reach + 1)):
				var centre := Vector2((x + 0.5) * CELL, (y + 0.5) * CELL)
				if centre.distance_squared_to(at) <= r * r:
					var i := y * _cols + x
					_visible[i] = 1
					_explored[i] = 1
	for i in _cols * _rows:
		_pixels[i * 2] = 34
		_pixels[i * 2 + 1] = 0 if _visible[i] == 1 else (REMEMBERED if _explored[i] == 1 else UNSEEN)
	_image.set_data(_cols, _rows, false, Image.FORMAT_LA8, _pixels)
	_texture.update(_image)
	for u in battle.units:
		if u.side != battle.me:
			u.visible = sees(u.world) or not u.alive() and explored(u.world)
	for b in battle.buildings:
		if b.side != battle.me:
			b.visible = explored(b.world)
