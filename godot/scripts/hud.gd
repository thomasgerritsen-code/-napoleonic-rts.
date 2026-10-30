class_name Hud
extends CanvasLayer
## The screen over the battle: stocks and population along the top, the
## selection and its buttons (build, train, form a battalion, formation)
## along the bottom, the last message, the computer's plan and the outcome.

var battle: Battle

var _top: Label
var _status: Label
var _info: Label
var _plan: Label
var _result: Label
var _buttons: GridContainer
var _dirty := true
var _end: Panel = null
var _minimap: Minimap


func _ready() -> void:
	layer = 2
	var bar := _panel(Vector2(0, 0), Vector2(0, 40))
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = 40
	_top = _label(bar, Vector2(14, 9), 16)
	_status = _label(self, Vector2(14, 48), 14)
	_plan = _label(self, Vector2(0, 48), 13)
	_plan.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_plan.offset_left = -360
	_plan.offset_right = -14
	_plan.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var panel := _panel(Vector2.ZERO, Vector2.ZERO)
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_top = -132
	_info = _label(panel, Vector2(14, 10), 14)
	_info.size = Vector2(520, 110)
	_buttons = GridContainer.new()
	_buttons.columns = 5
	_buttons.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_buttons.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_buttons.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_buttons.offset_right = -12
	_buttons.offset_bottom = -12
	_buttons.add_theme_constant_override("h_separation", 6)
	_buttons.add_theme_constant_override("v_separation", 6)
	add_child(_buttons)
	_minimap = Minimap.new()
	_minimap.battle = battle
	_minimap.camera = battle.camera if battle != null else null
	_minimap.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_minimap.offset_left = -Minimap.SIZE.x - 14
	_minimap.offset_top = 74
	add_child(_minimap)
	_result = _label(self, Vector2.ZERO, 30)
	_result.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_result.offset_top = 110
	_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result.grow_horizontal = Control.GROW_DIRECTION_BOTH


func _panel(at: Vector2, size: Vector2) -> Panel:
	var panel := Panel.new()
	panel.position = at
	panel.size = size
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.09, 0.1, 0.07, 0.82)
	style.border_color = Color(0.55, 0.47, 0.28, 0.6)
	style.border_width_bottom = 1
	style.border_width_top = 1
	panel.add_theme_stylebox_override("panel", style)
	add_child(panel)
	return panel


func _label(parent: Node, at: Vector2, size: int) -> Label:
	var label := Label.new()
	label.position = at
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.82))
	label.add_theme_color_override("font_outline_color", Color(0.06, 0.07, 0.05))
	label.add_theme_constant_override("outline_size", 4)
	parent.add_child(label)
	return label


## The selection changed: rebuild the buttons on the next frame.
func refresh() -> void:
	_dirty = true


func _process(_delta: float) -> void:
	if battle == null:
		return
	var e: Dictionary = battle.economy[battle.me]
	_top.text = "NAPOLEONIC RTS   ·   %d voedsel   ·   %d hout   ·   %d ijzer   ·   %d/%d inwoners   ·   gebieden %d–%d   ·   %s" % [
		e["food"], e["wood"], e["iron"], battle.pop_used(battle.me), battle.pop_cap(battle.me),
		battle.territories_held(battle.me), battle.territories_held("britain" if battle.me == "france" else "france"),
		DayNight.clock_text(battle.clock) + ("  ·  " + battle.weather.label() if battle.weather != null else "")]
	_status.text = battle.status
	if battle.net_role == "":
		_plan.text = "Britse bevelhebber: %s" % battle.ai.plan
	else:
		var link_up := battle.sync != null and battle.sync.link.connected
		_plan.text = "Online · u speelt %s · %s" % ["Frankrijk" if battle.me == "france" else "Groot-Brittannië",
			"verbonden" if link_up else "geen verbinding"]
	_info.text = _describe()
	_result.text = ""
	if battle.result != "" and _end == null:
		_show_end()
	if battle.result == "" and battle.hold_side != "":
		_result.text = "%s beheerst alle gebieden · nog %d:%02d tot gebiedsoverwinning" % [
			"Frankrijk" if battle.hold_side == "france" else "Groot-Brittannië", int(battle.hold_left()) / 60, int(battle.hold_left()) % 60]
		_result.add_theme_font_size_override("font_size", 16)
	if _dirty:
		_dirty = false
		_rebuild()


