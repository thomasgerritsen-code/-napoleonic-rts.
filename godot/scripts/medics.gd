class_name FieldMedics
extends Node2D
## The wounded and the stretcher-bearers, as the web game's medics: of the
## musketeers, officers and drummers who fall, nearly half are wounded rather
## than killed and lie where they fell, marked with a white cross. A field
## hospital sends out two stretcher teams that bring in its own side's
## wounded, the most urgent first. At the hospital they mend, then march back
## to their battalion when it still stands and has room. Wounded nobody fetches
## bleed to death after a minute and a half. The bearers do not fight and are
## not shot at.

var battle: Battle
## The fallen who are wounded: their Unit, with wound "lying", "carried",
## "healing", "healed" or "dead".
var wounded: Array[Unit] = []
var teams := {}               # hospital -> Array[Team]
var stats := {"wounded": 0, "fetched": 0, "healed": 0, "rejoined": 0, "bled_out": 0}


## Two bearers and a canvas stretcher between them.
class Team extends Node2D:
	var world := Vector2.ZERO
	var facing := 0.0
	var state := "idle"       # idle, out, carry
	var target: Unit = null
	var moving := false
	var next_pick := 0.0
	var _goal := Vector2.INF
	var _path: Array[Vector2] = []
	var _bearers: Array[AnimatedSprite2D] = []

	func _init(side: String, at: Vector2) -> void:
		world = at
		var look := AtlasLibrary.get_set(["frw_iso_worker" if side == "france" else "brw_iso_worker"])
		for i in 2:
			var s := AnimatedSprite2D.new()
			s.centered = false
			s.scale = Vector2.ONE * Iso.SPRITE_SCALE
			s.sprite_frames = look["frames"]
			s.offset = -Vector2(look["pivot"])
			add_child(s)
			_bearers.append(s)
		position = Iso.to_screen(world)

	## Walk towards `to` (by a bridge when the river lies between); true once there.
	func walk(to: Vector2, speed: float, delta: float) -> bool:
		if to.distance_squared_to(_goal) > 1.0:
			_goal = to
			_path = Nav.route(world, Nav.dry(world, to))
		var next: Vector2 = _path[0] if not _path.is_empty() else to
		var way := next - world
		if way.length() <= 3.0:
			if _path.size() > 1:
				_path.pop_front()
				return false
			moving = false
			return true
		world += way.limit_length(speed * delta)
		facing = way.angle()
		moving = true
		return false

	func show_step(lift: float) -> void:
		position = Iso.to_screen(world)
		var along := Vector2.from_angle(facing) * 9.5
		var anim := ("march_" if moving else "idle_") + Iso.direction(facing)
		for i in 2:
			var s := _bearers[i]
			s.position = Iso.to_screen(world + along * (i * 2 - 1)) - position
			if s.animation != anim:
				s.play(anim)
		if target != null and state == "carry":
			target.world = world
			target.position = position + Vector2(0, -lift)
		queue_redraw()

	func _draw() -> void:
		var along := Vector2.from_angle(facing) * 7.6
		var across := along.orthogonal().normalized() * 3.0
		var lift := Vector2(0, -7)
		var corners := PackedVector2Array()
		for p: Vector2 in [-along - across, along - across, along + across, -along + across]:
			corners.append(Iso.to_screen(world + p) - position + lift)
		draw_colored_polygon(corners, Color(0.85, 0.82, 0.73))
		draw_line(corners[0], corners[1], Color(0.35, 0.25, 0.15), 1.2)
		draw_line(corners[3], corners[2], Color(0.35, 0.25, 0.15), 1.2)


func _process(_delta: float) -> void:
	queue_redraw()


func on_fallen(u: Unit) -> void:
	var cfg := Rules.medics()
	if u.wound == "" and u.type in cfg["types"] and randf() < float(cfg["woundedShare"]):
		wound(u)


func wound(u: Unit) -> void:
	if u.alive() or u.wound != "":
		return
	u.wound = "lying"
	u.wounded_at = battle.clock
	wounded.append(u)
	stats["wounded"] += 1
	u.queue_redraw()


func lying() -> int:
	var n := 0
	for w in wounded:
		if w.wound == "lying":
			n += 1
	return n


func update(delta: float) -> void:
	var cfg := Rules.medics()
	for h in teams.keys():
		if not is_instance_valid(h) or not (h as Building).standing():
			_disband(h)
	for b in battle.buildings:
		if b.type == "hospital" and b.complete and b.standing():
			if not teams.has(b):
				_raise_teams(b, int(cfg["teams"]))
			_send_teams(b, delta, cfg)
	for w in wounded:
		if w.wound == "lying" and battle.clock - w.wounded_at > float(cfg["bleedOutSeconds"]) and not _fetching(w):
			w.wound = "dead"
			w.queue_redraw()
			stats["bled_out"] += 1
		elif w.wound == "healing" and battle.clock >= w.heal_until:
			_discharge(w)
	for i in range(wounded.size() - 1, -1, -1):
		if wounded[i].wound in ["healed", "dead"]:
			wounded.remove_at(i)


