class_name HoloHud
extends Control
## LOOK2 instrumentation for the slice levels. L00 Night Shift: small tags anchored to the equipment (a dot, the name, one value, a thin leader line) that
## open into the full card only on focus (hovered, picked, or the camera on it; one card at a time), the equilibrium diagram docked in a corner (click to
## enlarge in place), the command panel (cooler dial, shift clock, speed), the coach line with toasts, the alarm strip, the opening brief and the glass end card.
## L14 The Brown Gas: the same shell with HoloFlask (look2/holo_flask.gd) for the flask's command panel, tags and the test checklist.
## The world's own handwheels send lab.control_changed(key, value); the HUD dial mirrors them (set_control_value) and stays as the fallback.
## Reads the engine through app.b (queries and the snapshot); engine actions: setpoint on the cooler, setSpeed, markCoach (L00); setParam, setFeed, callIt,
## commission (L14). Contract with look2.gd: build, setup, refresh, layout, toast, end_card, key.
const SPEEDS := [0, 1, 4, 16]
const ANN_TEXT := {"cw": "Cooling water pump", "hi": "Converter temperature high", "hh": "Converter temperature very high", "ilk": "Interlock", "flare": "Flare"}
const CARD_ROLES := ["converter", "cooler", "separator", "compressor", "flare"]
const ROLE_ALIAS := {"gauge": "flask", "wheel_v": "flask", "wheel_t": "flask"}   ## FlaskLab: picking the flask gauge or wheels opens the flask card
const KEY_HINT := "Keys: 1 to 6 views, X x-ray, Q and E turn, [ ] dial"
const M_NH3 := 17.0305

class Dot extends Control:
	var state := "normal"   ## off, normal, high, critical
	var col := HoloTheme.TEAL
	func _init() -> void: custom_minimum_size = Vector2(14, 14); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(_dt: float) -> void: if state == "high" or state == "critical": queue_redraw()
	func _draw() -> void:
		var c := size * 0.5; var t := Time.get_ticks_msec() * 0.001
		match state:
			"off": draw_circle(c, 4.0, Color(1, 1, 1, 0.22))
			"high":
				var a := 0.45 + 0.55 * (0.5 + 0.5 * sin(t * TAU * 1.5))
				draw_circle(c, 7.0, Color(HoloTheme.AMBER, 0.18 * a)); draw_circle(c, 5.0, Color(HoloTheme.AMBER, a))
			"critical":
				var a := 0.4 + 0.6 * (0.5 + 0.5 * sin(t * TAU * 3.0))
				draw_circle(c, 7.0, Color(HoloTheme.RED, 0.25 * a)); draw_circle(c, 5.0, Color(HoloTheme.RED, a))
			_: draw_circle(c, 7.0, Color(col, 0.14)); draw_circle(c, 4.5, col)

class Lines extends Control:
	var hud
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; set_anchors_preset(Control.PRESET_FULL_RECT)
	func _process(_dt: float) -> void: queue_redraw()
	func _draw() -> void:
		if hud == null: return
		var t := Time.get_ticks_msec() * 0.001
		for l in hud.line_data:
			var a: Vector2 = l.a; var b: Vector2 = l.b; var al: float = l.alpha
			if al < 0.02: continue
			if l.get("thin", false):   # a tag's leader: one hairline and a small dot
				draw_line(a, b, Color(HoloTheme.TEAL_HI, 0.55 * al), 1.0, true); draw_circle(a, 3.0, Color(1, 1, 1, 0.9 * al)); continue
			draw_line(a, b, Color(HoloTheme.TEAL, 0.16 * al), 4.0, true)
			draw_line(a, b, Color(HoloTheme.TEAL_HI, 0.75 * al), 1.2, true)
			var ring := 5.0 + 3.0 * fposmod(t * 0.7, 1.0)
			draw_arc(a, ring, 0.0, TAU, 20, Color(HoloTheme.TEAL_HI, 0.5 * al * (1.0 - fposmod(t * 0.7, 1.0))), 1.2, true)
			draw_circle(a, 4.5, Color(HoloTheme.TEAL, 0.35 * al)); draw_circle(a, 2.6, Color(1, 1, 1, al))
			draw_circle(b, 2.2, Color(HoloTheme.TEAL_HI, al))

var app
var lab   ## LabWorld or FlaskLab
var ids := {}
var line_data: Array = []
var _built := false
var _lines: Lines
var _fl: HoloFlask        ## L14: the flask's command panel, tags and checklist (null on L00)
var _roles: Array = []    ## the roles that have a tag and a card on this level
var _cards := {}          ## role -> {p: HoloPanel, v: {key: HoloNum}, dot, txt, cur: Vector2, pick: int, tagkey}
var _tags := {}           ## role -> {p: HoloPanel, dot: Dot, num: HoloNum or null, txt: Label or null, cur: Vector2, pick: int}
var _focus := ""          ## the role whose card is open (at most one)
var _hover_role := ""
var _hover_until := 0.0
var _pick_role := ""
var _pick_until := 0.0
var _cam_role := ""
var _dg_big := false
var _ctl_last := {}       ## key -> msec of the last commit from the world's wheel
var _ctl_pend := {}       ## key -> value waiting for the trailing commit
var _dg_panel: HoloPanel
var _diagram: HoloDiagram
var _cmd: HoloPanel
var _dial: HoloDial
var _out_num: HoloNum
var _clock_num: Label
var _clock_tot: Label
var _clock_bar: Control
var _play: Button
var _speed_btns: Array[Button] = []
var _coach: HoloPanel
var _coach_name: Label
var _coach_text: Label
var _coach_why: Label
var _coach_whybtn: Button
var _toast_lbl: Label
var _toast_until := 0.0
var _alarm: HoloPanel
var _ann_rows := {}       ## key -> {dot, label}
var _ann_box: VBoxContainer
var _brief: HoloPanel
var _dim: ColorRect
var _brief_done := false
var _end: HoloPanel
var _stream_of := {}      ## role -> stream id (outlet of the unit)
var _pending_k := -1.0
var _last_t := -1.0
var _last_speed := -1
var _last_play := ""
var _compact := false
var _li: Dictionary = {}
var _status := "playing"
var _tripped := false
var _coach_sig := ""
var _coach_role := ""   ## the role the coach points at

