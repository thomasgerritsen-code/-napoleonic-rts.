extends SceneTree
## Actual v77 ground, new fibres and real blades, plus GPU exclusion probes.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


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
	view.view(Vector2(2060,1150),-28.0,32.0,20.0)
	var grass := view.grass
	grass._process(1.0)
	var mm := grass.batch.multimesh
	check(mm.instance_count==5184 and grass.get_child_count()==1,
		"the complete close grass uses one fixed 5184-clump GPU batch")
	check(mm.mesh.get_surface_count()==1 and mm.mesh.surface_get_array_index_len(0)==54
		and mm.mesh.surface_get_array_len(0)<=36 and mm.mesh.get_aabb().size.y>0.14,
		"the shared clump has six real tapered bent blades within an 18-triangle budget")
	var fibre: Image = (load(GrassSurface3D.DETAIL) as Texture2D).get_image()
	check(fibre.get_width()==512 and fibre.has_mipmaps() and grass.cover.get_width()==712,
		"grass uses a bounded 512px mipmapped detail tile and a 0.5m cover mask")
	var buffer := hash(mm.buffer)
	var rebuilt := grass.mask_rebuilds
	view.view(Vector2(2090,1160),-28.0,32.0,20.0)
	grass._process(0.1)
	check(hash(mm.buffer)==buffer and grass.mask_rebuilds==rebuilt,
		"moving the camera reuses the entire instance buffer and occupancy mask")
	view.view(Vector2(2060,1150),-28.0,32.0,20.0)
	grass._process(0.1)
	seed(7801)
	var expected := randi()
	seed(7801)
	grass.refresh()
	grass._process(0.1)
	check(randi()==expected,"grass rendering leaves simulation randomness untouched")
	var authority := JSON.stringify(NetSync.capture(battle))
	var ground: ShaderMaterial
	for child in view.get_children():
		if child is MeshInstance3D and child.material_override is ShaderMaterial \
			and child.material_override.get_shader_parameter("grass_on")==1.0:
			ground = child.material_override
	ground.set_shader_parameter("grass_on",0.0)
	grass.batch.visible = false
	var before := await frame()
	save(before,"grass_before.png")
	ground.set_shader_parameter("grass_on",1.0)
	var fibres := await frame()
	save(fibres,"grass_ground.png")
	check(differences(before,fibres,0.025)>1000,"fine grass fibres visibly replace the stretched terrain picture")
	grass.batch.visible = true
	grass.material.set_shader_parameter("now",36.0)
	var after := await frame()
	save(after,"grass_after.png")
	await comparison(before,after)
	check(differences(fibres,after,0.015)>100,"actual 3D blades visibly stand above the textured ground")
	grass.material.set_shader_parameter("now",38.0)
	check(differences(after,await frame(),0.01)>50,"wind moves real blades while the authoritative battle is frozen")
	check(JSON.stringify(NetSync.capture(battle))==authority,"grass detail leaves the entire authoritative battle unchanged")
	# An isolated top-down viewport uses the real shared grass shader/buffer
	# at real map coordinates. No houses/ground can conceal incorrectly placed
	# blades; a forbidden patch must be empty because the GPU rejects it.
	var probe := await make_probe(grass)
	var field := Vector2(2100,1180)
	var clear := await probe_at(probe,field,2.0)
	check(energy(clear)>1.0,"the real GPU blades render on an open grass patch")
	check(energy(await probe_at(probe,Vector2(2200,895),1.2))<0.01,
		"the GPU keeps the paved road completely free of blades")
	check(energy(await probe_at(probe,Vector2(Nav.river_x(2540),2540),1.0))<0.01,
		"the GPU keeps river water and bridge decks free of blades")
	var village: Dictionary = view.building_ground.villages[0]
	check(energy(await probe_at(probe,View3D.flat(village["transform"].origin),1.0))<0.01,
		"the GPU keeps the original village foundation free of blades")
	var pm: ShaderMaterial = probe["material"]
	var fog := Image.create(2,2,false,Image.FORMAT_RGBA8)
	fog.fill(Color(0,0,0,1))
	pm.set_shader_parameter("fog_tex",ImageTexture.create_from_image(fog))
	pm.set_shader_parameter("fog_on",1.0)
	check(energy(await probe_at(probe,field,2.0))<energy(clear)*0.3,"fog of war darkens blades along with the terrain")
	pm.set_shader_parameter("fog_on",0.0)
	var house := battle.add_building("france","house",field,false)
	house.visible = true
	view._sync_buildings()
	grass.refresh()
	check(energy(await probe_at(probe,field,1.0))<0.01,"placing a house removes grass from its real model footprint")
	house.visible = false
	view._sync_buildings()
	grass.refresh()
	check(energy(await probe_at(probe,field,2.0))>1.0,"hidden buildings do not leave revealing bald patches")
	house.queue_free()
	await process_frame
	grass.refresh()
	check(true,"occupancy safely skips a removed building before the next model sync")
	var trench := {"id":78001,"centre":field,"facing":0.0,"length":110.0,"width":40.0,"progress":1.0,"level":1}
	battle.trenches.list.append(trench)
	grass.refresh()
	check(energy(await probe_at(probe,field,1.0))<0.01,"the GPU keeps dug trench beds and earth banks clear")
	battle.trenches.list.erase(trench)
	battle.trenches.craters.append({"world":field})
	grass.refresh()
	check(energy(await probe_at(probe,field,0.6))<0.01,"new shell craters stay bare instead of sprouting blades")
	battle.trenches.craters.clear()
	grass.refresh()
	# The mesh ends on complete 45px cells, before the logical map edge.
	# Force otherwise valid grass so this probe tests actual GPU bounds,
	# independently of cover/road mask accidents on the last map strip.
	var white := Image.create(2,2,false,Image.FORMAT_RGBA8)
	white.fill(Color.WHITE)
	var black := Image.create(2,2,false,Image.FORMAT_RGBA8)
	black.fill(Color.BLACK)
	pm.set_shader_parameter("cover_tex",ImageTexture.create_from_image(white))
	pm.set_shader_parameter("blocked_tex",ImageTexture.create_from_image(black))
	pm.set_shader_parameter("road_field",ImageTexture.create_from_image(white))
	var extent: Vector2 = grass.material.get_shader_parameter("terrain_extent")
	var edge := Vector2((extent.x+0.78)*Iso.PPM,1200.0)
	pm.set_shader_parameter("terrain_extent",Iso.WORLD/Iso.PPM)
	var floating := energy(await probe_at(probe,edge,1.0))
	pm.set_shader_parameter("terrain_extent",extent)
	check(floating>1.0 and energy(await probe_at(probe,edge,1.0))<0.01,
		"the GPU clips blades to actual terrain triangles rather than floating past the last mesh cell")
	pm.set_shader_parameter("snow",1.0)
	check(energy(await probe_at(probe,field,2.0))<0.01,"winter snow buries the grass geometry in the actual GPU shader")
	view.view(field,0.0,45.0,130.0)
	grass._process(1.0)
	check(not grass.batch.visible and float(grass.material.get_shader_parameter("lod"))==0.0,
		"far zoom stops drawing blade geometry and retains filtered ground detail")
	probe["viewport"].queue_free()
	await process_frame
	print("GODOT_GRASS ",JSON.stringify({"failures":failures,"stats":grass.stats()}))
	Engine.time_scale = 1.0
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func make_probe(grass: Grass3D) -> Dictionary:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(192,192)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var env := WorldEnvironment.new()
	env.environment = Environment.new()
	env.environment.background_mode = Environment.BG_COLOR
	env.environment.background_color = Color.BLACK
	env.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	env.environment.ambient_light_color = Color.WHITE
	env.environment.ambient_light_energy = 1.0
	viewport.add_child(env)
	var node := MultiMeshInstance3D.new()
	node.multimesh = grass.batch.multimesh
	var material: ShaderMaterial = grass.material.duplicate()
	node.material_override = material
	material.set_shader_parameter("lod",1.0)
	viewport.add_child(node)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	viewport.add_child(camera)
	camera.make_current()
	return {"viewport":viewport,"camera":camera,"material":material}


