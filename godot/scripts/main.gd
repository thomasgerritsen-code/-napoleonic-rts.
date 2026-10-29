class_name Battle
extends Node2D
## The game: the web game's map and opening (assets/map/start.json), France
## (the player) against Britain (the computer). Peasants gather, build and
## farm; buildings train units; musketeers with an officer and a drummer form
## battalions; the side whose town centre falls loses.
##
## Mouse: click or drag to select, right click to order (move, attack,
## gather, build, farm); drag the right button to set a battalion's facing.
## Keys: 1 line, 2 column, C charge, F form a battalion, Escape cancels a
## building plan; WASD/arrows, the middle button and the wheel move the camera.

const SIDES := ["france", "britain"]
const LAB_BATTALIONS := 4    # a side on the test field
const LAB_MEN := 36

## "campaign" (the full game) or "lab" (the test field), chosen in the menu.
static var mode := "campaign"

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
var status := ""
var clock := 0.0
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
var _woods_clock := 0.0
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


func _ready() -> void:
	randomize()
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	Iso.load_relief(meta)
	_add_ground(meta)
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
	_load_opening()
	if mode == "lab":
		_set_up_lab()
	ai = BritishCommand.new(self)
	ai.army_only = mode == "lab"
	camera = BattleCamera.new()
	add_child(camera)
	var home := town_centre("france")
	camera.focus(Iso.to_screen(home.world + Vector2(260, 60)) if home != null else Iso.to_screen(Iso.WORLD / 2.0))
	if mode == "lab":
		camera.focus(Iso.to_screen(Vector2(4900, 3100)))
	var day := DayNight.new()
	day.battle = self
	add_child(day)
	_hud = Hud.new()
	_hud.battle = self
	add_child(_hud)
	say("Rechtsklik met boeren op struiken voor voedsel; bouw een houthakkerskamp bij het bos voor hout.")


func _process(delta: float) -> void:
	clock += delta
	for r in regiments:
		r.update(delta, regiments)
	for u in units:
		u.step(delta)
	_keep_apart()
	for b in buildings:
		b.step(delta)
	_hold_territories(delta)
	_woods_clock -= delta
	if _woods_clock <= 0.0:
		_woods_clock = 0.5
		woods.update()
	ai.update(delta)
	_tidy_selection()
	_check_result()


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
	woods.plant(self, _units_layer, Iso.read_json("res://assets/map/gamemap.json"))
	for data: Dictionary in start["buildings"]:
		var b := add_building(String(data["side"]), String(data["type"]), Vector2(data["x"], data["y"]), true)
		b.id = int(data["id"])
	for data: Dictionary in start["units"]:
		var u := add_unit(String(data["side"]), String(data["type"]), Vector2(data["x"], data["y"]))
		u.id = int(data["id"])


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


func add_unit(side: String, type: String, at: Vector2) -> Unit:
	var u := Unit.new()
	u.id = _new_id()
	u.setup(self, side, type, at)
	u.fired.connect(_on_fired)
	units.append(u)
	_units_layer.add_child(u)
	return u


func add_building(side: String, type: String, at: Vector2, built: bool) -> Building:
	var b := Building.new()
	b.id = _new_id()
	b.setup(self, side, type, at, built)
	buildings.append(b)
	_units_layer.add_child(b)
	return b


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
	if u.side != "france":
		return
	if used_up != null and used_up.kind == "wood":
		say("Het bos bij uw houthakkerskamp is op: bouw een nieuw kamp bij een ander bos.")
	elif used_up != null:
		say("Een boer heeft geen %s meer in de buurt." % Rules.label(used_up.kind))


func on_built(b: Building, by: Unit) -> void:
	if b.side == "france":
		say("%s voltooid." % Rules.label(b.type))
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


func on_destroyed(b: Building) -> void:
	if selected_building == b:
		selected_building = null
	if b.side == "france":
		say("Uw %s is verwoest!" % Rules.label(b.type).to_lower())
	if _hud != null:
		_hud.refresh()


func spawn_trained(b: Building, type: String) -> void:
	var out := b.world + Vector2((1.0 if b.side == "france" else -1.0) * b.size.x * 0.75, b.size.y * 0.55)
	var u := add_unit(b.side, type, out + Vector2(randf_range(-14, 14), randf_range(-10, 10)))
	u.slot = u.world + Vector2((1.0 if b.side == "france" else -1.0) * 40.0, randf_range(-20, 20))
	if b.side == "france":
		say("%s is klaar." % Rules.label(type))
		if _hud != null:
			_hud.refresh()
	else:
		ai.on_trained(u)


func say(text: String) -> void:
	status = text


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
				if side == "france":
					say("%s veroverd." % p["label"])
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
	for i in shots:
		_puff(top + Vector2(randf_range(-8, 8), 0), 0.5, 2.2)
		if randf() < 0.6:
			foe.hit(damage * randf_range(0.8, 1.4))


# ---- musketry and blows ----

func _on_fired(u: Unit, target: Node2D) -> void:
	if u.type != "cavalry":
		_puff(u.muzzle(), 1.3 if u.type == "artillery" else 0.55, 3.2 if u.type == "artillery" else 2.6)
	if not is_foe(target, u.side):
		return
	var distance := u.world.distance_to(spot(target))
	var info := Rules.unit_type(u.type)
	var damage := float(info.get("damage", 20))
	if target is Building:
		(target as Building).hit(damage * (2.5 if u.type == "artillery" else 0.4))
		return
	var foe := target as Unit
	match u.type:
		"cavalry":
			if randf() < 0.6:
				foe.hit(damage * randf_range(1.0, 2.2))
		"artillery":
			# Roundshot ploughs through: everyone near the point of impact.
			var impact := foe.world + Vector2(randf_range(-20, 20), randf_range(-14, 14))
			for other in units:
				if other.alive() and other.side != u.side and other.world.distance_to(impact) < 26.0:
					other.hit(damage * randf_range(0.6, 1.3))
			_puff(impact, 0.8, 1.6)
		_:
			var chance := clampf(0.45 - distance / 600.0, 0.06, 0.4)
			if u.regiment != null:
				chance *= u.regiment.fire_factor()
			if randf() < chance:
				foe.hit(randf_range(45.0, 100.0))


