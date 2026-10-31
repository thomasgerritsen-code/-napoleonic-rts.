class_name Fancy
extends Node2D
## Proof of a richer 2D look (Battle.fancy, from the menu): the same field
## and sprites, but
## - a sun that goes round with the hour and lights the buildings and trees
##   from its side, by normal maps rendered in Blender beside each picture
##   (render-iso-props.py --normals);
## - the river moving: ripples drifting downstream and glints of light;
## - trees, bushes and ferns swaying in the wind (the smoke's wind);
## - the shadows of clouds drifting over the field.

const WATER_SHADER := """shader_type canvas_item;
// The river: COLOR.a fades to the banks; UV.x runs along it (px), UV.y across.
uniform float time_scale = 1.0;
varying vec2 at;
void vertex() { at = UV; }
float wave(vec2 p, float t) {
	return sin(p.x * 0.09 - t * 1.7 + sin(p.y * 0.21 + t) * 1.3) * 0.5
		+ sin(p.x * 0.031 + p.y * 0.17 - t * 0.9) * 0.5;
}
void fragment() {
	float t = TIME * time_scale;
	float w = wave(at, t);
	// Glints: small round sparkles where two slow wave trains crest together.
	float glint = smoothstep(0.82, 0.97, sin(at.x * 0.11 - t * 1.4 + at.y * 0.35) * sin(at.y * 0.42 + at.x * 0.05 + t * 0.9));
	vec3 deep = vec3(0.16, 0.3, 0.38);
	vec3 light = vec3(0.55, 0.68, 0.72);
	vec3 c = mix(deep, light, 0.5 + 0.5 * w);
	c += vec3(0.9, 0.92, 0.85) * glint * 0.35;
	COLOR = vec4(c, COLOR.a * (0.26 + 0.1 * w + glint * 0.3));
}
"""

const WIND_SHADER := """shader_type canvas_item;
// Sway: the top of the picture moves most, the foot not at all.
uniform vec2 wind = vec2(1.0, 0.0);
uniform float strength = 1.0;
void vertex() {
	float seed = MODEL_MATRIX[3].x * 0.013 + MODEL_MATRIX[3].y * 0.021;
	float top = 1.0 - UV.y;
	float sway = sin(TIME * 1.6 + seed) * 0.6 + sin(TIME * 2.9 + seed * 1.7) * 0.25;
	VERTEX.x += (wind.x * 0.6 + sway) * top * top * 9.0 * strength;
}
"""

const CLOUD_SHADER := """shader_type canvas_item;
render_mode blend_mul, unshaded;
uniform sampler2D noise : repeat_enable, filter_linear;
uniform vec2 drift = vec2(0.0);
uniform float depth = 0.22;
void fragment() {
	vec2 p = UV * vec2(6.0, 2.2) + drift;
	float n = texture(noise, p).r * 0.65 + texture(noise, p * 2.3 + vec2(0.37, 0.71)).r * 0.35;
	float cloud = smoothstep(0.5, 0.72, n);
	COLOR = vec4(vec3(1.0 - depth * cloud), 1.0);
}
"""

## Pictures that sway, by name.
const SWAYING := ["oak", "birch", "beech", "pine", "spruce", "poplar", "willow", "hawthorn", "hazel", "bush", "fern"]

var battle: Battle
var sun: DirectionalLight2D
var _wind_material: ShaderMaterial
var _cloud_material: ShaderMaterial
var _normals := {}           # texture path -> CanvasTexture or null
var _scan_clock := 0.0
var _drift := Vector2.ZERO
## Sprites given their normal maps and sway: tests.
var lit := 0
var swaying := 0


func _ready() -> void:
	z_index = -9                 # just over the ground: the water
	_wind_material = ShaderMaterial.new()
	var wind := Shader.new()
	wind.code = WIND_SHADER
	_wind_material.shader = wind
	sun = DirectionalLight2D.new()
	sun.color = Color(1.0, 0.94, 0.82)
	sun.height = 0.55
	sun.blend_mode = Light2D.BLEND_MODE_ADD
	battle.add_child(sun)
	_add_water()
	_add_clouds()
	_scan()