# ---------------------------------------------------------------------------------------------------------------------------------------------
func build() -> void:
	set_anchors_preset(Control.PRESET_FULL_RECT); mouse_filter = Control.MOUSE_FILTER_IGNORE
	_lines = Lines.new(); _lines.hud = self; _lines.name = "Lines"; add_child(_lines)
	var l14: bool = app != null and app.look2 != null and str(app.look2.level) == "L14"
	if l14:
		_fl = HoloFlask.new(self); _fl.build()
	else:
		_build_cards(); _build_diagram(); _build_cmd(); _build_alarm()
	_build_coach(); _build_brief()
	_built = true
	if lab != null and lab.has_signal("picked"): lab.picked.connect(_on_picked)
	if lab != null and lab.has_signal("control_changed"): lab.control_changed.connect(_on_control)
	layout()
	for p in _panels(): p.fit()
	_cmd.appear(0.3)

func _panels() -> Array:
	var a: Array = [_dg_panel, _cmd, _coach, _alarm, _brief, _end]
	for r in _cards: a.append(_cards[r].p); a.append(_tags[r].p)
	return a.filter(func(x): return x != null)

func setup(role_ids: Dictionary) -> void:
	ids = role_ids; _stream_of = {}
	if app == null or app.b == null: return
	var pl = app.b.q("plant")
	if not (pl is Dictionary): return
	for r in ["converter", "cooler", "compressor", "separator", "flask"]:
		for s in pl.get("streams", []):
			var f: Dictionary = s.get("from", {})
			if str(f.get("unit", "")) == str(ids.get(r, "?")) and str(f.get("port", "")) == ("liq" if r == "separator" else "out"): _stream_of[r] = str(s.id)
	if _fl != null: _fl.setup()

func _row(parent: Control, label: String, num: Control) -> void:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 14); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := HoloTheme.label(label, 16, HoloTheme.MUTED, 500); l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	h.add_child(l); h.add_child(num); parent.add_child(h)

func _num(fmt: String, suffix: String, size_px := 18) -> HoloNum:
	var n := HoloNum.new(size_px, 600); n.fmt = fmt; n.suffix = suffix; n.custom_minimum_size.x = 92; return n

func _state_row(parent: Control, label: String) -> Array:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 8); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var l := HoloTheme.label(label, 16, HoloTheme.MUTED, 500); l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var d := Dot.new(); d.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var t := HoloTheme.label("", 16, HoloTheme.INK, 600)
	h.add_child(l); h.add_child(d); h.add_child(t); parent.add_child(h)
	return [d, t]

func _build_cards() -> void:
	var defs := {
		"converter": ["Converter", [["out", "Outlet", "%.0f", " °C"], ["nh3", "Ammonia out", "%.1f", " %"]], "nh3", "", false],
		"cooler": ["Cooler", [["out", "Outlet", "%.0f", " °C"], ["dial", "Dial asks", "%.0f", " °C"]], "out", "Cooling water", false],
		"separator": ["Separator", [["liq", "Liquid ammonia", "%.0f", " kg/h"]], "liq", "", false],
		"compressor": ["Compressor", [["bar", "Discharge", "%.0f", " bar"]], "bar", "", false],
		"flare": ["Flare", [], "", "Status", true],
	}
	for role in CARD_ROLES:
		var d: Array = defs[role]
		_add_role(role, d[0], d[1], d[2], d[3], d[4])

## One piece of equipment: a tag (dot, name, one value) that is always there, and the card (every reading) that opens on focus. rows: [key, label, fmt, suffix].
## tagkey names the row the tag shows; text_tag shows a word instead of a number; state_label adds a dot-and-word row to the card (cooling water, flare status).
func _add_role(role: String, title: String, rows: Array, tagkey: String, state_label := "", text_tag := false) -> void:
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 3); vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(HoloTheme.label(title, 16, HoloTheme.TEAL_HI, 700))
	var vals := {}; var tfmt := "%.0f"; var tsuf := ""
	for r in rows:
		var n := _num(r[2], r[3]); if r[0] == "liq": n.group = true
		vals[r[0]] = n; _row(vb, r[1], n)
		if r[0] == tagkey: tfmt = r[2]; tsuf = r[3]
	var c := {"v": vals, "cur": Vector2.ZERO, "pick": 0, "tagkey": tagkey}
	if state_label != "": var s := _state_row(vb, state_label); c["dot"] = s[0]; c["txt"] = s[1]
	var p := HoloPanel.new(vb, 12); p.name = "Card_" + role; p.visible = false; add_child(p); c["p"] = p
	_cards[role] = c
	# the tag
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 7); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var dot := Dot.new(); dot.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var t := {"dot": dot, "cur": Vector2.ZERO, "pick": 0, "num": null, "txt": null}
	hb.add_child(dot); hb.add_child(HoloTheme.label(title, 16, HoloTheme.MUTED, 600))
	if text_tag or tagkey == "":
		var l := HoloTheme.label("", 16, HoloTheme.INK, 600); hb.add_child(l); t["txt"] = l
	else:
		var n2 := HoloNum.new(16, 600); n2.fmt = tfmt; n2.suffix = tsuf; n2.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT; hb.add_child(n2); t["num"] = n2
	var tp := HoloPanel.new(hb, 8); tp.name = "Tag_" + role; tp.visible = false; add_child(tp); t["p"] = tp
	_tags[role] = t
	_roles.append(role)

## A reading for a role: the card's row, and the tag when it is the tag's value.
func _put(role: String, key: String, v: float) -> void:
	if not _cards.has(role): return
	var c: Dictionary = _cards[role]
	if c.v.has(key): (c.v[key] as HoloNum).set_value(v)
	if key == str(c.tagkey) and _tags[role].num != null: (_tags[role].num as HoloNum).set_value(v)

## A word for a role: the tag's text and the card's status word.
func _put_txt(role: String, text: String) -> void:
	if not _cards.has(role): return
	if _tags[role].txt != null: (_tags[role].txt as Label).text = text
	if _cards[role].has("txt"): (_cards[role].txt as Label).text = text

## The dot state (off, normal, high, critical) on the tag and on the card's status row.
func _put_state(role: String, st: String) -> void:
	if not _cards.has(role): return
	(_tags[role].dot as Dot).state = st
	if _cards[role].has("dot"): (_cards[role].dot as Dot).state = st

