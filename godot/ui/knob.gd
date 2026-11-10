class_name Knob
extends Control
## A Bakelite rotary knob: 270 degree sweep, drag to rotate (Shift or LT = fine), mouse wheel (coarse; Ctrl/Shift = fine), arrow keys / D-pad when focused,
## tap the number for the keypad. Works in display units; the owner converts to SI. Emits `committed(value)` once the player lets go (or after the wheel
## pauses), never per mouse move. Choice knobs (`choices` non-empty) step through the options and report the index.
signal committed(value: float)
signal changing(value: float)
const SWEEP := 270.0
const R := 27.0
var app = null
var label := ""
var unit := ""              # display symbol shown after the number
var lo := 0.0
var hi := 1.0
var coarse := 0.1
var fine := 0.01
var value := 0.0
var integer := false
var choices: Array = []
var editable := true
var relative := false        ## the wheel steps by a share of the value in 1/2/5 steps (log-like), not a fixed share of the range
var _drag := false
var _last_ang := 0.0
var _f := 0.0
var _timer: Timer
var _hover_num := false

func _init() -> void:
	custom_minimum_size = Vector2(96, 132); focus_mode = Control.FOCUS_ALL; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_timer = Timer.new(); _timer.one_shot = true; _timer.wait_time = 0.3; add_child(_timer); _timer.timeout.connect(_flush)

func setup(p_label: String, p_unit: String, p_lo: float, p_hi: float, p_coarse: float, p_fine: float, p_value: float, p_int := false, p_choices: Array = []) -> Knob:
	label = p_label; unit = p_unit; lo = p_lo; hi = p_hi; coarse = p_coarse; fine = p_fine; integer = p_int; choices = p_choices
	set_value(p_value); return self

func set_value(v: float) -> void:
	value = clampf(v, lo, hi); _f = (value - lo) / maxf(hi - lo, 1e-12); queue_redraw()

func value_text() -> String:
	if not choices.is_empty(): return str(choices[clampi(int(round(value)), 0, choices.size() - 1)]).to_upper() if str(choices[clampi(int(round(value)), 0, choices.size() - 1)]) != "" else "—"
	return PaperStrings.num(value, integer) + (" " + unit if unit != "" else "")

func _center() -> Vector2: return Vector2(size.x * 0.5, 4.0 + R + 4.0)
func _num_rect() -> Rect2: return Rect2(0, 4.0 + R * 2.0 + 10.0, size.x, 24.0)

func _snap(v: float, step: float) -> float:
	if integer or not choices.is_empty(): return clampf(roundf(v), lo, hi)
	if step <= 0.0: return clampf(v, lo, hi)
	return clampf(roundf(v / step) * step, lo, hi)

func _fine_mod() -> bool: return Input.is_key_pressed(KEY_SHIFT) or Input.is_key_pressed(KEY_CTRL) or Input.get_joy_axis(0, JOY_AXIS_TRIGGER_LEFT) > 0.4 or Input.get_joy_axis(0, JOY_AXIS_TRIGGER_RIGHT) > 0.4

## A round step (1, 2, 5 x 10^n) at or just under x.
static func nice(x: float) -> float:
	if x <= 0.0: return 1.0
	var e := pow(10.0, floorf(log(x) / log(10.0))); var m := x / e
	return e * (5.0 if m >= 5.0 else 2.0 if m >= 2.0 else 1.0)

func rel_step(fine_step: bool) -> float:
	var floor_st := maxf((hi - lo) * 1e-5, 1e-9)
	return maxf(nice(absf(value) * (0.002 if fine_step else 0.02)), nice(floor_st))

func _step(dir: int, fine_step: bool) -> void:
	var st := 1.0 if (integer or not choices.is_empty()) else (fine if fine_step else coarse)
	if relative and not integer and choices.is_empty(): st = rel_step(fine_step)
	var v := value + dir * st
	if relative and choices.is_empty(): v = snappedf(v, st * 0.001); set_value(v); changing.emit(value); _timer.start(); return
	if not choices.is_empty(): v = wrapf(v, lo, hi + 1.0)   # options wrap around like a selector
	set_value(_snap(v, st)); changing.emit(value); _timer.start()

func _flush() -> void: committed.emit(value)

