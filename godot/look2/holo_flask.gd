class_name HoloFlask
extends RefCounted
## The L14 The Brown Gas part of the HUD (docs/LOOK2.md): the flask's command panel (T, V, argon, fixed P, Call Kp, RUN), the tags and cards for the flask,
## the argon bottle and the vent, and the docked checklist (the tests and the last run's numbers). HoloHud owns the shell (coach, brief, end card, placement);
## this class builds into it. Units: the fields speak deg C, litres, bar, mol/s; the engine and the world speak K, m3, Pa, mol/s (set_control_value and
## control_changed use the engine's: "T" K, "V" m3, "Pfix" Pa, "argon" mol/s).
## Engine actions: setParam [flask, "T" | "V" | "Pfix", value], setFeed [argon, {flow}], callIt [Kp bar] (once, before the first run), commission (RUN).
const TESTS := [["called", "Kp called"], ["halve", "Halve volume"], ["inert_v", "Argon, constant V"], ["inert_p", "Argon, constant P"], ["gauge", "Book flask found"]]
var h   ## HoloHud
var f_T: HoloField
var f_V: HoloField
var f_P: HoloField
var f_A: HoloField
var call_edit: LineEdit
var call_btn: Button
var call_note: Label
var run_btn: Button
var _st := {}   ## D-B1: read-only status of the world's controls (the +/- form is retired: the wheels, the clamp, the argon valve and the RUN lever are the controls)
var _checks := {}                 ## key -> {dot, label}
var _run_nums := {}               ## P, alpha, kp -> HoloNum
var _runs_lbl: Label
var _list: VBoxContainer
var last := {"has": false, "P": 0.0, "alpha": 0.0, "kp": 0.0}   ## the last run's readings (kept while the player edits the knobs)
var _answered := false

func _init(hud) -> void: h = hud

func build() -> void:
	h._add_role("flask", "Flask", [["gauge", "Gauge, last run", "%.2f", " bar"], ["alpha", "Dissociated, last run", "%.0f", " %"], ["T", "Temperature set", "%.2f", " °C"],
		["V", "Volume set", "%.2f", " L"], ["Pfix", "Fixed pressure set", "%.1f", " bar"]], "gauge", "", true)
	h._add_role("argon", "Argon", [["flow", "Flow", "%.2f", " mol/s"]], "flow", "", true)
	h._add_role("vent", "Vent", [["flow", "Flow out", "%.2f", " mol/s"], ["bar", "Pressure", "%.2f", " bar"]], "flow")
	h._put_txt("flask", "not run"); h._put_txt("argon", "off"); h._put_state("flask", "off"); h._put_state("argon", "off"); h._put_state("vent", "off")
	_build_cmd(); _build_list()

func _field(title: String, unit: String, lo: float, hi: float, step: float, dec: int, zero := "") -> HoloField:
	var f := HoloField.new(title, unit); f.lo = lo; f.hi = hi; f.step = step; f.decimals = dec; f.zero_text = zero; return f

