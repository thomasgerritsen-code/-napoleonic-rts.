class_name Atmosphere3D
extends Node3D
## Four bounded GPU batches: river surface, rain, snow and foot/hoof prints.
## All weather is read from the existing battle; no simulation state or RNG
## is changed. Model/terrain fog stays authoritative for what may be seen.

const RAIN_MAX := 1536
const SNOW_MAX := 768
const PRINT_MAX := 2048
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
const PRECIPITATION := """shader_type spatial;
render_mode unshaded,blend_mix,depth_draw_never,cull_disabled,shadows_disabled;
uniform float now; uniform float opacity; uniform float flake;
uniform vec3 centre; uniform float span=80.0;
uniform sampler2D relief : filter_linear;
uniform vec2 relief_origin; uniform vec2 relief_size; uniform float relief_cell;
uniform sampler2D fog_tex : filter_linear; uniform vec2 map_m; uniform float fog_on=1.0;
uniform vec3 light=vec3(1.0);
varying vec3 world; varying float strength;
void vertex() {
 vec4 s=INSTANCE_CUSTOM;
 float speed=mix(22.0,1.9,flake);
 vec2 p=s.xy*span+vec2(now*mix(0.8,0.25,flake),now*0.12);
 p+=floor((centre.xz-p)/span+vec2(0.5))*span;
 vec2 uv=((p-relief_origin)/relief_cell+vec2(0.5))/relief_size;
 float ground=texture(relief,clamp(uv,vec2(0.0),vec2(1.0))).r;
 float h=fract(s.z-now*speed/22.0)*22.0;
 vec3 origin=vec3(p.x,ground+h,p.y);
 origin.x+=sin(now+s.w*20.0+h)*0.18*flake;
 vec3 right=INV_VIEW_MATRIX[0].xyz;
 vec3 up=mix(vec3(-0.12,1.0,0.0),INV_VIEW_MATRIX[1].xyz,flake);
 vec2 size=mix(vec2(0.035,0.7),vec2(0.08+s.w*0.05),flake);
 world=origin+right*VERTEX.x*size.x+up*VERTEX.y*size.y;
 POSITION=PROJECTION_MATRIX*VIEW_MATRIX*vec4(world,1.0);
 strength=smoothstep(0.0,0.35,h);
}
void fragment() {
 float drop=smoothstep(0.0,0.15,UV.x)*(1.0-smoothstep(0.85,1.0,UV.x));
 drop*=smoothstep(0.0,0.2,UV.y)*(1.0-smoothstep(0.8,1.0,UV.y));
 float circle=1.0-smoothstep(0.2,0.5,length(UV-vec2(0.5)));
 float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0.0),vec2(1.0))).a*fog_on;
 ALBEDO=mix(vec3(0.66,0.75,0.84),vec3(0.9,0.93,0.98),flake)*light;
 ALPHA=mix(drop,circle,flake)*opacity*strength*(1.0-fog*0.85)*mix(0.45,0.85,flake);
}
"""
const PRINTS := """shader_type spatial;
render_mode unshaded,blend_mix,depth_draw_never,cull_disabled,shadows_disabled;
uniform float now; uniform float snow; uniform float wetness;
uniform sampler2D fog_tex : filter_linear; uniform vec2 map_m; uniform float fog_on=1.0;
varying vec4 data; varying vec3 world;
void vertex() { data=INSTANCE_CUSTOM; world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz; }
float oval(vec2 p,vec2 c,vec2 size) { return 1.0-smoothstep(0.7,1.0,length((p-c)/size)); }
void fragment() {
 float age=now-data.x;
 if(age<0.0 || age>data.y) { discard; }
 float foot=oval(UV,vec2(0.34,0.35),vec2(0.09,0.17))+oval(UV,vec2(0.66,0.7),vec2(0.09,0.17));
 float hoof=oval(UV,vec2(0.25,0.3),vec2(0.1,0.13))+oval(UV,vec2(0.75,0.3),vec2(0.1,0.13));
 hoof+=oval(UV,vec2(0.3,0.75),vec2(0.1,0.13))+oval(UV,vec2(0.7,0.75),vec2(0.1,0.13));
 float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0.0),vec2(1.0))).a*fog_on;
 ALBEDO=mix(vec3(0.18,0.13,0.085),vec3(0.36,0.45,0.53),snow);
 ALPHA=clamp(mix(foot,hoof,data.z),0.0,1.0)*(1.0-smoothstep(0.55,1.0,age/data.y))*(1.0-fog)*max(snow,wetness)*0.6;
}
"""

