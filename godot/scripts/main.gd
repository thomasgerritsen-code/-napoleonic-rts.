class_name Battle
extends Node2D
## The game: the web game's map and opening (assets/map/start.json), France
## (the player) against Britain (the computer). Peasants gather, build and
## farm; buildings train units; musketeers with an officer and a drummer form
## battalions; the side whose town centre falls loses.
##
## Mouse: click or drag to select, right click to order (move, attack,
## gather, build, farm); drag the right button to set a battalion's facing.
## Keys: 1 line, 2 column, 3 square, C charge, F form a battalion, Escape cancels a
## building plan; WASD/arrows, the middle button and the wheel move the camera.

const SIDES := ["france", "britain"]
const LAB_BATTALIONS := 4    # a side on the test field
const LAB_MEN := 36
const QUICK_REACH := 520.0  # how far around a barracks its men are gathered
const PEASANT_GAP := 22.0   # between peasants sent somewhere together
const SOLDIER_GAP := 20.0   # between loose soldiers sent somewhere together

## "campaign" (the full game) or "lab" (the test field), chosen in the menu.
static var mode := "campaign"
## The battle being fought (for the battalions' sense of danger).
static var current: Battle = null
## The menu's choice for the next battle: "" (alone against the computer),
## "host" (plays France and runs the battle) or "client" (plays Britain,
## shown the host's battle).
static var online_role := ""
## The side this player takes online (the host chooses).
static var online_side := "france"
## This battle's part online (from online_role).
var net_role := ""

var units: Array[Unit] = []
var buildings: Array[Building] = []
var supplies: Array[Supply] = []
var regiments: Array[Regiment] = []
var houses: Array[Dictionary] = []
## The web game's three capturable posts: {label, resource, rate, world, owner, claim, progress, contested}.
var territories: Array[Dictionary] = []
var territory_radius := 160.0
var territory_seconds := 15.0
var economy := {}
var props := {}
var selected_units: Array[Unit] = []
var selected_building: Building = null
var placing := ""                    # a building type being placed
var result := ""
## How the battle ended: winner ("france", "britain", "draw"), reason
## ("elimination", "territories") and the web game's statistics per side.
var winner := ""
var end_reason := ""
var ended_at := 0.0
var stats := {"france": {"trained": 0, "units_lost": 0, "buildings_lost": 0}, "britain": {"trained": 0, "units_lost": 0, "buildings_lost": 0}}
## The side holding all three territories uncontested, and for how long.
var hold_side := ""
var held_seconds := 0.0
const HOLD_TO_WIN := 120.0
var status := ""
var clock := 0.0
## The side this player commands; the computer (alone) or the other player
## (online) has the other.
var me := "france"
## The side of the player at this screen (me can stand in for the other
## player while the host carries out their command).
var local_side := "france"
## Online: snapshots and commands over the link to the other player.
var sync: NetSync = null
## Online, host: true while carrying out the other player's command.
var _remote := false
var _unit_index := {}
var _building_index := {}
var flank_hits := 0
## The battalions among the selected men.
var selected: Array[Regiment]:
	get:
		var list: Array[Regiment] = []
		for u in selected_units:
			if u.regiment != null and not list.has(u.regiment):
				list.append(u.regiment)
		return list

var ai: BritishCommand
var fog: Fog
var woods := Woods.new()
var weather: Weather
var sounds: Sounds
var medics: FieldMedics
var trenches: Trenches
var wildlife: Wildlife
var _woods_clock := 0.0
var _drum_clock := 0.0
const WALL_CELL := 80.0
var _walls := {}
var _walls_dirty := true
var _units_layer: Node2D
var _effects: Node2D
var _overlay: Overlay
var camera: BattleCamera
var _hud: Hud
var _smoke: Texture2D
var _next_id := 10000
var _drag_start: Variant = null
var _order_start: Variant = null
var _river: Array = []
var _woods_list: Array = []
var _orders: Array[Dictionary] = []   # orders on their way to the battalions


func _ready() -> void:
	randomize()
	current = self
	net_role = online_role
	me = online_side if net_role != "" else "france"
	local_side = me
	Regiment.all.clear()
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	Iso.load_relief(meta)
	_add_ground(meta)
	trenches = Trenches.new()
	trenches.battle = self
	add_child(trenches)
	props = Iso.read_json("res://assets/props/props.json")["props"]
	var map: Dictionary = Iso.read_json("res://assets/map/gamemap.json")
	_river = map["river"]["points"]
	Nav.setup(map["river"], Rules.start()["crossings"])
	_units_layer = Node2D.new()
	_units_layer.name = "Units"
	_units_layer.y_sort_enabled = true
	add_child(_units_layer)
	_effects = Node2D.new()
	_effects.z_index = 10
	add_child(_effects)
	fog = Fog.new()
	fog.battle = self
	add_child(fog)
	_overlay = Overlay.new()
	_overlay.battle = self
	_overlay.z_index = 20
	add_child(_overlay)
	_smoke = _puff_texture()
	medics = FieldMedics.new()
	medics.battle = self
	add_child(medics)
	_load_opening()
	if mode == "lab":
		_set_up_lab()
	# Deer and rabbits, once the bases stand (they keep clear of buildings).
	wildlife = Wildlife.new()
	wildlife.battle = self
	wildlife.populate(_woods_list, _units_layer)
	ai = BritishCommand.new(self)
	ai.army_only = mode == "lab"
	camera = BattleCamera.new()
	add_child(camera)
	var home := town_centre(me)
	camera.focus(Iso.to_screen(home.world + Vector2(260, 60)) if home != null else Iso.to_screen(Iso.WORLD / 2.0))
	if mode == "lab":
		camera.focus(Iso.to_screen(Vector2(4900, 3100)))
	sounds = Sounds.new()
	add_child(sounds)
	weather = Weather.new()
	weather.battle = self
	add_child(weather)
	var day := DayNight.new()
	day.battle = self
	add_child(day)
	_hud = Hud.new()
	_hud.battle = self
	add_child(_hud)
	say("Rechtsklik met boeren op struiken voor voedsel; bouw een houthakkerskamp bij het bos voor hout.")
	var link := NetLink.find(get_tree())
	if net_role != "" and link != null:
		go_online(link)


func _exit_tree() -> void:
	if current == self:
		current = null
	if sync != null:
		sync.detach()


func _process(delta: float) -> void:
	current = self
	if net_role == "client":
		for u in units:
			u.net_glide(delta)
		_tidy_selection()
		return
	if sync != null:
		sync.host_step(delta)
		# The battle waits while the other player is away.
		if not sync.link.connected:
			return
	if result != "":
		return
	clock += delta
	_deliver_orders()
	for r in regiments:
		r.update(delta, regiments)
	for u in units:
		u.step(delta)
	_keep_apart()
	for b in buildings:
		b.step(delta)
	medics.update(delta)
	wildlife.update(delta)
	trenches.update(delta)
	_hold_territories(delta)
	_beat_drums(delta)
	_woods_clock -= delta
	if _woods_clock <= 0.0:
		_woods_clock = 0.5
		woods.update()
		_auto_regiments()
	if net_role == "":
		ai.update(delta)
	_tidy_selection()
	_check_result(delta)


## Men do not stand in one another: pairs closer than a pace step apart.
## Neighbours are found through a grid of cells a pace wide.
func _keep_apart() -> void:
	const PACE := 10.0
	var grid := {}
	for u in units:
		if u.alive():
			var cell := Vector2i(floori(u.world.x / PACE), floori(u.world.y / PACE))
			if grid.has(cell):
				grid[cell].append(u)
			else:
				grid[cell] = [u]
	for u in units:
		if not u.alive() or u.type == "artillery":
			continue
		var cell := Vector2i(floori(u.world.x / PACE), floori(u.world.y / PACE))
		for dx in range(-1, 2):
			for dy in range(-1, 2):
				for other: Unit in grid.get(cell + Vector2i(dx, dy), []):
					if other == u or other.id < u.id:
						continue
					var gap := other.world - u.world
					var d := gap.length()
					if d >= PACE or d < 0.01:
						continue
					var push := gap / d * (PACE - d) * 0.5
					u.world -= push
					other.world += push
	_keep_out_of_walls()


