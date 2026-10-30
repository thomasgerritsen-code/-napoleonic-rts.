class_name Wildlife
extends RefCounted
## Red deer and rabbits as the web game's wildlife: small herds - a stag with
## his hinds - at the edges of the woods, rabbits in the meadows. They graze,
## wander about their home ground and bolt from men coming near and from
## gunfire, then settle further off. Scenery only: nobody shoots at them and
## they block nothing; they are seen only where France can see.

var battle: Battle
## {kind, sprite, world, home, herd, state, to, until, facing, scared_until}
var animals: Array[Dictionary] = []
var bolts := 0
var _look := 0.0
var _seed := 7919


func _rnd() -> float:
	_seed = (_seed * 16807) % 2147483647
	return float(_seed) / 2147483647.0


func _cfg(key: String, fallback: float) -> float:
	var w: Variant = Rules.start().get("wildlife")
	return float(w.get(key, fallback)) if w is Dictionary else fallback


static func _deer(a: Dictionary) -> bool:
	return a["kind"] != "rabbit"


func _free(p: Vector2) -> bool:
	if p.x < 30.0 or p.y < 30.0 or p.x > Iso.WORLD.x - 30.0 or p.y > Iso.WORLD.y - 30.0 or Nav.in_water(p):
		return false
	for b in battle.buildings:
		if b.standing() and absf(b.world.x - p.x) < b.size.x / 2.0 + 20.0 and absf(b.world.y - p.y) < b.size.y / 2.0 + 20.0:
			return false
	return true


## Dry land all the way: they do not swim the river.
func _clear(from: Vector2, to: Vector2) -> bool:
	var n := ceili(from.distance_to(to) / 30.0)
	for i in range(1, n + 1):
		if not _free(from.lerp(to, float(i) / n)):
			return false
	return true


func _spot(centre: Vector2, reach: float, tries := 24) -> Variant:
	for i in tries:
		var p := centre + Vector2.from_angle(_rnd() * TAU) * sqrt(_rnd()) * reach
		if _free(p):
			return p
	return null


func populate(woods: Array, layer: Node2D) -> void:
	for h in int(_cfg("herds", 6)):
		if woods.is_empty():
			break
		var w: Dictionary = woods[h % woods.size()]
		var size := Vector2(float(w["w"]), float(w["h"]))
		var centre := Vector2(float(w["x"]), float(w["y"])) + size / 2.0
		var home: Variant = _spot(centre + Vector2.from_angle(_rnd() * TAU) * size * 0.55, 120.0)
		if home == null:
			continue
		var count := int(_cfg("herdMin", 3)) + int(_rnd() * (_cfg("herdMax", 6) - _cfg("herdMin", 3) + 1))
		for i in count:
			var p: Variant = _spot(home, 50.0)
			_add("stag" if i == 0 or _rnd() < _cfg("stagShare", 0.25) * 0.3 else "hind", p if p != null else home, home, h, layer)
	for i in int(_cfg("rabbits", 22)):
		var p: Variant = _spot(Iso.WORLD / 2.0, minf(Iso.WORLD.x, Iso.WORLD.y) * 0.7)
		if p != null:
			_add("rabbit", p, p, -1, layer)


func _add(kind: String, at: Vector2, home: Vector2, herd: int, layer: Node2D) -> void:
	var look := AtlasLibrary.get_set([{"stag": "wds_iso_stag", "hind": "wdh_iso_hind", "rabbit": "wrb_iso_rabbit"}[kind]])
	var sprite := AnimatedSprite2D.new()
	sprite.centered = false
	sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE
	sprite.sprite_frames = look["frames"]
	sprite.offset = -Vector2(look["pivot"])
	layer.add_child(sprite)
	animals.append({"kind": kind, "sprite": sprite, "world": at, "home": home, "herd": herd, "state": "graze",
		"to": at, "until": battle.clock + _rnd() * 6.0, "facing": _rnd() * TAU})