func _gui_input(e: InputEvent) -> void:
	if not editable: return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed:
				grab_focus()
				if _num_rect().has_point(mb.position): _tap_number(); accept_event(); return
				if (mb.position - _center()).length() <= R + 8.0:
					_drag = true; _last_ang = _angle(mb.position)
					if not choices.is_empty(): _step(1, false); _drag = false
					accept_event()
			else:
				if _drag: _drag = false; set_value(_snap(value, fine)); queue_redraw(); _timer.stop(); committed.emit(value)
				accept_event()
		elif mb.pressed and (mb.button_index == MOUSE_BUTTON_WHEEL_UP or mb.button_index == MOUSE_BUTTON_WHEEL_DOWN):
			_step(1 if mb.button_index == MOUSE_BUTTON_WHEEL_UP else -1, _fine_mod()); accept_event()
	elif e is InputEventMouseMotion:
		var mm := e as InputEventMouseMotion
		_hover_num = _num_rect().has_point(mm.position)
		if _drag:
			var d := mm.position - _center()
			if d.length() > 6.0:
				var a := _angle(mm.position); var da := wrapf(a - _last_ang, -180.0, 180.0); _last_ang = a
				_f = clampf(_f + da / SWEEP * (0.1 if _fine_mod() else 1.0), 0.0, 1.0)
				value = lo + _f * (hi - lo); changing.emit(_snap(value, fine)); queue_redraw()
		queue_redraw()
	elif e.is_action_pressed("ui_right") or e.is_action_pressed("ui_up"): _step(1, _fine_mod()); accept_event()
	elif e.is_action_pressed("ui_left") or e.is_action_pressed("ui_down"): _step(-1, _fine_mod()); accept_event()
	elif e.is_action_pressed("ui_accept"): _tap_number(); accept_event()

func _angle(p: Vector2) -> float:
	var d := p - _center()
	return rad_to_deg(atan2(d.x, -d.y))

func _tap_number() -> void:
	if not choices.is_empty(): _step(1, false); return
	if app == null: return
	var shown := PaperStrings.num(value, integer)
	Knob.keypad(app, label, unit, shown, lo, hi, func(v: float) -> void: set_value(_snap(v, 0.0)); changing.emit(value); committed.emit(value), integer)

