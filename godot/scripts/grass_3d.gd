class_name Grass3D
extends Node3D
## Actual tapered, bent blades. One fixed toroidal GPU patch follows the
## camera without moving/rebuilding its CPU instance buffer. No unit scans.

const GRID := 72
const CELL := 0.6
const BLADES := 8
const MASK_CELL := GrassSurface3D.MASK_CELL

const SHADER := """shader_type spatial;
render_mode cull_disabled,diffuse_lambert_wrap;
uniform float now;
uniform vec3 centre;
uniform float lod=1.0;
uniform vec2 wind;
uniform float snow=0.0;
uniform float summer=0.0;
uniform float autumn=0.0;
uniform float wetness=0.0;
uniform sampler2D relief : filter_nearest,repeat_disable;
uniform vec2 relief_origin;
uniform vec2 relief_size;
uniform float relief_cell=2.0;
uniform sampler2D cover_tex : filter_linear,repeat_disable;
uniform sampler2D blocked_tex : filter_linear,repeat_disable;
uniform vec2 cover_extent;
uniform sampler2D road_field : filter_linear,repeat_disable;
uniform vec2 road_extent;
uniform sampler2D bank_profile : filter_linear,repeat_disable;
uniform vec2 bank_lookup;
uniform float bank_rim;
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m;
uniform vec2 terrain_extent;
uniform float fog_on=1.0;
varying vec3 world;
varying vec3 colour;
float hash(vec2 p) {return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float ground(vec2 p) {
	vec2 q=(p-relief_origin)/relief_cell;
	vec2 cell=floor(q),f=fract(q);
	vec2 uv=(cell+vec2(0.5))/relief_size;
	float a=texture(relief,uv).r;
	float b=texture(relief,uv+vec2(1.0/relief_size.x,0)).r;
	float c=texture(relief,uv+vec2(0,1.0/relief_size.y)).r;
	float d=texture(relief,uv+1.0/relief_size).r;
	return f.x+f.y<=1.0 ? a+(b-a)*f.x+(c-a)*f.y : d+(c-d)*(1.0-f.x)+(b-d)*(1.0-f.y);
}
void vertex() {
	vec2 grid=floor(centre.xz/0.6)-vec2(36.0)+INSTANCE_CUSTOM.xy;
	vec2 jitter=vec2(hash(grid),hash(grid+vec2(31,17)));
	vec2 root=(grid+vec2(0.15)+jitter*0.7)*0.6;
	float cover=texture(cover_tex,root/cover_extent).r;
	float blocked=texture(blocked_tex,root/cover_extent).r;
	vec2 road=(texture(road_field,root/road_extent).rg-vec2(0.5))*8.0;
	vec4 bank=texture(bank_profile,vec2(clamp(root.y/map_m.y,0.0,1.0)*bank_lookup.x+bank_lookup.y,0.5));
	float dry=smoothstep(bank_rim+0.04,bank_rim+0.3,abs(root.x-bank.x));
	float safe=cover*(1.0-blocked)*smoothstep(0.6,1.2,min(road.x,road.y))*dry;
	float edge=1.0-smoothstep(14.0,21.0,length(root-centre.xz));
	float margin=min(min(root.x,root.y),min(terrain_extent.x-root.x,terrain_extent.y-root.y));
	float fade=safe*edge*lod*(1.0-smoothstep(0.1,0.65,snow))*smoothstep(0.05,0.4,margin);
	float angle=hash(grid+vec2(7,91))*6.2831853;
	mat2 turn=mat2(vec2(cos(angle),sin(angle)),vec2(-sin(angle),cos(angle)));
	vec3 blade=VERTEX;
	blade.xz=turn*blade.xz;
	blade.y*=fade*(0.55+jitter.y*0.6);
	float height=UV.y;
	float strength=clamp(length(wind)/0.42,0.0,1.3);
	vec2 direction=wind/max(length(wind),0.0001);
	// Travelling gusts are shared across the meadow; small per-blade
	// variations stop individual leaves moving like one rigid prop.
	float wave=0.5+0.5*sin(dot(root,direction)*0.46-now*1.1);
	float swell=0.5+0.5*sin(dot(root,vec2(0.13,0.19))-now*0.53);
	float gust=smoothstep(0.2,0.85,wave*0.72+swell*0.28);
	float flutter=sin(now*(2.1+jitter.x*0.8)+jitter.y*6.2831853+UV.x*4.7);
	float clearance=1.0-texture(blocked_tex,(root+direction*0.45)/cover_extent).r;
	float bend=clamp(strength*(0.14+gust*0.92+flutter*0.09),0.0,1.15)*clearance;
	bend*=smoothstep(0.05,0.6,margin);
	// Circular bending preserves blade length and fixes the root exactly.
	// Three mesh segments follow the arc instead of sliding a flat card.
	float radius=blade.y/max(height,0.001)/max(bend,0.001);
	float arc=bend*height;
	if(bend>0.001) {
		blade.xz+=direction*radius*(1.0-cos(arc));
		blade.y=radius*sin(arc);
	}
	world=vec3(root.x,ground(root)-0.012,root.y)+blade;
	// Small leaves scatter skylight. An upward-biased aggregate normal also
	// avoids ground-shadow acne on these sub-pixel blades at normal zoom.
	NORMAL=normalize(vec3(turn*NORMAL.xz*0.25-direction*bend*height*0.45,0.0).xzy+vec3(0,1.0,0));
	// A little deeper than the painted ground: lit on both faces (fragment)
	// the blades read as tufts of green standing out from it, so a gust
	// running through them shows; not the black specks of before.
	colour=mix(vec3(0.12,0.19,0.04),vec3(0.31,0.38,0.12),height)*(0.86+jitter.x*0.28);
	colour=mix(colour,colour*vec3(1.15,1.02,0.76),summer*0.6+autumn*0.45);
	// The meadow's patches, as the ground under them; in a patch in bloom
	// some blades carry a flower at the tip.
	colour=meadow_tint(root,colour);
	float bloom=meadow(root).z*(1.0-autumn);
	colour=mix(colour,meadow_flower(root),step(hash(grid+vec2(5.0,9.0)),bloom*0.2)*smoothstep(0.7,0.95,height));
	VERTEX=world;
	POSITION=PROJECTION_MATRIX*VIEW_MATRIX*vec4(world,1.0);
	// No blades on unknown ground: there the field is a grey haze.
	float unknown=textureLod(fog_tex,clamp(root/map_m,vec2(0),vec2(1)),0.0).a*fog_on;
	if(fade<0.015 || unknown>0.7 || root.x<0.0 || root.y<0.0 || root.x>terrain_extent.x || root.y>terrain_extent.y) {
		POSITION=vec4(0,0,2,1);
	}
}
void fragment() {
	// Both faces of a blade are drawn; the back face's normal is turned
	// down by Godot and would leave the blade black. A blade takes the sky's
	// light on either face.
	NORMAL=FRONT_FACING?NORMAL:-NORMAL;
	float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0),vec2(1))).a*fog_on;
	// Ground seen before: the blades fade into the same haze as the ground.
	vec3 lit=colour*(1.0-wetness*0.17);
	float grey=dot(lit,vec3(0.3,0.59,0.11));
	ALBEDO=mix(lit,mix(vec3(grey),vec3(0.4,0.42,0.46),0.45)*0.5,fog);
	ROUGHNESS=mix(0.95,0.72,wetness);
	BACKLIGHT=ALBEDO*0.18;
}
"""