func _build_diagram() -> void:
	_diagram = HoloDiagram.new(); _diagram.mini = true; _dg_panel = HoloPanel.new(_diagram, 12); _dg_panel.name = "Diagram"; _dg_panel.visible = false; add_child(_dg_panel)
	_dg_panel.mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	_dg_panel.gui_input.connect(func(e: InputEvent):
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: toggle_diagram(); _dg_panel.accept_event())

## The diagram sits docked in the top-right corner; a click makes it big in place, another puts it back.
func toggle_diagram() -> void:
	_dg_big = not _dg_big; _diagram.mini = not _dg_big; _size_dock(); _diagram.queue_redraw()

func _size_dock() -> void:
	if _diagram == null: return
	var c := _vp().x < 1500.0
	var pad := Vector2(28.0, 18.0)   # the panel's margins around the content
	var tot := (Vector2(360, 300) if c else Vector2(440, 360)) if _dg_big else (Vector2(240, 160) if c else Vector2(300, 200))
	_diagram.custom_minimum_size = tot - pad
	_dg_panel.fit()

func _build_cmd() -> void:
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 4); col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 16); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_dial = HoloDial.new(); _dial.name = "Dial"; _dial.custom_minimum_size = Vector2(150, 142); _dial.committed.connect(_commit_dial); _dial.changed.connect(func(k: float): if lab != null: lab.set_control_value("T", k)); h.add_child(_dial)
	h.add_child(_vsep())
	var mid := VBoxContainer.new(); mid.add_theme_constant_override("separation", 2); mid.mouse_filter = Control.MOUSE_FILTER_IGNORE; mid.custom_minimum_size.x = 150
	mid.add_child(HoloTheme.label("Cooler outlet", 16, HoloTheme.MUTED, 500))
	_out_num = HoloNum.new(30, 600); _out_num.fmt = "%.0f"; _out_num.suffix = " °C"; _out_num.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT; mid.add_child(_out_num)
	mid.add_child(HoloTheme.label("Shift clock", 16, HoloTheme.MUTED, 500))
	var ck := HBoxContainer.new(); ck.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clock_num = HoloTheme.label("0:00", 24, HoloTheme.INK, 600); _clock_tot = HoloTheme.label(" / 1:35", 16, HoloTheme.MUTED, 500); _clock_tot.size_flags_vertical = Control.SIZE_SHRINK_END
	ck.add_child(_clock_num); ck.add_child(_clock_tot); mid.add_child(ck)
	_clock_bar = Control.new(); _clock_bar.custom_minimum_size = Vector2(0, 5); _clock_bar.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_clock_bar.draw.connect(func():
		var f := clampf(float(_li.get("shiftClock", {}).get("t", 0.0)) / maxf(float(_li.get("shiftClock", {}).get("total", 95.0)), 1.0), 0.0, 1.0) if _li.get("shiftClock") is Dictionary else 0.0
		_clock_bar.draw_rect(Rect2(0, 0, _clock_bar.size.x, 4), Color(1, 1, 1, 0.12)); _clock_bar.draw_rect(Rect2(0, 0, _clock_bar.size.x * f, 4), HoloTheme.TEAL))
	mid.add_child(_clock_bar)
	h.add_child(mid); h.add_child(_vsep())
	var right := VBoxContainer.new(); right.add_theme_constant_override("separation", 10); right.mouse_filter = Control.MOUSE_FILTER_IGNORE; right.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	var sp := HBoxContainer.new(); sp.add_theme_constant_override("separation", 6); sp.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_play = HoloTheme.button("Start", "go", 17); _play.name = "Play"; _play.custom_minimum_size.x = 92; _play.pressed.connect(_on_play); sp.add_child(_play)
	for i in [1, 2, 3]:
		var b := HoloTheme.button("%dx" % SPEEDS[i], "", 16); b.name = "Speed%d" % SPEEDS[i]; b.custom_minimum_size.x = 52; b.pressed.connect(choose_speed.bind(i)); sp.add_child(b); _speed_btns.append(b)
	right.add_child(sp); h.add_child(right)
	col.add_child(h); col.add_child(HoloTheme.label(KEY_HINT, 16, HoloTheme.MUTED, 400))
	_cmd = HoloPanel.new(col, 14); _cmd.name = "Command"; add_child(_cmd)

func _vsep() -> Control:
	var s := ColorRect.new(); s.color = Color(1, 1, 1, 0.10); s.custom_minimum_size = Vector2(1, 0); s.mouse_filter = Control.MOUSE_FILTER_IGNORE; return s

func _build_coach() -> void:
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 4); vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_coach_name = HoloTheme.label("", 16, HoloTheme.TEAL_HI, 700); vb.add_child(_coach_name)
	_coach_text = HoloTheme.label("", 18, HoloTheme.INK, 500); _coach_text.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(_coach_text)
	_coach_why = HoloTheme.label("", 16, HoloTheme.MUTED, 400); _coach_why.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _coach_why.visible = false; vb.add_child(_coach_why)
	_coach_whybtn = HoloTheme.button("Why?", "", 16); _coach_whybtn.custom_minimum_size = Vector2(0, 30); _coach_whybtn.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	_coach_whybtn.pressed.connect(func(): _coach_why.visible = not _coach_why.visible; _coach_whybtn.text = "Hide" if _coach_why.visible else "Why?"); vb.add_child(_coach_whybtn)
	_toast_lbl = HoloTheme.label("", 16, HoloTheme.INK, 600); _toast_lbl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _toast_lbl.visible = false; vb.add_child(_toast_lbl)
	_coach = HoloPanel.new(vb, 14); _coach.name = "Coach"; add_child(_coach)

func _build_alarm() -> void:
	_ann_box = VBoxContainer.new(); _ann_box.add_theme_constant_override("separation", 5); _ann_box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_alarm = HoloPanel.new(_ann_box, 12); _alarm.name = "Alarms"; add_child(_alarm)

