extends SceneTree
## The 3D battle at a phone's size (in points): the village by the French
## town centre, and a battalion selected close up.
##
##   godot --path godot --rendering-driver opengl3 --resolution 844x390 --script res://tests/phone_3d_shots.gd

func _initialize() -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	Battle.touched = true
	Phone.forced = true
	Phone.setup(self)
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	for i in 4:
		await process_frame
	battle.ai.set("_next_wave", 1.0e9)
	if OS.get_environment("NO_FOG") != "":
		battle.fog.enabled = false
		battle.fog.refresh()
	var home := battle.town_centre(battle.me).world
	var men: Array[Unit] = []
	var spot := home + Vector2(380, 260)
	for i in 24:
		men.append(battle.add_unit(battle.me, "infantry", spot + Vector2((i % 12) * 15, (i / 12) * 19)))
	men.append(battle.add_unit(battle.me, "officer", spot + Vector2(90, -30)))
	men.append(battle.add_unit(battle.me, "drummer", spot + Vector2(90, 50)))
	var r := battle.form_regiment(men)
	for i in 20:
		battle._process(0.1)
	battle.view3d.view(home + Vector2(220, 160), 0.0, 45.0, 70.0)
	for i in 6:
		await process_frame
	await _save(out.path_join("phone3d_village.png"))
	battle.select_units(r.living())
	battle.view3d.view(r.centroid(), 0.6, 35.0, 30.0)
	for i in 6:
		await process_frame
	await _save(out.path_join("phone3d_battalion.png"))
	Battle.view_3d = false
	quit(0)


func _save(path: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(path)
	print("shot ", path.get_file())
