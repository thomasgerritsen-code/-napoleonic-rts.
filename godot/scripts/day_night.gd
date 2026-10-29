class_name DayNight
extends CanvasLayer
## The web game's day: ten minutes from 8 in the morning round the clock,
## warm light at sunrise and sunset, blue moonlight at night. Only the look
## changes; sight and fighting stay the same.

const CYCLE := 600.0
const START_HOUR := 8.0
const NIGHT_OPACITY := 0.34
const TWILIGHT_OPACITY := 0.18
const NAMES := {"morning": "Ochtend", "day": "Dag", "evening": "Avond", "night": "Nacht"}

var battle: Battle
var _shade: ColorRect


func _ready() -> void:
	layer = 1
	_shade = ColorRect.new()
	_shade.set_anchors_preset(Control.PRESET_FULL_RECT)
	_shade.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_shade)


static func _smooth(a: float, b: float, x: float) -> float:
	var t := clampf((x - a) / (b - a), 0.0, 1.0)
	return t * t * (3.0 - 2.0 * t)


static func hour_at(seconds: float) -> float:
	return fmod(START_HOUR + fmod(seconds, CYCLE) * 24.0 / CYCLE, 24.0)


## "Dag 13:45" for the HUD.
static func clock_text(seconds: float) -> String:
	var hour := hour_at(seconds)
	var phase := "night" if hour < 5.0 or hour >= 20.0 else ("morning" if hour < 8.0 else ("day" if hour < 17.0 else "evening"))
	var minute := int(hour * 60.0) % 1440
	return "%s %02d:%02d" % [NAMES[phase], minute / 60, minute % 60]


static func tint_at(seconds: float) -> Color:
	var hour := hour_at(seconds)
	var sunrise := _smooth(5.0, 8.0, hour)
	var sunset := _smooth(17.0, 20.0, hour)
	var night := 1.0 - sunrise * (1.0 - sunset)
	var warmth := maxf(4.0 * sunrise * (1.0 - sunrise), 4.0 * sunset * (1.0 - sunset))
	var blue := night * NIGHT_OPACITY
	var amber := warmth * TWILIGHT_OPACITY
	var alpha := blue + amber * (1.0 - blue)
	if alpha < 0.0001:
		return Color(0, 0, 0, 0)
	var moon := Color(12, 25, 58) / 255.0
	var sun := Color(240, 150, 70) / 255.0
	var mix := (moon * blue + sun * amber * (1.0 - blue)) / alpha
	return Color(mix.r, mix.g, mix.b, alpha)


func _process(_delta: float) -> void:
	if battle != null:
		_shade.color = tint_at(battle.clock)
