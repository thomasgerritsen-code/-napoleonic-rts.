class_name Field3D
extends Node3D
## What lies on the field in the 3D battle besides the men and buildings, as
## the 2D field shows it:
## - the trenches: the cut (dark, the men in it sunk to the bed by View3D),
##   the bank of thrown-up earth on the enemy side, its ditch, and at level 3
##   the gabions along it; craters where round shot struck;
## - the fog of war: a shader that darkens the ground, woods and houses never
##   seen and dims those seen before, from the 2D fog's own grid;
## - the three territories: a ring in their holder's colour, the claim
##   growing round it, the name over it;
## - the outline of a building being placed (green where it may stand), and
##   the rally point of a selected barracks.

const FOG_SHADER := """shader_type spatial;
""" + RoadSurface3D.UNIFORMS + """
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
uniform float bank_on = 0.0;
uniform sampler2D bank_profile : filter_linear, repeat_disable;
uniform vec2 bank_lookup;
uniform float bank_rim;
uniform vec4 bank_grass_rect;
uniform vec4 bank_bridge0; uniform vec4 bank_bridge1; uniform vec4 bank_bridge2; uniform vec4 bank_bridge3; uniform vec4 bank_bridge4;
uniform vec4 bank_bridge_widths; uniform float bank_bridge_width4;
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
float silt_grain(vec2 p) {
	vec2 cell=floor(p), f=fract(p);
	f=f*f*(3.0-2.0*f);
	return mix(mix(grain(cell),grain(cell+vec2(1,0)),f.x),mix(grain(cell+vec2(0,1)),grain(cell+vec2(1,1)),f.x),f.y);
}
vec3 bank_grass(vec2 world) {
	vec2 p=world*0.16;
	vec2 weights=sin(fract(p)*3.14159265); weights*=weights;
	// Crossfade half-tile offsets so patch edges never form visible seams.
	vec3 a=texture(albedo_tex,bank_grass_rect.xy+fract(p)*bank_grass_rect.zw).rgb;
	vec3 b=texture(albedo_tex,bank_grass_rect.xy+fract(p+vec2(0.5,0))*bank_grass_rect.zw).rgb;
	vec3 c=texture(albedo_tex,bank_grass_rect.xy+fract(p+vec2(0,0.5))*bank_grass_rect.zw).rgb;
	vec3 d=texture(albedo_tex,bank_grass_rect.xy+fract(p+vec2(0.5))*bank_grass_rect.zw).rgb;
	return mix(mix(d,c,weights.x),mix(b,a,weights.x),weights.y)*tint.rgb;
}
void fragment() {
	if (build_progress < 0.9999 && wpos.y > build_base + max(0.18, build_height * build_progress)) { discard; }
	vec4 c = texture(albedo_tex, UV) * tint;
	float river_water = 0.0;
	float bank_wet = 0.0;
	if (surface_kind == 1 && bank_on > 0.5) {
		vec4 profile=texture(bank_profile,vec2(clamp(wpos.z/map_m.y,0.0,1.0)*bank_lookup.x+bank_lookup.y,0.5));
		float dx=wpos.x-profile.x;
		float width=dx<0.0 ? profile.z : profile.w;
		float edge=abs(dx)-width;
		river_water=1.0-step(0.0,edge);
		float irregular=(silt_grain(wpos.xz*1.3)-0.5)*0.3;
		float blend=1.0-smoothstep(2.2,4.5,edge+irregular);
		if (blend>0.001) {
			vec3 grass=bank_grass(wpos.xz);
			vec3 silt=mix(vec3(0.17,0.15,0.095),vec3(0.26,0.235,0.145),silt_grain(wpos.xz*1.8));
			vec3 bank=mix(silt,grass,smoothstep(0.02,0.65,edge+irregular));
			vec4 bridges[5]=vec4[5](bank_bridge0,bank_bridge1,bank_bridge2,bank_bridge3,bank_bridge4);
			float widths[5]=float[5](bank_bridge_widths.x,bank_bridge_widths.y,bank_bridge_widths.z,bank_bridge_widths.w,bank_bridge_width4);
			float road=0.0;
			for (int i=0;i<5;i++) {
				float d=abs(dot(wpos.xz-bridges[i].xy,bridges[i].zw));
				road=max(road,1.0-smoothstep(widths[i]-0.1,widths[i]+0.7,d));
			}
			blend*=1.0-road*smoothstep(0.1,0.8,edge);
			c.rgb=mix(c.rgb,bank,blend);
			bank_wet=blend*(1.0-smoothstep(0.0,0.65,edge));
		}
	}
""" + RoadSurface3D.FRAGMENT + """
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
	float water = bank_on > 0.5 ? river_water : (surface_kind == 1 ? step(c.r * 1.15,c.b) * step(c.g * 0.96,c.b) : 0.0);
	float settled = snow * smoothstep(0.25,0.8,world_normal.y) * (1.0 - water);
	float detail = dot(c.rgb,vec3(0.3,0.59,0.11));
	// Snow reflectance follows the calibrated daylight budget. Preserve
	// cool white snow and terrain detail without the old blown highlights.
	c.rgb = mix(c.rgb, vec3(0.72,0.80,0.88) * (0.8 + detail * 0.22), settled);
	c.rgb *= 1.0 - wetness * (surface_kind == 1 ? 0.17 : 0.08) * (1.0 - settled);
	float dark = texture(fog_tex, clamp(wpos.xz / map_m, vec2(0.0), vec2(1.0))).a * fog_on;
	ALBEDO = c.rgb * (1.0 - dark * 0.9);
	ROUGHNESS = mix(0.92, surface_kind == 1 ? 0.38 : 0.5, wetness * (1.0 - settled));
	ROUGHNESS=mix(ROUGHNESS,0.7,bank_wet*(1.0-settled));
""" + RoadSurface3D.FINISH + """
	float coal = (1.0-smoothstep(forge_radius*0.45,max(0.0001,forge_radius),distance(wpos,forge_origin))) * step(0.7,world_normal.y);
	EMISSION = vec3(0.8,0.19,0.025) * coal * forge_on * (1.0 - dark);
	EMISSION += vec3(0.65,0.28,0.07) * glass * night * window_light_on * (1.0-dark);
}
"""