## Nobody walks through a house or a building: a man inside one's walls is
## put back outside the nearest wall.
func _keep_out_of_walls() -> void:
	if _walls.is_empty() or _walls_dirty:
		_build_walls()
	for u in units:
		if not u.alive():
			continue
		var cell := Vector2i(floori(u.world.x / WALL_CELL), floori(u.world.y / WALL_CELL))
		for wall: Rect2 in _walls.get(cell, []):
			if wall.has_point(u.world):
				var left := u.world.x - wall.position.x
				var right := wall.end.x - u.world.x
				var top := u.world.y - wall.position.y
				var bottom := wall.end.y - u.world.y
				var least := minf(minf(left, right), minf(top, bottom))
				if least == left:
					u.world.x = wall.position.x - 0.5
				elif least == right:
					u.world.x = wall.end.x + 0.5
				elif least == top:
					u.world.y = wall.position.y - 0.5
				else:
					u.world.y = wall.end.y + 0.5


func _build_walls() -> void:
	_walls_dirty = false
	_walls.clear()
	var rects: Array[Rect2] = []
	for h in houses:
		var size := Vector2(float(h["w"]), float(h["w"])) * 0.62
		rects.append(Rect2(Vector2(h["x"], h["y"]) - size / 2.0, size))
	for b in buildings:
		if b.standing() and b.type != "farm":
			rects.append(Rect2(b.world - b.size * 0.42, b.size * 0.84))
	for r in rects:
		for x in range(floori(r.position.x / WALL_CELL), floori(r.end.x / WALL_CELL) + 1):
			for y in range(floori(r.position.y / WALL_CELL), floori(r.end.y / WALL_CELL) + 1):
				var cell := Vector2i(x, y)
				if not _walls.has(cell):
					_walls[cell] = []
				_walls[cell].append(r)


# ---- the opening ----

func _load_opening() -> void:
	var start := Rules.start()
	for side in SIDES:
		var e: Dictionary = start["economies"][side]
		economy[side] = {"food": float(e["food"]), "wood": float(e["wood"]), "iron": float(e["iron"])}
	_add_villages(start)
	_add_bridges(start)
	var posts: Variant = start.get("territories")
	if posts is Dictionary:
		territory_radius = float(posts["radius"])
		territory_seconds = float(posts["captureSeconds"])
		for p: Dictionary in posts["points"]:
			territories.append({"label": p["label"], "resource": p["resource"], "rate": float(p["rate"]),
				"world": Vector2(p["x"], p["y"]), "owner": "", "claim": "", "progress": 0.0, "contested": false})
	for data: Dictionary in start["resources"]:
		var s := Supply.new()
		s.setup(self, data, props)
		supplies.append(s)
		_units_layer.add_child(s)
	var woods_map: Dictionary = Iso.read_json("res://assets/map/gamemap.json")
	woods.plant(self, _units_layer, woods_map)
	_woods_list = woods_map["woods"]
	for data: Dictionary in start["buildings"]:
		var b := add_building(String(data["side"]), String(data["type"]), Vector2(data["x"], data["y"]), true, int(data["id"]))
	for data: Dictionary in start["units"]:
		var u := add_unit(String(data["side"]), String(data["type"]), Vector2(data["x"], data["y"]), "", int(data["id"]))


## The test field: four full battalions a side face each other on the open
## ground east of the river, guns and horse on the wings.
func _set_up_lab() -> void:
	for side in SIDES:
		var x := 4300.0 if side == "france" else 5500.0
		var face := 0.0 if side == "france" else PI
		for i in LAB_BATTALIONS:
			var at := Vector2(x, 2700.0 + i * 260.0)
			var company: Array[Unit] = []
			for n in LAB_MEN:
				company.append(add_unit(side, "infantry", at + Vector2((n % 18) * 15.0, (n / 18) * 19.0)))
			company.append(add_unit(side, "officer", at + Vector2(0, -24)))
			company.append(add_unit(side, "drummer", at + Vector2(20, -24)))
			var r := form_regiment(company)
			r.order_move(at, face)
		for n in 6:
			add_unit(side, "cavalry", Vector2(x + (0.0 if side == "france" else 40.0), 2450.0 + n * 22.0))
		for n in 2:
			add_unit(side, "artillery", Vector2(x - 120.0 if side == "france" else x + 120.0, 2950.0 + n * 260.0))
	if camera != null:
		camera.focus(Iso.to_screen(Vector2(4900, 3100)))
	fog.enabled = false
	say("Testveld: selecteer bataljons en geef orders. De Britten rukken op.")


## The villages' houses, each turned to its road as in the web game.
func _add_villages(start: Dictionary) -> void:
	var village: Dictionary = Iso.read_json("res://assets/village/village.json")
	var sheets := {}
	for v: Dictionary in start["villages"]:
		for h: Dictionary in v["houses"]:
			houses.append(h)
			var kind: String = h["kind"]
			if not sheets.has(kind):
				sheets[kind] = load("res://assets/village/%s" % village["kinds"][kind]["image"])
			var f: Dictionary = village["kinds"][kind]["frames"][int(h["heading"])]
			var house := Sprite2D.new()
			house.texture = sheets[kind]
			house.region_enabled = true
			house.region_rect = Rect2(f["x"], f["y"], f["w"], f["h"])
			house.centered = false
			house.offset = -Vector2(f["px"], f["py"])
			house.scale = Vector2.ONE * float(h["scale"])
			house.position = Iso.to_screen(Vector2(h["x"], h["y"]))
			_units_layer.add_child(house)


## The bridges, scaled to each crossing as in the web iso view.
func _add_bridges(start: Dictionary) -> void:
	const DECK_M := {"bridge_stone": 12.8, "bridge_wood": 12.0}
	for c: Dictionary in start["crossings"]:
		var kind := "bridge_stone" if c.get("material", "wood") == "stone" else "bridge_wood"
		var prop: Dictionary = props[kind]
		var bridge := Sprite2D.new()
		bridge.texture = load("res://assets/props/%s.webp" % kind)
		bridge.centered = false
		bridge.offset = -Vector2(prop["pivot"]["x"], prop["pivot"]["y"])
		bridge.scale = Vector2.ONE * Iso.SPRITE_SCALE * float(c["length"]) / (float(DECK_M[kind]) * Iso.PPM)
		bridge.position = Iso.to_screen(Vector2(c["x"], c["y"]))
		# Men on the deck are drawn over it.
		bridge.z_index = -1
		add_child(bridge)


func _add_ground(meta: Dictionary) -> void:
	var ground := Sprite2D.new()
	ground.texture = load("res://assets/map/" + String(meta["image"]))
	ground.centered = false
	var k := float(meta["pxPerM"]) / float(meta["gamePxPerM"])
	ground.scale = Vector2.ONE / k
	ground.position = Vector2(0.0, -float(meta.get("padTop", 0.0)) / k)
	ground.z_index = -10
	add_child(ground)


func add_unit(side: String, type: String, at: Vector2, troop := "", id := 0) -> Unit:
	var u := Unit.new()
	u.id = id if id > 0 else _new_id()
	u.setup(self, side, type, at, troop)
	u.fired.connect(_on_fired)
	units.append(u)
	_unit_index[u.id] = u
	_units_layer.add_child(u)
	return u


func add_building(side: String, type: String, at: Vector2, built: bool, id := 0) -> Building:
	var b := Building.new()
	b.id = id if id > 0 else _new_id()
	b.setup(self, side, type, at, built)
	buildings.append(b)
	_building_index[b.id] = b
	_units_layer.add_child(b)
	_walls_dirty = true
	return b


func unit_by_id(id: int) -> Unit:
	return _unit_index.get(id)


func building_by_id(id: int) -> Building:
	return _building_index.get(id)


## Online: play over a NetLink, as "host" or "client".
func go_online(link: NetLink) -> void:
	sync = NetSync.new(self, link)


## Online, client: a player's action goes to the host instead (true when it
## did). The host carries it out with this selection.
func _relay(action: String, args: Array = []) -> bool:
	if net_role != "client" or sync == null:
		return false
	var ids: Array[int] = []
	for u in selected_units:
		ids.append(u.id)
	sync.link.send_command({"name": action, "args": args, "units": ids,
		"building": selected_building.id if selected_building != null else 0})
	return true