## Shots and bursts frighten them from far off.
func alarm(at: Vector2) -> void:
	var reach := _cfg("gunfireShy", 320)
	for a in animals:
		if a["state"] != "run" and at.distance_to(a["world"]) < reach:
			_bolt(a, at)


func update(delta: float) -> void:
	var look := battle.clock >= _look
	if look:
		_look = battle.clock + 0.25
	for a in animals:
		if look and a["state"] != "run":
			var shy := _cfg("deerShy", 170) if _deer(a) else _cfg("rabbitShy", 80)
			var near: Variant = _man_near(a["world"], shy)
			if near != null:
				_bolt(a, near)
		if a["state"] == "walk" or a["state"] == "run":
			_step(a, delta)
		elif battle.clock >= a["until"]:
			_wander(a)
		_show(a)


func _man_near(at: Vector2, reach: float) -> Variant:
	for u in battle.units:
		if u.alive() and absf(u.world.x - at.x) < reach and u.world.distance_to(at) < reach:
			return u.world
	return null


## Away from the danger, a little to the side; a herd flees together.
func _bolt(a: Dictionary, from: Vector2) -> void:
	var mates: Array[Dictionary] = []
	if a["herd"] >= 0:
		for b in animals:
			if b["herd"] == a["herd"]:
				mates.append(b)
	else:
		mates.append(a)
	var dist := 260.0 + _rnd() * 160.0 if _deer(a) else 90.0 + _rnd() * 70.0
	for m in mates:
		var here: Vector2 = m["world"]
		var away := (here - from).angle() + (_rnd() - 0.5) * 0.7
		var to := here
		for turn: float in [0.0, 0.5, -0.5, 1.0, -1.0, 1.4, -1.4]:
			var p := here + Vector2.from_angle(away + turn) * dist
			if _clear(here, p):
				to = p
				break
		m["state"] = "run"
		m["to"] = to
		m["home"] = to
	bolts += 1


func _wander(a: Dictionary) -> void:
	var r := _rnd()
	if r < 0.45:
		a["state"] = "graze"
		a["until"] = battle.clock + 4.0 + _rnd() * 8.0
		return
	if r < 0.65:
		a["state"] = "idle"
		a["until"] = battle.clock + 2.0 + _rnd() * 4.0
		return
	var p: Variant = _spot(a["home"], _cfg("homeRange", 260) if _deer(a) else _cfg("rabbitRange", 120), 6)
	if p == null or not _clear(a["world"], p):
		a["state"] = "graze"
		a["until"] = battle.clock + 3.0
		return
	a["state"] = "walk"
	a["to"] = p


func _step(a: Dictionary, delta: float) -> void:
	var running: bool = a["state"] == "run"
	var speed := (_cfg("deerRun", 95) if running else _cfg("deerWalk", 16)) if _deer(a) else (_cfg("rabbitRun", 80) if running else _cfg("rabbitHop", 34))
	var here: Vector2 = a["world"]
	var to: Vector2 = a["to"]
	if here.distance_to(to) > 0.5:
		a["facing"] = (to - here).angle()
	var next := here.move_toward(to, speed * delta)
	if Nav.in_water(next):
		a["state"] = "idle"
		a["until"] = battle.clock + 1.0
		a["to"] = here
		return
	a["world"] = next
	if next.distance_to(to) < 0.5:
		a["state"] = "graze"
		a["until"] = battle.clock + 3.0 + _rnd() * 6.0


func _show(a: Dictionary) -> void:
	var sprite: AnimatedSprite2D = a["sprite"]
	sprite.position = Iso.to_screen(a["world"])
	sprite.visible = battle.fog == null or battle.fog.sees(a["world"])
	var state: String = a["state"]
	if not _deer(a) and (state == "walk" or state == "run"):
		state = "hop"
	elif state == "walk" and not sprite.sprite_frames.has_animation("walk_e"):
		state = "idle"
	var anim := "%s_%s" % [state, Iso.direction(a["facing"])]
	if sprite.sprite_frames.has_animation(anim) and sprite.animation != anim:
		sprite.play(anim)
