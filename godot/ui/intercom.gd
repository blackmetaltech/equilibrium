class_name Intercom
extends PanelContainer
## The intercom (UI.md 3): a grille box with four name lamps (MARA, TOMAS, VICTOR, NOOR). The speaker's lamp lights and the line types out in Barlow
## (two lines at most). Coach lines keep a teal tick and a "why?" link (Mara explains). Engine refusals come as TOMAS in amber. Click for the log.
## `say(speaker, text, kind, step, why)`; kinds: coach | why | info | warn | bad.

signal why_said(step_id: String)
signal got_it()
const NAMES := ["MARA", "TOMAS", "VICTOR", "NOOR"]
var app: CbApp
var lines: Array = []          ## {time, speaker, text, kind, step, why, why_said}
var speaker := "MARA"
var current := ""              ## step id of the coach line that carries the teal tick
var chars := 0.0               ## characters of the newest line shown so far (typed out)
var full_opened := 0
var max_lines := 3             ## desktop 3, handheld 2, phone 1 (the log has the rest)
var _grille: Grille
var _lamps: LampRow
var _text: Label
var _tick: ColorRect
var _why: Button
var _got: Button
var _log: Button
const CPS := 70.0

func _init() -> void:
	EqStrings.load_strings()
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", _sb())
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 8); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(hb)
	_grille = Grille.new(); _grille.custom_minimum_size = Vector2(46, 0); hb.add_child(_grille)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 2); vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; hb.add_child(vb)
	_lamps = LampRow.new(); _lamps.owner_ic = self; vb.add_child(_lamps)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 6); row.size_flags_vertical = Control.SIZE_EXPAND_FILL; row.mouse_filter = Control.MOUSE_FILTER_IGNORE; vb.add_child(row)
	_tick = ColorRect.new(); _tick.custom_minimum_size = Vector2(3, 0); _tick.color = Color(0, 0, 0, 0); _tick.mouse_filter = Control.MOUSE_FILTER_IGNORE; row.add_child(_tick)
	_text = Label.new(); _text.name = "Line"; _text.label_settings = EqStrings.ls(15, EqTheme.TEXT)
	_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _text.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _text.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_text.text_overrun_behavior = TextServer.OVERRUN_NO_TRIMMING; _text.clip_text = true; _text.max_lines_visible = 3; _text.mouse_filter = Control.MOUSE_FILTER_IGNORE; _text.custom_minimum_size = Vector2(60, 0)
	row.add_child(_text)
	var side := VBoxContainer.new(); side.alignment = BoxContainer.ALIGNMENT_END; side.mouse_filter = Control.MOUSE_FILTER_IGNORE; row.add_child(side)
	_why = _link("Why", "IC_WHY", EqTheme.TEAL); _why.pressed.connect(func(): ask_why()); side.add_child(_why)
	_got = _link("GotIt", "IC_GOT_IT", EqTheme.TEAL); _got.pressed.connect(func(): got_it.emit()); side.add_child(_got)
	_log = _link("Log", "IC_LOG", EqTheme.DIM); _log.pressed.connect(open_full); side.add_child(_log)
	_why.visible = false; _got.visible = false
	say("MARA", EqStrings.T("IC_IDLE"), "info")

func _sb() -> StyleBoxFlat:
	var s := EqTheme.enamel_sb(4, 6.0).duplicate() as StyleBoxFlat
	s.bg_color = EqTheme.ENAMEL_LO; s.border_color = Color("#12211F"); s.set_border_width_all(2); s.border_width_bottom = 2; s.shadow_size = 0
	s.content_margin_top = 4; s.content_margin_bottom = 4
	return s

func _link(nm: String, key: String, col: Color) -> Button:
	var b := Button.new(); b.name = nm; b.text = EqStrings.T(key); b.flat = true; b.focus_mode = CbKit.focus_mode()
	b.add_theme_font_override("font", EqTheme.font("semi")); b.add_theme_font_size_override("font_size", EqTheme.fs(14))
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(c, col if c == "font_color" else col.lightened(0.3))
	b.custom_minimum_size = Vector2(0, 22)
	return b

