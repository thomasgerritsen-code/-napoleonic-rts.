extends SceneTree
## The learning battle played through as a player would: each step's card
## comes, the step is done, the next comes, and it ends on the end screen.
##
##   godot --headless --path godot --script res://tests/tutorial_test.gd

const STEP := 0.1
var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.mode = "tutorial"
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	var t := battle.tutorial
	check(t != null and t.step == 0, "the learning battle opens on its first step")
	var home := battle.town_centre(battle.me).world
	var worker: Unit = null
	for u in battle.units:
		if u.side == battle.me and u.type == "worker" and u.alive():
			worker = u
			break
	# 1: a peasant selected.
	battle.select_units([worker] as Array[Unit])
	_run(battle, 1.6)
	check(t.step == 1, "selecting a peasant is step one done")
	# 2: to work.
	var bush := battle.nearest_supply(worker.world, "food", battle.me)
	if bush != null:
		worker.set_task("gather", bush)
	else:
		battle.assign_workers("farm")
	_run(battle, 1.6)
	check(t.step == 2, "setting the peasants to work is step two done")
	# 3: a barracks laid out.
	var laid: Building = null
	for spot: Vector2 in [Vector2(-420, 320), Vector2(420, -320), Vector2(-500, -300), Vector2(500, 420), Vector2(0, 600), Vector2(700, 0)]:
		laid = battle.lay_out(battle.me, "barracks", home + spot, [worker] as Array[Unit])
		if laid != null:
			break
	_run(battle, 1.6)
	check(laid != null and t.step == 3, "laying out a barracks is step three done")
	# 4: the battalion that joins, selected.
	var ours: Regiment = t.get("_ours")
	check(ours != null, "a battalion joins")
	battle.select_units(ours.living())
	_run(battle, 1.6)
	check(t.step == 4, "selecting it is step four done")
	# 5: marched.
	battle.order(ours.centroid() + Vector2(160, 40))
	_run(battle, 1.6)
	check(t.step == 5, "marching it is step five done")
	# 6 and 7: square, and line again.
	battle.set_formation("square")
	_run(battle, 1.6)
	check(t.step == 6, "forming square is step six done")
	battle.set_formation("line")
	_run(battle, 1.6)
	check(t.step == 7, "line again is step seven done")
	# 8: the British battalion comes on and is beaten.
	var theirs: Regiment = t.get("_theirs")
	check(theirs != null and theirs.side != battle.me, "a British battalion comes on")
	for i in int(240.0 / STEP):
		battle._process(STEP)
		if battle.result != "":
			break
	check(battle.result == "Leerslag voltooid!", "beating it ends the learning battle (%s · %s · ours %d at %s, theirs %d at %s%s)" % [
		battle.result, battle.status, ours.strength(), ours.centroid().round(), theirs.strength(), theirs.centroid().round(), " routing" if theirs.routing else ""])
	print("TUTORIAL ", "passed" if failures.is_empty() else "FAILED: " + ", ".join(failures))
	quit(1 if not failures.is_empty() else 0)


func _run(battle: Battle, seconds: float) -> void:
	for i in int(seconds / STEP):
		battle._process(STEP)
