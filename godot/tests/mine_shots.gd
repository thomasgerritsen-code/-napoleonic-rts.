extends SceneTree
## Visual review of the native Blender mine on an actual iron deposit.
## SHOT_DIR=/path godot --path godot --script res://tests/mine_shots.gd


func _initialize() -> void:
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.fog.enabled = false
	battle.fog.refresh()
	battle.clock = 30.0
	var deposit: Supply = null
	for supply in battle.supplies:
		if supply.kind == "iron":
			deposit = supply
			break
	if deposit == null:
		push_error("No iron deposit for the mine review")
		quit(1)
		return
	var mine := battle.add_building("france", "mine", deposit.world, true)
	battle.add_unit("france", "worker", deposit.world + Vector2(-75, 35))
	battle.view3d.view(deposit.world, -25.0, 32.0, 18.0)
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	for shot: Array in [["mine_day.png", 30.0], ["mine_evening.png", 230.0]]:
		battle.clock = float(shot[1])
		mine.visible = true
		battle.view3d.call("_sync_buildings")
		for i in 8:
			await process_frame
		await RenderingServer.frame_post_draw
		var error := root.get_texture().get_image().save_png(out.path_join(shot[0]))
		if error != OK:
			push_error("Could not save " + String(shot[0]))
			quit(1)
			return
		print("saved ", shot[0])
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0)