## Online, host: carry out the other player's command as them.
func acting_for(side: String, picked: Array[Unit], b: Building, action: Callable) -> void:
	var saved_me := me
	var saved_units := selected_units
	var saved_building := selected_building
	var saved_placing := placing
	me = side
	selected_units = picked
	selected_building = b
	_remote = true
	action.call()
	_remote = false
	for u in units:
		if u.side == side:
			u.selected = false
	for x in buildings:
		if x.side == side:
			x.selected = false
	me = saved_me
	selected_units = saved_units
	selected_building = saved_building
	placing = saved_placing


## A building laid out where the player of `me` asks, by its selected peasants.
func build_at(type: String, at: Vector2) -> void:
	placing = type
	place(at)


func play_sound(kind: String, at: Vector2) -> void:
	sounds.play(kind, at)
	if sync != null and net_role == "host":
		sync.fx("s:" + kind, at)


## Online, client: the host's shots and smoke.
func replay_fx(e: Array) -> void:
	var kind: String = e[0]
	var at := Vector2(e[1], e[2])
	if kind == "p":
		_puff(at, e[3], e[4])
	elif kind.begins_with("s:"):
		sounds.play(kind.substr(2), at)


## A new battle in this scene (online, on both ends at once). In the tests,
## where the battle is not the scene, it only notes that it would.
var restarted := false


func restart() -> void:
	restarted = true
	if get_tree().current_scene == self:
		get_tree().reload_current_scene()


## Online, client: the host's battle has ended.
func end_for_client() -> void:
	var at := ended_at
	_finish(winner, end_reason)
	ended_at = at


func _new_id() -> int:
	_next_id += 1
	return _next_id


# ---- questions the units ask ----

static func spot(node: Node2D) -> Vector2:
	return node.get("world")


static func hash01(a: int, b: int) -> float:
	var h := (a * 374761393 + b * 668265263) & 0xFFFFFFFF
	h = ((h ^ (h >> 13)) * 1274126177) & 0xFFFFFFFF
	return float(h ^ (h >> 16)) / 4294967296.0


func is_foe(node: Node2D, side: String) -> bool:
	if node == null or not is_instance_valid(node):
		return false
	if node is Unit:
		return (node as Unit).alive() and (node as Unit).side != side
	if node is Building:
		return (node as Building).standing() and (node as Building).side != side
	return false


## A blow or shot from `from` landing on `foe`, as the web game weighs it:
## a trench or a braced line takes less, a battalion hit in the flank (x1.25)
## or the rear (x1.5) more and shakes harder (x1.5, x2); a square has no flank.
## Charging horse weigh the flank themselves.
func strike(foe: Unit, damage: float, from: Vector2, lobbed := false, horse := false) -> void:
	var share := trenches.cover(foe, from, lobbed)
	var r := foe.regiment
	var shock := 0.0
	if r != null and r.formation != "square" and not r.routing:
		var way := from - foe.world
		if way.length() > 0.5:
			var c := way.normalized().dot(Vector2.from_angle(r.facing))
			if c < 0.5:
				var rear := c < -0.5
				flank_hits += 1
				if not horse:
					share *= depth_rule("rearDamage", 1.5) if rear else depth_rule("flankDamage", 1.25)
				shock = (depth_rule("rearShock", 2.0) if rear else depth_rule("flankShock", 1.5)) - 1.0
	if r != null and r.skirmish:
		if horse:
			share *= depth_rule("skirmishVsCavalry", 1.7)
			shock += depth_rule("skirmishVsCavalry", 1.7) - 1.0
		else:
			share *= depth_rule("skirmishWoodCover", 0.55) if near_trees(foe.world) else depth_rule("skirmishCover", 0.72)
	if shock > 0.0:
		foe.morale = maxf(0.0, foe.morale - 8.0 * shock)
	foe.hit(damage * share)


func depth_rule(key: String, fallback: float) -> float:
	return depth_rule_static(key, fallback)


static func depth_rule_static(key: String, fallback: float) -> float:
	var d: Variant = Rules.start().get("battleDepth")
	return float(d.get(key, fallback)) if d is Dictionary else fallback


## Trees within a few paces (tirailleurs shelter among them).
func near_trees(at: Vector2) -> bool:
	for s in supplies:
		if s.kind == "wood" and not s.gone() and s.world.distance_squared_to(at) < 46.0 * 46.0:
			return true
	return false


## Whether enemy soldiers (not peasants, not men in flight) are within `reach`.
func soldiers_near(at: Vector2, side: String, reach: float) -> bool:
	for u in units:
		if u.side != side and u.alive() and u.military() and (u.regiment == null or not u.regiment.routing) \
				and u.world.distance_squared_to(at) < reach * reach:
			return true
	return false


## The nearest living enemy within `reach`; men before buildings.
func nearest_foe(at: Vector2, side: String, reach: float) -> Node2D:
	var best: Node2D = null
	var best_d := reach
	for u in units:
		if u.side != side and u.alive():
			var d := u.world.distance_to(at)
			if d < best_d:
				best_d = d
				best = u
	if best != null:
		return best
	for b in buildings:
		if b.side != side and b.standing():
			var d := b.world.distance_to(at) - b.size.x * 0.4
			if d < best_d:
				best_d = d
				best = b
	return best


func nearest_supply(at: Vector2, kind: String, side: String, other_than: Supply = null) -> Supply:
	var best: Supply = null
	var best_d := INF
	for s in supplies:
		if s == other_than or s.kind != kind or not s.usable_by(side):
			continue
		var d := s.world.distance_squared_to(at)
		if d < best_d:
			best_d = d
			best = s
	return best


func camp_covering(s: Supply, side: String) -> Building:
	var reach := Rules.logging_radius()
	for b in buildings:
		if b.type == "lumbercamp" and b.side == side and b.complete and b.standing() and b.world.distance_to(s.world) <= reach:
			return b
	return null


func mine_on(s: Supply, side: String) -> Building:
	for b in buildings:
		if b.type == "mine" and b.side == side and b.complete and b.standing() and b.world.distance_to(s.world) < 4.0:
			return b
	return null


func mine_on_any(s: Supply) -> Building:
	for b in buildings:
		if b.type == "mine" and b.standing() and b.world.distance_to(s.world) < 4.0:
			return b
	return null


## Where a peasant hands in what he carries: wood at a camp, iron at a mine,
## everything also at the town centre.
func store_for(kind: String, side: String, at: Vector2) -> Building:
	var best: Building = null
	var best_d := INF
	for b in buildings:
		if b.side != side or not b.complete or not b.standing():
			continue
		var takes := b.type == "towncenter" or (kind == "wood" and b.type == "lumbercamp") or (kind == "iron" and b.type == "mine")
		if not takes:
			continue
		var d := b.world.distance_squared_to(at)
		if d < best_d:
			best_d = d
			best = b
	return best


func credit(side: String, kind: String, amount: float) -> void:
	if economy[side].has(kind):
		economy[side][kind] += amount


func farmers_on(field: Building) -> int:
	var n := 0
	for u in units:
		if u.alive() and u.task == "farm" and u.task_target == field:
			n += 1
	return n


func town_centre(side: String) -> Building:
	for b in buildings:
		if b.side == side and b.type == "towncenter" and b.standing():
			return b
	return null


func pop_used(side: String) -> int:
	var n := 0
	for u in units:
		if u.side == side and u.alive():
			n += u.pop()
	return n


func pop_cap(side: String) -> int:
	var cap := 0
	for b in buildings:
		if b.side == side and b.complete and b.standing():
			cap += int(Rules.building_type(b.type).get("pop", 0))
	return mini(cap, 200)


func has_room(side: String, type: String) -> bool:
	return pop_used(side) + int(Rules.unit_type(type).get("pop", 1)) <= pop_cap(side)


func can_afford(side: String, cost: Dictionary) -> bool:
	for key in cost:
		if economy[side].get(key, 0.0) < float(cost[key]):
			return false
	return true


func pay(side: String, cost: Dictionary) -> void:
	for key in cost:
		economy[side][key] -= float(cost[key])


# ---- what happens ----

func notice_idle(u: Unit, used_up: Supply) -> void:
	if used_up != null and used_up.kind == "wood":
		say("Het bos bij uw houthakkerskamp is op: bouw een nieuw kamp bij een ander bos.", u.side)
	elif used_up != null:
		say("Een boer heeft geen %s meer in de buurt." % Rules.label(used_up.kind), u.side)