func _color(kind: String) -> Color:
	match kind:
		"warn": return EqTheme.AMBER
		"bad": return Color("#FF7A84")
	return EqTheme.TEXT

## Add a line. Identical repeats of the newest line are ignored.
func say(who: String, text: String, kind := "info", step := "", why := "") -> void:
	if text == "": return
	who = who.to_upper()
	if not lines.is_empty() and lines.back().text == text and lines.back().speaker == who: return
	lines.append({"time": _clock(), "speaker": who, "text": text, "kind": kind, "step": step, "why": why, "why_said": false})
	if kind == "coach" and step != "": current = step
	while lines.size() > 200: lines.pop_front()
	speaker = who; chars = 0.0 if _animate() else 1.0e6
	if app != null: app.sfx("radio")
	_show_last()

func _clock() -> String:
	if app != null and app.started and app.b != null: return "%04d" % int(app.b.g.get("tick", 0))
	return "----"

func _animate() -> bool: return not CbSettings.reduced_motion and not OS.has_environment("CB_SMOKE")

func clear() -> void: lines.clear(); current = ""; _show_last()

func set_current(step_id: String) -> void: current = step_id; _show_last()

func last() -> Dictionary: return lines.back() if not lines.is_empty() else {}

func shown_text() -> String: return _text.text

func ask_why(l := {}) -> void:
	if l.is_empty(): l = last()
	if l.is_empty() or str(l.get("why", "")) == "" or l.get("why_said", false): return
	l["why_said"] = true
	say("MARA", str(l.why), "why", str(l.step)); why_said.emit(str(l.step))

func _show_last() -> void:
	if _text == null: return
	var l := last()
	var live: bool = not l.is_empty() and l.kind == "coach" and l.step != "" and l.step == current
	_tick.color = EqTheme.TEAL if live else Color(0, 0, 0, 0)
	_why.visible = live and str(l.get("why", "")) != "" and not l.get("why_said", false)
	_got.visible = live and bool(l.get("got_it", false))
	_text.label_settings = EqStrings.ls(15, _color(str(l.get("kind", "info"))))
	_text.text = str(l.get("text", "")).substr(0, int(chars)) if not l.is_empty() else ""
	_lamps.queue_redraw(); _grille.queue_redraw()
	tooltip_text = ""

func _process(dt: float) -> void:
	var l := last()
	if l.is_empty(): return
	var n := str(l.text).length()
	if chars < n:
		chars = minf(float(n), chars + CPS * dt)
		_text.text = str(l.text).substr(0, int(chars)); _grille.talk = true
	elif _grille.talk: _grille.talk = false; _grille.queue_redraw()

func _gui_input(e: InputEvent) -> void:
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: open_full(); accept_event()

## Full log, scrollable, newest at the bottom. Esc closes it (shell modal discipline).
func open_full() -> void:
	full_opened += 1
	if app == null or app.modal() != null: return
	var d: Dictionary = app.dialog("intercomlog", minf(860.0, app.vw() - 40.0), minf(600.0, app.vs_h() - 40.0), EqTheme.ENAMEL_HI, 0.5)
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 20.0))
	var vb: VBoxContainer = d.vb
	var hb := HBoxContainer.new(); vb.add_child(hb)
	var t := EqTheme.label(EqStrings.T("IC_LOG_TITLE"), 30, EqTheme.TEXT, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(t)
	var x := EqTheme.key_button(EqStrings.T("IC_CLOSE"), true, 16); x.pressed.connect(func(): d.host.queue_free()); hb.add_child(x)
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; vb.add_child(sc)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 6); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(col)
	if lines.is_empty(): col.add_child(EqTheme.label(EqStrings.T("IC_EMPTY"), 16, EqTheme.DIM))
	for l in lines:
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); col.add_child(row)
		row.add_child(EqTheme.label(str(l.time), 14, EqTheme.DIM, "mono"))
		var who := EqTheme.label(str(l.speaker), 15, EqTheme.TEAL if l.speaker == "MARA" else EqTheme.AMBER if l.speaker == "TOMAS" else EqTheme.TEXT, "semi"); who.custom_minimum_size = Vector2(70, 0); row.add_child(who)
		var tx := Label.new(); tx.text = str(l.text); tx.label_settings = EqStrings.ls(16, _color(str(l.kind))); tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tx.size_flags_horizontal = Control.SIZE_EXPAND_FILL; row.add_child(tx)
	sc.set_deferred("scroll_vertical", 100000)
	x.call_deferred("grab_focus")