func _describe() -> String:
	var b := battle.selected_building
	if b != null:
		var lines: Array[String] = ["%s  (%d/%d)" % [Rules.label(b.type), b.hp, b.max_hp]]
		if not b.complete:
			lines.append("In aanbouw: %d%%" % int(b.progress * 100))
		elif not b.queue.is_empty():
			var names: Array[String] = []
			for q in b.queue:
				names.append(Rules.label(q))
			lines.append("Opleiding: %s (%d%%)" % [", ".join(names), int(b.production * 100)])
		if b.type == "tower" and b.complete:
			var level := Rules.tower_level(b.tower_level)
			lines.append("%s · niveau %d/3 · bereik %d · %d schoten van %d" % [level["label"], b.tower_level, level["range"], level["shots"], level["damage"]])
			if b.upgrade_to != 0:
				lines.append("Versterken… niveau %d/3 · %d%%" % [b.upgrade_to, int(b.upgrade_progress * 100)])
		if b.complete and not Rules.trained_at(b.type, b.side).is_empty() and b.side == battle.me:
			lines.append("Rechtsklik zet het verzamelpunt%s." % (" (gezet)" if b.rally != null else ""))
		if b.type == "farm":
			lines.append("Graan: %d  ·  %d boeren" % [b.crop, battle.farmers_on(b)])
		return "\n".join(lines)
	if battle.selected_units.is_empty():
		return "Niets geselecteerd.\nKlik of sleep om te selecteren; rechtsklik geeft een opdracht.\n1 linie · 2 colonne · 3 carré · C charge · G stelling · T tirailleurs · H halt · K kartets\nF regiment vormen · Tab volgend bataljon · Spatie: naar selectie · WASD/wieltje: camera"
	var count := {}
	for u in battle.selected_units:
		count[u.type] = count.get(u.type, 0) + 1
	var parts: Array[String] = []
	for t in count:
		parts.append("%d %s" % [count[t], Rules.label(t).to_lower()])
	var lines: Array[String] = [", ".join(parts)]
	for r in battle.selected:
		var state := "vuurt" if r.enemy != null else ("marcheert" if r.moving() else "staat")
		if r.charging != null:
			state = "chargeert"
		if r.trench != null and r.trench["progress"] >= 1.0:
			state += ", in een loopgraaf (%s)" % Rules.trench_level(r.trench["level"]).get("label", "")
		elif r.trench != null:
			state += ", graaft (%d%%)" % int(r.trench["progress"] * 100)
		elif battle.trenches.braced(r):
			state += ", houdt stand"
		state += ", %s" % r.rank_label()
		state += ", moreel %d (%s)" % [r.morale(), r.morale_label()]
		var shape: String = {"column": "colonne", "square": "carré"}.get(r.formation, "linie")
		if r.skirmish:
			shape = "open orde"

		lines.append("%s: %d man in %s, %s" % [r.name, r.strength(), shape, state])
	var workers: int = count.get("worker", 0)
	if workers > 0:
		lines.append("Boeren: rechtsklik op struiken, bomen bij een kamp, ijzer bij een mijn, of een akker.")
	return "\n".join(lines)


func _rebuild() -> void:
	for child in _buttons.get_children():
		child.queue_free()
	var b := battle.selected_building
	if b != null:
		if b.complete and b.side == battle.me:
			for item in Rules.trained_at(b.type, battle.me):
				_button("%s\n%s" % [Rules.label(item), Rules.cost_text(Rules.item_cost(item))], battle.train.bind(item))
			if b.type == "barracks":
				var plan := battle.quick_plan(b)
				var m: Dictionary = plan["missing"]
				_button("Snel bataljon\n%d/12 musk. · off. %s · tamb. %s" % [Regiment.MIN_MEN - int(m["infantry"]),
					"ja" if m["officer"] == 0 else "nee", "ja" if m["drummer"] == 0 else "nee"], func() -> void: battle.quick_regiment()).disabled = not plan["ok"]
				_button("Train ontbrekende\nvoor een bataljon", func() -> void: battle.train_missing())
				_button("Auto-bataljon\n%s" % ("aan" if b.auto_regiment else "uit"), battle.toggle_auto_regiment)
			if b.type == "tower":
				var next := Rules.tower_level(b.tower_level + 1)
				if b.upgrade_to != 0:
					_button("Versterken…\nniveau %d/3" % b.upgrade_to, func() -> void: pass).disabled = true
				elif next.is_empty():
					_button("Zwaar versterkte toren\nniveau 3/3 · maximaal", func() -> void: pass).disabled = true
				else:
					_button("Upgrade → niveau %d/3\n%s · %d s" % [b.tower_level + 1, Rules.cost_text(next["cost"]), next["seconds"]], battle.upgrade_tower.bind(b))
		return
	var has_workers := false
	var has_free_soldiers := false
	var gun: Unit = null
	for u in battle.selected_units:
		if u.type == "artillery":
			gun = u
		has_workers = has_workers or u.type == "worker"
		has_free_soldiers = has_free_soldiers or (u.military() and u.regiment == null)
	if has_workers:
		_button("Naar de akkers\n3 boeren per akker", battle.assign_workers.bind("farm"))
		_button("Houthakken\nbij een eigen kamp", battle.assign_workers.bind("wood"))
		_button("IJzer winnen\nbij een eigen mijn", battle.assign_workers.bind("iron"))
		_button("Bouw verder\nonafgemaakte gebouwen", battle.assign_workers.bind("build"))
		for type in Rules.BUILDABLE:
			_button("%s\n%s" % [Rules.label(type), Rules.cost_text(Rules.cost_of(type))], battle.start_placing.bind(type))
	if gun != null:
		_button("%s (K)\nronde kogel %d · kartets %d" % ["Ronde kogel laden" if gun.shot == "grape" else "Kartets laden", gun.ammo["round"], gun.ammo["grape"]], battle.toggle_shot)
	if has_free_soldiers:
		_button("Regiment vormen (F)\nmusk.+off.+tamb. of 4+ ruiters+off. te paard", func() -> void: battle.form_regiment())
	if not battle.selected.is_empty():
		_button("Linie (1)", battle.set_formation.bind("line"))
		_button("Colonne (2)", battle.set_formation.bind("column"))
		_button("Carré (3)\ntegen cavalerie", battle.set_formation.bind("square"))
		if has_free_soldiers:
			_button("Aanvullen\nlosse musketiers erbij", battle.reinforce)
		_button("Charge (C)", battle.charge)
		_button("Halt (H)", battle.halt)
		var holding := false
		var trench: Variant = null
		for r in battle.selected:
			holding = holding or r.hold
			if r.trench != null and r.trench["progress"] >= 1.0:
				trench = r.trench
		var open_order := false
		for r in battle.selected:
			open_order = open_order or r.skirmish
		_button("Gesloten orde (T)" if open_order else "Tirailleurs (T)\nverspreid vuren", battle.skirmish)
		_button("Stelling loslaten (G)" if holding else "Stelling houden (G)\nschrap zetten, ingraven", battle.hold)
		if trench != null:
			var next := Rules.trench_level(int(trench["level"]) + 1)
			if not next.is_empty() and trench["upgrade_to"] == 0:
				_button("%s\n%s · %d s" % [next["label"], Rules.cost_text(next["cost"]), next["seconds"]], battle.upgrade_trench)


