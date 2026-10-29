extends Control
## The start menu, as the web game's: a battle against the computer, or the
## test field where two large armies meet without economy.


func _ready() -> void:
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	var ground := TextureRect.new()
	ground.texture = load("res://assets/map/" + String(meta["image"]))
	ground.set_anchors_preset(Control.PRESET_FULL_RECT)
	ground.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	ground.modulate = Color(0.55, 0.55, 0.5)
	add_child(ground)
	var box := VBoxContainer.new()
	box.set_anchors_preset(Control.PRESET_CENTER)
	box.grow_horizontal = Control.GROW_DIRECTION_BOTH
	box.grow_vertical = Control.GROW_DIRECTION_BOTH
	box.add_theme_constant_override("separation", 14)
	add_child(box)
	var title := Label.new()
	title.text = "NAPOLEONIC RTS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 44)
	title.add_theme_color_override("font_color", Color(0.96, 0.9, 0.7))
	title.add_theme_color_override("font_outline_color", Color(0.08, 0.08, 0.06))
	title.add_theme_constant_override("outline_size", 8)
	box.add_child(title)
	_choice(box, "Veldslag tegen de computer", "Bouw een economie en een leger, en verover het Britse stadhuis.", "campaign")
	_choice(box, "Testveld", "Grote legers tegenover elkaar, zonder economie: probeer formaties en snelheid.", "lab")
	var quit_button := Button.new()
	quit_button.text = "Afsluiten"
	quit_button.custom_minimum_size = Vector2(420, 44)
	quit_button.pressed.connect(func() -> void: get_tree().quit())
	box.add_child(quit_button)


func _choice(box: VBoxContainer, text: String, note: String, mode: String) -> void:
	var button := Button.new()
	button.text = "%s\n%s" % [text, note]
	button.custom_minimum_size = Vector2(420, 64)
	button.add_theme_font_size_override("font_size", 15)
	button.pressed.connect(func() -> void:
		Battle.mode = mode
		get_tree().change_scene_to_file("res://scenes/main.tscn"))
	box.add_child(button)