## The four name lamps; the current speaker's is lit.
class LampRow extends Control:
	var owner_ic: Intercom
	func _init() -> void:
		custom_minimum_size = Vector2(0, 20); mouse_filter = Control.MOUSE_FILTER_IGNORE; size_flags_horizontal = Control.SIZE_EXPAND_FILL
	func _draw() -> void:
		var f := EqStrings.font("cap"); var sz := EqTheme.fs(13)
		var x := 0.0
		var widths: Array = []; var total := 0.0
		for n in Intercom.NAMES:
			var w := f.get_string_size(n, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x + 28.0; widths.append(w); total += w
		var tight := total > size.x   # narrow console: only the speaker's name is spelled out, the other lamps are dots
		for i in 4:
			var n: String = Intercom.NAMES[i]
			var on: bool = owner_ic != null and owner_ic.speaker == n
			var col := EqTheme.AMBER if (on and owner_ic != null and owner_ic.last().get("kind", "") in ["warn", "bad"]) else EqTheme.TEAL
			var c := Vector2(x + 7, size.y * 0.5)
			draw_circle(c, 6.0, Color("#0E1A18")); draw_circle(c, 4.5, col if on else col.darkened(0.78))
			if on: draw_circle(c + Vector2(-1, -1.2), 1.4, Color(1, 1, 1, 0.8)); draw_circle(c, 9.0, Color(col, 0.18))
			var w: float = widths[i]
			if not tight or on:
				draw_string(f, Vector2(x + 18, size.y * 0.5 + sz * 0.35), n, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, EqTheme.TEXT if on else EqTheme.DIM)
			else: w = 22.0
			x += w

## The speaker grille: slots drawn on a recessed disc; the slots shimmer while a line is typing.
class Grille extends Control:
	var talk := false
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; set_process(true)
	func _process(_dt: float) -> void: if talk: queue_redraw()
	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size).grow(-2.0)
		var cn := r.get_center()
		draw_rect(r, Color("#0B1413")); draw_rect(r, EqTheme.ENAMEL_HI, false, 1.0)
		var rad := minf(r.size.x, r.size.y) * 0.5 - 4.0
		draw_circle(cn, rad, Color("#14211F"))
		var n := 7
		for i in n:
			var y := cn.y - rad * 0.72 + (rad * 1.44) * float(i) / float(n - 1)
			var h := sqrt(maxf(0.0, rad * rad - (y - cn.y) * (y - cn.y)))
			var wob := (sin(Time.get_ticks_msec() * 0.02 + i) * 1.5) if talk else 0.0
			draw_line(Vector2(cn.x - h * 0.8, y), Vector2(cn.x + h * 0.8 + wob, y), Color("#050909"), 2.0)
			draw_line(Vector2(cn.x - h * 0.8, y + 1.5), Vector2(cn.x + h * 0.8 + wob, y + 1.5), Color(EqTheme.ENAMEL_HI, 0.5), 1.0)

func set_max_lines(n: int) -> void:
	max_lines = n; _text.max_lines_visible = n
	_text.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS if n == 1 else TextServer.OVERRUN_NO_TRIMMING