func _draw() -> void:
	var c := _center()
	var vf := Vector2(0, 0)
	# scale ticks
	for i in range(0, 11):
		var a := deg_to_rad(-SWEEP * 0.5 + SWEEP * i / 10.0); var dir := Vector2(sin(a), -cos(a))
		draw_line(c + dir * (R + 4.0), c + dir * (R + (9.0 if i % 5 == 0 else 7.0)), EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.3), 2.0 if i % 5 == 0 else 1.0, true)
	# body
	draw_circle(c + Vector2(0, 2.5), R, Color(0, 0, 0, 0.22))
	draw_circle(c, R, EqTheme.BAKELITE)
	draw_arc(c, R - 1.0, deg_to_rad(200.0), deg_to_rad(320.0), 18, Color(1, 1, 1, 0.16), 2.0, true)   # moulded highlight
	draw_circle(c, R * 0.62, EqTheme.BAKELITE.lightened(0.07))
	for k in range(12):   # knurled skirt
		var ka := TAU * k / 12.0; draw_line(c + Vector2.from_angle(ka) * (R - 4.0), c + Vector2.from_angle(ka) * (R - 1.0), EqTheme.BAKELITE.lightened(0.18), 1.5, true)
	var a := deg_to_rad(-SWEEP * 0.5 + SWEEP * _f); var pd := Vector2(sin(a), -cos(a))
	draw_line(c + pd * (R * 0.18), c + pd * (R - 2.0), Color("#F4EEE2"), 3.5, true)
	draw_circle(c, 3.0, EqTheme.BAKELITE.darkened(0.2))
	if has_focus(): draw_arc(c, R + 2.0, 0.0, TAU, 48, EqTheme.TEAL, 3.0, true)
	if _drag: draw_arc(c, R + 12.0, deg_to_rad(-SWEEP * 0.5 - 90.0), deg_to_rad(-SWEEP * 0.5 - 90.0 + SWEEP * _f), 40, EqTheme.TEAL, 3.0, true)
	# number, then the unit in a smaller hand beside it
	var nr := _num_rect(); var f := EqTheme.font("mono_bold"); var fs := EqTheme.fs(14)
	var num_t := _num_text(); var uf := EqTheme.font("sans"); var us := EqTheme.fs(13)
	var nw := f.get_string_size(num_t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x; var uw := uf.get_string_size(" " + unit, HORIZONTAL_ALIGNMENT_LEFT, -1, us).x if unit != "" and choices.is_empty() else 0.0
	var tx := maxf(0.0, (size.x - nw - uw) * 0.5)
	draw_string(f, Vector2(tx, nr.position.y + 17.0), num_t, HORIZONTAL_ALIGNMENT_LEFT, size.x, fs, EqTheme.INK)
	if uw > 0.0: draw_string(uf, Vector2(tx + nw, nr.position.y + 17.0), " " + unit, HORIZONTAL_ALIGNMENT_LEFT, size.x, us, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.3))
	draw_line(Vector2(tx, nr.position.y + 21.0), Vector2(tx + minf(nw + uw, size.x), nr.position.y + 21.0), EqTheme.TEAL if _hover_num else EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.6), 1.5)
	# Dymo label: one or two strips of tape
	var lf := EqTheme.font("dymo"); var ls := EqTheme.fs(13)
	var words := label.to_upper().split(" ", false); var lines: Array = [label.to_upper()]
	if lf.get_string_size(lines[0], HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x + 10.0 > size.x and words.size() > 1:
		var best := 1; var bd := 1e9
		for i in range(1, words.size()):
			var l1 := " ".join(words.slice(0, i)); var l2 := " ".join(words.slice(i))
			var d := absf(lf.get_string_size(l1, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x - lf.get_string_size(l2, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x)
			if d < bd: bd = d; best = i
		lines = [" ".join(words.slice(0, best)), " ".join(words.slice(best))]
	for i in lines.size():
		var lt: String = lines[i]
		var lw := minf(lf.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x + 10.0, size.x)
		var lr := Rect2((size.x - lw) * 0.5, size.y - 19.0 - (lines.size() - 1 - i) * 18.0, lw, 17.0)
		draw_rect(lr, EqTheme.DYMO_TAPE); draw_string(lf, lr.position + Vector2(5, 13.0), lt, HORIZONTAL_ALIGNMENT_LEFT, lw - 6.0, ls, EqTheme.DYMO_TEXT)

func _num_text() -> String:
	if not choices.is_empty(): return value_text()
	return PaperStrings.num(value, integer)

# ---- keypad (also used by the notebook's Call-it answer line) ----------------------------------------------------------------
class KeyCatcher extends Control:
	var on_key: Callable
	func _init() -> void: focus_mode = Control.FOCUS_NONE; mouse_filter = Control.MOUSE_FILTER_IGNORE; custom_minimum_size = Vector2(1, 1)
	## `_input`, not unhandled input: a focused keypad button would otherwise swallow Enter, and synthetic key events carry a keycode but no unicode.
	func _input(e: InputEvent) -> void:
		if e is InputEventKey and e.pressed and not e.echo and on_key.is_valid():
			if bool(on_key.call(e)): get_viewport().set_input_as_handled()

static func keypad(app, title: String, unit: String, initial: String, lo: float, hi: float, on_ok: Callable, integer := false, allow_range := true) -> Dictionary:
	var d: Dictionary = app.dialog("keypad", 340.0, 0.0, EqTheme.TEAL, 0.5)
	var host: Control = d.host; var pn: PanelContainer = d.panel; var vb: VBoxContainer = d.vb
	pn.add_theme_stylebox_override("panel", EqTheme.porcelain_sb(6, 18.0))
	vb.add_theme_constant_override("separation", 10)
	var head := HBoxContainer.new(); vb.add_child(head); var ttl := EqTheme.dymo(title if title != "" else "VALUE", 14); ttl.name = "Title"; ttl.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN; head.add_child(ttl)
	var ttl_l := ttl.get_child(0) as Label; ttl_l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; ttl_l.custom_minimum_size = Vector2(minf(280.0, 24.0 + 9.0 * title.length()), 0)   # a long title wraps on the tape, never truncates
	var disp := Label.new(); disp.label_settings = EqTheme.settings(30, EqTheme.INK, "mono_bold"); disp.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	var field := PanelContainer.new(); var fsb := StyleBoxFlat.new(); fsb.bg_color = Color("#FFFFFF"); fsb.border_color = EqTheme.INK; fsb.set_border_width_all(2); fsb.set_corner_radius_all(3); fsb.set_content_margin_all(8)
	field.add_theme_stylebox_override("panel", fsb); field.add_child(disp); vb.add_child(field)
	var absurd := hi >= 1.0e6 or lo <= -1.0e6   # a bound nobody could type: say only what the number is in
	var hint_t := (PaperStrings.t("KEYPAD_IN") % unit if unit != "" else "") if absurd else (PaperStrings.t("KEYPAD_RANGE") % [PaperStrings.num(lo, integer or lo == roundf(lo)), PaperStrings.num(hi, integer or hi == roundf(hi))]) + (" " + unit if unit != "" else "")
	var hint := EqTheme.label(hint_t, 14, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "sans")
	if allow_range: vb.add_child(hint)
	var buf := [initial if initial != "" else ""]
	var upd := func() -> void: disp.text = (buf[0] if buf[0] != "" else "0") + (" " + unit if unit != "" else "")
	upd.call()
	var fresh := [true]   # the first key replaces the shown value
	var press := func(ch: String) -> void:
		if fresh[0]: buf[0] = ""; fresh[0] = false
		match ch:
			"C": buf[0] = ""
			"B": buf[0] = (buf[0] as String).left(maxi(0, (buf[0] as String).length() - 1))
			"±": buf[0] = (buf[0] as String).substr(1) if (buf[0] as String).begins_with("-") else "-" + buf[0]
			".": if not (buf[0] as String).contains(".") and not integer: buf[0] += ("0." if buf[0] == "" else ".")
			_: buf[0] += ch
		hint.label_settings = EqTheme.settings(14, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "sans"); upd.call()
	var enter := func() -> void:
		var s: String = buf[0]
		if s == "" or not s.is_valid_float(): return
		var v := s.to_float()
		if v < lo - 1e-9 or v > hi + 1e-9:
			hint.label_settings = EqTheme.settings(14, EqTheme.RED, "semi"); return
		host.queue_free(); on_ok.call(v)
	var grid := GridContainer.new(); grid.columns = 3; grid.add_theme_constant_override("h_separation", 8); grid.add_theme_constant_override("v_separation", 8); vb.add_child(grid)
	for k in ["7", "8", "9", "4", "5", "6", "1", "2", "3", "±", "0", "."]:
		var kb := EqTheme.key_button(k, false, 22); kb.custom_minimum_size = Vector2(88, 52); kb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		kb.pressed.connect(func(): press.call(k)); grid.add_child(kb)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 8); vb.add_child(row)
	var kc := EqTheme.key_button(PaperStrings.t("KEYPAD_CLEAR"), false, 18); kc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; kc.pressed.connect(func(): press.call("C")); row.add_child(kc)
	var ko := EqTheme.key_button(PaperStrings.t("KEYPAD_OK"), true, 18); ko.size_flags_horizontal = Control.SIZE_EXPAND_FILL; ko.pressed.connect(func(): enter.call()); row.add_child(ko)
	var catcher := KeyCatcher.new(); host.add_child(catcher)
	catcher.on_key = func(e: InputEventKey) -> bool:
		if e.ctrl_pressed or e.alt_pressed or e.meta_pressed: return false
		var u := e.unicode
		var code: int = e.keycode if e.keycode != KEY_NONE else e.physical_keycode
		if u >= 48 and u <= 57: press.call(char(u)); return true
		if code >= KEY_0 and code <= KEY_9: press.call(char(48 + code - KEY_0)); return true
		if code >= KEY_KP_0 and code <= KEY_KP_9: press.call(char(48 + code - KEY_KP_0)); return true
		if u == 46 or u == 44 or code == KEY_PERIOD or code == KEY_COMMA or code == KEY_KP_PERIOD: press.call("."); return true
		if u == 45 or code == KEY_MINUS or code == KEY_KP_SUBTRACT: press.call("±"); return true
		match code:
			KEY_BACKSPACE, KEY_DELETE: press.call("B"); return true
			KEY_ENTER, KEY_KP_ENTER: enter.call(); return true   # commits and closes (a value out of range stays open and says so)
		return false
	app.focus_dialog()
	return d
