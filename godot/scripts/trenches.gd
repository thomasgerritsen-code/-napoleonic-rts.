class_name Trenches
extends Node2D
## Standing firm and digging in, as the web game's regiment orders: a battalion
## told to hold (G) braces once it has stood four seconds in line or square,
## taking 70% of the losses and reloading quicker. A braced line goes on to
## dig a trench along its front (25 s, slower under fire, three times as quick
## with sappers). Men in a finished trench, of either side, take half the
## losses from fire in front of them (not from shells and grenades lobbed in,
## nor from the flank); a trench can be revetted and fortified for wood and
## iron. Any battalion that halts by an empty trench steps into it. Horses at
## the cut and its ditch go slowly and are easy targets.

var battle: Battle
## {centre, facing, length, width, progress, level, upgrade_to, upgrade_progress, holder, dug_at}
var list: Array[Dictionary] = []
## Where round shot and shells struck: {world, way, at}.
var craters: Array[Dictionary] = []
var _clock := 0.0


func _ready() -> void:
	z_index = -5


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
	return {"centre": c + across * (lo + hi) / 2.0 + forward * (back + front) / 2.0, "facing": r.facing,
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
		var forward := Vector2.from_angle(t["facing"])
		var across := forward.orthogonal()
		var half_l: float = t["length"] / 2.0
		var half_w: float = t["width"] / 2.0
		var c: Vector2 = t["centre"]
		var p: float = t["progress"]
		var outer := _quad(c, forward, across, half_l + 6.0, half_w + 5.0)
		draw_colored_polygon(outer, Color(0.42, 0.34, 0.23, 0.5 * p + 0.15))
		var inner := _quad(c, forward, across, half_l, half_w * maxf(0.3, p))
		draw_colored_polygon(inner, Color(0.36, 0.28, 0.18).lerp(Color(0.2, 0.15, 0.1), p))
		if p < 1.0:
			continue
		# The parapet: earth heaped along the front.
		var bank := PackedVector2Array()
		for k in 9:
			var s := -half_l + 2.0 * half_l * k / 8.0
			bank.append(Iso.to_screen(c + forward * (half_w + 6.0) + across * s) + Vector2(0, -3.0 - int(t["level"])))
		draw_polyline(bank, Color(0.5, 0.41, 0.27), 5.0 + t["level"])
		if t["level"] >= 2:
			for k in 2:
				var side_at := c + forward * (half_w - 2.0) * (1 - 2 * k)
				draw_line(Iso.to_screen(side_at - across * half_l), Iso.to_screen(side_at + across * half_l), Color(0.45, 0.31, 0.17), 2.0)
		if t["level"] >= 3:
			var gabions := int(t["length"] / 16.0)
			for k in gabions:
				var s := -half_l + 8.0 + (2.0 * half_l - 16.0) * k / maxf(1.0, gabions - 1)
				draw_circle(Iso.to_screen(c + forward * (half_w + 6.0) + across * s) + Vector2(0, -8), 4.0, Color(0.55, 0.47, 0.32))


func _quad(c: Vector2, forward: Vector2, across: Vector2, half_l: float, half_w: float) -> PackedVector2Array:
	var points := PackedVector2Array()
	for corner: Vector2 in [Vector2(-1, -1), Vector2(1, -1), Vector2(1, 1), Vector2(-1, 1)]:
		points.append(Iso.to_screen(c + across * half_l * corner.x + forward * half_w * corner.y))
	return points
