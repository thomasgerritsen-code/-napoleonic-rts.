extends SceneTree
## Native detail meshes against the actual v75 assets, at identical placement.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func model_mesh(path: String) -> Mesh:
	var scene: PackedScene = load(path)
	var model := scene.instantiate()
	var meshes := model.find_children("*","MeshInstance3D",true,false)
	check(meshes.size()==1,path.get_file()+" retains one combined mesh")
	var mesh: Mesh = meshes[0].mesh
	model.free()
	return mesh


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
	var old := {}
	var bytes := 0
	var triangles := 0
	for name_: String in View3D.DETAILED_HOUSES:
		var old_mesh := model_mesh(View3D.MODELS % name_)
		old[name_] = old_mesh
		var fresh := view._mesh_of(name_)
		var a := old_mesh.get_aabb()
		var b := fresh.get_aabb()
		check(absf(a.position.x-b.position.x)<0.005 and absf(a.position.z-b.position.z)<0.005
			and absf(a.size.x-b.size.x)<0.005 and absf(a.size.z-b.size.z)<0.005,
			name_+" preserves the original placement scale and footprint")
		check(view.building_ground.footprint(old_mesh).is_equal_approx(view.building_ground.footprint(fresh)),
			name_+" retains its full supported foundation footprint")
		var mat: StandardMaterial3D = fresh.surface_get_material(0)
		check(fresh.get_surface_count()==1 and mat.albedo_texture.get_width()==1024,
			name_+" uses one 1024px baked material for all facade details")
		var count: int = fresh.surface_get_array_index_len(0)/3
		check(count<8000 and count>old_mesh.surface_get_array_index_len(0)/3,
			name_+" adds real geometric detail within an 8000-triangle limit (%d)" % count)
		triangles += count
		bytes += FileAccess.get_file_as_bytes("res://assets3d/houses/%s.glb" % name_).size()
	check(bytes<8*1024*1024,"all five detailed houses stay below an 8MiB download budget (%d bytes)" % bytes)
	var authority := JSON.stringify(NetSync.capture(battle))
	# Compare the whole actual village: same MultiMeshes, transforms, shader,
	# foundations, road, sun and frozen time. Only mesh+its atlas change.
	view.view(Vector2(1820,950),-28.0,34.0,23.0)
	var swaps := []
	for child in view.get_children():
		if child is MultiMeshInstance3D:
			for name_: String in View3D.DETAILED_HOUSES:
				if child.multimesh.mesh==view._mesh_of(name_):
					swaps.append([child,child.multimesh.mesh,child.material_override])
					child.multimesh.mesh = old[name_]
					var mat: StandardMaterial3D = old[name_].surface_get_material(0)
					child.material_override = view.field.fogged(mat.albedo_texture,mat.albedo_color)
	check(swaps.size()==5,"the comparison restores all five actual v75 village meshes and their baked textures")
	var before := await frame()
	save(before,"houses_before.png")
	for swap: Array in swaps:
		swap[0].multimesh.mesh = swap[1]
		swap[0].material_override = swap[2]
	var after := await frame()
	save(after,"houses_after.png")
	await comparison(before,after)
	check(differences(before,after,0.035)>500,"the new facade and roof details visibly change the rendered village")
	check(JSON.stringify(NetSync.capture(battle))==authority,"detailing houses leaves the entire authoritative battle unchanged")
	# Existing material handling still reveals construction, hides unseen
	# houses and illuminates blue window panes after dark.
	var new_mesh := view._mesh_of("farmhouse")
	var source: StandardMaterial3D = new_mesh.surface_get_material(0)
	var pixels := source.albedo_texture.get_image()
	var glass := 0
	for y in range(0,pixels.get_height(),2):
		for x in range(0,pixels.get_width(),2):
			var c := pixels.get_pixel(x,y).srgb_to_linear()
			if c.g>c.r*1.6 and c.b>c.r*1.3 and c.b<c.g*1.6 and maxf(c.r,maxf(c.g,c.b))<0.18:
				glass += 1
	check(glass>50,"the detailed farmhouse retains blue window pixels for the existing night lighting (%d)" % glass)
	print("GODOT_HOUSES ",JSON.stringify({"failures":failures,"bytes":bytes,"triangles":triangles,"batches":swaps.size()}))
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
		label.text = "VOOR · PC-VERSIE 75" if i==0 else "NA · GEDETAILLEERDE HUIZEN"
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
	save(viewport.get_texture().get_image(),"houses_comparison.png")
	viewport.queue_free()
	await process_frame