func _build_brief() -> void:
	_dim = ColorRect.new(); _dim.color = Color(0.01, 0.03, 0.04, 0.0); _dim.set_anchors_preset(Control.PRESET_FULL_RECT); _dim.mouse_filter = Control.MOUSE_FILTER_IGNORE; _dim.visible = false; add_child(_dim)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 10); vb.custom_minimum_size.x = 470; vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(HoloTheme.label("", 16, HoloTheme.TEAL_HI, 600)); var ttl := HoloTheme.label("", 36, HoloTheme.INK, 700); ttl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(ttl)
	for i in 2:
		var n := HoloTheme.label("", 18, HoloTheme.INK, 400); n.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(n)
	var b := HoloTheme.button("Begin", "go", 18); b.name = "Begin"; b.custom_minimum_size = Vector2(150, 44); b.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN; b.pressed.connect(_begin_shift); vb.add_child(b)
	_brief = HoloPanel.new(vb, 22); _brief.solid(); _brief.name = "Brief"; _brief.visible = false; add_child(_brief)

# ---------------------------------------------------------------------------------------------------------------------------------------------
func _vp() -> Vector2: return size if size.x > 100.0 else get_viewport_rect().size

func layout() -> void:
	if not _built: return
	var vp := _vp(); _compact = vp.x < 1500.0
	_coach_text.custom_minimum_size.x = 330.0 if _compact else 420.0; _coach_why.custom_minimum_size.x = _coach_text.custom_minimum_size.x
	_toast_lbl.custom_minimum_size.x = _coach_text.custom_minimum_size.x
	_size_dock()
	if _fl != null: _fl.layout(_compact)
	_pos_fixed()

## The fixed panels sit where their current size puts them (sizes settle a frame after the text wraps, so this runs every frame). The dock (the diagram on
## L00, the test list on L14) is the top-right corner, under the alarm strip.
func _pos_fixed() -> void:
	var vp := _vp(); var m := 16.0 if _compact else 24.0
	for p in [_coach, _alarm, _cmd, _brief, _end, _dg_panel]: if p != null: p.fit()
	_coach.pos = Vector2(m, m)
	var top_r := m
	if _alarm != null: _alarm.pos = Vector2(vp.x - _alarm.size.x - m, m); top_r = m + _alarm.size.y + 12.0
	if _dg_panel != null: _dg_panel.pos = Vector2(vp.x - _dg_panel.size.x - m, top_r)
	_cmd.pos = Vector2(m if _fl != null else (vp.x - _cmd.size.x) * 0.5, vp.y - _cmd.size.y - m)   # owner review: on L14 the panel sits bottom-left, off the rig
	_brief.pos = Vector2(m, vp.y - _brief.size.y - m)   # lower left: the hero stays in view
	if _brief.pos.x + _brief.size.x > _cmd.pos.x - 8.0: _brief.pos.y = maxf(m, _cmd.pos.y - _brief.size.y - 12.0)   # narrow screens: sit above the command panel, never on it
	if _end != null: _end.pos = (vp - _end.size) * 0.5
	for p in [_alarm, _cmd, _brief, _coach, _dg_panel] + ([_end] if _end != null else []): if p != null: p.fit()

# ---------------------------------------------------------------------------------------------------------------------------------------------
func _qd(name: String, args: Array = []) -> Dictionary:
	if app == null or app.b == null: return {}
	var r = app.b.q(name, args)
	return r if r is Dictionary else {}

func refresh() -> void:
	if not _built or app == null or app.b == null or not app.started: return
	var g: Dictionary = app.b.g
	_li = _qd("levelInfo")
	_status = str(g.get("status", "playing"))
	var sh = g.get("shift", {})
	_tripped = (sh is Dictionary and not (sh.get("trips", []) as Array).is_empty()) or _status == "lost"
	var t := float(_li.get("shiftClock", {}).get("t", 0.0)) if _li.get("shiftClock") is Dictionary else 0.0
	if _last_t >= 0.0 and t < _last_t - 0.5: _new_attempt()
	_last_t = t
	if _fl != null: _refresh_flask(g, t); return
	var streams := {}
	for s in g.get("streams", []): streams[str(s.id)] = s
	var anns: Array = _li.get("annunciators", []) if _li.get("annunciators") is Array else []
	var ann := {}
	for a in anns: ann[str(a.key)] = a
	# plant params: the dial's engine value, the converter's High and the interlock's set point
	var pl := _qd("plant"); var cooler_T := -1.0; var t_hi := -1.0; var t_trip := -1.0
	for u in pl.get("units", []):
		var uid := str(u.id); var pr: Dictionary = u.get("params", {})
		if uid == str(ids.get("cooler", "?")): cooler_T = float(pr.get("T", -1.0))
		elif uid == str(ids.get("converter", "?")): t_hi = float(pr.get("T_hi", -1.0))
		elif uid == str(ids.get("interlock", "?")): t_trip = float(pr.get("setpoint", -1.0))
	# readouts
	var cs: Dictionary = streams.get(_stream_of.get("converter", ""), {})
	if not cs.is_empty(): _put("converter", "out", HoloTheme.c_of(float(cs.T)))
	var beam := _qd("eqBeam", [str(ids.get("converter", "?"))])
	var nh3 := -1.0
	var lab_nh3 := float(lab.get("nh3_out")) if lab != null and lab.get("nh3_out") != null else 0.0
	if lab_nh3 > 0.0: nh3 = lab_nh3 * 100.0
	elif not _stream_of.is_empty():
		var sq := _qd("stream", [str(_stream_of.get("converter", "?"))])
		for sp in sq.get("species", []): if str(sp.get("id", "")) == "NH3": nh3 = float(sp.get("x", 0.0)) * 100.0
	if nh3 >= 0.0: _put("converter", "nh3", nh3)
	if not beam.is_empty():
		_diagram.set_data(beam, {"t_hi": t_hi if t_hi > 0.0 else null, "t_trip": t_trip if t_trip > 0.0 else null})
	var os: Dictionary = streams.get(_stream_of.get("cooler", ""), {})
	var cw_bad := str(ann.get("cw", {}).get("state", "normal")) in ["high", "critical"]
	if not os.is_empty():
		_put("cooler", "out", HoloTheme.c_of(float(os.T))); _out_num.set_value(HoloTheme.c_of(float(os.T))); _dial.actual_k = float(os.T)
	# the dial: the engine's set point unless the player is turning it or a command is still on its way
	if cooler_T > 0.0:
		if _pending_k > 0.0 and absf(cooler_T - _pending_k) < 0.6: _pending_k = -1.0
		if not _dial._drag and _pending_k < 0.0: _dial.value_k = cooler_T
		_put("cooler", "dial", HoloTheme.c_of(cooler_T))   # with the water down the outlet cannot reach what the dial asks: both numbers side by side
	var cc: Dictionary = _cards["cooler"]
	_put_state("cooler", "critical" if cw_bad else "normal"); cc.txt.text = "Tripped" if cw_bad else "Running"
	cc.txt.add_theme_color_override("font_color", HoloTheme.RED if cw_bad else HoloTheme.INK)
	_put("separator", "liq", float(streams.get(_stream_of.get("separator", ""), {}).get("flow", 0.0)) * M_NH3 * 3.6 if streams.has(_stream_of.get("separator", "")) else 0.0)
	if streams.has(_stream_of.get("compressor", "")): _put("compressor", "bar", float(streams[_stream_of.compressor].P) / 1.0e5)
	var fl: Dictionary = ann.get("flare", {}); var flaring := bool(fl.get("lit", false))
	_put_state("flare", "high" if flaring else "normal"); _put_txt("flare", "Flaring" if flaring else "Pilot")
	# alarm strip
	_sync_ann(anns)
	# clock, speed, dial enable
	var sc: Dictionary = _li.get("shiftClock", {}) if _li.get("shiftClock") is Dictionary else {}
	_clock_num.text = HoloTheme.clock(float(sc.get("t", 0.0))); _clock_tot.text = " / " + HoloTheme.clock(float(sc.get("total", 95.0)))
	_clock_bar.queue_redraw()
	_dial.enabled = _status == "playing" and not _tripped
	_sync_speed()
	_sync_coach()
	# the brief opens once, with the clock held
	if not _brief_done and not _brief.shown and t <= 0.01 and _status == "playing": _open_brief()
	if _brief.shown and not _brief_done and t > 1.0: _begin_shift(false)   # the clock moved on without the button (a resumed or scripted shift)
	if _end != null and _end.shown and _status == "playing": _close_end()