func _build_cmd() -> void:
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 18); row.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var left := VBoxContainer.new(); left.add_theme_constant_override("separation", 6); left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	f_T = _field("Temperature", "°C", -100.0, 1200.0, 5.0, 2); f_T.name = "FieldT"
	f_V = _field("Volume", "L", 0.1, 10.0, 0.1, 2); f_V.name = "FieldV"
	f_P = _field("Fixed P", "bar", 0.0, 40.0, 0.5, 1, "off"); f_P.name = "FieldP"
	f_A = _field("Argon", "mol/s", 0.0, 1.0, 0.05, 2, "off"); f_A.name = "FieldArgon"
	f_T.committed.connect(func(v: float): commit("T", v + 273.15))
	f_V.committed.connect(func(v: float): commit("V", v / 1000.0))
	f_P.committed.connect(func(v: float): commit("Pfix", v * 1.0e5))
	f_A.committed.connect(func(v: float): commit("argon", v))
	for f in [f_T, f_V, f_P, f_A]: f.visible = false; left.add_child(f)   # kept for the engine sync, not shown
	left.add_child(HoloTheme.label("Your flask", 16, HoloTheme.TEAL_HI, 700))
	for k in ["T", "V", "clamp", "argon"]:
		var l := HoloTheme.label("", 16, HoloTheme.INK, 500); l.name = "St_" + k; left.add_child(l); _st[k] = l
	left.add_child(HoloTheme.label("Turn the wheels. Click the clamp and the argon valve. Pull the lever to run.", 16, HoloTheme.MUTED, 400))
	left.custom_minimum_size.x = 300; (left.get_child(left.get_child_count() - 1) as Label).autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	row.add_child(left); row.add_child(h._vsep())
	var right := VBoxContainer.new(); right.add_theme_constant_override("separation", 8); right.mouse_filter = Control.MOUSE_FILTER_IGNORE; right.custom_minimum_size.x = 220
	right.add_child(HoloTheme.label("Call Kp, bar", 16, HoloTheme.MUTED, 500))
	var cr := HBoxContainer.new(); cr.add_theme_constant_override("separation", 6); cr.mouse_filter = Control.MOUSE_FILTER_IGNORE
	call_edit = LineEdit.new(); call_edit.name = "CallKp"; call_edit.custom_minimum_size = Vector2(90, 38); call_edit.placeholder_text = "Kp"; call_edit.alignment = HORIZONTAL_ALIGNMENT_CENTER
	call_edit.add_theme_font_override("font", HoloTheme.font(600)); call_edit.add_theme_font_size_override("font_size", HoloTheme.fs(17))
	for c in ["font_color", "font_uneditable_color", "font_selected_color"]: call_edit.add_theme_color_override(c, HoloTheme.INK)
	call_edit.add_theme_stylebox_override("normal", HoloTheme.box(Color(0, 0, 0, 0.28), Color(1, 1, 1, 0.20), 1, 8, 6))
	call_edit.add_theme_stylebox_override("focus", HoloTheme.box(Color(0, 0, 0, 0.4), HoloTheme.TEAL_HI, 2, 8, 6))
	call_edit.add_theme_stylebox_override("read_only", HoloTheme.box(Color(0, 0, 0, 0.15), Color(1, 1, 1, 0.1), 1, 8, 6))
	call_edit.text_submitted.connect(func(_t): call_kp_text())
	call_btn = HoloTheme.button("Call it", "", 16); call_btn.name = "CallBtn"; call_btn.pressed.connect(call_kp_text)
	cr.add_child(call_edit); cr.add_child(call_btn); right.add_child(cr)
	call_note = HoloTheme.label("Call it before the first run.", 16, HoloTheme.MUTED, 400); call_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; call_note.custom_minimum_size.x = 220; right.add_child(call_note)
	run_btn = HoloTheme.button("RUN", "go", 20); run_btn.name = "Run"; run_btn.custom_minimum_size = Vector2(0, 52); run_btn.pressed.connect(run); right.add_child(run_btn)
	row.add_child(right)
	var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 6); col.mouse_filter = Control.MOUSE_FILTER_IGNORE
	col.add_child(row); col.add_child(HoloTheme.label("Fixed P off holds the volume. Argon off is a closed valve. Keys: 1 to 6 views, Q and E turn", 16, HoloTheme.MUTED, 400))
	h._cmd = HoloPanel.new(col, 14); h._cmd.name = "Command"; h.add_child(h._cmd)

func _build_list() -> void:
	_list = VBoxContainer.new(); _list.add_theme_constant_override("separation", 5); _list.mouse_filter = Control.MOUSE_FILTER_IGNORE
	_list.add_child(HoloTheme.label("Tests", 16, HoloTheme.TEAL_HI, 700))
	for t in TESTS:
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var d := HoloHud.Dot.new(); d.state = "off"; d.size_flags_vertical = Control.SIZE_SHRINK_CENTER
		var l := HoloTheme.label(t[1], 16, HoloTheme.MUTED, 500)
		hb.add_child(d); hb.add_child(l); _list.add_child(hb); _checks[t[0]] = {"dot": d, "label": l}
	var sep := ColorRect.new(); sep.color = Color(1, 1, 1, 0.10); sep.custom_minimum_size = Vector2(0, 1); sep.mouse_filter = Control.MOUSE_FILTER_IGNORE; _list.add_child(sep)
	_runs_lbl = HoloTheme.label("Last run", 16, HoloTheme.TEAL_HI, 700); _list.add_child(_runs_lbl)
	for r in [["P", "Gauge", "%.2f", " bar"], ["alpha", "Dissociated", "%.1f", " %"], ["kp", "Kp", "%.2f", " bar"]]:
		var n := HoloNum.new(17, 600); n.fmt = r[2]; n.suffix = r[3]; n.custom_minimum_size.x = 90
		var hb2 := HBoxContainer.new(); hb2.add_theme_constant_override("separation", 10); hb2.mouse_filter = Control.MOUSE_FILTER_IGNORE
		var l2 := HoloTheme.label(r[1], 16, HoloTheme.MUTED, 500); l2.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		hb2.add_child(l2); hb2.add_child(n); _list.add_child(hb2); _run_nums[r[0]] = n
	h._dg_panel = HoloPanel.new(_list, 12); h._dg_panel.name = "Checklist"; h._dg_panel.visible = false; h.add_child(h._dg_panel)