const EARTH := Color(0.33, 0.25, 0.16)
const BED := Color(0.2, 0.15, 0.1)

var battle: Battle
var view: View3D
var banks: RiverBanks3D
var _fog_shader: Shader
var _fog_materials: Array[WeakRef] = []
var _climate_clock := 0.0
var _climate := {}
var _works := MeshInstance3D.new()
var _works_key := ""
var _gabions: MultiMeshInstance3D
var _posts: Array = []        # [territory, ring, claim ring, label]
var _ghost: MeshInstance3D
var _rally: MeshInstance3D
var _clock := 0.0


func _ready() -> void:
	banks = RiverBanks3D.new()
	_fog_shader = Shader.new()
	_fog_shader.code = FOG_SHADER
	var mat := StandardMaterial3D.new()
	mat.vertex_color_use_as_albedo = true
	mat.roughness = 1.0
	_works.material_override = mat
	add_child(_works)
	_gabions = MultiMeshInstance3D.new()
	add_child(_gabions)
	_make_posts()
	_ghost = MeshInstance3D.new()
	_ghost.mesh = BoxMesh.new()
	var ghost_mat := StandardMaterial3D.new()
	ghost_mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ghost_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_ghost.material_override = ghost_mat
	_ghost.visible = false
	add_child(_ghost)
	_rally = MeshInstance3D.new()
	var pole := CylinderMesh.new()
	pole.top_radius = 0.05
	pole.bottom_radius = 0.05
	pole.height = 3.0
	_rally.mesh = pole
	var rally_mat := StandardMaterial3D.new()
	rally_mat.albedo_color = View3D.RING
	rally_mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_rally.material_override = rally_mat
	_rally.visible = false
	add_child(_rally)


