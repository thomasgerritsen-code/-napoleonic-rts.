class_name Tutorial
extends Node
## The learning battle (menu: Leerslag): the campaign's field, the British
## commander idle, and a card at the top of the screen leading through the
## game a step at a time, each step done when the player has done it:
## select peasants, set them to work, lay out a barracks, select the
## battalion that joins, march it, form square by the order wheel and line
## again, and beat a British battalion that comes on. A few minutes; it
## ends on the end screen.

var battle: Battle
var step := 0
var _card: PanelContainer
var _text: Label
var _count: Label
var _wait := 0.0
var _ours: Regiment = null
var _theirs: Regiment = null
var _was_moving := false
var _close_clock := 0.0

## Each step: what to do, and when it is done. `enter` sets the step up.
var _steps: Array[Dictionary] = []


func _ready() -> void:
	_steps = [
		{"text": "Welkom, generaal! Tik op een van je boeren bij het stadhuis (de mannen met de spade).",
			"done": func() -> bool: return _selected("worker"),
			"enter": func() -> void: _look_at(battle.town_centre(battle.me).world + Vector2(200, 60))},
		{"text": "Zet ze aan het werk: tik op een struik met bessen voor voedsel, of op de knop Akkers onderin.",
			"done": func() -> bool: return _working()},
		{"text": "Bouw een kazerne: selecteer een boer, tik onderin op Kazerne en tik dan op een open plek naast het dorp.",
			"done": func() -> bool: return _has_building("barracks"),
			"enter": func() -> void: _top_up()},
		{"text": "Goed! Terwijl de kazerne verrijst, meldt zich een bataljon. Tik op een van zijn soldaten om het te selecteren.",
			"done": func() -> bool: return _ours != null and battle.selected.has(_ours),
			"enter": func() -> void: _raise_ours()},
		{"text": "Tik op de grond: het bataljon marcheert erheen. Druk en sleep om ook te kiezen waar het front naartoe kijkt.",
			"done": func() -> bool: return _marched()},
		{"text": "Houd je vinger even stil op de grond: het ordermenu opent. Kies Carré, de formatie tegen ruiters.",
			"done": func() -> bool: return _ours != null and _ours.formation == "square"},
		{"text": "Terug in Linie (ordermenu of de knop Linie onderin): zo vuren de meeste musketten tegelijk.",
			"done": func() -> bool: return _ours != null and _ours.formation == "line" and not _ours.skirmish},
		{"text": "Daar komen de Britten! Houd je linie en laat ze binnen schot komen, of tik Charge. Pauze geeft je tijd om na te denken.",
			"done": func() -> bool: return _theirs != null and (_theirs.destroyed() or _theirs.routing),
			"enter": func() -> void: _raise_theirs()},
	]
	_build_card()
	_enter()


func _build_card() -> void:
	var parts := make_card(battle.get("_hud") if battle.get("_hud") != null else self)
	_card = parts[0]
	_count = parts[1]
	_text = parts[2]


## A card at the top of the screen, gold-edged: a small heading over a line
## or two of text (the learning battle's steps, a quick battle's goal).
## [card, heading label, text label].
static func make_card(parent: Node) -> Array:
	var card := PanelContainer.new()
	var style := StyleBoxFlat.new()
	style.bg_color = Color(0.12, 0.13, 0.09, 0.93)
	style.border_color = Color(0.95, 0.78, 0.36)
	style.set_border_width_all(2)
	style.set_corner_radius_all(8)
	style.content_margin_left = 12
	style.content_margin_right = 12
	style.content_margin_top = 6
	style.content_margin_bottom = 8
	card.add_theme_stylebox_override("panel", style)
	card.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var lines := VBoxContainer.new()
	lines.add_theme_constant_override("separation", 2)
	card.add_child(lines)
	var heading := Label.new()
	heading.add_theme_font_size_override("font_size", 11)
	heading.add_theme_color_override("font_color", Color(0.95, 0.78, 0.36))
	lines.add_child(heading)
	var text := Label.new()
	text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	text.add_theme_font_size_override("font_size", 15)
	text.add_theme_color_override("font_color", Color(0.97, 0.94, 0.85))
	text.custom_minimum_size = Vector2(420, 0)
	lines.add_child(text)
	parent.add_child(card)
	return [card, heading, text]


## The card at the top, under the bar (on a phone right of the Meer button).
static func place_card(card: Control, text: Label) -> void:
	var screen := card.get_viewport().get_visible_rect().size
	var compact := Phone.active()
	var width := minf(520.0, screen.x - (200.0 if compact else 40.0))
	text.custom_minimum_size.x = width - 24.0
	card.size = Vector2(width, 0)
	card.position = Vector2((screen.x - width) / 2.0 + (40.0 if compact else 0.0), 64.0 if compact else 84.0)


