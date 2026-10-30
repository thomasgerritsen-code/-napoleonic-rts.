class_name Trenches
extends Node2D
## Standing firm and digging in, as the web game's regiment orders: a battalion
## told to hold (G) braces once it has stood four seconds in line or square,
## taking 70% of the losses and reloading quicker. A braced line goes on to
## dig a trench along its front (25 s, slower under fire, three times as quick
## with sappers). Men in a finished trench, of either side, take half the
## losses from fire in front of them (not from shells and grenades lobbed in,
## nor from the flank); a trench can be revetted and fortified for wood and
## iron. Any battalion that halts by an empty trench steps into it, or is sent
## into one with a click on it (more battalions form a second line behind).
## Horses at the cut and its ditch go slowly and are easy targets.
##
## How it looks is the web iso view's (TrenchArt): the cut and its bed here,
## under everything; the bank as a node among the men (in front of or behind
## them as it lies); and the men in it dressed every frame: sunk to the bed
## (or the fire-step), hidden below the near lip, the front rank leaning on the
## bank with its muskets over it, the officer and drummer at the two ends.

var battle: Battle
## {centre, facing, length, width, progress, level, upgrade_to, upgrade_progress, holder, dug_at}
var list: Array[Dictionary] = []
## Where round shot and shells struck: {world, way, at}.
var craters: Array[Dictionary] = []
var _clock := 0.0
var _next_id := 0
var _banks: Array[Node2D] = []
## The gabions and sandbags, each its own sprite among the men; rebuilt when
## a trench's look changes (key: what they were built for).
var _revetment: Array[Sprite2D] = []
var _revetment_key := ""
var _fascine: Texture2D
var _gabion: Texture2D
var _bags: Texture2D
var _props := {}


## The bank of one trench, among the men so that it stands in front of or
## behind them as it lies.
class Bank extends Node2D:
	var owner_list: Trenches
	var index := 0

	func _draw() -> void:
		if index >= owner_list.list.size():
			return
		var t: Dictionary = owner_list.list[index]
		TrenchArt.draw_bank(self, t, position)


func _ready() -> void:
	z_index = -5
	texture_repeat = CanvasItem.TEXTURE_REPEAT_ENABLED
	var props: Dictionary = Iso.read_json("res://assets/props/props.json")["props"]
	_props = props
	for name_: String in ["fascine_wall", "gabion", "sandbags"]:
		var path := "res://assets/props/%s.webp" % name_
		if ResourceLoader.exists(path):
			match name_:
				"fascine_wall":
					_fascine = load(path)
				"gabion":
					_gabion = load(path)
				"sandbags":
					_bags = load(path)


## Every frame: the banks in place and the men in the trenches dressed.
func _process(_delta: float) -> void:
	if battle == null:
		return
	while _banks.size() < list.size():
		var bank := Bank.new()
		bank.owner_list = self
		bank.index = _banks.size()
		battle.add_to_field(bank)
		_banks.append(bank)
	while _banks.size() > list.size():
		_banks.pop_back().queue_free()
	var busy := false
	for i in list.size():
		var t := list[i]
		var f := TrenchArt.Frame.new(t)
		_banks[i].position = f.at(0.0, f.w + 7.0)
		_banks[i].queue_redraw()
		busy = busy or t["progress"] < 1.0 or int(t.get("upgrade_to", 0)) != 0
	if busy:
		queue_redraw()
	_place_revetment()
	_dress_men()


func _place_revetment() -> void:
	var key := ""
	for t in list:
		key += "%d:%d:%d:%.2f;" % [TrenchArt.id_of(t), int(t.get("level", 1)), int(t.get("upgrade_to", 0)), float(t.get("upgrade_progress", 0.0))]
	if key == _revetment_key:
		return
	_revetment_key = key
	for s in _revetment:
		s.queue_free()
	_revetment.clear()
	for t in list:
		for spot: Array in TrenchArt.revetment_spots(t):
			var kind: String = spot[0]
			var tex: Texture2D = _gabion if kind == "gabion" else _bags
			if tex == null:
				continue
			var meta: Dictionary = _props.get(kind, {})
			var sprite := Sprite2D.new()
			sprite.texture = tex
			sprite.centered = false
			sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE * (1.0 if kind == "gabion" else 0.8)
			sprite.offset = -Vector2(meta["pivot"]["x"], meta["pivot"]["y"])
			sprite.position = spot[1]
			battle.add_to_field(sprite)
			_revetment.append(sprite)


