class_name RoadSurface3D
extends RefCounted
## Packed Blender-aligned road distances, sampled in the existing terrain pass.
## No overlay mesh, geometry movement, per-frame CPU work or unit scans.

const FIELD := "res://assets/map/road_field.png"
const DETAIL := "res://assets/map/road_detail.png"
const CELL := 0.25
const DISTANCE_RANGE := 4.0

const UNIFORMS := """
uniform float roads_on = 0.0;
uniform sampler2D road_field : filter_linear, repeat_disable;
uniform sampler2D road_detail : filter_linear_mipmap_anisotropic, repeat_enable;
uniform vec2 road_extent;
"""

const FRAGMENT := """
	float road_cover=0.0;
	float road_puddle=0.0;
	float road_relief=0.0;
	if (surface_kind==1 && roads_on>0.5 && river_water<0.5) {
		vec4 rf=texture(road_field,wpos.xz/road_extent);
		vec2 sd=(rf.rg-vec2(0.5))*8.0;
		if (min(sd.x,sd.y)<2.0) {
			vec4 detail=texture(road_detail,wpos.xz/3.2);
			float patch=silt_grain(wpos.xz*0.72);
			float wobble=(patch-0.5)*0.42+(detail.b-0.5)*0.08;
			float aa=max(0.035,length(fwidth(wpos.xz))*0.45);
			float stone=1.0-smoothstep(-0.12-aa,0.12+aa,sd.x+wobble*0.35);
			float dirt=(1.0-smoothstep(-0.12-aa,0.16+aa,sd.y+wobble*0.6))*(1.0-stone);
			float verge=1.0-smoothstep(0.1,1.7,min(sd.x,sd.y)+wobble);
			vec3 grass=bank_grass(wpos.xz);
			vec3 gravel=mix(vec3(0.24,0.205,0.135),vec3(0.38,0.335,0.235),detail.b*0.55+patch*0.45);
			vec3 shoulder=mix(gravel*tint.rgb,grass,smoothstep(0.0,1.55,min(sd.x,sd.y)+wobble));
			// Rounded, irregular stones. The packed tile is mipmapped so fine
			// joints soften at distance instead of sparkling while moving.
			vec3 cobble=mix(vec3(0.22,0.205,0.175),vec3(0.40,0.375,0.32),detail.r);
			cobble=mix(vec3(0.13,0.12,0.095),cobble,smoothstep(0.02,0.32,detail.g));
			cobble*=0.93+patch*0.14;
			float across=abs((rf.b-0.5)*4.0);
			float rut=(1.0-smoothstep(0.065,0.22+aa,abs(across-0.52)))*rf.a*dirt;
			vec3 earth=mix(vec3(0.28,0.215,0.135),vec3(0.40,0.325,0.22),detail.b*0.5+patch*0.5);
			earth*=1.0-rut*0.24;
			// A little grass survives between wheel tracks on narrow paths.
			float middle=(1.0-smoothstep(0.08,0.29,across))*step(rf.b,0.5)*dirt;
			earth=mix(earth,grass/max(tint.rgb,vec3(0.01)),middle*(0.35+patch*0.35));
			c.rgb=mix(c.rgb,shoulder,verge);
			c.rgb=mix(c.rgb,earth*tint.rgb,dirt);
			c.rgb=mix(c.rgb,cobble*tint.rgb,stone);
			road_cover=max(stone,dirt);
			// Rain fills irregular low patches rather than polishing the whole road.
			road_puddle=wetness*smoothstep(0.46,0.73,patch)*(rut*0.85+stone*0.28);
			c.rgb=mix(c.rgb,c.rgb*vec3(0.65,0.72,0.77),road_puddle);
			road_relief=(detail.g*0.035*stone-rut*0.018)*(1.0-snow);
		}
	}
"""

const FINISH := """
	if (surface_kind==1 && roads_on>0.5) {
	ROUGHNESS=mix(ROUGHNESS,0.19,road_puddle*(1.0-settled));
	// Derivative bump uses view-space surface gradients: no new geometry,
	// extra detail sample or displaced walking surface. Fog/snow stay shared.
	vec3 road_dx=dFdx(VERTEX), road_dy=dFdy(VERTEX);
	vec3 road_r1=cross(road_dy,NORMAL), road_r2=cross(NORMAL,road_dx);
	float road_det=dot(road_dx,road_r1);
	vec3 road_gradient=sign(road_det)*(dFdx(road_relief)*road_r1+dFdy(road_relief)*road_r2);
	NORMAL=normalize(max(abs(road_det),0.000001)*NORMAL-road_gradient*0.65);
	}
"""


static func configure(material: ShaderMaterial) -> void:
	var field: Texture2D = load(FIELD)
	material.set_shader_parameter("road_field",field)
	material.set_shader_parameter("road_detail",load(DETAIL))
	material.set_shader_parameter("road_extent",Vector2(field.get_size())*CELL)
	material.set_shader_parameter("roads_on",1.0)
