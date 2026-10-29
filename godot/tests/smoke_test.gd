extends SceneTree
## Headless check, run by CI:
##   godot --headless --path godot --script res://tests/smoke_test.gd
## The web game's opening loads; peasants gather food, build a lumber camp and
## cut wood; the town centre trains a peasant; musketeers with an officer and
## a drummer form a battalion that marches; the computer develops its base;
## and two battalions within range fight.

const LIMIT_MS := 150000
const STEP := 0.1

var _failures: Array[String] = []


func _initialize() -> void:
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	# The scene is set up once the main loop runs its first frame.
	await process_frame
	await process_frame

	var start := Rules.start()
	var towns := 0
	for b in battle.buildings:
		if b.type == "towncenter":
			towns += 1
	_check(towns == 2, "both town centres stand")
	_check(battle.units.size() == start["units"].size(), "the opening's %d peasants are there" % battle.units.size())
	_check(battle.supplies.size() == start["resources"].size(), "the map's %d resources are there" % battle.supplies.size())
	_check(battle.houses.size() > 20, "the villages' %d houses are there" % battle.houses.size())
	var point := Vector2(4500, 3200)
	_check(Iso.to_world(Iso.to_screen(point)).distance_to(point) < 1.0, "screen to world inverts world to screen")

	battle.fog.refresh()
	_check(battle.fog.sees(battle.town_centre("france").world), "France sees its own base")
	_check(not battle.fog.sees(battle.town_centre("britain").world) and not battle.town_centre("britain").visible,
		"the British base lies hidden in the fog")

	# The river: a man sent across it goes over a bridge, never through the water.
	var walker := battle.add_unit("france", "infantry", Vector2(1100, 1900))
	var across := Vector2(2200, 1900)
	_check(Nav.route(walker.world, across).size() == 3, "a route across the river goes by a bridge")
	walker.move_to(across)
	var wet := false
	for i in int(90.0 / STEP):
		battle._process(STEP)
		wet = wet or Nav.in_water(walker.world)
	_check(walker.world.distance_to(across) < 20.0 and not wet, "and the man crossed dry-shod (at %s, wet: %s)" % [walker.world, wet])

	# Food: every French peasant to the nearest bush.
	var french: Array[Unit] = []
	for u in battle.units:
		if u.side == "france":
			french.append(u)
	var food := float(battle.economy["france"]["food"])
	for u in french:
		u.set_task("gather", battle.nearest_supply(u.world, "food", "france"))
	_run(battle, 60.0)
	var gathered := float(battle.economy["france"]["food"]) - food
	_check(gathered > 50.0, "peasants gathered and delivered food (+%d)" % gathered)

	# Wood: a lumber camp by the nearest wood, built, then trees cut.
	var home := battle.town_centre("france").world
	var camp: Building = null
	var tree: Supply = null
	var best := INF
	for s in battle.supplies:
		if s.kind == "wood" and s.world.distance_to(home) < best:
			best = s.world.distance_to(home)
			tree = s
	for ring in range(1, 12):
		for i in 16:
			var at := tree.world + Vector2.from_angle(TAU * i / 16.0) * ring * 40.0
			if camp == null and battle.site_for("lumbercamp", at) != null:
				camp = battle.lay_out("france", "lumbercamp", at, french)
	_check(camp != null, "a lumber camp was laid out by the wood")
	_run(battle, 40.0)
	_check(camp != null and camp.complete, "the peasants built the lumber camp")
	var wood := float(battle.economy["france"]["wood"])
	_run(battle, 60.0)
	_check(float(battle.economy["france"]["wood"]) > wood + 40.0, "peasants cut and delivered wood")

	# Training.
	var people := battle.pop_used("france")
	_check(battle.queue_unit(battle.town_centre("france"), "worker"), "the town centre takes a peasant to train")
	_run(battle, 10.0)
	_check(battle.pop_used("france") == people + 1, "and the peasant came out")

	# A battalion.
	var company: Array[Unit] = []
	var muster := home + Vector2(500, 300)
	for i in 14:
		company.append(battle.add_unit("france", "infantry", muster + Vector2(i * 16, 0)))
	company.append(battle.add_unit("france", "officer", muster + Vector2(0, 30)))
	company.append(battle.add_unit("france", "drummer", muster + Vector2(20, 30)))
	var regiment := battle.form_regiment(company)
	_check(regiment != null and regiment.men.size() == 16, "fourteen musketeers, an officer and a drummer form a battalion")
	var from := regiment.centroid()
	regiment.order_move(from + Vector2(250, 0))
	_run(battle, 12.0)
	_check(regiment.centroid().distance_to(from) > 200.0 and not regiment.moving(), "the battalion marched and stands in line")

	# A square, and new men filling the ranks.
	regiment.set_formation("square")
	_run(battle, 8.0)
	var centre := regiment.centroid()
	var faces := {}
	for u in regiment.living():
		if u.type == "infantry":
			faces[Iso.direction((u.world - centre).angle() - regiment.facing)] = true
	_check(faces.size() >= 4 and not regiment.moving(), "the battalion forms a square facing every way (%d directions)" % faces.size())
	regiment.set_formation("line")
	var recruits: Array[Unit] = []
	for i in 6:
		recruits.append(battle.add_unit("france", "infantry", regiment.centroid() + Vector2(-60, i * 16)))
	var before := regiment.strength()
	_check(regiment.reinforce(recruits) == 6 and regiment.strength() == before + 6, "six recruits fill the battalion's ranks")
	_run(battle, 10.0)

	# Troop kinds: their factors and their own coats.
	var grenadier := battle.add_unit("france", "infantry", home + Vector2(600, 500), "grenadier")
	var cuirassier := battle.add_unit("france", "cavalry", home + Vector2(640, 500), "cuirassier")
	var gun := battle.add_unit("france", "artillery", home + Vector2(680, 500), "heavy12")
	var mounted := battle.add_unit("france", "officer", home + Vector2(720, 500), "mounted")
	_check(is_equal_approx(grenadier.max_hp, 140.0) and is_equal_approx(cuirassier.max_hp, 155.0 * 1.5), "grenadiers and cuirassiers have their extra strength")
	_check(gun.reach() > 305.0 and mounted.speed > 60.0 * 1.6, "a 12-pounder reaches further, a mounted officer rides fast")
	var french_barracks := Rules.trained_at("barracks", "france")
	_check(french_barracks.has("infantry:guard") and not Rules.trained_at("barracks", "britain").has("infantry:guard")
		and Rules.trained_at("stable", "france").has("officer:mounted"), "the barracks and stable offer each side its own troop kinds")
	_check(Rules.item_cost("infantry:grenadier").get("food", 0) == 140.0, "a grenadier costs the musketeer's price and his extra")

	# A tower strengthened to level 2: more health, further reach, and it sees further.
	var tower := battle.add_building("france", "tower", home + Vector2(-200, 380), true)
	battle.economy["france"]["wood"] += 400.0
	battle.economy["france"]["iron"] += 100.0
	var sight := battle.fog.vision(tower) if battle.fog != null else 420.0
	_check(battle.upgrade_tower(tower) and not battle.upgrade_tower(tower), "a tower starts its upgrade once")
	_run(battle, 21.0)
	_check(tower.tower_level == 2 and is_equal_approx(tower.max_hp, 1600.0) and tower.upgrade_to == 0, "the tower is strengthened to level 2 (%d hp)" % tower.max_hp)
	_check(battle.fog == null or battle.fog.vision(tower) > sight, "and sees further from it")

	# The wounded: a musketeer falls wounded, a stretcher team brings him to the
	# field hospital, and once mended he marches back to his battalion.
	var hospital := battle.add_building("france", "hospital", regiment.centroid() + Vector2(-260, 0), true)
	for i in 4:
		battle.add_building("france", "house", hospital.world + Vector2(-160, i * 70 - 100), true)
	var casualty: Unit = null
	for u in regiment.living():
		if u.type == "infantry":
			casualty = u
	casualty.hit(1000.0)
	battle.medics.wound(casualty)
	_check(casualty.wound == "lying", "a fallen musketeer lies wounded")
	_run(battle, 20.0)
	_check(casualty.wound in ["carried", "healing"], "a stretcher team carries him in (%s)" % casualty.wound)
	var strength := regiment.strength()
	_run(battle, 50.0)
	_check(battle.medics.stats["healed"] >= 1 and regiment.strength() == strength + 1,
		"he is mended and back in the ranks (%s)" % battle.medics.stats)

	# The computer.
	_run(battle, 120.0)
	var british_buildings := 0
	for b in battle.buildings:
		if b.side == "britain" and b.standing():
			british_buildings += 1
	_check(british_buildings >= 2, "the computer built (%d buildings)" % british_buildings)
	_check(battle.pop_used("britain") > 6, "and trained (%d people)" % battle.pop_used("britain"))

	# A fight: a British battalion set down within musket range.
	var enemies: Array[Unit] = []
	var there := regiment.centroid() + Vector2(170, 0)
	for i in 14:
		enemies.append(battle.add_unit("britain", "infantry", there + Vector2(0, i * 16 - 100)))
	enemies.append(battle.add_unit("britain", "officer", there + Vector2(30, 0)))
	enemies.append(battle.add_unit("britain", "drummer", there + Vector2(30, 20)))
	var foe := battle.form_regiment(enemies)
	_check(foe != null, "a British battalion forms")
	_run(battle, 60.0)
	var fallen := {"france": 0, "britain": 0}
	for u in battle.units:
		if not u.alive():
			fallen[u.side] += 1
	_check(fallen["france"] > 0 and fallen["britain"] > 0, "both battalions lost men in the firefight (%s)" % fallen)

	print("GODOT_SMOKE ", JSON.stringify({"food": gathered, "economy": battle.economy, "fallen": fallen,
		"pop": {"france": battle.pop_used("france"), "britain": battle.pop_used("britain")}, "plan": battle.ai.plan}))
	battle.queue_free()
	await process_frame

	# The test field: large armies, no economy; the British advance and fight.
	Battle.mode = "lab"
	var lab: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(lab)
	await process_frame
	await process_frame
	_check(lab.regiments.size() == 2 * Battle.LAB_BATTALIONS, "the test field has %d battalions" % lab.regiments.size())
	_run(lab, 90.0)
	var lab_fallen := 0
	for u in lab.units:
		if not u.alive():
			lab_fallen += 1
	_check(lab_fallen > 10, "and on the test field the armies met and fought (%d fallen)" % lab_fallen)
	lab.queue_free()
	await process_frame
	Battle.mode = "campaign"
	AtlasLibrary.clear()
	for failure in _failures:
		printerr("FAILED: ", failure)
	quit(1 if _failures.size() > 0 else 0)


func _run(battle: Battle, seconds: float) -> void:
	for i in int(seconds / STEP):
		battle._process(STEP)


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