var battle: Battle
var view: View3D
var climate := {}
var water: MeshInstance3D
var rain: MultiMeshInstance3D
var snowfall: MultiMeshInstance3D
var prints: MultiMeshInstance3D
var _relief: ImageTexture
var _now := 0.0
var _clock := 0.0
var _rain_alpha := 0.0
var _snow_alpha := 0.0
var _print_next := 0
var _printed := 0
var _last_print := {}
var cloud := 0.0


func _ready() -> void:
	_now = battle.clock
	var image := Image.create_from_data(Iso._cols, Iso._rows, false, Image.FORMAT_RF, Iso._heights.to_byte_array())
	_relief = ImageTexture.create_from_image(image)
	water = _river()
	add_child(water)
	rain = _precipitation(RAIN_MAX, 0.0)
	snowfall = _precipitation(SNOW_MAX, 1.0)
	prints = _prints()
	refresh()


func _shader(code: String) -> ShaderMaterial:
	var shader := Shader.new()
	shader.code = code
	var mat := ShaderMaterial.new()
	mat.shader = shader
	mat.set_shader_parameter("map_m", Iso.WORLD / Iso.PPM)
	mat.set_shader_parameter("fog_tex", battle.fog.get("_texture"))
	return mat


func _river() -> MeshInstance3D:
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
	var mat := _shader(WATER)
	for i in 5:
		var p := Vector2(-10000, -10000)
		if i < Nav.bridges().size():
			p = Vector2(Nav.bridges()[i]["centre"]) / Iso.PPM
		mat.set_shader_parameter("bridge%d" % i, p)
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	return node


func _batch(count: int, mat: ShaderMaterial, horizontal := false) -> MultiMeshInstance3D:
	var quad := QuadMesh.new()
	if horizontal:
		quad.orientation = PlaneMesh.FACE_Y
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = quad
	mm.instance_count = count
	mm.custom_aabb = AABB(Vector3(-600, -50, -600), Vector3(1600, 300, 1600))
	var node := MultiMeshInstance3D.new()
	node.multimesh = mm
	node.material_override = mat
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	return node


func _precipitation(count: int, flake: float) -> MultiMeshInstance3D:
	var mat := _shader(PRECIPITATION)
	mat.set_shader_parameter("relief", _relief)
	mat.set_shader_parameter("relief_origin", Vector2(Iso._x0, Iso._y0))
	mat.set_shader_parameter("relief_size", Vector2(Iso._cols, Iso._rows))
	mat.set_shader_parameter("relief_cell", Iso._cell)
	mat.set_shader_parameter("flake", flake)
	mat.set_shader_parameter("opacity", 0.0)
	var node := _batch(count, mat)
	for i in count:
		node.multimesh.set_instance_custom_data(i, Color(Battle.hash01(i, 61), Battle.hash01(i, 62), Battle.hash01(i, 63), Battle.hash01(i, 64)))
	return node


func _prints() -> MultiMeshInstance3D:
	var node := _batch(PRINT_MAX, _shader(PRINTS), true)
	for i in PRINT_MAX:
		node.multimesh.set_instance_custom_data(i, Color(-1.0e6, 1.0, 0, 0))
	return node


