class_name Hud
extends CanvasLayer
## The screen over the battle: stocks and population along the top, the
## selection and its buttons (build, train, form a battalion, formation)
## along the bottom, the last message, the computer's plan and the outcome.
##
## The buttons stand in groups, as the web game's bar: each group under a
## coloured heading (orders red, formation blue, battalion gold, work green,
## building brown), each button with its name large and its key, cost or
## state small beneath, a longer explanation when the mouse rests on it, and
## the formation or stance in force lit in gold.
##
## On a phone (Phone.active) the same, compact: a short line of stocks, the
## keys' buttons folded under "Meer", the map on request, the selection in a
## line or two over its buttons, which stand in two rows (and scroll sideways
## if they do not fit).

var battle: Battle

var _top: Label
var _status: Label
var _info: Label
var _plan: Label
var _result: Label
var _buttons: HBoxContainer
## Phone: the buttons' strip (scrolls sideways) and the panel behind it.
var _scroll: ScrollContainer
var _bottom: Panel
var _compact := false
var _more: Button
## The battle stood still (P), and the order wheel a long press opens.
var _pause_button: Button
var _wheel: Control = null
var _button_count := 0
var _group: GridContainer = null
var _dirty := true
var _end: Panel = null
var _minimap: Minimap
## By touch, the keys' work on buttons: menu, save, load, the next battalion,
## to the selection, a selection box, nothing selected, sound.
var _touchbar: Container
var _box_button: Button


