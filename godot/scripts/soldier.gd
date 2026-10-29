class_name Soldier
extends Node2D
## One musketeer. He walks to the place his regiment gives him, and in a fight
## faces the enemy and repeats aim, fire and reload. The regiment decides where
## he stands and whom the regiment fights; the battle resolves his shots.

signal fired(soldier: Soldier)

enum State { IDLE, MARCH, AIM, FIRE, RELOAD, DEAD }

const SPEED := 57.0          # game px a second (the web game's infantry)
const ROUT_SPEED := 80.0
const AIM_TIME := Vector2(0.6, 1.6)
const RELOAD_TIME := Vector2(4.5, 6.5)

var side := "france"
var regiment: Regiment
var world := Vector2.ZERO
var slot := Vector2.ZERO     # where the regiment wants him
var facing := 0.0
var hp := 100.0
var state := State.IDLE
var selected := false:
	set(value):
		if value != selected:
			selected = value
			queue_redraw()

var _sprite: AnimatedSprite2D
var _anim := ""
var _clock := 0.0


func setup(side_: String, look: String, at: Vector2, face: float) -> void:
	side = side_
	world = at
	slot = at
	facing = face
	_sprite = AnimatedSprite2D.new()
	_sprite.sprite_frames = AtlasLibrary.frames_for(look)
	_sprite.centered = false
	_sprite.offset = -AtlasLibrary.PIVOT
	_sprite.scale = Vector2.ONE * Iso.SPRITE_SCALE
	add_child(_sprite)
	position = Iso.to_screen(world)
	_play("idle")
	_sprite.frame = randi() % 2


func alive() -> bool:
	return state != State.DEAD


func step(delta: float, enemy_at: Variant) -> void:
	if state == State.DEAD:
		return
	var routing := regiment != null and regiment.routing
	var to_slot := slot - world
	var far := to_slot.length() > 3.0
	if far:
		var speed := ROUT_SPEED if routing else SPEED
		world += to_slot.limit_length(speed * delta)
		facing = to_slot.angle()
		position = Iso.to_screen(world)
		if state != State.MARCH:
			state = State.MARCH
		_play("march")
		return
	if enemy_at == null or routing:
		if regiment != null:
			facing = regiment.facing
		state = State.IDLE
		_play("idle")
		return
	# In the fight: face the enemy and keep the firing cycle going.
	facing = (Vector2(enemy_at) - world).angle()
	_clock -= delta
	match state:
		State.IDLE, State.MARCH:
			state = State.AIM
			_clock = randf_range(AIM_TIME.x, AIM_TIME.y)
			_play("aim")
		State.AIM:
			_play("aim")
			if _clock <= 0.0:
				state = State.FIRE
				_clock = 0.3
				_play("fire", true)
				fired.emit(self)
		State.FIRE:
			if _clock <= 0.0:
				state = State.RELOAD
				_clock = randf_range(RELOAD_TIME.x, RELOAD_TIME.y)
				_play("reload", true)
		State.RELOAD:
			if _clock <= 0.0:
				state = State.AIM
				_clock = randf_range(AIM_TIME.x, AIM_TIME.y)
				_play("aim")


func hit(damage: float) -> void:
	if state == State.DEAD:
		return
	hp -= damage
	if hp > 0.0:
		return
	state = State.DEAD
	selected = false
	_play(["die", "diefwd", "dieside"].pick_random(), true)
	# The fallen lie under the living.
	z_index = -1
	if regiment != null:
		regiment.lost(self)


## Where the muzzle flash and smoke appear, in world space.
func muzzle() -> Vector2:
	return world + Vector2.from_angle(facing) * 14.0


func _play(state_name: String, restart := false) -> void:
	var anim := "%s_%s" % [state_name, Iso.direction(facing)]
	if anim == _anim and not restart:
		return
	_anim = anim
	_sprite.play(anim)


func _draw() -> void:
	if not selected:
		return
	var color := Color(0.45, 0.65, 1.0, 0.9) if side == "france" else Color(1.0, 0.45, 0.4, 0.9)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2(1.0, Iso.SQ))
	draw_arc(Vector2.ZERO, 8.0, 0.0, TAU, 24, color, 1.6)
