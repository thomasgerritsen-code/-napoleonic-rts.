class_name Smoke3D
extends Node3D
## Powder smoke, flying earth and dust in the 3D battle, as Effects in 2D:
## each kind one MultiMesh of soft discs always turned to the camera; a shot
## writes only where its particles start, how fast they go and when, and a
## shader works out where each has drifted to (the same wind as in 2D, the
## smoke rising), how big it has grown and how thin it has worn.

const SMOKE_MAX := 3000
const EARTH_MAX := 900
const DUST_MAX := 1200

const SHADER := """shader_type spatial;
render_mode unshaded, blend_mix, depth_draw_never, cull_disabled, shadows_disabled;
// Each particle: INSTANCE_CUSTOM = (velocity x, velocity z, born, life);
// its size in the instance's scale, its tint in the instance colour.
uniform float now;
uniform vec3 gravity;          // m/s/s: the wind and the rise (or the fall)
uniform float rise = 0.0;      // m/s up at the start
uniform float damping = 2.0;
uniform float start_size = 0.35;
uniform float end_size = 1.0;
uniform float fade_in = 0.06;
uniform float wear_from = 0.3;
uniform vec3 light = vec3(1.0);
uniform sampler2D disc : filter_linear;
varying float strength;
varying vec4 tint;

void vertex() {
	vec4 c = INSTANCE_CUSTOM;
	float age = now - c.z;
	tint = COLOR;
	if (age < 0.0 || age > c.w) {
		POSITION = vec4(0.0, 0.0, 2.0, 1.0);
		strength = 0.0;
	} else {
		float k = age / c.w;
		float pushed = (1.0 - exp(-damping * age)) / damping;
		vec3 drift = vec3(c.x, rise, c.y) * pushed + 0.5 * gravity * age * age;
		vec3 origin = (MODEL_MATRIX * vec4(0.0, 0.0, 0.0, 1.0)).xyz + drift;
		float size = length(MODEL_MATRIX[0].xyz) * mix(start_size, end_size, sqrt(k));
		vec3 right = INV_VIEW_MATRIX[0].xyz;
		vec3 up = INV_VIEW_MATRIX[1].xyz;
		vec3 world = origin + (right * VERTEX.x + up * VERTEX.y) * size;
		POSITION = PROJECTION_MATRIX * VIEW_MATRIX * vec4(world, 1.0);
		strength = smoothstep(0.0, fade_in, k) * (1.0 - smoothstep(wear_from, 1.0, k));
	}
}

void fragment() {
	vec4 d = texture(disc, UV);
	ALBEDO = tint.rgb * light;
	ALPHA = d.a * tint.a * strength;
}
"""

var battle: Battle
var _now := 0.0
var _kinds := {}
static var _shader: Shader


func _ready() -> void:
	if _shader == null:
		_shader = Shader.new()
		_shader.code = SHADER
	_kinds["smoke"] = _kind(SMOKE_MAX, 1.6, {"damping": 2.2, "start_size": 0.4, "end_size": 2.6, "fade_in": 0.05, "wear_from": 0.3, "rise": 0.5})
	_kinds["earth"] = _kind(EARTH_MAX, 0.25, {"damping": 0.4, "start_size": 1.0, "end_size": 0.8, "fade_in": 0.02, "wear_from": 0.7,
		"gravity": Vector3(0, -9.0, 0), "rise": 4.2})
	_kinds["dust"] = _kind(DUST_MAX, 1.0, {"damping": 1.5, "start_size": 0.4, "end_size": 1.9, "fade_in": 0.1, "wear_from": 0.25, "rise": 0.2})


func _kind(count: int, size: float, params: Dictionary) -> Dictionary:
	var quad := QuadMesh.new()
	quad.size = Vector2(size, size)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_colors = true
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = count
	mm.custom_aabb = AABB(Vector3(-1000, -100, -1000), Vector3(3000, 400, 3000))
	for i in count:
		mm.set_instance_custom_data(i, Color(0, 0, -1.0e6, 0.001))
	var mat := ShaderMaterial.new()
	mat.shader = _shader
	mat.set_shader_parameter("disc", Effects._soft_texture(64, 0.9))
	for key: String in params:
		mat.set_shader_parameter(key, params[key])
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	return {"mesh": mm, "material": mat, "next": 0, "max": count}