func _ready() -> void:
	layer = 2
	_compact = Phone.active()
	var bar_height := 32 if _compact else 40
	var bar := _panel(Vector2(0, 0), Vector2(0, bar_height))
	bar.set_anchors_preset(Control.PRESET_TOP_WIDE)
	bar.offset_bottom = bar_height
	_top = _label(bar, Vector2(10, 7) if _compact else Vector2(14, 9), 14 if _compact else 16)
	# Back to the main menu, always at hand (F10 too).
	var menu_button := Button.new()
	menu_button.text = "Menu" if _compact else "Hoofdmenu"
	menu_button.tooltip_text = "Terug naar het hoofdmenu (F10). Sla eerst op met F5 als je de slag wilt bewaren."
	menu_button.focus_mode = Control.FOCUS_NONE
	menu_button.anchor_left = 1.0
	menu_button.anchor_right = 1.0
	menu_button.offset_left = -84 if _compact else -118
	menu_button.offset_right = -6 if _compact else -8
	menu_button.offset_top = 2 if _compact else 4
	menu_button.offset_bottom = 30 if _compact else 36
	for state: String in ["normal", "hover", "pressed"]:
		menu_button.add_theme_stylebox_override(state, _style(Color(0.55, 0.5, 0.36), state, false))
	menu_button.pressed.connect(func() -> void: battle.get_tree().change_scene_to_file("res://scenes/menu.tscn"))
	add_child(menu_button)
	_pause_button = Button.new()
	_pause_button.text = "Pauze"
	_pause_button.tooltip_text = "De slag stilzetten om rustig orders te geven (P)."
	_pause_button.focus_mode = Control.FOCUS_NONE
	_pause_button.anchor_left = 1.0
	_pause_button.anchor_right = 1.0
	_pause_button.offset_left = menu_button.offset_left - (80 if _compact else 90)
	_pause_button.offset_right = menu_button.offset_left - 6
	_pause_button.offset_top = menu_button.offset_top
	_pause_button.offset_bottom = menu_button.offset_bottom
	for state: String in ["normal", "hover", "pressed"]:
		_pause_button.add_theme_stylebox_override(state, _style(Color(0.32, 0.5, 0.78), state, false))
	_pause_button.pressed.connect(func() -> void: battle.toggle_pause())
	add_child(_pause_button)
	_status = _label(self, Vector2(14, 48), 14)
	_plan = _label(self, Vector2(0, 48), 13)
	_plan.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_plan.offset_left = -360
	_plan.offset_right = -14
	_plan.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var panel := _panel(Vector2.ZERO, Vector2.ZERO)
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE)
	panel.offset_top = -150
	_bottom = panel
	_info = _label(self if _compact else panel, Vector2(14, 10), 12 if _compact else 13)
	_info.size = Vector2(430, 130)
	_info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	if _compact:
		_info.max_lines_visible = 2
		_info.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
		_info.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_buttons = HBoxContainer.new()
	_buttons.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT)
	_buttons.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	_buttons.grow_vertical = Control.GROW_DIRECTION_BEGIN
	_buttons.offset_right = -12
	_buttons.offset_bottom = -10
	_buttons.add_theme_constant_override("separation", 10 if _compact else 14)
	if _compact:
		_scroll = ScrollContainer.new()
		_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
		_scroll.scroll_deadzone = 12
		add_child(_scroll)
		_scroll.add_child(_buttons)
	else:
		add_child(_buttons)
	_minimap = Minimap.new()
	_minimap.battle = battle
	_minimap.camera = battle.camera if battle != null else null
	_minimap.set_anchors_preset(Control.PRESET_TOP_RIGHT)
	_minimap.offset_left = -Minimap.SIZE.x - (6 if _compact else 14)
	_minimap.offset_top = 38 if _compact else 74
	add_child(_minimap)
	if _compact:
		# The keys' buttons folded away under "Meer", in two columns; the map
		# shown on request.
		_minimap.visible = false
		_more = Button.new()
		_more.text = "Meer"
		_more.focus_mode = Control.FOCUS_NONE
		_more.position = Vector2(6, 38)
		_more.custom_minimum_size = Vector2(84, 40)
		for state: String in ["normal", "hover", "pressed"]:
			_more.add_theme_stylebox_override(state, _style(Color(0.55, 0.5, 0.36), state, false))
		_more.pressed.connect(func() -> void:
			_touchbar.visible = not _touchbar.visible
			_more.text = "Minder" if _touchbar.visible else "Meer")
		add_child(_more)
		var grid := GridContainer.new()
		grid.columns = 2
		grid.add_theme_constant_override("h_separation", 5)
		grid.add_theme_constant_override("v_separation", 5)
		grid.position = Vector2(6, 82)
		_touchbar = grid
	else:
		_touchbar = HBoxContainer.new()
		_touchbar.position = Vector2(14, 72)
		_touchbar.add_theme_constant_override("separation", 6)
	add_child(_touchbar)
	_touch_button("Opslaan", func() -> void: battle.save_battle())
	_touch_button("Laden", func() -> void:
		if not Battle.load_saved(battle.get_tree()):
			battle.say("Er is nog geen opgeslagen slag."))
	_touch_button("Volgend bataljon", func() -> void: battle.cycle_regiment(false))
	_touch_button("Naar selectie", func() -> void: battle.focus_selection())
	_box_button = _touch_button("Kader", func() -> void: battle.toggle_box_mode())
	_touch_button("Niets selecteren", func() -> void: battle.deselect())
	_touch_button("2D / 3D", func() -> void: battle.set_view_3d(battle.view3d == null))
	_touch_button("Geluid", func() -> void:
		battle.sounds.enabled = not battle.sounds.enabled
		battle.say("Geluid %s." % ("aan" if battle.sounds.enabled else "uit")))
	if _compact:
		_touch_button("Kaart", func() -> void: _minimap.visible = not _minimap.visible)
	_touchbar.visible = _by_touch() and not _compact
	_result = _label(self, Vector2.ZERO, 30)
	_result.set_anchors_preset(Control.PRESET_TOP_WIDE)
	_result.offset_left = 0
	_result.offset_right = 0
	_result.offset_top = 110
	_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result.mouse_filter = Control.MOUSE_FILTER_IGNORE


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
	if _compact:
		_compact_process(e)
		return
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
	_show_pause()
	if battle.result != "" and _end == null:
		_show_end()
	if battle.result == "" and battle.hold_side != "":
		_result.text = "%s beheerst alle gebieden · nog %d:%02d tot gebiedsoverwinning" % [
			"Frankrijk" if battle.hold_side == "france" else "Groot-Brittannië", int(battle.hold_left()) / 60, int(battle.hold_left()) % 60]
		_result.add_theme_font_size_override("font_size", 16)
	if _dirty:
		_dirty = false
		_rebuild()
		if not _compact:
			_touchbar.visible = _by_touch()
		_box_button.text = "Kader: aan" if battle.box_mode else "Kader"