var view: View3D
var batch := MultiMeshInstance3D.new()
var material: ShaderMaterial
var blocked: Image
var cover: Image
var _blocked_texture: ImageTexture
var _static_mask: Image
var _mask_key := "uninitialised"
var _clock := 0.0
var _now := 0.0
var mask_rebuilds := 0


func _ready() -> void:
	var cover_texture: Texture2D = load(GrassSurface3D.COVER)
	cover = cover_texture.get_image()
	_static_mask = Image.create(cover.get_width(),cover.get_height(),false,Image.FORMAT_L8)
	for item in view.building_ground.villages:
		_block_model(_static_mask,item["mesh"],item["transform"])
	blocked = _static_mask.duplicate()
	_blocked_texture = ImageTexture.create_from_image(blocked)
	material = ShaderMaterial.new()
	var shader := Shader.new()
	shader.code = SHADER.replace("float hash(vec2 p)", GrassSurface3D.MEADOW + "float hash(vec2 p)")
	material.shader = shader
	material.set_shader_parameter("cover_tex",cover_texture)
	material.set_shader_parameter("blocked_tex",_blocked_texture)
	material.set_shader_parameter("cover_extent",Vector2(cover.get_size())*MASK_CELL)
	material.set_shader_parameter("road_field",load(RoadSurface3D.FIELD))
	var road_texture: Texture2D = load(RoadSurface3D.FIELD)
	material.set_shader_parameter("road_extent",Vector2(road_texture.get_size())*RoadSurface3D.CELL)
	var heights := Image.create_from_data(Iso._cols,Iso._rows,false,Image.FORMAT_RF,Iso._heights.to_byte_array())
	material.set_shader_parameter("relief",ImageTexture.create_from_image(heights))
	material.set_shader_parameter("relief_origin",Vector2(Iso._x0,Iso._y0))
	material.set_shader_parameter("relief_size",Vector2(Iso._cols,Iso._rows))
	material.set_shader_parameter("relief_cell",Iso._cell)
	material.set_shader_parameter("map_m",Iso.WORLD/Iso.PPM)
	material.set_shader_parameter("terrain_extent",Vector2(floorf(Iso.WORLD.x/RiverBanks3D.STEP),floorf(Iso.WORLD.y/RiverBanks3D.STEP))*RiverBanks3D.STEP/Iso.PPM)
	material.set_shader_parameter("fog_tex",view.battle.fog.get("_texture"))
	view.field.banks.configure(material)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.mesh = _tuft()
	mm.instance_count = GRID*GRID
	mm.custom_aabb = AABB(Vector3(-10,-10,-10),Vector3(Iso.WORLD.x/Iso.PPM+20,70,Iso.WORLD.y/Iso.PPM+20))
	for i in GRID*GRID:
		mm.set_instance_transform(i,Transform3D.IDENTITY)
		mm.set_instance_custom_data(i,Color(i%GRID,i/GRID,0,0))
	batch.multimesh = mm
	batch.material_override = material
	batch.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(batch)
	_now = view.battle.clock
	refresh()
	_process(0.0)


