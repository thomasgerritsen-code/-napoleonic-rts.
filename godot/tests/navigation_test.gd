extends SceneTree
## Native movement regressions: paths, friendly passing, exact overlaps,
## bridges, tree-sized obstacles, live combat queries and charge contacts.

var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Nav.setup({"points": [[7800, 0], [7800, 5000]], "width": 58}, [])
	var nav := GroundNavigation.new()
	var walls: Array[Rect2] = [Rect2(650, 380, 120, 200), Rect2(750, 460, 90, 140)]
	nav.set_walls(walls)
	var start := Vector2(450, 500)
	var end := Vector2(1000, 500)
	var path := nav.route(start, end)
	check(path.size() > 1 and _dry_path(nav, start, path) and path[-1] == end,
		"a route goes around adjacent buildings with clear, dry legs")
	var projected := nav.goal(Vector2(700, 500), start)
	check(nav.walkable(projected) and projected.x < 650, "an order inside a house ends on its accessible outside face")
	var near_edge := nav.goal(Vector2(645, 550), Vector2(700, 200))
	check(near_edge.distance_to(Vector2(645, 550)) < 10.0,
		"an order beside a wall stays close to the clicked point even when approached from another side")
	nav.set_walls([])
	check(nav.route(start, end).size() == 1, "demolishing the buildings opens the straight route")
	var trunks: Array[Rect2] = []
	for x in 5:
		for y in 4:
			trunks.append(Rect2(600 + x * 70, 420 + y * 62, 7, 7))
	nav.set_walls(trunks)
	path = nav.route(Vector2(450, 485), Vector2(1050, 485))
	check(not path.is_empty() and _dry_path(nav, Vector2(450, 485), path), "tree trunks are avoided while the gaps through a wood stay passable")
	Nav.setup({"points": [[1100, 0], [1100, 5000]], "width": 58},
		[{"x": 1100, "y": 1000, "length": 180, "width": 80}])
	var bridge_nav := GroundNavigation.new()
	bridge_nav.set_walls([])
	path = bridge_nav.route(Vector2(850, 800), Vector2(1350, 800))
	check(path.size() >= 3 and _dry_path(bridge_nav, Vector2(850, 800), path), "the original bridge route stays entirely on dry ground")
	check(not Nav.in_water(bridge_nav.nudge(Vector2(1100, 1035), Vector2(1100, 1050))),
		"crowd separation cannot push a man over the edge of a bridge into water")
	# The exact original interpolation at every sample, not an approximate
	# river cache that could change shore or bridge collisions.
	var river: Dictionary = Iso.read_json("res://assets/map/gamemap.json")["river"]
	Nav.setup(river, Rules.start()["crossings"])
	var points: Array = river["points"]
	var same := true
	for i in range(-10, 1020):
		var y := i * 5.0
		var expected := 0.0
		for j in range(1, points.size()):
			var a := Vector2(points[j - 1][0], points[j - 1][1])
			var b := Vector2(points[j][0], points[j][1])
			if y <= b.y or j == points.size() - 1:
				var t := 0.0 if is_equal_approx(a.y, b.y) else clampf((y - a.y) / (b.y - a.y), 0.0, 1.0)
				expected = lerpf(a.x, b.x, t)
				break
		same = same and is_equal_approx(Nav.river_x(y), expected)
	check(same, "the faster river lookup matches the original 254-segment scan")
	Nav.setup({"points": [[7800, 0], [7800, 5000]], "width": 58}, [])
	var battle := Battle.new()
	battle.props = Iso.read_json("res://assets/props/props.json")["props"]
	var layer := Node2D.new()
	battle.add_child(layer)
	battle._units_layer = layer
	battle.trenches = Trenches.new()
	battle.add_child(battle.trenches)
	Battle.current = battle
	var house := battle.add_building("france", "house", Vector2(800, 800), true)
	house.size = Vector2(160, 160)
	battle._build_walls()
	var worker := battle.add_unit("france", "worker", Vector2(550, 800))
	worker.move_to(Vector2(1050, 800))
	var entered := false
	for i in 1000:
		worker.step(1.0 / 60.0)
		entered = entered or Rect2(house.world - house.size * 0.42, house.size * 0.84).has_point(worker.world)
	check(worker.world.distance_to(worker.slot) < 6.0 and not entered,
		"a worker walks around a real building and reaches his order without entering its walls (%s)" % worker.world)
	worker.move_to(Vector2(1600, 800))
	for i in 80:
		worker.step(1.0 / 60.0)
	var new_house := battle.add_building("france", "house", Vector2(1300, 800), false)
	new_house.size = Vector2(160, 160)
	entered = false
	for i in 1000:
		worker.step(1.0 / 60.0)
		entered = entered or Rect2(new_house.world - new_house.size * 0.42, new_house.size * 0.84).has_point(worker.world)
	check(worker.world.distance_to(worker.slot) < 6.0 and not entered,
		"placing a new building invalidates the route before the worker reaches it (%s, entered: %s)" % [worker.world, entered])
	var first := battle.add_unit("france", "worker", Vector2(400, 1100))
	var second := battle.add_unit("france", "worker", Vector2(1000, 1100))
	first.move_to(Vector2(1000, 1100))
	second.move_to(Vector2(400, 1100))
	for i in 900:
		first.step(1.0 / 60.0)
		second.step(1.0 / 60.0)
		battle._keep_apart()
	check(first.world.distance_to(first.slot) < 6.0 and second.world.distance_to(second.slot) < 6.0,
		"friendly men pass head-on and reach both destinations (%s, %s)" % [first.world, second.world])
	first.world = Vector2(1200, 1200)
	second.world = first.world
	for i in 10:
		battle._keep_apart()
	check(first.world.distance_to(second.world) >= 9.0, "men starting at exactly the same point are separated deterministically")
	var horse_a := battle.add_unit("france", "cavalry", Vector2(1300, 1000))
	var horse_b := battle.add_unit("france", "cavalry", Vector2(1900, 1000))
	horse_a.move_to(Vector2(1900, 1000))
	horse_b.move_to(Vector2(1300, 1000))
	for i in 720:
		horse_a.step(1.0 / 60.0)
		horse_b.step(1.0 / 60.0)
		battle._keep_apart()
	check(horse_a.world.distance_to(horse_a.slot) < 6.0 and horse_b.world.distance_to(horse_b.slot) < 6.0,
		"friendly horsemen also pass without overlapping or blocking each other")
	var traffic: Array[Unit] = []
	for i in 24:
		var east := i < 12
		var n := i % 12
		var at := Vector2(2200 + n % 3 * 20 if east else 2700 - n % 3 * 20, 400 + n / 3 * 20)
		var u := battle.add_unit("france", "worker", at)
		u.move_to(Vector2(at.x + (500 if east else -500), at.y))
		traffic.append(u)
	for i in 1200:
		for u in traffic:
			u.step(1.0 / 60.0)
		battle._keep_apart()
	var arrived := 0
	for u in traffic:
		if u.world.distance_to(u.slot) < 6.0:
			arrived += 1
	check(arrived == 24, "two groups of twelve pass head-on and all reach their orders (%d/24)" % arrived)
	# Cached living lists must remain valid across death AND a return to life;
	# replacing a cache must not mutate a caller's already-read list.
	var regiment := Regiment.new("test", "france")
	regiment.men.assign([first, second])
	first.regiment = regiment
	second.regiment = regiment
	var old := regiment.living()
	first.state = Unit.State.DEAD
	check(regiment.strength() == 1 and old.size() == 2, "a casualty refreshes the living cache without mutating an active loop")
	first.state = Unit.State.IDLE
	check(regiment.strength() == 2, "the living list also refreshes when a saved/client state revives a man")
	first.regiment = null
	second.regiment = null
	# Hundreds of indexed results are checked against the old exact search.
	seed(1815)
	for i in 400:
		battle.add_unit("britain" if i % 2 else "france", "infantry", Vector2(randf_range(2000, 7000), randf_range(1500, 4500)))
	var exact := true
	for i in 250:
		var at := Vector2(randf_range(1800, 7200), randf_range(1300, 4700))
		var expected: Unit = null
		var best := 260.0 * 260.0
		for u in battle.units:
			var d := u.world.distance_squared_to(at)
			if u.side == "britain" and u.alive() and d < best:
				best = d
				expected = u
		exact = exact and battle.combat_space.nearest(at, "france", 260.0) == expected
	check(exact, "250 live spatial queries agree with a full scan of 400 soldiers")
	var enemy := battle.add_unit("britain", "infantry", Vector2(1800, 1800))
	enemy.world = Vector2(350, 350)
	check(battle.nearest_foe(Vector2(350, 350), "france", 30.0) == enemy, "moving between cells updates target queries immediately")
	enemy.state = Unit.State.DEAD
	check(battle.combat_space.nearest(Vector2(350, 350), "france", 30.0) == null, "a fallen enemy is immediately excluded from targeting")
	battle.combat_space.rebuild(battle.units)
	enemy.state = Unit.State.IDLE
	check(battle.combat_space.nearest(Vector2(350, 350), "france", 30.0) == enemy,
		"a revived unit re-enters the live index immediately after a rebuild")
	enemy.state = Unit.State.DEAD
	var tie_a := battle.add_unit("britain", "infantry", Vector2(350, 400))
	var tie_b := battle.add_unit("britain", "infantry", Vector2(350, 600))
	check(battle.combat_space.nearest(Vector2(350, 500), "france", 100.0) == null
		and battle.combat_space.nearest(Vector2(350, 500), "france", 101.0) == tie_a,
		"range boundaries and equal-distance ties retain the original target priority")
	tie_a.world = Vector2(2000, 2000)
	check(battle.combat_space.nearest(Vector2(350, 500), "france", 101.0) == tie_b,
		"leaving a spatial bucket removes its old target immediately")
	var attacker := battle.add_unit("france", "cavalry", Vector2(1500, 500))
	var victim := battle.add_unit("britain", "infantry", Vector2(1700, 500))
	var other := battle.add_unit("britain", "infantry", Vector2(1700, 502))
	var cavalry := Regiment.new("horse", "france")
	var foe := Regiment.new("foot", "britain")
	cavalry.men.assign([attacker])
	foe.men.assign([victim, other])
	attacker.regiment = cavalry
	victim.regiment = foe
	other.regiment = foe
	cavalry.charging = foe
	cavalry._melee(0.0)
	var chosen: Unit = cavalry._melee_targets[attacker]
	victim.world.y += 4.0
	cavalry._melee(0.0)
	check(cavalry._melee_targets[attacker] == chosen and absf(attacker.slot.distance_to(chosen.world) - 12.0) < 0.01,
		"a charge keeps its living target and approaches contact range instead of its occupied centre")
	chosen.state = Unit.State.DEAD
	cavalry._melee(0.0)
	check(cavalry._melee_targets[attacker] != chosen, "a charger immediately selects a living opponent when its target falls")
	var survivor: Unit = cavalry._melee_targets[attacker]
	attacker.world = survivor.world - Vector2(16, 0)
	var contact := attacker.world
	attacker.step(1.0 / 60.0)
	var sequence := attacker.anim_seq
	attacker.step(1.0)
	check(attacker.world == contact and attacker.anim_state == "slash" and attacker.anim_seq > sequence,
		"a horseman at contact stays in place and repeats his sabre stroke without walking into the victim")
	battle.free()
	Battle.current = null
	print("GODOT_NAV ", JSON.stringify({"failures": failures}))
	quit(0 if failures.is_empty() else 1)


func _dry_path(nav: GroundNavigation, from: Vector2, path: Array[Vector2]) -> bool:
	for p in path:
		if not nav.clear_segment(from, p):
			return false
		from = p
	return true