## Phone: the same as _process, laid out small.
func _compact_process(e: Dictionary) -> void:
	_top.text = "%d voedsel · %d hout · %d ijzer · %d/%d · %s" % [e["food"], e["wood"], e["iron"],
		battle.pop_used(battle.me), battle.pop_cap(battle.me), DayNight.clock_text(battle.clock)]
	_status.text = battle.status
	_plan.visible = false
	var text := _describe()
	if battle.selected_units.is_empty() and battle.selected_building == null:
		text = "Tik op een eigen soldaat of gebouw. Twee vingers: kaart schuiven en zoomen."
	_info.text = text
	_result.text = ""
	_show_pause()
	if battle.result != "" and _end == null:
		_show_end()
	if battle.result == "" and battle.hold_side != "":
		_result.text = "%s beheerst alle gebieden · nog %d:%02d" % [
			"Frankrijk" if battle.hold_side == "france" else "Groot-Brittannië", int(battle.hold_left()) / 60, int(battle.hold_left()) % 60]
		_result.add_theme_font_size_override("font_size", 15)
	if _dirty:
		_dirty = false
		_rebuild()
		_box_button.text = "Kader: aan" if battle.box_mode else "Kader"
	_layout_compact()


## The pause button's word, and GEPAUZEERD over the field while it stands still.
func _show_pause() -> void:
	_pause_button.visible = battle.net_role == ""
	_pause_button.text = "Verder" if battle.paused else "Pauze"
	if battle.paused and battle.result == "":
		_result.text = "GEPAUZEERD"
		_result.add_theme_font_size_override("font_size", 24 if _compact else 30)


## The order wheel: round the finger that was held down, the battalions'
## orders; a tap on one gives it, a tap anywhere else closes the wheel.
func show_wheel(at: Vector2) -> void:
	close_wheel()
	var screen := get_viewport().get_visible_rect().size
	# An oval: the buttons are wider than high.
	var radius := Vector2(125, 88)
	var centre := Vector2(clampf(at.x, radius.x + 52, screen.x - radius.x - 52), clampf(at.y, radius.y + 24, screen.y - radius.y - 24))
	_wheel = Control.new()
	_wheel.set_anchors_preset(Control.PRESET_FULL_RECT)
	_wheel.mouse_filter = Control.MOUSE_FILTER_STOP
	_wheel.gui_input.connect(func(event: InputEvent) -> void:
		if event is InputEventMouseButton and (event as InputEventMouseButton).pressed:
			close_wheel())
	add_child(_wheel)
	var dot := Panel.new()
	var round_style := StyleBoxFlat.new()
	round_style.bg_color = Color(0.09, 0.1, 0.07, 0.55)
	var half := radius + Vector2(62, 34)
	round_style.set_corner_radius_all(int(half.y))
	dot.add_theme_stylebox_override("panel", round_style)
	dot.position = centre - half
	dot.size = half * 2.0
	dot.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_wheel.add_child(dot)
	var items := [["Linie", FORMATION, func() -> void: battle.set_formation("line")],
		["Colonne", FORMATION, func() -> void: battle.set_formation("column")],
		["Carré", FORMATION, func() -> void: battle.set_formation("square")],
		["Tirailleurs", FORMATION, func() -> void: battle.skirmish()],
		["Charge", ORDERS, func() -> void: battle.charge()],
		["Stelling", ORDERS, func() -> void: battle.hold()],
		["Halt", ORDERS, func() -> void: battle.halt()]]
	for i in items.size():
		var item: Array = items[i]
		var angle := -PI / 2.0 + TAU * i / items.size()
		var button := Button.new()
		button.text = item[0]
		button.focus_mode = Control.FOCUS_NONE
		button.size = Vector2(96, 38)
		button.position = centre + Vector2.from_angle(angle) * radius - button.size / 2.0
		button.add_theme_font_size_override("font_size", 14)
		for state: String in ["normal", "hover", "pressed"]:
			button.add_theme_stylebox_override(state, _style(item[1], state, false))
		var action: Callable = item[2]
		button.pressed.connect(func() -> void:
			action.call()
			Battle.buzz(15)
			close_wheel())
		_wheel.add_child(button)