## Online, host: where the stretcher teams are, for the client.
func net_teams() -> Array:
	var list: Array = []
	for h in teams:
		var b := h as Building
		for t: Team in teams[h]:
			list.append([b.id, roundi(t.world.x), roundi(t.world.y), snappedf(t.facing, 0.01), t.state, t.moving,
				t.target.id if t.target != null else 0])
	return list


## Online, client: show the host's stretcher teams, carrying whom they carry.
func apply_net_teams(list: Array) -> void:
	var seen := {}
	for a: Array in list:
		var h := battle.building_by_id(int(a[0]))
		if h == null:
			continue
		if not teams.has(h):
			var none: Array[Team] = []
			teams[h] = none
		var crew: Array[Team] = teams[h]
		var i: int = seen.get(h, 0)
		seen[h] = i + 1
		if i >= crew.size():
			var fresh := Team.new(h.side, Vector2(a[1], a[2]))
			battle.add_to_field(fresh)
			crew.append(fresh)
		var t := crew[i]
		t.world = t.world.lerp(Vector2(a[1], a[2]), 0.6) if t.world.distance_to(Vector2(a[1], a[2])) < 200.0 else Vector2(a[1], a[2])
		t.facing = a[3]
		t.state = a[4]
		t.moving = a[5]
		t.target = battle.unit_by_id(int(a[6])) if int(a[6]) > 0 else null
		t.visible = h.side == battle.me or battle.fog == null or battle.fog.sees(t.world)
		t.show_step(7.0)
	# Teams of a fallen hospital go.
	for h in teams.keys():
		if not seen.has(h):
			for t: Team in teams[h]:
				t.queue_free()
			teams.erase(h)


func _raise_teams(h: Building, count: int) -> void:
	var list: Array[Team] = []
	for i in count:
		var t := Team.new(h.side, _door(h) + Vector2(i * 24.0, 0))
		battle.add_to_field(t)
		list.append(t)
	teams[h] = list


## A team whose hospital fell puts its man down and is gone.
func _disband(h: Variant) -> void:
	for t: Team in teams[h]:
		if t.target != null and t.target.wound == "carried":
			t.target.wound = "lying"
			t.target.wounded_at = battle.clock - float(Rules.medics()["bleedOutSeconds"]) * 0.4
		t.queue_free()
	teams.erase(h)


func _door(h: Building) -> Vector2:
	return h.world + Vector2(0, h.size.y / 2.0 + 18.0)


func _fetching(w: Unit) -> bool:
	for list: Array in teams.values():
		for t: Team in list:
			if t.target == w:
				return true
	return false


func _send_teams(h: Building, delta: float, cfg: Dictionary) -> void:
	var speed := float(cfg["teamSpeed"])
	var lift := 7.0
	for t: Team in teams[h]:
		if t.state == "idle" and battle.clock >= t.next_pick:
			t.next_pick = battle.clock + 0.75
			var w := _pick(h, cfg)
			if w != null:
				t.target = w
				t.state = "out"
		match t.state:
			"idle":
				t.walk(_door(h), speed, delta)
			"out":
				if t.target.wound != "lying":
					t.state = "idle"
					t.target = null
				elif t.walk(t.target.world, speed, delta):
					t.target.wound = "carried"
					t.target.queue_redraw()
					t.state = "carry"
					stats["fetched"] += 1
			"carry":
				if t.walk(_door(h), speed, delta):
					var w := t.target
					w.wound = "healing"
					w.heal_until = battle.clock + float(cfg["healSeconds"])
					w.hospital = h
					w.modulate.a = 0.0
					t.state = "idle"
					t.target = null
		t.visible = h.side == battle.me or battle.fog == null or battle.fog.sees(t.world)
		t.show_step(lift)


## The most urgent of its own side's wounded the team can still reach in time.
func _pick(h: Building, cfg: Dictionary) -> Unit:
	var best: Unit = null
	var score := INF
	var speed := float(cfg["teamSpeed"])
	for w in wounded:
		if w.wound != "lying" or w.side != h.side or _fetching(w):
			continue
		var d := w.world.distance_to(h.world)
		if d >= float(cfg["reach"]):
			continue
		var remaining := float(cfg["bleedOutSeconds"]) - (battle.clock - w.wounded_at)
		if remaining < d / speed + 1.0:
			continue
		var urgency := remaining + d / speed * 0.4
		if urgency < score:
			score = urgency
			best = w
	return best


## Well again: a new man at the hospital door, back to his battalion if it
## still stands and has room for him.
func _discharge(w: Unit) -> void:
	var h: Building = w.hospital if is_instance_valid(w.hospital) else null
	if h == null or not h.standing():
		w.wound = "lying"
		w.modulate.a = 1.0
		w.wounded_at = battle.clock - float(Rules.medics()["bleedOutSeconds"]) * 0.4
		return
	if not battle.has_room(w.side, w.type):
		return
	var u := battle.add_unit(w.side, w.type, _door(h) + Vector2(randf_range(-12, 12), 10), w.troop)
	w.wound = "healed"
	stats["healed"] += 1
	var r := w.regiment
	if r != null and not r.routing and not r.destroyed() and r.take_back(u):
		stats["rejoined"] += 1
		battle.say("Hersteld uit het veldhospitaal: terug naar %s." % r.name, w.side)
	elif not battle.commanded(w.side):
		battle.ai.on_trained(u)
