extends SceneTree
## Headless check, run by CI:
##   godot --headless --path godot --script res://tests/smoke_test.gd
## The battle loads with both armies, the projection inverts, an order moves a
## battalion in line, and left alone the armies close and fight.

const LIMIT_MS := 120000

var _failures: Array[String] = []


func _initialize() -> void:
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	# The scene is set up once the main loop runs its first frame.
	await process_frame
	await process_frame

	_check(battle.regiments.size() == 6, "six battalions on the field")
	var men := 0
	for r in battle.regiments:
		men += r.strength()
	_check(men == 6 * Battle.MEN, "every battalion at full strength (%d men)" % men)

	var point := Vector2(4500, 3200)
	var back := Iso.to_world(Iso.to_screen(point))
	_check(back.distance_to(point) < 1.0, "screen to world inverts world to screen (%s)" % back)

	var french: Regiment = battle.regiments[0]
	var start := french.centroid()
	var pick: Array[Regiment] = [french]
	battle._select(pick, false)
	battle._order(start + Vector2(-220, 0), null)
	for i in 160:
		battle._process(0.05)
	var moved := french.centroid().distance_to(start)
	_check(moved > 170.0, "the ordered battalion marched (%.0f px)" % moved)
	_check(not french.moving(), "and stands in its new line")

	var fallen := {"france": 0, "britain": 0}
	for i in 3600:
		battle._process(0.05)
	for r in battle.regiments:
		for s in r.soldiers:
			if not s.alive():
				fallen[r.side] += 1
	_check(fallen["france"] > 0 and fallen["britain"] > 0, "both sides lost men in the fight (%s)" % fallen)

	print("GODOT_SMOKE ", JSON.stringify({"men": men, "moved": moved, "fallen": fallen, "result": battle.result}))
	for failure in _failures:
		printerr("FAILED: ", failure)
	quit(1 if _failures.size() > 0 else 0)


## A script error stops _initialize before it quits; this ends the run anyway.
func _process(_delta: float) -> bool:
	if Time.get_ticks_msec() > LIMIT_MS:
		printerr("FAILED: the check did not finish (see the errors above)")
		quit(2)
	return false


func _check(ok: bool, what: String) -> void:
	print(("ok   " if ok else "FAIL ") + what)
	if not ok:
		_failures.append(what)
