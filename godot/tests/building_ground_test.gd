extends SceneTree
## Real footprint clearance, downhill support, picking and genuine v73 shots.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func clearance(view: View3D,mesh: Mesh,pose: Transform3D) -> float:
	var box := view.building_ground.footprint(mesh)
	var lowest := INF
	for x in 19:
		for z in 19:
			var point := pose*Vector3(box.position.x+box.size.x*x/18.0,box.position.y,box.position.z+box.size.z*z/18.0)
			lowest = minf(lowest,point.y-view.field.banks.height_at(View3D.flat(point)))
	return lowest


func _initialize() -> void:
	Battle.view_3d = true
	Battle.online_role = ""
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
	view.atmosphere._process(1.0)
	view.field._process(1.0)
	view._light()
	for child in battle.get_children():
		if child is Hud:
			child._process(0.0)
	var all_clear := true
	var source_sunk := 0
	var church: Dictionary = {}
	var buried := 0.0
	for item in view.building_ground.villages:
		all_clear = all_clear and clearance(view,item["mesh"],item["transform"])>0.018
		var old_gap := clearance(view,item["mesh"],item["original"])
		if old_gap < -0.1:
			source_sunk += 1
		if item["model"] == "chapel" and old_gap<buried:
			buried = old_gap
			church = item
	check(all_clear and view.building_ground.villages.size()==battle.houses.size(),"every village building base clears its complete terrain footprint")
	check(source_sunk>=4 and buried < -0.8,"the reference reproduces the church buried about a metre in the hill")
	check(view.building_ground.get_child_count()==2,"all foundation skirts use only two shared mesh nodes")
	var support: Mesh = view.building_ground.get("_static").mesh
	check(support.get_surface_count()==1 and support.surface_get_array_len(0)<30000,"all village foundations share one bounded surface")
	var unchanged := JSON.stringify(NetSync.capture(battle))
	var out := OS.get_environment("SHOT_DIR")
	if out != "" and not church.is_empty():
		view.view(View3D.flat(church["original"].origin),-28.0,36.0,24.0)
		var lookup := {}
		for item in view.building_ground.villages:
			lookup[item["transform"].origin] = item
		var swaps := []
		for child in view.get_children():
			if child is MultiMeshInstance3D:
				var mm: MultiMesh = child.multimesh
				for i in mm.instance_count:
					var pose := mm.get_instance_transform(i)
					if lookup.has(pose.origin) and lookup[pose.origin]["mesh"] == mm.mesh:
						swaps.append([mm,i,pose])
						mm.set_instance_transform(i,lookup[pose.origin]["original"])
		check(swaps.size()==battle.houses.size(),"the comparison restores every genuine v73 village transform")
		view.building_ground.visible = false
		var before := await frame()
		before.save_png(out.path_join("building_ground_before.png"))
		for swap: Array in swaps:
			swap[0].set_instance_transform(swap[1],swap[2])
		view.building_ground.visible = true
		var after := await frame()
		after.save_png(out.path_join("building_ground_after.png"))
		await comparison(before,after,out)
	check(JSON.stringify(NetSync.capture(battle))==unchanged,"placing visual foundations leaves the authoritative battle unchanged")
	# Player buildings use the same footprint rule, including active scaffolds.
	var site: Vector2 = View3D.flat(church["original"].origin)+Vector2(0,210) if not church.is_empty() else Vector2(2800,1100)
	var hall := battle.add_building("france","barracks",site,false)
	hall.visible = true
	hall.progress = 0.45
	view._sync_buildings()
	var model: Node3D = view.get("_halls")[hall]
	var mesh := view._mesh_of(model.get_meta("model"))
	check(clearance(view,mesh,model.transform)>0.018,"a player building also stands above the whole slope")
	var scaffold: MultiMeshInstance3D = view.construction.get("_sites")[hall]["scaffold"]
	check(scaffold.position.is_equal_approx(model.position),"construction scaffolding follows the corrected building height")
	var foundation: Mesh = view.building_ground.get("_dynamic").mesh
	var id := foundation.get_instance_id()
	view._sync_buildings()
	check(view.building_ground.get("_dynamic").mesh.get_instance_id()==id,"unchanged buildings reuse their foundation mesh")
	hall.complete = true
	hall.progress = 1.0
	view._sync_buildings()
	view.view(hall.world,-25.0,38.0,22.0)
	var pixel := view.camera.unproject_position(model.position+Vector3.UP*float(model.get_meta("height"))*0.45)
	check(view.building_ground.pick(pixel,view.get("_halls"))==hall,"the raised building remains selectable at its visible walls")
	var visible_vertices: int = view.building_ground.get("_dynamic").mesh.surface_get_array_len(0)
	hall.visible = false
	view._sync_buildings()
	var hidden_mesh: Mesh = view.building_ground.get("_dynamic").mesh
	var hidden_vertices: int = hidden_mesh.surface_get_array_len(0) if hidden_mesh != null else 0
	check(hidden_vertices<visible_vertices and view.building_ground.pick(pixel,view.get("_halls"))!=hall and not model.visible,"hidden buildings have no visible or selectable foundation")
	var removed_id := hall.get_instance_id()
	hall.queue_free()
	await process_frame
	var picked := view.building_ground.pick(pixel,view.get("_halls"))
	check(picked==null or picked.get_instance_id()!=removed_id,"picking safely skips a removed building before the next visual sync")
	Engine.time_scale = 1.0
	print("GODOT_BUILDING_GROUND ",JSON.stringify({"failures":failures,"village_buildings":battle.houses.size(),"old_church_sink":-buried}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func frame() -> Image:
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()


func comparison(before: Image,after: Image,out: String) -> void:
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
		label.text = "VOOR · PC-VERSIE 73" if i==0 else "NA · FUNDERING OP DE HEUVEL"
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
	viewport.get_texture().get_image().save_png(out.path_join("building_ground_comparison.png"))
	viewport.queue_free()
	await process_frame
