extends SceneTree
## Compare actual original/GPU pixels in identical worlds, with close and
## distant poses. A matching rig alone cannot catch wrong colour or skinning.

var failures: Array[String] = []


func _initialize() -> void:
	await process_frame
	var out := OS.get_environment("SHOT_DIR")
	if out == "":
		out = OS.get_user_data_dir()
	for spec: Array in [["infantry_fr","march",0.4], ["cavalry_fr","gallop",0.25],
		["worker_fr","mine",0.5], ["infantry_fr","fire",0.0], ["infantry_fr","die",0.8],
		["cuirassier_fr","slash",0.3], ["gunner_br","load",0.5]]:
		var source: PackedScene = load("res://assets3d/%s.glb" % spec[0])
		var images: Array[Image] = []
		for merged in [false, true]:
			var viewport := SubViewport.new()
			viewport.size = Vector2i(440,440)
			viewport.own_world_3d = true
			viewport.render_target_update_mode = SubViewport.UPDATE_ALWAYS
			root.add_child(viewport)
			var world := WorldEnvironment.new()
			var env := Environment.new()
			env.background_mode = Environment.BG_COLOR
			env.background_color = Color(0.16,0.19,0.22)
			env.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
			env.ambient_light_energy = 0.5
			env.ambient_light_color = Color.WHITE
			world.environment = env
			viewport.add_child(world)
			var light := DirectionalLight3D.new()
			light.rotation_degrees = Vector3(-35,-35,0)
			viewport.add_child(light)
			var camera := Camera3D.new()
			viewport.add_child(camera)
			camera.position = Vector3(5,3.8,7.5) if spec[0] in ["cavalry_fr","cuirassier_fr"] else Vector3(3,2.5,5.5)
			camera.look_at(Vector3(0,0.9,0))
			camera.make_current()
			var scene := ActorSkin3D.scene(source) if merged else source
			var actor: Node3D = scene.instantiate()
			viewport.add_child(actor)
			var player: AnimationPlayer = actor.find_child("AnimationPlayer",true,false)
			player.play(spec[1],0.0)
			player.seek(player.get_animation(spec[1]).length * float(spec[2]),true)
			player.pause()
			if merged:
				(actor.get_node("Rig") as Skeleton3D).force_update_all_bone_transforms()
			for i in 3:
				await process_frame
			await RenderingServer.frame_post_draw
			var image := viewport.get_texture().get_image()
			images.append(image)
			image.save_png(out.path_join("skin_%s_%s_%s.png" % [spec[0],spec[1],"gpu" if merged else "original"]))
			viewport.queue_free()
			await process_frame
		_compare(images[0],images[1],"%s/%s" % [spec[0],spec[1]])
	print("GODOT_SKIN_PIXELS ",JSON.stringify({"failures":failures}))
	quit(0 if failures.is_empty() else 1)


func _distance(a: Color, b: Color) -> float:
	return absf(a.r-b.r)+absf(a.g-b.g)+absf(a.b-b.b)


func _compare(before: Image, after: Image, label: String) -> void:
	var background := before.get_pixel(0,0)
	var difference := 0.0
	var union := 0
	var intersection := 0
	for y in before.get_height():
		for x in before.get_width():
			var a := before.get_pixel(x,y)
			var b := after.get_pixel(x,y)
			var seen_a := _distance(a,background)>0.03
			var seen_b := _distance(b,background)>0.03
			if seen_a or seen_b:
				union += 1
				difference += _distance(a,b)
			if seen_a and seen_b:
				intersection += 1
	var colour_error := difference / maxf(1.0,union*3.0)
	var silhouette := float(intersection) / maxf(1.0,union)
	var passed := union>300 and colour_error<0.035 and silhouette>0.95
	print("ok   " if passed else "FAIL ",label," colour error ",colour_error," silhouette ",silhouette," pixels ",union)
	if not passed:
		failures.append(label)