## L14: the flask's readings, then the shell's coach, the brief and the end card.
func _refresh_flask(g: Dictionary, _t: float) -> void:
	_fl.refresh(_li, g)
	_sync_coach()
	if not _brief_done and not _brief.shown and _status == "playing": _open_brief()
	if _brief.shown and not _brief_done and int(app.speed) > 0: _begin_shift(false)   # a scripted or resumed start
	if _end != null and _end.shown and _status == "playing": _close_end()

func _sync_ann(anns: Array) -> void:
	for a in anns:
		var k := str(a.key)
		if not _ann_rows.has(k):
			var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 10); h.mouse_filter = Control.MOUSE_FILTER_IGNORE
			var d := Dot.new(); d.size_flags_vertical = Control.SIZE_SHRINK_CENTER
			var txt: String = ANN_TEXT.get(k, str(a.get("legend", k)).to_lower().capitalize())
			var l := HoloTheme.label(txt, 16, HoloTheme.MUTED, 500)
			h.add_child(d); h.add_child(l); _ann_box.add_child(h); _ann_rows[k] = {"dot": d, "label": l}
			_alarm.fit(); layout()
		var st := str(a.get("state", "off")); var row: Dictionary = _ann_rows[k]
		row.dot.state = st; row.label.add_theme_color_override("font_color", HoloTheme.AMBER if st == "high" else (HoloTheme.RED if st == "critical" else (HoloTheme.INK if st == "normal" else HoloTheme.MUTED)))
		row.dot.queue_redraw()
	var worst := "normal"
	for a in anns:
		var st2 := str(a.get("state", "off"))
		if st2 == "critical": worst = "critical"
		elif st2 == "high" and worst != "critical": worst = "high"
	_alarm.set_edge(HoloTheme.RED if worst == "critical" else (HoloTheme.AMBER if worst == "high" else HoloTheme.TEAL))
	if not _alarm.shown and not anns.is_empty(): _alarm.appear(0.2)

func _sync_speed() -> void:
	if _play == null: return
	var sp: int = int(app.speed)
	var t := float(_li.get("shiftClock", {}).get("t", 0.0)) if _li.get("shiftClock") is Dictionary else 0.0
	var label := "Pause" if sp > 0 else ("Start" if t <= 0.01 else "Resume")
	if label != _last_play:
		_last_play = label; _play.text = label; HoloTheme.style(_play, "go" if sp == 0 else "")
	if sp != _last_speed:
		_last_speed = sp
		for i in _speed_btns.size(): HoloTheme.set_active(_speed_btns[i], sp == i + 1)
	var live := _status == "playing"
	_play.disabled = not live
	for b in _speed_btns: b.disabled = not live

func _sync_coach() -> void:
	var co = _li.get("coach", null)
	var name_t := ""; var text := ""; var why := ""
	if co is Dictionary and str(co.get("text", "")) != "":
		var sp := str(co.get("speaker", ""))
		name_t = str(_li.get("setterName", sp.capitalize())) if sp == str(_li.get("setter", "")) else sp.capitalize()
		text = _soften(str(co.text)); why = str(co.get("why", ""))
		var f = co.get("focus", null)
		var fu := str(f.get("unit", "")) if f is Dictionary else ""
		_coach_role = ""
		for r in ids: if str(ids[r]) == fu: _coach_role = ROLE_ALIAS.get(r, r)
	else:
		var notes: Array = _li.get("note", []) if _li.get("note") is Array else []
		if not notes.is_empty(): name_t = str(_li.get("setterName", "")); text = str(notes[0])
		_coach_role = ""
	var sig := name_t + "|" + text
	if sig != _coach_sig:
		var first := _coach_sig == ""
		_coach_sig = sig; _coach_name.text = name_t; _coach_text.text = text; _coach_why.text = why; _coach_whybtn.visible = why != ""
		if not first: _coach.pulse()
		_coach.fit()
	if text != "" and not _coach.shown and not _brief.shown: _coach.appear(0.1)
	_coach.visible = _coach.visible and text != ""
	for r in _cards: _cards[r].p.focus_ring = (r == _coach_role); _tags[r].p.focus_ring = (r == _coach_role)

