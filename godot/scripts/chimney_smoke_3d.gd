class_name ChimneySmoke3D
extends Node3D
## Cold-weather heating smoke. One reusable GPU batch; no CPU particles,
## game RNG, unit scans, simulation changes or objects per individual puff.

const MAX_FLUES := 96
const PUFFS := 12
const LIFE := 8.0
## Local Godot coordinates at the tops of the actual Blender chimney caps.
## Blender (x,y,z) -> Godot (x,z,-y). Tents, barns and spires have no flue.
const FLUES := {
	"cottage":[Vector3(-2.0,7.845,-0.4)],
	"farmhouse":[Vector3(2.6,9.045,-0.4)],
	"inn":[Vector3(3.5,8.58,-0.8)],
	"barracks_fr":[Vector3(-4.5,10.845,-0.4),Vector3(4.5,10.845,-0.4)],
	"barracks_br":[Vector3(-4.5,10.845,-0.4),Vector3(4.5,10.845,-0.4)],
	"foundry_fr":[Vector3(2.6,7.02,-1.4)],
	"foundry_br":[Vector3(2.6,7.02,-1.4)]}

const SHADER := """shader_type spatial;
render_mode unshaded,blend_mix,depth_draw_never,cull_disabled,shadows_disabled;
uniform float now;
uniform float density=0.0;
uniform float lifetime=8.0;
uniform vec3 wind;
uniform vec3 light=vec3(1.0);
uniform sampler2D disc : filter_linear;
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m;
uniform float fog_on=1.0;
varying float strength;
varying vec2 source;
varying vec2 world;
void vertex() {
	vec4 data=INSTANCE_CUSTOM;
	float t=fract(now/lifetime+data.x);
	float age=t*lifetime;
	float scale=length(MODEL_MATRIX[0].xyz);
	vec3 origin=MODEL_MATRIX[3].xyz;
	source=origin.xz;
	vec3 drift=(wind*(age*0.45+age*age*0.015)+vec3(0,age*0.85,0))*scale;
	drift.x+=sin(age*1.6+data.y*17.0)*0.12*t*scale;
	drift.z+=cos(age*1.3+data.y*13.0)*0.10*t*scale;
	float size=(0.22+1.6*pow(t,0.8))*(0.9+data.z*0.2)*scale;
	vec3 at=origin+drift;
	vec3 pos=at+(INV_VIEW_MATRIX[0].xyz*VERTEX.x+INV_VIEW_MATRIX[1].xyz*VERTEX.y)*size;
	world=pos.xz;
	POSITION=PROJECTION_MATRIX*VIEW_MATRIX*vec4(pos,1.0);
	strength=smoothstep(0.0,0.055,t)*(1.0-smoothstep(0.35,1.0,t));
}
void fragment() {
	// Smoke must not reveal a fire in a house hidden by fog of war, even
	// when its plume drifts into an otherwise visible part of the field.
	float a=texture(fog_tex,clamp(source/map_m,vec2(0),vec2(1))).a*fog_on;
	float b=texture(fog_tex,clamp(world/map_m,vec2(0),vec2(1))).a*fog_on;
	float seen=1.0-smoothstep(0.1,0.4,max(a,b));
	ALBEDO=vec3(0.44,0.46,0.45)*light;
	ALPHA=texture(disc,UV).a*strength*density*seen*0.46;
}
"""

var view: View3D
var batch := MultiMeshInstance3D.new()
var material: ShaderMaterial
var sources: Array[Dictionary] = []
var _village: Array[Dictionary] = []
var _key := ""
var _now := 0.0
var _clock := 0.0
var _target := 0.0
var _density := 0.0
var temperature := 20.0
var rebuilds := 0


static func heating(celsius: float) -> float:
	return 1.0-smoothstep(1.0,12.0,celsius)


