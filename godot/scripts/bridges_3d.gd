class_name Bridges3D
extends Node3D
## Static map infrastructure, independent of the hidden 2D bridge sprites.
## Two shared mesh/material batches; map angle, length and width stay exact.

const PROFILES := {"stone": ["bridge_stone", 12.8, 4.8, 1.25, 2.6, 0.04],
	"wood": ["bridge_wood", 12.0, 4.4, 1.0, 2.2, -0.005]}

var view: View3D
var _decks: Array[Dictionary] = []


func _ready() -> void:
	var groups := {}
	for crossing: Dictionary in Rules.start()["crossings"]:
		var profile: Array = PROFILES.get(crossing.get("material", "wood"), PROFILES["wood"])
		var model: String = profile[0]
		var centre := Vector2(crossing["x"], crossing["y"])
		var along := Vector2.from_angle(float(crossing.get("angle", 0.0)))
		var half := float(crossing["length"]) / 2.0
		var scale_x := float(crossing["length"]) / (float(profile[1]) * Iso.PPM)
		var scale_z := float(crossing["width"]) / (float(profile[2]) * Iso.PPM)
		var a := View3D.at(centre - along * half).y
		var b := View3D.at(centre + along * half).y
		var origin := View3D.at(centre)
		origin.y = (a + b) * 0.5 + 0.03
		var grade := (b - a) / (half * 2.0 / Iso.PPM)
		# The deck follows the grade between its bank-side ends. Scaling in
		# local axes preserves the crossing angle and its exact width.
		var basis := Basis(Vector3.UP, -along.angle()) * Basis.from_scale(Vector3(scale_x, scale_x, scale_z))
		basis.x.y = grade * scale_x
		if not groups.has(model):
			groups[model] = []
		groups[model].append(Transform3D(basis, origin))
		_decks.append({"centre": centre, "along": along, "half": half,
			"width": float(crossing["width"]) / 2.0, "origin": origin.y, "grade": grade,
			"height": float(profile[3]) * scale_x, "ramp": float(profile[4]) * scale_x * Iso.PPM,
			"surface": float(profile[5]) * scale_x})
	for model: String in groups:
		var mesh := view._mesh_of(model)
		if mesh == null:
			continue
		var node := MultiMeshInstance3D.new()
		node.name = model
		node.multimesh = MultiMesh.new()
		node.multimesh.transform_format = MultiMesh.TRANSFORM_3D
		node.multimesh.mesh = mesh
		node.multimesh.instance_count = groups[model].size()
		for i in groups[model].size():
			node.multimesh.set_instance_transform(i, groups[model][i])
		var material := mesh.surface_get_material(0) as StandardMaterial3D
		if material != null:
			node.material_override = view.field.fogged(material.albedo_texture, material.albedo_color)
		add_child(node)


## Presentation/picking height only; terrain, river and navigation are unchanged.
func surface_at(world: Vector2) -> Vector3:
	var p := View3D.at(world)
	for deck: Dictionary in _decks:
		var offset: Vector2 = world - deck["centre"]
		var along: Vector2 = deck["along"]
		var distance := offset.dot(along)
		if absf(distance) > float(deck["half"]) or absf(offset.dot(along.orthogonal())) > float(deck["width"]):
			continue
		var ramp := clampf((float(deck["half"]) - absf(distance)) / float(deck["ramp"]), 0.0, 1.0)
		var height := float(deck["origin"]) + float(deck["grade"]) * distance / Iso.PPM
		height += float(deck["height"]) * ramp + float(deck["surface"])
		p.y = maxf(p.y, height)
		break
	return p
