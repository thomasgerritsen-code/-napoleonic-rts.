extends SceneTree
## The British commander builds the Godot game's own buildings too: a
## campaign battle left to run twelve minutes, the British base then holds
## a sawmill, a headquarters and more of them.
##
##   godot --headless --path godot --script res://tests/ai_buildings_test.gd

const STEP := 0.25
const MINUTES := 12.0


func _initialize() -> void:
	Battle.mode = "campaign"
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	# The British left to build: no waves against France meanwhile.
	battle.ai.set("_next_wave", 1.0e9)
	for i in int(MINUTES * 60.0 / STEP):
		battle._process(STEP)
	var built: Array[String] = []
	for b in battle.buildings:
		if b.side == "britain" and b.standing() and Rules.OWN_BUILDINGS.has(b.type) and not built.has(b.type):
			built.append(b.type)
	built.sort()
	var ok := built.has("sawmill") and built.size() >= 3
	print(("ok   " if ok else "FAIL ") + "the British build the new buildings too (%s after %d minutes)" % [", ".join(built), int(MINUTES)])
	print("AI_BUILDINGS ", "passed" if ok else "FAILED")
	quit(0 if ok else 1)
