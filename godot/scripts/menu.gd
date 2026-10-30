extends Control
## The start menu, as the web game's: a battle against the computer, the
## test field where two large armies meet without economy, or a battle
## online against another player: one hosts (as France or Britain) and
## waits, the other joins with the host's address and plays the other side;
## it starts once both are there. A player who left can join again while the
## host's battle runs.

var _online_note: Label
var _address: LineEdit
var _updater: Updater
var _update_note: Label
var _update_button: Button
var _remote: Dictionary = {}


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
	_online(box)
	_update_row(box)
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
	_online_note = Label.new()
	_online_note.custom_minimum_size = Vector2(420, 0)
	_online_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_online_note.add_theme_color_override("font_color", Color(0.96, 0.93, 0.82))
	_online_note.add_theme_color_override("font_outline_color", Color(0.06, 0.07, 0.05))
	_online_note.add_theme_constant_override("outline_size", 4)
	box.add_child(_online_note)


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
	var row := HBoxContainer.new()
	box.add_child(row)
	_update_note = Label.new()
	_update_note.custom_minimum_size = Vector2(270, 44)
	_update_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_update_note.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_update_note.add_theme_color_override("font_color", Color(0.96, 0.93, 0.82))
	_update_note.add_theme_color_override("font_outline_color", Color(0.06, 0.07, 0.05))
	_update_note.add_theme_constant_override("outline_size", 4)
	_update_note.text = "Versie: %s · zoeken naar updates…" % Updater.label(Updater.current())
	row.add_child(_update_note)
	_update_button = Button.new()
	_update_button.text = "Zoek updates"
	_update_button.custom_minimum_size = Vector2(146, 44)
	_update_button.pressed.connect(_on_update_pressed)
	row.add_child(_update_button)
	_updater.check()


func _on_checked(remote: Dictionary) -> void:
	_remote = remote
	var mine := Updater.current()
	if remote.is_empty():
		_update_note.text = "Versie: %s · geen verbinding met GitHub." % Updater.label(mine)
		_update_button.text = "Zoek updates"
	elif Updater.newer(remote, mine):
		_update_note.text = "Versie: %s · nieuw: %s." % [Updater.label(mine), Updater.label(remote)]
		_update_button.text = "Bijwerken"
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
