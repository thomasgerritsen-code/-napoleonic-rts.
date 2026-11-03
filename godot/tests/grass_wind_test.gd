extends SceneTree
## Measured GPU root/tip motion and a genuine animated v79/new comparison.

const Previous = preload("res://tests/fixtures/grass_v79.gd")
const FRAMES := 32
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
	view.view(Vector2(2070,1180),-28.0,28.0,15.0)
	var grass := view.grass
	grass._process(0.0)
	var buffer := hash(grass.batch.multimesh.buffer)
	var authority := JSON.stringify(NetSync.capture(battle))
	var mesh := grass.batch.multimesh.mesh
	var old_mesh := Previous.tuft()
	check(mesh.get_aabb().size.y>old_mesh.get_aabb().size.y*1.5,
		"individual blades are tall enough to read clearly at normal playing distance")
	check(mesh.surface_get_array_len(0)==56 and mesh.surface_get_array_index_len(0)==120
		and grass.batch.multimesh.instance_count==5184,"three-segment blades retain one fixed GPU batch and a 40-triangle clump budget")
	# Render marker triangles at root/tip heights through the REAL grass
	# shader in an isolated viewport. Pixel centroids measure actual vertex
	# displacement, rather than merely asserting the wind uniform changed.
	root.disable_3d = true
	var probe := make_probe(grass)
	var pm: ShaderMaterial = probe["material"]
	pm.set_shader_parameter("wind",Vector2(0.4,0.0))
	var roots := await track(probe,0.0)
	var tips := await track(probe,0.4)
	check(travel(roots)<0.1,"wind leaves the actual GPU root position fixed (%.3f px)" % travel(roots))
	check(travel(tips)>6.0,"wind bends the actual GPU tip by a clearly visible distance (%.2f px)" % travel(tips))
	pm.set_shader_parameter("wind",Vector2.ZERO)
	var still := await track(probe,0.4)
	check(travel(still)<0.1,"zero wind holds blades genuinely still instead of animating a ground texture")
	pm.set_shader_parameter("wind",Vector2(0.12,0.0))
	var light := await track(probe,0.4)
	check(travel(tips)>travel(light)*1.4,"stronger wind increases visible bending (%.2f vs %.2f px)" % [travel(tips),travel(light)])
	probe["viewport"].queue_free()
	await process_frame
	root.disable_3d = false
	# Exact old mesh+shader, sharing current terrain, camera and wind input.
	var old_material: ShaderMaterial = grass.material.duplicate()
	var old_shader := Shader.new()
	old_shader.code = Previous.SHADER
	old_material.shader = old_shader
	# Shader replacement clears its parameter defaults; copy every matching
	# actual material input back, retaining the original v79 calculations.
	for uniform in grass.material.shader.get_shader_uniform_list():
		var name_: String = uniform["name"]
		old_material.set_shader_parameter(name_,grass.material.get_shader_parameter(name_))
	var out := OS.get_environment("SHOT_DIR")
	var figure := make_figure()
	var before_first: Image
	var after_first: Image
	var after_last: Image
	for i in FRAMES:
		var now := 36.0+i/8.0
		old_material.set_shader_parameter("now",now)
		grass.material.set_shader_parameter("now",now)
		grass.batch.multimesh.mesh = old_mesh
		grass.batch.material_override = old_material
		var before := await frame()
		grass.batch.multimesh.mesh = mesh
		grass.batch.material_override = grass.material
		var after := await frame()
		if i==0:
			before_first = before
			after_first = after
			if out!="":
				before.save_png(out.path_join("grass_wind_before.png"))
				after.save_png(out.path_join("grass_wind_after.png"))
		if i==FRAMES-1:
			after_last = after
		if out!="":
			figure["left"].texture = ImageTexture.create_from_image(before)
			figure["right"].texture = ImageTexture.create_from_image(after)
			await process_frame
			await RenderingServer.frame_post_draw
			var picture: Image = figure["viewport"].get_texture().get_image()
			var directory := out.path_join("grass_wind_frames")
			DirAccess.make_dir_recursive_absolute(directory)
			picture.save_png(directory.path_join("%03d.png" % i))
			if i==0:
				picture.save_png(out.path_join("grass_wind_comparison.png"))
	check(differences(before_first,after_first)>200,"the new individual blades visibly improve the actual v79 scene")
	check(differences(after_first,after_last)>200,"gusts visibly travel through the meadow in the actual game camera")
	check(hash(grass.batch.multimesh.buffer)==buffer,"animated gusts never rebuild or upload the instance buffer")
	check(JSON.stringify(NetSync.capture(battle))==authority,"wind animation leaves the entire authoritative battle unchanged")
	figure["viewport"].queue_free()
	print("GODOT_GRASS_WIND ",JSON.stringify({"failures":failures,"root_px":travel(roots),"tip_px":travel(tips),"light_wind_px":travel(light),"frames":FRAMES}))
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
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.use_custom_data = true
	mm.instance_count = 1
	mm.custom_aabb = grass.batch.multimesh.custom_aabb
	mm.set_instance_transform(0,Transform3D.IDENTITY)
	mm.set_instance_custom_data(0,Color(36,36,0,0))
	node.multimesh = mm
	var material: ShaderMaterial = grass.material.duplicate()
	node.material_override = material
	var white := Image.create(2,2,false,Image.FORMAT_RGBA8)
	white.fill(Color.WHITE)
	var black := Image.create(2,2,false,Image.FORMAT_RGBA8)
	black.fill(Color.BLACK)
	material.set_shader_parameter("cover_tex",ImageTexture.create_from_image(white))
	material.set_shader_parameter("blocked_tex",ImageTexture.create_from_image(black))
	material.set_shader_parameter("road_field",ImageTexture.create_from_image(white))
	material.set_shader_parameter("fog_on",0.0)
	material.set_shader_parameter("lod",1.0)
	var at := View3D.at(Vector2(2100,1180))
	material.set_shader_parameter("centre",at)
	viewport.add_child(node)
	var camera := Camera3D.new()
	camera.projection = Camera3D.PROJECTION_ORTHOGONAL
	camera.size = 2.0
	camera.position = at+Vector3.UP*15.0
	viewport.add_child(camera)
	camera.look_at(at,Vector3.FORWARD)
	camera.make_current()
	return {"viewport":viewport,"material":material,"mesh":mm}


