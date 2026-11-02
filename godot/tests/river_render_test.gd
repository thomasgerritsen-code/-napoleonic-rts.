extends SceneTree
## A genuine v70 reference and the new river, at the same camera/hour/pose.
## Use a real renderer: shader properties alone cannot prove water is visible.

const PreviousRiver = preload("res://tests/fixtures/river_v70.gd")
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
	var centre: Vector2 = Nav.bridges()[0]["centre"]+Vector2(0,-80)
	view.view(centre,-28.0,42.0,28.0)
	var river := view.atmosphere.water
	var material := river.material_override as ShaderMaterial
	material.set_shader_parameter("now",36.0)
	material.set_shader_parameter("fog_on",0.0)
	var arrays := river.mesh.surface_get_arrays(0)
	check(river.mesh.get_surface_count()==1 and arrays[Mesh.ARRAY_VERTEX].size()==Nav._points.size()*2,
		"the river keeps one mesh, one surface and two vertices per map point")
	var follows := true
	var last := -1.0
	for i in Nav._points.size():
		var uv: Vector2 = arrays[Mesh.ARRAY_TEX_UV][i*2]
		var colour: Color = arrays[Mesh.ARRAY_COLOR][i*2]
		var along := Vector2(colour.r,colour.g)*2.0-Vector2.ONE
		# Mesh vertex colours are quantised to 8-bit components.
		follows = follows and uv.y>=last and absf(along.length()-1.0)<0.01
		last = uv.y
	check(follows,"the continuous flow coordinates follow every river bend")
	check(arrays[Mesh.ARRAY_NORMAL][0].y>0.5,"water triangles face upwards")
	var authoritative := JSON.stringify(NetSync.capture(battle))
	var previous := PreviousRiver.make(battle)
	var previous_ground := Shader.new()
	previous_ground.code = PreviousRiver.GROUND_SHADER
	var grounds := []
	for child in view.get_children():
		if child is MeshInstance3D and child.material_override is ShaderMaterial \
			and child.material_override.get_shader_parameter("surface_kind")==1:
			grounds.append([child,child.material_override])
			var material_copy: ShaderMaterial = child.material_override.duplicate()
			material_copy.shader = previous_ground
			child.material_override = material_copy
	var old_material := previous.material_override as ShaderMaterial
	old_material.set_shader_parameter("now",36.0)
	old_material.set_shader_parameter("fog_on",0.0)
	view.atmosphere.add_child(previous)
	river.visible = false
	var before := await frame()
	save(before,"river_before.png")
	previous.visible = false
	for ground: Array in grounds:
		ground[0].material_override = ground[1]
	river.visible = true
	var after := await frame()
	save(after,"river_after.png")
	await comparison(before,after)
	var changed := differences(before,after,0.035)
	check(changed>500,"the new river actually changes visible water pixels (%d)" % changed)
	material.set_shader_parameter("now",38.0)
	var moving := await frame()
	changed = differences(after,moving,0.008)
	check(changed>50,"surface flow animates without moving terrain or bridges (%d pixels)" % changed)
	# Unseen water must still darken through the existing fog texture path.
	var fog := Image.create(2,2,false,Image.FORMAT_RGBA8)
	fog.fill(Color(0,0,0,1))
	material.set_shader_parameter("fog_tex",ImageTexture.create_from_image(fog))
	material.set_shader_parameter("fog_on",1.0)
	var hidden := await frame()
	changed = differences(moving,hidden,0.02)
	check(changed>100,"fog of war still conceals the water (%d pixels)" % changed)
	check(JSON.stringify(NetSync.capture(battle))==authoritative,"river rendering leaves the entire authoritative battle unchanged")
	check(view.atmosphere.stats()["batches"]==4,"weather and river retain the four existing GPU batches")
	print("GODOT_RIVER ",JSON.stringify({"failures":failures,"vertices":arrays[Mesh.ARRAY_VERTEX].size()}))
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


func save(image: Image,name_: String) -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out != "":
		image.save_png(out.path_join(name_))
		print("saved ",name_)


func comparison(before: Image,after: Image) -> void:
	if OS.get_environment("SHOT_DIR") == "":
		return
	# Lay out the two unaltered captures as a small UI figure, with captions.
	var viewport := SubViewport.new()
	viewport.size = Vector2i(1440,490)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var background := ColorRect.new()
	background.color = Color(0.075,0.085,0.07)
	background.size = Vector2(1440,490)
	viewport.add_child(background)
	for i in 2:
		var label := Label.new()
		label.text = "VOOR · PC-VERSIE 70" if i==0 else "NA · NATUURLIJKER WATER"
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
	save(viewport.get_texture().get_image(),"river_comparison.png")
	viewport.queue_free()
	await process_frame


func differences(a: Image,b: Image,threshold: float) -> int:
	var count := 0
	# Exclude HUD and minimap; all simulation, poses and shader time are frozen.
	for y in range(160,a.get_height()-160,2):
		for x in range(80,a.get_width()-260,2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			if absf(ca.r-cb.r)+absf(ca.g-cb.g)+absf(ca.b-cb.b)>threshold:
				count += 1
	return count
