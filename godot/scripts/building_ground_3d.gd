class_name BuildingGround3D
extends Node3D
## Level a building's actual base against its whole terrain footprint. Stone
## skirts close downhill gaps in two shared meshes (village/player buildings).
## Only creation/layout/visibility changes rebuild them; gameplay stays put.

const CLEARANCE := 0.035
const SAMPLE_STEP := 0.55
var view: View3D
var villages: Array[Dictionary] = []
var _bounds := {}
var _static := MeshInstance3D.new()
var _dynamic := MeshInstance3D.new()
var _key := ""


func _ready() -> void:
	_static.name = "VillageFoundations"
	_dynamic.name = "BuildingFoundations"
	var image := Image.create(64,64,false,Image.FORMAT_RGBA8)
	for y in 64:
		for x in 64:
			var row := y/16
			var col := posmod(x+(8 if row%2 else 0),64)/16
			var mortar := y%16<2 or posmod(x+(8 if row%2 else 0),16)<2
			var shade := 0.94+Battle.hash01(col,row)*0.12
			image.set_pixel(x,y,Color(0.32,0.32,0.28) if mortar else Color(0.50,0.49,0.43)*shade)
	image.generate_mipmaps()
	var texture := ImageTexture.create_from_image(image)
	var material := view.field.fogged(texture)
	_static.material_override = material
	_dynamic.material_override = material
	add_child(_static)
	add_child(_dynamic)


func footprint(mesh: Mesh) -> AABB:
	var id := mesh.get_instance_id()
	if _bounds.has(id):
		return _bounds[id]
	var box := mesh.get_aabb()
	var first := true
	var base := AABB()
	# Roof overhangs do not decide where the walls meet the ground.
	for surface in mesh.get_surface_count():
		for vertex: Vector3 in mesh.surface_get_arrays(surface)[Mesh.ARRAY_VERTEX]:
			if vertex.y<=box.position.y+0.30:
				if first:
					base = AABB(vertex,Vector3.ZERO)
					first = false
				else:
					base = base.expand(vertex)
	_bounds[id] = base if not first else box
	return _bounds[id]


func fit(mesh: Mesh,original: Transform3D) -> Transform3D:
	var box := footprint(mesh)
	var points := corners(mesh,original)
	var inverse := original.affine_inverse()
	var low := Vector2(INF,INF)
	var high_bound := Vector2(-INF,-INF)
	var high := -INF
	for p in points:
		var at := View3D.flat(p)
		low = low.min(at)
		high_bound = high_bound.max(at)
		high = maxf(high,view.field.banks.height_at(at))
	# A piecewise-planar terrain maximum occurs at a grid vertex, footprint
	# corner or the intersection of its edge with a terrain triangle edge.
	var step := RiverBanks3D.STEP/RiverBanks3D.SUBDIVISIONS
	for x in range(ceili(low.x/step),floori(high_bound.x/step)+1):
		for z in range(ceili(low.y/step),floori(high_bound.y/step)+1):
			var at := Vector2(x,z)*step
			var local := inverse*Vector3(at.x/Iso.PPM,0,at.y/Iso.PPM)
			if local.x>=box.position.x and local.x<=box.end.x and local.z>=box.position.z and local.z<=box.end.z:
				high = maxf(high,view.field.banks.height_at(at))
	for i in 4:
		var a := View3D.flat(points[i])
		var b := View3D.flat(points[(i+1)%4])
		for axis: Vector2 in [Vector2.RIGHT,Vector2.DOWN,Vector2.ONE]:
			var start := a.dot(axis)
			var end := b.dot(axis)
			if absf(end-start)<0.0001:
				continue
			for line in range(ceili(minf(start,end)/step),floori(maxf(start,end)/step)+1):
				var t := (line*step-start)/(end-start)
				high = maxf(high,view.field.banks.height_at(a.lerp(b,t)))
	var placed := original
	placed.origin.y = high+CLEARANCE-box.position.y*original.basis.y.length()
	return placed


func village(mesh: Mesh,original: Transform3D,model: String) -> Transform3D:
	var placed := fit(mesh,original)
	villages.append({"mesh":mesh,"original":original,"transform":placed,"model":model})
	return placed