func on_built(b: Building, by: Unit) -> void:
	say("%s voltooid." % Rules.label(b.type), b.side)
	# The builders go to work at what they built.
	for u in units:
		if u.alive() and u.type == "worker" and u.task == "" and u.side == b.side and u.world.distance_to(b.world) < b.reach_radius() + 30.0:
			start_work_at(u, b)
	start_work_at(by, b)
	if _hud != null:
		_hud.refresh()


func start_work_at(u: Unit, b: Building) -> void:
	match b.type:
		"farm":
			if farmers_on(b) < 3:
				u.set_task("farm", b)
		"lumbercamp":
			var tree := nearest_supply(b.world, "wood", b.side)
			if tree != null:
				u.set_task("gather", tree)
		"mine":
			for s in supplies:
				if s.kind == "iron" and s.world.distance_to(b.world) < 4.0 and s.usable_by(b.side):
					u.set_task("gather", s)


func on_death(u: Unit) -> void:
	selected_units.erase(u)
	stats[u.side]["units_lost"] += 1
	medics.on_fallen(u)
	u.queue_redraw()


## A thing on the field, drawn in order with the men and buildings.
func add_to_field(node: Node2D) -> void:
	_units_layer.add_child(node)


func on_destroyed(b: Building) -> void:
	_walls_dirty = true
	stats[b.side]["buildings_lost"] += 1
	if selected_building == b:
		selected_building = null
	say("Uw %s is verwoest!" % Rules.label(b.type).to_lower(), b.side)
	if _hud != null:
		_hud.refresh()


func spawn_trained(b: Building, type: String) -> void:
	stats[b.side]["trained"] += 1
	var out := b.world + Vector2((1.0 if b.side == "france" else -1.0) * b.size.x * 0.75, b.size.y * 0.55)
	var u := add_unit(b.side, Rules.item_type(type), out + Vector2(randf_range(-14, 14), randf_range(-10, 10)), Rules.item_troop(type))
	u.slot = u.world + Vector2((1.0 if b.side == "france" else -1.0) * 40.0, randf_range(-20, 20))
	if b.rally != null:
		# To the rally point; a peasant sent to a resource goes to work there.
		var to: Vector2 = b.rally
		var supply := _supply_at(to)
		if u.type == "worker" and supply != null and supply.usable_by(b.side):
			u.set_task("gather", supply)
		else:
			u.move_to(to + Vector2(randf_range(-30, 30), randf_range(-20, 20)))
	if commanded(b.side):
		say("%s is klaar." % Rules.label(type), b.side)
		refresh_hud()
	else:
		ai.on_trained(u)


## A message for the player of `side` ("" or our own side: this screen;
## online, the other player's are sent to them; the computer's go nowhere).
func say(text: String, side := "") -> void:
	if side == "":
		side = me
	if side == local_side:
		status = text
	elif net_role == "host" and sync != null:
		sync.link.tell(text)


## Whether a person commands this side (us, or the other player online).
func commanded(side: String) -> bool:
	return side == me or net_role != ""


## As the web game: soldiers alone on a post claim it in 15 seconds; its
## owner draws its income while no enemy stands on it.
func _hold_territories(delta: float) -> void:
	for p in territories:
		var here := {"france": false, "britain": false}
		for u in units:
			if u.alive() and u.type in ["infantry", "cavalry", "artillery"] and u.world.distance_to(p["world"]) <= territory_radius:
				if u.regiment == null or not u.regiment.routing:
					here[u.side] = true
		p["contested"] = here["france"] and here["britain"]
		if p["contested"]:
			continue
		var side := "france" if here["france"] else ("britain" if here["britain"] else "")
		if side == "" or side == p["owner"]:
			p["claim"] = ""
			p["progress"] = 0.0
		else:
			if p["claim"] != side:
				p["claim"] = side
				p["progress"] = 0.0
			p["progress"] = minf(1.0, float(p["progress"]) + delta / territory_seconds)
			if p["progress"] >= 1.0:
				p["owner"] = side
				p["claim"] = ""
				p["progress"] = 0.0
				say("%s veroverd." % p["label"], side)
		if p["owner"] != "" and (side == "" or side == p["owner"]):
			credit(p["owner"], p["resource"], float(p["rate"]) * delta)


func territories_held(side: String) -> int:
	var n := 0
	for p in territories:
		if p["owner"] == side:
			n += 1
	return n


func heal_near(at: Vector2, side: String, reach: float, share: float) -> void:
	for u in units:
		if u.alive() and u.side == side and u.hp < u.max_hp and u.world.distance_to(at) < reach:
			u.hp = minf(u.max_hp, u.hp + u.max_hp * share)


func tower_fires(tower: Building, foe: Unit, shots: int, damage: float) -> void:
	var top := tower.world + Vector2(0, -6)
	play_sound("musket", top)
	for i in shots:
		_puff(top + Vector2(randf_range(-8, 8), 0), 0.5, 2.2)
		if randf() < 0.6:
			strike(foe, damage * randf_range(0.8, 1.4), tower.world)


## A marching battalion's drummer beats the step: the one nearest the
## camera is heard.
func _beat_drums(delta: float) -> void:
	_drum_clock -= delta
	if _drum_clock > 0.0 or camera == null:
		return
	_drum_clock = 0.55
	var view := Iso.to_world(camera.position)
	var best: Regiment = null
	var best_d := 1400.0
	for r in regiments:
		if r.routing or r.destroyed() or not r.moving():
			continue
		var d := r.centroid().distance_to(view)
		if d < best_d and r.living().any(func(u: Unit) -> bool: return u.type == "drummer"):
			best_d = d
			best = r
	if best != null:
		play_sound("drum", best.centroid())


## The season's colour on every tree and bush.
func tint_trees(colour: Color) -> void:
	for s in supplies:
		if s.kind != "iron":
			s.modulate = Color(colour, s.modulate.a)
	woods.tint(colour)


# ---- musketry and blows ----

func _on_fired(u: Unit, target: Node2D) -> void:
	if u.type == "infantry" and weather != null and weather.misfires():
		# Damp powder: a flash in the pan and no shot.
		_puff(u.muzzle(), 0.25, 1.2)
		return
	if u.type == "artillery":
		if not commanded(u.side):
			# The computer loads grapeshot when the enemy comes close.
			u.shot = "grape" if u.world.distance_to(spot(target)) < Unit.GRAPE_REACH and u.ammo["grape"] > 0 else "round"
		if u.ammo[u.shot] <= 0:
			return
		u.ammo[u.shot] -= 1
		if u.shot == "grape":
			_grapeshot(u, target)
			return
	if u.type != "cavalry":
		play_sound("cannon" if u.type == "artillery" else "musket", u.world)
		_puff(u.muzzle(), 1.3 if u.type == "artillery" else 0.55, 3.2 if u.type == "artillery" else 2.6)
	wildlife.alarm(u.world)
	if not is_foe(target, u.side):
		return
	var distance := u.world.distance_to(spot(target))
	var info := Rules.unit_type(u.type)
	var damage := float(info.get("damage", 20)) * u.stat("ranged")
	if u.regiment != null:
		damage *= u.regiment.damage_factor()
	if target is Building:
		(target as Building).hit(damage * (2.5 if u.type == "artillery" else 0.4))
		return
	var foe := target as Unit
	match u.type:
		"cavalry":
			# Horse breaks on a square's bayonets: few blows land, many riders fall.
			if foe.regiment != null and foe.regiment.formation == "square" and not foe.regiment.routing:
				if randf() < 0.15:
					strike(foe, damage * randf_range(1.0, 2.2), u.world, false, true)
				if randf() < 0.45:
					u.hit(damage * randf_range(0.8, 1.6))
			elif randf() < 0.6:
				var blow := damage * u.stat("charge") * randf_range(1.0, 2.2)
				if foe.type == "infantry" or (foe.regiment != null and foe.regiment.routing):
					blow *= u.stat("vsInfantry")
				elif foe.type == "cavalry":
					blow *= u.stat("vsCavalry")
				strike(foe, blow, u.world, false, true)
		"artillery":
			# Roundshot ploughs through: everyone near the point of impact.
			# A howitzer's shell drops into a trench; roundshot strikes its bank.
			var impact := foe.world + Vector2(randf_range(-20, 20), randf_range(-14, 14))
			var lobbed := bool(Rules.troop(u.troop).get("lobbed", false))
			trenches.shell(impact, impact - u.world, float(Rules.troop(u.troop).get("works", 1.0)))
			for other in units:
				if other.alive() and other.side != u.side and other.world.distance_to(impact) < 26.0:
					strike(other, damage * randf_range(0.6, 1.3), u.world, lobbed)
			_puff(impact, 0.8, 1.6)
		_:
			var chance := clampf(0.45 - distance / 600.0, 0.06, 0.4)
			if u.regiment != null:
				chance *= u.regiment.fire_factor()
			if randf() < chance:
				# A cuirass turns part of the musket balls.
				var armour := float(Rules.troop(foe.troop).get("armour", 0.0))
				strike(foe, randf_range(45.0, 100.0) * u.stat("ranged") * (1.0 - armour)
					* (u.regiment.damage_factor() if u.regiment != null else 1.0), u.world)


