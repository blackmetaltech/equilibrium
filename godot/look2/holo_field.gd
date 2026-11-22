class_name HoloField
extends HBoxContainer
## A small numeric control for the glass panels: a label, minus, a typed value and plus. The world's handwheel is the control; this is its mirror and the
## fallback for a keyboard or a pad. `committed(v)` fires when the player steps, presses Enter or leaves the box. Values are in the field's own unit.
signal committed(v: float)
var lo := 0.0
var hi := 1.0
var step := 0.1
var decimals := 2
var unit := ""
var zero_text := ""          ## shown instead of 0 (off); typing it or 0 gives 0
var value := 0.0:
	set(v): value = v; _show()
var enabled := true:
	set(v): enabled = v; if _edit != null: _edit.editable = v; _minus.disabled = not v; _plus.disabled = not v
var _edit: LineEdit
var _minus: Button
var _plus: Button
var _name: Label

func _init(title := "", unit_text := "") -> void:
	unit = unit_text; add_theme_constant_override("separation", 6); mouse_filter = Control.MOUSE_FILTER_IGNORE
	_name = HoloTheme.label(title, 16, HoloTheme.MUTED, 500); _name.custom_minimum_size.x = 92; add_child(_name)
	_minus = HoloTheme.button("-", "", 18); _minus.custom_minimum_size = Vector2(34, 34); _minus.focus_mode = Control.FOCUS_NONE; _minus.pressed.connect(_nudge.bind(-1.0)); add_child(_minus)
	_edit = LineEdit.new(); _edit.custom_minimum_size = Vector2(84, 34); _edit.alignment = HORIZONTAL_ALIGNMENT_CENTER; _edit.select_all_on_focus = true
	_edit.add_theme_font_override("font", HoloTheme.font(600)); _edit.add_theme_font_size_override("font_size", HoloTheme.fs(17))
	for c in ["font_color", "font_uneditable_color", "font_selected_color"]: _edit.add_theme_color_override(c, HoloTheme.INK)
	_edit.add_theme_stylebox_override("normal", HoloTheme.box(Color(0, 0, 0, 0.28), Color(1, 1, 1, 0.20), 1, 8, 6))
	_edit.add_theme_stylebox_override("focus", HoloTheme.box(Color(0, 0, 0, 0.4), HoloTheme.TEAL_HI, 2, 8, 6))
	_edit.add_theme_stylebox_override("read_only", HoloTheme.box(Color(0, 0, 0, 0.15), Color(1, 1, 1, 0.1), 1, 8, 6))
	_edit.text_submitted.connect(func(_t): _commit_text(); _edit.release_focus())
	_edit.focus_exited.connect(_commit_text)
	add_child(_edit)
	_plus = HoloTheme.button("+", "", 18); _plus.custom_minimum_size = Vector2(34, 34); _plus.focus_mode = Control.FOCUS_NONE; _plus.pressed.connect(_nudge.bind(1.0)); add_child(_plus)
	if unit != "": var u := HoloTheme.label(unit, 16, HoloTheme.MUTED, 500); u.custom_minimum_size.x = 44; add_child(u)

func editing() -> bool: return _edit != null and _edit.has_focus()

func _fmt(v: float) -> String:
	if v == 0.0 and zero_text != "": return zero_text
	return ("%." + str(decimals) + "f") % v

func _show() -> void:
	if _edit != null and not _edit.has_focus(): _edit.text = _fmt(value)

## The engine's value, shown unless the player is typing.
func set_value(v: float) -> void:
	if editing(): return
	value = v

func _nudge(dir: float) -> void:
	if not enabled: return
	_set_commit(snappedf(clampf(value + dir * step, lo, hi), pow(10.0, -float(decimals + 1))))

func _commit_text() -> void:
	if _edit == null or not enabled: return
	var t := _edit.text.strip_edges().to_lower()
	if t == _fmt(value).to_lower(): return   # untouched: the shown rounding is not a new value
	if t == zero_text.to_lower() and zero_text != "": _set_commit(0.0); return
	if not t.is_valid_float(): _show(); return
	var v := clampf(float(t), lo, hi)
	if absf(v - value) < pow(10.0, -float(decimals + 2)): _show(); return
	_set_commit(v)

func _set_commit(v: float) -> void:
	value = v; committed.emit(v)
