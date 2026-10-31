class_name Lights
extends Node2D
## Light in the field (Godot's 2D lights, added on top of the light of the
## hour that DayNight lays over the field): every musket and gun lights up
## its surroundings for a moment, a gun and a bursting shell the most, which
## by day hardly shows and at night flickers along the lines; and the windows
## of the buildings glow warm from the evening on, each flickering a little.

const FLASHES := 24          # muzzle lights at once (the oldest is reused)
const FLASH_COLOUR := Color(1.0, 0.78, 0.45)
const LAMP_COLOUR := Color(1.0, 0.72, 0.38)
## The buildings with lit windows, and how big their glow is.
const LAMPS := {"towncentre": 1.6, "house": 0.9, "barracks": 1.3, "hospital": 1.2, "stable": 1.0,
	"tower": 0.8, "mill": 0.8, "lumbercamp": 0.7, "mine": 0.7}

var battle: Battle
## Flashes since the start: tests.
var flashed := 0
var _glow: Texture2D
var _flashes: Array[PointLight2D] = []
var _life: PackedFloat32Array = PackedFloat32Array()
var _span: PackedFloat32Array = PackedFloat32Array()
var _peak: PackedFloat32Array = PackedFloat32Array()
var _next := 0
var _lamps := {}             # Building -> PointLight2D
var _lamp_clock := 0.0


func _ready() -> void:
	_glow = _glow_texture()
	for i in FLASHES:
		var light := _light(FLASH_COLOUR)
		light.enabled = false
		_flashes.append(light)
		_life.append(0.0)
		_span.append(1.0)
		_peak.append(0.0)


func _light(colour: Color) -> PointLight2D:
	var light := PointLight2D.new()
	light.texture = _glow
	light.color = colour
	light.blend_mode = Light2D.BLEND_MODE_ADD
	add_child(light)
	return light


static func _glow_texture() -> Texture2D:
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 1))
	gradient.set_color(1, Color(1, 1, 1, 0))
	gradient.add_point(0.35, Color(1, 1, 1, 0.45))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 128
	texture.height = 128
	return texture


func _darkness() -> float:
	return DayNight.darkness_at(battle.clock) if battle != null else 0.0


## A flash of light at screen point `at`: a musket's (size about 0.5), a
## gun's (1.3 or more) or a burst's; brighter in the dark.
func flash(at: Vector2, size: float) -> void:
	flashed += 1
	var i := _next
	_next = (_next + 1) % FLASHES
	var light := _flashes[i]
	light.position = at
	light.texture_scale = 0.6 + size * 1.4
	_peak[i] = (0.35 + 1.1 * _darkness()) * clampf(0.6 + size * 0.6, 0.6, 1.8)
	_span[i] = 0.09 + size * 0.09
	_life[i] = _span[i]
	light.energy = _peak[i]
	light.enabled = true


func _process(delta: float) -> void:
	for i in FLASHES:
		if _life[i] <= 0.0:
			continue
		_life[i] -= delta
		var light := _flashes[i]
		if _life[i] <= 0.0:
			light.enabled = false
		else:
			var k := _life[i] / _span[i]
			light.energy = _peak[i] * k * k
	_lamp_clock -= delta
	if _lamp_clock <= 0.0:
		_lamp_clock = 0.25
		_tend_lamps()
	_flicker()


## Lamps for the standing, finished buildings, lit by the dark of the hour.
func _tend_lamps() -> void:
	if battle == null:
		return
	var dark := _darkness()
	for b in battle.buildings:
		var wanted: bool = LAMPS.has(b.type) and b.standing() and b.complete and dark > 0.05
		if wanted and not _lamps.has(b):
			var lamp := _light(LAMP_COLOUR)
			lamp.position = b.position + Vector2(0.0, -8.0)
			lamp.texture_scale = float(LAMPS[b.type]) * 1.5
			lamp.set_meta("seed", Battle.hash01(b.id, 41) * TAU)
			_lamps[b] = lamp
		elif not wanted and _lamps.has(b):
			(_lamps[b] as PointLight2D).queue_free()
			_lamps.erase(b)
	for b: Variant in _lamps.keys():
		if not is_instance_valid(b):
			(_lamps[b] as PointLight2D).queue_free()
			_lamps.erase(b)


## The lamps flicker a little, each in its own time.
func _flicker() -> void:
	if _lamps.is_empty():
		return
	var dark := _darkness()
	var t := battle.clock if battle != null else 0.0
	for b: Variant in _lamps:
		var lamp: PointLight2D = _lamps[b]
		var seed_: float = lamp.get_meta("seed", 0.0)
		lamp.energy = dark * (0.75 + 0.12 * sin(t * 7.0 + seed_) + 0.06 * sin(t * 17.0 + seed_ * 2.0))


## How many lamps are lit: tests.
func lamps() -> int:
	return _lamps.size()