func probe_at(probe: Dictionary,world: Vector2,size: float) -> Image:
	var at := View3D.at(world)
	var camera: Camera3D = probe["camera"]
	camera.size = size
	camera.position = at+Vector3.UP*15.0
	camera.look_at(at,Vector3.FORWARD)
	probe["material"].set_shader_parameter("centre",at)
	for i in 2:
		await process_frame
	await RenderingServer.frame_post_draw
	return probe["viewport"].get_texture().get_image()


func energy(image: Image) -> float:
	var value := 0.0
	for y in range(0,image.get_height(),2):
		for x in range(0,image.get_width(),2):
			var c := image.get_pixel(x,y)
			value += c.r+c.g+c.b
	return value


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
	var n := 0
	for y in range(160,a.get_height()-150,2):
		for x in range(80,a.get_width()-260,2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			if absf(ca.r-cb.r)+absf(ca.g-cb.g)+absf(ca.b-cb.b)>threshold:
				n += 1
	return n


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
		label.text = "VOOR · PC-VERSIE 77" if i==0 else "NA · BODEMSTRUCTUUR EN GRASSPRIETEN"
		label.position = Vector2(12+i*714,8)
		label.add_theme_font_size_override("font_size",20)
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
	save(viewport.get_texture().get_image(),"grass_comparison.png")
	viewport.queue_free()
	await process_frame
