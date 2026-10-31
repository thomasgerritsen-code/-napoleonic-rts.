class_name DayNight
extends CanvasLayer
## The web game's day: ten minutes from 8 in the morning round the clock,
## warm light at sunrise and sunset, blue moonlight at night. Only the look
## changes; sight and fighting stay the same.
##
## The world is lit, not painted over: the light of the hour (and the grey of
## rain) multiplies the whole field, so lamps and muzzle flashes (Lights) can
## shine out of the dark; the screen's own layers (HUD, menus) stay as they are.

const CYCLE := 600.0
const START_HOUR := 8.0
const NIGHT_OPACITY := 0.34
const TWILIGHT_OPACITY := 0.18
## How much darker than the old painted-over night the lit night goes, so
## that its lights tell.
const NIGHT_DEPTH := 1.8
const RAIN_GREY := 0.14
const NAMES := {"morning": "Ochtend", "day": "Dag", "evening": "Avond", "night": "Nacht"}

var battle: Battle
var _light: CanvasModulate


func _ready() -> void:
	layer = 1
	_light = CanvasModulate.new()
	_light.name = "Daylight"
	get_parent().add_child.call_deferred(_light)


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


## How dark it is: 0 by day, 1 in the depth of the night.
static func darkness_at(seconds: float) -> float:
	var hour := hour_at(seconds)
	return 1.0 - _smooth(5.0, 8.0, hour) * (1.0 - _smooth(17.0, 20.0, hour))


## The light the field is multiplied by at this hour (and wetness): as the
## old tint laid over it, but deeper at night.
static func light_at(seconds: float, wetness := 0.0) -> Color:
	var tint := tint_at(seconds)
	var a := minf(0.85, tint.a * (1.0 + (NIGHT_DEPTH - 1.0) * darkness_at(seconds)))
	var c := Color(1.0 - a + tint.r * a, 1.0 - a + tint.g * a, 1.0 - a + tint.b * a)
	var grey := RAIN_GREY * clampf(wetness, 0.0, 1.0)
	var mean := (c.r + c.g + c.b) / 3.0
	return Color(lerpf(c.r, mean, grey * 1.5) * (1.0 - grey), lerpf(c.g, mean, grey * 1.5) * (1.0 - grey),
		lerpf(c.b, mean, grey * 1.5) * (1.0 - grey))


func _process(_delta: float) -> void:
	if battle != null and _light != null:
		_light.color = light_at(battle.clock, battle.weather.wetness if battle.weather != null else 0.0)
