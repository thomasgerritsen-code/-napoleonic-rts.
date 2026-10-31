extends Control
## The start menu: first a choice between Singleplayer, Multiplayer and
## Updates, each on its own page with a way back.
## - Singleplayer: a battle against the computer, or the test field where two
##   large armies meet without economy (as the web game's menu).
## - Multiplayer: one hosts (as France or Britain) and waits, the other joins
##   with the host's address and plays the other side; it starts once both are
##   there. A player who left can join again while the host's battle runs.
## - Updates: this version, and the newest on GitHub to update to.

var _online_note: Label
var _address: LineEdit
var _updater: Updater
var _update_note: Label
var _update_button: Button
var _remote: Dictionary = {}
var _pages := {}                 # name -> VBoxContainer
var _updates_button: Button
var _version_line: Label
var _load_button: Button


func _ready() -> void:
	# Back from an online battle: the line is closed.
	var old := NetLink.find(get_tree())
	if old != null:
		old.close()
		old.queue_free()
	Battle.online_role = ""
	var meta: Dictionary = Iso.read_json("res://assets/map/ground.json")
	var ground := TextureRect.new()
	ground.texture = load("res://assets/map/" + String(meta["image"]))
	ground.set_anchors_preset(Control.PRESET_FULL_RECT)
	ground.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	ground.modulate = Color(0.55, 0.55, 0.5)
	add_child(ground)
	var frame := VBoxContainer.new()
	frame.set_anchors_preset(Control.PRESET_CENTER)
	frame.grow_horizontal = Control.GROW_DIRECTION_BOTH
	frame.grow_vertical = Control.GROW_DIRECTION_BOTH
	frame.add_theme_constant_override("separation", 18)
	add_child(frame)
	var title := Label.new()
	title.text = "NAPOLEONIC RTS"
	title.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	title.add_theme_font_size_override("font_size", 44)
	title.add_theme_color_override("font_color", Color(0.96, 0.9, 0.7))
	title.add_theme_color_override("font_outline_color", Color(0.08, 0.08, 0.06))
	title.add_theme_constant_override("outline_size", 8)
	frame.add_child(title)
	for page in ["start", "single", "multi", "updates"]:
		var box := VBoxContainer.new()
		box.add_theme_constant_override("separation", 14)
		box.custom_minimum_size = Vector2(420, 0)
		frame.add_child(box)
		_pages[page] = box

	var start: VBoxContainer = _pages["start"]
	_page_button(start, "Singleplayer\nTegen de computer, of het testveld", "single")
	_page_button(start, "Multiplayer\nOnline tegen een andere speler", "multi")
	_updates_button = _page_button(start, "Updates\nVersie en bijwerken", "updates")
	var quit_button := Button.new()
	quit_button.text = "Afsluiten"
	quit_button.custom_minimum_size = Vector2(420, 44)
	quit_button.pressed.connect(func() -> void: get_tree().quit())
	start.add_child(quit_button)
	_version_line = _note(start)
	_version_line.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_version_line.text = "Versie: %s" % Updater.label(Updater.current())

	var single: VBoxContainer = _pages["single"]
	_heading(single, "Singleplayer")
	Battle.fancy = false
	Battle.view_3d = false
	_choice(single, "Veldslag tegen de computer", "Bouw een economie en een leger, en verover het Britse stadhuis.", "campaign")
	_choice(single, "Testveld", "Grote legers tegenover elkaar, zonder economie: probeer formaties en snelheid.", "lab")
	_proof_button(single, "Veldslag in 3D", "De veldslag tegen de computer in 3D (F3 wisselt tijdens het spel tussen 2D en 3D).", func() -> void:
		Battle.view_3d = true
		Battle.mode = "campaign"
		get_tree().change_scene_to_file("res://scenes/main.tscn"))
	_proof_button(single, "Proef: verbeterd 2D", "Zon die met het uur meedraait, bewegend water, wuivende bomen, wolkenschaduw.", func() -> void:
		Battle.fancy = true
		Battle.mode = "campaign"
		get_tree().change_scene_to_file("res://scenes/main.tscn"))
	_proof_button(single, "Proef: 3D-graphics", "Een stuk van de kaart in 3D met de Blender-modellen: draai en kantel de camera.", func() -> void:
		get_tree().change_scene_to_file("res://proof3d/proof_3d.tscn"))
	_load_button = Button.new()
	_load_button.custom_minimum_size = Vector2(420, 64)
	_load_button.add_theme_font_size_override("font_size", 15)
	_load_button.pressed.connect(func() -> void: Battle.load_saved(get_tree()))
	single.add_child(_load_button)
	_show_saved()
	_back(single)

	var multi: VBoxContainer = _pages["multi"]
	_heading(multi, "Multiplayer")
	_online(multi)
	_back(multi)

	var updates: VBoxContainer = _pages["updates"]
	_heading(updates, "Updates")
	_update_row(updates)
	_back(updates)
	_show("start")


