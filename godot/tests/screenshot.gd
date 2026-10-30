extends SceneTree
## Screenshots of the game as it draws, for looking at what the headless
## check cannot see: a manned, fortified trench (cut, bank, fascines, gabions,
## the men sunk in it and leaning on the bank) and the lumber camp and grain
## fields. Run with a real renderer (the CI uses a virtual screen):
##
##   godot --path godot --rendering-driver opengl3 --script res://tests/screenshot.gd
##
## The pictures go to the folder in SHOT_DIR (default: user://).

const STEP := 0.1


func _initialize() -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.ai.set("_next_wave", 1.0e9)
	battle.fog.enabled = false
	battle.fog.refresh()
	var home := battle.town_centre("france").world
	# A battalion holding its ground digs in; the trench is then fortified.
	var men: Array[Unit] = []
	var spot := home + Vector2(700, 300)
	for i in 24:
		men.append(battle.add_unit("france", "infantry", spot + Vector2((i % 12) * 15, (i / 12) * 19)))
	men.append(battle.add_unit("france", "officer", spot + Vector2(90, -30)))
	men.append(battle.add_unit("france", "drummer", spot + Vector2(90, 50)))
	var r := battle.form_regiment(men)
	r.order_move(spot + Vector2(90, 10), 0.0)
	r.hold = true
	# A second one facing north: its trench runs across the screen, the bank
	# on the far side, the near wall hiding the men's legs.
	var others: Array[Unit] = []
	var north := home + Vector2(400, 820)
	for i in 24:
		others.append(battle.add_unit("france", "infantry", north + Vector2((i % 12) * 15, (i / 12) * 19)))
	others.append(battle.add_unit("france", "officer", north + Vector2(90, -30)))
	others.append(battle.add_unit("france", "drummer", north + Vector2(90, 50)))
	var r2 := battle.form_regiment(others)
	r2.order_move(north + Vector2(90, 10), -PI / 2.0)
	r2.hold = true
	# A third facing south: the bank on the near side, the front rank leaning
	# over it.
	var south_men: Array[Unit] = []
	var south := home + Vector2(800, 1000)
	for i in 24:
		south_men.append(battle.add_unit("france", "infantry", south + Vector2((i % 12) * 15, (i / 12) * 19)))
	south_men.append(battle.add_unit("france", "officer", south + Vector2(90, -30)))
	south_men.append(battle.add_unit("france", "drummer", south + Vector2(90, 50)))
	var r3 := battle.form_regiment(south_men)
	r3.order_move(south + Vector2(90, 10), PI / 2.0)
	r3.hold = true
	for i in int(45.0 / STEP):
		battle._process(STEP)
	for x in [r, r2, r3]:
		if x.trench != null:
			x.trench["level"] = 3
	# Two grain fields (one ripe) and a lumber camp near the town centre.
	var field := battle.add_building("france", "farm", home + Vector2(320, 520), true)
	field.crop = Rules.FARM_CAPACITY
	battle.add_building("france", "farm", home + Vector2(150, 520), true)
	battle.add_building("france", "lumbercamp", home + Vector2(-60, 520), true)
	await _shot(battle, Vector2(r.trench["centre"]) if r.trench != null else spot, out.path_join("trench.png"))
	await _shot(battle, Vector2(r2.trench["centre"]) if r2.trench != null else north, out.path_join("trench_across.png"))
	await _shot(battle, Vector2(r3.trench["centre"]) if r3.trench != null else south, out.path_join("trench_near.png"))
	await _shot(battle, home + Vector2(140, 520), out.path_join("sites.png"))
	print("SHOTS ", out)
	quit(0)


func _shot(battle: Battle, at: Vector2, path: String) -> void:
	battle.camera.zoom = Vector2.ONE * 2.2
	battle.camera.focus(Iso.to_screen(at))
	for i in 12:
		battle.trenches._process(0.0)
		await process_frame
	var image := root.get_viewport().get_texture().get_image()
	image.save_png(path)
	print("saved ", path, " ", image.get_size())
