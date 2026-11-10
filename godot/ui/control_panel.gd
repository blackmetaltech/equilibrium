class_name ControlPanel
extends PanelContainer
## Chapter 8 loop panel (a 1970s control desk): a strip chart (PV blue pen, SP dashed, OP red pen on a 0-100 % scale at the right; extra pens green),
## the controller faceplate with Bakelite knobs / a rotary selector switch per dial, the metric as a Nixie counter with its star-3 line, and for
## levels that carry a bump test a BUMP TEST key that swaps the paper to the open-loop trace with the fitted K, tau, theta pencilled on it.
## Pure view: `set_view(d)` takes the engine's levelView() dictionary; dial edits go out through `levelAct('setDial', key, value)` (`dial_set` signal).
signal dial_set(key: String, value: float)
const S := {
	"TITLE": "LOOP PANEL", "BUMP": "BUMP TEST", "BACK": "LOOP TRACE", "EMPTY": "Commission to record a trace", "BUMP_TITLE": "OPEN-LOOP BUMP",
	"STAR": "STAR 3", "LEG_PV": "PV", "LEG_SP": "SP", "LEG_OP": "OP", "HINT": "Turn, wheel, or tap the number to type a value.",
	"BUMP_HINT": "Show the open-loop bump trace and the fitted K, tau and theta.", "SEC": "s",
}
var view := {}
var chart: Chart
var nix: Nixie
var bump_key: Button
var knobs := {}              ## key -> Knob / Selector
var _dial_sig := ""
var _pv_sig := ""
var _bump := false
var _hint: Label
var _title: Label
var _bar: HFlowContainer
var _bottom: HBoxContainer
var _right: VBoxContainer

static func T(k: String) -> String: return S.get(k, k)

func _init() -> void:
	name = "ControlPanel"; mouse_filter = Control.MOUSE_FILTER_PASS
	var sb := EqTheme.porcelain_sb(4, 6.0); add_theme_stylebox_override("panel", sb)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 4); add_child(vb)
	var head := HBoxContainer.new(); vb.add_child(head)
	_title = EqTheme.label(T("TITLE"), 12, EqTheme.INK, "semi"); _title.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(_title)
	chart = Chart.new(); chart.custom_minimum_size = Vector2(300, 170); chart.size_flags_vertical = Control.SIZE_EXPAND_FILL; vb.add_child(chart)
	_bottom = HBoxContainer.new(); _bottom.add_theme_constant_override("separation", 6); vb.add_child(_bottom)
	var fp := PanelContainer.new(); fp.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var fsb := EqTheme.porcelain_sb(4, 4.0); fsb.bg_color = EqTheme.PORCELAIN.darkened(0.06); fsb.border_color = EqTheme.INK; fp.add_theme_stylebox_override("panel", fsb); _bottom.add_child(fp)
	var fv := VBoxContainer.new(); fv.add_theme_constant_override("separation", 0); fp.add_child(fv)
	_bar = HFlowContainer.new(); _bar.add_theme_constant_override("h_separation", 0); _bar.add_theme_constant_override("v_separation", 0); fv.add_child(_bar)
	_hint = EqTheme.label(T("HINT"), 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "sans"); _hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _hint.custom_minimum_size = Vector2(120, 0); fv.add_child(_hint)
	_right = VBoxContainer.new(); _right.add_theme_constant_override("separation", 6); _bottom.add_child(_right)
	nix = Nixie.new(); _right.add_child(nix)
	bump_key = EqTheme.key_button(T("BUMP"), false, 14); bump_key.custom_minimum_size = Vector2(0, 38); bump_key.tooltip_text = T("BUMP_HINT"); bump_key.visible = false
	bump_key.pressed.connect(func(): _bump = not _bump; _apply_bump()); bump_key.mouse_entered.connect(func(): _hint.text = T("BUMP_HINT")); _right.add_child(bump_key)

func _apply_bump() -> void:
	chart.bump_mode = _bump and view.has("bump")
	bump_key.text = T("BACK") if chart.bump_mode else T("BUMP")
	_title.text = T("BUMP_TITLE") if chart.bump_mode else T("TITLE")
	chart.queue_redraw()

## Compact sizing for a phone: smaller chart.
var avail := 560.0
var pw := 620.0
func fit(h: float, w: float, narrow: bool) -> void:
	avail = h; pw = w; _size_chart()
	_hint.visible = not narrow or true
