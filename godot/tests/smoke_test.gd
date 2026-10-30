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

	var deer := 0
	for a in battle.wildlife.animals:
		if a["kind"] != "rabbit":
			deer += 1
	_check(deer >= 6 and battle.wildlife.animals.size() > deer + 10, "deer by the woods and rabbits in the meadows (%d animals)" % battle.wildlife.animals.size())
	var startled: Dictionary = battle.wildlife.animals[0]
	battle.wildlife.alarm(startled["world"])
	_check(startled["state"] == "run", "gunfire sends them running")

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

	# Holding ground: the line braces, digs a trench and is covered in it.
	regiment.set_formation("line")
	regiment.hold = true
	_run(battle, 42.0)
	var trench: Variant = regiment.trench
	_check(trench != null and trench["progress"] >= 1.0, "a battalion holding its ground digs a trench (%s)" % (trench["progress"] if trench != null else "none"))
	var digger: Unit = null
	for u in regiment.living():
		if u.type == "infantry" and battle.trenches.trench_at(u.world) != null:
			digger = u
	var ahead: Vector2 = Vector2.from_angle(regiment.facing) * 150.0
	_check(digger != null and battle.trenches.cover(digger, digger.world + ahead) < 0.6
		and battle.trenches.cover(digger, digger.world - ahead) > 0.6, "the trench covers its men from the front, not from behind")
	battle.economy["france"]["wood"] += 200.0
	_check(battle.trenches.upgrade(regiment), "the trench is revetted for wood")
	_run(battle, 12.0)
	_check(trench != null and trench["level"] == 2, "and becomes a revetted trench (level %s)" % (trench["level"] if trench != null else 0))
	regiment.hold = false

	# Morale: a shaken battalion breaks and runs, and rallies once out of danger.
	var shaken_men: Array[Unit] = []
	var quiet := home + Vector2(300, -500)
	for i in 14:
		shaken_men.append(battle.add_unit("france", "infantry", quiet + Vector2(i * 15, 0)))
	shaken_men.append(battle.add_unit("france", "officer", quiet + Vector2(100, 30)))
	shaken_men.append(battle.add_unit("france", "drummer", quiet + Vector2(120, 30)))
	var shaken := battle.form_regiment(shaken_men)
	_run(battle, 1.0)
	for u in shaken.living():
		u.morale = 8.0
	_run(battle, 0.5)
	_check(shaken.routing, "a battalion whose morale gives way breaks and runs")
	_run(battle, 40.0)
	_check(not shaken.routing and shaken.morale() >= Regiment.RALLY_MORALE - 10.0, "and rallies once out of danger (morale %d)" % shaken.morale())

	# Fire from behind hits harder than fire from the front.
	var target_man: Unit = null
	for u in shaken.living():
		if u.type == "infantry":
			target_man = u
	var front_way := Vector2.from_angle(shaken.facing) * 120.0
	var hp_before := target_man.hp
	battle.strike(target_man, 10.0, target_man.world + front_way)
	var front_loss := hp_before - target_man.hp
	hp_before = target_man.hp
	battle.strike(target_man, 10.0, target_man.world - front_way)
	_check(is_equal_approx(front_loss, 10.0) and is_equal_approx(hp_before - target_man.hp, 15.0), "a battalion takes half as much again from the rear")

	# Open order: the tirailleurs spread out and are harder to hit.
	var width := func(r: Regiment) -> float:
		var lo := INF
		var hi := -INF
		var sideways := Vector2.from_angle(r.facing).orthogonal()
		for u in r.living():
			lo = minf(lo, u.slot.dot(sideways))
			hi = maxf(hi, u.slot.dot(sideways))
		return hi - lo
	var closed: float = width.call(shaken)
	shaken.set_skirmish(true)
	var spread_out: float = width.call(shaken)
	hp_before = target_man.hp
	battle.strike(target_man, 10.0, target_man.world + front_way)
	_check(spread_out > closed * 1.8 and hp_before - target_man.hp < 7.5, "tirailleurs spread out (%d to %d px) and are harder to hit" % [closed, spread_out])
	shaken.set_skirmish(false)

	# A regiment of horse: hussars and an officer on horseback, no drummer.
	var riders: Array[Unit] = []
	for i in 6:
		riders.append(battle.add_unit("france", "cavalry", quiet + Vector2(i * 30, 200), "hussar"))
	riders.append(battle.add_unit("france", "officer", quiet + Vector2(90, 240), "mounted"))
	var squadron := battle.form_regiment(riders)
	_check(squadron != null and squadron.kind == "cavalry" and squadron.strength() == 7, "six hussars and a mounted officer form a regiment of horse")
	if squadron != null:
		squadron.set_formation("square")
		_check(squadron.formation != "square" and squadron.morale() > 75.0, "horse forms no square, and misses no drummer")

	# Peasants sent to work with a button: to the wood by the lumber camp.
	var hand: Unit = null
	for u in battle.units:
		if u.side == "france" and u.type == "worker" and u.alive():
			hand = u
	var just_hand: Array[Unit] = [hand]
	battle.select_units(just_hand)
	battle.assign_workers("wood")
	_check(hand.task == "gather" and hand.task_target is Supply and (hand.task_target as Supply).kind == "wood", "a peasant is sent to cut wood with a button")

	# A gun loads grapeshot: a cone of balls at close range, from its own stock.
	var battery := battle.add_unit("france", "artillery", quiet + Vector2(-300, 400))
	var close_foe := battle.add_unit("britain", "infantry", battery.world + Vector2(80, 0))
	var just_gun: Array[Unit] = [battery]
	battle.select_units(just_gun)
	battle.toggle_shot()
	var foe_hp := close_foe.hp
	battle._on_fired(battery, close_foe)
	_check(battery.shot == "grape" and battery.reach() < 150.0 and battery.ammo["grape"] == 9 and close_foe.hp < foe_hp,
		"grapeshot sweeps the men before the gun (%d grape left)" % battery.ammo["grape"])
	close_foe.hit(1000.0)
	var nobody: Array[Unit] = []
	battle.select_units(nobody)

	# The barracks: a rally point, a quick battalion from the men around it,
	# and what is missing trained with Auto-bataljon on.
	var depot := battle.add_building("france", "barracks", home + Vector2(-350, 900), true)
	depot.rally = depot.world + Vector2(120, 160)
	for i in 6:
		battle.add_building("france", "house", depot.world + Vector2(-200, i * 70 - 200), true)
	battle.spawn_trained(depot, "infantry")
	var newest: Unit = battle.units[battle.units.size() - 1]
	_check(newest.slot.distance_to(depot.rally) < 60.0, "a trained man goes to the rally point")
	var gathered: Array[Unit] = [newest]
	for i in 11:
		gathered.append(battle.add_unit("france", "infantry", depot.rally + Vector2(i * 14, 30)))
	gathered.append(battle.add_unit("france", "officer", depot.rally + Vector2(0, 60)))
	_check(not battle.quick_plan(depot)["ok"] and battle.quick_plan(depot)["missing"]["drummer"] == 1, "the barracks names what is missing (a drummer)")
	battle.economy["france"]["food"] += 500.0
	battle.economy["france"]["wood"] += 500.0
	_check(battle.train_missing(depot) >= 1 and depot.auto_regiment, "and trains it, with Auto-bataljon on")
	var before_count := battle.regiments.size()
	_run(battle, 12.0)
	_check(battle.regiments.size() == before_count + 1, "the barracks forms the battalion by itself once the drummer is ready")

	# An order takes a moment to reach a battalion.
	var ordered: Array[Regiment] = [shaken]
	var goal_spot := shaken.centroid() + Vector2(120, 0)
	battle._order_battalions(ordered, goal_spot, 0.0)
	_check(shaken.destination.distance_to(goal_spot) > 50.0, "an order is on its way, not there at once")
	_run(battle, battle.order_delay(shaken.centroid(), "france") + 0.2)
	_check(shaken.destination.distance_to(goal_spot) < 50.0, "and reaches the battalion")

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
