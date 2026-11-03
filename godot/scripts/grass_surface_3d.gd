class_name GrassSurface3D
extends RefCounted
## Close ground fibres in the existing terrain pass; the large atlas retains
## its broad terrain/forest/yard shading, not its stretched fuzzy detail.

const COVER := "res://assets/map/grass_cover.png"
const DETAIL := "res://assets/map/grass_detail.png"
const MASK_CELL := 0.5

const UNIFORMS := """
uniform float grass_on=0.0;
uniform sampler2D grass_cover : filter_linear,repeat_disable;
uniform sampler2D grass_detail : source_color,filter_linear_mipmap_anisotropic,repeat_enable;
uniform vec2 grass_extent=vec2(356.0,222.5);
"""

const FUNCTIONS := """
vec4 grass_fibres(vec2 world) {
	vec4 a=texture(grass_detail,world*0.45);
	vec2 rotated=vec2(world.x*0.8+world.y*0.6,-world.x*0.6+world.y*0.8);
	vec4 b=texture(grass_detail,rotated*0.29+vec2(0.37,0.61));
	return mix(a,b,0.32);
}
vec3 grass_ground(vec2 world,vec3 original) {
	if(grass_on<0.5) {return original;}
	vec3 fibres=grass_fibres(world).rgb*tint.rgb;
	float macro=clamp(dot(original,vec3(0.3,0.59,0.11))/0.15,0.65,1.18);
	float patch=mix(0.88,1.12,silt_grain(world*0.24));
	return fibres*macro*patch;
}
"""

const FRAGMENT := """
	float grass_relief=0.0;
	if(surface_kind==1 && grass_on>0.5 && river_water<0.5) {
		float cover=texture(grass_cover,wpos.xz/grass_extent).r;
		c.rgb=mix(c.rgb,grass_ground(wpos.xz,c.rgb),cover*0.93);
		grass_relief=grass_fibres(wpos.xz).a*0.012*cover*(1.0-snow);
	}
"""

const FINISH := """
	if(surface_kind==1 && grass_on>0.5) {
		float height=grass_relief*(1.0-road_cover);
		vec3 dx=dFdx(VERTEX),dy=dFdy(VERTEX);
		vec3 r1=cross(dy,NORMAL),r2=cross(NORMAL,dx);
		float det=dot(dx,r1);
		vec3 gradient=sign(det)*(dFdx(height)*r1+dFdy(height)*r2);
		NORMAL=normalize(max(abs(det),0.000001)*NORMAL-gradient*0.55);
	}
"""


static func configure(material: ShaderMaterial) -> void:
	var cover: Texture2D = load(COVER)
	material.set_shader_parameter("grass_cover",cover)
	material.set_shader_parameter("grass_detail",load(DETAIL))
	material.set_shader_parameter("grass_extent",Vector2(cover.get_size())*MASK_CELL)
	material.set_shader_parameter("grass_on",1.0)
