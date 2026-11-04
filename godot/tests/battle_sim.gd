extends SceneTree
## Battles played out to look at the details: a set of fights on open
## ground (line against line, a column's attack, horse against a square,
## guns, a bridge, a large battle), each measured as it goes:
## - overlap: men standing in one another (closer than 5 px);
## - stuck: men far from their place who have not moved for 3 s;
## - spin: men turning about (more than 150 degrees) between samples while
##   not marching;
## - idle: seconds a battalion had a foe in musket reach and fired no shot;
## - spread: how far, on average, the men of a standing battalion are from
##   their places;
## and how it ended (time, losses, who held the field).
##
##   godot --headless --path godot --script res://tests/battle_sim.gd
##   SIM_ONLY=line_vs_line SIM_SECONDS=120 ... for one

const STEP := 0.1
const SAMPLE := 0.5

var battle: Battle
var _shots := {}          # Regiment -> clock of its last shot
var _seen := {}           # Unit -> [world, clock] of the last time it moved
var report := {}
var _ours: Array[Unit] = []   # the men this scenario put on the field
var _flank_horse: Array = []


func _initialize() -> void:
	var only := OS.get_environment("SIM_ONLY")
	for scenario: String in ["line_vs_line", "column_attack", "horse_vs_square", "horse_vs_line", "guns", "bridge", "large"]:
		if only == "" or only == scenario:
			await _play(scenario)
	print("SIM ", JSON.stringify(report))
	quit(0)