func _ready() -> void:
	_now = view.battle.clock
	var shader := Shader.new()
	shader.code = SHADER
	material = ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("disc",Effects._soft_texture(64,0.9))
	material.set_shader_parameter("fog_tex",view.battle.fog.get("_texture"))
	material.set_shader_parameter("map_m",Iso.WORLD/Iso.PPM)
	material.set_shader_parameter("lifetime",LIFE)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = QuadMesh.new()
	mm.instance_count = MAX_FLUES*PUFFS
	mm.visible_instance_count = 0
	mm.custom_aabb = AABB(Vector3(-20,-10,-20),Vector3(Iso.WORLD.x/Iso.PPM+40,100,Iso.WORLD.y/Iso.PPM+40))
	batch.multimesh = mm
	batch.material_override = material
	batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	batch.visible = false
	add_child(batch)
	for i in view.building_ground.villages.size():
		var item: Dictionary = view.building_ground.villages[i]
		_append(_village,"v%d" % i,item["model"],item["transform"])
	refresh()


func _append(list: Array[Dictionary],id: String,model: String,pose: Transform3D) -> void:
	var flues: Array = FLUES.get(model,[])
	for i in flues.size():
		list.append({"id":id+":%d" % i,"at":pose*Vector3(flues[i]),"scale":pose.basis.x.length(),"model":model})


func refresh() -> void:
	var battle := view.battle
	var climate := WorldClimate3D.sample(battle.clock,battle.weather.raining,battle.weather.wetness)
	temperature = float(climate["temperature"])
	_target = heating(temperature)
	material.set_shader_parameter("fog_on",1.0 if battle.fog.enabled else 0.0)
	var breeze := battle.effects.wind() if battle.effects!=null else Vector2(6,3)
	material.set_shader_parameter("wind",Vector3(breeze.x,0,breeze.y*2.0)/Iso.PPM)
	var light: Color = climate["sun_color"]
	light *= lerpf(1.0,0.3,float(climate["dark"]))
	material.set_shader_parameter("light",Vector3(light.r,light.g,light.b))
	var candidates: Array[Dictionary] = _village.duplicate()
	var halls: Dictionary = view.get("_halls")
	for b: Variant in halls.keys():
		if not is_instance_valid(b) or not b.visible or not b.complete or not b.standing():
			continue
		var node: Node3D = halls[b]
		if is_instance_valid(node) and node.visible:
			_append(candidates,"b%d" % b.id,String(node.get_meta("model")),node.transform)
	var near: Array[Dictionary] = []
	var centre: Vector3 = view.get("_target")
	var reach := clampf(float(view.get("_distance"))*2.0,45.0,180.0)
	for item: Dictionary in candidates:
		var at: Vector3 = item["at"]
		if Vector2(at.x-centre.x,at.z-centre.z).length_squared()>reach*reach:
			continue
		if not battle.fog.sees(View3D.flat(at)):
			continue
		near.append(item)
	if near.size()>MAX_FLUES:
		near.sort_custom(func(a: Dictionary,b: Dictionary) -> bool:
			return Vector3(a["at"]).distance_squared_to(centre)<Vector3(b["at"]).distance_squared_to(centre))
		near.resize(MAX_FLUES)
	var key := ""
	for item: Dictionary in near:
		key += "%s:%s;" % [item["id"],item["at"]]
	if key==_key:
		return
	_key = key
	sources = near
	rebuilds += 1
	var mm := batch.multimesh
	mm.visible_instance_count = sources.size()*PUFFS
	for i in sources.size():
		var at: Vector3 = sources[i]["at"]
		var scale: float = sources[i]["scale"]
		var seed := int(absf(at.x*103.0+at.z*197.0))
		for puff in PUFFS:
			var index := i*PUFFS+puff
			mm.set_instance_transform(index,Transform3D(Basis().scaled(Vector3.ONE*scale),at))
			mm.set_instance_custom_data(index,Color(float(puff)/PUFFS+Battle.hash01(seed,1),Battle.hash01(seed,puff+2),Battle.hash01(seed,puff+40),0))


func _process(delta: float) -> void:
	_now += delta
	_clock -= delta
	if _clock<=0.0:
		_clock = 0.25
		refresh()
	_density = move_toward(_density,_target,delta*0.5)
	material.set_shader_parameter("now",_now)
	material.set_shader_parameter("density",_density)
	batch.visible = _density>0.005 and not sources.is_empty()


func stats() -> Dictionary:
	return {"flues":sources.size(),"slots":MAX_FLUES*PUFFS,"batches":1,"rebuilds":rebuilds,
		"temperature":temperature,"density":_density}
