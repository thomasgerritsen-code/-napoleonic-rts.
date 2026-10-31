class_name Effects
extends Node2D
## Powder smoke, flying earth and dust, worked out on the graphics card: a
## musket volley leaves a bank of smoke that hangs over the line and drifts
## off with the wind, a round shot throws up earth where it strikes, horses at
## the trot or gallop raise dust (less on wet ground).
##
## Each kind is one MultiMesh of soft discs drawn in a single batch. A shot
## writes only where its few particles start, how fast they go and when; a
## shader on the graphics card works out every frame where each one has
## drifted to (wind, rise, damping, gravity), how big it has grown and how
## thin it has worn. So the processor does nothing per particle per frame,
## and thousands cost next to nothing. The wind veers slowly with the
## battle's clock, the same on both ends of an online battle.

const SMOKE_MAX := 3000
const EARTH_MAX := 900
const DUST_MAX := 1200

const SHADER := """shader_type canvas_item;
// Each particle: INSTANCE_CUSTOM = (velocity x, velocity y, born, life);
// its size in the instance transform, its tint in the instance colour.
uniform float now;
uniform vec2 gravity;          // px/s/s: the wind and the rise (or the fall)
uniform float damping = 2.0;   // 1/s: the push from the muzzle dies away
uniform float start_size = 0.35;
uniform float end_size = 1.0;
uniform float fade_in = 0.06;  // share of the life it takes to come up
uniform float wear_from = 0.3; // share of the life after which it thins
varying float strength;

void vertex() {
	vec4 c = INSTANCE_CUSTOM;
	float age = now - c.z;
	if (age < 0.0 || age > c.w) {
		VERTEX = vec2(0.0);
		strength = 0.0;
	} else {
		float k = age / c.w;
		float pushed = (1.0 - exp(-damping * age)) / damping;
		vec2 drift = c.xy * pushed + 0.5 * gravity * age * age;
		float size = max(length(MODEL_MATRIX[0].xy), 0.001);
		VERTEX = VERTEX * mix(start_size, end_size, sqrt(k)) + drift / size;
		strength = smoothstep(0.0, fade_in, k) * (1.0 - smoothstep(wear_from, 1.0, k));
	}
}

void fragment() {
	COLOR = texture(TEXTURE, UV) * COLOR;
	COLOR.a *= strength;
}
"""

var battle: Battle
## Shots and strikes that made smoke or earth: tests and the debug line.
var emitted := 0
var _now := 0.0
var _kinds := {}            # name -> {mesh, material, next, max}
static var _shader: Shader


func _ready() -> void:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SHADER
	_kinds["smoke"] = _kind(SMOKE_MAX, _soft_texture(64, 0.9), 40.0,
		{"damping": 2.2, "start_size": 0.35, "end_size": 2.2, "fade_in": 0.05, "wear_from": 0.3})
	_kinds["earth"] = _kind(EARTH_MAX, _soft_texture(16, 1.0), 5.0,
		{"damping": 0.6, "start_size": 1.0, "end_size": 0.8, "fade_in": 0.02, "wear_from": 0.7, "gravity": Vector2(0, 420)})
	_kinds["dust"] = _kind(DUST_MAX, _soft_texture(64, 0.8), 22.0,
		{"damping": 1.5, "start_size": 0.4, "end_size": 1.8, "fade_in": 0.1, "wear_from": 0.25})


func _kind(count: int, tex: Texture2D, size: float, params: Dictionary) -> Dictionary:
	var quad := QuadMesh.new()
	quad.size = Vector2(size, -size)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_2D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = count
	mm.custom_aabb = AABB(Vector3(-1.0e5, -1.0e5, -1.0), Vector3(2.0e5, 2.0e5, 2.0))
	for i in count:
		mm.set_instance_transform_2d(i, Transform2D())
		mm.set_instance_color(i, Color(1, 1, 1, 0))
		mm.set_instance_custom_data(i, Color(0, 0, -1.0e6, 0.001))
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	for key: String in params:
		mat.set_shader_parameter(key, params[key])
	var node := MultiMeshInstance2D.new()
	node.multimesh = mm
	node.texture = tex
	node.material = mat
	add_child(node)
	return {"mesh": mm, "material": mat, "next": 0, "max": count}