## "TEMPERATURE" in the level's coach text reads as a shout on a glass panel: all-caps words go to sentence case.
func _soften(s: String) -> String:
	var re := RegEx.new(); re.compile("\\b[A-Z]{4,}\\b")
	var out := s
	for m in re.search_all(s): out = out.replace(m.get_string(), m.get_string().to_lower())
	return out

# ---------------------------------------------------------------------------------------------------------------------------------------------
func toast(text: String, level: String) -> void:
	if not _built or text.strip_edges() == "": return
	_toast_lbl.text = text; _toast_lbl.visible = true
	var bad := level == "bad"; var warn := level == "warn"
	_toast_lbl.add_theme_color_override("font_color", HoloTheme.RED if bad else (HoloTheme.AMBER if warn else HoloTheme.TEAL_HI))
	_coach.set_edge(HoloTheme.RED if bad else (HoloTheme.AMBER if warn else HoloTheme.TEAL)); _coach.pulse()
	_toast_until = Time.get_ticks_msec() * 0.001 + (7.0 if (bad or warn) else 4.5)
	if not _coach.shown: _coach.appear()
	_coach.fit()

func _process(dt: float) -> void:
	if not _built: return
	if _toast_lbl.visible and Time.get_ticks_msec() * 0.001 > _toast_until:
		_toast_lbl.visible = false; _coach.set_edge(HoloTheme.TEAL); _coach.size = Vector2.ZERO; _coach.fit()
	if _fl == null and app != null and app.started and int(app.speed) != _last_speed: _sync_speed()
	if _fl != null: _fl.process(dt)
	if size != Vector2.ZERO and _vp() != _last_vp: _last_vp = _vp(); layout()
	_pos_fixed()
	_place(dt)
	for p in _panels(): if p.visible: p.fit()
var _last_vp := Vector2.ZERO

func _rect_of(p: Control) -> Rect2: return Rect2(p.position, p.size)

const HOVER_MIN := 24.0
const CAM_MIN := 0.21   ## a role whose radius is this fraction of the screen height, near the centre, is the one the camera is on (measured: converter view 0.25, wide 0.12)

## Which role's card is open: the one under the mouse, else the one just picked (a few seconds), else the one the camera is on. At most one.
func _decide_focus(anchors: Dictionary) -> String:
	var now := Time.get_ticks_msec() * 0.001
	var vp := _vp()
	var mouse := get_viewport().get_mouse_position() if is_inside_tree() else Vector2(-1, -1)
	var best := ""; var bd := 1e9
	for r in anchors:
		var a: Vector2 = anchors[r]; var d := a.distance_to(mouse)
		if d < clampf(lab.anchor_size(r), HOVER_MIN, 90.0) and d < bd: bd = d; best = r
	if best == "" and _focus != "" and _cards.has(_focus) and (_cards[_focus].p as HoloPanel).shown and _rect_of(_cards[_focus].p).grow(10.0).has_point(mouse): best = _focus   # the mouse went to the open card
	if best != "": _hover_role = best; _hover_until = now + 0.35
	elif _hover_role != "" and now < _hover_until and anchors.has(_hover_role): best = _hover_role
	if best != "": return best
	if _pick_role != "" and now < _pick_until and anchors.has(_pick_role): return _pick_role
	# the camera: a role large near the middle of the view
	var cbest := ""; var cs := 0.0
	for r in anchors:
		var sz: float = lab.anchor_size(r)
		if sz >= vp.y * CAM_MIN and (anchors[r] as Vector2).distance_to(vp * 0.5) < vp.y * 0.24 and sz > cs: cs = sz; cbest = r
	if cbest != _cam_role:
		_cam_role = cbest
		if cbest == "converter": _mark_converter()   # the camera going to the converter counts as looking at it
	return cbest

func _place(dt: float) -> void:
	line_data = []
	if lab == null: return
	var vp := _vp(); var m := 16.0
	var safe := Rect2(m, m, vp.x - 2.0 * m, minf(vp.y - 2.0 * m, _cmd.position.y - 10.0 - m))   # tags and cards never sit on the command panel
	var obst: Array[Rect2] = [_rect_of(_coach).grow(6.0), _rect_of(_cmd).grow(6.0)]
	if _alarm != null: obst.append(_rect_of(_alarm).grow(6.0))
	# the dock: the diagram (L00) once it has a curve, the checklist (L14); off while the brief is up
	if _dg_panel != null:
		var dock_ok := not _quiet() and (_diagram == null or _diagram.has_reading())
		if dock_ok and not _dg_panel.shown: _dg_panel.appear()
		elif not dock_ok and _dg_panel.shown: _dg_panel.vanish()
		if _dg_panel.shown: obst.append(_rect_of(_dg_panel).grow(6.0))
	var anchors := {}
	for r in _roles:
		var a: Vector2 = lab.anchor_screen(r)
		if a.x > -9000.0 and lab.anchor_size(r) >= 6.0 and not _quiet(): anchors[r] = a
	_focus = _decide_focus(anchors)
	var placed: Array[Rect2] = []
	var order: Array = []
	if _focus != "": order.append(_focus)
	for r in _roles: if r != _focus: order.append(r)
	for role in order:
		var c: Dictionary = _cards[role]; var t: Dictionary = _tags[role]
		var cp: HoloPanel = c.p; var tp: HoloPanel = t.p
		if not anchors.has(role):
			if cp.shown: cp.vanish()
			if tp.shown: tp.vanish()
			continue
		var a: Vector2 = anchors[role]
		var sz: float = lab.anchor_size(role)
		if role == _focus:
			if tp.shown: tp.vanish()
			cp.fit()
			var gap := 46.0 + minf(sz, 60.0)
			var w := cp.size.x; var h := cp.size.y
			var cands: Array[Vector2] = []
			for o in [Vector2(gap, -h - 20), Vector2(gap, 20), Vector2(-gap - w, -h - 20), Vector2(-gap - w, 20), Vector2(-w * 0.5, -h - gap), Vector2(-w * 0.5, gap), Vector2(gap, -h * 0.5), Vector2(-gap - w, -h * 0.5), Vector2(gap * 2.0, -h * 2.0), Vector2(-gap * 2.0 - w, -h * 2.0), Vector2(-w * 0.5, -h - gap * 2.0), Vector2(gap * 2.5, gap), Vector2(-gap * 2.5 - w, gap)]:
				cands.append(a + o)
			_settle(cp, cands, safe, obst, placed, anchors, dt, c)
		else:
			if cp.shown: cp.vanish()
			tp.fit()
			var w2 := tp.size.x; var h2 := tp.size.y
			var cands2: Array[Vector2] = []
			for o in [Vector2(34, -h2 - 14), Vector2(34, 14), Vector2(-34 - w2, -h2 - 14), Vector2(-34 - w2, 14), Vector2(-w2 * 0.5, -h2 - 40), Vector2(-w2 * 0.5, 40), Vector2(70, -h2 - 50), Vector2(-70 - w2, -h2 - 50), Vector2(70, 50), Vector2(-70 - w2, 50)]:
				cands2.append(a + o)
			_settle(tp, cands2, safe, obst, placed, anchors, dt, t)
	for role2 in _roles:
		if not anchors.has(role2): continue
		var a2: Vector2 = anchors[role2]
		for pair in [[_cards[role2].p, false], [_tags[role2].p, true]]:
			var p2: HoloPanel = pair[0]
			if not p2.shown or not p2.visible: continue
			var rc := _rect_of(p2)
			var q := Vector2(clampf(a2.x, rc.position.x, rc.end.x), clampf(a2.y, rc.position.y, rc.end.y))
			if rc.grow(2.0).has_point(a2): continue
			line_data.append({"a": a2, "b": q, "alpha": p2.modulate.a, "thin": pair[1]})