func _process(delta: float) -> void:
	_now += delta
	var w := battle.effects.wind() if battle != null and battle.effects != null else Vector2(6, 3)
	# The 2D wind is in screen px/s²; on the ground it is metres, y halved.
	var ground := Vector3(w.x, 0.0, w.y * 2.0) / Iso.PPM
	var light := Color(1, 1, 1)
	if battle != null:
		light = DayNight.light_at(battle.clock, battle.weather.wetness if battle.weather != null else 0.0)
	for name_: String in _kinds:
		var mat: ShaderMaterial = _kinds[name_]["material"]
		mat.set_shader_parameter("now", _now)
		mat.set_shader_parameter("light", Vector3(light.r, light.g, light.b))
	(_kinds["smoke"]["material"] as ShaderMaterial).set_shader_parameter("gravity", ground + Vector3(0, 0.12, 0))
	(_kinds["dust"]["material"] as ShaderMaterial).set_shader_parameter("gravity", ground * 0.8)


## Powder smoke at a map point, `size` as in 2D (a musket 0.55, a cannon
## 1.3), blown out along `way` (a direction on the map) from the muzzle.
func smoke(world: Vector2, size: float, way := Vector2.ZERO) -> void:
	var at := View3D.at(world) + Vector3.UP * 1.35
	var n := clampi(roundi(2.0 + size * 5.0), 2, 12)
	var out := way.normalized() if way != Vector2.ZERO else Vector2.ZERO
	var push := 0.9 + size * 1.8
	for i in n:
		var spread := Vector3(randf_range(-0.15, 0.15), randf_range(-0.1, 0.1), randf_range(-0.15, 0.15)) * (1.0 + size * 3.0)
		var v := out * push * randf_range(0.3, 1.0) + Vector2(randf_range(-0.35, 0.35), randf_range(-0.35, 0.35))
		var shade := randf_range(0.84, 1.0)
		_emit("smoke", at + spread, v, Color(shade, shade, shade * 0.97, randf_range(0.5, 0.75)), size * randf_range(0.8, 1.3), randf_range(4.5, 7.5))


## Earth thrown up where a ball or shell strikes, with a little dust.
func earth(world: Vector2, size := 1.0) -> void:
	var at := View3D.at(world) + Vector3.UP * 0.1
	for i in roundi(12.0 * size):
		var v := Vector2(randf_range(-2.4, 2.4), randf_range(-2.4, 2.4)) * sqrt(size)
		var shade := randf_range(0.7, 1.0)
		var k: Dictionary = _kinds["earth"]
		_emit("earth", at, v, Color(0.36 * shade, 0.27 * shade, 0.17 * shade, 1.0), randf_range(0.6, 1.3), randf_range(0.6, 0.9))
		# Thrown up: the shader's rise is one for all, so each clod starts a little higher.
		var mm: MultiMesh = k["mesh"]
		var last := (int(k["next"]) - 1 + int(k["max"])) % int(k["max"])
		mm.set_instance_transform(last, Transform3D(Basis().scaled(Vector3.ONE * randf_range(0.6, 1.3)), at + Vector3.UP * randf_range(0.0, 0.4)))
	for i in 3:
		_emit("dust", at, Vector2(randf_range(-0.4, 0.4), randf_range(-0.4, 0.4)), Color(0.55, 0.46, 0.33, 0.6), size * randf_range(1.0, 1.6), randf_range(1.6, 2.6))
	smoke(world, 0.35 * size)


## A little dust at a horse's hooves.
func dust(world: Vector2, amount := 1.0) -> void:
	_emit("dust", View3D.at(world) + Vector3.UP * 0.2, Vector2(randf_range(-0.3, 0.3), randf_range(-0.3, 0.3)),
		Color(0.62, 0.53, 0.38, 0.45 * clampf(amount, 0.0, 1.0)), randf_range(0.7, 1.1), randf_range(1.5, 2.4))


func _emit(kind: String, at: Vector3, velocity: Vector2, colour: Color, size: float, life: float) -> void:
	var k: Dictionary = _kinds[kind]
	var i: int = k["next"]
	k["next"] = (i + 1) % int(k["max"])
	var mm: MultiMesh = k["mesh"]
	mm.set_instance_transform(i, Transform3D(Basis().scaled(Vector3.ONE * size), at))
	mm.set_instance_color(i, colour)
	mm.set_instance_custom_data(i, Color(velocity.x, velocity.y, _now, life))


## How many particles of a kind are still in the air: tests.
func alive(kind: String) -> int:
	var k: Dictionary = _kinds[kind]
	var mm: MultiMesh = k["mesh"]
	var n := 0
	for i in int(k["max"]):
		var c := mm.get_instance_custom_data(i)
		if _now - c.b <= c.a:
			n += 1
	return n
