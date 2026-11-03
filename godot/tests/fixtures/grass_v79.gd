extends RefCounted
## Exact published v79 shader/mesh for controlled wind comparisons.
const BLADES := 6
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
	float fade=safe*edge*lod*(1.0-smoothstep(0.1,0.65,snow));
	float angle=hash(grid+vec2(7,91))*6.2831853;
	mat2 turn=mat2(vec2(cos(angle),sin(angle)),vec2(-sin(angle),cos(angle)));
	vec3 blade=VERTEX;
	blade.xz=turn*blade.xz;
	blade.y*=fade*(0.55+jitter.y*0.6);
	blade.xz+=wind*(sin(now*1.7+root.x*1.1+root.y*0.7)+0.35*sin(now*2.8+root.y))*blade.y*blade.y*2.8;
	world=vec3(root.x,ground(root)-0.012,root.y)+blade;
	// Small leaves scatter skylight. An upward-biased aggregate normal also
	// avoids ground-shadow acne on these sub-pixel blades at normal zoom.
	NORMAL=normalize(vec3(turn*NORMAL.xz*0.25,0.0).xzy+vec3(0,1.0,0));
	float height=UV.y;
	colour=mix(vec3(0.10,0.16,0.035),vec3(0.24,0.30,0.10),height)*(0.86+jitter.x*0.28);
	colour=mix(colour,colour*vec3(1.15,1.02,0.76),summer*0.6+autumn*0.45);
	VERTEX=world;
	POSITION=PROJECTION_MATRIX*VIEW_MATRIX*vec4(world,1.0);
	if(fade<0.015 || root.x<0.0 || root.y<0.0 || root.x>terrain_extent.x || root.y>terrain_extent.y) {
		POSITION=vec4(0,0,2,1);
	}
}
void fragment() {
	float fog=texture(fog_tex,clamp(world.xz/map_m,vec2(0),vec2(1))).a*fog_on;
	ALBEDO=colour*(1.0-wetness*0.17)*(1.0-fog*0.9);
	ROUGHNESS=mix(0.95,0.72,wetness);
	BACKLIGHT=ALBEDO*0.18;
}
"""

static func tuft() -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for i in BLADES:
		var yaw := i*TAU/BLADES+0.35
		var h := 0.14+Battle.hash01(i,78)*0.12
		var w := 0.012+Battle.hash01(i,79)*0.008
		var origin := Vector3(cos(yaw)*0.065,0,sin(yaw)*0.065)
		var right := Vector3(cos(yaw),0,sin(yaw))
		var lean := Vector3(-sin(yaw),0,cos(yaw))*h*0.32
		var p := [origin-right*w,origin+right*w,origin+Vector3.UP*h*0.58-right*w*0.6+lean*0.3,
			origin+Vector3.UP*h*0.58+right*w*0.6+lean*0.3,origin+Vector3.UP*h+lean]
		for index in [0,2,1,1,2,3,2,4,3]:
			surface.set_uv(Vector2(0.5,Vector3(p[index]).y/h))
			surface.set_normal(Vector3(-sin(yaw),0.25,cos(yaw)).normalized())
			surface.add_vertex(p[index])
	surface.index()
	return surface.commit()