## Grapeshot: a cone of balls, everyone within 145 px and about 16 degrees of
## the line of fire, hardest close by (the web game: 24 at the muzzle).
func _grapeshot(u: Unit, target: Node2D) -> void:
	play_sound("cannon", u.world)
	_puff(u.muzzle(), 1.5, 2.6)
	wildlife.alarm(u.world)
	var aim := (spot(target) - u.world).angle()
	for other in units:
		if not other.alive() or other.side == u.side:
			continue
		var way := other.world - u.world
		var d := way.length()
		if d > Unit.GRAPE_REACH or absf(angle_difference(aim, way.angle())) >= 0.28:
			continue
		strike(other, 24.0 * (1.0 - d / 190.0), u.world)
		_puff(other.world, 0.3, 1.0)


## Round shot or grapeshot for the selected guns.
func toggle_shot() -> void:
	if _relay("toggle_shot"):
		return
	var guns: Array[Unit] = []
	for u in selected_units:
		if u.type == "artillery" and u.alive():
			guns.append(u)
	if guns.is_empty():
		return
	var next := "round" if guns[0].shot == "grape" else "grape"
	var left := 0
	for g in guns:
		g.shot = next
		left += int(g.ammo[next])
	say("%s geladen · munitie %d." % ["Kartets" if next == "grape" else "Ronde kogel", left])
	refresh_hud()


## A grenade lobbed from the thrower bursts at `at` after its flight, harming
## every enemy in the burst, as in the web game.
func throw_grenade(thrower: Unit, at: Vector2) -> void:
	var g: Dictionary = Rules.start()["grenades"] if Rules.start().get("grenades") is Dictionary else {}
	var spread := float(g.get("spread", 16))
	var landing := at + Vector2(randf_range(-spread, spread), randf_range(-spread, spread))
	var from := thrower.world
	var flight := randf_range(float(g.get("flightMin", 0.7)), float(g.get("flightMax", 1.2)))
	var ball := Sprite2D.new()
	ball.texture = _smoke
	ball.modulate = Color(0.12, 0.11, 0.1)
	ball.scale = Vector2.ONE * 0.09
	ball.position = Iso.to_screen(from) + Vector2(0, -16)
	_effects.add_child(ball)
	var tween := ball.create_tween()
	tween.tween_method(func(t: float) -> void:
		ball.position = Iso.to_screen(from.lerp(landing, t)) + Vector2(0, -16.0 - sin(t * PI) * 40.0), 0.0, 1.0, flight)
	tween.tween_callback(func() -> void:
		ball.queue_free()
		_burst(thrower.side, landing, float(g.get("radius", 46)), float(g.get("damage", 34))))


func _burst(side: String, at: Vector2, radius: float, damage: float) -> void:
	play_sound("cannon", at)
	_puff(at, 1.0, 1.8)
	wildlife.alarm(at)
	for u in units:
		if u.alive() and u.side != side and u.world.distance_to(at) < radius:
			u.hit(damage * randf_range(0.7, 1.3))


func _puff(world_at: Vector2, size: float, life: float) -> void:
	if sync != null and net_role == "host":
		sync.fx("p", world_at, size, life)
	var puff := Sprite2D.new()
	puff.texture = _smoke
	puff.position = Iso.to_screen(world_at) + Vector2(0.0, -10.0)
	puff.scale = Vector2.ONE * size * 0.4
	puff.modulate = Color(0.93, 0.92, 0.88, 0.85)
	_effects.add_child(puff)
	var tween := puff.create_tween().set_parallel(true)
	tween.tween_property(puff, "scale", Vector2.ONE * size * 1.6, life)
	tween.tween_property(puff, "position", puff.position + Vector2(randf_range(4.0, 14.0), -16.0), life)
	tween.tween_property(puff, "modulate:a", 0.0, life).set_ease(Tween.EASE_IN)
	tween.chain().tween_callback(puff.queue_free)


func _puff_texture() -> Texture2D:
	var gradient := Gradient.new()
	gradient.set_color(0, Color(1, 1, 1, 0.9))
	gradient.set_color(1, Color(1, 1, 1, 0))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	texture.fill = GradientTexture2D.FILL_RADIAL
	texture.fill_from = Vector2(0.5, 0.5)
	texture.fill_to = Vector2(1.0, 0.5)
	texture.width = 64
	texture.height = 64
	return texture


# ---- the player's orders ----

func select_units(list: Array[Unit], add := false) -> void:
	if not add:
		for u in selected_units:
			u.selected = false
		selected_units.clear()
	if selected_building != null:
		selected_building.selected = false
		selected_building = null
	for u in list:
		if u.alive() and u.side == me and not selected_units.has(u):
			selected_units.append(u)
			u.selected = true
	if _hud != null:
		_hud.refresh()


func select_building(b: Building) -> void:
	var none: Array[Unit] = []
	select_units(none)
	selected_building = b
	if b != null:
		b.selected = true
	if _hud != null:
		_hud.refresh()


func _tidy_selection() -> void:
	for u in selected_units.duplicate():
		if not u.alive() or (u.regiment != null and u.regiment.routing):
			u.selected = false
			selected_units.erase(u)


func order(at: Vector2, face: Variant = null) -> void:
	if _relay("order", [at, face]):
		return
	var b := selected_building
	if b != null and b.side == me and b.complete and not Rules.trained_at(b.type, me).is_empty():
		b.rally = at
		say("Verzamelpunt van %s gezet." % Rules.label(b.type).to_lower())
		if _overlay != null:
			_overlay.mark(Iso.to_screen(at))
		return
	if selected_units.is_empty():
		return
	var foe := _thing_at(at, true)
	var supply := _supply_at(at)
	var own := _thing_at(at, false) as Building
	var workers: Array[Unit] = []
	var walkers: Array[Unit] = []
	var free: Array[Unit] = []
	for u in selected_units:
		if u.regiment != null:
			continue
		if u.type == "worker":
			workers.append(u)
		else:
			free.append(u)
	for w in workers:
		if supply != null and supply.usable_by(me):
			w.set_task("gather", supply)
		elif supply != null and supply.kind == "wood":
			say("Hout kappen kan alleen binnen bereik van een eigen houthakkerskamp.")
			w.task = ""
			w.move_to(at)
		elif supply != null and supply.kind == "iron":
			say("IJzer winnen kan alleen bij een eigen mijn op de afzetting.")
			w.task = ""
			w.move_to(at)
		elif own != null and own.side == me and not own.complete:
			w.set_task("build", own)
		elif own != null and own.side == me and own.type == "farm":
			w.set_task("farm", own)
		else:
			w.task = ""
			walkers.append(w)
	_spread(walkers, at, null, PEASANT_GAP)
	_spread(free, at, foe)
	var battalions: Array[Regiment] = selected
	# A click on a trench of ours sends the battalions into it.
	if not battalions.is_empty() and foe == null and trenches.order_into(battalions, at):
		say("%s bezet de loopgraaf." % battalions[0].name)
	elif not battalions.is_empty():
		for r in battalions:
			# An ordinary move lets go of the trench.
			r.trench = null
		_order_battalions(battalions, at if foe == null else spot(foe), face)
	if _overlay != null:
		_overlay.mark(Iso.to_screen(at))