## A material that darkens a model where the fog lies, with its own texture.
func fogged(texture: Texture2D, tint := Color(1, 1, 1), kind := 0) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = _fog_shader
	mat.set_shader_parameter("albedo_tex", texture)
	mat.set_shader_parameter("tint", tint)
	mat.set_shader_parameter("surface_kind", kind)
	if kind == 1:
		banks.configure(mat,texture)
	mat.set_shader_parameter("map_m", Iso.WORLD / Iso.PPM)
	if battle.fog != null:
		mat.set_shader_parameter("fog_tex", battle.fog.get("_texture"))
	_fog_materials.append(weakref(mat))
	_apply_climate(mat)
	return mat


func _apply_climate(mat: ShaderMaterial) -> void:
	if battle == null:
		return
	if _climate.is_empty():
		_climate = WorldClimate3D.sample(battle.clock, battle.weather.raining if battle.weather != null else false,
			battle.weather.wetness if battle.weather != null else 0.0)
	for key: String in ["snow", "autumn", "summer", "wetness"]:
		mat.set_shader_parameter(key, _climate[key])
	mat.set_shader_parameter("night", _climate["dark"])
	mat.set_shader_parameter("fog_on", 1.0 if battle.fog != null and battle.fog.enabled else 0.0)


## The fog material on every mesh of a model (its texture kept).
func fog_model(node: Node) -> void:
	for child in node.find_children("*", "MeshInstance3D", true, false):
		var mesh := child as MeshInstance3D
		var source := mesh.get_active_material(0) as StandardMaterial3D
		if source != null and source.albedo_texture != null:
			mesh.material_override = fogged(source.albedo_texture, source.albedo_color)


func _process(delta: float) -> void:
	if battle == null:
		return
	_climate_clock -= delta
	if _climate_clock <= 0.0:
		_climate_clock = 0.1
		_climate = WorldClimate3D.sample(battle.clock, battle.weather.raining if battle.weather != null else false,
			battle.weather.wetness if battle.weather != null else 0.0)
		for i in range(_fog_materials.size() - 1, -1, -1):
			var mat: ShaderMaterial = _fog_materials[i].get_ref()
			if mat == null:
				_fog_materials.remove_at(i)
			else:
				_apply_climate(mat)
	_placing()
	_rally_point()
	_clock -= delta
	if _clock <= 0.0:
		_clock = 0.25
		_sync_works()
		_sync_posts()


# ---- trenches and craters ----

func _sync_works() -> void:
	var key := ""
	for t in battle.trenches.list:
		key += "%d:%.2f:%d;" % [TrenchArt.id_of(t), float(t["progress"]), int(t.get("level", 1))]
	key += "c%d" % battle.trenches.craters.size()
	if key == _works_key:
		return
	_works_key = key
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	var gabions: Array[Transform3D] = []
	for t in battle.trenches.list:
		_trench(st, t, gabions)
	for c in battle.trenches.craters:
		_crater(st, Vector2(c["world"]))
	st.generate_normals()
	_works.mesh = st.commit() if not battle.trenches.list.is_empty() or not battle.trenches.craters.is_empty() else null
	var gabion := view.call("_mesh_of", "gabion") as Mesh
	if gabion != null and not gabions.is_empty():
		var mm := MultiMesh.new()
		mm.transform_format = MultiMesh.TRANSFORM_3D
		mm.mesh = gabion
		mm.instance_count = gabions.size()
		for i in gabions.size():
			mm.set_instance_transform(i, gabions[i])
		_gabions.multimesh = mm
	else:
		_gabions.multimesh = null


