class_name Meadow3D
extends Node3D
## Bushes, ferns and stones scattered over the open grass of the 3D field,
## so a meadow is not one even lawn. Only where the grass grows full (the
## grass's own cover mask): not on roads, fields, water or under buildings,
## and a building put up later over one takes its place. Scenery only: the
## men walk through as through the grass. The same places every battle
## (a fixed seed, so two players online see one field), each kind drawn
## at once in one batch under the fog of war.

const SEED := 1813
const TRIES := 9000
const MOST := 700
const SPACING_M := 3.2
## Share of each kind, in order.
const KINDS := [["bush", 0.42], ["fern", 0.26], ["stone", 0.32]]

var view: View3D
## [kind, world point, MultiMesh, index, transform] per piece: tests, and the
## check against new buildings.
var pieces: Array = []
var _batches := {}
var _clock := 0.0


func _ready() -> void:
	var grass: Grass3D = view.grass
	var roads: Image = (load(RoadSurface3D.FIELD) as Texture2D).get_image()
	var rng := RandomNumberGenerator.new()
	rng.seed = SEED
	var chosen := {}        # kind -> Array of [world, transform]
	var taken: Array[Vector2] = []
	var size_m := Iso.WORLD / Iso.PPM
	for i in TRIES:
		if taken.size() >= MOST:
			break
		var m := Vector2(rng.randf_range(4.0, size_m.x - 4.0), rng.randf_range(4.0, size_m.y - 4.0))
		var pick := rng.randf()
		var yaw := rng.randf() * TAU
		var grow := rng.randf_range(0.7, 1.25)
		if not _open(grass, roads, m) or _crowded(taken, m):
			continue
		var kind := "stone"
		var total := 0.0
		for k: Array in KINDS:
			total += float(k[1])
			if pick <= total:
				kind = k[0]
				break
		var world := m * Iso.PPM
		if Nav.in_water(world):
			continue
		taken.append(m)
		if not chosen.has(kind):
			chosen[kind] = []
		var basis := Basis(Vector3.UP, yaw).scaled(Vector3.ONE * grow)
		if kind == "stone":
			# Stones lie half sunk, wider than high.
			basis = Basis(Vector3.UP, yaw).scaled(Vector3(grow, grow * 0.55, grow * rng.randf_range(0.7, 1.1)))
		chosen[kind].append([world, Transform3D(basis, view.surface_at(world) - Vector3.UP * (0.08 if kind == "stone" else 0.0))])
	for kind: String in chosen:
		_batch(kind, chosen[kind])


## Full grass here and a few metres round (no road, field, water's edge or
## building near).
func _open(grass: Grass3D, roads: Image, m: Vector2) -> bool:
	for d: Vector2 in [Vector2.ZERO, Vector2(2.5, 0), Vector2(-2.5, 0), Vector2(0, 2.5), Vector2(0, -2.5)]:
		var p := m + d
		var cx := int(p.x / Grass3D.MASK_CELL)
		var cy := int(p.y / Grass3D.MASK_CELL)
		if cx < 0 or cy < 0 or cx >= grass.cover.get_width() or cy >= grass.cover.get_height():
			return false
		if grass.cover.get_pixel(cx, cy).r < 0.75 or grass.blocked.get_pixel(cx, cy).r > 0.05:
			return false
	var rx := int(m.x / RoadSurface3D.CELL)
	var ry := int(m.y / RoadSurface3D.CELL)
	if rx >= 0 and ry >= 0 and rx < roads.get_width() and ry < roads.get_height():
		var road := roads.get_pixel(rx, ry)
		if minf(road.r - 0.5, road.g - 0.5) * 8.0 < 2.0:
			return false
	return true


func _crowded(taken: Array[Vector2], m: Vector2) -> bool:
	for t in taken:
		if t.distance_squared_to(m) < SPACING_M * SPACING_M:
			return true
	return false


func _batch(kind: String, list: Array) -> void:
	var mesh: Mesh
	var material: Material
	if kind == "stone":
		mesh = _stone()
		var image := Image.create(1, 1, false, Image.FORMAT_RGB8)
		image.fill(Color(0.47, 0.45, 0.41))
		material = view.field.fogged(ImageTexture.create_from_image(image), Color(1, 1, 1))
	else:
		mesh = view.call("_mesh_of", kind)
		if mesh == null:
			return
		var source := mesh.surface_get_material(0) as StandardMaterial3D
		if source != null and source.albedo_texture != null:
			material = view.field.fogged(source.albedo_texture, source.albedo_color, 0)
	var mm := MultiMesh.new()
	mm.transform_format = MultiMesh.TRANSFORM_3D
	mm.mesh = mesh
	mm.instance_count = list.size()
	for i in list.size():
		mm.set_instance_transform(i, list[i][1])
		pieces.append([kind, list[i][0], mm, i, list[i][1]])
	var node := MultiMeshInstance3D.new()
	node.name = kind.capitalize() + "s"
	node.multimesh = mm
	if material != null:
		node.material_override = material
	node.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(node)
	_batches[kind] = node


## A field stone: a low sphere pushed in and out, so no two faces agree.
func _stone() -> ArrayMesh:
	var sphere := SphereMesh.new()
	sphere.radius = 0.6
	sphere.height = 1.2
	sphere.radial_segments = 8
	sphere.rings = 5
	var arrays := sphere.get_mesh_arrays()
	var points: PackedVector3Array = arrays[Mesh.ARRAY_VERTEX]
	for i in points.size():
		var p := points[i]
		var k := 0.78 + Battle.hash01(int(roundf(p.x * 40.0)) + 97, int(roundf(p.y * 40.0 + p.z * 13.0))) * 0.4
		points[i] = p * k
	arrays[Mesh.ARRAY_VERTEX] = points
	var mesh := ArrayMesh.new()
	mesh.add_surface_from_arrays(Mesh.PRIMITIVE_TRIANGLES, arrays)
	var surface := SurfaceTool.new()
	surface.create_from(mesh, 0)
	surface.generate_normals()
	return surface.commit()


## A building put up over a bush or stone takes its place: every few
## seconds, the pieces now under the grass's building mask go.
func _process(delta: float) -> void:
	_clock -= delta
	if _clock > 0.0:
		return
	_clock = 2.0
	var grass: Grass3D = view.grass
	if grass == null or grass.blocked == null:
		return
	for piece: Array in pieces:
		var m: Vector2 = (piece[1] as Vector2) / Iso.PPM
		var cx := int(m.x / Grass3D.MASK_CELL)
		var cy := int(m.y / Grass3D.MASK_CELL)
		var gone := grass.blocked.get_pixel(clampi(cx, 0, grass.blocked.get_width() - 1), clampi(cy, 0, grass.blocked.get_height() - 1)).r > 0.05
		var mm: MultiMesh = piece[2]
		mm.set_instance_transform(piece[3], Transform3D(Basis().scaled(Vector3.ZERO), (piece[4] as Transform3D).origin) if gone else piece[4])


## How many of a kind stand (tests).
func count(kind: String) -> int:
	var n := 0
	for piece: Array in pieces:
		if piece[0] == kind:
			n += 1
	return n
