class_name NetSync
extends RefCounted
## Online play over a NetLink. The host runs the battle: every tenth of a
## second it sends a snapshot (men, buildings, battalions, stocks, resources,
## territories, trenches, the weather, the outcome, and the shots and smoke
## since the last one). The client runs nothing itself: it shows the latest
## snapshot, gliding the men between them, and sends its player's orders as
## commands, which the host carries out with the client's selection and side
## as if they had been given there.

## The orders a client may give (Battle's own functions).
const COMMANDS := ["order", "set_formation", "charge", "hold", "skirmish", "halt", "form_regiment", "reinforce",
	"train", "build_at", "upgrade_tower", "quick_regiment", "train_missing", "toggle_auto_regiment", "toggle_shot",
	"assign_workers", "upgrade_trench"]

var battle: Battle
var link: NetLink
var _clock := 0.0
var _fx: Array = []              # host: effects since the last snapshot
var snapshots := 0               # client: snapshots shown
var commands := 0                # host: commands carried out
## Another battle: whether we and the other player have asked for one.
var we_want_more := false
var they_want_more := false


func _init(battle_: Battle, link_: NetLink) -> void:
	battle = battle_
	link = link_
	if link.role == "host":
		link.command_received.connect(run_command)
		link.joined.connect(_on_back)
	else:
		link.snapshot_received.connect(apply)
		link.told.connect(_on_told)
	link.left.connect(_on_left)
	link.started.connect(_on_started)
	link.rematch_asked.connect(_on_rematch_asked)


## The battle is closing: it hears the line no more.
func detach() -> void:
	for sig in link.get_signal_list():
		for c: Dictionary in link.get_signal_connection_list(sig["name"]):
			var callable: Callable = c["callable"]
			if callable.get_object() == self:
				link.disconnect(sig["name"], callable)


func _on_told(text: String) -> void:
	battle.status = text


func _on_left() -> void:
	battle.status = ("De andere speler is weg: de slag staat stil tot hij terug is." if link.role == "host"
		else "De verbinding met de host is verbroken: opnieuw verbinden…")


## Host: the other player is back (or started the game anew): the battle
## goes on, and a player in the menu is let in again.
func _on_back() -> void:
	battle.status = "De andere speler is weer verbonden."
	link.resume()


## A new battle (both asked for one): this one makes way for it.
func _on_started(side: String) -> void:
	Battle.online_role = battle.net_role
	Battle.online_side = side
	detach()
	battle.restart()


func ask_rematch() -> void:
	we_want_more = true
	link.ask_rematch()
	battle.status = "Opnieuw spelen gevraagd: wachten op de andere speler…" if not they_want_more else battle.status
	_maybe_restart()


func _on_rematch_asked() -> void:
	they_want_more = true
	battle.status = "De andere speler wil opnieuw spelen."
	battle.refresh_hud()
	_maybe_restart()


func _maybe_restart() -> void:
	if link.role == "host" and we_want_more and they_want_more:
		link.start(battle.local_side)


# ---- host ----

## Host: send a snapshot every tenth of a second.
func host_step(delta: float) -> void:
	_clock -= delta
	if _clock > 0.0:
		return
	_clock = NetLink.SNAPSHOT_EVERY
	link.send_snapshot(snapshot())


## Host: an effect the client should see and hear too.
func fx(kind: String, at: Vector2, a := 0.0, b := 0.0) -> void:
	_fx.append([kind, roundi(at.x), roundi(at.y), a, b])


func snapshot() -> Dictionary:
	var men: Array = []
	for u in battle.units:
		men.append(u.net_state())
	var built: Array = []
	for b in battle.buildings:
		built.append(b.net_state())
	var battalions: Array = []
	for r in battle.regiments:
		var ids: Array[int] = []
		for u in r.men:
			ids.append(u.id)
		battalions.append([r.id, r.name, r.side, r.kind, r.formation, r.routing, r.hold, r.skirmish, ids, r.victories,
			r.enemy.id if r.enemy != null else 0, r.charging.id if r.charging != null else 0, r.facing,
			battle.trenches.list.find(r.trench) if r.trench != null else -1, r.braced_at, r.full_strength()])
	var stock := PackedFloat32Array()
	for s in battle.supplies:
		stock.append(s.amount)
	var posts: Array = []
	for p in battle.territories:
		posts.append([p["owner"], p["claim"], p["progress"], p["contested"]])
	var works: Array = []
	for t in battle.trenches.list:
		var copy: Dictionary = t.duplicate()
		copy.erase("upgrader")
		works.append(copy)
	var fx_now := _fx
	_fx = []
	return {"clock": battle.clock, "units": men, "buildings": built, "regiments": battalions, "economy": battle.economy,
		"supplies": stock, "territories": posts, "trenches": works, "craters": battle.trenches.craters,
		"raining": battle.weather.raining if battle.weather != null else false,
		"wetness": battle.weather.wetness if battle.weather != null else 0.0,
		"result": battle.result, "winner": battle.winner, "end_reason": battle.end_reason, "ended_at": battle.ended_at,
		"stats": battle.stats, "hold_side": battle.hold_side, "held_seconds": battle.held_seconds,
		"teams": battle.medics.net_teams(), "fx": fx_now}


