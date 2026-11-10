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

## The meadow's variety, shared by the ground and the blades (grass_3d.gd)
## so the two agree: broad patches of dry, straw-coloured grass and of deep
## lush green, and patches in bloom with poppies, buttercups, daisies and
## cornflowers. World metres in, no textures: light enough for a phone.
const MEADOW := """
float meadow_hash(vec2 p) {return fract(sin(dot(p,vec2(41.3,289.1)))*15731.743);}
float meadow_noise(vec2 p) {
	vec2 i=floor(p),f=fract(p);
	f=f*f*(3.0-2.0*f);
	float a=meadow_hash(i),b=meadow_hash(i+vec2(1,0)),c=meadow_hash(i+vec2(0,1)),d=meadow_hash(i+vec2(1,1));
	return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);
}
// x dry, y lush, z in bloom (each 0..1).
vec3 meadow(vec2 w) {
	float big=meadow_noise(w*0.017)*0.7+meadow_noise(w*0.061+vec2(13.1,7.7))*0.3;
	return vec3(smoothstep(0.56,0.78,big),smoothstep(0.56,0.78,1.0-big),
		smoothstep(0.62,0.82,meadow_noise(w*0.045+vec2(71.3,19.9))));
}
vec3 meadow_tint(vec2 w,vec3 c) {
	vec3 m=meadow(w);
	c=mix(c,c*vec3(1.22,1.10,0.66),m.x*0.75);
	return mix(c,c*vec3(0.82,0.98,0.80),m.y*0.7);
}
// A patch's flower: red poppies, yellow buttercups, white daisies or blue
// cornflowers, one kind to a patch.
vec3 meadow_flower(vec2 w) {
	float kind=meadow_hash(floor(w*0.045+vec2(71.3,19.9)));
	return kind<0.3?vec3(0.72,0.1,0.06):(kind<0.6?vec3(0.86,0.74,0.12):(kind<0.85?vec3(0.88,0.88,0.82):vec3(0.28,0.38,0.82)));
}
"""

const FUNCTIONS := MEADOW + """
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
	vec3 c=meadow_tint(world,fibres*macro*patch);
	// Flowers in the grass: a speck here and there where a patch blooms.
	vec2 cell=floor(world*5.0);
	float speck=step(0.955,meadow_hash(cell))*meadow(world).z;
	return mix(c,meadow_flower(world),speck*0.85);
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
