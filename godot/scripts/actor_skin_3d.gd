class_name ActorSkin3D
extends RefCounted
## Compile the original rigid-part Blender rig to one GPU-skinned mesh.
## No geometry, clips or keys are simplified. Immutable results are shared
## between actors and F3 views; only skeleton poses belong to an actor.

const SHADER := """shader_type spatial;
render_mode cull_disabled;
varying vec3 base;
varying vec3 finish;
varying vec3 glow;
vec3 linear_colour(vec3 c) {
 return mix(c/12.92,pow((c+vec3(0.055))/1.055,vec3(2.4)),step(vec3(0.04045),c));
}
void vertex() {
 base=CUSTOM1.xyz;
 finish=CUSTOM0.xyz;
 glow=CUSTOM2.xyz;
 // Match StandardMaterial3D: Compatibility shades in sRGB, while the
 // linear renderers decode source colours. Do not decode twice in GL.
 if (!OUTPUT_IS_SRGB) { base=linear_colour(base); glow=linear_colour(glow); }
 glow*=CUSTOM0.w;
 glow*=mix(vec3(1.0),base,CUSTOM1.w);
}
void fragment() {
 ALBEDO=base;
 ROUGHNESS=finish.x;
 METALLIC=finish.y;
 SPECULAR=finish.z;
 EMISSION=glow;
}
"""

static var _cache := {}
static var _material: ShaderMaterial


static func scene(source: PackedScene) -> PackedScene:
	if source == null:
		return null
	var key := source.resource_path
	if _cache.has(key):
		return _cache[key]
	var compiled := _compile(source)
	_cache[key] = compiled if compiled != null else source
	return _cache[key]


static func _compile(source: PackedScene) -> PackedScene:
	var original: Node3D = source.instantiate()
	var player: AnimationPlayer = original.find_child("AnimationPlayer", true, false)
	var parts := original.find_children("*", "MeshInstance3D", true, false)
	if player == null or parts.is_empty() or not _supported(original, player, parts):
		original.free()
		return null
	var nodes: Array[Node3D] = [original]
	for child: Node3D in original.find_children("*", "Node3D", true, false):
		nodes.append(child)
	var result := Node3D.new()
	result.name = original.name
	var rig := Skeleton3D.new()
	rig.name = "Rig"
	result.add_child(rig)
	rig.owner = result
	var ids := {}
	var paths := PackedStringArray()
	var skin := Skin.new()
	for i in nodes.size():
		var node := nodes[i]
		ids[node] = i
		paths.append(String(original.get_path_to(node)))
		rig.add_bone("part_%03d" % i)
		if node != original:
			rig.set_bone_parent(i, ids[node.get_parent()])
		# Local source vertices use a rigid bone with identity inverse bind.
		# This also preserves zero-scale hidden tools/flashes without trying
		# to invert their singular rest transforms.
		rig.set_bone_rest(i, Transform3D.IDENTITY)
		rig.set_bone_pose_position(i, node.position)
		rig.set_bone_pose_rotation(i, Quaternion.from_euler(node.rotation))
		rig.set_bone_pose_scale(i, node.scale)
		skin.add_bind(i, Transform3D.IDENTITY)
	var body := MeshInstance3D.new()
	body.name = "Body"
	body.mesh = _mesh(parts, ids)
	if body.mesh.get_surface_count() == 0:
		body.free()
		result.free()
		original.free()
		return null
	body.skin = skin
	body.skeleton = NodePath("../Rig")
	# Godot derives the moving bounds from each bone's vertices. A large
	# custom bound would unnecessarily render extra shadow cascades.
	result.add_child(body)
	body.owner = result
	var animation := AnimationPlayer.new()
	animation.name = "AnimationPlayer"
	result.add_child(animation)
	animation.owner = result
	var source_root := player.get_node(player.root_node)
	for library_name in player.get_animation_library_list():
		var library := AnimationLibrary.new()
		var old := player.get_animation_library(library_name)
		for clip_name in old.get_animation_list():
			var clip := old.get_animation(clip_name).duplicate(true) as Animation
			for track in clip.get_track_count():
				var target := source_root.get_node(NodePath(clip.track_get_path(track).get_concatenated_names()))
				clip.track_set_path(track, NodePath("Rig:%s" % rig.get_bone_name(ids[target])))
			library.add_animation(clip_name, clip)
		animation.add_animation_library(library_name, library)
	result.set_meta("part_paths", paths)
	result.set_meta("source_meshes", parts.size())
	result.set_meta("source_model", source.resource_path)
	var packed := PackedScene.new()
	var error := packed.pack(result)
	result.free()
	original.free()
	return packed if error == OK else null


static func _supported(original: Node3D, player: AnimationPlayer, parts: Array[Node]) -> bool:
	var animation_root := player.get_node(player.root_node)
	for name_ in player.get_animation_list():
		var clip := player.get_animation(name_)
		for i in clip.get_track_count():
			if clip.track_get_type(i) not in [Animation.TYPE_POSITION_3D, Animation.TYPE_ROTATION_3D, Animation.TYPE_SCALE_3D]:
				return false
			var path := clip.track_get_path(i)
			if path.get_subname_count() != 0 or not animation_root.get_node_or_null(NodePath(path.get_concatenated_names())) is Node3D:
				return false
	for part: MeshInstance3D in parts:
		if part.skin != null or not part.mesh is ArrayMesh:
			return false
		for i in part.mesh.get_surface_count():
			var material := part.get_active_material(i) as StandardMaterial3D
			if material == null or material.albedo_texture != null or material.vertex_color_use_as_albedo \
				or material.cull_mode != BaseMaterial3D.CULL_DISABLED or material.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED \
				or material.shading_mode != BaseMaterial3D.SHADING_MODE_PER_PIXEL:
				return false
			if part.mesh.surface_get_primitive_type(i) != Mesh.PRIMITIVE_TRIANGLES:
				return false
	return original != null