## The end of the battle, as the web game shows it: the outcome, why, how
## long it lasted, and each army's numbers; a new battle or the main menu.
func _show_end() -> void:
	_end = Panel.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.1, 0.14, 0.11, 0.96)
	style.border_color = Color(0.71, 0.63, 0.44)
	style.set_border_width_all(1)
	style.set_corner_radius_all(12)
	_end.add_theme_stylebox_override("panel", style)
	_end.custom_minimum_size = Vector2(620, 470)
	_end.set_anchors_preset(Control.PRESET_CENTER)
	_end.offset_left = -310
	_end.offset_right = 310
	_end.offset_top = -235
	_end.offset_bottom = 235
	add_child(_end)
	var box := VBoxContainer.new()
	box.position = Vector2(24, 20)
	box.size = Vector2(572, 430)
	box.add_theme_constant_override("separation", 8)
	_end.add_child(box)
	var title := Label.new()
	title.text = battle.result
	title.add_theme_font_size_override("font_size", 36)
	title.add_theme_color_override("font_color", Color(0.95, 0.85, 0.56))
	box.add_child(title)
	for line in [battle.status, "Speelduur %d:%02d" % [int(battle.ended_at) / 60, int(battle.ended_at) % 60]]:
		var l := Label.new()
		l.text = line
		l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		l.add_theme_color_override("font_color", Color(0.93, 0.9, 0.83))
		box.add_child(l)
	var table := GridContainer.new()
	table.columns = 3
	table.add_theme_constant_override("h_separation", 40)
	box.add_child(table)
	var f := battle.side_stats("france")
	var b := battle.side_stats("britain")
	var rows := [["Leger", "Frankrijk", "Groot-Brittannië"], ["Getrainde eenheden", f["trained"], b["trained"]],
		["Verloren eenheden", f["units_lost"], b["units_lost"]], ["Resterende eenheden", f["units_remaining"], b["units_remaining"]],
		["Verloren gebouwen", f["buildings_lost"], b["buildings_lost"]], ["Resterende gebouwen", f["buildings_remaining"], b["buildings_remaining"]],
		["Gebieden in bezit", f["territories"], b["territories"]]]
	for row: Array in rows:
		for cell: Variant in row:
			var c := Label.new()
			c.text = str(cell)
			c.add_theme_color_override("font_color", Color(0.93, 0.9, 0.83))
			table.add_child(c)
	var buttons := HBoxContainer.new()
	box.add_child(buttons)
	if battle.net_role == "":
		var again := Button.new()
		again.text = "Nieuwe slag (R)"
		again.custom_minimum_size = Vector2(170, 44)
		again.pressed.connect(func() -> void: battle.get_tree().reload_current_scene())
		buttons.add_child(again)
	var menu := Button.new()
	menu.text = "Hoofdmenu (F10)"
	menu.custom_minimum_size = Vector2(170, 44)
	menu.pressed.connect(func() -> void: battle.get_tree().change_scene_to_file("res://scenes/menu.tscn"))
	buttons.add_child(menu)


func _button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(132, 46)
	button.add_theme_font_size_override("font_size", 12)
	button.focus_mode = Control.FOCUS_NONE
	button.pressed.connect(action)
	_buttons.add_child(button)
	return button
