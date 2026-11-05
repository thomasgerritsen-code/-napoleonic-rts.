extends SceneTree
## The quick battles played out: each sets up on dry ground on the right
## banks, its card shows, and it ends, won or lost, within its time.
##
##   godot --headless --path godot --script res://tests/quick_battle_test.gd

const STEP := 0.1
var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	for q: Dictionary in QuickBattle.LIST:
		if OS.get_environment("QUICK_ONLY") in ["", q["id"]]:
			await _play(q["id"])
	print("QUICK ", "passed" if failures.is_empty() else "FAILED: " + ", ".join(failures))
	quit(1 if not failures.is_empty() else 0)


func _play(id: String) -> void:
	Battle.mode = "quick"
	Battle.quick_id = id
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	var q := battle.quick
	var wet := 0
	var ours := 0
	for u in battle.units:
		if u.military() and u.world.distance_to(q.point) < 1600.0:
			if Nav.in_water(u.world):
				wet += 1
			if u.side == battle.me:
				ours += 1
	check(q != null and ours >= 30 and wet == 0, "%s: the armies stand on dry ground (%d of ours, %d in water)" % [id, ours, wet])
	check(Nav.bank(q.point) == Nav.bank(battle.regiments[0].centroid()) or id != "brug",
		"%s: ours hold the bridge's own bank" % id)
	# Play it as a player would: hold at the bridge; march on the hamlet;
	# advance on the British in the open.
	var mine: Array[Regiment] = []
	for r in battle.regiments:
		if r.side == battle.me:
			mine.append(r)
	if id == "dorp":
		for i in mine.size():
			mine[i].order_move(q.point + Vector2(0, (i - 1) * 90.0), PI)
	elif id == "veld":
		for r in mine:
			r.order_move(r.centroid() + Vector2(700, 0), 0.0)
	var t := 0.0
	while battle.result == "" and t < q.limit + 5.0:
		battle._process(STEP)
		t += STEP
		if OS.get_environment("QUICK_TRACE") != "" and int(t * 10) % 300 == 0:
			var lines: Array[String] = []
			for r in battle.regiments:
				lines.append("%s %s %d %s%s" % [r.side.left(2), r.centroid().round(), r.strength(), "E" if r.enemy != null else "-", "R" if r.routing else ""])
			print("t=%d %s" % [int(t), " | ".join(lines)])
		if id == "dorp" and int(t * 10) % 300 == 0:
			for i in mine.size():
				if not mine[i].destroyed() and mine[i].enemy == null:
					mine[i].order_move(q.point + Vector2(0, (i - 1) * 90.0), PI)
	check(battle.result != "", "%s: it ends within its time (%s after %d s: %s · men %d against %d)" % [id, battle.result, int(t), battle.status,
		q._army(battle.me), q._army(q._foe())])
	battle.queue_free()
	await process_frame
	Battle.mode = "campaign"
