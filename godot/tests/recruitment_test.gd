extends SceneTree
## Actual trained recruits must leave clear, separate waiting positions,
## including pending arrivals, manual rally points and loaded battles.

var failures: Array[String] = []
var battle: Battle


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.view_3d = false
	Battle.online_role = ""
	battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.ai.set("_clock",1.0e9)
	battle.weather.set_process(false)
	# CI exercises several fixed spawn jitters, including the building-corner
	# traffic jam found while validating the river release.
	seed(int(OS.get_environment("RTS_RECRUIT_SEED")))
	var depot := battle.add_building("france","barracks",Vector2(4600,1800),true)
	var recruits: Array[Unit] = []
	for i in 36:
		battle.spawn_trained(depot,"infantry")
		recruits.append(battle.units[-1])
	check(_gap(recruits,true)>=27.9,"36 recruits reserve separate positions even before any have arrived")
	var dry := true
	for u in recruits:
		dry = dry and battle.navigation.walkable(u.slot)
	check(dry,"every waiting position is outside buildings, trees and water")
	# Freeze economy/AI; exercise the actual unit movement and crowd solver.
	_run(recruits,50.0)
	var arrived := 0
	for u in recruits:
		if u.world.distance_to(u.slot)<6.0:
			arrived += 1
	check(arrived==36 and _gap(recruits,false)>21.5,"all 36 recruits reach spaced waiting places (%d/36, gap %.1f)" % [arrived,_gap(recruits,false)])
	await _picture(depot.world+Vector2(20,80))
	# A deliberately awkward rally point next to another building.
	var house := battle.add_building("france","house",Vector2(5150,2050),true)
	depot.rally = house.world
	var rally: Array[Unit] = []
	for i in 14:
		battle.spawn_trained(depot,"infantry" if i<12 else ("officer" if i==12 else "drummer"))
		rally.append(battle.units[-1])
	dry = true
	for u in rally:
		dry = dry and battle.navigation.walkable(u.slot) and u.slot.distance_to(depot.rally)<240.0
	check(dry and _gap(rally,true)>=27.9,"a blocked rally point uses nearby separate reachable positions")
	_run(rally,65.0)
	arrived = 0
	for u in rally:
		if u.world.distance_to(u.slot)<6.0:
			arrived += 1
	check(arrived==14 and _gap(rally,false)>21.5,"rally recruits walk around the building and settle apart (%d/14)" % arrived)
	var saved := SaveGame.capture(battle)
	var old_slots := {}
	for u in recruits+rally:
		old_slots[u.id] = u.slot
	SaveGame.restore(battle,saved)
	var restored := true
	for id: int in old_slots:
		restored = restored and battle.unit_by_id(id).slot == old_slots[id]
	check(restored,"save/load preserves the individual waiting positions")
	battle.spawn_trained(depot,"infantry")
	var newest: Unit = battle.units[-1]
	var free := true
	for id: int in old_slots:
		free = free and newest.slot.distance_to(old_slots[id])>=27.9
	check(free,"a recruit trained after loading does not reuse a reserved position")
	check(battle.quick_plan(depot)["ok"] and battle.quick_regiment(depot)!=null,"the spaced recruits can still form a battalion")
	print("GODOT_RECRUITS ",JSON.stringify({"failures":failures}))
	battle.queue_free()
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _run(men: Array[Unit],seconds: float) -> void:
	for i in int(seconds/0.05):
		battle.combat_space.rebuild(battle.units)
		for u in men:
			u.step(0.05)
		battle._keep_apart()


func _gap(men: Array[Unit],slots: bool) -> float:
	var gap := INF
	for i in men.size():
		for j in range(i+1,men.size()):
			gap = minf(gap,(men[i].slot if slots else men[i].world).distance_to(men[j].slot if slots else men[j].world))
	return gap


func _picture(at: Vector2) -> void:
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		return
	battle.fog.enabled = false
	battle.fog.refresh()
	battle.set_view_3d(true)
	battle.view3d.view(at,-15.0,46.0,32.0)
	for i in 3:
		await process_frame
	await RenderingServer.frame_post_draw
	root.get_texture().get_image().save_png(out.path_join("recruit_muster.png"))
	battle.set_view_3d(false)
	await process_frame