func layout(compact: bool) -> void:
	_list.custom_minimum_size.x = (240.0 if compact else 300.0) - 28.0

func setup() -> void: pass

func process(_dt: float) -> void: pass

# ---- engine access -----------------------------------------------------------------------------------------------------------------------------
func _id(role: String) -> String: return str(h.ids.get(role, ""))

func _playing() -> bool: return h.app != null and h.app.started and str(h.app.b.g.get("status", "playing")) == "playing"

func _fail(msg: String) -> void:
	var m := msg if msg != "" else "The engine did not take that."
	h.app.toast(m, "warn")

## One knob to the engine, as the faceplate does it: setParam on the flask, setFeed on the argon feed. Engine units. Returns true when the engine took it.
func commit(key: String, v: float) -> bool:
	if not _playing(): return false
	var r: Dictionary
	if key == "argon": r = h.app.b.act("setFeed", [_id("argon"), {"flow": v}])
	elif key in ["T", "V", "Pfix"]: r = h.app.b.act("setParam", [_id("flask"), key, v])
	else: return false
	var ok := bool(r.get("ok", false))
	if not ok: _fail(str(r.get("message", "")))
	elif h.lab != null: h.lab.set_control_value(key, v)
	h.refresh()
	return ok

## The world's wheel or knob moved: the field follows, the engine gets it (the first move at once, a drag at most four times a second).
func on_control(key: String, value: float) -> void:
	match key:
		"T": f_T.set_value(value - 273.15)
		"V": f_V.set_value(value * 1000.0)
		"Pfix": f_P.set_value(value / 1.0e5)
		"argon": f_A.set_value(value)
		"run": run(); return
		_: return
	h._debounce(key, value, func(v: float): commit(key, v))

func call_kp_text() -> void:
	var t := call_edit.text.strip_edges()
	if not t.is_valid_float(): h.app.toast("Type Kp in bar as a number.", "warn"); return
	call_kp(float(t))

func call_kp(v: float) -> bool:
	if not _playing(): return false
	var r: Dictionary = h.app.b.act("callIt", [v])
	var ok := bool(r.get("ok", false))
	if not ok: _fail(str(r.get("message", "")))
	h.refresh()
	return ok

## RUN: commission the flask as it is set. The engine settles it; the gauge, dissociation and Kp of this run go on the list.
func run() -> bool:
	if not _playing(): return false
	var ci = h._li.get("callIt", null)
	if ci is Dictionary and not bool(ci.get("answered", false)):
		h.app.toast("Call Kp first. The call locks when you run.", "warn"); call_edit.grab_focus(); return false
	var r: Dictionary = h.app.b.act("commission")
	var ok := bool(r.get("ok", false)) and bool(r.get("commissioned", true))
	if not ok: _fail(str(r.get("message", "")))
	h.refresh()
	return ok

# ---- reading back ------------------------------------------------------------------------------------------------------------------------------
## Kp from the flask's outlet stream: p(NO2)^2 / p(N2O4) from the mole fractions and the pressure, bar.
func _kp_of(sid: String) -> float:
	if sid == "": return 0.0
	var s: Dictionary = h._qd("stream", [sid])
	var xa := 0.0; var xb := 0.0
	for sp in s.get("species", []):
		if str(sp.get("id", "")) == "N2O4": xa = float(sp.get("x", 0.0))
		elif str(sp.get("id", "")) == "NO2": xb = float(sp.get("x", 0.0))
	var pb := float(s.get("P", 0.0)) / 1.0e5
	return xb * xb * pb / xa if xa > 1e-9 else 0.0

