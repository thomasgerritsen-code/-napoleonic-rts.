class_name SaveGame
extends RefCounted
## A battle against the computer saved to disk and taken up again later: the
## battle as an online snapshot holds it (men, buildings, battalions,
## supplies, posts, trenches, weather, the books), and besides what only the
## side that runs the battle knows: where each man is bound and at what work,
## each battalion's destination, the British commander's plans, the map as
## far as it has been seen, when it rains next. Kept in the player's own
## folder (user://), one battle at a time; saving again overwrites it.
##
## Loading starts the battle afresh and then lays the saved one over it:
## whatever the opening had that the save has not (men fallen and gone,
## buildings destroyed) is taken away.

const PATH := "user://saves/battle.save"
const VERSION := 1
## The British commander's own state that a save keeps.
const AI_VARS := ["plan", "army_only", "_clock", "_home", "stance", "waves", "_next_wave", "_stance_since", "_losing_since"]
const WEATHER_VARS := ["raining", "wetness", "_next", "_season"]
const REGIMENT_VARS := ["destination", "hold", "still_seconds", "last_centre", "_start", "_break_base", "_lost_officer",
	"_lost_drummer", "_safe_for", "_line_after"]

## When Battle starts, the save to lay over the new battle (set by the menu).
static var pending: Dictionary = {}


static func exists() -> bool:
	return FileAccess.file_exists(PATH)


## "30-10 21:14 · Dag 13:45" for the menu: when it was saved, and the hour
## in the battle.
static func describe() -> String:
	var data := read()
	if data.is_empty():
		return ""
	return "%s · %s" % [data.get("saved_at", ""), DayNight.clock_text(float(data["state"]["clock"]))]


static func read() -> Dictionary:
	if not exists():
		return {}
	var file := FileAccess.open(PATH, FileAccess.READ)
	if file == null:
		return {}
	var data: Variant = file.get_var()
	file.close()
	if not (data is Dictionary) or int(data.get("version", 0)) != VERSION:
		return {}
	return data


## Can this battle be saved now? Not online, not once it is over.
static func can_save(battle: Battle) -> bool:
	return battle.net_role == "" and battle.result == ""


static func save(battle: Battle) -> Error:
	if not can_save(battle):
		return ERR_UNAVAILABLE
	DirAccess.make_dir_recursive_absolute(PATH.get_base_dir())
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file == null:
		return FileAccess.get_open_error()
	file.store_var(_plain(capture(battle)))
	file.close()
	return OK


## Everything the save holds, as plain values.
static func capture(battle: Battle) -> Dictionary:
	var men := {}
	for u in battle.units:
		var aim: Array = []
		if u.task_target is Building:
			aim = ["b", (u.task_target as Building).id]
		elif u.task_target is Supply:
			aim = ["s", battle.supplies.find(u.task_target)]
		men[u.id] = {"slot": u.slot, "ordered": u.ordered, "task": u.task, "aim": aim, "carry": u.carry,
			"carry_type": u.carry_type, "last_supply": battle.supplies.find(u.last_supply) if u.last_supply != null else -1,
			"wounded_at": u.wounded_at, "heal_until": u.heal_until,
			"hospital": u.hospital.id if u.hospital != null and is_instance_valid(u.hospital) else 0,
			"grenade_clock": u.grenade_clock}
	var battalions := {}
	for r in battle.regiments:
		battalions[r.id] = _vars(r, REGIMENT_VARS)
	return {"version": VERSION, "saved_at": Time.get_datetime_string_from_system().replace("T", " ").substr(5, 11),
		"mode": Battle.mode, "me": battle.me, "state": NetSync.capture(battle), "men": men, "battalions": battalions,
		"ai": _vars(battle.ai, AI_VARS), "weather": _vars(battle.weather, WEATHER_VARS) if battle.weather != null else {},
		"explored": battle.fog.get("_explored") if battle.fog != null else PackedByteArray(),
		"next_id": battle.get("_next_id"), "flank_hits": battle.flank_hits, "medics": battle.medics.stats}