func _play(scenario: String) -> void:
	Battle.mode = "campaign"
	Battle.view_3d = false
	battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.ai.set("_next_wave", 1.0e9)
	battle.fog.enabled = false
	battle.fog.refresh()
	seed(1815)
	_shots.clear()
	_seen.clear()
	_ours.clear()
	var seconds := 150.0
	match scenario:
		"line_vs_line":
			_battalion("france", Vector2(4700, 2900), 0.0)
			_battalion("france", Vector2(4700, 3180), 0.0)
			_battalion("britain", Vector2(4890, 2900), PI)
			_battalion("britain", Vector2(4890, 3180), PI)
		"column_attack":
			var c := _battalion("france", Vector2(4500, 3000), 0.0)
			c.set_formation("column")
			_battalion("britain", Vector2(5000, 3000), PI)
			c.order_move(Vector2(4950, 3000), 0.0)
		"horse_vs_square":
			var sq := _battalion("britain", Vector2(5000, 3000), PI)
			sq.set_formation("square")
			var horse := _squadron("france", Vector2(4550, 3000))
			for i in 30:
				battle._process(STEP)
			horse.charge(battle.regiments)
		"horse_vs_line":
			# Horse into the flank of a line busy with a foe before it.
			_battalion("britain", Vector2(5000, 3000), PI)
			_battalion("france", Vector2(4800, 3000), 0.0)
			var flank := _squadron("france", Vector2(5000, 2600))
			for i in 60:
				battle._process(STEP)
			flank.charge(battle.regiments)
		"guns":
			_battalion("france", Vector2(4600, 3000), 0.0)
			for i in 2:
				_ours.append(battle.add_unit("france", "artillery", Vector2(4560, 2860 + i * 280)))
			var b := _battalion("britain", Vector2(5300, 3000), PI)
			b.order_move(Vector2(4800, 3000), PI)
		"bridge":
			# The bridge west of the Grands Bois: French on the west bank, the
			# British crossing at them.
			_battalion("france", Vector2(1400, 2540), 0.0)
			var crossing := _battalion("britain", Vector2(2000, 2540), PI)
			crossing.order_move(Vector2(1460, 2540), PI)
		"large":
			seconds = 200.0
			# Both armies march straight at each other; the horse waits on
			# the flanks and goes in once the lines are fighting.
			for i in 6:
				var fr := _battalion("france", Vector2(4300, 2400 + i * 240), 0.0)
				var br := _battalion("britain", Vector2(5500, 2400 + i * 240), PI)
				fr.order_move(Vector2(4820, 2400 + i * 240), 0.0)
				br.order_move(Vector2(4990, 2400 + i * 240), PI)
			_flank_horse = [_squadron("france", Vector2(4300, 2100)), _squadron("britain", Vector2(5500, 3800))]
			for i in 2:
				_ours.append(battle.add_unit("france", "artillery", Vector2(4200, 2700 + i * 600)))
				_ours.append(battle.add_unit("britain", "artillery", Vector2(5600, 2700 + i * 600)))
	if OS.get_environment("SIM_SECONDS") != "":
		seconds = float(OS.get_environment("SIM_SECONDS"))
	for u in battle.units:
		u.fired.connect(_on_fired)
	var start_men := {"france": _men("france"), "britain": _men("britain")}
	var m := {"overlap": 0, "stuck": {}, "spin": 0, "idle": 0.0, "spread": [], "ms": 0}
	var facings := {}
	var t := 0.0
	var sample := 0.0
	var ended := -1.0
	var started := Time.get_ticks_msec()
	while t < seconds:
		battle._process(STEP)
		t += STEP
		sample -= STEP
		if sample > 0.0:
			continue
		sample = SAMPLE
		_measure(m, facings)
		if scenario == "large" and absf(t - 60.0) < SAMPLE / 2.0:
			for horse: Regiment in _flank_horse:
				if horse != null and not horse.destroyed() and not horse.routing:
					horse.charge(battle.regiments)
		if ended < 0.0 and (_beaten("france") or _beaten("britain")):
			ended = t
			if OS.get_environment("SIM_TRACE") != "":
				print("  ended: france beaten %s, britain beaten %s" % [_beaten("france"), _beaten("britain")])
		if OS.get_environment("SIM_TRACE") != "" and int(t / SAMPLE) % 4 == 0:
			var lines: Array[String] = []
			for r in battle.regiments:
				if r.men.is_empty() or not _ours.has(r.men[0]):
					continue
				lines.append("%s %s %s n%d m%d %s%s%s%s" % [r.side.left(2), r.formation.left(4), r.centroid().round(), r.strength(), int(r.morale()),
					"E" if r.enemy != null else "-", "C" if r.charging != null else "-", "R" if r.routing else "-", "M" if r.moving() else "-"])
			print("  t=%5.1f %s" % [t, " | ".join(lines)])
	m["ms"] = Time.get_ticks_msec() - started
	var spread: Array = m["spread"]
	var mean_spread := 0.0
	for v: float in spread:
		mean_spread += v
	report[scenario] = {
		"overlap": m["overlap"], "stuck": (m["stuck"] as Dictionary).size(), "spin": m["spin"], "idle_s": snappedf(m["idle"], 0.5),
		"spread_px": snappedf(mean_spread / maxf(1.0, spread.size()), 0.1), "ended_s": snappedf(ended, 0.5),
		"lost": {"france": int(start_men["france"]) - _men("france"), "britain": int(start_men["britain"]) - _men("britain")},
		"routed": _routed(), "sim_ms": m["ms"]}
	print("%s %s" % [scenario, JSON.stringify(report[scenario])])
	battle.queue_free()
	await process_frame


func _battalion(side: String, at: Vector2, face: float, count := 24) -> Regiment:
	var men: Array[Unit] = []
	var across := Vector2.from_angle(face + PI / 2.0)
	for i in count:
		men.append(battle.add_unit(side, "infantry", at + across * ((i % 12) - 5.5) * 15.0 - Vector2.from_angle(face) * (i / 12) * 19.0))
	men.append(battle.add_unit(side, "officer", at - Vector2.from_angle(face) * 45.0))
	men.append(battle.add_unit(side, "drummer", at - Vector2.from_angle(face) * 45.0 + across * 20.0))
	_ours.append_array(men)
	var r := battle.form_regiment(men)
	r.order_move(at, face)
	for u in r.living():
		u.world = u.slot
	return r


func _squadron(side: String, at: Vector2) -> Regiment:
	var riders: Array[Unit] = []
	for i in 8:
		riders.append(battle.add_unit(side, "cavalry", at + Vector2((i % 4) * 30, (i / 4) * 32)))
	riders.append(battle.add_unit(side, "officer", at + Vector2(-40, 0), "mounted"))
	_ours.append_array(riders)
	var r := battle.form_regiment(riders)
	if r == null:
		push_error("no squadron formed for %s" % side)
	return r