## Men sent together without a battalion: at an enemy, all go for it; to a
## place, each gets his own spot in a small square around it, `gap` apart,
## the man furthest left taking the left of the square and so on, so they
## do not cross or end in a heap.
func _spread(list: Array[Unit], at: Vector2, foe: Node2D, gap := SOLDIER_GAP) -> void:
	if list.is_empty():
		return
	if foe != null:
		for u in list:
			u.move_to(spot(foe))
			u.ordered = false
			u.target = foe
		return
	var across := ceili(sqrt(list.size()))
	var rows := ceili(float(list.size()) / across)
	var spots: Array[Vector2] = []
	for i in list.size():
		var row := i / across
		var in_row := mini(across, list.size() - row * across)
		spots.append(at + Vector2((i % across - (in_row - 1) / 2.0) * gap, (row - (rows - 1) / 2.0) * gap))
	# Rows from the back, each from the left: men and spots in the same order.
	var men := list.duplicate()
	men.sort_custom(func(a: Unit, b: Unit) -> bool: return a.world.y < b.world.y)
	for r in rows:
		var row_men := men.slice(r * across, (r + 1) * across)
		row_men.sort_custom(func(a: Unit, b: Unit) -> bool: return a.world.x < b.world.x)
		for k in row_men.size():
			var u: Unit = row_men[k]
			u.move_to(Nav.dry(u.world, spots[r * across + k]))


## Several battalions stand side by side across the line of march.
func _order_battalions(list: Array[Regiment], to: Vector2, face: Variant) -> void:
	var from := Vector2.ZERO
	for r in list:
		from += r.centroid()
	from /= list.size()
	var facing: float = float(face) if face != null else (to - from).angle()
	var right := Vector2.from_angle(facing).orthogonal() * -1.0
	var widths := {}
	var total := 0.0
	for r in list:
		var w := ceilf(float(r.strength()) / Regiment.RANKS) * Regiment.FILE_GAP + 40.0
		widths[r] = w
		total += w
	var line_up := list.duplicate()
	line_up.sort_custom(func(a: Regiment, b: Regiment) -> bool:
		return a.centroid().dot(right) < b.centroid().dot(right))
	var offset := -total / 2.0
	var delay := order_delay(from, list[0].side)
	for r: Regiment in line_up:
		var w: float = widths[r]
		_orders.append({"at": clock + delay, "regiment": r, "to": to + right * (offset + w / 2.0), "facing": facing})
		offset += w
	say("Order onderweg (%.1f s)" % delay)


## How long an order takes to reach the battalions, as the web game: a
## courier from the town centre (0.75 s and a second for every 1100 px),
## sooner with an officer close by (within 260, or 430 px for half), never
## under 0.35 s.
func order_delay(at: Vector2, side: String) -> float:
	var tc := town_centre(side)
	var distance := tc.world.distance_to(at) if tc != null else 0.0
	var nearest := INF
	for u in units:
		if u.side == side and u.alive() and u.type == "officer" and (u.regiment == null or not u.regiment.routing):
			nearest = minf(nearest, u.world.distance_to(at))
	var bonus := 1.0 if nearest <= 260.0 else (0.5 if nearest <= 430.0 else 0.0)
	return maxf(0.35, 0.75 + distance / 1100.0 - bonus * 0.35)


func _deliver_orders() -> void:
	for i in range(_orders.size() - 1, -1, -1):
		var o: Dictionary = _orders[i]
		if clock < o["at"]:
			continue
		var r: Regiment = o["regiment"]
		if not r.destroyed() and not r.routing:
			r.order_move(o["to"], o["facing"])
		_orders.remove_at(i)


func set_formation(kind: String) -> void:
	if _relay("set_formation", [kind]):
		return
	for r in selected:
		r.set_formation(kind)


func charge() -> void:
	if _relay("charge"):
		return
	for r in selected:
		r.charge(regiments)


## Hold the ground (or stop holding it): a battalion that holds braces, and in
## line digs a trench.
func hold() -> void:
	if _relay("hold"):
		return
	var list := selected
	var on := false
	for r in list:
		on = on or not r.hold
	for r in list:
		r.hold = on
	if not list.is_empty():
		say("Stelling houden: de linie graaft zich in." if on else "De bataljons houden geen stelling meer.")
	refresh_hud()


## Open order for the selected battalions (or closed again).
func skirmish() -> void:
	if _relay("skirmish"):
		return
	var list := selected
	var on := false
	for r in list:
		on = on or not r.skirmish
	for r in list:
		r.set_skirmish(on)
	if not list.is_empty():
		say("Tirailleurs: verspreid, vuren naar believen en verder, moeilijk te raken, maar kwetsbaar voor ruiterij." if on else "Gesloten orde: de gelederen sluiten.")
	refresh_hud()


## The selected peasants to work: on fields with room (three to a field),
## at the wood by a lumber camp, at a mine, or on unfinished buildings.
func assign_workers(work: String) -> void:
	if _relay("assign_workers", [work]):
		return
	var sent := 0
	for u in selected_units:
		if u.type != "worker" or not u.alive():
			continue
		match work:
			"farm":
				var best: Building = null
				for b in buildings:
					if b.side == me and b.type == "farm" and b.complete and b.standing() and farmers_on(b) < 3 \
							and (best == null or b.world.distance_to(u.world) < best.world.distance_to(u.world)):
						best = b
				if best != null:
					u.set_task("farm", best)
					sent += 1
			"wood", "iron":
				var s := nearest_supply(u.world, work, me)
				if s != null:
					u.set_task("gather", s)
					sent += 1
			"build":
				var best: Building = null
				for b in buildings:
					if b.side == me and not b.complete and b.standing() \
							and (best == null or b.world.distance_to(u.world) < best.world.distance_to(u.world)):
						best = b
				if best != null:
					u.set_task("build", best)
					sent += 1
	var what: String = {"farm": "naar de akkers", "wood": "naar het hout", "iron": "naar de mijn", "build": "aan het bouwen"}[work]
	say("%d boer%s %s." % [sent, "" if sent == 1 else "en", what] if sent > 0 else {"farm": "Geen akker met plaats.", "wood": "Geen hout bij een eigen houthakkerskamp.",
		"iron": "Geen afzetting met een eigen mijn.", "build": "Niets in aanbouw."}[work])


## Tab: the next (Shift: previous) French battalion, selected and in view.
func cycle_regiment(back := false) -> void:
	var own: Array[Regiment] = []
	for r in regiments:
		if r.side == me and not r.destroyed():
			own.append(r)
	if own.is_empty():
		return
	var now := own.find(selected[0]) if not selected.is_empty() else -1
	var next := own[posmod(now + (-1 if back else 1), own.size())]
	select_units(next.living())
	focus_selection()


## Space: the camera to the selection.
func focus_selection() -> void:
	if camera == null:
		return
	if selected_building != null:
		camera.focus(Iso.to_screen(selected_building.world))
		return
	if selected_units.is_empty():
		return
	var sum := Vector2.ZERO
	for u in selected_units:
		sum += u.world
	camera.focus(Iso.to_screen(sum / selected_units.size()))


## Halt: the battalions stand where they are, the free men stop.
func halt() -> void:
	if _relay("halt"):
		return
	for r in selected:
		r.order_move(r.centroid(), r.facing)
	for u in selected_units:
		if u.regiment == null:
			u.task = ""
			u.move_to(u.world)
	if not selected_units.is_empty():
		say("Halt.")


## Where a barracks gathers its men: its rally point, else before its door.
func muster_point(b: Building) -> Vector2:
	if b.rally != null:
		return b.rally
	return b.world + Vector2(0, b.size.y)


## The free men near a barracks that would make up a battalion now: the
## musketeers of the kind most of them are (up to 36), an officer on foot and
## a drummer, and what is missing (the web game's quick regiment).
func quick_plan(b: Building) -> Dictionary:
	var at := muster_point(b)
	var near: Array[Unit] = []
	for u in units:
		if u.side == b.side and u.alive() and u.regiment == null and u.world.distance_to(at) <= QUICK_REACH:
			near.append(u)
	near.sort_custom(func(a: Unit, c: Unit) -> bool: return a.world.distance_to(at) < c.world.distance_to(at))
	var kinds := {}
	for u in near:
		if u.type == "infantry":
			kinds[u.troop] = kinds.get(u.troop, 0) + 1
	var kind := ""
	var most := 0
	for k: String in kinds:
		if kinds[k] > most:
			most = kinds[k]
			kind = k
	var men: Array[Unit] = []
	var officer: Unit = null
	var drummer: Unit = null
	for u in near:
		if u.type == "infantry" and u.troop == kind and men.size() < Regiment.MAX_MEN:
			men.append(u)
		elif u.type == "officer" and u.troop != "mounted" and officer == null:
			officer = u
		elif u.type == "drummer" and drummer == null:
			drummer = u
	var missing := {"infantry": maxi(0, Regiment.MIN_MEN - men.size()), "officer": 0 if officer != null else 1, "drummer": 0 if drummer != null else 1}
	if officer != null:
		men.append(officer)
	if drummer != null:
		men.append(drummer)
	return {"men": men, "kind": kind, "missing": missing,
		"ok": missing["infantry"] == 0 and missing["officer"] == 0 and missing["drummer"] == 0}