static func _soft_texture(size: int, core: float) -> Texture2D:
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, core))
	gradient.set_color(1, Color(1, 1, 1, 0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = size
	texture.height = size
	return texture


## The wind on the screen (px/s²): it veers slowly with the battle's clock.
func wind() -> Vector2:
	var t := battle.clock if battle != null else 0.0
	var angle := 0.6 + sin(t * 0.004) * 1.4 + sin(t * 0.0013 + 1.0) * 0.8
	var strength := 7.0 + 4.0 * sin(t * 0.007 + 2.0)
	return Vector2.from_angle(angle) * strength * Vector2(1.0, 0.5)


func _process(delta: float) -> void:
	_now += delta
	var w := wind()
	for name_: String in _kinds:
		(_kinds[name_]["material"] as ShaderMaterial).set_shader_parameter("now", _now)
	# Smoke rises a little and goes with the wind; dust hangs lower.
	(_kinds["smoke"]["material"] as ShaderMaterial).set_shader_parameter("gravity", Vector2(w.x, w.y - 4.0))
	(_kinds["dust"]["material"] as ShaderMaterial).set_shader_parameter("gravity", Vector2(w.x * 0.8, w.y * 0.8 - 1.5))


## How many particles of a kind are still in the air.
func alive(kind: String) -> int:
	var k: Dictionary = _kinds[kind]
	var mm: MultiMesh = k["mesh"]
	var n := 0
	for i in int(k["max"]):
		var c := mm.get_instance_custom_data(i)
		if _now - c.b <= c.a:
			n += 1
	return n


## Powder smoke at screen point `at`: `size` as the old puffs (a musket 0.55,
## a cannon 1.3), blown out along `way` (on the screen) from the muzzle.
func smoke(at: Vector2, size: float, way := Vector2.ZERO) -> void:
	emitted += 1
	var n := clampi(roundi(2.0 + size * 5.0), 2, 12)
	var push := 20.0 + size * 40.0
	var out := way.normalized() if way != Vector2.ZERO else Vector2.ZERO
	for i in n:
		var spread := Vector2(randf_range(-3.0, 3.0), randf_range(-2.0, 2.0)) * (1.0 + size * 3.0)
		var v := out * push * randf_range(0.3, 1.0) + Vector2(randf_range(-8.0, 8.0), randf_range(-10.0, 2.0))
		var shade := randf_range(0.84, 1.0)
		_emit("smoke", at + spread, v, Color(shade, shade, shade * 0.97, randf_range(0.55, 0.8)),
			size * randf_range(0.8, 1.3), randf_range(4.5, 7.5))


## Earth thrown up where a ball or shell strikes (screen point), with a
## little smoke and dust.
func earth(at: Vector2, size := 1.0) -> void:
	emitted += 1
	for i in roundi(12.0 * size):
		var v := Vector2(randf_range(-55.0, 55.0), randf_range(-170.0, -70.0)) * sqrt(size)
		var shade := randf_range(0.7, 1.0)
		_emit("earth", at + Vector2(randf_range(-4.0, 4.0), randf_range(-2.0, 2.0)), v,
			Color(0.36 * shade, 0.27 * shade, 0.17 * shade, 1.0), randf_range(0.6, 1.3), randf_range(0.6, 0.9))
	for i in 3:
		_emit("dust", at + Vector2(randf_range(-6.0, 6.0), randf_range(-3.0, 1.0)), Vector2(randf_range(-10.0, 10.0), randf_range(-14.0, -4.0)),
			Color(0.55, 0.46, 0.33, 0.6), size * randf_range(1.0, 1.6), randf_range(1.6, 2.6))


## A little dust kicked up at a horse's hooves (screen point).
func dust(at: Vector2, amount := 1.0) -> void:
	_emit("dust", at + Vector2(randf_range(-5.0, 5.0), randf_range(-2.0, 2.0)), Vector2(randf_range(-6.0, 6.0), randf_range(-8.0, -2.0)),
		Color(0.62, 0.53, 0.38, 0.45 * clampf(amount, 0.0, 1.0)), randf_range(0.7, 1.1), randf_range(1.5, 2.4))


## One particle into the kind's ring: where, how fast, its tint, its size and
## how long it lasts. The oldest one makes way when the ring is full.
func _emit(kind: String, at: Vector2, velocity: Vector2, colour: Color, size: float, life: float) -> void:
	var k: Dictionary = _kinds[kind]
	var i: int = k["next"]
	k["next"] = (i + 1) % int(k["max"])
	var mm: MultiMesh = k["mesh"]
	mm.set_instance_transform_2d(i, Transform2D(0.0, Vector2.ONE * size, 0.0, at))
	mm.set_instance_color(i, colour)
	mm.set_instance_custom_data(i, Color(velocity.x, velocity.y, _now, life))