static func _mesh(parts: Array[Node], ids: Dictionary) -> ArrayMesh:
	var vertices := PackedVector3Array()
	var normals := PackedVector3Array()
	var colours := PackedFloat32Array()
	var bones := PackedInt32Array()
	var weights := PackedFloat32Array()
	var finish := PackedFloat32Array()
	var glow := PackedFloat32Array()
	var indices := PackedInt32Array()
	var pieces: Array[Dictionary] = []
	for part: MeshInstance3D in parts:
		for surface in part.mesh.get_surface_count():
			var data := part.mesh.surface_get_arrays(surface)
			var positions: PackedVector3Array = data[Mesh.ARRAY_VERTEX]
			var directions: PackedVector3Array = data[Mesh.ARRAY_NORMAL]
			var material := part.get_active_material(surface) as StandardMaterial3D
			var colour := material.albedo_color
			var emission := Color.BLACK
			if material.emission_enabled:
				emission = material.emission
			var offset := vertices.size()
			vertices.append_array(positions)
			normals.append_array(directions)
			for i in positions.size():
				colours.append_array(PackedFloat32Array([colour.r, colour.g, colour.b, float(material.emission_operator)]))
				bones.append_array(PackedInt32Array([ids[part], 0, 0, 0]))
				weights.append_array(PackedFloat32Array([1, 0, 0, 0]))
				finish.append_array(PackedFloat32Array([material.roughness, material.metallic, material.metallic_specular, material.emission_energy_multiplier]))
				glow.append_array(PackedFloat32Array([emission.r, emission.g, emission.b]))
			var local_indices := PackedInt32Array()
			if data[Mesh.ARRAY_INDEX] != null and not data[Mesh.ARRAY_INDEX].is_empty():
				local_indices = data[Mesh.ARRAY_INDEX]
			else:
				for i in positions.size():
					local_indices.append(i)
			for index in local_indices:
				indices.append(offset + index)
			pieces.append({"indices": local_indices, "offset": offset, "lods": _source_lods(part.mesh, surface)})
	var arrays := []
	arrays.resize(Mesh.ARRAY_MAX)
	arrays[Mesh.ARRAY_VERTEX] = vertices
	arrays[Mesh.ARRAY_NORMAL] = normals
	arrays[Mesh.ARRAY_BONES] = bones
	arrays[Mesh.ARRAY_WEIGHTS] = weights
	arrays[Mesh.ARRAY_CUSTOM0] = finish
	arrays[Mesh.ARRAY_CUSTOM1] = colours
	arrays[Mesh.ARRAY_CUSTOM2] = glow
	arrays[Mesh.ARRAY_INDEX] = indices
	var flags := (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM0_SHIFT) | (Mesh.ARRAY_CUSTOM_RGBA_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM1_SHIFT) \
		| (Mesh.ARRAY_CUSTOM_RGB_FLOAT << Mesh.ARRAY_FORMAT_CUSTOM2_SHIFT)
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays, [], _merged_lods(pieces), flags)
	if mesh.get_surface_count() == 0:
		return mesh
	if _material == null:
		var shader := Shader.new()
		shader.code = SHADER
		_material = ShaderMaterial.new()
		_material.shader = shader
	mesh.surface_set_material(0, _material)
	return mesh


static func _source_lods(mesh: ArrayMesh, surface: int) -> Dictionary:
	# ArrayMesh exposes its imported LOD index buffers in its serialized
	# surface property. Unlike the RenderingServer query this also works in
	# headless imports. Checked in both the 4.6 and 4.7 regression gates.
	var surfaces: Array = mesh.get("_surfaces")
	var stored: Array = surfaces[surface].get("lods", [])
	var result := {}
	var wide := mesh.surface_get_array_len(surface) > 65536
	for i in range(0, stored.size(), 2):
		var bytes: PackedByteArray = stored[i + 1]
		var indices := PackedInt32Array()
		if wide:
			indices = bytes.to_int32_array()
		else:
			indices.resize(bytes.size() / 2)
			for j in indices.size():
				indices[j] = bytes.decode_u16(j * 2)
		result[float(stored[i])] = indices
	return result


static func _merged_lods(pieces: Array[Dictionary]) -> Dictionary:
	var errors := {}
	for piece in pieces:
		for threshold: float in piece["lods"]:
			errors[threshold] = true
	var sorted: Array = errors.keys()
	sorted.sort()
	var selected := []
	var count := mini(16, sorted.size())
	for i in count:
		selected.append(sorted[roundi(i * float(sorted.size() - 1) / maxf(1.0, count - 1.0))])
	var result := {}
	for threshold: float in selected:
		var merged := PackedInt32Array()
		for piece in pieces:
			var best: PackedInt32Array = piece["indices"]
			var error := 0.0
			for candidate: float in piece["lods"]:
				if candidate <= threshold and candidate > error:
					error = candidate
					best = piece["lods"][candidate]
			for index in best:
				merged.append(int(piece["offset"]) + index)
		# Between levels a part stays at least as detailed as its original
		# imported LOD. The full close-up mesh is completely unchanged.
		result[threshold] = merged
	return result
