class_name AtlasLibrary
extends RefCounted
## The web game's Blender sprite atlases (graphics-lab/assets/sprites/iso) as
## SpriteFrames: one animation per state and direction ("march_se", "die_w").
## A set joins atlases drawn on the same cell (a soldier and his fall, a
## horseman and his fight) and is built once, shared by everyone wearing it.

## Frames a second per state; the states not listed in LOOPING play once.
const SPEEDS := {"idle": 2.0, "march": 9.0, "aim": 3.0, "fire": 12.0, "reload": 5.0,
	"die": 7.0, "diefwd": 7.0, "dieside": 7.0, "work": 6.0, "farm": 5.0, "mine": 6.0,
	"build": 6.0, "command": 3.0, "walk": 8.0, "trot": 11.0, "gallop": 13.0, "slash": 9.0,
	"rear": 4.0, "roll": 8.0, "dig": 3.6, "rest": 0.7, "rfire": 7.0}
const LOOPING := ["idle", "march", "aim", "work", "farm", "mine", "build", "command",
	"walk", "trot", "gallop", "roll", "dig", "rest"]

static var _cache := {}


static func clear() -> void:
	_cache.clear()


## {frames: SpriteFrames, pivot: Vector2} for atlases like ["fr_iso_infantry", "fr_iso_fallen"].
static func get_set(names: Array) -> Dictionary:
	var key := "+".join(names)
	if _cache.has(key):
		return _cache[key]
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	var pivot := Vector2.ZERO
	for atlas_name: String in names:
		var base := "res://assets/units/%s_atlas" % atlas_name
		var data: Dictionary = Iso.read_json(base + ".json")
		var texture: Texture2D = load(base + ".webp")
		if pivot == Vector2.ZERO:
			var p: Dictionary = data["meta"]["pivot"]
			pivot = Vector2(p["x"], p["y"])
		var rects: Dictionary = data["frames"]
		var animations: Dictionary = data["animations"]
		for anim: String in animations:
			if frames.has_animation(anim):
				continue
			var state := anim.get_slice("_", 0)
			frames.add_animation(anim)
			frames.set_animation_speed(anim, SPEEDS.get(state, 6.0))
			frames.set_animation_loop(anim, state in LOOPING)
			for frame_name: String in animations[anim]:
				var r: Dictionary = rects[frame_name]["frame"]
				var region := AtlasTexture.new()
				region.atlas = texture
				region.region = Rect2(r["x"], r["y"], r["w"], r["h"])
				frames.add_frame(anim, region)
	var result := {"frames": frames, "pivot": pivot}
	_cache[key] = result
	return result
