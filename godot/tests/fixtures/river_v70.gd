extends RefCounted
## Frozen v70 visual reference, only for genuine same-camera before/after shots.

const WATER := """shader_type spatial;
render_mode cull_disabled;
uniform float now;
uniform float snow;
uniform float cloud;
uniform float fog_on = 1.0;
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m;
uniform vec2 bridge0; uniform vec2 bridge1; uniform vec2 bridge2; uniform vec2 bridge3; uniform vec2 bridge4;
varying vec3 world;
void vertex() { world = (MODEL_MATRIX * vec4(VERTEX,1.0)).xyz; }
void fragment() {
 float speed = mix(0.9,0.35,snow);
 float a = sin(world.z * 7.0 - now * speed * 3.0 + sin(world.x * 4.0));
 float b = sin(world.x * 10.0 + world.z * 3.0 - now * speed * 2.0);
 float edge = 1.0-smoothstep(0.0,0.16,min(UV.x,1.0-UV.x));
 float whirl = 0.0;
 vec2 points[5] = vec2[5](bridge0,bridge1,bridge2,bridge3,bridge4);
 for (int i=0;i<5;i++) {
  float r=distance(world.xz,points[i]);
  whirl += (1.0-smoothstep(0.3,3.5,r)) * (0.5+0.5*sin(r*10.0-now*2.5));
 }
 vec3 normal_world=normalize(vec3(a*0.08,1.0,b*0.06));
 NORMAL=normalize(mat3(VIEW_MATRIX)*normal_world);
 vec3 blue=mix(vec3(0.055,0.19,0.22),vec3(0.12,0.29,0.32),a*0.5+0.5);
 blue=mix(blue,vec3(0.45,0.59,0.62),edge*snow*0.85);
 blue+=vec3(0.1,0.12,0.12)*clamp(whirl*0.2+edge*0.16,0.0,0.25);
 float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0.0),vec2(1.0))).a*fog_on;
 ALBEDO=blue*(1.0-fog*0.9);
 ROUGHNESS=0.23+cloud*0.17+snow*0.15;
 SPECULAR=0.65;
}
"""
static func make(battle: Battle) -> MeshInstance3D:
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var points: PackedVector2Array = Nav._points
	var length := 0.0
	for i in points.size():
		if i > 0:
			length += points[i].distance_to(points[i - 1]) / Iso.PPM
		var direction := (points[mini(i + 1, points.size() - 1)] - points[maxi(i - 1, 0)]).normalized()
		var across := direction.orthogonal() * Nav._width * 0.47
		for side in 2:
			var world := points[i] + across * (-1.0 if side == 0 else 1.0)
			st.set_uv(Vector2(side, length))
			st.add_vertex(View3D.at(world) + Vector3.UP * 0.045)
	for i in points.size() - 1:
		var a := i * 2
		for index in [a, a + 2, a + 1, a + 1, a + 2, a + 3]:
			st.add_index(index)
	st.generate_normals()
	var node := MeshInstance3D.new()
	node.mesh = st.commit()
	var shader := Shader.new()
	shader.code = WATER
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("map_m", Iso.WORLD / Iso.PPM)
	mat.set_shader_parameter("fog_tex", battle.fog.get("_texture"))
	for i in 5:
		var p := Vector2(-10000, -10000)
		if i < Nav.bridges().size():
			p = Vector2(Nav.bridges()[i]["centre"]) / Iso.PPM
		mat.set_shader_parameter("bridge%d" % i, p)
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node



