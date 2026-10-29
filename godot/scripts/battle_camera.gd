class_name BattleCamera
extends Camera2D
## Pans with WASD, the arrow keys or the middle mouse button, zooms with the
## wheel towards the pointer, and stays over the map.

const PAN_SPEED := 900.0     # canvas px a second at zoom 1
const ZOOM_MIN := 0.3
const ZOOM_MAX := 2.5
const ZOOM_STEP := 1.12

var _dragging := false


func _ready() -> void:
	zoom = Vector2.ONE * 1.1


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
			zoom = Vector2.ONE * clampf(zoom.x * factor, ZOOM_MIN, ZOOM_MAX)
			# Keep the point under the pointer where it was.
			position += before - get_global_mouse_position()
			_clamp()
		return
	var motion := event as InputEventMouseMotion
	if motion != null and _dragging:
		position -= motion.relative / zoom.x
		_clamp()


func _clamp() -> void:
	position.x = clampf(position.x, 0.0, Iso.WORLD.x)
	position.y = clampf(position.y, -150.0, Iso.WORLD.y * Iso.SQ)
