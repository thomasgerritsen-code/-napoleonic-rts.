extends SceneTree
## Real-renderer regression: all map bridges survive scenery sync and F3,
## visibly cover the water, and carry the actors and their selection points.

var failures: Array[String] = []
var battle: Battle


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
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
	var view := battle.view3d
	view._sync_scenery()
	check(_visible_bridges(view) == 5, "all five 3D bridges remain after hiding 2D sprites and syncing scenery")
	if failures.is_empty():
		await _crossings(view)
	# Recreate the view twice, just as F3 does, to catch hidden-sprite state.
	for turn in 2:
		battle.set_view_3d(false)
		await process_frame
		var sprites := 0
		for child in battle.get_children():
			if child is Sprite2D and child.texture != null and child.texture.resource_path.contains("/bridge_") and child.visible:
				sprites += 1
		check(sprites == 5, "F3 restores all five 2D bridges (%d)" % turn)
		battle.set_view_3d(true)
		await process_frame
		battle.view3d._sync_scenery()
		check(_visible_bridges(battle.view3d) == 5, "F3 recreates five visible 3D bridges (%d)" % turn)
	print("GODOT_BRIDGES ", JSON.stringify({"failures": failures}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _batches(view: View3D) -> Array[MultiMeshInstance3D]:
	var result: Array[MultiMeshInstance3D] = []
	for node: MultiMeshInstance3D in view.find_children("*", "MultiMeshInstance3D", true, false):
		if node.multimesh != null and node.multimesh.mesh in [view._mesh_of("bridge_stone"), view._mesh_of("bridge_wood")]:
			result.append(node)
	return result


func _visible_bridges(view: View3D) -> int:
	var count := 0
	for node in _batches(view):
		if not node.is_visible_in_tree():
			continue
		for i in node.multimesh.instance_count:
			if absf(node.multimesh.get_instance_transform(i).basis.determinant()) > 0.01:
				count += 1
	return count


func _frame() -> Image:
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	return root.get_texture().get_image()


func _crossings(view: View3D) -> void:
	# Stop water/particles so their animation cannot masquerade as bridge pixels.
	view.atmosphere.set_process(false)
	view.atmosphere.rain.visible = false
	view.atmosphere.snowfall.visible = false
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	var worker := battle.units[0]
	var origin := worker.world
	for crossing: Dictionary in Rules.start()["crossings"]:
		var centre := Vector2(crossing["x"], crossing["y"])
		view.view(centre, -15.0, 48.0, 25.0)
		for node in _batches(view):
			node.visible = false
		var before := await _frame()
		for node in _batches(view):
			node.visible = true
		var after := await _frame()
		# The middle of the bridge stays away from moving bank-side leaves.
		var screen := view.camera.unproject_position(view.at(centre) + Vector3.UP)
		var changed := 0
		for y in range(maxi(0, int(screen.y)-45), mini(after.get_height(), int(screen.y)+45)):
			for x in range(maxi(0, int(screen.x)-90), mini(after.get_width(), int(screen.x)+90)):
				var a := before.get_pixel(x,y)
				var b := after.get_pixel(x,y)
				if absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b)>0.08:
					changed += 1
		check(changed > 1500, "%s visibly covers the water (%d changed pixels)" % [crossing["id"],changed])
		worker.world = centre
		worker.visible = true
		view._sync_units(1.0)
		var actor: Node3D = view.get("_men")[worker]["node"]
		check(actor.position.y > view.at(centre).y + 0.7, "%s carries actors above the river bed" % crossing["id"])
		var pick := view.camera.unproject_position(actor.position + Vector3.UP * 0.9)
		check(view._man_at(pick) == worker, "%s actor remains selectable on the raised deck" % crossing["id"])
		var hit := view.ground_at(view.camera.unproject_position(actor.position))
		check(hit.distance_to(centre) < 3.0, "%s pointer orders meet the bridge deck" % crossing["id"])
		var shot := await _frame()
		shot.save_png(out.path_join("%s.png" % crossing["id"]))
	worker.world = origin
