extends SceneTree
## A real Godot-rendered gallery of the new original Blender assets.


func _initialize() -> void:
	Battle.view_3d = true
	Battle.online_role = ""
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.clock = 60.0
	battle.fog.enabled = false
	battle.fog.refresh()
	var view := battle.view3d
	var base := Vector2(4700, 1500)
	# A level piece of the field with a foundry, chapel and half-timbered inn.
	for entry: Array in [["foundry_fr", Vector2(-140, 0)], ["chapel", Vector2(160, 0)], ["inn", Vector2(470, 0)]]:
		var node: Node3D = view._scene(entry[0]).instantiate()
		node.position = View3D.at(base + entry[1])
		view.add_child(node)
		view.field.fog_model(node)
	var specs := [["france", "infantry", "grenadier"], ["france", "infantry", "voltigeur"], ["france", "infantry", "guard"],
		["france", "infantry", "sapper"], ["britain", "infantry", "rifle"], ["france", "cavalry", "cuirassier"],
		["france", "cavalry", "lancer"], ["britain", "cavalry", "greys"], ["france", "officer", "mounted"]]
	for i in specs.size():
		var spec: Array = specs[i]
		var u := battle.add_unit(spec[0], spec[1], base + Vector2(-130 + i * 65, 180), spec[2])
		u.visible = true
		u.facing = PI / 2.0
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	for shot: Array in [["new_buildings.png", base + Vector2(160, 0), 20.0, 34.0, 44.0],
		["new_troops.png", base + Vector2(130, 180), 0.0, 25.0, 28.0]]:
		view.view(shot[1], shot[2], shot[3], shot[4])
		for i in 8:
			await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(out.path_join(shot[0]))
		print("saved ", shot[0])
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit()