func track(probe: Dictionary,height: float) -> PackedVector2Array:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	for p in [Vector3(-0.025,height,-0.02),Vector3(0.025,height,-0.02),Vector3(0,height,0.03)]:
		surface.set_uv(Vector2(0.25,1.0 if height>0.0 else 0.0))
		surface.set_normal(Vector3.UP)
		surface.add_vertex(p)
	probe["mesh"].mesh = surface.commit()
	var points := PackedVector2Array()
	for i in 10:
		probe["material"].set_shader_parameter("now",36.0+i*0.6)
		for f in 2:
			await process_frame
		await RenderingServer.frame_post_draw
		var image: Image = probe["viewport"].get_texture().get_image()
		var sum := Vector2.ZERO
		var count := 0
		for y in image.get_height():
			for x in image.get_width():
				var c := image.get_pixel(x,y)
				if c.r+c.g+c.b>0.02:
					sum += Vector2(x,y)
					count += 1
		check(count>0,"GPU wind marker remains visible")
		points.append(sum/maxi(1,count))
	return points


func travel(points: PackedVector2Array) -> float:
	var extent := 0.0
	for a in points:
		for b in points:
			extent = maxf(extent,a.distance_to(b))
	return extent


func frame() -> Image:
	await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()


func differences(a: Image,b: Image) -> int:
	var n := 0
	for y in range(100,a.get_height()-100,2):
		for x in range(40,a.get_width()-220,2):
			var ca := a.get_pixel(x,y)
			var cb := b.get_pixel(x,y)
			if absf(ca.r-cb.r)+absf(ca.g-cb.g)+absf(ca.b-cb.b)>0.025:
				n += 1
	return n


func make_figure() -> Dictionary:
	var viewport := SubViewport.new()
	viewport.size = Vector2i(1280,430)
	viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
	viewport.own_world_3d = true
	root.add_child(viewport)
	var background := ColorRect.new()
	background.color = Color(0.075,0.085,0.07)
	background.size = Vector2(1280,430)
	viewport.add_child(background)
	var pictures := []
	for i in 2:
		var label := Label.new()
		label.text = "VOOR · PC-VERSIE 79" if i==0 else "NA · BUIGENDE SPRIETEN EN WINDVLAGEN"
		label.position = Vector2(10+i*635,8)
		label.add_theme_font_size_override("font_size",18)
		viewport.add_child(label)
		var picture := TextureRect.new()
		picture.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		picture.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		picture.position = Vector2(10+i*635,36)
		picture.size = Vector2(625,385)
		viewport.add_child(picture)
		pictures.append(picture)
	return {"viewport":viewport,"left":pictures[0],"right":pictures[1]}