## The brief keeps the world clear: no tags, no cards, no dock.
func _quiet() -> bool: return _brief != null and _brief.shown and not _brief_done

func _settle(p: HoloPanel, cands: Array[Vector2], safe: Rect2, obst: Array[Rect2], placed: Array[Rect2], anchors: Dictionary, dt: float, store: Dictionary) -> void:
	var last: int = int(store.get("pick", 0))
	var order: Array[int] = [last]
	for i in cands.size(): if i != last: order.append(i)
	var best := -1; var best_pos := Vector2.ZERO; var best_cost := 1e18
	for i in order:
		var pos := cands[i]
		pos.x = clampf(pos.x, safe.position.x, maxf(safe.end.x - p.size.x, safe.position.x)); pos.y = clampf(pos.y, safe.position.y, maxf(safe.end.y - p.size.y, safe.position.y))
		var r := Rect2(pos, p.size); var cost := float(order.find(i)) * 3.0
		for o in obst: if o.intersects(r): cost += o.intersection(r).get_area() * 0.01 + 1000.0
		for o in placed: if o.grow(6.0).intersects(r): cost += o.intersection(r).get_area() * 0.01 + 1000.0
		for ak in anchors:
			var ap: Vector2 = anchors[ak]
			if r.grow(10.0).has_point(ap): cost += 400.0
		if cost < best_cost: best_cost = cost; best = i; best_pos = pos
		if cost < 1.0 and i == last: break
		if cost < 20.0: break
	store.pick = best
	var cur: Vector2 = store.cur
	if not p.shown or cur == Vector2.ZERO: cur = best_pos; p.appear()
	else: cur = cur.lerp(best_pos, 1.0 - exp(-dt * 10.0))
	store.cur = cur
	p.pos = cur; p.fit()
	placed.append(Rect2(cur, p.size))

func _on_picked(role: String) -> void:
	role = ROLE_ALIAS.get(role, role)
	if not _cards.has(role): return
	_pick_role = role; _pick_until = Time.get_ticks_msec() * 0.001 + 8.0
	(_cards[role].p as HoloPanel).pulse()
	if role == "converter": _mark_converter()

func _mark_converter() -> void:
	var co = _li.get("coach", null)
	if not (co is Dictionary) or int(co.get("step", 0)) != 1 or str(_li.get("id", "")) != "L00": return
	app.b.act("markCoach", ["tap_converter"]); app.game_on_changed()

# ---------------------------------------------------------------------------------------------------------------------------------------------
## The world's handwheel moved (L00: "T" in kelvin on the cooler). The first move commits at once, the rest trail by a quarter second so a drag does not
## flood the engine; the dial follows the wheel.
func _on_control(key: String, value: float) -> void:
	if _fl != null: _fl.on_control(key, value); return
	if key != "T": return
	_dial.value_k = value
	_debounce(key, value, func(v: float): _dial.value_k = v; _commit_dial(v))

var _ctl_fn := {}
## Commit every control still waiting in the debounce (RUN calls this: a wheel turned just before the lever must not run the old value).
func flush_controls() -> void:
	for k in _ctl_pend.keys():
		var v: float = _ctl_pend[k]; _ctl_pend.erase(k); _ctl_last[k] = Time.get_ticks_msec(); (_ctl_fn[k] as Callable).call(v)

func _debounce(key: String, value: float, fn: Callable) -> void:
	var now := Time.get_ticks_msec()
	if now - int(_ctl_last.get(key, -1000)) >= 250: _ctl_last[key] = now; fn.call(value); return
	var queued := _ctl_pend.has(key); _ctl_pend[key] = value; _ctl_fn[key] = fn
	if queued: return
	get_tree().create_timer(0.25).timeout.connect(func():
		if not _ctl_pend.has(key): return
		var v: float = _ctl_pend[key]; _ctl_pend.erase(key); _ctl_last[key] = Time.get_ticks_msec(); fn.call(v))

func _on_play() -> void: choose_speed(0 if int(app.speed) > 0 else 1)

## The same path as the old console: the engine's setSpeed, then the shell's own speed.
func choose_speed(i: int) -> bool:
	if app == null or not app.started or str(app.b.g.get("status", "playing")) != "playing": return false
	i = clampi(i, 0, 3)
	var r: Dictionary = app.b.act("setSpeed", [SPEEDS[i]])
	if not bool(r.get("ok", false)): return false
	app.set_speed(i); app.sfx("click"); _sync_speed(); return true

func _commit_dial(k: float) -> void:
	if _tripped:
		app.toast("The plant has tripped. Set points are locked.", "warn"); _pending_k = -1.0; return
	var r: Dictionary = app.b.act("setpoint", [str(ids.get("cooler", "")), "T", k])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "The cooler did not take that.")), "warn"); _pending_k = -1.0
	else: _pending_k = k; if lab != null: lab.set_control_value("T", k)
	refresh()

