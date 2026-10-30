class_name Weather
extends CanvasLayer
## The web game's weather: clear spells and showers (the first after about
## a minute and three quarters). Rain soaks the ground over a minute and it
## dries over four; wet ground slows men (guns more) and damp powder makes a
## musket misfire now and then. The seasons turn every four minutes and
## colour the trees: spring, summer, autumn, winter.

const FIRST_RAIN := 105.0
const RAIN := Vector2(65, 100)
const DRY := Vector2(150, 240)
const SOAK := 60.0
const DRY_OUT := 240.0
const MUD_SLOW := 0.18
const MUD_SLOW_GUNS := 0.3
const MISFIRE := 0.3
const SEASON := 240.0
const SEASONS := [["Lente", Color(1, 1, 1)], ["Zomer", Color(0.9, 1.0, 0.86)],
	["Herfst", Color(1.18, 0.86, 0.58)], ["Winter", Color(0.86, 0.92, 1.05)]]

var battle: Battle
var raining := false
var wetness := 0.0

var _next := FIRST_RAIN
var _rain: CPUParticles2D
var _season := -1


func _ready() -> void:
	layer = 1
	_rain = CPUParticles2D.new()
	_rain.amount = 700
	_rain.lifetime = 0.7
	_rain.emitting = false
	_rain.emission_shape = CPUParticles2D.EMISSION_SHAPE_RECTANGLE
	_rain.direction = Vector2(-0.25, 1.0)
	_rain.spread = 3.0
	_rain.gravity = Vector2(-120, 900)
	_rain.initial_velocity_min = 700.0
	_rain.initial_velocity_max = 900.0
	_rain.scale_amount_min = 1.0
	_rain.scale_amount_max = 1.6
	_rain.color = Color(0.78, 0.84, 0.95, 0.45)
	var streak := GradientTexture2D.new()
	streak.width = 2
	streak.height = 14
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 0))
	gradient.set_color(1, Color(1, 1, 1, 1))
	streak.gradient = gradient
	streak.fill_to = Vector2(0, 1)
	_rain.texture = streak
	add_child(_rain)


func label() -> String:
	var season: String = SEASONS[_season_index()][0]
	if raining:
		return "%s · regen" % season
	return season + (" · nat" if wetness > 0.3 else "")


## How much slower a man of this type moves on today's ground.
func pace(type: String) -> float:
	return 1.0 - (MUD_SLOW_GUNS if type == "artillery" else MUD_SLOW) * wetness


func misfires() -> bool:
	return raining and randf() < MISFIRE * wetness


func _season_index() -> int:
	return int(battle.clock / SEASON) % 4 if battle != null else 0


func _process(delta: float) -> void:
	if battle == null:
		return
	var view := get_viewport().get_visible_rect().size
	_rain.position = Vector2(view.x / 2.0 + 80.0, -20.0)
	_rain.emission_rect_extents = Vector2(view.x / 2.0 + 160.0, 10.0)
	_rain.emitting = raining
	update(delta)


func update(delta: float) -> void:
	# Online, the client takes rain and wetness from the host's snapshots.
	var client := battle != null and battle.net_role == "client"
	_next -= 0.0 if client else delta
	if _next <= 0.0:
		raining = not raining
		_next = randf_range(RAIN.x, RAIN.y) if raining else randf_range(DRY.x, DRY.y)
		if battle != null and raining:
			battle.say("Het begint te regenen: modder vertraagt de mannen en natte lopen ketsen.")
	if not client:
		wetness = clampf(wetness + (delta / SOAK if raining else -delta / DRY_OUT), 0.0, 1.0)
	var season := _season_index()
	if season != _season and battle != null:
		_season = season
		battle.tint_trees(SEASONS[season][1])
