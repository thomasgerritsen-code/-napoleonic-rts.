class_name Rules
extends RefCounted
## The web game's rules and opening, exported by scripts/export-godot-scenario.js
## into assets/map/start.json: unit and building types, training, costs and
## the start of a singleplayer battle.

const GATHER_EVERY := 0.45   # seconds between strokes
const GATHER_TAKE := 5.0     # taken a stroke
const CARRY := 25.0          # a peasant carries this much
const BUILD_RATE := 0.20     # share of a building a peasant raises a second
const FARM_CAPACITY := 240.0
const FARM_REGROW := 3.5     # food a second on a staffed field
const ARTILLERY_AFTER := 120.0
## Which building trains which unit.
const TRAINED_AT := {"worker": "towncenter", "infantry": "barracks", "officer": "barracks",
	"drummer": "barracks", "cavalry": "stable", "artillery": "foundry"}
## What peasants may build, in menu order.
const BUILDABLE := ["house", "farm", "lumbercamp", "mine", "barracks", "stable", "foundry", "tower", "hospital"]
const LABELS := {"worker": "Boer", "infantry": "Musketier", "officer": "Officier", "drummer": "Tamboer",
	"cavalry": "Cavalerie", "artillery": "Kanon", "towncenter": "Stadhuis", "barracks": "Kazerne",
	"house": "Huis", "farm": "Graanakker", "stable": "Stal", "foundry": "Gieterij", "tower": "Schiettoren",
	"mine": "IJzermijn", "lumbercamp": "Houthakkerskamp", "hospital": "Veldhospitaal",
	"food": "voedsel", "wood": "hout", "iron": "ijzer"}

static var _start := {}


static func start() -> Dictionary:
	if _start.is_empty():
		_start = Iso.read_json("res://assets/map/start.json")
	return _start


static func unit_type(type: String) -> Dictionary:
	return start()["types"].get(type, {})


static func building_type(type: String) -> Dictionary:
	return start()["buildingTypes"].get(type, {})


static func training(type: String) -> Dictionary:
	return start()["training"].get(type, {})


static func cost_of(kind: String) -> Dictionary:
	if training(kind).has("cost"):
		return training(kind)["cost"]
	return building_type(kind).get("cost", {})


static func label(kind: String) -> String:
	if kind.contains(":"):
		return troop_label(kind.get_slice(":", 1), "france")
	return LABELS.get(kind, kind)


## The web game's troop kinds (grenadier, voltigeur, guard, sapper, rifle,
## cuirassier, lancer, hussar, greys, heavy12, howitzer, horseart, mounted).
static func troops() -> Dictionary:
	var t: Variant = start().get("troops")
	return t["kinds"] if t is Dictionary else {}


static func troop(kind: String) -> Dictionary:
	return troops().get(kind, {})


static func troop_label(kind: String, side: String) -> String:
	var t := troop(kind)
	var names: Variant = t.get("names", {}).get(side) if t.get("names") is Dictionary else null
	if names is Array:
		return names[0]
	return t.get("label", kind)


## A training item is "type" or "type:troop"; its building, cost and time.
static func item_type(item: String) -> String:
	return item.get_slice(":", 0)


static func item_troop(item: String) -> String:
	return item.get_slice(":", 1) if item.contains(":") else ""


static func item_building(item: String) -> String:
	var t := troop(item_troop(item))
	if t.has("building"):
		return t["building"]
	return TRAINED_AT.get(item_type(item), "")


static func item_cost(item: String) -> Dictionary:
	var cost: Dictionary = cost_of(item_type(item)).duplicate()
	var extra: Dictionary = troop(item_troop(item)).get("extra", {})
	for key in extra:
		cost[key] = float(cost.get(key, 0.0)) + float(extra[key])
	return cost


static func item_time(item: String) -> float:
	return float(training(item_type(item)).get("time", 6.0)) * float(troop(item_troop(item)).get("time", 1.0))


## Everything trained at a building of this type, for this side.
static func trained_at(building: String, side: String) -> Array[String]:
	var list: Array[String] = []
	for type: String in TRAINED_AT:
		if TRAINED_AT[type] == building:
			list.append(type)
	for kind: String in troops():
		var t: Dictionary = troops()[kind]
		if side in t.get("sides", []) and item_building("%s:%s" % [t["base"], kind]) == building:
			list.append("%s:%s" % [t["base"], kind])
	return list


static func experience_ranks() -> Array:
	var e: Variant = start().get("experience")
	return e["ranks"] if e is Dictionary else [{"label": "Recruut", "victories": 0, "damage": 1.0}]


static func cost_text(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for key in ["food", "wood", "iron"]:
		if cost.has(key):
			parts.append("%d %s" % [int(cost[key]), label(key)])
	return ", ".join(parts)


static func logging_radius() -> float:
	var logging: Variant = start().get("logging")
	return float(logging["radius"]) if logging is Dictionary else 420.0


## A tower's level (1 to 3) as the web game's towers config has it: health,
## reach, reload, shots, damage, sight and, from level 2, cost and time.
static func tower_level(level: int) -> Dictionary:
	var t: Variant = start().get("towers")
	if t is Dictionary and t["levels"] is Array and level >= 1 and level < t["levels"].size():
		return t["levels"][level]
	return {} if level != 1 else {"label": "Basistoren", "hp": 1100, "range": 240, "reload": 2.6, "shots": 2, "damage": 18, "vision": 420}


static func tower_ai() -> Dictionary:
	var t: Variant = start().get("towers")
	return {"after": float(t.get("aiAfter", 300)), "max": int(t.get("aiMax", 2))} if t is Dictionary else {"after": 300.0, "max": 2}
