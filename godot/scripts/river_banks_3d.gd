class_name RiverBanks3D
extends RefCounted
## One shared channel profile for terrain, water and bank materials. Only
## unwalkable river ground is lowered; roads, bridges and authority stay put.

const SAMPLES := 513
const STEP := 45.0
const SUBDIVISIONS := 4
## A grass-only 64px patch of the existing map atlas; no new texture asset.
const GRASS_PATCH := Rect2i(1104,720,64,64)
var profile: ImageTexture
var rows := PackedVector4Array() # centre x, water y, left/right water widths
var ground_vertices := 0
var ground_triangles := 0


func _init() -> void:
	var image := Image.create(SAMPLES,1,false,Image.FORMAT_RGBAF)
	var half := Nav._width/(2.0*Iso.PPM)
	for i in SAMPLES:
		var y := float(i)/(SAMPLES-1)*Iso.WORLD.y/Iso.PPM
		var x := Nav.river_x(y*Iso.PPM)/Iso.PPM
		var centre := Vector2(x,y)*Iso.PPM
		var rim := minf(base_height(centre+Vector2(half*Iso.PPM,0)),base_height(centre-Vector2(half*Iso.PPM,0)))
		var level := minf(base_height(centre)-0.12,rim-0.04)
		var left := half*0.78*(0.93+0.08*sin(y*0.43)+0.04*sin(y*1.1))
		var right := half*0.78*(0.98+0.08*sin(y*0.31+2.0)+0.04*sin(y*0.87))
		rows.append(Vector4(x,level,left,right))
		image.set_pixel(i,0,Color(x,level,left,right))
	profile = ImageTexture.create_from_image(image)


func sample(y_m: float) -> Vector4:
	var pos := clampf(y_m/(Iso.WORLD.y/Iso.PPM),0.0,1.0)*(SAMPLES-1)
	var index := mini(floori(pos),SAMPLES-2)
	return rows[index].lerp(rows[index+1],pos-index)


## Match the old 45px terrain triangles exactly away from the river.
static func base_height(world: Vector2) -> float:
	var origin := Vector2(floorf(world.x/STEP),floorf(world.y/STEP))*STEP
	var f := (world-origin)/STEP
	var tl := Iso.height_px(origin)/Iso.PPM
	var tr := Iso.height_px(origin+Vector2(STEP,0))/Iso.PPM
	var bl := Iso.height_px(origin+Vector2(0,STEP))/Iso.PPM
	var br := Iso.height_px(origin+Vector2(STEP,STEP))/Iso.PPM
	return tl+(tr-tl)*f.x+(bl-tl)*f.y if f.x+f.y<=1.0 else br+(bl-br)*(1.0-f.x)+(tr-br)*(1.0-f.y)


func height_at(world: Vector2) -> float:
	var original := base_height(world)
	var p := sample(world.y/Iso.PPM)
	var distance := absf(world.x/Iso.PPM-p.x)
	var rim := Nav._width/(2.0*Iso.PPM)+0.24
	if distance>=rim or absf(world.x-Nav.river_x(world.y))>=Nav._width*0.5+5.4:
		return original
	var width := p.z if world.x/Iso.PPM<p.x else p.w
	if distance<width:
		return p.y-0.45*(1.0-pow(distance/width,2.0))
	return lerpf(p.y,original,smoothstep(width,rim,distance))


func configure(material: ShaderMaterial,texture: Texture2D = null) -> void:
	material.set_shader_parameter("bank_on",1.0)
	material.set_shader_parameter("bank_profile",profile)
	material.set_shader_parameter("bank_lookup",Vector2(float(SAMPLES-1)/SAMPLES,0.5/SAMPLES))
	material.set_shader_parameter("bank_rim",Nav._width/(2.0*Iso.PPM)+0.24)
	if texture != null:
		var size := Vector2(texture.get_size())
		material.set_shader_parameter("bank_grass_rect",Vector4(GRASS_PATCH.position.x/size.x,GRASS_PATCH.position.y/size.y,GRASS_PATCH.size.x/size.x,GRASS_PATCH.size.y/size.y))
	var widths := Vector4.ZERO
	for i in 5:
		var b: Dictionary = Nav.bridges()[i]
		var centre: Vector2 = b["centre"]/Iso.PPM
		var across: Vector2 = (b["east"]-b["west"]).normalized().orthogonal()
		material.set_shader_parameter("bank_bridge%d" % i,Vector4(centre.x,centre.y,across.x,across.y))
		if i<4:
			widths[i] = float(b["width"])/(2.0*Iso.PPM)
		else:
			material.set_shader_parameter("bank_bridge_width4",float(b["width"])/(2.0*Iso.PPM))
	material.set_shader_parameter("bank_bridge_widths",widths)


func ground_mesh(meta: Dictionary,texture: Texture2D) -> ArrayMesh:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	var k := float(meta["pxPerM"])/float(meta["gamePxPerM"])
	var pad := float(meta["padTop"])
	var vertices := {}
	for row in int(Iso.WORLD.y/STEP):
		var y := row*STEP
		var x0 := minf(Nav.river_x(y),minf(Nav.river_x(y+STEP*0.5),Nav.river_x(y+STEP)))
		var x1 := maxf(Nav.river_x(y),maxf(Nav.river_x(y+STEP*0.5),Nav.river_x(y+STEP)))
		for col in int(Iso.WORLD.x/STEP):
			var x := col*STEP
			# Fine cells only near the channel. Coarse seams retain the original
			# planar height, so their extra edge vertices cannot open cracks.
			var parts := SUBDIVISIONS if x+STEP>x0-100.0 and x<x1+100.0 else 1
			var size := STEP/parts
			for r in parts:
				for c in parts:
					var at := Vector2(x+c*size,y+r*size)
					for offset: Vector2 in [Vector2.ZERO,Vector2(size,0),Vector2(0,size),Vector2(size,0),Vector2(size,size),Vector2(0,size)]:
						var world := at+offset
						if not vertices.has(world):
							vertices[world] = vertices.size()
							var screen := Iso.to_screen(world)
							surface.set_uv(Vector2(screen.x*k/texture.get_width(),(pad+screen.y*k)/texture.get_height()))
							surface.add_vertex(Vector3(world.x/Iso.PPM,height_at(world),world.y/Iso.PPM))
						surface.add_index(vertices[world])
	surface.generate_normals()
	var mesh := surface.commit()
	ground_vertices = mesh.surface_get_array_len(0)
	ground_triangles = mesh.surface_get_array_index_len(0)/3
	return mesh
