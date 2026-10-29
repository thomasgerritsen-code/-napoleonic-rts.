class_name AtlasLibrary
extends RefCounted
## The web game's Blender soldier atlases (graphics-lab/assets/sprites/iso) as
## SpriteFrames: one animation per state and direction ("march_se", "die_w").
## Each look is built once and shared by every soldier wearing it.

## Frames a second per state; the rest play once (firing, reloading, falling).
const SPEEDS := {"idle": 2.0, "march": 9.0, "aim": 3.0, "fire": 12.0, "reload": 5.0,
	"die": 7.0, "diefwd": 7.0, "dieside": 7.0}
const LOOPING := ["idle", "march", "aim"]
## Where a sprite's feet are in its cell.
const PIVOT := Vector2(88, 108)

static var _cache := {}


static func frames_for(look: String) -> SpriteFrames:
	if _cache.has(look):
		return _cache[look]
	var frames := SpriteFrames.new()
	frames.remove_animation("default")
	for part in ["infantry", "fallen"]:
		var base := "res://assets/units/%s_iso_%s_atlas" % [look, part]
		var data: Dictionary = Iso.read_json(base + ".json")
		var texture: Texture2D = load(base + ".webp")
		var rects: Dictionary = data["frames"]
		var animations: Dictionary = data["animations"]
		for anim: String in animations:
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
	_cache[look] = frames
	return frames
