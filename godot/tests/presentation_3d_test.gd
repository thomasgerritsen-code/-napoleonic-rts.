extends SceneTree
## Render isolation without disabling the shared simulation. A fresh process
## verifies lazy atlases; the real-renderer army and phone gates run as well.

var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.view_3d = true
	Battle.mode = "campaign"
	Battle.online_role = ""
	Battle.fancy = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.ai.set("_clock", 1.0e9)
	for i in 388:
		var kind := "infantry" if i < 340 else ("cavalry" if i < 372 else "artillery")
		battle.add_unit("france" if i%2 == 0 else "britain", kind, Vector2(4600+i%20*20, 2400+i/20*20))
	var home := battle.town_centre(battle.me).world
	var hospital := battle.add_building(battle.me, "hospital", home+Vector2(350,350), true)
	battle.medics.update(0.0)
	check(battle.units.size() == 400 and AtlasLibrary._cache.is_empty(),
		"400 men, horses, gun crews, wildlife and stretcher teams load no unused 2D atlases in 3D")
	check(not battle.effects.can_process() and not battle.lights.can_process()
		and not battle.medics.is_processing() and not battle.get("_units_layer").y_sort_enabled,
		"hidden 2D effects, lights, medic redraws and depth sorting are asleep")
	check(not battle.camera.is_processing() and not battle.camera.is_processing_unhandled_input(),
		"only the 3D camera handles movement and input")
	check(not battle.fancy_look.can_process() and not battle.fancy_look.visible
		and not battle.fancy_look.get("_cloud_layer").visible,
		"the optional 2D sun and separate cloud canvas also sleep behind the 3D sky")
	check(battle.fog.can_process() and battle.weather.is_processing() and battle.get("_hud").can_process(),
		"visibility, weather rules and the phone HUD keep running")
	var initially_active := 0
	for sprite: AnimatedSprite2D in battle.get("_units_layer").find_children("*", "AnimatedSprite2D", true, false):
		if sprite.can_process() or sprite.is_playing():
			initially_active += 1
	check(initially_active == 0, "all hidden 2D animations sleep, including newly recruited units")
	# Shots must emit exclusively in the chosen renderer, and particle
	# randomness must not change combat randomness or authoritative data.
	var emitted := battle.effects.emitted
	var flashed := battle.lights.flashed
	var snapshot := JSON.stringify(NetSync.capture(battle))
	seed(1815)
	var expected := randi()
	seed(1815)
	battle._puff(home, 0.55, 2.0, Vector2.RIGHT)
	battle._earth(home, 1.0)
	check(randi() == expected and JSON.stringify(NetSync.capture(battle)) == snapshot,
		"3D cosmetic effects preserve combat randomness and the full authoritative state")
	check(battle.effects.emitted == emitted and battle.lights.flashed == flashed
		and int(battle.view3d.fx.get("_kinds")["smoke"]["next"]) > 0,
		"a 3D shot and explosion create visible 3D effects without duplicate 2D puffs or flashes")
	battle.weather.raining = true
	var wet := battle.weather.wetness
	battle.weather._process(1.0)
	var rain: CPUParticles2D = battle.weather.get("_rain")
	check(battle.weather.wetness > wet and not rain.emitting and not rain.can_process(),
		"rain still wets the battlefield while hidden 2D CPU rain particles stay disabled")
	# Shared simulation and carrying continue without rendering the bearers.
	var walker: Unit = battle.units[12]
	walker.move_to(walker.world+Vector2(60,0))
	var before := walker.world
	var clock := battle.clock
	for i in 10:
		battle._process(0.1)
	check(battle.clock > clock and walker.world.distance_to(before) > 0.5,
		"the shared battle clock and troop movement still advance in 3D")
	var team: FieldMedics.Team = battle.medics.teams[hospital][0]
	team.target = battle.units[13]
	team.state = "carry"
	team.world += Vector2(20,0)
	team.show_step(7.0)
	check(team.target.world == team.world and team.get("_bearers").is_empty(),
		"carried wounded follow their team without loading or animating 2D bearers")
	team.target = null
	team.state = "idle"
	# A gameplay timer must not be owned by disabled presentation nodes.
	var foe := battle.add_unit("britain", "infantry", home+Vector2(150,150))
	var hp := foe.hp
	var children: int = battle.get("_effects").get_child_count()
	battle.throw_grenade(walker, foe.world)
	check(battle.get("_effects").get_child_count() == children,
		"a 3D grenade does not allocate a hidden 2D projectile or animate its flight")
	await create_timer(1.4).timeout
	check(foe.hp < hp, "a grenade still explodes and deals damage while the 2D renderer sleeps")
	foe.hit(10000.0)
	check(AtlasLibrary._cache.is_empty(), "fighting and dying in 3D still load no sprite atlases")
	# Switching presentation must retain the battle and restore the actual
	# current sprite poses, including corpses, teams and wildlife.
	snapshot = JSON.stringify(NetSync.capture(battle))
	battle.set_view_3d(false)
	check(JSON.stringify(NetSync.capture(battle)) == snapshot,
		"returning to 2D leaves the complete authoritative battle unchanged")
	check(battle.effects.can_process() and battle.lights.can_process()
		and battle.medics.is_processing() and battle.camera.is_processing()
		and battle.camera.is_processing_unhandled_input() and battle.get("_units_layer").y_sort_enabled,
		"2D effects, drawing, depth sorting and camera input resume on demand")
	check(battle.fancy_look.visible and battle.fancy_look.get("_cloud_layer").visible,
		"the optional 2D sun and clouds return only when 2D is selected")
	check(walker._sprite.sprite_frames != null and not team.get("_bearers").is_empty()
		and not foe._sprite.is_playing() and foe._sprite.frame == foe._sprite.sprite_frames.get_frame_count(foe._sprite.animation)-1,
		"2D pictures load only on demand and an already fallen soldier remains fallen")
	var atlases := AtlasLibrary._cache.size()
	battle.set_view_3d(true)
	var active := 0
	for sprite: AnimatedSprite2D in battle.get("_units_layer").find_children("*", "AnimatedSprite2D", true, false):
		if sprite.can_process() or sprite.is_playing():
			active += 1
	check(active == 0 and not battle.effects.can_process() and not battle.lights.can_process(),
		"switching to 3D again stops every loaded 2D animation, including crews, wildlife and bearers")
	print("GODOT_PRESENTATION ", JSON.stringify({"failures":failures, "units":battle.units.size(),
		"2d_atlases_before_switch":0, "2d_atlases_after_switch":atlases, "active_2d_animations":active}))
	battle.queue_free()
	Battle.view_3d = false
	Battle.fancy = false
	await process_frame
	quit(0 if failures.is_empty() else 1)
