extends SceneTree
## Reproduce the visible-army bottleneck. ORIGINAL_ACTORS=1 restores the
## original packed scenes in this process only; production needs no debug mode.


func _initialize() -> void:
	var original := OS.get_environment("ORIGINAL_ACTORS") == "1"
	if original:
		for side in ["fr", "br"]:
			for name_ in ["infantry_", "infantry2_", "infantry3_", "worker_"]:
				var path: String = "res://assets3d/%s%s.glb" % [name_,side]
				ActorSkin3D._cache[path] = load(path)
	Battle.online_role = ""
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	battle.set_process(false)
	battle.weather.set_process(false)
	battle.fog.enabled = false
	battle.fog.refresh()
	battle.fog.set_process(false)
	for i in 388:
		battle.add_unit("france" if i%2 == 0 else "britain","infantry",Vector2(4400+i%20*30,2400+i/20*30))
	for u in battle.units:
		u.visible = true
	battle.view3d.view(Vector2(4700,2700),15,48,90)
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var frames: Array[float] = []
	var cpu: Array[float] = []
	for i in 30:
		var start := Time.get_ticks_usec()
		await process_frame
		await RenderingServer.frame_post_draw
		frames.append((Time.get_ticks_usec()-start)/1000.0)
		cpu.append(Performance.get_monitor(Performance.TIME_PROCESS)*1000.0)
	frames.sort()
	cpu.sort()
	var meshes := 0
	for actor: Dictionary in battle.view3d.get("_men").values():
		meshes += (actor["node"] as Node).find_children("*","MeshInstance3D",true,false).size()
	print("GODOT_VISIBLE_ARMY ",JSON.stringify({"renderer":RenderingServer.get_video_adapter_name(),
		"original":original,"units":battle.units.size(),"actor_meshes":meshes,
		"draw_calls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),
		"primitives":Performance.get_monitor(Performance.RENDER_TOTAL_PRIMITIVES_IN_FRAME),
		"nodes":Performance.get_monitor(Performance.OBJECT_NODE_COUNT),"memory_mb":OS.get_static_memory_usage()/1048576.0,
		"frame_p50_ms":frames[15],"frame_p95_ms":frames[28],"cpu_p50_ms":cpu[15]}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit()
