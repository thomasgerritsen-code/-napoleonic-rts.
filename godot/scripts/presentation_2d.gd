class_name Presentation2D
extends RefCounted
## Only the chosen renderer runs. These nodes are presentation, not the
## shared battle simulation, visibility grid, weather rules, HUD or sound.


static func apply(battle: Battle, enabled: bool) -> void:
	var mode := Node.PROCESS_MODE_INHERIT if enabled else Node.PROCESS_MODE_DISABLED
	var units: Node2D = battle.get("_units_layer")
	units.y_sort_enabled = enabled
	# Keep shared data/tweens (felled trees, wounded men) alive. Only sprite
	# animation nodes are stopped; their parents also carry simulation data.
	for sprite: AnimatedSprite2D in units.find_children("*", "AnimatedSprite2D", true, false):
		sprite.process_mode = mode
		if not enabled:
			sprite.pause()
	var effects: Node2D = battle.get("_effects")
	if not enabled and not effects.has_meta("slept_at"):
		effects.set_meta("slept_at", Time.get_ticks_msec())
	battle.effects.process_mode = mode
	battle.lights.process_mode = mode
	if enabled and effects.has_meta("slept_at"):
		# Expire old puffs/flashes once, rather than resuming a frozen volley.
		var elapsed := (Time.get_ticks_msec() - int(effects.get_meta("slept_at"))) / 1000.0
		effects.remove_meta("slept_at")
		battle.effects._process(elapsed)
		battle.lights._process(elapsed)
	for child in battle.get_children():
		if child is DayNight or child is Fancy:
			child.process_mode = mode
			if child is Fancy:
				child.presentation_3d(not enabled)
			if child is DayNight:
				var light: CanvasModulate = child.get("_light")
				light.visible = enabled
				if enabled:
					child._process(0.0)
	battle.medics.set_process(enabled)
	battle.camera.presentation_3d(not enabled)
	for animal: Dictionary in battle.wildlife.animals:
		var sprite: AnimatedSprite2D = animal["sprite"]
		if enabled:
			battle.wildlife.call("_show", animal)
		else:
			sprite.pause()
	for teams: Array in battle.medics.teams.values():
		for team: FieldMedics.Team in teams:
			team.presentation_3d(not enabled)
