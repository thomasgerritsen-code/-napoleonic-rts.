extends SceneTree
## Screenshots of the graphics proofs, of the same piece of the map (St.-Martin
## by the French base): the 2D game as it is, the richer 2D look (Fancy) by day
## and at evening, and the 3D proof seen as the 2D game sees it and from close
## by and low. SHOT_DIR as in screenshot.gd.

var out := ""


func _initialize() -> void:
	out = OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	for look: Array in [[false, 60.0, "proof2d_plain.png"], [true, 60.0, "proof2d_fancy.png"], [true, 230.0, "proof2d_fancy_evening.png"]]:
		Battle.fancy = look[0]
		var battle: Battle = load("res://scenes/main.tscn").instantiate()
		root.add_child(battle)
		await process_frame
		await process_frame
		battle.ai.set("_next_wave", 1.0e9)
		battle.fog.enabled = false
		battle.fog.refresh()
		battle.clock = look[1]
		for side: String in ["france", "britain"]:
			var men: Array[Unit] = []
			var at := Vector2(980, 1090) if side == "france" else Vector2(1230, 1090)
			for i in 24:
				men.append(battle.add_unit(side, "infantry", at + Vector2((i / 12) * 19 * (1 if side == "britain" else -1), (i % 12) * 15 - 90)))
			men.append(battle.add_unit(side, "officer", at + Vector2(0, -110)))
			men.append(battle.add_unit(side, "drummer", at + Vector2(0, 110)))
			var r := battle.form_regiment(men)
			r.order_move(at, 0.0 if side == "france" else PI)
			r.hold = false
		for i in 30:
			battle._process(0.1)
		battle.clock = look[1]
		battle.camera.zoom = Vector2.ONE * 1.3
		battle.camera.focus(Iso.to_screen(Vector2(1180, 980)))
		await create_timer(1.5).timeout
		root.get_viewport().get_texture().get_image().save_png(out.path_join(look[2]))
		print("saved ", look[2], " lit ", battle.fancy_look.lit if battle.fancy_look else 0, " sway ", battle.fancy_look.swaying if battle.fancy_look else 0)
		battle.queue_free()
		await process_frame
	Battle.fancy = false
	var proof: Node3D = load("res://proof3d/proof_3d.tscn").instantiate()
	root.add_child(proof)
	await process_frame
	await process_frame
	for shot: Array in [["proof3d_iso.png", 0.0, 38.0, 70.0, Vector2(1000, 950)],
			["proof3d_low.png", 20.0, 11.0, 26.0, Vector2(1100, 1090)],
			["proof3d_village.png", -40.0, 24.0, 40.0, Vector2(620, 840)]]:
		proof.call("view", shot[1], shot[2], shot[3], shot[4])
		for i in 8:
			await process_frame
		root.get_viewport().get_texture().get_image().save_png(out.path_join(shot[0]))
		print("saved ", shot[0])
	quit(0)