## Once a second: who stands braced, who digs, who mans a trench.
func update(delta: float) -> void:
	_clock -= delta
	var cfg := Rules.orders()
	for t in list:
		_upgrade_work(t, delta)
	if _clock > 0.0:
		return
	_clock = 1.0
	_repair(cfg)
	for r in battle.regiments:
		if r.routing or r.destroyed():
			continue
		var c := r.centroid()
		var still := r.last_centre.distance_to(c) < 8.0
		r.last_centre = c
		r.still_seconds = r.still_seconds + 1 if still else 0
		var formed := r.formation == "line" or r.formation == "square"
		if r.hold and still and formed:
			if r.braced_at < 0.0:
				r.braced_at = battle.clock
		else:
			r.braced_at = -1.0
		_man(r, c, cfg)
		if r.hold and still and r.formation == "line":
			_dig(r, c, cfg)
		if r.trench != null:
			_staff(r)
			# The computer fortifies its trenches when it has wood and iron to spare.
			var next := Rules.trench_level(int(r.trench["level"]) + 1)
			if not battle.commanded(r.side) and r.hold and r.still_seconds >= 3 and not next.is_empty() \
					and battle.can_afford(r.side, {"wood": float(next["cost"].get("wood", 0)) + 200.0, "iron": float(next["cost"].get("iron", 0)) + 40.0}):
				upgrade(r)
	queue_redraw()


func braced(r: Regiment) -> bool:
	return r != null and not r.routing and r.braced_at >= 0.0 and battle.clock - r.braced_at >= float(Rules.orders()["braceSeconds"])


## The finished trench a point lies in, if any.
func trench_at(p: Vector2) -> Variant:
	for t in list:
		if t["progress"] >= 1.0 and _inside(t, p, 0.0):
			return t
	return null


## The share of a hit a man takes: less in a trench when it comes from the
## front, less when his battalion stands braced; more for a horse at a ditch.
func cover(victim: Unit, from: Vector2, lobbed := false) -> float:
	if list.is_empty() and (victim.regiment == null or not braced(victim.regiment)):
		return 1.0
	var cfg := Rules.orders()
	if victim.type == "cavalry":
		return float(cfg["cavalryExposed"]) if obstacle_at(victim.world) else 1.0
	var t: Variant = trench_at(victim.world)
	if t != null and not lobbed:
		var way := (from - victim.world).normalized()
		if way.dot(Vector2.from_angle(t["facing"])) > 0.17:
			# A breached parapet covers little.
			if t.get("breached", false):
				return Battle.depth_rule_static("breachedCover", 0.8)
			return float(Rules.trench_level(t["level"]).get("damage", cfg["trenchDamage"]))
	if braced(victim.regiment):
		return float(cfg["defendDamage"])
	return 1.0


## The share of the shock to his nerve a man takes: in a trench or a braced
## line he stands it better.
func shock_factor(u: Unit) -> float:
	var cfg := Rules.orders()
	if not list.is_empty():
		var t: Variant = trench_at(u.world)
		if t != null:
			return float(Rules.trench_level(t["level"]).get("shock", cfg.get("trenchShock", 0.45)))
	return float(cfg.get("defendShock", 0.55)) if braced(u.regiment) else 1.0


## The cut, its bank and the ditch in front: horses flounder there.
func obstacle_at(p: Vector2) -> bool:
	for t in list:
		if t["progress"] < 0.5:
			continue
		var d: Vector2 = p - t["centre"]
		var forward := Vector2.from_angle(t["facing"])
		var along := absf(d.dot(forward.orthogonal()))
		var across := d.dot(forward)
		if along <= t["length"] / 2.0 + 10.0 and across >= -t["width"] / 2.0 - 6.0 and across <= t["width"] / 2.0 + 46.0:
			return true
	return false


## A trench being dug or built up right now by the men standing in it.
func digging_at(p: Vector2) -> bool:
	for t in list:
		if (t["progress"] < 1.0 or t["upgrade_to"] != 0) and battle.clock - float(t["dug_at"]) < 2.0 and _inside(t, p, 0.0):
			return true
	return false