func _puff(world_at: Vector2, size: float, life: float) -> void:
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
		if u.alive() and u.side == "france" and not selected_units.has(u):
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
	if selected_units.is_empty():
		return
	var foe := _thing_at(at, true)
	var supply := _supply_at(at)
	var own := _thing_at(at, false) as Building
	var workers: Array[Unit] = []
	var free: Array[Unit] = []
	for u in selected_units:
		if u.regiment != null:
			continue
		if u.type == "worker":
			workers.append(u)
		else:
			free.append(u)
	for w in workers:
		if supply != null and supply.usable_by("france"):
			w.set_task("gather", supply)
		elif supply != null and supply.kind == "wood":
			say("Hout kappen kan alleen binnen bereik van een eigen houthakkerskamp.")
			w.task = ""
			w.move_to(at)
		elif supply != null and supply.kind == "iron":
			say("IJzer winnen kan alleen bij een eigen mijn op de afzetting.")
			w.task = ""
			w.move_to(at)
		elif own != null and own.side == "france" and not own.complete:
			w.set_task("build", own)
		elif own != null and own.side == "france" and own.type == "farm":
			w.set_task("farm", own)
		else:
			w.task = ""
			w.move_to(Nav.dry(w.world, at))
	_spread(free, at, foe)
	var battalions: Array[Regiment] = selected
	if not battalions.is_empty():
		_order_battalions(battalions, at if foe == null else spot(foe), face)
	if _overlay != null:
		_overlay.mark(Iso.to_screen(at))


func _spread(list: Array[Unit], at: Vector2, foe: Node2D) -> void:
	var across := ceili(sqrt(list.size()))
	for i in list.size():
		var u := list[i]
		if foe != null:
			u.move_to(spot(foe))
			u.ordered = false
			u.target = foe
		else:
			u.move_to(at + Vector2((i % across - (across - 1) / 2.0) * 18.0, (i / across) * 18.0))


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
	for r: Regiment in line_up:
		var w: float = widths[r]
		r.order_move(to + right * (offset + w / 2.0), facing)
		offset += w


func set_formation(kind: String) -> void:
	for r in selected:
		r.set_formation(kind)


func charge() -> void:
	for r in selected:
		r.charge(regiments)


func form_regiment(from: Array[Unit] = []) -> Regiment:
	var r := Regiment.raise(selected_units if from.is_empty() else from)
	if r == null:
		if from.is_empty():
			say("Een bataljon vraagt %d tot %d musketiers, een officier en een tamboer." % [Regiment.MIN_MEN, Regiment.MAX_MEN])
		return null
	regiments.append(r)
	if r.side == "france":
		say("%s gevormd met %d man." % [r.name, r.men.size()])
		if _hud != null:
			_hud.refresh()
	return r


func train(type: String) -> void:
	var b := selected_building
	if b == null or not queue_unit(b, type):
		return
	say("%s in opleiding." % Rules.label(type))
	if _hud != null:
		_hud.refresh()


func queue_unit(b: Building, type: String) -> bool:
	if b == null or not b.complete or not b.standing() or Rules.TRAINED_AT.get(type, "") != b.type:
		return false
	if type == "artillery" and clock < Rules.ARTILLERY_AFTER:
		if b.side == "france":
			say("De gieterij levert pas kanonnen na twee minuten.")
		return false
	var cost := Rules.cost_of(type)
	if not can_afford(b.side, cost):
		if b.side == "france":
			say("Niet genoeg grondstoffen: %s nodig." % Rules.cost_text(cost))
		return false
	if not has_room(b.side, type):
		if b.side == "france":
			say("Geen ruimte: bouw een huis voor meer inwoners.")
		return false
	pay(b.side, cost)
	b.queue.append(type)
	return true


func start_placing(type: String) -> void:
	if not can_afford("france", Rules.cost_of(type)):
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
	var builders: Array[Unit] = []
	for u in selected_units:
		if u.type == "worker":
			builders.append(u)
	var b := lay_out("france", placing, at, builders)
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
		if u.alive() and (u.side != "france") == enemy and u.visible and u.position.distance_to(screen) < 14.0:
			return u
	for b in buildings:
		if b.standing() and (b.side != "france") == enemy and absf(b.world.x - at.x) < b.size.x / 2.0 and absf(b.world.y - at.y) < b.size.y / 2.0:
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
				if result != "":
					get_tree().reload_current_scene()
			KEY_F10:
				get_tree().change_scene_to_file("res://scenes/menu.tscn")
			KEY_ESCAPE:
				placing = ""
			KEY_1:
				set_formation("line")
			KEY_2:
				set_formation("column")
			KEY_C:
				charge()
			KEY_F:
				form_regiment()
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
			if u.alive() and u.side == "france":
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
		if u.alive() and u.side == "france" and box.has_point(u.position):
			picked.append(u)
			if u.military():
				soldiers.append(u)
	# Soldiers before peasants when a box catches both.
	select_units(soldiers if not soldiers.is_empty() else picked, add)


func _check_result() -> void:
	if result != "":
		return
	if town_centre("britain") == null:
		result = "Overwinning! Het Britse stadhuis is gevallen."
	elif town_centre("france") == null:
		result = "Nederlaag. Uw stadhuis is gevallen."
