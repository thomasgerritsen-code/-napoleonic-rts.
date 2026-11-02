extends SceneTree
## Measure real lit material pixels using the battle's own environment/sun.
## Reading energy properties alone cannot detect lost highlight detail.

var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.online_role = ""
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.weather.set_process(false)
	battle.fog.enabled = false
	battle.fog.set_process(false)
	battle.fog.refresh()
	var view := battle.view3d
	view.set_process(false)
	view.atmosphere.set_process(false)
	view.field.set_process(false)
	var bridge: Vector2 = Nav.bridges()[0]["centre"]
	view.view(bridge + Vector2(-100,-70),-20.0,40.0,50.0)
	# Four matte calibration surfaces; same renderer and live battle lighting.
	var viewport := SubViewport.new()
	viewport.size = Vector2i(640,240)
	viewport.own_world_3d = true
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	root.add_child(viewport)
	var world := WorldEnvironment.new()
	viewport.add_child(world)
	var sun := DirectionalLight3D.new()
	viewport.add_child(sun)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 12.0
	viewport.add_child(camera)
	camera.position = Vector3(0,12,0)
	camera.look_at(Vector3.ZERO,Vector3.FORWARD)
	camera.make_current()
	for i in 4:
		var tile := MeshInstance3D.new()
		var mesh := PlaneMesh.new()
		mesh.size = Vector2(2.0,2.0)
		tile.mesh = mesh
		var material := StandardMaterial3D.new()
		var shade: float = [0.18,0.5,0.75,0.9][i]
		material.albedo_color = Color(shade,shade,shade)
		material.roughness = 1.0
		material.metallic_specular = 0.0
		tile.material_override = material
		tile.position.x = (i-1.5)*2.6
		viewport.add_child(tile)
	var measured := {}
	var out := OS.get_environment("SHOT_DIR")
	for spec: Array in [[100.0,false,0.0,"noon"],[1860.0,false,0.0,"winter"],
		[100.0,true,1.0,"rain"],[400.0,false,0.0,"night"]]:
		battle.clock = spec[0]
		battle.weather.raining = spec[1]
		battle.weather.wetness = spec[2]
		view.atmosphere.refresh()
		view.atmosphere.cloud = view.atmosphere.climate["cloud"]
		view.atmosphere._process(1.0)
		view.field._process(1.0)
		view.set("_sky_clock",0.0)
		view._light()
		world.environment = view._env.duplicate()
		sun.transform = view._sun.transform
		sun.light_color = view._sun.light_color
		sun.light_energy = view._sun.light_energy
		for i in 3:
			await process_frame
		await RenderingServer.frame_post_draw
		var image := viewport.get_texture().get_image()
		var values: Array[Color] = []
		for i in 4:
			var point := camera.unproject_position(Vector3((i-1.5)*2.6,0,0))
			values.append(image.get_pixelv(point))
		measured[spec[3]] = values
		print("light samples ",spec[3]," ",values)
		if spec[3] in ["noon","winter"]:
			check(luma(values[3])-luma(values[2])>0.04,"%s: light grey and white remain visibly different" % spec[3])
			check(maxf(values[3].r,maxf(values[3].g,values[3].b))<0.99,"%s: bright matte material retains highlight headroom" % spec[3])
			check(luma(values[1])>0.3 and luma(values[1])<0.75,"%s: midtones stay readable without washing out" % spec[3])
		if out != "":
			image.save_png(out.path_join("lighting_%s_chart.png" % spec[3]))
			root.get_texture().get_image().save_png(out.path_join("lighting_%s.png" % spec[3]))
	check(luma(measured["rain"][1])<luma(measured["noon"][1])*0.95,"clouds still soften daylight")
	check(luma(measured["night"][3])>0.06 and luma(measured["night"][1])<luma(measured["noon"][1])*0.6,"night keeps readable material detail and remains darker than day")
	check(measured["night"][2].b>measured["night"][2].r,"night retains cool moonlight")
	print("GODOT_LIGHTING ",JSON.stringify({"failures":failures}))
	viewport.queue_free()
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func luma(c: Color) -> float:
	return c.r*0.2126+c.g*0.7152+c.b*0.0722