## Lay a saved battle over a battle just begun.
static func restore(battle: Battle, data: Dictionary) -> void:
	var state: Dictionary = data["state"]
	# What the opening has that the save has not goes.
	var kept_men := {}
	for a: Array in state["units"]:
		kept_men[int(a[0])] = true
	for u in battle.units.duplicate():
		if not kept_men.has(u.id):
			battle.units.erase(u)
			battle.get("_unit_index").erase(u.id)
			u.queue_free()
	var kept_buildings := {}
	for a: Array in state["buildings"]:
		kept_buildings[int(a[0])] = true
	for b in battle.buildings.duplicate():
		if not kept_buildings.has(b.id):
			battle.buildings.erase(b)
			battle.get("_building_index").erase(b.id)
			b.queue_free()
	battle.set("_next_id", maxi(int(battle.get("_next_id")), int(data.get("next_id", 0))))
	NetSync.restore(battle, state)
	# The men take up their work and places again.
	for u in battle.units:
		u.net_target = Vector2.INF
		var m: Dictionary = data["men"].get(u.id, {})
		if m.is_empty():
			continue
		u.slot = m["slot"]
		u.carry = m["carry"]
		u.carry_type = m["carry_type"]
		u.wounded_at = m["wounded_at"]
		u.heal_until = m["heal_until"]
		u.grenade_clock = m["grenade_clock"]
		u.hospital = battle.building_by_id(int(m["hospital"])) if int(m["hospital"]) > 0 else null
		var supply_at: int = m["last_supply"]
		u.last_supply = battle.supplies[supply_at] if supply_at >= 0 and supply_at < battle.supplies.size() else null
		var aim: Array = m["aim"]
		var on: Node2D = null
		if aim.size() == 2 and aim[0] == "b":
			on = battle.building_by_id(int(aim[1]))
		elif aim.size() == 2 and aim[0] == "s" and int(aim[1]) >= 0 and int(aim[1]) < battle.supplies.size():
			on = battle.supplies[int(aim[1])]
		if on != null:
			u.set_task(m["task"], on)
		else:
			u.task = m["task"]
		u.ordered = m["ordered"]
	for u in battle.units:
		if u.wound == "lying" and not battle.medics.wounded.has(u):
			battle.medics.wounded.append(u)
	# The battalions go on where they were bound.
	for r in battle.regiments:
		var v: Dictionary = data["battalions"].get(r.id, {})
		_set_vars(r, v)
		if not r.routing and not r.destroyed() and r.centroid().distance_to(r.destination) > Regiment.MARCH_MIN:
			r.order_move(r.destination, r.facing)
	_set_vars(battle.ai, data["ai"])
	if battle.weather != null:
		_set_vars(battle.weather, data["weather"])
	if battle.fog != null and data["explored"] is PackedByteArray and (data["explored"] as PackedByteArray).size() == (battle.fog.get("_explored") as PackedByteArray).size():
		battle.fog.set("_explored", data["explored"])
		battle.fog.refresh()
	battle.flank_hits = data["flank_hits"]
	battle.medics.stats = data["medics"]
	battle.refresh_hud()


static func _vars(obj: Object, names: Array) -> Dictionary:
	var out := {}
	for n: String in names:
		out[n] = obj.get(n)
	return out


static func _set_vars(obj: Object, values: Dictionary) -> void:
	for n: String in values:
		obj.set(n, values[n])


## Plain values only (objects become null): what a file can hold.
static func _plain(v: Variant) -> Variant:
	if v is Object:
		return null
	if v is Dictionary:
		var out := {}
		for k: Variant in v:
			out[k] = _plain(v[k])
		return out
	if v is Array:
		var list: Array = []
		for x: Variant in v:
			list.append(_plain(x))
		return list
	return v
