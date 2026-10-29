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
	return LABELS.get(kind, kind)


static func cost_text(cost: Dictionary) -> String:
	var parts: Array[String] = []
	for key in ["food", "wood", "iron"]:
		if cost.has(key):
			parts.append("%d %s" % [int(cost[key]), label(key)])
	return ", ".join(parts)


static func logging_radius() -> float:
	var logging: Variant = start().get("logging")
	return float(logging["radius"]) if logging is Dictionary else 420.0