func _inside(t: Dictionary, p: Vector2, pad: float) -> bool:
	var d: Vector2 = p - t["centre"]
	var forward := Vector2.from_angle(t["facing"])
	return absf(d.dot(forward.orthogonal())) <= t["length"] / 2.0 + pad and absf(d.dot(forward)) <= t["width"] / 2.0 + pad


func _near(c: Vector2, reach: float) -> Variant:
	for t in list:
		if c.distance_to(t["centre"]) < reach:
			return t
	return null


## Sappers make a battalion dig and build three times as quick.
func _work(r: Regiment) -> float:
	var work := float(Rules.troop("sapper").get("work", 0.0))
	var men := 0
	var sappers := 0
	for u in r.living():
		if u.type == "infantry":
			men += 1
			if u.troop == "sapper":
				sappers += 1
	return 1.0 + work * sappers / men if men > 0 else 1.0


func _dig(r: Regiment, c: Vector2, cfg: Dictionary) -> void:
	var near: Variant = _near(c, float(cfg["trenchSnap"]))
	if near != null and near["progress"] >= 1.0:
		return
	if not braced(r) or battle.clock - r.braced_at < float(cfg["braceSeconds"]) + float(cfg["digDelay"]):
		return
	var t: Variant = near
	if t == null:
		if list.size() >= int(cfg["maxTrenches"]):
			return
		t = _along_front(r, c, cfg)
		list.append(t)
		r.trench = t
	var foe := battle.nearest_foe(c, r.side, 260.0)
	t["progress"] = minf(1.0, t["progress"] + (0.4 if foe != null else 1.0) * _work(r) / float(cfg["digSeconds"]))
	t["dug_at"] = battle.clock
	t["side"] = r.side


## Long enough for every file and deep enough for every rank, with room to stand.
func _along_front(r: Regiment, c: Vector2, cfg: Dictionary) -> Dictionary:
	var forward := Vector2.from_angle(r.facing)
	var across := forward.orthogonal()
	var lo := INF
	var hi := -INF
	var back := INF
	var front := -INF
	for u in r.living():
		if u.type != "infantry":
			continue
		var p := (u.world - c).dot(across)
		var q := (u.world - c).dot(forward)
		lo = minf(lo, p)
		hi = maxf(hi, p)
		back = minf(back, q)
		front = maxf(front, q)
	if lo == INF:
		lo = 0.0
		hi = 0.0
		back = 0.0
		front = 0.0
	_next_id += 1
	return {"id": _next_id, "centre": c + across * (lo + hi) / 2.0 + forward * (back + front) / 2.0, "facing": r.facing,
		"length": maxf(60.0, hi - lo + 30.0), "width": maxf(float(cfg["trenchWidth"]), front - back + 26.0),
		"progress": 0.0, "level": 1, "upgrade_to": 0, "upgrade_progress": 0.0, "side": r.side, "dug_at": battle.clock}


## A battalion that has left its trench lets go of it; one that halts by an
## empty finished trench steps into it, front the way it faces.
func _man(r: Regiment, c: Vector2, cfg: Dictionary) -> void:
	var snap := float(cfg["trenchSnap"])
	if r.trench != null and c.distance_to(r.trench["centre"]) > snap:
		r.trench = null
	if r.trench != null or r.still_seconds < 2 or r.charging != null:
		return
	var t: Variant = _near(c, snap)
	if t == null or t["progress"] < 1.0 or _held_by_other(t, r):
		return
	r.trench = t
	t["side"] = r.side
	r.set_formation("line")
	r.order_move(t["centre"], t["facing"])


func _held_by_other(t: Dictionary, r: Regiment) -> bool:
	for other in battle.regiments:
		if other != r and is_same(other.trench, t) and not other.destroyed() and not other.routing:
			return true
	return false


## Revet (level 2) or fortify (level 3) the trench the battalion holds.
func upgrade(r: Regiment) -> bool:
	if r == null or r.trench == null:
		return false
	var t: Dictionary = r.trench
	var next := Rules.trench_level(int(t["level"]) + 1)
	if t["progress"] < 1.0 or t["upgrade_to"] != 0 or next.is_empty():
		return false
	if not battle.can_afford(r.side, next["cost"]):
		battle.say("Niet genoeg grondstoffen: %s nodig." % Rules.cost_text(next["cost"]), r.side)
		return false
	battle.pay(r.side, next["cost"])
	t["upgrade_to"] = int(t["level"]) + 1
	t["upgrade_progress"] = 0.0
	t["upgrader"] = r
	battle.say("Loopgraaf: %s (%d s)." % [String(next["label"]).to_lower(), next["seconds"]], r.side)
	return true


