## Frozen v72 river and ground for a faithful same-camera comparison.
extends RefCounted
## A single opaque river ribbon. UV.y follows the channel in metres; vertex
## colours carry its local flow direction, including around bends. No extra
## reflection/refraction pass, particle emitter or simulation state.

const SHADER := """shader_type spatial;
render_mode cull_disabled;
uniform float now;
uniform float snow;
uniform float cloud;
uniform float fog_on = 1.0;
uniform sampler2D fog_tex : filter_linear;
uniform vec2 map_m;
uniform float channel_width = 2.58;
uniform vec2 bridge0; uniform vec2 bridge1; uniform vec2 bridge2; uniform vec2 bridge3; uniform vec2 bridge4;
varying vec3 world;
varying vec2 flow_direction;
float hash21(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
float noise2(vec2 p) {
 vec2 cell=floor(p), f=fract(p);
 f=f*f*(3.0-2.0*f);
 return mix(mix(hash21(cell),hash21(cell+vec2(1,0)),f.x),
            mix(hash21(cell+vec2(0,1)),hash21(cell+vec2(1,1)),f.x),f.y);
}
void vertex() {
 world=(MODEL_MATRIX*vec4(VERTEX,1.0)).xyz;
 flow_direction=COLOR.rg*2.0-1.0;
}
void fragment() {
 vec2 along=normalize(flow_direction);
 vec2 across=vec2(-along.y,along.x);
 vec2 flow=vec2((UV.x-0.5)*channel_width,UV.y-now*mix(0.22,0.09,snow));
 float broad=noise2(flow*0.7);
 float fine=noise2(flow*2.6+vec2(broad*0.7));
 float side=abs(UV.x*2.0-1.0);
 float shallow=smoothstep(0.38,0.99,side+(broad-0.5)*0.08);
 float ripple_x=sin(flow.x*7.0+flow.y*2.2+fine*6.28)*0.035;
 float ripple_y=sin(flow.y*5.5+flow.x*3.1+broad*5.0)*0.022;
 // Small rain rings disturb the normal, not the river's colour or banks.
 vec2 drop_cell=floor(world.xz*1.3);
 vec2 drop=fract(world.xz*1.3)-vec2(0.5);
 float age=fract(now*0.8+hash21(drop_cell));
 float ring=sin((length(drop)-age*0.5)*38.0)*(1.0-age)*cloud*0.018;
 float wake=0.0;
 vec2 bridges[5]=vec2[5](bridge0,bridge1,bridge2,bridge3,bridge4);
 for (int i=0;i<5;i++) {
  vec2 offset=world.xz-bridges[i];
  float downstream=dot(offset,along);
  wake+=smoothstep(-0.3,0.7,downstream)*(1.0-smoothstep(0.7,4.0,downstream))
       *(1.0-smoothstep(0.35,1.4,abs(dot(offset,across))));
 }
 ripple_x+=sin(flow.y*8.0+fine*4.0)*wake*0.018;
 vec2 tilt=across*(ripple_x+ring)+along*(ripple_y+ring*0.6);
 NORMAL=normalize(mat3(VIEW_MATRIX)*normalize(vec3(tilt.x,1.0,tilt.y)));
 vec3 deep=mix(vec3(0.055,0.125,0.105),vec3(0.075,0.15,0.12),broad*0.45);
 float grains=noise2(vec2(flow.x,UV.y)*14.0);
 vec3 bed=mix(vec3(0.18,0.19,0.13),vec3(0.30,0.29,0.20),grains);
 vec3 colour=mix(deep,bed,shallow*0.72);
 // A narrow wet-earth margin softens the seam with the baked river bank.
 colour=mix(colour,vec3(0.22,0.225,0.155),smoothstep(0.91,1.0,side)*0.6);
 colour=mix(colour,vec3(0.43,0.49,0.50),snow*smoothstep(0.83,1.0,side)*0.75);
 float fresnel=pow(1.0-clamp(dot(NORMAL,VIEW),0.0,1.0),4.0);
 colour=mix(colour,vec3(0.20,0.26,0.28),fresnel*0.35);
 colour+=vec3(0.018,0.022,0.02)*wake*fine;
 float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0),vec2(1))).a*fog_on;
 ALBEDO=colour*(1.0-fog*0.9);
 ROUGHNESS=0.20+cloud*0.14+snow*0.12;
 SPECULAR=0.6;
}
"""