func finish_villages() -> void:
	if villages.is_empty():
		_static.mesh = null
		return
	var surface := _surface()
	for item in villages:
		append_support(surface,item["mesh"],item["transform"])
	surface.generate_normals()
	_static.mesh = surface.commit()


func sync_buildings(halls: Dictionary) -> void:
	var key := ""
	for b: Variant in halls:
		if not is_instance_valid(b) or not is_instance_valid(halls[b]):
			continue
		var node: Node3D = halls[b]
		if is_instance_valid(b) and b.visible and b.standing() and b.type!="farm":
			key += "%d:%s;" % [b.id,node.get_meta("model")]
	if key == _key:
		return
	_key = key
	var surface := _surface()
	var count := 0
	for b: Variant in halls:
		if not is_instance_valid(b) or not is_instance_valid(halls[b]):
			continue
		var node: Node3D = halls[b]
		if is_instance_valid(b) and b.visible and b.standing() and b.type!="farm":
			append_support(surface,view._mesh_of(node.get_meta("model")),node.transform)
			count += 1
	if count>0:
		surface.generate_normals()
		_dynamic.mesh = surface.commit()
	else:
		_dynamic.mesh = null


func _surface() -> SurfaceTool:
	var surface := SurfaceTool.new()
	surface.begin(Mesh.PRIMITIVE_TRIANGLES)
	return surface


func append_support(surface: SurfaceTool,mesh: Mesh,pose: Transform3D) -> void:
	var points := corners(mesh,pose)
	for edge in 4:
		var a := points[edge]
		var b := points[(edge+1)%4]
		var length := a.distance_to(b)
		var parts := maxi(1,ceili(length/SAMPLE_STEP))
		for i in parts:
			var p := a.lerp(b,float(i)/parts)
			var q := a.lerp(b,float(i+1)/parts)
			var low_p := Vector3(p.x,view.field.banks.height_at(View3D.flat(p))-0.06,p.z)
			var low_q := Vector3(q.x,view.field.banks.height_at(View3D.flat(q))-0.06,q.z)
			for v: Vector3 in [p,low_p,q,q,low_p,low_q]:
				var u := (v-a).dot((b-a).normalized())
				surface.set_uv(Vector2(u,v.y))
				surface.add_vertex(v)
	# A shallow cap joins the original model's base; side bottoms follow slope.
	for index in [0,1,2,0,2,3]:
		var p := points[index]
		surface.set_uv(Vector2(p.x,p.z))
		surface.add_vertex(p-Vector3.UP*0.004)


func corners(mesh: Mesh,pose: Transform3D) -> Array[Vector3]:
	var box := footprint(mesh)
	var points: Array[Vector3] = []
	for offset: Vector2 in [Vector2(0,0),Vector2(1,0),Vector2(1,1),Vector2(0,1)]:
		points.append(pose*Vector3(box.position.x+box.size.x*offset.x,box.position.y,box.position.z+box.size.z*offset.y))
	return points


func pick(screen: Vector2,halls: Dictionary) -> Building:
	var origin := view.camera.project_ray_origin(screen)
	var direction := view.camera.project_ray_normal(screen)
	var nearest := INF
	var selected: Building = null
	for b: Variant in halls:
		if not is_instance_valid(b) or not is_instance_valid(halls[b]):
			continue
		var node: Node3D = halls[b]
		if not is_instance_valid(b) or not b.visible or not b.standing() or b.side!=view.battle.me:
			continue
		var mesh := view._mesh_of(node.get_meta("model"))
		var inverse := node.global_transform.affine_inverse()
		var box := mesh.get_aabb()
		var top := box.end.y
		# Clicking the exposed footing should pick the building as well.
		for point in corners(mesh,node.global_transform):
			var bottom := point
			bottom.y = view.field.banks.height_at(View3D.flat(point))-0.06
			box.position.y = minf(box.position.y,(inverse*bottom).y)
		box.size.y = top-box.position.y
		var hit: Variant = box.intersects_ray(inverse*origin,inverse.basis*direction)
		if hit != null:
			var distance := origin.distance_to(node.global_transform*hit)
			if distance<nearest:
				nearest = distance
				selected = b
	return selected