func _size_chart() -> void:
	var colw := maxf(pw - 12.0 - 190.0 - 14.0, 150.0)
	var per := maxf(floorf(colw / 100.0), 1.0)
	var wsum := 0.0
	for k in knobs: wsum += (knobs[k] as Control).custom_minimum_size.x
	var rows := maxf(ceilf(wsum / colw), 1.0) if wsum > 0.0 else 1.0
	chart.custom_minimum_size = Vector2(300, clampf(avail - 40.0 - rows * 134.0 - 36.0, 90.0, 230.0))
func _unused(chart_h: float, narrow: bool) -> void:
	chart.custom_minimum_size = Vector2(300, chart_h)
	if narrow:
		_right.custom_minimum_size = Vector2(150, 0)

func set_view(d: Dictionary) -> void:
	var prev_sig := _dial_sig
	view = d
	var dials: Array = d.get("dials", [])
	var sig := ""
	for x in dials: sig += "%s|%s|%s|%s;" % [x.get("key", ""), x.get("label", ""), x.get("min", 0), x.get("max", 1)]
	if sig != prev_sig: _build_dials(dials); _dial_sig = sig; _bump = false
	for x in dials:
		var k = knobs.get(str(x.key))
		if k == null: continue
		var v := float(x.get("value", 0.0)); var ch: Array = x.get("choices", [])
		if not ch.is_empty(): v -= float(x.get("min", 0.0))
		if k is Knob and (k as Knob)._drag: continue
		if absf(k.value - v) > 1e-9: k.set_value(v)
	_size_chart()
	var psig := str((d.get("series", {}) as Dictionary).get("pv", []).hash()) if d.get("series") is Dictionary else ""
	if psig != _pv_sig and _bump: _bump = false   # a new run: back to the loop trace
	_pv_sig = psig
	chart.set_data(d)
	var li = PaperStrings.q(app_ref, "levelInfo") if app_ref != null else {}
	var gok := true; var gn := 0
	if li is Dictionary: for g in li.get("goals", []): if g is Dictionary: gn += 1; if not bool(g.get("met", false)): gok = false
	nix.goals_ok = gok and gn > 0
	nix.set_data(d.get("metric", {}))
	bump_key.visible = d.has("bump")
	_apply_bump()

func _build_dials(dials: Array) -> void:
	for c in _bar.get_children(): c.queue_free()
	knobs = {}
	for x in dials:
		var key := str(x.key); var lab := str(x.get("label", key)); var ch: Array = x.get("choices", [])
		var lo := float(x.get("min", 0.0)); var hi := float(x.get("max", 1.0)); var st := float(x.get("step", 1.0))
		var w: Control
		if not ch.is_empty():
			var sw := Selector.new(); sw.setup(lab, ch, float(x.get("value", lo)) - lo)
			sw.committed.connect(func(v: float): dial_set.emit(key, lo + v))
			w = sw
		else:
			var kn := Knob.new(); kn.app = _app()
			var whole := st >= 1.0 and is_equal_approx(st, roundf(st)) and is_equal_approx(lo, roundf(lo))
			kn.setup(lab, str(x.get("unit", "")), lo, hi, st, st, float(x.get("value", lo)), whole)
			kn.committed.connect(func(v: float): dial_set.emit(key, v))
			w = kn
		w.tooltip_text = lab
		w.mouse_entered.connect(func(): _hint.text = lab)
		w.focus_entered.connect(func(): _hint.text = lab)
		knobs[key] = w; _bar.add_child(w)

var app_ref = null
func _app(): return app_ref