func _on_fired(u: Unit, _target: Node2D) -> void:
	if u.regiment != null:
		_shots[u.regiment] = battle.clock


func _measure(m: Dictionary, facings: Dictionary) -> void:
	var living: Array[Unit] = []
	for u in _ours:
		if u.alive():
			living.append(u)
	# Men standing in one another.
	for i in living.size():
		for j in range(i + 1, living.size()):
			if living[i].world.distance_squared_to(living[j].world) < 25.0:
				m["overlap"] += 1
				if OS.get_environment("SIM_TRACE") == "overlap" and m["overlap"] % 20 == 1:
					var a := living[i]
					var b := living[j]
					print("  overlap %s %s at %s on bridge %s | %s %s; slots %.0f apart; states %d %d" % [a.side, a.type, a.world.round(), Nav.on_bridge(a.world),
						b.side, b.type, a.slot.distance_to(b.slot), a.state, b.state])
	for u in living:
		var r := u.regiment
		var busy := r != null and (r.routing or r.charging != null)
		# Stuck: far from his place, not moving for 3 s.
		var last: Array = _seen.get(u, [u.world, battle.clock])
		if u.world.distance_to(last[0]) > 3.0:
			_seen[u] = [u.world, battle.clock]
		elif not busy and r != null and u.world.distance_to(u.slot) > 25.0 and battle.clock - float(last[1]) > 3.0:
			(m["stuck"] as Dictionary)[u] = true
		if not _seen.has(u):
			_seen[u] = [u.world, battle.clock]
		# Turning about while not marching.
		var before: float = facings.get(u, u.facing)
		var wheeled := r != null and float(r.get("_face_clock")) > Regiment.FACE_EVERY - 3.0
		if absf(angle_difference(before, u.facing)) > deg_to_rad(150.0) and not (r != null and r.moving()) and not wheeled:
			m["spin"] += 1
			if OS.get_environment("SIM_TRACE") == "spin":
				var tgt := u.target
				print("  spin t=%.1f %s %s r.facing %.2f now %.2f anim %s enemy %s | target %s %s at %.0f px (from centre %.0f) routing %s; r moving %s face_clock %.1f" % [
					battle.clock, u.side, u.type, r.facing if r != null else 0.0, u.facing, u.anim_state, r.enemy != null if r != null else false,
					tgt.get("side") if tgt != null else "-", tgt.get("type") if tgt != null else "-",
					u.world.distance_to(Battle.spot(tgt)) if tgt != null else -1.0, r.centroid().distance_to(Battle.spot(tgt)) if tgt != null and r != null else -1.0,
					(tgt as Unit).regiment.routing if tgt is Unit and (tgt as Unit).regiment != null else false, r.moving() if r != null else false,
					float(r.get("_face_clock")) if r != null else 0.0])
		facings[u] = u.facing
	for r in battle.regiments:
		if r.destroyed() or r.routing or r.kind == "cavalry" or not _ours.has(r.men[0]):
			continue
		# A foe in musket reach, no shot for 5 s.
		var near := false
		for o in battle.regiments:
			if o.side != r.side and not o.destroyed() and not o.routing and o.centroid().distance_to(r.centroid()) < Regiment.RANGE * 0.9:
				near = true
		if near and battle.clock - float(_shots.get(r, -100.0)) > 5.0 and r.charging == null:
			m["idle"] += SAMPLE
		if not r.moving() and r.charging == null:
			var sum := 0.0
			var n := 0
			for u in r.living():
				sum += u.world.distance_to(u.slot)
				n += 1
			if n > 0:
				(m["spread"] as Array).append(sum / n)


func _men(side: String) -> int:
	var n := 0
	for u in _ours:
		if u.side == side and u.alive():
			n += 1
	return n


func _beaten(side: String) -> bool:
	for u in _ours:
		if u.side == side and u.alive() and (u.regiment == null or not u.regiment.routing):
			return false
	return true


func _routed() -> Dictionary:
	var out := {"france": 0, "britain": 0}
	for r in battle.regiments:
		if r.routing:
			out[r.side] += 1
	return out