static func build(battle: Battle) -> MeshInstance3D:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var points := Nav._points
	var distance := 0.0
	for i in points.size():
		if i > 0:
			distance += points[i].distance_to(points[i-1])/Iso.PPM
		var along := (points[mini(i+1,points.size()-1)]-points[maxi(i-1,0)]).normalized()
		var across := along.orthogonal()*Nav._width*0.5
		for side in 2:
			var world := points[i]+across*(-1.0 if side == 0 else 1.0)
			surface.set_color(Color(along.x*0.5+0.5,along.y*0.5+0.5,0,1))
			surface.set_uv(Vector2(side,distance))
			surface.add_vertex(View3D.at(world)+Vector3.UP*0.045)
	for i in points.size()-1:
		var a := i*2
		for index in [a,a+1,a+2,a+1,a+3,a+2]:
			surface.add_index(index)
	surface.generate_normals()
	var node := MeshInstance3D.new()
	node.mesh = surface.commit()
	var shader := Shader.new()
	shader.code = SHADER
	var material := ShaderMaterial.new()
	material.shader = shader
	material.set_shader_parameter("map_m",Iso.WORLD/Iso.PPM)
	material.set_shader_parameter("fog_tex",battle.fog.get("_texture"))
	material.set_shader_parameter("channel_width",Nav._width/Iso.PPM)
	for i in 5:
		var point := Vector2(-10000,-10000)
		if i < Nav.bridges().size():
			point = Vector2(Nav.bridges()[i]["centre"])/Iso.PPM
		material.set_shader_parameter("bridge%d" % i,point)
	node.material_override = material
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
float silt_grain(vec2 p) {
	vec2 cell=floor(p), f=fract(p);
	f=f*f*(3.0-2.0*f);
	return mix(mix(grain(cell),grain(cell+vec2(1,0)),f.x),mix(grain(cell+vec2(0,1)),grain(cell+vec2(1,1)),f.x),f.y);
}
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
	float bank_tint = surface_kind == 1 ? smoothstep(0.92,1.3,c.b/max(0.001,c.r))
		*smoothstep(0.6,0.92,c.b/max(0.001,c.g))*smoothstep(1.0,1.35,c.g/max(0.001,c.r)) : 0.0;
	float settled = snow * smoothstep(0.25,0.8,world_normal.y) * (1.0 - water);
	float detail = dot(c.rgb,vec3(0.3,0.59,0.11));
	// The ground atlas contains the old cyan river and shore. The opaque
	// water ribbon covers its centre; turn the exposed fringe into wet silt.
	// Only ground water-coloured texels participate, not roofs or foliage.
	if (bank_tint > 0.001 || water > 0.001) {
		vec3 silt=mix(vec3(0.22,0.235,0.14),vec3(0.36,0.31,0.20),silt_grain(wpos.xz*1.8));
		c.rgb=mix(c.rgb,silt*(0.75+detail*0.6),max(water,bank_tint)*0.92);
	}
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

static func ground_mesh() -> ArrayMesh:
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	var tex: Texture2D = load("res://assets/map/" + String(meta["image"]))
	var k := float(meta["pxPerM"]) / float(meta["gamePxPerM"])
	var pad := float(meta["padTop"])
	var step := 45.0
	var cols := int(Iso.WORLD.x / step) + 1
	var rows := int(Iso.WORLD.y / step) + 1
	var st := SurfaceTool.new()
	st.begin(Mesh.PRIMITIVE_TRIANGLES)
	for r in rows:
		for c in cols:
			var w := Vector2(c, r) * step
			var screen := Iso.to_screen(w)
			st.set_uv(Vector2(screen.x * k / tex.get_width(), (pad + screen.y * k) / tex.get_height()))
			st.add_vertex(View3D.at(w))
	for r in rows - 1:
		for c in cols - 1:
			var i := r * cols + c
			st.add_index(i)
			st.add_index(i + 1)
			st.add_index(i + cols)
			st.add_index(i + 1)
			st.add_index(i + cols + 1)
			st.add_index(i + cols)
	st.generate_normals()
	return st.commit()