# ---------------------------------------------------------------------------------------------------------------- the strip chart
class Chart extends Control:
	var d := {}
	var bump_mode := false
	const GRAPHITE := Color("#4A4A48")
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; clip_contents = true
	func set_data(v: Dictionary) -> void: d = v; queue_redraw()

	static func _rng(arrs: Array) -> Vector2:
		var lo := INF; var hi := -INF
		for a in arrs: for v in a: lo = minf(lo, float(v)); hi = maxf(hi, float(v))
		if lo == INF: return Vector2(0, 1)
		if hi - lo < 1e-6: lo -= 0.5; hi += 0.5
		var pad := (hi - lo) * 0.08
		return Vector2(lo - pad, hi + pad)

	func _tx(v: float) -> String:
		if is_equal_approx(v, roundf(v)) or absf(v) >= 100.0: return str(int(round(v)))
		return ("%.1f" % v) if absf(v) >= 10.0 else ("%.2f" % v)

	func _draw() -> void:
		var f := EqTheme.font("mono"); var fs := EqTheme.fs(11)
		var pr := Rect2(40, 6, size.x - 40 - 36, size.y - 6 - 20)
		draw_rect(Rect2(Vector2.ZERO, size), EqTheme.GREENBAR_LIGHT)
		var nb := 8
		for i in range(nb):   # green-bar paper
			if i % 2 == 0: draw_rect(Rect2(pr.position.x, pr.position.y + pr.size.y * i / nb, pr.size.x, pr.size.y / nb), EqTheme.GREENBAR)
		var ser: Dictionary = d.get("series", {}); var lab: Dictionary = d.get("seriesLabels", {})
		var shared_axis := false
		for x in d.get("dials", []): if str(x.get("key", "")) == "tripC": shared_axis = true
		var t: Array; var pv: Array; var sp: Array; var op: Array; var extras := {}
		var base_op_pct := true
		if bump_mode:
			var b: Dictionary = d.bump; t = b.t; pv = b.pv; sp = []; op = b.op
		else:
			t = ser.get("t", []); pv = ser.get("pv", []); sp = ser.get("sp", []); op = ser.get("op", [])
			for k in ser: if not ["t", "pv", "sp", "op"].has(k): extras[k] = ser[k]
		var empty := t.size() < 2 or pv.is_empty()
		var yr := Vector2(0, 1)
		if not empty:
			var parts: Array = [pv, sp]
			for k in extras: parts.append(extras[k])
			if shared_axis and not bump_mode: parts.append(op)
			yr = _rng(parts)
		var t0 := 0.0; var t1 := 1.0
		if not empty: t0 = float(t[0]); t1 = maxf(float(t[t.size() - 1]), t0 + 1e-6)
		for i in range(nb + 1):   # grid + left scale
			var y := pr.position.y + pr.size.y * i / nb
			draw_line(Vector2(pr.position.x, y), Vector2(pr.end.x, y), Color(EqTheme.INK, 0.12), 1.0)
		for i in range(0, nb + 1, 2):
			var y2 := pr.position.y + pr.size.y * i / nb
			if not empty: draw_string(f, Vector2(2, y2 + 4), _tx(yr.y - (yr.y - yr.x) * i / nb), HORIZONTAL_ALIGNMENT_LEFT, 38, fs, EqTheme.PEN_BLUE)
			if not shared_axis or bump_mode: draw_string(f, Vector2(pr.end.x + 3, y2 + 4), str(100 - int(100.0 * i / nb)), HORIZONTAL_ALIGNMENT_LEFT, 34, fs, EqTheme.PEN_RED)
		var nt := 5
		for i in range(nt + 1):
			var x := pr.position.x + pr.size.x * i / nt
			draw_line(Vector2(x, pr.position.y), Vector2(x, pr.end.y), Color(EqTheme.INK, 0.12), 1.0)
			if not empty: draw_string(f, Vector2(x - 20, size.y - 5), str(int(round(t0 + (t1 - t0) * i / nt))), HORIZONTAL_ALIGNMENT_CENTER, 40, fs, EqTheme.INK)
		draw_rect(pr, Color(EqTheme.INK, 0.5), false, 1.5)
		if empty:
			var msg := ControlPanel.T("EMPTY")
			draw_string(EqTheme.font("semi"), Vector2(pr.position.x, pr.position.y + pr.size.y * 0.5 + 5), msg, HORIZONTAL_ALIGNMENT_CENTER, pr.size.x, EqTheme.fs(15), Color(EqTheme.INK, 0.55))
			return
		var X := func(i: int) -> float: return pr.position.x + pr.size.x * (float(t[i]) - t0) / (t1 - t0)
		var Yv := func(v: float) -> float: return pr.end.y - pr.size.y * (v - yr.x) / (yr.y - yr.x)
		var Yp := func(v: float) -> float: return pr.end.y - pr.size.y * clampf(v, 0.0, 100.0) / 100.0
		var pen := func(a: Array, ymap: Callable, col: Color, w: float, dashed := false) -> void:
			if a.size() < 2: return
			var pts := PackedVector2Array()
			for i in range(mini(a.size(), t.size())): pts.append(Vector2(X.call(i), ymap.call(float(a[i]))))
			if dashed:
				for i in range(0, pts.size() - 1, 2): draw_line(pts[i], pts[i + 1], col, w, true)
			else: draw_polyline(pts, col, w, true)
		if shared_axis and not bump_mode: pen.call(op, Yv, EqTheme.PEN_RED, 1.8)
		elif bump_mode or not op.is_empty(): pen.call(op, Yp, EqTheme.PEN_RED, 1.8)
		var ecol := [EqTheme.PEN_GREEN, Color("#8A5BA8")]; var ei := 0
		for k in extras: pen.call(extras[k], Yv, ecol[ei % 2], 1.5); ei += 1
		if not bump_mode:
			# the setpoint is a dashed pen; stepped sp is drawn as a straight dashed run
			if sp.size() >= 2:
				var pts := PackedVector2Array()
				for i in range(mini(sp.size(), t.size())): pts.append(Vector2(X.call(i), Yv.call(float(sp[i]))))
				var acc := 0.0; var on := true
				for i in range(pts.size() - 1):
					var seg := pts[i + 1] - pts[i]; var len := seg.length()
					var p := 0.0
					while p < len:
						var step := minf(6.0 - acc, len - p)
						if on: draw_line(pts[i] + seg * (p / maxf(len, 1e-6)), pts[i] + seg * ((p + step) / maxf(len, 1e-6)), EqTheme.INK, 1.5, true)
						p += step; acc += step
						if acc >= 6.0: acc = 0.0; on = not on
		pen.call(pv, Yv, EqTheme.PEN_BLUE, 2.2)
		# legend: pen names from seriesLabels (never assumed)
		var lx := pr.position.x + 6; var ly := pr.position.y + 12
		var lf := EqTheme.font("semi"); var ls := EqTheme.fs(12)
		var legs: Array = []
		if bump_mode: legs = [["pv", EqTheme.PEN_BLUE], ["op", EqTheme.PEN_RED]]
		else:
			legs = [["pv", EqTheme.PEN_BLUE], ["sp", EqTheme.INK], ["op", EqTheme.PEN_RED]]
			var ei2 := 0
			for k in extras: legs.append([k, ecol[ei2 % 2]]); ei2 += 1
		for g in legs:
			var txt := str(lab.get(g[0], str(g[0]).to_upper())) if not bump_mode or g[0] != "pv" else str(lab.get("pv", "PV"))
			var wd := lf.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x
			if lx + wd + 24 > pr.end.x: lx = pr.position.x + 6; ly += 15
			draw_rect(Rect2(lx - 2, ly - 11, wd + 26, 14), Color(EqTheme.GREENBAR_LIGHT, 0.85))
			draw_line(Vector2(lx, ly - 4), Vector2(lx + 16, ly - 4), g[1], 2.5)
			draw_string(lf, Vector2(lx + 19, ly), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, ls, EqTheme.INK)
			lx += wd + 34
		if bump_mode:
			var fit: Dictionary = d.bump.get("fit", {})
			var th := float(fit.get("theta", 0.0)); var tau := float(fit.get("tau", 0.0)); var K := float(fit.get("K", 0.0))
			var xth := pr.position.x + pr.size.x * (t0 + th - t0) / (t1 - t0)
			var xtau := pr.position.x + pr.size.x * (th + tau - t0) / (t1 - t0)
			var y63 := pr.end.y - pr.size.y * ((float(pv[0]) + 0.632 * (float(pv[pv.size() - 1]) - float(pv[0]))) - yr.x) / (yr.y - yr.x)
			for xx in [xth, xtau]:
				for yy in range(int(pr.position.y), int(pr.end.y), 8): draw_line(Vector2(xx, yy), Vector2(xx, yy + 4), GRAPHITE, 1.2)
			for xx in range(int(xth), int(pr.end.x), 8): draw_line(Vector2(xx, y63), Vector2(xx + 4, y63), GRAPHITE, 1.2)
			draw_arc(Vector2(xtau, y63), 5, 0, TAU, 16, GRAPHITE, 1.5)
			var nf := EqTheme.font("semi"); var nsz := EqTheme.fs(15)
			var nx := pr.end.x - 150.0; var ny := pr.end.y - 66.0
			draw_set_transform(Vector2(nx, ny), -0.05, Vector2.ONE)
			draw_string(nf, Vector2(0, 0), "K = %s" % _tx2(K), HORIZONTAL_ALIGNMENT_LEFT, -1, nsz, GRAPHITE)
			draw_string(nf, Vector2(0, 18), "τ = %s s" % _tx2(tau), HORIZONTAL_ALIGNMENT_LEFT, -1, nsz, GRAPHITE)
			draw_string(nf, Vector2(0, 36), "θ = %s s" % _tx2(th), HORIZONTAL_ALIGNMENT_LEFT, -1, nsz, GRAPHITE)
			draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
			draw_string(nf, Vector2(xth + 3, pr.end.y - 4), "θ", HORIZONTAL_ALIGNMENT_LEFT, -1, nsz, GRAPHITE)
			draw_string(nf, Vector2(xtau + 3, pr.end.y - 4), "θ+τ", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12), GRAPHITE)

	func _tx2(v: float) -> String: return "%.2f" % v if absf(v) < 10.0 else "%.1f" % v