func update(delta: float) -> void:
	if step >= _steps.size() or battle.result != "":
		return
	_place_card()
	if _ours != null and (_ours.destroyed() or _ours.routing):
		battle._finish("britain" if battle.me == "france" else "france", "tutorial")
		battle.status = "Je bataljon is gevlucht. Probeer de leerslag nog eens: houd de linie en laat ze eerst binnen schot komen."
		_card.visible = false
		return
	_close_in(delta)
	if _wait > 0.0:
		_wait -= delta
		if _wait <= 0.0:
			_next()
		return
	var done: Callable = _steps[step]["done"]
	if done.call():
		_text.text = "Goed gedaan!"
		Battle.buzz(40)
		_wait = 1.2


func _next() -> void:
	step += 1
	if step >= _steps.size():
		_card.visible = false
		battle._finish(battle.me, "tutorial")
		battle.result = "Leerslag voltooid!"
		battle.status = "Je kent nu de basis: boeren, bouwen, bataljons en formaties. Tijd voor een echte veldslag."
		return
	_enter()


func _enter() -> void:
	var s: Dictionary = _steps[step]
	_count.text = "LEERSLAG · STAP %d VAN %d" % [step + 1, _steps.size()]
	_text.text = s["text"]
	if s.has("enter"):
		(s["enter"] as Callable).call()
	_place_card()


func _place_card() -> void:
	place_card(_card, _text)


func _selected(type: String) -> bool:
	for u in battle.selected_units:
		if u.type == type:
			return true
	return false


func _working() -> bool:
	for u in battle.units:
		if u.side == battle.me and u.type == "worker" and u.alive() and u.task in ["gather", "farm", "build"]:
			return true
	return false


func _has_building(type: String) -> bool:
	for b in battle.buildings:
		if b.side == battle.me and b.type == type and b.standing():
			return true
	return false


## Enough in store for the barracks the step asks for.
func _top_up() -> void:
	var e: Dictionary = battle.economy[battle.me]
	for key: String in ["wood", "food", "iron"]:
		e[key] = maxf(float(e[key]), 600.0)


func _look_at(world: Vector2) -> void:
	if battle.camera != null:
		battle.camera.focus(Iso.to_screen(world))


## A battalion joins by the town centre.
func _raise_ours() -> void:
	var home := battle.town_centre(battle.me).world
	var at := home + Vector2(320, 260)
	var men: Array[Unit] = []
	for i in 24:
		men.append(battle.add_unit(battle.me, "infantry", at + Vector2((i % 12) * 15, (i / 12) * 19)))
	men.append(battle.add_unit(battle.me, "officer", at + Vector2(90, -30)))
	men.append(battle.add_unit(battle.me, "drummer", at + Vector2(90, 50)))
	_ours = battle.form_regiment(men)
	_look_at(at + Vector2(90, 10))


func _marched() -> bool:
	if _ours == null:
		return false
	if _ours.moving():
		_was_moving = true
	return _was_moving


## A small British battalion (the least that is one) comes on against
## ours, from the British side.
func _raise_theirs() -> void:
	var foe := "britain" if battle.me == "france" else "france"
	var target := _ours.centroid()
	var their_home := battle.town_centre(foe)
	var from_dir := (their_home.world - target).normalized() if their_home != null else Vector2.RIGHT
	var at := target + from_dir * 620.0
	var men: Array[Unit] = []
	for i in 12:
		men.append(battle.add_unit(foe, "infantry", at + Vector2((i % 6) * 15, (i / 6) * 19)))
	men.append(battle.add_unit(foe, "officer", at + Vector2(60, -30)))
	men.append(battle.add_unit(foe, "drummer", at + Vector2(60, 50)))
	_theirs = battle.form_regiment(men)
	_look_at((target + at) / 2.0)
	_close_clock = 0.0


## The British battalion keeps coming at ours (not at a building on the
## way) until the two are firing at each other.
func _close_in(delta: float) -> void:
	if _theirs == null or _ours == null or _theirs.destroyed() or _theirs.routing or _ours.destroyed():
		return
	_close_clock -= delta
	if _close_clock > 0.0 or (_theirs.enemy == _ours and _ours.enemy == _theirs):
		return
	_close_clock = 4.0
	var here := _theirs.centroid()
	var there := _ours.centroid()
	var way := (here - there).normalized()
	_theirs.order_move(there + way * 130.0, (-way).angle())
