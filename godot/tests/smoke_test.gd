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
	# The menu: a start page with Singleplayer, Multiplayer and Updates, each
	# opening its own page with a way back.
	var menu: Control = load("res://scenes/menu.tscn").instantiate()
	root.add_child(menu)
	await process_frame
	await process_frame
	var pages: Dictionary = menu.get("_pages")
	_check(pages.size() == 4 and (pages["start"] as Control).visible and not (pages["single"] as Control).visible,
		"the menu opens on its start page")
	menu.call("_show", "multi")
	_check((pages["multi"] as Control).visible and not (pages["start"] as Control).visible, "and Multiplayer opens its own page")
	menu.call("_show", "start")
	menu.queue_free()
	await process_frame

	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	# The scene is set up once the main loop runs its first frame.
	await process_frame
	await process_frame

	# The computer builds and trains as ever, but sends no attack waves while
	# the features are checked (one would sweep through the test men).
	battle.ai.set("_next_wave", 1.0e9)

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

	# The updater: a higher build is newer; a copy not built by GitHub is a development copy.
	_check(Updater.newer({"build": 41}, {"build": 40}) and not Updater.newer({"build": 40}, {"build": 40})
		and Updater.label({"build": 0}) == "ontwikkelversie" and Updater.label({"build": 7, "date": "2026-10-30"}) == "build 7 (2026-10-30)",
		"the updater tells a newer build from this one")

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
	# Marching as a body: formed up, the whole battalion steps off together,
	# keeps its ranks on the way and arrives as one.
	var march_from := regiment.centroid()
	var march_to := march_from + Vector2(0, 320)
	regiment.order_move(march_to, regiment.facing)
	_run(battle, 4.0)
	var straggle := 0.0
	for u in regiment.living():
		straggle = maxf(straggle, u.world.distance_to(u.slot))
	var gone := regiment.centroid().distance_to(march_from)
	_check(regiment.marching() and straggle < 30.0 and gone > 30.0, "a battalion marches as a body, its men in their places (%.0f px out, %.0f px on)" % [straggle, gone])
	_run(battle, 20.0)
	_check(not regiment.moving() and regiment.centroid().distance_to(march_to) < 25.0, "and arrives formed where it was sent")
	regiment.order_move(march_from, regiment.facing)
	_run(battle, 20.0)
	# The feet go with the ground covered, as in the web game: a step cycle
	# every 1.5 m, standing again once he stops; a slight turn does not
	# change the way he is shown.
	var pacer := battle.add_unit("france", "worker", home + Vector2(300, 640))
	pacer.facing = 0.0
	pacer.present(0.02)
	var frames_seen := {}
	for i in 50:
		pacer.world += Vector2(1.35, 0.0)
		pacer.present(0.02)
		frames_seen[pacer._sprite.frame] = true
	var cycle: float = pacer.get("_step_phase")
	var striding: bool = pacer.get("_striding")
	var walking_look := String(pacer._sprite.animation)
	pacer.facing = 0.45
	pacer.present(0.02)
	var kept := pacer.shown_direction()
	for i in 20:
		pacer.present(0.02)
	_check(striding and walking_look == "march_e" and frames_seen.size() >= 5 and kept == "e"
		and String(pacer._sprite.animation).begins_with("idle"), "a man's steps follow the ground he covers, and he stands once he stops (%s, %d frames, %.2f)" % [walking_look, frames_seen.size(), cycle])
	pacer.queue_free()
	battle.units.erase(pacer)
	# Dragging an order out with the right button sets where the battalion
	# goes and the way its front faces; a golden arrow shows it meanwhile.
	battle.select_units(regiment.living())
	var drag_from := regiment.centroid() + Vector2(0, 120)
	var to_view := battle.get_viewport().get_canvas_transform()
	var press := InputEventMouseButton.new()
	press.button_index = MOUSE_BUTTON_RIGHT
	press.pressed = true
	press.position = to_view * Iso.to_screen(drag_from)
	root.push_input(press)
	var sweep := InputEventMouseMotion.new()
	sweep.position = to_view * Iso.to_screen(drag_from + Vector2(0, 140))
	root.push_input(sweep)
	var aimed: bool = battle.get("_overlay").get("_aim_at") != Vector2.INF
	var let_go := InputEventMouseButton.new()
	let_go.button_index = MOUSE_BUTTON_RIGHT
	let_go.pressed = false
	let_go.position = sweep.position
	root.push_input(let_go)
	_run(battle, 14.0)
	_check(aimed and absf(angle_difference(regiment.facing, PI / 2.0)) < 0.05 and regiment.centroid().distance_to(drag_from) < 30.0,
		"a dragged order sends the battalion there, its front the way it was dragged (facing %.2f)" % regiment.facing)
	regiment.order_move(march_from, 0.0)
	_run(battle, 15.0)
	battle.select_units([] as Array[Unit])
	# Over the river, as the British commander sends his battalions: a leg of
	# at most 900 px whenever it stands. A line crosses the bridge in column
	# and forms line beyond; nobody stays standing on the bridge.
	# (At the bridge furthest from the French, so it fights nobody.)
	var crossing := Nav.bridges()[0]
	for b in Nav.bridges():
		if Vector2(b["west"]).distance_to(home) > Vector2(crossing["west"]).distance_to(home):
			crossing = b
	var far_bank: Vector2 = Vector2(crossing["east"]) + Vector2(300, 60)
	var redcoats: Array[Unit] = []
	for i in 24:
		redcoats.append(battle.add_unit("britain", "infantry", far_bank + Vector2((i % 12) * 15, (i / 12) * 19)))
	redcoats.append(battle.add_unit("britain", "officer", far_bank + Vector2(90, -30)))
	redcoats.append(battle.add_unit("britain", "drummer", far_bank + Vector2(90, 50)))
	var wading := battle.form_regiment(redcoats)
	var across_to: Vector2 = Vector2(crossing["west"]) + Vector2(-350, 40)
	var columned := false
	for second in 80:
		if not wading.moving():
			var here_now := wading.centroid()
			wading.order_move(here_now + (across_to - here_now).limit_length(900.0), (across_to - here_now).angle())
		columned = columned or wading.formation == "column"
		_run(battle, 1.0)
	var left_behind := 0
	for u in wading.living():
		if Nav.bank(u.world) > 0 or Nav.on_bridge(u.world):
			left_behind += 1
	_check(wading.centroid().distance_to(across_to) < 60.0 and left_behind == 0 and columned and wading.formation == "line",
		"a battalion crosses the bridge in column and forms line beyond it (%.0f px off, %d left behind)" % [wading.centroid().distance_to(across_to), left_behind])
	for u in wading.living():
		u.hit(100000.0)
	# Smoke, earth and dust as particles worked out on the graphics card.
	var fx_before: int = battle.effects.emitted
	battle.call("_puff", home + Vector2(300, 600), 0.55, 2.6, Vector2(1, 0))
	battle.call("_earth", home + Vector2(320, 600), 1.0)
	battle.effects.dust(Iso.to_screen(home + Vector2(340, 600)))
	_check(battle.effects.emitted == fx_before + 2 and battle.effects.alive("smoke") > 0 and battle.effects.alive("earth") > 0
		and battle.effects.alive("dust") > 0, "a shot leaves smoke, a strike throws up earth, a horse raises dust")
	# Light: a shot flashes; by night the field darkens and the windows glow.
	var flashes_before: int = battle.lights.flashed
	battle.call("_puff", home + Vector2(300, 600), 0.55, 2.6, Vector2(1, 0))
	var day_clock := battle.clock
	var day_light := DayNight.light_at(60.0)
	battle.clock = 330.0
	var night_light := DayNight.light_at(battle.clock)
	battle.lights.call("_tend_lamps")
	var lit := battle.lights.lamps()
	battle.clock = 60.0
	battle.lights.call("_tend_lamps")
	var unlit := battle.lights.lamps()
	battle.clock = day_clock
	_check(battle.lights.flashed == flashes_before + 1 and night_light.v < day_light.v * 0.7 and lit >= 3
		and unlit == 0, "a shot flashes; at night the field darkens and %d windows glow" % lit)

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

	# The grain field and the lumber camp wear their Blender pictures; the
	# field ripens from green shoots to golden wheat.
	var acre := battle.add_building("france", "farm", home + Vector2(-420, -300), true)
	var young_look: String = acre.get("_shown_field")
	acre.crop = Rules.FARM_CAPACITY
	acre.call("_show_field")
	_check(young_look == "field_young" and acre.get("_shown_field") == "field_ripe", "a field ripens from green shoots to golden wheat")
	var sawpit := battle.add_building("france", "lumbercamp", home + Vector2(-420, -520), true)
	var shown: Sprite2D = sawpit.get("_sprite")
	_check(shown != null and shown.texture.resource_path.ends_with("lumbercamp_fr.webp"), "the lumber camp wears its Blender picture")

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
	# In the trench the men stand lower, cut off below its near lip; the front
	# rank leans on the bank (its muskets over it); officer and drummer at the ends.
	battle.trenches._process(0.0)
	var leaning_men := 0
	var sunk_men := 0
	for u in regiment.living():
		if u.leaning:
			leaning_men += 1
		if u.get("_cut") != null and (u.get("_sprite") as AnimatedSprite2D).position.y > 4.0:
			sunk_men += 1
	_check(leaning_men >= 3 and sunk_men >= 6, "the front rank leans on the bank and the men stand down in the trench (%d leaning, %d sunk)" % [leaning_men, sunk_men])
	var trench_end := false
	for u in regiment.living():
		if u.type == "drummer" and u.slot.distance_to(Vector2(trench["centre"])) > float(trench["length"]) / 2.0 - float(trench["width"]):
			trench_end = true
	_check(trench_end, "the drummer stands at an end of the trench")
	var soaked: Dictionary = trench.duplicate()
	if not Nav.bridges().is_empty():
		soaked["centre"] = Vector2(Nav.bridges()[0]["west"]).lerp(Nav.bridges()[0]["east"], 0.5)
	else:
		soaked["centre"] = Vector2(Nav.river_x(0.0), 0.0)
	_check(not battle.trenches._dry(soaked) and battle.trenches._dry(trench), "no trench is dug in the river or across a bridge")
	# A second battalion sent into the trench forms a second line behind it.
	var second_line: Array[Unit] = []
	for i in 12:
		second_line.append(battle.add_unit("france", "infantry", Vector2(trench["centre"]) + Vector2(-300, i * 15)))
	second_line.append(battle.add_unit("france", "officer", Vector2(trench["centre"]) + Vector2(-320, 0)))
	second_line.append(battle.add_unit("france", "drummer", Vector2(trench["centre"]) + Vector2(-320, 20)))
	var reserve := battle.form_regiment(second_line)
	var both: Array[Regiment] = [reserve]
	_check(battle.trenches.order_into(both, Vector2(trench["centre"])) and reserve.trench == null
		and reserve.destination.distance_to(Vector2(trench["centre"])) > float(trench["width"]), "a battalion sent to a held trench forms up behind it")

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
	var barracks_men: Array[Unit] = [newest]
	for i in 11:
		barracks_men.append(battle.add_unit("france", "infantry", depot.rally + Vector2(i * 14, 30)))
	barracks_men.append(battle.add_unit("france", "officer", depot.rally + Vector2(0, 60)))
	_check(not battle.quick_plan(depot)["ok"] and battle.quick_plan(depot)["missing"]["drummer"] == 1, "the barracks names what is missing (a drummer)")
	battle.economy["france"]["food"] += 500.0
	battle.economy["france"]["wood"] += 500.0
	_check(battle.train_missing(depot) >= 1 and depot.auto_regiment, "and trains it, with Auto-bataljon on")
	var before_count := battle.regiments.size()
	for i in 25:
		_run(battle, 1.0)
		if battle.regiments.size() > before_count:
			break
	_check(battle.regiments.size() == before_count + 1, "the barracks forms the battalion by itself once the drummer is ready (queue %s, missing %s)"
		% [depot.queue, battle.quick_plan(depot)["missing"]])

	# Tab selects the next battalion.
	battle.cycle_regiment()
	_check(not battle.selected.is_empty() and battle.selected[0].side == "france", "Tab selects a French battalion")
	var nobody_now: Array[Unit] = []
	battle.select_units(nobody_now)

	# Peasants sent somewhere together spread out instead of ending in a heap.
	var group: Array[Unit] = []
	for u in battle.units:
		if u.side == "france" and u.type == "worker" and u.alive() and group.size() < 6:
			group.append(u)
	battle.select_units(group)
	battle.order(quiet + Vector2(-200, 300))
	var closest := INF
	for a_man in group:
		for b_man in group:
			if a_man != b_man:
				closest = minf(closest, a_man.slot.distance_to(b_man.slot))
	_check(group.size() == 6 and closest >= 20.0, "six peasants sent together each get their own spot (%d px apart at least)" % closest)
	var nobody_then: Array[Unit] = []
	battle.select_units(nobody_then)

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
	# Saved and taken up again: the same men, buildings, battalions, stores
	# and hour, the men at their work.
	_check(SaveGame.save(battle) == OK and SaveGame.exists() and SaveGame.describe() != "", "the battle is saved (%s)" % SaveGame.describe())
	var living_now := 0
	for u in battle.units:
		if u.alive():
			living_now += 1
	var working_now := 0
	for u in battle.units:
		if u.alive() and u.type == "worker" and u.task_target != null:
			working_now += 1
	SaveGame.pending = SaveGame.read()
	var again: Battle = load("res://scenes/main.tscn").instantiate()
	# Counted as soon as it is laid out, before the battle runs on.
	root.add_child(again)
	var living_again := 0
	var working_again := 0
	for u in again.units:
		if u.alive():
			living_again += 1
			if u.type == "worker" and u.task_target != null:
				working_again += 1
	_check(living_again == living_now and again.buildings.size() == battle.buildings.size()
		and again.regiments.size() == battle.regiments.size() and is_equal_approx(again.clock, battle.clock)
		and is_equal_approx(float(again.economy["france"]["wood"]), float(battle.economy["france"]["wood"]))
		and again.trenches.list.size() == battle.trenches.list.size() and working_again == working_now
		and again.ai.plan == battle.ai.plan,
		"and loaded again as it was (%d/%d men, %d/%d at work, %d battalions)" % [living_again, living_now, working_again, working_now, again.regiments.size()])
	await process_frame
	await process_frame
	_run(again, 3.0)
	_check(again.result == "", "the loaded battle goes on")
	again.queue_free()
	await process_frame
	Battle.current = battle
	# Winning: by holding all three territories for two minutes...
	for t in battle.territories:
		t["owner"] = "france"
		t["claim"] = ""
		t["contested"] = false
	for i in 119:
		battle._check_result(1.0)
	_check(battle.result == "", "holding all three territories does not win before two minutes")
	for i in 3:
		battle._check_result(1.0)
	_check(battle.winner == "france" and battle.end_reason == "territories", "but does after two minutes (%s)" % battle.result)
	# ...or by taking the headquarters and destroying every fighting man.
	battle.result = ""
	battle.winner = ""
	for t in battle.territories:
		t["owner"] = ""
	battle.town_centre("britain").hit(100000.0)
	battle._check_result(0.1)
	var british_soldiers := 0
	for u in battle.units:
		if u.side == "britain" and u.alive() and u.type != "worker":
			british_soldiers += 1
	_check((battle.result == "") == (british_soldiers > 0), "a fallen headquarters alone does not end it while soldiers fight on")
	for u in battle.units:
		if u.side == "britain" and u.type != "worker":
			u.hit(100000.0)
	battle._check_result(0.1)
	_check(battle.winner == "france" and battle.end_reason == "elimination" and battle.side_stats("britain")["buildings_lost"] >= 1,
		"the battle is won with no British headquarters and no British soldiers left (%s)" % battle.side_stats("britain"))
	await process_frame
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

	# Online: a host and a client in this program, over a loopback link.
	var links := NetLink.pair(self)
	Battle.online_role = "host"
	Battle.online_side = "france"
	var hosting: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(hosting)
	await process_frame
	await process_frame
	Battle.online_role = "client"
	Battle.online_side = "britain"
	var joining: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(joining)
	await process_frame
	await process_frame
	Battle.online_role = ""
	hosting.go_online(links[0])
	joining.go_online(links[1])
	_check(hosting.me == "france" and joining.me == "britain", "online the host plays France, the client Britain")
	_run(hosting, 0.3)
	_check(joining.sync.snapshots >= 1 and joining.units.size() == hosting.units.size(), "the client is shown the host's battle")
	var redcoat: Unit = null
	for u in joining.units:
		if u.side == "britain" and u.type == "worker":
			redcoat = u
	var picked_one: Array[Unit] = [redcoat]
	joining.select_units(picked_one)
	var walk_to := redcoat.world + Vector2(70, 30)
	joining.order(walk_to)
	var hosts_redcoat := hosting.unit_by_id(redcoat.id)
	# (A peasant sent next to a bush or tree goes to work on it instead.)
	_check(hosting.sync.commands == 1 and (hosts_redcoat.slot.distance_to(walk_to) < 40.0 or hosts_redcoat.task != ""),
		"the client's order is carried out by the host (%d command, slot %s, task '%s')" % [hosting.sync.commands, hosts_redcoat.slot, hosts_redcoat.task])
	_run(hosting, 3.0)
	_check(redcoat.net_target.distance_to(hosts_redcoat.world) < 2.0 and hosts_redcoat.world.distance_to(walk_to) < 40.0,
		"and the client sees its man walk there")
	joining.select_building(joining.town_centre("britain"))
	joining.train("worker")
	_check(hosting.town_centre("britain").queue.size() == 1 and joining.status.contains("opleiding"),
		"the client trains a peasant, and hears it from the host (%s)" % joining.status)
	joining.fog.refresh()
	_check(joining.fog.sees(joining.town_centre("britain").world) and not joining.fog.sees(joining.town_centre("france").world),
		"the client sees its own base and not the French one")
	# Stretcher teams of a British field hospital show on the client too.
	hosting.add_building("britain", "hospital", hosting.town_centre("britain").world + Vector2(-200, 160), true)
	_run(hosting, 0.5)
	var their_teams := 0
	for crew: Array in joining.medics.teams.values():
		their_teams += crew.size()
	_check(their_teams == 2, "the client sees the hospital's two stretcher teams (%d)" % their_teams)
	# The line breaks: the host's battle waits, and goes on when it is back.
	links[0].drop()
	var paused_at := hosting.clock
	_run(hosting, 2.0)
	_check(is_equal_approx(hosting.clock, paused_at) and joining.status.contains("opnieuw verbinden"),
		"while the other player is away the battle stands still (%s)" % joining.status)
	links[0].restore()
	_run(hosting, 1.0)
	_check(hosting.clock > paused_at + 0.5, "and goes on once they are back")
	# Another battle once both ask for one.
	joining.sync.ask_rematch()
	_check(not hosting.restarted and hosting.sync.they_want_more, "one player asking does not restart the battle")
	hosting.sync.ask_rematch()
	_check(hosting.restarted and joining.restarted, "when both ask, both start a new battle")
	Battle.online_role = ""
	Battle.online_side = "france"
	hosting.queue_free()
	joining.queue_free()
	for link in links:
		link.queue_free()
	await process_frame

	# And over real ENet on this machine: a command up, a snapshot down.
	var host_branch := Node.new()
	host_branch.name = "EnetHost"
	root.add_child(host_branch)
	var client_branch := Node.new()
	client_branch.name = "EnetClient"
	root.add_child(client_branch)
	set_multiplayer(SceneMultiplayer.new(), host_branch.get_path())
	set_multiplayer(SceneMultiplayer.new(), client_branch.get_path())
	var enet_host := NetLink.new()
	enet_host.name = "Net"
	host_branch.add_child(enet_host)
	var enet_client := NetLink.new()
	enet_client.name = "Net"
	client_branch.add_child(enet_client)
	var hosted := enet_host.host(NetLink.PORT + 1)
	var dialled := enet_client.join("127.0.0.1", NetLink.PORT + 1)
	var commands_in: Array[Dictionary] = []
	var snapshots_in: Array[Dictionary] = []
	enet_host.command_received.connect(func(d: Dictionary) -> void: commands_in.append(d))
	enet_client.snapshot_received.connect(func(d: Dictionary) -> void: snapshots_in.append(d))
	for i in 300:
		if enet_host.connected and enet_client.connected:
			break
		await process_frame
	enet_client.send_command({"name": "halt", "args": [], "units": [10001, 10002], "building": 0})
	for i in 300:
		if not commands_in.is_empty() and not snapshots_in.is_empty():
			break
		# Snapshots go unreliably: send until one arrives.
		if i % 10 == 0:
			enet_host.send_snapshot({"clock": 1.5, "supplies": PackedFloat32Array([3.0, 4.0])})
		await process_frame
	_check(hosted == OK and dialled == OK and enet_client.connected, "two programs can connect over ENet")
	_check(not commands_in.is_empty() and commands_in[0]["units"] == [10001, 10002]
		and not snapshots_in.is_empty() and is_equal_approx(snapshots_in[0]["clock"], 1.5),
		"a command reaches the host and a snapshot the client over ENet")
	enet_client.close()
	enet_host.close()
	host_branch.queue_free()
	client_branch.queue_free()
	await process_frame
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
