class_name Construction3D
extends Node3D
## Buildings rise through foundation/walls/roof rather than stretching in Y.
## Each active site has one reusable scaffold MultiMesh. Only the visual
## progress is eased; payment, workers and authoritative progress stay intact.

var battle: Battle
var view: View3D
var _sites := {}
var _cube := BoxMesh.new()
var _wood: ShaderMaterial


func _ready() -> void:
	_cube.size = Vector3.ONE
	var image := Image.create(1, 1, false, Image.FORMAT_RGBA8)
	image.fill(Color(0.34, 0.23, 0.13))
	_wood = view.field.fogged(ImageTexture.create_from_image(image))


func watch(b: Building, model: Node3D, height: float) -> void:
	if _sites.has(b) and (b.complete or not b.standing()):
		_finish(b)
	if _sites.has(b) or b.complete or not b.standing():
		return
	var materials: Array[ShaderMaterial] = []
	for mesh: MeshInstance3D in model.find_children("*", "MeshInstance3D", true, false):
		if mesh.material_override is ShaderMaterial:
			materials.append(mesh.material_override)
	var scaffold := MultiMeshInstance3D.new()
	scaffold.multimesh = MultiMesh.new()
	scaffold.multimesh.transform_format = MultiMesh.TRANSFORM_3D
	scaffold.multimesh.mesh = _cube
	scaffold.material_override = _wood
	scaffold.position = model.position
	add_child(scaffold)
	_sites[b] = {"model": model, "materials": materials, "height": height,
		"scaffold": scaffold, "progress": maxf(0.015, b.progress), "stage": -1}
	_update(b, _sites[b], 0.0)


func _process(delta: float) -> void:
	for b: Variant in _sites.keys():
		var site: Dictionary = _sites[b]
		if not is_instance_valid(b) or not is_instance_valid(site["model"]):
			(site["scaffold"] as Node).queue_free()
			_sites.erase(b)
			continue
		if b.complete or not b.standing():
			_finish(b)
			continue
		_update(b, site, delta)


func _finish(b: Building) -> void:
	var site: Dictionary = _sites[b]
	for mat: ShaderMaterial in site["materials"]:
		mat.set_shader_parameter("build_progress", 1.0)
	(site["scaffold"] as Node).queue_free()
	_sites.erase(b)


func _update(b: Building, site: Dictionary, delta: float) -> void:
	var model: Node3D = site["model"]
	var scaffold: MultiMeshInstance3D = site["scaffold"]
	var shown := lerpf(float(site["progress"]), b.progress, 1.0 - exp(-delta / 0.1))
	site["progress"] = shown
	scaffold.visible = b.visible
	for mat: ShaderMaterial in site["materials"]:
		mat.set_shader_parameter("build_progress", shown)
		mat.set_shader_parameter("build_base", model.position.y)
		mat.set_shader_parameter("build_height", site["height"])
	var stage := 0 if shown < 0.2 else (1 if shown < 0.55 else (2 if shown < 0.82 else 3))
	if stage != int(site["stage"]):
		site["stage"] = stage
		_scaffold(scaffold.multimesh, b.size / Iso.PPM * 1.45, float(site["height"]), stage)


func _scaffold(mm: MultiMesh, size: Vector2, height: float, stage: int) -> void:
	var beams: Array[Transform3D] = []
	var w := size.x * 0.55
	var d := size.y * 0.55
	var top := minf(height * (0.3 + stage * 0.23), 5.5)
	for x in [-w, w]:
		for z in [-d, d]:
			beams.append(Transform3D(Basis().scaled(Vector3(0.11, top, 0.11)), Vector3(x, top / 2.0, z)))
	for level in range(1, stage + 2):
		var y := top * level / float(stage + 1)
		for z in [-d, d]:
			beams.append(Transform3D(Basis().scaled(Vector3(w * 2.0, 0.1, 0.1)), Vector3(0, y, z)))
		for x in [-w, w]:
			beams.append(Transform3D(Basis().scaled(Vector3(0.1, 0.1, d * 2.0)), Vector3(x, y, 0)))
	# A working platform, braces and a ladder; shrinking timber stacks.
	for z in [-d, d]:
		beams.append(Transform3D(Basis().scaled(Vector3(w * 2.0 + 0.3, 0.08, 0.45)), Vector3(0, top - 0.1, z)))
		var diagonal := Vector3(w * 1.5, top * 0.8, 0)
		var rotation := Basis(Vector3.BACK, atan2(diagonal.y, diagonal.x))
		# Scale in the beam's local axes before rotating: global Y scaling
		# would flatten the diagonal into a horizontal bar.
		beams.append(Transform3D(rotation * Basis.from_scale(Vector3(diagonal.length(), 0.075, 0.075)), Vector3(0, top * 0.5, z)))
	for x in [-0.18, 0.18]:
		beams.append(Transform3D(Basis().scaled(Vector3(0.06, top + 0.4, 0.07)), Vector3(x, top * 0.5, d + 0.35)))
	for i in range(1, mini(12, ceili(top / 0.28))):
		beams.append(Transform3D(Basis().scaled(Vector3(0.4, 0.055, 0.065)), Vector3(0, i * 0.28, d + 0.35)))
	for i in range(4 - stage):
		beams.append(Transform3D(Basis().scaled(Vector3(1.1, 0.12, 0.18)), Vector3(w + 0.35, 0.1 + i * 0.13, 0)))
	mm.instance_count = beams.size()
	for i in beams.size():
		mm.set_instance_transform(i, beams[i])


func stats() -> Dictionary:
	var beams := 0
	for site: Dictionary in _sites.values():
		beams += (site["scaffold"] as MultiMeshInstance3D).multimesh.instance_count
	return {"sites": _sites.size(), "beams": beams}
