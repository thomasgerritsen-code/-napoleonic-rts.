extends SceneTree
## Screenshots at a phone's size (in points), to see the game as it is on a
## phone: the menu, the battle with troops selected, a building selected.
##
##   godot --path godot --rendering-driver opengl3 --resolution 844x390 --script res://tests/phone_shots.gd

func _initialize() -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	Battle.touched = true
	Phone.forced = true
	Phone.setup(self)
	var menu: Node = load("res://scenes/menu.tscn").instantiate()
	root.add_child(menu)
	for i in 6:
		await process_frame
	await _save(out.path_join("phone_menu.png"))
	menu.queue_free()
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	for i in 6:
		await process_frame
	battle.ai.set("_next_wave", 1.0e9)
	await _save(out.path_join("phone_battle.png"))
	var mine: Array[Unit] = []
	for u in battle.units:
		if u.side == battle.me and u.kind == "worker":
			mine.append(u)
			break
	if not mine.is_empty():
		battle.select_units(mine)
		for i in 4:
			await process_frame
		await _save(out.path_join("phone_worker.png"))
	var tc := battle.town_centre(battle.me)
	if tc != null:
		battle.select_building(tc)
		for i in 4:
			await process_frame
		await _save(out.path_join("phone_building.png"))
	print("SHOTS ", out)
	quit(0)


func _save(path: String) -> void:
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(path)
	print("shot ", path.get_file(), " at ", Time.get_ticks_msec())