## The saved battle, if there is one, to take up again (F5 in a battle saves it).
func _show_saved() -> void:
	var when := SaveGame.describe()
	_load_button.disabled = when == ""
	_load_button.text = "Opgeslagen slag laden\n%s" % (when if when != "" else "nog niets opgeslagen (F5 in een slag)")


func _proof_button(box: VBoxContainer, text: String, note: String, action: Callable) -> void:
	var button := Button.new()
	button.text = "%s\n%s" % [text, note]
	button.custom_minimum_size = Vector2(420, 56)
	button.add_theme_font_size_override("font_size", 13)
	button.pressed.connect(action)
	box.add_child(button)


func _show(page: String) -> void:
	for key: String in _pages:
		(_pages[key] as Control).visible = key == page


func _page_button(box: VBoxContainer, text: String, page: String) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(420, 64)
	button.add_theme_font_size_override("font_size", 17)
	button.pressed.connect(_show.bind(page))
	box.add_child(button)
	return button


func _heading(box: VBoxContainer, text: String) -> void:
	var label := Label.new()
	label.text = text
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	label.add_theme_font_size_override("font_size", 26)
	label.add_theme_color_override("font_color", Color(0.96, 0.9, 0.7))
	label.add_theme_color_override("font_outline_color", Color(0.08, 0.08, 0.06))
	label.add_theme_constant_override("outline_size", 6)
	box.add_child(label)


## Back to the start; a host still waiting stops waiting.
func _back(box: VBoxContainer) -> void:
	var button := Button.new()
	button.text = "Terug"
	button.custom_minimum_size = Vector2(420, 40)
	button.pressed.connect(func() -> void:
		var link := NetLink.find(get_tree())
		if link != null and box == _pages["multi"]:
			link.close()
			link.queue_free()
			_online_note.text = ""
		_show("start"))
	box.add_child(button)


func _note(box: VBoxContainer) -> Label:
	var label := Label.new()
	label.custom_minimum_size = Vector2(420, 0)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.82))
	label.add_theme_color_override("font_outline_color", Color(0.06, 0.07, 0.05))
	label.add_theme_constant_override("outline_size", 4)
	box.add_child(label)
	return label


func _choice(box: VBoxContainer, text: String, note: String, mode: String) -> void:
	var button := Button.new()
	button.text = "%s\n%s" % [text, note]
	button.custom_minimum_size = Vector2(420, 64)
	button.add_theme_font_size_override("font_size", 15)
	button.pressed.connect(func() -> void:
		Battle.mode = mode
		get_tree().change_scene_to_file("res://scenes/main.tscn"))
	box.add_child(button)


func _online(box: VBoxContainer) -> void:
	var hosting := HBoxContainer.new()
	box.add_child(hosting)
	for side: String in ["france", "britain"]:
		var host_button := Button.new()
		host_button.text = "Online hosten als\n%s" % ("Frankrijk" if side == "france" else "Groot-Brittannië")
		host_button.tooltip_text = "De ander doet mee met uw adres (UDP-poort %d) en speelt de andere kant." % NetLink.PORT
		host_button.custom_minimum_size = Vector2(208, 56)
		host_button.add_theme_font_size_override("font_size", 15)
		host_button.pressed.connect(_host.bind(side))
		hosting.add_child(host_button)
	var row := HBoxContainer.new()
	box.add_child(row)
	_address = LineEdit.new()
	_address.placeholder_text = "adres van de host, bv. 192.168.1.20"
	_address.custom_minimum_size = Vector2(270, 44)
	row.add_child(_address)
	var join_button := Button.new()
	join_button.text = "Meedoen"
	join_button.custom_minimum_size = Vector2(146, 44)
	join_button.pressed.connect(_join)
	row.add_child(join_button)
	_online_note = _note(box)