func close_wheel() -> void:
	if _wheel != null:
		_wheel.queue_free()
		_wheel = null


## Whether the order wheel is open: tests.
func wheel_open() -> bool:
	return _wheel != null


## Phone: the buttons along the bottom (scrolling if too wide), their panel
## just as high, the selection's line or two over it, the status under the top.
func _layout_compact() -> void:
	var screen := get_viewport().get_visible_rect().size
	var want := _buttons.get_combined_minimum_size()
	var shown := _button_count > 0
	var height := want.y if shown else 0.0
	var width := minf(want.x, screen.x - 12)
	_scroll.visible = shown
	_scroll.position = Vector2(screen.x - 6 - width, screen.y - 6 - height)
	_scroll.size = Vector2(width, height)
	_bottom.visible = shown
	_bottom.offset_top = -(height + 12)
	var info_bottom: float = screen.y - (height + 16.0 if shown else 6.0)
	_info.size = Vector2(screen.x - 20, 34)
	_info.position = Vector2(10, info_bottom - 34)
	_status.position = Vector2(96, 44)
	_status.size = Vector2(screen.x - 200, 20)
	_status.add_theme_font_size_override("font_size", 12)
	_status.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	_status.clip_text = true
	_result.offset_top = 70


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
	if battle.selected_units.is_empty() and _by_touch():
		return "Niets geselecteerd.\nTik op een eigen soldaat of gebouw om te selecteren, of zet Kader aan en sleep.\nMet troepen geselecteerd: tik op de grond voor een order, of druk en sleep voor de frontrichting.\nTwee vingers: kaart verschuiven en inzoomen."
	if battle.selected_units.is_empty():
		return "Niets geselecteerd.\nKlik of sleep om te selecteren; rechtsklik geeft een opdracht.\n1 linie · 2 colonne · 3 carré · C charge · G stelling · T tirailleurs · H halt · K kartets\nF regiment vormen · Tab volgend bataljon · Spatie: naar selectie · WASD/wieltje: camera · F3 2D/3D · F5 opslaan · F9 laden"
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
		lines.append("Boeren: %s op struiken, bomen bij een kamp, ijzer bij een mijn, of een akker." % ("tik" if _by_touch() else "rechtsklik"))
	return "\n".join(lines)


const ORDERS := Color(0.78, 0.33, 0.25)
const FORMATION := Color(0.32, 0.5, 0.78)
const BATTALION := Color(0.8, 0.64, 0.3)
const WORK := Color(0.4, 0.66, 0.32)
const BUILD := Color(0.63, 0.48, 0.3)
const TRAIN := Color(0.55, 0.45, 0.72)


func _rebuild() -> void:
	for child in _buttons.get_children():
		_buttons.remove_child(child)
		child.queue_free()
	_group = null
	_fill_buttons()
	_button_count = 0
	for box in _buttons.get_children():
		var grid: GridContainer = box.get_child(1)
		_button_count += grid.get_child_count()
		if _compact:
			grid.columns = maxi(1, ceili(grid.get_child_count() / 2.0))