func refresh() -> void:
	climate = WorldClimate3D.sample(battle.clock, battle.weather.raining, battle.weather.wetness)
	for node: GeometryInstance3D in [water, rain, snowfall, prints]:
		var mat := node.material_override as ShaderMaterial
		mat.set_shader_parameter("fog_on", 1.0 if battle.fog.enabled else 0.0)
	(water.material_override as ShaderMaterial).set_shader_parameter("snow", climate["snow"])
	(water.material_override as ShaderMaterial).set_shader_parameter("cloud", climate["cloud"])
	(prints.material_override as ShaderMaterial).set_shader_parameter("snow", climate["snow"])
	(prints.material_override as ShaderMaterial).set_shader_parameter("wetness", climate["wetness"])
	for key: Variant in _last_print.keys():
		var unit: Unit = _last_print[key]["unit"].get_ref()
		if not is_instance_valid(unit) or not unit.alive():
			_last_print.erase(key)


func _process(delta: float) -> void:
	_now += delta
	_clock -= delta
	if _clock <= 0.0:
		_clock = 0.1
		refresh()
	cloud = lerpf(cloud, float(climate.get("cloud", 0.0)), 1.0 - exp(-delta / 0.8))
	_rain_alpha = move_toward(_rain_alpha, float(climate.get("rain", 0.0)), delta * 0.8)
	_snow_alpha = move_toward(_snow_alpha, float(climate.get("snowfall", 0.0)), delta * 0.8)
	for entry: Array in [[rain, _rain_alpha], [snowfall, _snow_alpha]]:
		var node := entry[0] as MultiMeshInstance3D
		node.visible = float(entry[1]) > 0.001
		var mat := node.material_override as ShaderMaterial
		mat.set_shader_parameter("opacity", entry[1])
		mat.set_shader_parameter("centre", view.get("_target"))
		mat.set_shader_parameter("span", clampf(float(view.get("_distance")) * 2.0, 35.0, 240.0))
		var light: Color = climate.get("sun_color", Color.WHITE)
		light = light * lerpf(1.0, 0.45, float(climate.get("dark", 0.0)))
		mat.set_shader_parameter("light", Vector3(light.r, light.g, light.b))
	for node: GeometryInstance3D in [water, rain, snowfall, prints]:
		(node.material_override as ShaderMaterial).set_shader_parameter("now", _now)
	prints.visible = _printed > 0 and maxf(float(climate.get("wetness", 0.0)), float(climate.get("snow", 0.0))) > 0.05


func track(u: Unit) -> void:
	if climate.is_empty() or maxf(float(climate["wetness"]), float(climate["snow"])) < 0.2 or not u.visible:
		return
	if not _last_print.has(u.id):
		_last_print[u.id] = {"unit": weakref(u), "at": u.world}
		return
	var last: Vector2 = _last_print[u.id]["at"]
	var gap := 26.0 if u._horse() else 15.0
	if u.world.distance_squared_to(last) < gap * gap:
		return
	_last_print[u.id]["at"] = u.world
	if u.world.distance_squared_to(last) > 100.0 * 100.0 or Nav.on_bridge(u.world) or not u.alive():
		return
	var size := Vector3(0.9, 1.0, 1.25) if u._horse() else Vector3(0.55, 1.0, 0.8)
	var basis := Basis(Vector3.UP, View3D.turn(u.facing)).scaled(size)
	prints.multimesh.set_instance_transform(_print_next, Transform3D(basis, View3D.at(u.world) + Vector3.UP * 0.035))
	prints.multimesh.set_instance_custom_data(_print_next, Color(_now, 150.0, 1.0 if u._horse() else 0.0, 0.0))
	_print_next = (_print_next + 1) % PRINT_MAX
	_printed += 1


func stats() -> Dictionary:
	return {"rain_slots": RAIN_MAX, "snow_slots": SNOW_MAX, "print_slots": PRINT_MAX,
		"prints_emitted": _printed, "tracked": _last_print.size(), "batches": 4}
