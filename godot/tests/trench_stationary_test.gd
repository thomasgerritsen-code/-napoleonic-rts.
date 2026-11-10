extends SceneTree
## A settled fire-step must not restart marching for sub-slot corrections.
## Breathing stays calm; firing, leaving and routing remain responsive.

var failures: Array[String] = []


func check(ok: bool,message: String) -> void:
	print("ok   " if ok else "FAIL ",message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.online_role = ""
	Battle.view_3d = false
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.ai.set("_clock",1.0e9)
	battle.weather.set_process(false)
	var centre := Vector2(4600,2700)
	var men: Array[Unit] = []
	for i in 12:
		men.append(battle.add_unit("france","infantry",centre+Vector2(i*16,0)))
	men.append(battle.add_unit("france","officer",centre+Vector2(0,30)))
	men.append(battle.add_unit("france","drummer",centre+Vector2(10,40)))
	var regiment := battle.form_regiment(men)
	regiment.order_move(centre,0.0)
	regiment._march.clear()
	regiment._form(centre)
	for u in men:
		u.world = u.slot
		u.slot_gap = 0.0
	var trench := battle.trenches._along_front(regiment,regiment.centroid(),Rules.orders())
	trench["progress"] = 1.0
	regiment.trench = trench
	battle.trenches.list.append(trench)
	battle.trenches._dress_men()
	var front: Unit = null
	for u in men:
		if u.type == "infantry" and u.leaning:
			front = u
			break
	check(front != null,"the fixture has a completed trench and a leaning front rank")
	if front == null:
		battle.queue_free()
		await process_frame
		quit(1)
		return
	# Model a small legal displacement from neighbour separation. It is
	# already within the trench's standing tolerance, not a new move order.
	front.world = front.slot+Vector2(0,4.0)
	front.state = Unit.State.IDLE
	front._play("idle")
	var before := front.world
	front.step(1.0/60.0)
	check(front.world == before and front.anim_state == "rest","a settled front-rank musketeer does not walk back and forth over a 4px correction")
	for i in 125:
		front.step(1.0/60.0)
	check(front.world == before and not front.stuck,"holding the fire-step does not trigger a false stuck/replanning cycle")
	var sprite := front.get("_sprite") as AnimatedSprite2D
	var period := float(sprite.sprite_frames.get_frame_count(sprite.animation)) \
		/maxf(0.001,sprite.sprite_frames.get_animation_speed(sprite.animation)*sprite.speed_scale)
	check(absf(period-3.2)<0.01,"the 2D fire-step breath lasts 3.2 seconds")
	# A real shot must still use its normal recoil timing.
	front._play("fire",true)
	check(front.anim_state == "rfire" and is_equal_approx(sprite.speed_scale,1.0),"firing keeps the normal shot animation speed")
	battle.set_view_3d(true)
	battle.view3d.view(centre,0.0,48.0,20.0)
	battle.view3d.field._sync_works()
	var trench_mesh: Mesh = battle.view3d.field.get("_works").mesh
	var surface := trench_mesh.surface_get_arrays(0)
	check(surface[Mesh.ARRAY_NORMAL][0].y>0.5,"the 3D trench bed faces upward and can be seen from above")
	front.leaning = true
	front._play("idle",true)
	battle.view3d._sync_units(1.0/60.0)
	var model: Dictionary = battle.view3d.get("_men")[front]
	var player: AnimationPlayer = model["player"]
	period = player.get_animation("rest").length/player.speed_scale
	check(model["anim"] == "rest" and absf(period-3.2)<0.01,"the 3D fire-step breath also lasts 3.2 seconds")
	var out := OS.get_environment("SHOT_DIR")
	if out != "":
		battle.fog.enabled = false
		battle.fog.refresh()
		battle.view3d.view(trench["centre"],-25.0,36.0,18.0)
		for i in 3:
			await process_frame
		await RenderingServer.frame_post_draw
		root.get_texture().get_image().save_png(out.path_join("trench_stationary.png"))
	front._play("fire",true)
	battle.view3d._sync_units(1.0/60.0)
	check(model["anim"] == "rfire" and is_equal_approx(player.speed_scale,1.0),"3D recoil stays immediate")
	battle.set_view_3d(false)
	await process_frame
	# Holding a trench is not a lock: another order must move the battalion.
	var start := front.world
	regiment.order_move(centre+Vector2(260,0),0.0)
	for i in 300:
		battle.combat_space.rebuild(battle.units)
		regiment.update(0.05,battle.regiments)
		for u in men:
			u.step(0.05)
		battle._keep_apart()
	check(front.world.distance_to(start)>100.0,"a new marching order releases the settled front rank")
	regiment._march.clear()
	regiment.routing = true
	front.slot = front.world+Vector2(-100,0)
	before = front.world
	front.step(0.05)
	check(front.world.distance_to(before)>0.1,"a routing soldier is never held on the fire-step")
	print("GODOT_TRENCH_STILL ",JSON.stringify({"failures":failures}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)