func _fill_buttons() -> void:
	var b := battle.selected_building
	if b != null:
		if b.complete and b.side == battle.me:
			var items := Rules.trained_at(b.type, battle.me)
			if not items.is_empty():
				_start_group("Opleiden", TRAIN, mini(items.size(), 4))
				for item in items:
					_button(Rules.label(item), Rules.cost_text(Rules.item_cost(item)), battle.train.bind(item),
						"%s opleiden voor %s." % [Rules.label(item), Rules.cost_text(Rules.item_cost(item))])
			if b.type == "barracks":
				var plan := battle.quick_plan(b)
				var m: Dictionary = plan["missing"]
				_start_group("Bataljon", BATTALION, 2)
				_button("Snel bataljon", "%d/12 musk. · off. %s · tamb. %s" % [Regiment.MIN_MEN - int(m["infantry"]),
					"ja" if m["officer"] == 0 else "nee", "ja" if m["drummer"] == 0 else "nee"], func() -> void: battle.quick_regiment(),
					"Vormt meteen een bataljon uit de musketiers, officier en tamboer bij deze kazerne.").disabled = not plan["ok"]
				_button("Train ontbrekende", "voor een bataljon", func() -> void: battle.train_missing(),
					"Zet precies de mannen in de wachtrij die nog ontbreken voor een volledig bataljon.")
				_button("Auto-bataljon", "aan" if b.auto_regiment else "uit", battle.toggle_auto_regiment,
					"Vormt vanzelf een bataljon zodra er genoeg mannen zijn.", b.auto_regiment)
			if b.type == "tower":
				var next := Rules.tower_level(b.tower_level + 1)
				_start_group("Toren", BUILD, 1)
				if b.upgrade_to != 0:
					_button("Versterken…", "niveau %d/3" % b.upgrade_to, func() -> void: pass).disabled = true
				elif next.is_empty():
					_button("Zwaar versterkt", "niveau 3/3 · maximaal", func() -> void: pass).disabled = true
				else:
					_button("Upgrade → %d/3" % (b.tower_level + 1), "%s · %d s" % [Rules.cost_text(next["cost"]), next["seconds"]],
						battle.upgrade_tower.bind(b), "Meer leven, verder bereik en verder zicht.")
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
		_start_group("Werk", WORK, 2)
		_button("Akkers", "3 boeren per akker", battle.assign_workers.bind("farm"), "Stuurt de boeren naar de graanakkers.")
		_button("Hout", "bij een eigen kamp", battle.assign_workers.bind("wood"), "Hout kappen binnen bereik van een eigen houthakkerskamp.")
		_button("IJzer", "bij een eigen mijn", battle.assign_workers.bind("iron"), "IJzer winnen bij een eigen mijn op de afzetting.")
		_button("Bouw verder", "onafgemaakt", battle.assign_workers.bind("build"), "Bouwt onafgemaakte gebouwen verder af.")
		_start_group("Bouwen", BUILD, 5)
		for type in Rules.BUILDABLE:
			var cost := battle.build_cost(battle.me, type)
			var blocked := battle.build_blocked(battle.me, type)
			var tip := "%s bouwen voor %s; klik waar het moet komen." % [Rules.label(type), Rules.cost_text(cost)]
			if type == "sawmill":
				tip += " Daarna levert hout een kwart meer op en kosten alle gebouwen een vijfde minder hout."
			var built_button := _button(Rules.label(type), blocked if blocked != "" else Rules.cost_text(cost), battle.start_placing.bind(type),
				blocked if blocked != "" else tip)
			built_button.disabled = blocked != ""
	if gun != null:
		_start_group("Kanon", ORDERS, 1)
		_button("Kartets laden" if gun.shot == "round" else "Ronde kogel", "K · kogel %d · kartets %d" % [gun.ammo["round"], gun.ammo["grape"]],
			battle.toggle_shot, "Kartets: een waaier van kogels op korte afstand. Ronde kogel: ver en door de rijen heen.")
	if has_free_soldiers:
		_start_group("Regiment", BATTALION, 1)
		_button("Regiment vormen", "F", func() -> void: battle.form_regiment(),
			"Musketiers met een officier en tamboer, of 4+ ruiters met een officier te paard, worden één regiment.")
		if not battle.selected.is_empty():
			_button("Aanvullen", "losse musketiers erbij", battle.reinforce, "Voegt de losse musketiers toe aan het geselecteerde bataljon.")
	if not battle.selected.is_empty():
		var holding := false
		var open_order := false
		var trench: Variant = null
		var shapes := {}
		for r in battle.selected:
			holding = holding or r.hold
			open_order = open_order or r.skirmish
			shapes[r.formation] = true
			if r.trench != null and r.trench["progress"] >= 1.0:
				trench = r.trench
		_start_group("Bevel", ORDERS, 2)
		_button("Halt", "H", battle.halt, "Staakt de mars; het bataljon blijft staan waar het is.")
		_button("Charge", "C · bajonet", battle.charge, "Stormt met de bajonet op de dichtstbijzijnde vijand af.")
		_button("Stelling", "G · " + ("houdt stand" if holding else "schrap, ingraven"), battle.hold,
			"Schrap zetten (30% minder verlies); na een tijd graaft het bataljon een loopgraaf." if not holding else "De stelling loslaten.", holding)
		if trench != null:
			var next := Rules.trench_level(int(trench["level"]) + 1)
			if not next.is_empty() and trench["upgrade_to"] == 0:
				_button(next["label"], "%s · %d s" % [Rules.cost_text(next["cost"]), next["seconds"]], battle.upgrade_trench,
					"De loopgraaf versterken: betere dekking.")
		_start_group("Formatie", FORMATION, 2)
		var single := shapes.size() == 1
		_button("Linie", "1 · vuurkracht", battle.set_formation.bind("line"), "Twee rijen breed: de meeste musketten vuren.",
			single and shapes.has("line") and not open_order)
		_button("Colonne", "2 · snel", battle.set_formation.bind("column"), "Smal en diep: marcheert snel, vuurt weinig.",
			single and shapes.has("column"))
		_button("Carré", "3 · tegen ruiters", battle.set_formation.bind("square"), "Een vierkant naar alle kanten: ruiters breken erop.",
			single and shapes.has("square"))
		_button("Tirailleurs", "T · " + ("aan" if open_order else "verspreid"), battle.skirmish,
			"Open orde: verspreid vuren, minder kwetsbaar voor kanonnen." if not open_order else "Terug naar gesloten orde.", open_order)


