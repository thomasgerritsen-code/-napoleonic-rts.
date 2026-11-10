extends SceneTree
## Reproducible native simulation timings; no renderer / GPU FPS claim.
## godot --headless --path godot --script res://tests/large_battle_benchmark.gd
## RTS_BENCH_STEPS=3600 also exercises a longer battle without new spawns.

const DT := 1.0 / 60.0


func _initialize() -> void:
	Battle.mode = "campaign"
	Battle.view_3d = false
	Battle.online_role = ""
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	# Host rules, without transport or autonomous AI spawns during measurement.
	battle.net_role = "host"
	battle.fog.enabled = false
	seed(1815)
	for side: String in ["france", "britain"]:
		for i in 5:
			var centre := Vector2(4100 if side == "france" else 6200, 900 + i * 700)
			var men: Array[Unit] = []
			for n in 36:
				men.append(battle.add_unit(side, "infantry", centre + Vector2(n % 18 * 15, n / 18 * 19)))
			men.append(battle.add_unit(side, "officer", centre))
			men.append(battle.add_unit(side, "drummer", centre))
			var r := battle.form_regiment(men)
			r.order_move(centre, 0.0 if side == "france" else PI)
			for u in men:
				u.world = u.slot
		for i in 4:
			battle.add_unit(side, "cavalry", Vector2(4000 if side == "france" else 6300, 1500 + i * 50))
	var steps := maxi(120, int(OS.get_environment("RTS_BENCH_STEPS")))
	if OS.get_environment("RTS_BENCH_STEPS") == "":
		steps = 300
	var report := {"units": battle.units.size(), "steps": steps, "engine": Engine.get_version_info()["string"]}
	for phase: String in ["standing", "marching", "firefight"]:
		if phase == "marching":
			for r in battle.regiments:
				r.order_move(r.centroid() + Vector2(600 if r.side == "france" else -600, 100))
		elif phase == "firefight":
			var row := {"france": 0, "britain": 0}
			for r in battle.regiments:
				r._march.clear()
				r._line_after = false
				r.formation = "line"
				r.facing = 0.0 if r.side == "france" else PI
				var centre := Vector2(5000 if r.side == "france" else 5180, 900 + int(row[r.side]) * 700)
				row[r.side] += 1
				r.destination = centre
				r._form(centre)
				for u in r.living():
					u.world = u.slot
		for i in 30:
			battle._process(DT)
		var times: Array[int] = []
		for i in steps:
			var before := Time.get_ticks_usec()
			battle._process(DT)
			times.append(Time.get_ticks_usec() - before)
		times.sort()
		report[phase] = {"p50_ms": times[int(steps * 0.5)] / 1000.0,
			"p95_ms": times[int(steps * 0.95)] / 1000.0, "p99_ms": times[int(steps * 0.99)] / 1000.0,
			"memory_mb": OS.get_static_memory_usage() / 1048576.0,
			"living": battle.units.filter(func(u: Unit) -> bool: return u.alive()).size()}
	# A busy target search, including many positions with no enemy nearby.
	var before := Time.get_ticks_usec()
	for i in 2000:
		battle.nearest_foe(Vector2(4000 + i % 40 * 60, 900 + i % 50 * 60), "france", 260.0)
	report["target_queries_2000_ms"] = (Time.get_ticks_usec() - before) / 1000.0
	report["memory_mb"] = OS.get_static_memory_usage() / 1048576.0
	report["objects"] = Performance.get_monitor(Performance.OBJECT_COUNT)
	print("GODOT_BENCH ", JSON.stringify(report))
	battle.queue_free()
	await process_frame
	quit(0)
