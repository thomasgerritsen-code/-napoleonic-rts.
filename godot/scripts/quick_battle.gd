class_name QuickBattle
extends Node
## Quick battles (menu: Snelle slagen): short fights with one goal, made for
## a few minutes on a phone. No economy: two small armies on the campaign's
## field, the British commander idle and the British battalions led from
## here, a card at the top with the goal and the time left.
##
## - brug: hold the bridge west of the Grands Bois against three waves;
## - dorp: take the hamlet on the hill (Relais de la Colline) from its
##   garrison before the time is up;
## - veld: an open-field battle, every British battalion to be beaten.

const LIST := [
	{"id": "brug", "title": "Houd de brug", "note": "Drie Britse golven rukken op naar de brug. Houd ze 6 minuten tegen."},
	{"id": "dorp", "title": "Verover het dorp", "note": "Een Brits garnizoen houdt het gehucht op de heuvel. Neem het binnen 10 minuten."},
	{"id": "veld", "title": "Open veld", "note": "Twee legers op open veld, met ruiterij en kanonnen. Verdrijf alle Britten."},
]
## How long the British may hold the bridge's end before it is lost, and
## the hamlet must be ours with nobody of theirs in it.
const HOLD_SECONDS := 20.0
const POINT_RADIUS := 220.0

var battle: Battle
var id := "brug"
var limit := 360.0
var point := Vector2.ZERO
var _card: Control
var _heading: Label
var _text: Label
var _elapsed := 0.0
var _held := 0.0
var _waves: Array[Dictionary] = []
var _theirs: Array[Regiment] = []
var _push_clock := 0.0


static func info(which: String) -> Dictionary:
	for q: Dictionary in LIST:
		if q["id"] == which:
			return q
	return LIST[0]


func _ready() -> void:
	battle.fog.enabled = false
	battle.fog.refresh()
	match id:
		"brug":
			_set_up_bridge()
		"dorp":
			_set_up_village()
		_:
			_set_up_field()
	var parts := Tutorial.make_card(battle.get("_hud") if battle.get("_hud") != null else self)
	_card = parts[0]
	_heading = parts[1]
	_text = parts[2]
	_show()
	battle.say("%s: %s" % [info(id)["title"], info(id)["note"]])


func _foe() -> String:
	return "britain" if battle.me == "france" else "france"


## A battalion of `men` muskets with its officer and drummer, facing `face`.
func _battalion(side: String, at: Vector2, face: float, men := 24) -> Regiment:
	var list: Array[Unit] = []
	var across := Vector2.from_angle(face + PI / 2.0)
	var back := Vector2.from_angle(face + PI)
	for i in men:
		list.append(battle.add_unit(side, "infantry", at + across * ((i % 12) - 5.5) * 15.0 + back * (i / 12) * 19.0))
	list.append(battle.add_unit(side, "officer", at + back * 45.0))
	list.append(battle.add_unit(side, "drummer", at + back * 45.0 + across * 20.0))
	var r := battle.form_regiment(list)
	if r != null:
		r.order_move(at, face)
	return r


func _guns(side: String, at: Vector2, count: int) -> void:
	for i in count:
		battle.add_unit(side, "artillery", at + Vector2(0, i * 70.0))


func _look_at(world: Vector2) -> void:
	if battle.camera != null:
		battle.camera.focus(Iso.to_screen(world))


## The bridge west of the Grands Bois: ours on the west bank, three British
## waves from the east, each on the bridge's west end.
func _set_up_bridge() -> void:
	limit = 360.0
	point = Vector2(1520, 2540)
	var east := 0.0
	_battalion(battle.me, Vector2(1380, 2450), east)
	_battalion(battle.me, Vector2(1380, 2650), east)
	_guns(battle.me, Vector2(1250, 2480), 2)
	for t: float in [5.0, 120.0, 230.0]:
		_waves.append({"at": t, "count": 2})
	_look_at(point + Vector2(150, 0))


## The hamlet on the hill: a British garrison holds it; ours come from the
## east.
func _set_up_village() -> void:
	limit = 600.0
	point = Vector2(2150, 1920)
	var west := PI
	_battalion(battle.me, Vector2(2950, 1820), west)
	_battalion(battle.me, Vector2(2950, 2040), west)
	_battalion(battle.me, Vector2(3080, 1930), west)
	_guns(battle.me, Vector2(3150, 1800), 2)
	# Two small battalions, braced (not dug in yet): three of ours in line
	# with the guns' help take it; a column marched straight in breaks.
	var r1 := _battalion(_foe(), point + Vector2(60, -90), 0.0, 14)
	var r2 := _battalion(_foe(), point + Vector2(60, 110), 0.0, 14)
	for r in [r1, r2]:
		if r != null:
			r.hold = true
			_theirs.append(r)
	_look_at((point + Vector2(2950, 1930)) / 2.0)


