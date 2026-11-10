extends SceneTree
## Real-renderer weather probe plus seasonal, rainy, night and building shots.

var failed := false
var battle: Battle
var out := ""


func _initialize() -> void:
	out = OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	Battle.online_role = ""
	Battle.view_3d = true
	battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.weather.set_process(false)
	battle.fog.enabled = false
	battle.fog.set_process(false)
	battle.fog.refresh()
	await _probe(battle.view3d.atmosphere.rain, "rain")
	await _probe(battle.view3d.atmosphere.snowfall, "snow")
	var bridge: Vector2 = Nav.bridges()[0]["centre"]
	var site := bridge + Vector2(-220, -130)
	var foundry := battle.add_building("france", "foundry", site, true)
	foundry.visible = true
	battle.view3d._sync_buildings()
	battle.view3d.view(bridge + Vector2(-100, -70), -20.0, 40.0, 50.0)
	for spec: Array in [[60.0, false, 0.0, "world_spring.png"], [1260.0, false, 0.0, "world_summer.png"],
		[660.0, false, 0.0, "world_autumn.png"], [1860.0, false, 0.0, "world_winter.png"],
		[1260.0, true, 1.0, "world_rain.png"], [1860.0, true, 1.0, "world_snow.png"],
		[1500.0, false, 0.0, "world_night.png"]]:
		_set_climate(spec[0], spec[1], spec[2])
		await _shot(spec[3])
	# Ground prints on the same field: use the existing peasant, then a horse.
	_set_climate(1260.0, true, 1.0)
	var worker := battle.units[0]
	worker.visible = true
	for i in 12:
		worker.world = site + Vector2(-90 + i * 16, 140)
		worker.facing = 0.0
		battle.view3d.atmosphere.track(worker)
	var horse := battle.add_unit("france", "cavalry", site + Vector2(-90, 190))
	for i in 10:
		horse.world = site + Vector2(-90 + i * 27, 190)
		horse.facing = 0.0
		battle.view3d.atmosphere.track(horse)
	battle.view3d.view(site + Vector2(80, 145), 0.0, 60.0, 22.0)
	await _shot("world_tracks.png")
	# Actual progress drives the same foundry, without changing its proportions.
	_set_climate(60.0, false, 0.0)
	foundry.complete = false
	battle.view3d.view(site, -20.0, 32.0, 22.0)
	for spec: Array in [[0.1,"build_foundation.png"],[0.35,"build_frame.png"],[0.7,"build_walls.png"],[0.94,"build_roof.png"],[1.0,"build_complete.png"]]:
		foundry.progress = spec[0]
		foundry.complete = float(spec[0]) == 1.0
		battle.view3d._sync_buildings()
		battle.view3d.construction._process(2.0)
		if float(spec[0]) == 0.7:
			_check_braces(foundry)
		await _shot(spec[1])
	print("GODOT_WORLD_RENDER ", JSON.stringify({"failed":failed,"budgets":battle.view3d.atmosphere.stats()}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(1 if failed else 0)


func _check_braces(building: Building) -> void:
	# The headless dummy backend cannot read MultiMesh transforms (it returns
	# identity), so verify the uploaded geometry with the real renderer here.
	var scaffold: MultiMeshInstance3D = battle.view3d.construction.get("_sites")[building]["scaffold"]
	var braces := 0
	for i in scaffold.multimesh.instance_count:
		var axis := scaffold.multimesh.get_instance_transform(i).basis.x
		if absf(axis.x) > 0.3 and absf(axis.y) > 0.3:
			braces += 1
	if braces != 2:
		failed = true
		push_error("Scaffold braces lost their diagonal slope after nonuniform scaling")
	print("scaffold diagonal braces ", braces)


func _set_climate(seconds: float, raining: bool, wetness: float) -> void:
	battle.clock = seconds
	battle.weather.raining = raining
	battle.weather.wetness = wetness
	battle.view3d.atmosphere.refresh()
	battle.view3d.atmosphere._process(2.0)
	battle.view3d.field._process(1.0)
	battle.view3d.set("_sky_clock", 0.0)
	battle.view3d._light()


func _shot(name_: String) -> void:
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	var image := root.get_texture().get_image()
	if name_ == "world_winter.png":
		# Sample the field, away from the HUD. Snow must retain light/shade
		# instead of clipping most of the ground to featureless white.
		var clipped := 0
		var samples := 0
		for y in range(300, 650, 4):
			for x in range(100, 1100, 4):
				var c := image.get_pixel(x, y)
				samples += 1
				if minf(c.r, minf(c.g, c.b)) > 0.98:
					clipped += 1
		if float(clipped) / samples > 0.25:
			failed = true
			push_error("Winter ground lost its light and shadow detail to white clipping")
		print("snow clipped fraction ", float(clipped) / samples)
	image.save_png(out.path_join(name_))
	print("saved ", name_)


func _probe(source: MultiMeshInstance3D, label: String) -> void:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(320,240)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var camera := Camera3D.new()
	viewport.add_child(camera)
	camera.position = Vector3(0,8,15)
	camera.look_at(Vector3(0,6,0))
	camera.make_current()
	var node := MultiMeshInstance3D.new()
	node.multimesh = source.multimesh
	var mat: ShaderMaterial = source.material_override.duplicate()
	mat.set_shader_parameter("opacity",1.0)
	mat.set_shader_parameter("centre",Vector3.ZERO)
	mat.set_shader_parameter("span",35.0)
	mat.set_shader_parameter("light",Vector3.ONE)
	mat.set_shader_parameter("fog_on",0.0)
	mat.set_shader_parameter("now",1.44)
	node.material_override = mat
	node.visible = false
	viewport.add_child(node)
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	var before := viewport.get_texture().get_image()
	node.visible = true
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	var after := viewport.get_texture().get_image()
	var changed := 0
	for y in 240:
		for x in 320:
			var a := before.get_pixel(x,y)
			var b := after.get_pixel(x,y)
			if absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b)>0.025:
				changed += 1
	if changed < 30:
		failed = true
		push_error("3D %s did not actually draw visible particles (%d pixels)" % [label,changed])
	print("probe ",label," changed pixels ",changed)
	after.save_png(out.path_join("probe_%s.png" % label))
	viewport.queue_free()
	await process_frame