func _upgrade_work(t: Dictionary, delta: float) -> void:
	if t["upgrade_to"] == 0:
		return
	var r: Regiment = t["upgrader"]
	# The work goes on only while the battalion stands in it.
	if r == null or not is_same(r.trench, t) or r.destroyed() or r.moving():
		return
	var next := Rules.trench_level(t["upgrade_to"])
	t["upgrade_progress"] = minf(1.0, t["upgrade_progress"] + delta * _work(r) / float(next["seconds"]))
	t["dug_at"] = battle.clock
	if t["upgrade_progress"] >= 1.0:
		t["level"] = t["upgrade_to"]
		t["upgrade_to"] = 0
		battle.say("Loopgraaf %s." % String(next["label"]).to_lower(), r.side)
		battle.refresh_hud()


## Round shot or a shell lands: a crater, and the works it falls on knocked
## down (a trench loses a level; at the first its parapet is breached); a
## tower beside it is hit. Howitzer shells do more (`works`).
func shell(at: Vector2, way: Vector2, works: float) -> void:
	craters.append({"world": at, "way": way.normalized(), "at": battle.clock})
	if craters.size() > int(Battle.depth_rule_static("maxCraters", 80)):
		craters.pop_front()
	for t in list:
		if t["progress"] < 1.0:
			continue
		var d: Vector2 = at - t["centre"]
		var forward := Vector2.from_angle(t["facing"])
		var along := absf(d.dot(forward.orthogonal()))
		var across := d.dot(forward)
		if along > t["length"] / 2.0 + 8.0 or across < -t["width"] / 2.0 - 8.0 or across > t["width"] / 2.0 + 34.0:
			continue
		t["integrity"] = float(t.get("integrity", 100.0)) - Battle.depth_rule_static("shellDamage", 14) * works
		if t["integrity"] <= 0.0:
			if t["level"] > 1:
				t["level"] = int(t["level"]) - 1
				t["integrity"] = 100.0
			else:
				t["integrity"] = 0.0
				t["breached"] = true
	for b in battle.buildings:
		if b.type == "tower" and b.standing() and b.world.distance_to(at) <= Battle.depth_rule_static("towerSplash", 44):
			b.hit(Battle.depth_rule_static("towerShellDamage", 30) * works)
	queue_redraw()


## The men standing in a damaged trench (three at least) dig it back up.
func _repair(_cfg: Dictionary) -> void:
	for t in list:
		if t["progress"] < 1.0 or float(t.get("integrity", 100.0)) >= 100.0:
			continue
		var men := 0
		var sappers := 0
		for u in battle.units:
			if u.alive() and u.type == "infantry" and (u.regiment == null or not u.regiment.routing) and _inside(t, u.world, 0.0):
				men += 1
				if u.troop == "sapper":
					sappers += 1
		if men < 3:
			continue
		var work := 1.0 + float(Rules.troop("sapper").get("work", 0.0)) * sappers / men
		t["integrity"] = minf(100.0, float(t["integrity"]) + Battle.depth_rule_static("repairPerSecond", 2) * work)
		if t.get("breached", false) and t["integrity"] >= 50.0:
			t["breached"] = false


## A cut in the ground: the bank thrown up in front, darker as it deepens; a
## revetted trench shows its planks, a fortified one its gabions.
func _draw() -> void:
	for c in craters:
		# Torn earth, the spray thrown on the far side.
		var at := Iso.to_screen(c["world"])
		draw_set_transform(at, 0.0, Vector2(1.0, Iso.SQ))
		draw_circle(Vector2.ZERO, 7.0, Color(0.27, 0.21, 0.14, 0.75))
		draw_circle(Vector2(c["way"]) * 5.0, 4.5, Color(0.4, 0.32, 0.21, 0.5))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	for t in list:
		TrenchArt.draw_bed(self, t, battle.clock if battle != null else 0.0, _fascine, _props.get("fascine_wall", {}))