func _tuft() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in BLADES:
		var yaw := i*TAU/BLADES+0.35
		var h := 0.24+Battle.hash01(i,78)*0.22
		var w := 0.007+Battle.hash01(i,79)*0.006
		var origin := Vector3(cos(yaw)*0.065,0,sin(yaw)*0.065)
		var right := Vector3(cos(yaw),0,sin(yaw))
		var lean := Vector3(-sin(yaw),0,cos(yaw))*h*0.18
		var p := [origin-right*w,origin+right*w,
			origin+Vector3.UP*h*0.33-right*w*0.78+lean*0.12,origin+Vector3.UP*h*0.33+right*w*0.78+lean*0.12,
			origin+Vector3.UP*h*0.66-right*w*0.42+lean*0.45,origin+Vector3.UP*h*0.66+right*w*0.42+lean*0.45,
			origin+Vector3.UP*h+lean]
		for index in [0,2,1,1,2,3,2,4,3,3,4,5,4,6,5]:
			surface.set_uv(Vector2(float(i)/BLADES,Vector3(p[index]).y/h))
			surface.set_normal(Vector3(-sin(yaw),0.25,cos(yaw)).normalized())
			surface.add_vertex(p[index])
	surface.index()
	return surface.commit()


func _polygon(image: Image,points: PackedVector2Array) -> void:
	var bounds := Rect2(points[0],Vector2.ZERO)
	for p in points:
		bounds = bounds.expand(p)
	for y in range(maxi(0,floori(bounds.position.y/MASK_CELL)),mini(image.get_height(),ceili(bounds.end.y/MASK_CELL)+1)):
		for x in range(maxi(0,floori(bounds.position.x/MASK_CELL)),mini(image.get_width(),ceili(bounds.end.x/MASK_CELL)+1)):
			if Geometry2D.is_point_in_polygon((Vector2(x,y)+Vector2.ONE*0.5)*MASK_CELL,points):
				image.set_pixel(x,y,Color.WHITE)


