extends SceneTree
## Actual v74 terrain toggled against the new single-pass roads at one camera.
## Verifies all road corridors, bridge approaches, authority, fog and rain.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func sample(image: Image,world: Vector2) -> Color:
	var p := world/Iso.PPM/RoadSurface3D.CELL-Vector2.ONE*0.5
	var x := clampi(roundi(p.x),0,image.get_width()-1)
	var y := clampi(roundi(p.y),0,image.get_height()-1)
	return image.get_pixel(x,y)


func round_road(source: Array) -> Array[Vector2]:
	var points: Array[Vector2] = []
	for p: Array in source:
		points.append(Vector2(p[0],p[1]))
	for pass_ in 2:
		var next: Array[Vector2] = [points[0]]
		for i in points.size()-1:
			next.append(points[i].lerp(points[i+1],0.25))
			next.append(points[i].lerp(points[i+1],0.75))
		next.append(points[-1])
		points = next
	return points


func _initialize() -> void:
	Battle.online_role = ""
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.process_mode = Node.PROCESS_MODE_DISABLED
	Engine.time_scale = 0.0
	battle.clock = 100.0
	battle.weather.raining = false
	battle.weather.wetness = 0.0
	battle.fog.enabled = false
	battle.fog.refresh()
	var view := battle.view3d
	view.atmosphere.refresh()
	view.atmosphere.cloud = 0.0
	view.field._process(1.0)
	view._light()
	for child in battle.get_children():
		if child is Hud:
			child._process(0.0)
	var ground: MeshInstance3D
	var ground_count := 0
	for child in view.get_children():
		if child is MeshInstance3D and child.material_override is ShaderMaterial \
			and child.material_override.get_shader_parameter("roads_on")==1.0:
			ground = child
			ground_count += 1
	check(ground_count==1 and ground.mesh.get_surface_count()==1,"the roads use only the existing single terrain surface")
	var material := ground.material_override as ShaderMaterial
	var image: Image = (material.get_shader_parameter("road_field") as Texture2D).get_image()
	check(image.get_width()==1423 and image.get_height()==889 and image.get_format()==Image.FORMAT_RGBA8,
		"the complete road network uses one bounded 5MB RGBA8 distance map")
	var tile: Image = (material.get_shader_parameter("road_detail") as Texture2D).get_image()
	check(tile.has_mipmaps() and not image.has_mipmaps(),"the repeating detail filters at distance while the packed distances retain their precision")
	var roads: Array = Iso.read_json("res://assets/map/gamemap.json")["roads"]
	var covered := 0
	for road: Dictionary in roads:
		var continuous := true
		var points := round_road(road["points"])
		for i in points.size()-1:
			for t in 4:
				var pixel := sample(image,points[i].lerp(points[i+1],t/3.0))
				var signed_distance := ((pixel.r if road["cls"]=="chaussee" else pixel.g)-0.5)*8.0
				continuous = continuous and signed_distance < -0.22
		if continuous:
			covered += 1
	check(covered==18,"all 18 original road corridors remain continuous through their rounded bends")
	var joins := 0
	for b: Dictionary in Nav.bridges():
		var on_road := true
		for p: Vector2 in [b["west"],b["east"],b["centre"]]:
			var pixel := sample(image,p)
			on_road = on_road and minf(pixel.r,pixel.g)<0.53
		if on_road:
			joins += 1
	check(joins==5,"the roads still meet all five original bridge approaches")
	var authority := JSON.stringify(NetSync.capture(battle))
	var geometry := ground.mesh.get_instance_id()
	view.view(Vector2(1870,900),-28.0,46.0,34.0)
	material.set_shader_parameter("roads_on",0.0)
	var before := await frame()
	save(before,"roads_before.png")
	material.set_shader_parameter("roads_on",1.0)
	var after := await frame()
	save(after,"roads_after.png")
	await comparison(before,after)
	var changed := differences(before,after,0.025)
	check(changed>500,"road detail and verges visibly improve the real scene (%d pixels)" % changed)
	material.set_shader_parameter("wetness",1.0)
	var rain := await frame()
	save(rain,"roads_rain.png")
	check(differences(after,rain,0.025)>500,"rain visibly darkens road surfaces and fills their low patches")
	material.set_shader_parameter("snow",1.0)
	var winter := await frame()
	save(winter,"roads_winter.png")
	check(differences(rain,winter,0.04)>500,"snow still settles across the detailed road material")
	material.set_shader_parameter("snow",0.0)
	material.set_shader_parameter("wetness",0.0)
	var hidden := Image.create(2,2,false,Image.FORMAT_RGBA8)
	hidden.fill(Color(0,0,0,1))
	material.set_shader_parameter("fog_tex",ImageTexture.create_from_image(hidden))
	material.set_shader_parameter("fog_on",1.0)
	check(differences(after,await frame(),0.025)>500,"fog of war still conceals the detailed roads")
	check(ground.mesh.get_instance_id()==geometry and JSON.stringify(NetSync.capture(battle))==authority,
		"road graphics leave terrain geometry and the entire authoritative battle unchanged")
	check(view.atmosphere.stats()["batches"]==4,"roads add no weather batches or extra overlay draws")
	print("GODOT_ROADS ",JSON.stringify({"failures":failures,"roads":covered,"bridge_approaches":joins,
		"field_bytes":image.get_data_size(),"terrain_vertices":view.field.banks.ground_vertices}))
	Engine.time_scale = 1.0
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func frame() -> Image:
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()


func save(image: Image,file: String) -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out!="":
		image.save_png(out.path_join(file))


func differences(a: Image,b: Image,threshold: float) -> int:
	var changed := 0
	for y in range(160,a.get_height()-150,2):
		for x in range(80,a.get_width()-260,2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			if absf(ca.r-cb.r)+absf(ca.g-cb.g)+absf(ca.b-cb.b)>threshold:
				changed += 1
	return changed


func comparison(before: Image,after: Image) -> void:
	if OS.get_environment("SHOT_DIR")=="":
		return
	var viewport := SubViewport.new()
	viewport.size = Vector2i(1440,490)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var background := ColorRect.new()
	background.color = Color(0.075,0.085,0.07)
	background.size = Vector2(1440,490)
	viewport.add_child(background)
	for i in 2:
		var label := Label.new()
		label.text = "VOOR · PC-VERSIE 74" if i==0 else "NA · BESTRATING EN NATUURLIJKE BERMEN"
		label.position = Vector2(12+i*714,8)
		label.add_theme_font_size_override("font_size",19)
		viewport.add_child(label)
		var picture := TextureRect.new()
		picture.texture = ImageTexture.create_from_image(before if i==0 else after)
		picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		picture.position = Vector2(12+i*714,42)
		picture.size = Vector2(702,432)
		viewport.add_child(picture)
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	save(viewport.get_texture().get_image(),"roads_comparison.png")
	viewport.queue_free()
	await process_frame