func quick_regiment(b: Building = null) -> Regiment:
	if b == null and _relay("quick_regiment"):
		return null
	b = b if b != null else selected_building
	if b == null or b.type != "barracks":
		return null
	var plan := quick_plan(b)
	if not plan["ok"]:
		say("Nog nodig voor een bataljon: %s. Kies 'Train ontbrekende'." % _missing_text(plan["missing"]), b.side)
		return null
	var r := form_regiment(plan["men"])
	if r != null:
		var at := muster_point(b)
		var foe := town_centre("britain" if b.side == "france" else "france")
		r.order_move(at, (foe.world - at).angle() if foe != null else r.facing)
	return r


func _missing_text(missing: Dictionary) -> String:
	var parts: Array[String] = []
	if missing["infantry"] > 0:
		parts.append("%d musketiers" % missing["infantry"])
	if missing["officer"] > 0:
		parts.append("een officier")
	if missing["drummer"] > 0:
		parts.append("een tamboer")
	return ", ".join(parts)


## Train what the barracks lacks for a battalion (men already queued count),
## and let it form the battalion itself once they are ready.
func train_missing(b: Building = null) -> int:
	if b == null and _relay("train_missing"):
		return 0
	b = b if b != null else selected_building
	if b == null or b.type != "barracks":
		return 0
	var plan := quick_plan(b)
	var kind: String = plan["kind"]
	var musket := "infantry" if kind == "" else "infantry:" + kind
	var n := 0
	for item: String in ["officer", "drummer", musket]:
		var want: int = plan["missing"][Rules.item_type(item)]
		for q in b.queue:
			if q == item:
				want -= 1
		for i in want:
			if queue_unit(b, item):
				n += 1
	b.auto_regiment = true
	say("%d man in opleiding; de kazerne vormt het bataljon zodra ze klaar zijn (Auto-bataljon aan)." % n if n > 0
		else "Niets te trainen (of te weinig grondstoffen of ruimte).")
	refresh_hud()
	return n


func toggle_auto_regiment() -> void:
	if _relay("toggle_auto_regiment"):
		return
	var b := selected_building
	if b != null and b.type == "barracks":
		b.auto_regiment = not b.auto_regiment
		say("Auto-bataljon %s." % ("aan" if b.auto_regiment else "uit"))
		refresh_hud()


func _auto_regiments() -> void:
	for b in buildings:
		if b.type == "barracks" and commanded(b.side) and b.auto_regiment and b.complete and b.standing() and quick_plan(b)["ok"]:
			var r := quick_regiment(b)
			if r != null:
				say("%s gevormd bij de kazerne (Auto-bataljon)." % r.name)


func upgrade_trench() -> void:
	if _relay("upgrade_trench"):
		return
	for r in selected:
		if trenches.upgrade(r):
			break
	refresh_hud()


## The selected free musketeers fill the selected battalion's ranks.
func reinforce() -> void:
	if _relay("reinforce"):
		return
	var battalions: Array[Regiment] = selected
	if battalions.is_empty():
		return
	var free: Array[Unit] = []
	for u in selected_units:
		if u.regiment == null and u.type == "infantry":
			free.append(u)
	var added := battalions[0].reinforce(free)
	say("%s aangevuld met %d man." % [battalions[0].name, added] if added > 0 else "Selecteer een bataljon en losse musketiers om aan te vullen.")
	if _hud != null:
		_hud.refresh()


func form_regiment(from: Array[Unit] = []) -> Regiment:
	if from.is_empty() and _relay("form_regiment"):
		return null
	var list: Array[Unit] = selected_units if from.is_empty() else from
	var r := Regiment.raise(list)
	if r == null:
		r = Regiment.raise_cavalry(list)
	if r == null:
		if from.is_empty():
			say("Een bataljon vraagt %d tot %d musketiers, een officier en een tamboer; een regiment cavalerie %d tot %d ruiters van één soort en een officier te paard." % [
				Regiment.MIN_MEN, Regiment.MAX_MEN, Regiment.CAV_MIN, Regiment.CAV_MAX])
		return null
	r.id = _new_id()
	regiments.append(r)
	if commanded(r.side):
		say("%s gevormd met %d man." % [r.name, r.men.size()], r.side)
		refresh_hud()
	return r


## Living men and queued recruits of a training item ("infantry:guard").
func count_of(side: String, item: String) -> int:
	var n := 0
	for u in units:
		if u.side == side and u.alive() and u.type == Rules.item_type(item) and u.troop == Rules.item_troop(item):
			n += 1
	for b in buildings:
		if b.side == side:
			n += b.queue.count(item)
	return n


func train(type: String) -> void:
	if _relay("train", [type]):
		return
	var b := selected_building
	if b == null or not queue_unit(b, type):
		return
	say("%s in opleiding." % Rules.label(type))
	if _hud != null:
		_hud.refresh()


## Strengthen a finished tower to its next level, as the web game: the cost
## now, the garrison keeps firing while it builds.
func upgrade_tower(b: Building) -> bool:
	if _relay("upgrade_tower"):
		return false
	if b == null or not b.can_upgrade() or result != "":
		return false
	var next := Rules.tower_level(b.tower_level + 1)
	if not can_afford(b.side, next["cost"]):
		say("Te weinig grondstoffen voor %s." % String(next["label"]).to_lower(), b.side)
		return false
	pay(b.side, next["cost"])
	b.start_upgrade()
	say("%s wordt gebouwd (%d s)." % [next["label"], next["seconds"]], b.side)
	refresh_hud()
	return true


func refresh_hud() -> void:
	if _hud != null:
		_hud.refresh()


func queue_unit(b: Building, type: String) -> bool:
	if b == null or not b.complete or not b.standing() or Rules.item_building(type) != b.type:
		return false
	if Rules.item_type(type) == "artillery" and clock < Rules.ARTILLERY_AFTER:
		say("De gieterij levert pas kanonnen na twee minuten.", b.side)
		return false
	var most: Variant = Rules.troop(Rules.item_troop(type)).get("max")
	if most != null and count_of(b.side, type) >= int(most):
		say("Van de %s zijn er hooguit %d." % [Rules.label(type), int(most)], b.side)
		return false
	var cost := Rules.item_cost(type)
	if not can_afford(b.side, cost):
		say("Niet genoeg grondstoffen: %s nodig." % Rules.cost_text(cost), b.side)
		return false
	if not has_room(b.side, Rules.item_type(type)):
		say("Geen ruimte: bouw een huis voor meer inwoners.", b.side)
		return false
	pay(b.side, cost)
	b.queue.append(type)
	return true


func start_placing(type: String) -> void:
	if not can_afford(me, Rules.cost_of(type)):
		say("Niet genoeg grondstoffen: %s nodig." % Rules.cost_text(Rules.cost_of(type)))
		return
	placing = type
	say("Kies een plek voor de %s (rechtsklik of Escape: annuleren)." % Rules.label(type).to_lower())


