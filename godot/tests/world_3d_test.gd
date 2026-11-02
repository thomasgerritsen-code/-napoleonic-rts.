extends SceneTree
## Pure climate + native 3D weather, terrain, prints and construction.
## Keep the actual battle frozen: rendering must not modify its authority.

var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	var expected := [Vector4(1,0,0,0), Vector4(0,1,0,0), Vector4(0,0,1,0), Vector4(0,0,0,1)]
	for season in 4:
		var sample := WorldClimate3D.sample(season * 240.0 + 60.0, false, 0.0)
		check(sample["weights"] == expected[season], "season %d has its own stable climate" % season)
		var a: Vector4 = WorldClimate3D.sample((season + 1) * 240.0 - 0.01, false, 0.0)["weights"]
		var b: Vector4 = WorldClimate3D.sample((season + 1) * 240.0 + 0.01, false, 0.0)["weights"]
		check((a - b).length() < 0.0001, "season %d transitions continuously into the next" % season)
	var winter := WorldClimate3D.sample(780.0, true, 1.0)
	var summer := WorldClimate3D.sample(300.0, true, 1.0)
	check(winter["snowfall"] == 1.0 and winter["rain"] == 0.0 and summer["rain"] == 1.0 and summer["snowfall"] == 0.0,
		"the same authoritative shower is snow in winter and rain in summer")
	check(float(WorldClimate3D.sample(60, true, 1)["sun_energy"]) < float(WorldClimate3D.sample(60, false, 0)["sun_energy"]),
		"rain clouds soften the direct sun")
	check(WorldClimate3D.sample(60, false, 0)["weights"] == WorldClimate3D.sample(4860, false, 0)["weights"],
		"the combined day/year cycle repeats")
	seed(1815)
	var random_after := randi()
	seed(1815)
	for i in 100:
		WorldClimate3D.sample(i * 13.0, true, 0.5)
	check(randi() == random_after, "visual climate consumes no simulation randomness")
	Battle.view_3d = true
	Battle.online_role = ""
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.weather.set_process(false)
	battle.fog.set_process(false)
	var view := battle.view3d
	var atmosphere := view.atmosphere
	var stats := atmosphere.stats()
	check(stats["rain_slots"] == 1536 and stats["snow_slots"] == 768 and stats["print_slots"] == 2048 and stats["batches"] == 4,
		"rain, snow, footprints and water have fixed GPU budgets")
	check(atmosphere.water.mesh.get_surface_count() == 1 and atmosphere.water.mesh.surface_get_array_len(0) == Nav._points.size() * 2,
		"one water mesh follows the unchanged river centreline")
	check((atmosphere.rain.material_override as ShaderMaterial).get_shader_parameter("relief") != null,
		"precipitation follows the existing terrain height texture")
	var mesh_id := atmosphere.rain.multimesh.get_instance_id()
	for i in 20:
		battle.clock = i * 240.0 + 60.0
		battle.weather.raining = true
		battle.weather.wetness = 1.0
		atmosphere.refresh()
		atmosphere._process(0.1)
	check(atmosphere.rain.multimesh.get_instance_id() == mesh_id, "season changes reuse the particle batches")
	battle.clock = 780.0
	atmosphere.refresh()
	atmosphere._process(2.0)
	check(atmosphere.snowfall.visible and not atmosphere.rain.visible and battle.weather.label().contains("sneeuw"),
		"winter showers show 3D snow and the correct weather label")
	battle.weather._process(0.0)
	check(not battle.weather.get("_rain").emitting and not battle.weather.get("_rain").visible,
		"the old CPU rain overlay stays disabled in 3D")
	var worker := battle.units[0]
	worker.visible = true
	var home := battle.town_centre("france").world
	for i in 2200:
		worker.world = home + Vector2(180 + i % 2 * 16, 120)
		atmosphere.track(worker)
	check(int(atmosphere.stats()["prints_emitted"]) > 2048 and atmosphere.prints.multimesh.instance_count == 2048,
		"footprints wrap their fixed buffer instead of allocating new objects")
	var count := int(atmosphere.stats()["prints_emitted"])
	worker.world = Nav.bridges()[0]["centre"]
	atmosphere.track(worker)
	check(int(atmosphere.stats()["prints_emitted"]) == count, "bridge decks receive no muddy or snowy ground prints")
	var house := battle.add_building("france", "house", home + Vector2(600, 200), false)
	house.progress = 0.1
	view._sync_buildings()
	var halls: Dictionary = view.get("_halls")
	var model: Node3D = halls[house]
	var model_mesh: MeshInstance3D = model.find_children("*", "MeshInstance3D", true, false)[0]
	var mat := model_mesh.material_override as ShaderMaterial
	check(view.construction.get("_sites").has(house) and is_equal_approx(model.scale.y, model.scale.x),
		"a building site uses scaffolding at its full correct proportions")
	house.progress = 0.7
	view.construction._process(1.0)
	check(absf(float(mat.get_shader_parameter("build_progress")) - 0.7) < 0.01 and view.construction.stats()["beams"] < 64,
		"the shader and bounded scaffold follow actual wall/roof progress")
	house.complete = true
	house.progress = 1.0
	view._sync_buildings()
	check(not view.construction.get("_sites").has(house) and float(mat.get_shader_parameter("build_progress")) == 1.0,
		"completion reveals the whole building and removes the scaffold")
	var before := JSON.stringify(NetSync.capture(battle))
	atmosphere._process(0.1)
	view.field._process(0.1)
	view.construction._process(0.1)
	view._light()
	check(JSON.stringify(NetSync.capture(battle)) == before, "rendering leaves orders, economy, weather and combat state unchanged")
	var field := view.field
	var material_count: int = field.get("_fog_materials").size()
	var temporary: ShaderMaterial = field.fogged(load("res://assets/props/cottage.webp"))
	temporary = null
	field._process(1.0)
	check(field.get("_fog_materials").size() <= material_count, "discarded visual materials do not accumulate in the climate update list")
	print("GODOT_WORLD ", JSON.stringify({"failures": failures, "budgets": stats}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)