# ---------------------------------------------------------------------------------------------------------------- Nixie metric counter
class Nixie extends Control:
	var m := {}
	var goals_ok := false
	func _init() -> void: custom_minimum_size = Vector2(170, 96); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func set_data(v: Dictionary) -> void: m = v; queue_redraw()
	static func fmt(v: float) -> String: return CbKit.num(v, 0) if absf(v) >= 100.0 else ("%.1f" % v)   # thousands separated: 1,562,000 reads at a glance
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#14100E")); draw_rect(Rect2(Vector2.ZERO, size), Color("#5A4A3A"), false, 2.0)
		if m.is_empty(): return
		var lf := EqTheme.font("dymo"); var lsz := EqTheme.fs(12)
		var lt := str(m.get("label", "")).to_upper(); var lw := minf(lf.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, lsz).x + 8.0, size.x - 8.0)
		draw_rect(Rect2(4, 4, lw, 16), EqTheme.DYMO_TAPE); draw_string(lf, Vector2(8, 16), lt, HORIZONTAL_ALIGNMENT_LEFT, lw - 6.0, lsz, EqTheme.DYMO_TEXT)
		var v := float(m.get("value", 0.0)); var s3 := float(m.get("star3", 0.0)); var met := v <= s3 and v > 0.0
		var nf := EqTheme.font("mono_bold"); var nsz := EqTheme.fs(32)
		var txt := fmt(v); var un := str(m.get("unit", ""))
		var uw0 := EqTheme.font("sans").get_string_size(" " + un, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x
		var tw := nf.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, nsz).x
		while tw + uw0 + 12.0 > size.x and nsz > 14: nsz -= 2; tw = nf.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, nsz).x   # the whole reading and its unit fit the tube
		var base := Vector2(maxf(6.0, (size.x - tw - uw0) * 0.5), 58.0)
		var glow := Color("#FF7A1A")
		for o in [Vector2(-1.5, 0), Vector2(1.5, 0), Vector2(0, -1.5), Vector2(0, 1.5)]:
			draw_string(nf, base + o, txt, HORIZONTAL_ALIGNMENT_LEFT, size.x, nsz, Color(glow, 0.28))
		draw_string(nf, base, txt, HORIZONTAL_ALIGNMENT_LEFT, size.x, nsz, Color("#FFB070"))
		draw_string(EqTheme.font("sans"), Vector2(base.x + tw + 4, base.y), un, HORIZONTAL_ALIGNMENT_LEFT, size.x - base.x - tw - 4, EqTheme.fs(12), Color("#C0805A"))
		# the third-star line lights only when the goals are met as well; a metric under the line with goals open is "metric only"
		var sc := EqTheme.AMBER if (met and goals_ok) else Color("#7A6A58")
		var line := ("★★★ ≤ %s" % fmt(s3)) if not (met and not goals_ok) else ("metric only ≤ %s" % fmt(s3))
		draw_string(EqTheme.font("semi"), Vector2(8, 84), line, HORIZONTAL_ALIGNMENT_LEFT, size.x - 10, EqTheme.fs(14), sc)