func _open_brief() -> void:
	_brief_done = false
	var v: VBoxContainer = _brief.content
	(v.get_child(0) as Label).text = str(_li.get("place", ""))
	(v.get_child(1) as Label).text = str(_li.get("title", ""))
	var notes: Array = _li.get("note", []) if _li.get("note") is Array else []
	for i in 2: (v.get_child(2 + i) as Label).text = str(notes[i]) if i < notes.size() else ""
	if _fl == null and int(app.speed) != 0: choose_speed(0)
	_brief.fit(); layout(); _brief.appear()
	_dim.visible = true; create_tween().tween_property(_dim, "color:a", 0.38, 0.4)
	(v.get_node("Begin") as Button).grab_focus.call_deferred()
	_coach.vanish()
	if OS.get_environment("CB_NOBRIEF") == "1": _begin_shift(false)   # captures: skip the opening card

func _begin_shift(start := true) -> void:
	if _brief_done: return
	_brief_done = true; _brief.vanish()
	var tw := create_tween(); tw.tween_property(_dim, "color:a", 0.0, 0.3); tw.tween_callback(func(): _dim.visible = false)
	if start and _fl == null: choose_speed(1); _play.grab_focus()
	elif start: choose_speed(1)   # playtest: L14's clock must run, or the 30 s settle after the winning run never ends and no printout comes
	_coach.appear(0.2)

func _new_attempt() -> void:
	if _diagram != null: _diagram.trail.clear()
	_pending_k = -1.0
	if _end != null and _end.shown: _close_end()

# ---------------------------------------------------------------------------------------------------------------------------------------------
func end_card() -> bool:
	if not _built: return false
	var rc := _qd("resultCard"); var ed: Dictionary = app.end_data()
	var won := bool(rc.get("won", ed.get("won", false)))
	var key := str(rc.get("verdictKey", ""))
	if _end != null: _end.queue_free()
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 10); vb.custom_minimum_size.x = 560; vb.mouse_filter = Control.MOUSE_FILTER_IGNORE
	vb.add_child(HoloTheme.label("%s, %s" % [str(_li.get("title", ed.get("title", ""))), str(_li.get("place", "")).to_lower()] if _li.has("title") else str(ed.get("title", "")), 16, HoloTheme.TEAL_HI, 600))
	var verdict := str(rc.get("verdictText", ed.get("reason", "")))
	var vt := HoloTheme.label(verdict, 21, HoloTheme.INK, 600); vt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(vt)
	for g in rc.get("goals", []):
		var gl := HoloTheme.label(("Done: " if g.get("met", false) else "Not met: ") + str(g.get("text", "")), 16, HoloTheme.TEAL_HI if g.get("met", false) else HoloTheme.AMBER, 600); gl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(gl)
	if str(rc.get("lesson", "")) != "":
		var ls := HoloTheme.label(str(rc.lesson), 17, HoloTheme.INK, 400); ls.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(ls)
	var grid := GridContainer.new(); grid.columns = 2; grid.add_theme_constant_override("h_separation", 24); grid.add_theme_constant_override("v_separation", 4); grid.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for m in rc.get("metrics", []):
		var l := HoloTheme.label(str(m.label), 16, HoloTheme.MUTED, 500); l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var v := HoloTheme.label(Printout.metric_text(float(m.value), str(m.unit)), 18, HoloTheme.INK, 600); v.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
		grid.add_child(l); grid.add_child(v)
	vb.add_child(grid)
	var tc = rc.get("card", {})
	if tc is Dictionary and str(tc.get("title_card", "")) != "":
		var cl := HoloTheme.label(str(tc.title_card), 16, HoloTheme.MUTED, 400); cl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(cl)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var retry := HoloTheme.button("Retry", "" if won else "go", 17); retry.name = "Retry"; retry.pressed.connect(_retry); row.add_child(retry)
	var nxt := str(ed.get("next_level", ""))
	if won and nxt != "" and not nxt.begins_with("CAREER_FIX"):
		var nb := HoloTheme.button("Next", "go", 17); nb.name = "Next"; nb.pressed.connect(func(): _close_end(); app.start_level(nxt, true)); row.add_child(nb)
	var wm := HoloTheme.button("Works map", "", 17); wm.name = "WorksMap"; wm.pressed.connect(func(): WorksMap.open(app)); row.add_child(wm)
	vb.add_child(row)
	_end = HoloPanel.new(vb, 24); _end.solid(); _end.name = "EndCard"; add_child(_end)
	_end.set_edge(HoloTheme.TEAL if (won and key != "tripped") else (HoloTheme.AMBER if won else HoloTheme.RED))
	_end.fit(); layout(); _end.appear()
	_dim.visible = true; create_tween().tween_property(_dim, "color:a", 0.45, 0.5)
	(row.get_child(row.get_child_count() - 2) as Button).grab_focus.call_deferred()
	return true

func _close_end() -> void:
	if _end != null: _end.vanish()
	var tw := create_tween(); tw.tween_property(_dim, "color:a", 0.0, 0.25); tw.tween_callback(func(): _dim.visible = false)

func _retry() -> void:
	_close_end(); app.end_ui = null
	await app.get_tree().process_frame
	BuildKeeper.restart(app, true)

# ---------------------------------------------------------------------------------------------------------------------------------------------
func key(e: InputEventKey) -> bool:
	if not _built or not e.pressed: return false
	if _brief.shown and not _brief_done and (e.keycode == KEY_ENTER or e.keycode == KEY_KP_ENTER or e.keycode == KEY_SPACE): _begin_shift(); return true
	if _end != null and _end.shown: return false
	if _fl != null: return false
	match e.keycode:
		KEY_SPACE: if not _brief.shown: choose_speed(0 if int(app.speed) > 0 else 1); return true
		KEY_F:
			if _brief.shown: return false
			choose_speed(1 if int(app.speed) >= 3 else maxi(int(app.speed) + 1, 1)); return true
		KEY_BRACKETLEFT: _dial.nudge(-25.0 if e.shift_pressed else -5.0); return true
		KEY_BRACKETRIGHT: _dial.nudge(25.0 if e.shift_pressed else 5.0); return true
	return false