## Where `type` may stand (null if it may not): on open ground, clear of
## buildings, houses, trees and the river; a camp by a wood, a mine on a free
## iron deposit (it snaps onto it).
func site_for(type: String, at: Vector2) -> Variant:
	var info := Rules.building_type(type)
	var size := Vector2(float(info.get("w", 60)), float(info.get("h", 50)))
	if type == "mine":
		for s in supplies:
			if s.kind == "iron" and not s.gone() and s.world.distance_to(at) <= s.radius and mine_on_any(s) == null:
				return s.world
		return null
	var half := size / 2.0 + Vector2(10, 10)
	if at.x < half.x or at.y < half.y or at.x > Iso.WORLD.x - half.x or at.y > Iso.WORLD.y - half.y:
		return null
	for b in buildings:
		if b.standing() and absf(b.world.x - at.x) < half.x + b.size.x / 2.0 and absf(b.world.y - at.y) < half.y + b.size.y / 2.0:
			return null
	var reach := maxf(size.x, size.y) / 2.0
	for s in supplies:
		if not s.gone() and s.world.distance_to(at) < reach + s.radius + 6.0:
			return null
	for h in houses:
		if Vector2(h["x"], h["y"]).distance_to(at) < reach + float(h["w"]) / 2.0:
			return null
	for i in range(1, _river.size()):
		var a := Vector2(_river[i - 1][0], _river[i - 1][1])
		var b := Vector2(_river[i][0], _river[i][1])
		if Geometry2D.get_closest_point_to_segment(at, a, b).distance_to(at) < reach + 40.0:
			return null
	if type == "lumbercamp":
		var trees := 0
		for s in supplies:
			if s.kind == "wood" and not s.gone() and s.world.distance_to(at) <= Rules.logging_radius():
				trees += 1
		if trees < 3:
			return null
	return at


## Lay out a building site for `side` and set `builders` to work on it.
func lay_out(side: String, type: String, at: Vector2, builders: Array[Unit]) -> Building:
	var spot_at: Variant = site_for(type, at)
	var cost := Rules.cost_of(type)
	if spot_at == null or not can_afford(side, cost):
		return null
	pay(side, cost)
	var b := add_building(side, type, spot_at, false)
	for u in builders:
		if u.type == "worker" and u.alive():
			u.set_task("build", b)
	return b


func place(at: Vector2) -> void:
	if _relay("build_at", [placing, at]):
		placing = ""
		return
	var builders: Array[Unit] = []
	for u in selected_units:
		if u.type == "worker":
			builders.append(u)
	var b := lay_out(me, placing, at, builders)
	if b == null:
		say("Daar kan de %s niet staan." % Rules.label(placing).to_lower())
		return
	say("Bouwplaats voor de %s uitgezet." % Rules.label(placing).to_lower())
	placing = ""
	if _hud != null:
		_hud.refresh()


func _thing_at(at: Vector2, enemy: bool) -> Node2D:
	var screen := Iso.to_screen(at)
	for u in units:
		if u.alive() and (u.side != me) == enemy and u.visible and u.position.distance_to(screen) < 14.0:
			return u
	for b in buildings:
		if b.standing() and (b.side != me) == enemy and absf(b.world.x - at.x) < b.size.x / 2.0 and absf(b.world.y - at.y) < b.size.y / 2.0:
			return b
	return null


func _supply_at(at: Vector2) -> Supply:
	for s in supplies:
		if not s.gone() and s.world.distance_to(at) < s.radius + 14.0:
			return s
	return null


func _unhandled_input(event: InputEvent) -> void:
	var key := event as InputEventKey
	if key != null and key.pressed and not key.echo:
		match key.physical_keycode:
			KEY_R:
				if result != "" and net_role == "":
					get_tree().reload_current_scene()
			KEY_F10:
				get_tree().change_scene_to_file("res://scenes/menu.tscn")
			KEY_ESCAPE:
				placing = ""
			KEY_1:
				set_formation("line")
			KEY_2:
				set_formation("column")
			KEY_3:
				set_formation("square")
			KEY_C:
				charge()
			KEY_G:
				hold()
			KEY_T:
				skirmish()
			KEY_H:
				halt()
			KEY_K:
				toggle_shot()
			KEY_TAB:
				cycle_regiment(key.shift_pressed)
			KEY_SPACE:
				focus_selection()
			KEY_F:
				form_regiment()
			KEY_M:
				sounds.enabled = not sounds.enabled
				say("Geluid %s." % ("aan" if sounds.enabled else "uit"))
			KEY_V:
				fog.enabled = not fog.enabled
				fog.refresh()
		return
	if event is InputEventMouseMotion and _drag_start != null:
		_overlay.box = Rect2(_drag_start, Vector2.ZERO).expand(get_global_mouse_position())
		return
	var button := event as InputEventMouseButton
	if button == null:
		return
	var canvas_at := get_global_mouse_position()
	if button.button_index == MOUSE_BUTTON_LEFT:
		if button.pressed:
			if placing != "":
				place(Iso.to_world(canvas_at))
				return
			_drag_start = canvas_at
		elif _drag_start != null:
			var box := Rect2(_drag_start, Vector2.ZERO).expand(canvas_at)
			_drag_start = null
			_overlay.box = Rect2()
			_select_in(box, button.shift_pressed)
	elif button.button_index == MOUSE_BUTTON_RIGHT:
		if placing != "":
			if button.pressed:
				placing = ""
			return
		if button.pressed:
			_order_start = Iso.to_world(canvas_at)
		elif _order_start != null:
			var to: Vector2 = _order_start
			var end := Iso.to_world(canvas_at)
			_order_start = null
			order(to, (end - to).angle() if end.distance_to(to) > 25.0 else null)


func _select_in(box: Rect2, add: bool) -> void:
	var picked: Array[Unit] = []
	if box.size.length() < 6.0:
		var nearest: Unit = null
		var best := 16.0
		for u in units:
			if u.alive() and u.side == me:
				var d := u.position.distance_to(box.position)
				if d < best:
					best = d
					nearest = u
		if nearest != null:
			# A man of a battalion selects his battalion.
			if nearest.regiment != null and not nearest.regiment.routing:
				picked.append_array(nearest.regiment.living())
			else:
				picked.append(nearest)
			select_units(picked, add)
			return
		var b := _thing_at(Iso.to_world(box.position), false) as Building
		select_building(b)
		return
	var soldiers: Array[Unit] = []
	for u in units:
		if u.alive() and u.side == me and box.has_point(u.position):
			picked.append(u)
			if u.military():
				soldiers.append(u)
	# Soldiers before peasants when a box catches both.
	select_units(soldiers if not soldiers.is_empty() else picked, add)


## The web game's rules: a side is beaten when its headquarters has fallen
## and it has no fighting men left; or a side wins by holding all three
## territories, uncontested, for two minutes (a challenge starts the count
## again).
func _check_result(delta: float) -> void:
	if result != "":
		return
	var f := _beaten("france")
	var b := _beaten("britain")
	if f or b:
		_finish("draw" if f and b else ("britain" if f else "france"), "elimination")
		return
	var side := ""
	if territories.size() == 3:
		side = territories[0]["owner"]
		for p in territories:
			if p["owner"] != side or p["contested"] or p["claim"] != "":
				side = ""
	held_seconds = held_seconds + delta if side != "" and side == hold_side else 0.0
	hold_side = side
	if side != "" and held_seconds >= HOLD_TO_WIN:
		_finish(side, "territories")


## Seconds still to hold all three territories, for the HUD.
func hold_left() -> float:
	return HOLD_TO_WIN - held_seconds


func _beaten(side: String) -> bool:
	if town_centre(side) != null:
		return false
	for u in units:
		if u.side == side and u.alive() and u.type != "worker":
			return false
	return true


func _finish(side: String, reason: String) -> void:
	winner = side
	end_reason = reason
	ended_at = clock
	var names := {"france": "Frankrijk", "britain": "Groot-Brittannië"}
	result = "Gelijkspel" if side == "draw" else ("Overwinning!" if side == me else "Nederlaag")
	if reason == "territories":
		status = "%s heeft alle drie gebieden twee minuten onbetwist beheerst." % names[side]
	elif side == "draw":
		status = "Beide legers hebben hun hoofdkwartier en alle gevechtstroepen verloren."
	else:
		status = "%s heeft het vijandelijke hoofdkwartier en alle gevechtstroepen uitgeschakeld." % names[side]
	refresh_hud()


## A side's numbers for the end screen: trained, lost and remaining men and
## buildings, and territories held.
func side_stats(side: String) -> Dictionary:
	var alive := 0
	for u in units:
		if u.side == side and u.alive():
			alive += 1
	var standing := 0
	for b in buildings:
		if b.side == side and b.standing():
			standing += 1
	var s: Dictionary = stats[side].duplicate()
	s["units_remaining"] = alive
	s["buildings_remaining"] = standing
	s["territories"] = territories_held(side)
	return s