func _tri(st: SurfaceTool, points: Array, colour: Color) -> void:
	for p: Vector3 in points:
		st.set_color(colour)
		st.add_vertex(p)


func _quad(st: SurfaceTool, a: Vector3, b: Vector3, c: Vector3, d: Vector3, ca: Color, cc: Color) -> void:
	# These trench quads run along the trench, then across it. Godot uses
	# clockwise front faces; the old order faced down into the terrain.
	_tri(st, [a, c, b], ca)
	_tri(st, [a, d, c], ca.lerp(cc, 0.5))


## A point of the trench's frame (u along, v out, px) `up` metres above the ground.
func _p(f: TrenchArt.Frame, u: float, v: float, up := 0.0) -> Vector3:
	return View3D.at(f.c + f.along * u + f.out * v) + Vector3.UP * up


func _trench(st: SurfaceTool, t: Dictionary, gabions: Array[Transform3D]) -> void:
	var f := TrenchArt.Frame.new(t)
	var p: float = minf(1.0, t["progress"])
	var n := 16
	for i in n:
		var u0 := -f.half + 2.0 * f.half * i / n
		var u1 := -f.half + 2.0 * f.half * (i + 1) / n
		# The cut: dark, darker as it deepens, just over the ground.
		var w0 := TrenchArt.lip_v(f, u0)
		var w1 := TrenchArt.lip_v(f, u1)
		var bed := EARTH.lerp(BED, p)
		_quad(st, _p(f, u0, -w0, 0.04), _p(f, u1, -w1, 0.04), _p(f, u1, w1, 0.04), _p(f, u0, w0, 0.04), bed, bed)
		# The bank: a short steep face to the cut, a long slope out to the enemy.
		var h0 := TrenchArt.lift(f, u0)
		var h1 := TrenchArt.lift(f, u1)
		var crest0 := _p(f, u0, w0 + 7.0, h0)
		var crest1 := _p(f, u1, w1 + 7.0, h1)
		_quad(st, _p(f, u0, w0, 0.02), _p(f, u1, w1, 0.02), crest1, crest0, EARTH.darkened(0.2), EARTH)
		_quad(st, crest0, crest1, _p(f, u1 * 1.05, w1 + 32.0, 0.02), _p(f, u0 * 1.05, w0 + 32.0, 0.02),
			Color(0.55, 0.46, 0.3), Color(0.4, 0.45, 0.25))
		# The ditch before it.
		if p >= 0.5:
			_quad(st, _p(f, u0 * 1.04, w0 + TrenchArt.DITCH_FROM, 0.03), _p(f, u1 * 1.04, w1 + TrenchArt.DITCH_FROM, 0.03),
				_p(f, u1 * 1.04, w1 + TrenchArt.DITCH_TO, 0.03), _p(f, u0 * 1.04, w0 + TrenchArt.DITCH_TO, 0.03), BED, EARTH)
	# Level 3: gabions along the inside of the bank, gaps for the muskets.
	var build := 1.0 if int(t.get("level", 1)) >= 3 else 0.0
	if p >= 1.0 and build > 0.0:
		var step := TrenchArt.GABION_GAP * TrenchArt.PPM
		var count := maxi(1, floori((2.0 * f.half - f.w * 1.2) / step))
		for i in count + 1:
			var u := -count * step / 2.0 + i * step
			gabions.append(Transform3D(Basis(Vector3.UP, View3D.turn(float(t["facing"]))), _p(f, u, TrenchArt.lip_v(f, u) + 3.0)))


func _crater(st: SurfaceTool, world: Vector2) -> void:
	var centre := View3D.at(world) + Vector3.UP * 0.03
	var r := 0.55
	for i in 10:
		var a0 := TAU * i / 10.0
		var a1 := TAU * (i + 1) / 10.0
		_tri(st, [centre, centre + Vector3(cos(a0), 0, sin(a0)) * r, centre + Vector3(cos(a1), 0, sin(a1)) * r], Color(0.22, 0.17, 0.11))


