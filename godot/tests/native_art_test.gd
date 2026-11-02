extends SceneTree
## Original Blender buildings and troop silhouettes, mesh budgets and wiring.

const BUILDINGS := ["foundry_fr", "foundry_br", "chapel", "inn"]
const TROOPS := ["infantry2_fr", "infantry3_fr", "infantry4_fr", "infantry5_fr", "infantry6_fr", "infantry7_fr",
	"infantry2_br", "infantry3_br", "infantry4_br", "infantry5_br", "infantry6_br", "mounted_fr", "mounted_br",
	"cuirassier_fr", "lancer_fr", "greys_br"]
var failures: Array[String] = []


func check(ok: bool, message: String) -> void:
	print("ok   " if ok else "FAIL ", message)
	if not ok:
		failures.append(message)


func _initialize() -> void:
	var total_bytes := 0
	var heights := {}
	for name_: String in BUILDINGS:
		var path := "res://assets3d/%s.glb" % name_
		var scene: PackedScene = load(path)
		if scene == null:
			check(false, name_ + " exists")
			continue
		var model := scene.instantiate()
		var meshes := model.find_children("*", "MeshInstance3D", true, false)
		check(meshes.size() == 1, name_ + " uses one combined Blender mesh")
		var mesh: Mesh = (meshes[0] as MeshInstance3D).mesh
		var material: StandardMaterial3D = mesh.surface_get_material(0)
		check(mesh.get_surface_count() == 1 and material != null and material.albedo_texture != null
			and material.albedo_texture.get_width() <= 1024, name_ + " shares one bounded baked texture")
		heights[name_] = mesh.get_aabb().size.y
		total_bytes += FileAccess.get_file_as_bytes(path).size()
		model.free()
	check(float(heights["chapel"]) > float(heights["inn"]) and float(heights["foundry_fr"]) > 6.0,
		"the chapel steeple and foundry chimney have distinct original silhouettes")
	for name_: String in TROOPS:
		var path := "res://assets3d/%s.glb" % name_
		var scene: PackedScene = load(path)
		if scene == null:
			check(false, name_ + " exists")
			continue
		var model := scene.instantiate()
		var player: AnimationPlayer = model.find_child("AnimationPlayer", true, false)
		var horse := name_.begins_with("mounted") or name_.begins_with("cuirassier") or name_.begins_with("lancer") or name_.begins_with("greys")
		check(player != null and player.has_animation("idle") and player.has_animation("die")
			and player.has_animation("gallop" if horse else "march") and player.has_animation("slash" if horse else "thrust"),
			name_ + " retains its full movement and combat animation rig")
		total_bytes += FileAccess.get_file_as_bytes(path).size()
		model.free()
	check(total_bytes < 12 * 1024 * 1024, "all twenty new models fit within a 12 MiB download budget (%d bytes)" % total_bytes)
	var view := View3D.new()
	for spec: Array in [["france", "grenadier", "infantry4_fr"], ["france", "voltigeur", "infantry5_fr"],
		["france", "guard", "infantry6_fr"], ["france", "sapper", "infantry7_fr"], ["britain", "rifle", "infantry6_br"]]:
		var u := Unit.new()
		u.side = spec[0]
		u.type = "infantry"
		u.troop = spec[1]
		check(view._model_for(u) == spec[2], "%s %s wears its actual 3D uniform" % [spec[0], spec[1]])
		u.free()
	check(View3D.HOUSES["chapel"] == "chapel" and View3D.HOUSES["inn"] == "inn",
		"village churches and inns use their own models")
	view.free()
	print("GODOT_ART ", JSON.stringify({"models": BUILDINGS.size() + TROOPS.size(), "bytes": total_bytes, "failures": failures}))
	quit(0 if failures.is_empty() else 1)