const GROUND_SHADER := """shader_type spatial;
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 tint : source_color = vec4(1.0);
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m = vec2(355.5, 222.2);
uniform float fog_on = 1.0;
uniform float wetness = 0.0;
uniform float snow = 0.0;
uniform float autumn = 0.0;
uniform float summer = 0.0;
uniform int surface_kind = 0; // 0 masonry, 1 ground, 2 deciduous, 3 conifer
uniform float build_progress = 1.0;
uniform float build_base = 0.0;
uniform float build_height = 1.0;
uniform float forge_on = 0.0;
uniform vec3 forge_origin = vec3(0.0);
uniform float forge_radius = 0.0;
uniform float night = 0.0;
uniform float window_light_on = 1.0;
varying vec3 wpos;
varying vec3 world_normal;
void vertex() {
	if (surface_kind == 2 || surface_kind == 3) {
		float sway = sin(TIME * 1.25 + VERTEX.y + MODEL_MATRIX[3].x) * 0.018;
		VERTEX.x += sway * max(0.0, VERTEX.y - 1.5);
	}
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
	world_normal = normalize(MODEL_NORMAL_MATRIX * NORMAL + vec3(0.0,0.00001,0.0));
}
float grain(vec2 p) { return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
void fragment() {
	if (build_progress < 0.9999 && wpos.y > build_base + max(0.18, build_height * build_progress)) { discard; }
	vec4 c = texture(albedo_tex, UV) * tint;
	float glass = step(c.r*1.6,c.g)*step(c.r*1.3,c.b)*step(c.b,c.g*1.6);
	glass *= (1.0-step(0.18,max(c.r,max(c.g,c.b))))*(1.0-step(0.35,abs(world_normal.y)));
	if (surface_kind != 0) { glass=0.0; }
	float leaf = step(c.r * 1.04, c.g) * step(c.b * 1.1, c.g);
	if (surface_kind == 2 || surface_kind == 3) {
		if (surface_kind == 2 && autumn > 0.001) {
			float variation = grain(floor(wpos.xz * 0.35));
			vec3 copper = mix(vec3(0.45,0.15,0.035), vec3(0.72,0.43,0.07), variation);
			float luminosity = dot(c.rgb,vec3(0.3,0.59,0.11));
			c.rgb = mix(c.rgb, copper * (0.6 + luminosity), autumn * leaf * 0.9);
		}
		if (surface_kind == 2 && snow > 0.5 && leaf > 0.5 && grain(floor(wpos.xz * 12.0 + wpos.y)) < smoothstep(0.5, 1.0, snow)) { discard; }
		if (summer > 0.001) { c.rgb = mix(c.rgb, c.rgb * vec3(0.9,1.03,0.86), summer * leaf * 0.55); }
	}
	if (surface_kind == 1) {
		c.rgb = mix(c.rgb, c.rgb * vec3(1.07,1.02,0.9), summer * 0.35);
		c.rgb = mix(c.rgb, c.rgb * vec3(1.14,0.93,0.73), autumn * leaf * 0.3);
	}
	float water = surface_kind == 1 ? step(c.r * 1.15,c.b) * step(c.g * 0.96,c.b) : 0.0;
	float settled = snow * smoothstep(0.25,0.8,world_normal.y) * (1.0 - water);
	float detail = dot(c.rgb,vec3(0.3,0.59,0.11));
	// Snow reflectance follows the calibrated daylight budget. Preserve
	// cool white snow and terrain detail without the old blown highlights.
	c.rgb = mix(c.rgb, vec3(0.72,0.80,0.88) * (0.8 + detail * 0.22), settled);
	c.rgb *= 1.0 - wetness * (surface_kind == 1 ? 0.17 : 0.08) * (1.0 - settled);
	float dark = texture(fog_tex, clamp(wpos.xz / map_m, vec2(0.0), vec2(1.0))).a * fog_on;
	ALBEDO = c.rgb * (1.0 - dark * 0.9);
	ROUGHNESS = mix(0.92, surface_kind == 1 ? 0.38 : 0.5, wetness * (1.0 - settled));
	float coal = (1.0-smoothstep(forge_radius*0.45,max(0.0001,forge_radius),distance(wpos,forge_origin))) * step(0.7,world_normal.y);
	EMISSION = vec3(0.8,0.19,0.025) * coal * forge_on * (1.0 - dark);
	EMISSION += vec3(0.65,0.28,0.07) * glass * night * window_light_on * (1.0-dark);
}
"""
