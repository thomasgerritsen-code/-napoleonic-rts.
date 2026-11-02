extends SceneTree
## Original rigid Blender parts vs the shared GPU skin: geometry, finishes,
## all animation keys/poses, crossfades, cache sharing and independent actors.

var failures: Array[String] = []
var maximum_error := 0.0
var models := 0
var poses := 0


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	await process_frame
	for file in DirAccess.get_files_at("res://assets3d"):
		if not file.ends_with(".glb"):
			continue
		var source: PackedScene = load("res://assets3d/" + file)
		var original: Node3D = source.instantiate()
		var player: AnimationPlayer = original.find_child("AnimationPlayer", true, false)
		if player == null:
			original.free()
			continue
		models += 1
		var compiled := ActorSkin3D.scene(source)
		check(compiled != source and compiled == ActorSkin3D.scene(source), file + " shares a compiled GPU rig")
		if compiled == source:
			original.free()
			continue
		var actor: Node3D = compiled.instantiate()
		root.add_child(original)
		root.add_child(actor)
		var rig: Skeleton3D = actor.get_node("Rig")
		var body: MeshInstance3D = actor.get_node("Body")
		var next: AnimationPlayer = actor.get_node("AnimationPlayer")
		var paths: PackedStringArray = actor.get_meta("part_paths")
		var vertices := 0
		var indices := 0
		var source_lods := 0
		for part: MeshInstance3D in original.find_children("*", "MeshInstance3D", true, false):
			for surface in part.mesh.get_surface_count():
				vertices += part.mesh.surface_get_array_len(surface)
				indices += part.mesh.surface_get_array_index_len(surface)
				source_lods += ActorSkin3D._source_lods(part.mesh, surface).size()
		check(body.mesh.get_surface_count() == 1 and body.mesh.surface_get_array_len(0) == vertices
			and body.mesh.surface_get_array_index_len(0) == indices, file + " retains every original vertex and triangle in one surface")
		check(source_lods == 0 or not ActorSkin3D._source_lods(body.mesh, 0).is_empty(), file + " retains imported distance details")
		var same := player.get_animation_list() == next.get_animation_list()
		var error := 0.0
		for clip in player.get_animation_list():
			var old := player.get_animation(clip)
			var fresh := next.get_animation(clip)
			same = same and old.length == fresh.length and old.get_track_count() == fresh.get_track_count()
			for track in old.get_track_count():
				same = same and old.track_get_key_count(track) == fresh.track_get_key_count(track)
			for fraction in [0.0, 0.35, 0.7, 1.0]:
				player.play(clip, 0.0)
				next.play(clip, 0.0)
				player.seek(old.length * fraction, true)
				next.seek(fresh.length * fraction, true)
				rig.force_update_all_bone_transforms()
				error = maxf(error, _difference(original, rig, paths))
				poses += 1
			# A half-finished transition must preserve the same limb/tool poses.
			var idle := "idle" if player.has_animation("idle") else "roll"
			player.play(idle, 0.0)
			next.play(idle, 0.0)
			player.seek(0.15, true)
			next.seek(0.15, true)
			player.play(clip, 0.12)
			next.play(clip, 0.12)
			player.advance(0.06)
			next.advance(0.06)
			rig.force_update_all_bone_transforms()
			error = maxf(error, _difference(original, rig, paths))
		maximum_error = maxf(maximum_error, error)
		check(same and error < 0.0001, "%s keeps all keys, poses and blends (error %.8f)" % [file, error])
		var peer: Node3D = compiled.instantiate()
		root.add_child(peer)
		check((peer.get_node("Body") as MeshInstance3D).mesh == body.mesh and peer.get_node("Rig") != rig,
			file + " shares geometry but keeps independent skeleton poses")
		peer.free()
		original.free()
		actor.free()
	check(models >= 30, "every animated troop and crew model was checked (%d)" % models)
	print("GODOT_SKINS ", JSON.stringify({"failures":failures,"models":models,"poses":poses,"maximum_pose_error":maximum_error}))
	quit(0 if failures.is_empty() else 1)


func _difference(original: Node3D, rig: Skeleton3D, paths: PackedStringArray) -> float:
	var error := 0.0
	for i in paths.size():
		var before: Transform3D = original.get_node(paths[i]).global_transform
		var after := rig.get_bone_global_pose(i)
		var delta := before.origin.distance_to(after.origin) + before.basis.x.distance_to(after.basis.x)
		delta += before.basis.y.distance_to(after.basis.y) + before.basis.z.distance_to(after.basis.z)
		error = maxf(error, delta)
	return error