## Open field, as the test field but smaller: two battalions, guns and
## horse each side; the British come on.
func _set_up_field() -> void:
	limit = 480.0
	point = Vector2(4900, 3000)
	_battalion(battle.me, Vector2(4400, 2860), 0.0)
	_battalion(battle.me, Vector2(4400, 3120), 0.0)
	_guns(battle.me, Vector2(4280, 2960), 2)
	for n in 6:
		battle.add_unit(battle.me, "cavalry", Vector2(4350, 2620 + n * 22.0))
	for y: float in [2820.0, 3000.0, 3180.0]:
		var r := _battalion(_foe(), Vector2(5500, y), PI)
		if r != null:
			_theirs.append(r)
	_guns(_foe(), Vector2(5640, 2950), 1)
	_look_at(Vector2(4700, 3000))


func update(delta: float) -> void:
	if battle.result != "":
		return
	_elapsed += delta
	for w: Dictionary in _waves:
		if not w.get("sent", false) and _elapsed >= float(w["at"]):
			w["sent"] = true
			_send_wave(int(w["count"]))
	_push(delta)
	_judge(delta)
	_show()


## A British wave from the east bank onto the bridge.
func _send_wave(count: int) -> void:
	for i in count:
		var r := _battalion(_foe(), Vector2(2650, 2420 + i * 240.0), PI, 20)
		if r != null:
			_theirs.append(r)
	battle.say("Een Britse golf rukt op naar de brug!")
	Battle.buzz(60)


## The British battalions keep coming at the goal (the bridge, or ours on
## the open field) until they are fighting; the hamlet's garrison stays.
func _push(delta: float) -> void:
	_push_clock -= delta
	if _push_clock > 0.0 or id == "dorp":
		return
	_push_clock = 4.0
	for r in _theirs:
		if r.destroyed() or r.routing or r.enemy != null:
			continue
		var target := point + Vector2(-120, 0) if id == "brug" else _nearest_ours(r.centroid())
		var way := (target - r.centroid())
		if way.length() > 60.0:
			r.order_move(target, way.angle())


func _nearest_ours(from: Vector2) -> Vector2:
	var best := point
	var d := INF
	for r in battle.regiments:
		if r.side == battle.me and not r.destroyed() and r.centroid().distance_to(from) < d:
			d = r.centroid().distance_to(from)
			best = r.centroid()
	return best


## Fighting men of a side within the goal's radius.
func _near_point(side: String) -> int:
	var n := 0
	for u in battle.units:
		if u.side == side and u.alive() and u.military() and u.world.distance_to(point) < POINT_RADIUS:
			n += 1
	return n


func _army(side: String) -> int:
	var n := 0
	for u in battle.units:
		if u.side == side and u.alive() and u.military() and (u.regiment == null or not u.regiment.routing):
			n += 1
	return n


func _all_sent() -> bool:
	for w: Dictionary in _waves:
		if not w.get("sent", false):
			return false
	return true


func _theirs_beaten() -> bool:
	for r in _theirs:
		if not r.destroyed() and not r.routing:
			return false
	return true


func _judge(delta: float) -> void:
	if _army(battle.me) == 0:
		_end(false, "Je leger is verslagen.")
		return
	match id:
		"brug":
			var theirs := _near_point(_foe())
			_held = _held + delta if theirs > 0 and _near_point(battle.me) == 0 else maxf(0.0, _held - delta)
			if _held >= HOLD_SECONDS:
				_end(false, "De Britten hebben de brug genomen.")
			elif _elapsed >= limit or (_all_sent() and _theirs_beaten()):
				_end(true, "De brug is gehouden!")
		"dorp":
			_held = _held + delta if _near_point(battle.me) > 0 and _near_point(_foe()) == 0 else 0.0
			if _held >= HOLD_SECONDS:
				_end(true, "Het dorp is veroverd!")
			elif _elapsed >= limit:
				_end(false, "De tijd is om: het dorp is nog in Britse handen.")
		_:
			if _theirs_beaten():
				_end(true, "De Britten zijn van het veld verdreven!")
			elif _elapsed >= limit:
				_end(false, "De tijd is om: de Britten houden stand.")


func _end(won: bool, why: String) -> void:
	battle._finish(battle.me if won else _foe(), "quick")
	battle.status = why
	_card.visible = false
	Battle.buzz(120)


func _show() -> void:
	var left := maxf(0.0, limit - _elapsed)
	_heading.text = "%s · NOG %d:%02d" % [String(info(id)["title"]).to_upper(), int(left) / 60, int(left) % 60]
	match id:
		"brug":
			var waiting := 0
			for w: Dictionary in _waves:
				if not w.get("sent", false):
					waiting += 1
			_text.text = "Houd de brug: laat geen Britten op de westoever. Nog %d golf%s onderweg." % [waiting, "" if waiting == 1 else "en"]
			if _held > 0.5:
				_text.text += " De Britten zijn over de brug! (%d s)" % int(HOLD_SECONDS - _held)
		"dorp":
			_text.text = "Verdrijf het garnizoen en zet je troepen in het dorp op de heuvel."
			if _held > 0.5:
				_text.text = "Het dorp is van ons... nog %d s volhouden." % int(HOLD_SECONDS - _held + 1.0)
		_:
			var standing := 0
			for r in _theirs:
				if not r.destroyed() and not r.routing:
					standing += 1
			_text.text = "Verdrijf alle Britse bataljons. Nog %d over." % standing
	Tutorial.place_card(_card, _text)