func refresh(li: Dictionary, g: Dictionary) -> void:
	var pl: Dictionary = h._qd("plant")
	var fT := -1.0; var fV := -1.0; var fP := 0.0; var aflow := 0.0
	for u in pl.get("units", []):
		var uid := str(u.id); var pr: Dictionary = u.get("params", {})
		if uid == _id("flask"): fT = float(pr.get("T", -1.0)); fV = float(pr.get("V", -1.0)); fP = float(pr.get("Pfix", 0.0))
		elif uid == _id("argon"): aflow = float(pr.get("flow", 0.0))
	var status := str(g.get("status", "playing"))
	var live := status == "playing"
	for f in [f_T, f_V, f_P, f_A]: f.enabled = live
	if fT > 0.0: f_T.set_value(fT - 273.15)
	if fV > 0.0: f_V.set_value(fV * 1000.0)
	f_P.set_value(fP / 1.0e5); f_A.set_value(aflow)
	# the last run: kept while the player turns the knobs (the engine marks the reading pending until the next run)
	var hero = li.get("hero", {}); var sec = li.get("secondary", {})
	if hero is Dictionary and not bool(hero.get("pending", true)):
		last = {"has": true, "P": float(hero.get("value", 0.0)), "alpha": float(sec.get("value", 0.0)) if sec is Dictionary else 0.0, "kp": _kp_of(str(h._stream_of.get("flask", "")))}
	if bool(last.has):
		for k in ["P", "alpha", "kp"]: (_run_nums[k] as HoloNum).set_value(float(last[k]))
		h._put("flask", "gauge", float(last.P)); h._put("flask", "alpha", float(last.alpha))
		h._put_txt("flask", "%.2f bar" % float(last.P)); h._put_state("flask", "normal")
	(_st.T as Label).text = "T wheel  %.2f °C" % f_T.value
	(_st.V as Label).text = "V wheel  %.2f L" % f_V.value
	(_st.clamp as Label).text = "Clamp on: constant volume" if f_P.value <= 0.0 else "Clamp off: constant pressure, %.2f bar" % f_P.value
	(_st.argon as Label).text = "Argon valve shut" if aflow <= 0.0 else "Argon valve open"
	h._put("flask", "T", f_T.value); h._put("flask", "V", f_V.value); h._put("flask", "Pfix", f_P.value)
	h._put("argon", "flow", aflow); h._put_txt("argon", "off" if aflow <= 0.0 else "%.2f mol/s" % aflow); h._put_state("argon", "off" if aflow <= 0.0 else "normal")
	var vs: Dictionary = {}
	for s in g.get("streams", []): if str(s.id) == str(h._stream_of.get("flask", "?")): vs = s
	if not vs.is_empty(): h._put("vent", "flow", float(vs.get("flow", 0.0))); h._put("vent", "bar", float(vs.get("P", 0.0)) / 1.0e5); h._put_state("vent", "normal" if float(vs.get("flow", 0.0)) > 0.0 else "off")
	# the call
	var ci = li.get("callIt", null)
	_answered = ci is Dictionary and bool(ci.get("answered", false))
	if _answered:
		call_edit.editable = false; call_btn.disabled = true
		call_edit.text = ("%s" % snappedf(float(ci.get("value", 0.0)), 0.01)) if ci.get("value") != null else call_edit.text
		call_note.text = "Called. The engine holds your answer."
	else:
		call_edit.editable = live; call_btn.disabled = not live
		call_note.text = "Call it before the first run."
	run_btn.disabled = not live
	# the checklist from the level's lamps
	for a in li.get("annunciators", []):
		var k := str(a.get("key", ""))
		if not _checks.has(k): continue
		var on := str(a.get("state", "off")) == "normal"
		(_checks[k].dot as HoloHud.Dot).state = "normal" if on else "off"
		(_checks[k].label as Label).add_theme_color_override("font_color", HoloTheme.INK if on else HoloTheme.MUTED)
	_runs_lbl.text = "Last run" if bool(last.has) else "Last run: none yet"
