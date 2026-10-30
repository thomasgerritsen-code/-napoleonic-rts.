class_name BattleCamera
extends Camera2D
## Pans with WASD, the arrow keys or the middle mouse button, zooms with the
## wheel towards the pointer, and keeps the whole screen over the map: its
## edges never pass the ground's, and it zooms out no further than the map.

const PAN_SPEED := 900.0     # canvas px a second at zoom 1
const ZOOM_MIN := 0.3
const ZOOM_MAX := 2.5
const ZOOM_STEP := 1.12

var _dragging := false
## The ground on the canvas: from the top of its relief strip to the map's foot.
var _ground := Rect2(0.0, 0.0, Iso.WORLD.x, Iso.WORLD.y * Iso.SQ)


func _ready() -> void:
	zoom = Vector2.ONE * 1.1
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	var top := float(meta.get("padTop", 0.0)) / (float(meta["pxPerM"]) / float(meta["gamePxPerM"]))
	_ground = Rect2(0.0, -top, Iso.WORLD.x, Iso.WORLD.y * Iso.SQ + top)
	get_viewport().size_changed.connect(_clamp)


func focus(canvas_at: Vector2) -> void:
	position = canvas_at
	_clamp()


func _process(delta: float) -> void:
	var move := Vector2.ZERO
	if Input.is_physical_key_pressed(KEY_A) or Input.is_physical_key_pressed(KEY_LEFT):
		move.x -= 1.0
	if Input.is_physical_key_pressed(KEY_D) or Input.is_physical_key_pressed(KEY_RIGHT):
		move.x += 1.0
	if Input.is_physical_key_pressed(KEY_W) or Input.is_physical_key_pressed(KEY_UP):
		move.y -= 1.0
	if Input.is_physical_key_pressed(KEY_S) or Input.is_physical_key_pressed(KEY_DOWN):
		move.y += 1.0
	if move != Vector2.ZERO:
		position += move.normalized() * PAN_SPEED * delta / zoom.x
		_clamp()


func _unhandled_input(event: InputEvent) -> void:
	var button := event as InputEventMouseButton
	if button != null:
		if button.button_index == MOUSE_BUTTON_MIDDLE:
			_dragging = button.pressed
		elif button.pressed and button.button_index in [MOUSE_BUTTON_WHEEL_UP, MOUSE_BUTTON_WHEEL_DOWN]:
			var before := get_global_mouse_position()
			var factor := ZOOM_STEP if button.button_index == MOUSE_BUTTON_WHEEL_UP else 1.0 / ZOOM_STEP
			zoom = Vector2.ONE * clampf(zoom.x * factor, _zoom_min(), ZOOM_MAX)
			# Keep the point under the pointer where it was.
			position += before - get_global_mouse_position()
			_clamp()
		return
	var motion := event as InputEventMouseMotion
	if motion != null and _dragging:
		position -= motion.relative / zoom.x
		_clamp()


## No further out than the whole map fills the screen.
func _zoom_min() -> float:
	var view := get_viewport_rect().size
	return maxf(ZOOM_MIN, maxf(view.x / _ground.size.x, view.y / _ground.size.y))


func _clamp() -> void:
	if zoom.x < _zoom_min():
		zoom = Vector2.ONE * _zoom_min()
	var half := get_viewport_rect().size / zoom / 2.0
	position.x = clampf(position.x, _ground.position.x + half.x, _ground.end.x - half.x)
	position.y = clampf(position.y, _ground.position.y + half.y, _ground.end.y - half.y)