# ---------------------------------------------------------------------------------------------------------------- rotary selector switch
class Selector extends Control:
	signal committed(value: float)
	var label := ""
	var choices: Array = []
	var value := 0.0
	var lo := 0.0
	func _init() -> void: custom_minimum_size = Vector2(150, 132); focus_mode = Control.FOCUS_ALL; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	func setup(l: String, ch: Array, v: float) -> void: label = l; choices = ch; set_value(v)
	func set_value(v: float) -> void: value = clampf(roundf(v), 0.0, maxf(choices.size() - 1, 0)); queue_redraw()
	func _c() -> Vector2: return Vector2(34.0, 60.0)
	func _tag(i: int) -> Rect2:
		var n := choices.size(); var gap := 22.0
		var y0 := 60.0 - gap * (n - 1) * 0.5
		var w := maxf(28.0, EqTheme.font("dymo").get_string_size(str(choices[i]).to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x + 10.0)
		return Rect2(Vector2(72.0, y0 + gap * i - 8.0), Vector2(minf(w, size.x - 74.0), 16))
	func _ang(i: int) -> float:
		var r := _tag(i); var d := (r.position + Vector2(0, 8)) - _c()
		return atan2(d.x, -d.y)
	func _step(dir: int) -> void:
		var n := choices.size(); if n == 0: return
		set_value(float(posmod(int(value) + dir, n))); committed.emit(value)
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed:
			if e.button_index == MOUSE_BUTTON_LEFT:
				grab_focus()
				for i in choices.size():
					if _tag(i).grow(3).has_point(e.position): set_value(float(i)); committed.emit(value); accept_event(); return
				if (e.position - _c()).length() <= 30.0: _step(1); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_UP: _step(1); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: _step(-1); accept_event()
		elif e.is_action_pressed("ui_right") or e.is_action_pressed("ui_up"): _step(1); accept_event()
		elif e.is_action_pressed("ui_left") or e.is_action_pressed("ui_down"): _step(-1); accept_event()
		elif e.is_action_pressed("ui_accept"): _step(1); accept_event()
	func _draw() -> void:
		var c := _c(); var R := 22.0
		draw_circle(c + Vector2(0, 2.5), R, Color(0, 0, 0, 0.25)); draw_circle(c, R, EqTheme.BAKELITE); draw_circle(c, R * 0.6, EqTheme.BAKELITE.lightened(0.07))
		draw_arc(c, R - 1.0, deg_to_rad(200.0), deg_to_rad(320.0), 14, Color(1, 1, 1, 0.16), 2.0, true)
		var a := _ang(int(value)); var pd := Vector2(sin(a), -cos(a))
		var perp := Vector2(-pd.y, pd.x)   # a pointer bar like a rotary switch
		draw_colored_polygon(PackedVector2Array([c + pd * (R + 3.0) + perp * 3.0, c + pd * (R + 3.0) - perp * 3.0, c - pd * 4.0 - perp * 4.0, c - pd * 4.0 + perp * 4.0]), Color("#F4EEE2"))
		draw_circle(c, 3.0, EqTheme.BAKELITE.darkened(0.2))
		if has_focus(): draw_arc(c, R + 6.0, 0.0, TAU, 48, EqTheme.TEAL, 3.0, true)
		var lf := EqTheme.font("dymo"); var ls := EqTheme.fs(12)
		for i in choices.size():
			var r := _tag(i); var on := i == int(value)
			draw_rect(r, EqTheme.DYMO_TAPE if on else Color("#3A3A3A"))
			draw_string(lf, r.position + Vector2(4, 12.5), str(choices[i]).to_upper(), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 4, ls, EqTheme.AMBER if on else Color("#9A9A9A"))
		var lt := label.to_upper(); var words := lt.split(" ", false); var lines: Array = [lt]
		if lf.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(13)).x + 10.0 > size.x and words.size() > 1:
			var best := 1; var bd := 1e9
			for i in range(1, words.size()):
				var l1 := " ".join(words.slice(0, i)); var l2 := " ".join(words.slice(i))
				var dd := absf(lf.get_string_size(l1, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(13)).x - lf.get_string_size(l2, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(13)).x)
				if dd < bd: bd = dd; best = i
			lines = [" ".join(words.slice(0, best)), " ".join(words.slice(best))]
		for i in lines.size():
			var tx: String = lines[i]
			var lw := minf(lf.get_string_size(tx, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(13)).x + 10.0, size.x)
			var lr := Rect2((size.x - lw) * 0.5, size.y - 19.0 - (lines.size() - 1 - i) * 18.0, lw, 17.0)
			draw_rect(lr, EqTheme.DYMO_TAPE); draw_string(lf, lr.position + Vector2(5, 13.0), tx, HORIZONTAL_ALIGNMENT_LEFT, lw - 6.0, EqTheme.fs(13), EqTheme.DYMO_TEXT)