func _host(side: String) -> void:
	var link := NetLink.make(get_tree())
	link.host_side = side
	var err := link.host()
	if err != OK:
		_online_note.text = "Hosten lukt niet (poort %d bezet?)." % NetLink.PORT
		return
	var mine: Array[String] = []
	for ip in IP.get_local_addresses():
		if ip.count(".") == 3 and not ip.begins_with("127.") and not ip.begins_with("169.254."):
			mine.append(ip)
	_online_note.text = "Wachten op een tegenstander… Uw adres: %s (poort %d). Over internet moet de poort in de router doorgestuurd zijn." % [
		", ".join(mine) if not mine.is_empty() else "onbekend", NetLink.PORT]
	link.joined.connect(func() -> void:
		_online_note.text = "Tegenstander verbonden: de slag begint."
		link.start(side))
	link.started.connect(func(own: String) -> void: _go("host", own))


func _join() -> void:
	var address := _address.text.strip_edges()
	if address == "":
		_online_note.text = "Vul het adres van de host in."
		return
	var link := NetLink.make(get_tree())
	if link.join(address) != OK:
		_online_note.text = "Verbinden met %s lukt niet." % address
		return
	_online_note.text = "Verbinden met %s…" % address
	link.joined.connect(func() -> void: _online_note.text = "Verbonden: wachten tot de host begint.")
	link.left.connect(func() -> void: _online_note.text = "Geen verbinding met %s." % address)
	link.started.connect(func(own: String) -> void: _go("client", own))
	link.resumed.connect(func(own: String) -> void: _go("client", own))


func _go(role: String, side: String) -> void:
	# The menu goes; its listeners on the link go with it.
	var link := NetLink.find(get_tree())
	if link != null:
		for sig: String in ["joined", "left", "started", "resumed"]:
			for c: Dictionary in link.get_signal_connection_list(sig):
				var callable: Callable = c["callable"]
				if callable.get_object() == self:
					link.disconnect(sig, callable)
	Battle.mode = "campaign"
	Battle.online_role = role
	Battle.online_side = side
	get_tree().change_scene_to_file("res://scenes/main.tscn")


## The version, and updating from the menu (see Updater).
func _update_row(box: VBoxContainer) -> void:
	Updater.clean_up()
	_updater = Updater.new()
	add_child(_updater)
	_updater.checked.connect(_on_checked)
	_updater.progress.connect(func(share: float) -> void:
		_update_note.text = "Nieuwe versie downloaden… %d%%" % int(share * 100))
	_updater.failed.connect(func(text: String) -> void:
		_update_note.text = text
		_update_button.disabled = false)
	_update_note = _note(box)
	_update_note.text = "Versie: %s · zoeken naar updates…" % Updater.label(Updater.current())
	_update_button = Button.new()
	_update_button.text = "Zoek updates"
	_update_button.custom_minimum_size = Vector2(420, 48)
	_update_button.pressed.connect(_on_update_pressed)
	box.add_child(_update_button)
	_updater.check()


func _on_checked(remote: Dictionary) -> void:
	_remote = remote
	var mine := Updater.current()
	if remote.is_empty():
		_update_note.text = "Versie: %s · geen verbinding met GitHub." % Updater.label(mine)
		_update_button.text = "Zoek updates"
	elif Updater.newer(remote, mine):
		_update_note.text = "Versie: %s · nieuw: %s." % [Updater.label(mine), Updater.label(remote)]
		_update_button.text = "Bijwerken naar %s" % Updater.label(remote)
		_updates_button.text = "Updates\nNieuwe versie beschikbaar!"
		_version_line.text = "Versie: %s · nieuw: %s" % [Updater.label(mine), Updater.label(remote)]
	else:
		_update_note.text = "Versie: %s · dit is de nieuwste." % Updater.label(mine)
		_update_button.text = "Zoek updates"


func _on_update_pressed() -> void:
	if not _remote.is_empty() and Updater.newer(_remote, Updater.current()):
		_update_button.disabled = true
		_update_note.text = "Nieuwe versie downloaden…"
		_updater.install()
	else:
		_update_note.text = "Zoeken naar updates…"
		_updater.check()