func _block_model(image: Image,mesh: Mesh,pose: Transform3D) -> void:
	var box := mesh.get_aabb().grow(0.35/maxf(0.05,pose.basis.x.length()))
	var points := PackedVector2Array()
	for f: Vector2 in [Vector2(0,0),Vector2(1,0),Vector2(1,1),Vector2(0,1)]:
		var p := pose*Vector3(box.position.x+box.size.x*f.x,0,box.position.z+box.size.z*f.y)
		points.append(Vector2(p.x,p.z))
	_polygon(image,points)


func refresh() -> void:
	var battle := view.battle
	var climate := WorldClimate3D.sample(battle.clock,battle.weather.raining,battle.weather.wetness)
	for key: String in ["snow","summer","autumn","wetness"]:
		material.set_shader_parameter(key,climate[key])
	material.set_shader_parameter("fog_on",1.0 if battle.fog.enabled else 0.0)
	batch.visible = float(climate["snow"])<0.65 and float(view.get("_distance"))<95.0
	var wind := battle.effects.wind()
	material.set_shader_parameter("wind",Vector2(wind.x,wind.y*2.0)/Iso.PPM)
	var halls: Dictionary = view.get("_halls")
	var key := ""
	for b: Variant in halls:
		if is_instance_valid(b) and is_instance_valid(halls[b]) and b.visible:
			key += "%d:%s:%s;" % [b.id,halls[b].get_meta("model"),halls[b].transform]
	for t in battle.trenches.list:
		key += "t%d:%s:%s:%s:%s;" % [TrenchArt.id_of(t),t["centre"],t["facing"],t["length"],t["width"]]
	for c in battle.trenches.craters:
		key += "c%s;" % c["world"]
	if key==_mask_key:
		return
	_mask_key = key
	blocked = _static_mask.duplicate()
	for b: Variant in halls:
		if is_instance_valid(b) and is_instance_valid(halls[b]) and b.visible:
			var node: Node3D = halls[b]
			_block_model(blocked,view._mesh_of(node.get_meta("model")),node.transform)
	for t in battle.trenches.list:
		var f := TrenchArt.Frame.new(t)
		var points := PackedVector2Array()
		for uv: Vector2 in [Vector2(-1,-1),Vector2(1,-1),Vector2(1,1),Vector2(-1,1)]:
			points.append((f.c+f.along*uv.x*(f.half+12)+f.out*(uv.y*(f.w+36)+18))/Iso.PPM)
		_polygon(blocked,points)
	for c in battle.trenches.craters:
		var at: Vector2 = c["world"]/Iso.PPM
		_polygon(blocked,PackedVector2Array([at+Vector2(-0.7,-0.7),at+Vector2(0.7,-0.7),at+Vector2(0.7,0.7),at+Vector2(-0.7,0.7)]))
	_blocked_texture.update(blocked)
	mask_rebuilds += 1


func _process(delta: float) -> void:
	_now += delta
	_clock -= delta
	if _clock<=0.0:
		_clock = 0.5
		refresh()
	material.set_shader_parameter("now",_now)
	material.set_shader_parameter("centre",view.get("_target"))
	material.set_shader_parameter("lod",1.0-smoothstep(55.0,95.0,float(view.get("_distance"))))


func stats() -> Dictionary:
	return {"clumps":GRID*GRID,"blades":GRID*GRID*BLADES,"batches":1,"mask_rebuilds":mask_rebuilds}
