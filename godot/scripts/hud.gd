class_name Hud
extends CanvasLayer
## Text over the battle: what is selected, how the armies stand, the controls,
## and the outcome.

var _top: Label
var _bottom: Label
var _result: Label


func _ready() -> void:
	_top = _label(Vector2(16, 12), 15)
	_bottom = _label(Vector2(16, 0), 14)
	_bottom.anchor_top = 1.0
	_bottom.anchor_bottom = 1.0
	_bottom.offset_top = -96.0
	_result = _label(Vector2.ZERO, 30)
	_result.set_anchors_preset(Control.PRESET_CENTER_TOP)
	_result.offset_top = 80.0
	_result.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_result.grow_horizontal = Control.GROW_DIRECTION_BOTH


func _label(at: Vector2, size: int) -> Label:
	var label := Label.new()
	label.position = at
	label.add_theme_font_size_override("font_size", size)
	label.add_theme_color_override("font_color", Color(0.96, 0.93, 0.82))
	label.add_theme_color_override("font_outline_color", Color(0.08, 0.09, 0.06))
	label.add_theme_constant_override("outline_size", 5)
	add_child(label)
	return label


func show_state(battle: Battle) -> void:
	var men := {"france": 0, "britain": 0}
	for r in battle.regiments:
		if not r.routing:
			men[r.side] += r.strength()
	_top.text = "NAPOLEONIC RTS  ·  Godot v0.1\nFrankrijk: %d man   ·   Groot-Brittannië: %d man" % [men["france"], men["britain"]]
	var lines: Array[String] = []
	for r in battle.selected:
		var state := "vuurt" if r.enemy != null else ("marcheert" if r.moving() else "staat")
		var shape := "colonne" if r.formation == "column" else "linie"
		lines.append("%s: %d man in %s, %s" % [r.name, r.strength(), shape, state])
	if lines.is_empty():
		lines.append("Niets geselecteerd")
	lines.append("Klik of sleep: selecteren (Shift: toevoegen)  ·  Rechtsklik: marcheren (slepen: richting)  ·  1 linie, 2 colonne  ·  WASD/pijltjes, middelste knop, wieltje: camera")
	_bottom.text = "\n".join(lines)
	_result.text = battle.result + ("\nDruk op R voor een nieuwe slag." if battle.result != "" else "")