## How far a man in a trench stands below the ground (m), as the 2D view sinks him.
func sink(u: Unit) -> float:
	var t: Variant = battle.trenches.call("_sunk_in", u.world)
	if t == null:
		return 0.0
	var p: float = minf(1.0, float(t["progress"]))
	if u.leaning:
		return TrenchArt.FIRE_STEP * p
	return TrenchArt.SINK * p * (0.85 if u.type == "infantry" else 0.6)


# ---- territories ----

func _make_posts() -> void:
	for p in battle.territories:
		var ring := _ring(battle.territory_radius / Iso.PPM, 0.12)
		ring.position = View3D.at(p["world"]) + Vector3.UP * 0.1
		var claim := _ring(battle.territory_radius / Iso.PPM - 0.4, 0.2)
		claim.position = ring.position + Vector3.UP * 0.02
		var label := Label3D.new()
		label.billboard = BaseMaterial3D.BILLBOARD_ENABLED
		label.font_size = 36
		label.pixel_size = 0.014
		label.outline_size = 8
		label.position = View3D.at(p["world"]) + Vector3.UP * 3.0
		label.text = "%s (+%s %s)" % [p["label"], p["rate"], Rules.label(p["resource"])]
		add_child(ring)
		add_child(claim)
		add_child(label)
		_posts.append([p, ring, claim, label])


func _ring(radius: float, width: float) -> MeshInstance3D:
	var ring := MeshInstance3D.new()
	var torus := TorusMesh.new()
	torus.inner_radius = radius - width
	torus.outer_radius = radius
	torus.rings = 64
	ring.mesh = torus
	ring.scale = Vector3(1.0, 0.05, 1.0)
	var mat := StandardMaterial3D.new()
	mat.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	mat.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	ring.material_override = mat
	return ring


func _sync_posts() -> void:
	for entry: Array in _posts:
		var p: Dictionary = entry[0]
		var owner: String = p["owner"]
		var colour := Color(0.85, 0.82, 0.7, 0.8)
		if owner == "france":
			colour = Color(0.3, 0.5, 0.95, 0.9)
		elif owner == "britain":
			colour = Color(0.9, 0.3, 0.25, 0.9)
		if p["contested"]:
			colour = Color(1.0, 0.75, 0.2, 0.95)
		((entry[1] as MeshInstance3D).material_override as StandardMaterial3D).albedo_color = colour
		var claim: MeshInstance3D = entry[2]
		var progress := float(p["progress"])
		claim.visible = progress > 0.0
		(claim.material_override as StandardMaterial3D).albedo_color = Color(0.3, 0.5, 0.95, 0.5 + 0.5 * progress) \
			if p["claim"] == "france" else Color(0.9, 0.3, 0.25, 0.5 + 0.5 * progress)


# ---- placing a building, the rally point ----

func _placing() -> void:
	if battle.placing == "":
		_ghost.visible = false
		return
	var at := view.ground_at(get_viewport().get_mouse_position())
	var site: Variant = battle.site_for(battle.placing, at)
	var where: Vector2 = site if site != null else at
	var info := Rules.building_type(battle.placing)
	var size := Vector2(float(info.get("w", 60)), float(info.get("h", 50))) / Iso.PPM
	_ghost.visible = true
	(_ghost.mesh as BoxMesh).size = Vector3(size.x, 0.6, size.y)
	_ghost.position = View3D.at(where) + Vector3.UP * 0.3
	(_ghost.material_override as StandardMaterial3D).albedo_color = Color(0.4, 0.9, 0.4, 0.4) if site != null else Color(0.95, 0.3, 0.25, 0.4)


func _rally_point() -> void:
	var b := battle.selected_building
	_rally.visible = b != null and b.rally != null
	if _rally.visible:
		_rally.position = View3D.at(Vector2(b.rally)) + Vector3.UP * 1.5