## Played by touch: on a phone or tablet, or once a finger has been used.
func _by_touch() -> bool:
	return Battle.touched or OS.has_feature("mobile") or OS.has_feature("ios") or OS.has_feature("android")


func _touch_button(text: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size = Vector2(130, 40) if _compact else Vector2(0, 40)
	button.add_theme_font_size_override("font_size", 14)
	button.focus_mode = Control.FOCUS_NONE
	for state: String in ["normal", "hover", "pressed"]:
		var style := _style(Color(0.55, 0.5, 0.36), state, false)
		style.content_margin_left = 10
		style.content_margin_right = 10
		button.add_theme_stylebox_override(state, style)
	button.pressed.connect(action)
	_touchbar.add_child(button)
	return button


## A new group of buttons under a coloured heading, `columns` wide.
func _start_group(title: String, colour: Color, columns: int) -> void:
	var box := VBoxContainer.new()
	box.add_theme_constant_override("separation", 4)
	var head := Label.new()
	head.text = title.to_upper()
	head.add_theme_font_size_override("font_size", 11)
	head.add_theme_color_override("font_color", colour.lightened(0.25))
	head.add_theme_color_override("font_outline_color", Color(0.05, 0.05, 0.04))
	head.add_theme_constant_override("outline_size", 3)
	box.add_child(head)
	_group = GridContainer.new()
	_group.columns = columns
	_group.add_theme_constant_override("h_separation", 5)
	_group.add_theme_constant_override("v_separation", 5)
	_group.set_meta("colour", colour)
	box.add_child(_group)
	_buttons.add_child(box)


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
	if _compact:
		# A phone's screen is 420 high: the same, three quarters the size.
		_end.pivot_offset = Vector2(310, 235)
		_end.scale = Vector2.ONE * 0.78
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
	if battle.net_role != "" and battle.sync != null:
		var rematch := Button.new()
		rematch.text = "Opnieuw spelen"
		rematch.tooltip_text = "Een nieuwe slag zodra ook de andere speler dit kiest."
		rematch.custom_minimum_size = Vector2(170, 44)
		rematch.pressed.connect(func() -> void:
			battle.sync.ask_rematch()
			rematch.disabled = true
			rematch.text = "Wachten op de ander…")
		buttons.add_child(rematch)
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


## A button in the current group: its name, a small line beneath (key,
## cost or state), an explanation for the tooltip, and lit when in force.
func _button(title: String, note: String, action: Callable, tip := "", active := false) -> Button:
	if _group == null:
		_start_group("", BATTALION, 4)
	var colour: Color = _group.get_meta("colour", BATTALION)
	var button := Button.new()
	button.custom_minimum_size = Vector2(98, 44) if _compact else Vector2(112, 50)
	button.focus_mode = Control.FOCUS_NONE
	button.tooltip_text = tip if tip != "" else title
	for state: String in ["normal", "hover", "pressed", "disabled"]:
		button.add_theme_stylebox_override(state, _style(colour, state, active))
	button.pressed.connect(action)
	var lines := VBoxContainer.new()
	lines.set_anchors_preset(Control.PRESET_FULL_RECT)
	lines.alignment = BoxContainer.ALIGNMENT_CENTER
	lines.add_theme_constant_override("separation", 0)
	lines.mouse_filter = Control.MOUSE_FILTER_IGNORE
	button.add_child(lines)
	var name_ := Label.new()
	name_.text = title
	name_.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	name_.add_theme_font_size_override("font_size", (13 if title.length() <= 11 else 11) if _compact else (14 if title.length() <= 12 else 12))
	name_.add_theme_color_override("font_color", Color(1.0, 0.93, 0.7) if active else Color(0.97, 0.95, 0.88))
	name_.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lines.add_child(name_)
	var small := Label.new()
	small.text = note
	small.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	small.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
	small.add_theme_font_size_override("font_size", 10)
	small.add_theme_color_override("font_color", Color(0.78, 0.76, 0.66))
	small.mouse_filter = Control.MOUSE_FILTER_IGNORE
	lines.add_child(small)
	button.set_meta("labels", [name_, small])
	button.draw.connect(func() -> void:
		var dim := button.disabled
		name_.modulate.a = 0.45 if dim else 1.0
		small.modulate.a = 0.45 if dim else 1.0)
	_group.add_child(button)
	return button


## A button's face: dark, a stripe of its group's colour along the top;
## lighter under the mouse, darker pressed, grey when it cannot be used, and
## framed in gold when what it stands for is in force.
func _style(colour: Color, state: String, active: bool) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = {"normal": Color(0.15, 0.15, 0.12, 0.96), "hover": Color(0.24, 0.23, 0.18, 0.98),
		"pressed": Color(0.1, 0.1, 0.08, 1.0), "disabled": Color(0.13, 0.13, 0.12, 0.7)}[state]
	if active and state != "disabled":
		style.bg_color = style.bg_color.lerp(Color(0.45, 0.36, 0.14), 0.45)
	style.border_color = Color(0.98, 0.8, 0.32) if active else Color(colour, 0.45 if state == "disabled" else 0.9)
	style.border_width_top = 3
	style.border_width_left = 2 if active else 1
	style.border_width_right = 2 if active else 1
	style.border_width_bottom = 2 if active else 1
	if not active:
		style.border_color = Color(colour, 0.9 if state != "disabled" else 0.4)
	style.set_corner_radius_all(5)
	style.content_margin_left = 4
	style.content_margin_right = 4
	return style
