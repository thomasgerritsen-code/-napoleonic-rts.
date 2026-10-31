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
uniform sampler2D albedo_tex : source_color, filter_linear_mipmap_anisotropic;
uniform vec4 tint : source_color = vec4(1.0);
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m = vec2(355.5, 222.2);
uniform float fog_on = 1.0;
varying vec3 wpos;
void vertex() {
	wpos = (MODEL_MATRIX * vec4(VERTEX, 1.0)).xyz;
}
void fragment() {
	vec4 c = texture(albedo_tex, UV) * tint;
	float dark = texture(fog_tex, clamp(wpos.xz / map_m, vec2(0.0), vec2(1.0))).a * fog_on;
	ALBEDO = c.rgb * (1.0 - dark * 0.9);
	ROUGHNESS = 0.92;
}
"""

const EARTH := Color(0.33, 0.25, 0.16)
const BED := Color(0.2, 0.15, 0.1)

var battle: Battle
var view: View3D
var _fog_shader: Shader
var _fog_materials: Array[ShaderMaterial] = []
var _works := MeshInstance3D.new()
var _works_key := ""
var _gabions: MultiMeshInstance3D
var _posts: Array = []        # [territory, ring, claim ring, label]
var _ghost: MeshInstance3D
var _rally: MeshInstance3D
var _clock := 0.0


func _ready() -> void:
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
func fogged(texture: Texture2D, tint := Color(1, 1, 1)) -> ShaderMaterial:
	var mat := ShaderMaterial.new()
	mat.shader = _fog_shader
	mat.set_shader_parameter("albedo_tex", texture)
	mat.set_shader_parameter("tint", tint)
	mat.set_shader_parameter("map_m", Iso.WORLD / Iso.PPM)
	if battle.fog != null:
		mat.set_shader_parameter("fog_tex", battle.fog.get("_texture"))
	_fog_materials.append(mat)
	return mat


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
	var on := 1.0 if battle.fog != null and battle.fog.enabled else 0.0
	for mat in _fog_materials:
		mat.set_shader_parameter("fog_on", on)
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
	_tri(st, [a, b, c], ca)
	_tri(st, [a, c, d], ca.lerp(cc, 0.5))


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