## The men in the trenches as the web iso view shows them: in a trench being
## dug the musketeers sink with it as they dig; in a finished one the front
## rank steps onto the fire-step and leans on the bank, the ranks behind stand
## on the bed; the near wall hides them below its lip.
func _dress_men() -> void:
	var front := {}
	var lips := {}
	for t in list:
		var f := TrenchArt.Frame.new(t)
		lips[TrenchArt.id_of(t)] = TrenchArt.lower_lip(TrenchArt.outline(f))
	for u in battle.units:
		if not u.alive() or u.regiment == null or u.type == "artillery":
			if u.leaning or u._cut != null:
				u.trench_look(Vector2.ZERO, INF, false)
			continue
		var t: Variant = _sunk_in(u.world)
		if t == null:
			if u.leaning or u._cut != null or u._sprite.position != Vector2.ZERO:
				u.trench_look(Vector2.ZERO, INF, false)
			continue
		var tid := TrenchArt.id_of(t)
		var out := Vector2.from_angle(t["facing"])
		var v: float = (u.world - Vector2(t["centre"])).dot(out)
		if not front.has(tid):
			var best := -INF
			for m in battle.units:
				if m.alive() and m.type == "infantry" and _inside(t, m.world, 0.0):
					best = maxf(best, (m.world - Vector2(t["centre"])).dot(out))
			front[tid] = best
		var p: float = minf(1.0, t["progress"])
		var digging := u.type == "infantry" and (p < 1.0 or int(t.get("upgrade_to", 0)) != 0) and battle.clock - float(t.get("dug_at", -99.0)) < 2.0
		var lean := not digging and p >= 1.0 and u.type == "infantry" and not u.regiment.routing \
			and u.world.distance_to(u.slot) < 6.0 and v > float(front[tid]) - 8.0
		var offset := Vector2.ZERO
		var sink := TrenchArt.SINK * p
		if lean:
			var to: float = t["width"] / 2.0 - TrenchArt.LEAN_GAP - v
			offset = Iso.to_screen(u.world + out * to) - Iso.to_screen(u.world)
			sink = (TrenchArt.FIRE_STEP_NEAR if sin(float(t["facing"])) > 0.3 else TrenchArt.FIRE_STEP) * p
		offset.y += sink * TrenchArt.PPM * TrenchArt.LIFT
		u.trench_look(offset, TrenchArt.lip_y(lips[tid], u.position.x + offset.x), lean)


## The trench (finished, or being dug or built up) a point lies in.
func _sunk_in(p: Vector2) -> Variant:
	for t in list:
		if _inside(t, p, 0.0) and (t["progress"] >= 1.0 or battle.clock - float(t.get("dug_at", -99.0)) < 2.0):
			return t
	return null


## The drummer and the officer go down into the trench too, the drummer at one
## end behind the ranks and the officer at the other.
func _staff(r: Regiment) -> void:
	var t: Dictionary = r.trench
	var w: float = t["width"] / 2.0
	var out := Vector2.from_angle(t["facing"])
	var along := out.rotated(PI / 2.0)
	for u in r.living():
		var end := -1.0 if u.type == "drummer" else (1.0 if u.type == "officer" else 0.0)
		if end == 0.0:
			continue
		var spot: Vector2 = Vector2(t["centre"]) + along * end * (t["length"] / 2.0 - w * 0.45) - out * w * 0.2
		if u.slot.distance_to(spot) > 3.0:
			u.slot = spot


## Sent into a trench with a click: the first battalion mans it (marching up
## in line, front the way it faces), the others form a second line behind.
## False if there is no trench of ours to be had there.
func order_into(battalions: Array[Regiment], at: Vector2) -> bool:
	var t: Variant = null
	for x in list:
		if x["progress"] >= 1.0 and _inside(x, at, 14.0):
			t = x
	if t == null or battalions.is_empty():
		return false
	for other in battle.regiments:
		if is_same(other.trench, t) and other.side != battalions[0].side and not other.destroyed():
			return false
	var out := Vector2.from_angle(t["facing"])
	var back: float = t["width"] + 30.0
	var held := _held_by_other(t, battalions[0]) and not is_same(battalions[0].trench, t)
	for i in battalions.size():
		var r := battalions[i]
		r.set_formation("line")
		var row := i + (1 if held else 0)
		if row == 0:
			r.trench = t
			t["side"] = r.side
			r.hold = true
		else:
			r.trench = null
		r.order_move(Vector2(t["centre"]) - out * back * row, t["facing"])
	return true