## Host: carry out a client's order with its own selection and side.
func run_command(data: Dictionary) -> void:
	var name: String = String(data.get("name", ""))
	if not (name in COMMANDS):
		return
	var them := "britain" if battle.local_side == "france" else "france"
	var picked: Array[Unit] = []
	for id: Variant in data.get("units", []):
		var u := battle.unit_by_id(int(id))
		if u != null and u.side == them and u.alive():
			picked.append(u)
	var b := battle.building_by_id(int(data.get("building", 0)))
	if b != null and b.side != them:
		b = null
	var args: Array = data.get("args", [])
	if name == "upgrade_tower":
		args = [b]
	commands += 1
	battle.acting_for(them, picked, b, func() -> void: battle.callv(name, args))


# ---- client ----

## Client: show the host's battle.
func apply(data: Dictionary) -> void:
	snapshots += 1
	battle.clock = float(data["clock"])
	battle.economy = data["economy"]
	for a: Array in data["units"]:
		var u := battle.unit_by_id(int(a[0]))
		if u == null:
			u = battle.add_unit(a[1], a[2], Vector2(a[4], a[5]), a[3], int(a[0]))
		u.net_apply(a)
	for a: Array in data["buildings"]:
		var b := battle.building_by_id(int(a[0]))
		if b == null:
			b = battle.add_building(a[1], a[2], Vector2(a[3], a[4]), bool(a[7]), int(a[0]))
		b.net_apply(a)
	_apply_regiments(data["regiments"], data["trenches"])
	var stock: PackedFloat32Array = data["supplies"]
	for i in mini(stock.size(), battle.supplies.size()):
		var s := battle.supplies[i]
		var was_there := not s.gone()
		s.amount = stock[i]
		if was_there and s.gone():
			s.take(0.0)
	for i in mini(data["territories"].size(), battle.territories.size()):
		var p: Array = data["territories"][i]
		var t: Dictionary = battle.territories[i]
		t["owner"] = p[0]
		t["claim"] = p[1]
		t["progress"] = p[2]
		t["contested"] = p[3]
	battle.trenches.craters.assign(data["craters"])
	battle.trenches.queue_redraw()
	if battle.weather != null:
		battle.weather.raining = data["raining"]
		battle.weather.wetness = data["wetness"]
	battle.medics.apply_net_teams(data.get("teams", []))
	for e: Array in data["fx"]:
		battle.replay_fx(e)
	battle.stats = data["stats"]
	battle.hold_side = data["hold_side"]
	battle.held_seconds = data["held_seconds"]
	if data["result"] != "" and battle.result == "":
		battle.winner = data["winner"]
		battle.end_reason = data["end_reason"]
		battle.ended_at = data["ended_at"]
		battle.end_for_client()


func _apply_regiments(list: Array, works: Array) -> void:
	battle.trenches.list.assign(works)
	var by_id := {}
	for r in battle.regiments:
		by_id[r.id] = r
	for a: Array in list:
		var r: Regiment = by_id.get(int(a[0]))
		if r == null:
			r = Regiment.new(a[1], a[2])
			r.id = int(a[0])
			battle.regiments.append(r)
			by_id[r.id] = r
		r.kind = a[3]
		r.formation = a[4]
		r.routing = a[5]
		r.hold = a[6]
		r.skirmish = a[7]
		r.men.clear()
		for id: Variant in a[8]:
			var u := battle.unit_by_id(int(id))
			if u != null:
				r.men.append(u)
				u.regiment = r
		r.victories = a[9]
		r.facing = a[12]
		r.trench = battle.trenches.list[a[13]] if a[13] >= 0 and a[13] < battle.trenches.list.size() else null
		r.braced_at = a[14]
		r.set_full_strength(a[15])
	for a: Array in list:
		var r: Regiment = by_id[int(a[0])]
		r.enemy = by_id.get(int(a[10]))
		r.charging = by_id.get(int(a[11]))
