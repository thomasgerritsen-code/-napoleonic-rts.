extends SceneTree
## Real renderer check for 400 full-detail Blender actors. Off-camera
## animations sleep; bringing them back and switching to 2D restores poses.
## This verifies rendering behavior, not a minimum hardware GPU frame rate.

var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	Battle.mode = "campaign"
	Battle.online_role = ""
	Battle.view_3d = true
	var battle: Battle = load("res://scenes/main.tscn").instantiate()
	root.add_child(battle)
	await process_frame
	await process_frame
	battle.set_process(false)
	battle.fog.enabled = false
	battle.fog.refresh()
	for i in 388:
		var side := "france" if i % 2 == 0 else "britain"
		var kind := "infantry" if i < 340 else ("cavalry" if i < 372 else "artillery")
		var at := Vector2(4600 + i % 20 * 20, 2400 + i / 20 * 20)
		battle.add_unit(side, kind, at)
	for u in battle.units:
		u.visible = true
		u.position = Iso.to_screen(u.world)
	battle.view3d.view(Vector2(4800, 2600), 15.0, 48.0, 90.0)
	for i in 4:
		await process_frame
	await RenderingServer.frame_post_draw
	var men: Dictionary = battle.view3d.get("_men")
	var active := _active(men)
	var full := men.size()
	check(full == 400 and active > 200, "400 complete Blender actors load and the visible army animates (%d active)" % active)
	var sprite_playing := 0
	for u in battle.units:
		if u._sprite.is_playing():
			sprite_playing += 1
	check(sprite_playing == 0, "the 400 hidden 2D sprite animations stay paused in 3D")
	var swordsman: Unit = battle.units[12]
	var model: Dictionary = men[swordsman]
	var pose_player: AnimationPlayer = model["player"]
	swordsman._play("thrust", true)
	battle.view3d.call("_sync_units", 1.0 / 60.0)
	pose_player.seek(pose_player.get_animation("thrust").length * 0.8, true)
	swordsman._play("thrust", true)
	battle.view3d.call("_sync_units", 1.0 / 60.0)
	check(model["anim"] == "thrust" and pose_player.current_animation_position < 0.01,
		"repeated melee strokes restart the existing Blender animation")
	swordsman._play("idle", true)
	var out := OS.get_environment("SHOT_DIR")
	if out != "":
		root.get_texture().get_image().save_png(out.path_join("army400_3d.png"))
	battle.view3d.view(Vector2(450, 800), 15.0, 48.0, 45.0)
	for i in 3:
		await process_frame
	var resting := _active(men)
	check(men.size() == full and resting < 30, "off-camera animation work stops while all models remain available (%d active)" % resting)
	# A soldier falling while out of view returns as a fallen soldier, rather
	# than starting a long-delayed death animation when the camera comes back.
	var fallen: Unit = battle.units[12]
	fallen.state = Unit.State.DEAD
	fallen.anim_state = "die"
	battle.view3d.view(fallen.world, 0.0, 48.0, 25.0)
	battle.view3d.call("_sync_units", 1.0 / 60.0)
	var dead: Dictionary = men[fallen]
	var player: AnimationPlayer = dead["player"]
	check(dead["anim"] == "die" and player.current_animation_position >= player.get_animation("die").length - 0.01,
		"a soldier who fell off-camera is shown in his completed fallen pose")
	for i in 2:
		await process_frame
	check(_active(men) > resting, "returning the camera reactivates the visible army")
	battle.set_view_3d(false)
	var restored := 0
	for u in battle.units:
		if u.alive() and u._sprite.is_playing():
			restored += 1
	check(restored == 399, "switching back restores all 399 living 2D animations")
	print("GODOT_RENDER ", JSON.stringify({"models": full, "army_active": active, "base_active": resting, "failures": failures}))
	battle.queue_free()
	Battle.view_3d = false
	await process_frame
	quit(0 if failures.is_empty() else 1)


func _active(men: Dictionary) -> int:
	var count := 0
	for m: Dictionary in men.values():
		var player: AnimationPlayer = m["player"]
		if player != null and player.active:
			count += 1
	return count