## The river as a strip along its course, fading to its banks.
func _add_water() -> void:
	var points: PackedVector2Array = Nav._points
	if points.size() < 2:
		return
	var water := Node2D.new()
	var mat := ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = WATER_SHADER
	mat.shader = shader
	water.material = mat
	add_child(water)
	var half: float = Nav._width / 2.0
	water.draw.connect(func() -> void:
		var along := 0.0
		for i in range(1, points.size()):
			var a := points[i - 1]
			var b := points[i]
			var across := (b - a).normalized().orthogonal() * half
			var length := a.distance_to(b)
			for side: float in [-1.0, 1.0]:
				var quad := PackedVector2Array([Iso.to_screen(a), Iso.to_screen(b), Iso.to_screen(b + across * side), Iso.to_screen(a + across * side)])
				var cols := PackedColorArray([Color(1, 1, 1, 1), Color(1, 1, 1, 1), Color(1, 1, 1, 0), Color(1, 1, 1, 0)])
				var uvs := PackedVector2Array([Vector2(along, 0), Vector2(along + length, 0), Vector2(along + length, half * side), Vector2(along, half * side)])
				water.draw_polygon(quad, cols, uvs)
			along += length)
	water.queue_redraw()


## Cloud shadows: a sheet over the whole field, multiplying it darker where a
## cloud passes; its own layer, so the light of the hour does not dim it twice.
func _add_clouds() -> void:
	var layer := CanvasLayer.new()
	layer.layer = 1
	layer.follow_viewport_enabled = true
	battle.add_child(layer)
	var noise := FastNoiseLite.new()
	noise.frequency = 0.012
	noise.fractal_octaves = 4
	var tex := NoiseTexture2D.new()
	tex.noise = noise
	tex.seamless = true
	tex.width = 256
	tex.height = 256
	_cloud_material = ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = CLOUD_SHADER
	_cloud_material.shader = shader
	_cloud_material.set_shader_parameter("noise", tex)
	var sheet := ColorRect.new()
	sheet.mouse_filter = Control.MOUSE_FILTER_IGNORE
	sheet.position = Vector2(0, -300)
	sheet.size = Vector2(Iso.WORLD.x, Iso.WORLD.y * Iso.SQ + 600)
	sheet.material = _cloud_material
	layer.add_child(sheet)


## The normal map beside a picture (name_n.webp), if there is one.
func _lit_texture(tex: Texture2D) -> Texture2D:
	if tex == null or tex is CanvasTexture:
		return tex
	var path := tex.resource_path
	if not _normals.has(path):
		var normal_path := path.get_basename() + "_n.webp"
		if path.begins_with("res://assets/props/") and ResourceLoader.exists(normal_path):
			var lit_tex := CanvasTexture.new()
			lit_tex.diffuse_texture = tex
			lit_tex.normal_texture = load(normal_path)
			_normals[path] = lit_tex
		else:
			_normals[path] = null
	return _normals[path] if _normals[path] != null else tex


## Every picture of a building or a tree: its normal map, and the trees sway.
func _scan() -> void:
	for node in battle.find_children("*", "Sprite2D", true, false):
		var sprite := node as Sprite2D
		if sprite.has_meta("fancy"):
			continue
		sprite.set_meta("fancy", true)
		var tex := sprite.texture
		if tex == null:
			continue
		var name_ := tex.resource_path.get_file().get_basename()
		var lit_tex := _lit_texture(tex)
		if lit_tex != tex:
			sprite.texture = lit_tex
			lit += 1
		if name_ in SWAYING and sprite.material == null:
			sprite.material = _wind_material
			swaying += 1


func _process(delta: float) -> void:
	if battle == null:
		return
	# The sun from the east in the morning, the south at noon, the west at
	# evening; as bright as the day is.
	var hour := DayNight.hour_at(battle.clock)
	var day := 1.0 - DayNight.darkness_at(battle.clock)
	sun.rotation = deg_to_rad(90.0 + clampf((hour - 6.0) / 12.0, 0.0, 1.0) * 180.0)
	sun.energy = 0.42 * day
	sun.height = 0.35 + 0.35 * sin(clampf((hour - 6.0) / 12.0, 0.0, 1.0) * PI)
	var w := battle.effects.wind() if battle.effects != null else Vector2(6, 0)
	_wind_material.set_shader_parameter("wind", w / 10.0)
	_wind_material.set_shader_parameter("strength", 0.6 + w.length() / 14.0)
	_drift += w * delta * 0.00012
	_cloud_material.set_shader_parameter("drift", -_drift)
	_cloud_material.set_shader_parameter("depth", 0.24 * day * (0.6 if battle.weather != null and battle.weather.raining else 1.0))
	_scan_clock -= delta
	if _scan_clock <= 0.0:
		_scan_clock = 2.0
		_scan()
