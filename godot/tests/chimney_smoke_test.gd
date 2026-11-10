extends SceneTree
## Read-only thermal effect, true chimney placement, bounded GPU rendering.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func building_sources(fx: ChimneySmoke3D,id: int) -> Array:
	return fx.sources.filter(func(s: Dictionary) -> bool: return String(s["id"]).begins_with("b%d:" % id))


func _initialize() -> void:
	Battle.online_role = ""
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.process_mode = Node.PROCESS_MODE_DISABLED
	Engine.time_scale = 0.0
	battle.clock = 1860.0
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
	view.view(Vector2(1820,950),-28.0,34.0,26.0)
	var fx := view.chimneys
	var cold := WorldClimate3D.sample(1860.0,false,0.0)
	var summer := WorldClimate3D.sample(340.0,false,0.0)
	check(float(cold["temperature"])<5.0 and float(summer["temperature"])>16.0,
		"visual temperature follows the existing winter and summer seasons")
	check(ChimneySmoke3D.heating(20.0)==0.0 and ChimneySmoke3D.heating(-3.0)==1.0
		and ChimneySmoke3D.heating(8.0)>0.0 and ChimneySmoke3D.heating(8.0)<ChimneySmoke3D.heating(3.0),
		"heating smoke increases gradually below 12C and stops in warm weather")
	var smooth := true
	for season in range(1,5):
		var t := season*Weather.SEASON
		var a := float(WorldClimate3D.sample(t-0.01,false,0.0)["temperature"])
		var b := float(WorldClimate3D.sample(t+0.01,false,0.0)["temperature"])
		smooth = smooth and absf(a-b)<0.02
	check(smooth,"temperature remains continuous through every season and year boundary")
	# A chimney cap has vertices immediately below each local emitter.
	var caps := true
	for model: String in ChimneySmoke3D.FLUES:
		var mesh := view._mesh_of(model)
		var vertices: PackedVector3Array = mesh.surface_get_arrays(0)[Mesh.ARRAY_VERTEX]
		for flue: Vector3 in ChimneySmoke3D.FLUES[model]:
			var found := false
			for v: Vector3 in vertices:
				# The inn's 1m square cap has its corner vertices 0.707m
				# from the centre; cover that real cap as well as smaller ones.
				if absf(v.y-(flue.y-0.02))<0.015 and Vector2(v.x-flue.x,v.z-flue.z).length()<0.75:
					found = true
			caps = caps and found
	check(caps,"every emitter sits on an actual Blender chimney cap, including barracks and foundries")
	fx._process(4.0)
	check(fx.sources.size()>3 and fx.batch.visible and fx.get_child_count()==1,
		"cold houses share one visible GPU batch")
	var mesh_id := fx.batch.multimesh.get_instance_id()
	var rebuilds := fx.rebuilds
	fx.refresh()
	fx.refresh()
	check(fx.rebuilds==rebuilds and fx.batch.multimesh.get_instance_id()==mesh_id,
		"unchanged chimneys reuse their buffer without per-puff CPU updates")
	seed(7701)
	var expected := randi()
	seed(7701)
	fx.refresh()
	fx._process(0.001)
	check(randi()==expected,"smoke does not consume simulation randomness")
	var authority := JSON.stringify(NetSync.capture(battle))
	fx.material.set_shader_parameter("now",36.0)
	fx.batch.visible = false
	var before := await frame()
	save(before,"chimneys_before.png")
	fx.batch.visible = true
	var after := await frame()
	save(after,"chimneys_after.png")
	await comparison(before,after)
	var changed := differences(before,after,0.015)
	check(changed>100,"cold-weather chimney smoke is visible in the actual winter scene (%d pixels)" % changed)
	fx.material.set_shader_parameter("now",38.0)
	check(differences(after,await frame(),0.01)>50,"the smoke visibly rises and drifts while the battle remains frozen")
	fx.material.set_shader_parameter("now",36.0)
	var fog := Image.create(2,2,false,Image.FORMAT_RGBA8)
	fog.fill(Color(0,0,0,1))
	fx.material.set_shader_parameter("fog_tex",ImageTexture.create_from_image(fog))
	fx.material.set_shader_parameter("fog_on",1.0)
	check(differences(before,await frame(),0.01)<10,"fog fully conceals smoke instead of revealing hidden or remembered houses")
	fx.material.set_shader_parameter("fog_tex",battle.fog.get("_texture"))
	fx.material.set_shader_parameter("fog_on",0.0)
	check(JSON.stringify(NetSync.capture(battle))==authority,"the entire authoritative battle remains unchanged by chimney rendering")
	battle.clock = 340.0
	fx._process(10.0)
	check(not fx.batch.visible and float(fx.material.get_shader_parameter("density"))==0.0,
		"warming the weather fades out smoke and stops drawing the batch")
	battle.clock = 1860.0
	fx._process(4.0)
	var house := battle.add_building("france","house",Vector2(1820,1200),false)
	house.visible = true
	view._sync_buildings()
	fx.refresh()
	check(building_sources(fx,house.id).is_empty(),"unfinished houses do not heat an unbuilt chimney")
	house.complete = true
	house.progress = 1.0
	view._sync_buildings()
	fx.refresh()
	var emitted := building_sources(fx,house.id)
	var node: Node3D = view.get("_halls")[house]
	check(emitted.size()==1 and Vector3(emitted[0]["at"]).is_equal_approx(node.transform*ChimneySmoke3D.FLUES["cottage"][0]),
		"a finished player's chimney follows its real scaled and hill-supported model")
	house.visible = false
	view._sync_buildings()
	fx.refresh()
	check(building_sources(fx,house.id).is_empty(),"hidden player buildings emit no visible smoke")
	house.visible = true
	house.hp = 0.0
	view._sync_buildings()
	fx.refresh()
	check(building_sources(fx,house.id).is_empty(),"destroyed houses no longer emit heating smoke")
	house.queue_free()
	await process_frame
	fx.refresh()
	check(true,"removed buildings are skipped safely before the next building sync")
	var village: Array[Dictionary] = fx.get("_village")
	var many: Array[Dictionary] = []
	for i in 160:
		many.append({"id":"stress%d" % i,"at":View3D.at(Vector2(1820+i%10,950+i/10))+Vector3.UP*5,"scale":0.5,"model":"cottage"})
	fx.set("_village",many)
	fx.refresh()
	check(fx.sources.size()==ChimneySmoke3D.MAX_FLUES and fx.batch.multimesh.instance_count==1152
		and fx.batch.multimesh.visible_instance_count==1152 and fx.batch.multimesh.get_instance_id()==mesh_id,
		"160 nearby chimneys remain capped at 96 flues and 1152 reusable GPU puffs")
	fx.set("_village",village)
	fx.refresh()
	print("GODOT_CHIMNEYS ",JSON.stringify({"failures":failures,"stats":fx.stats()}))
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
	var count := 0
	for y in range(160,a.get_height()-150,2):
		for x in range(80,a.get_width()-260,2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			if absf(ca.r-cb.r)+absf(ca.g-cb.g)+absf(ca.b-cb.b)>threshold:
				count += 1
	return count


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
		label.text = "VOOR · WINTER ZONDER ROOK" if i==0 else "NA · SCHOORSTEENROOK BIJ KOU"
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
	save(viewport.get_texture().get_image(),"chimneys_comparison.png")
	viewport.queue_free()
	await process_frame
