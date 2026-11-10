class_name Printout
extends RefCounted
## The plant computer's printout (UI.md section 8): green-bar tractor paper with sprocket holes, VT323. Header, PASS/FAIL goal lines, three stamped flasks,
## metrics, the run histogram as printed block bars with `◄ YOU` (never on a failure), the Call-it check, Mara's blue-pen margin note, and on failure
## `*** RUN ABORTED ***` with the cause and the equation, the wrong number circled in red pen. Data: `app.end_data()` + the `resultCard` query.
static var stub := {}         # a resultCard-shaped dict for galleries and tests
const INKC := Color("#1E2A2E")

class Paper extends Control:
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), EqTheme.GREENBAR_LIGHT)
		var y := 20.0; var i := 0
		while y < size.y:
			if i % 2 == 0: draw_rect(Rect2(0, y, size.x, 54.0), EqTheme.GREENBAR)
			y += 54.0; i += 1
		for sx in [18.0, size.x - 18.0]:
			var hy := 28.0
			while hy < size.y:
				draw_circle(Vector2(sx, hy), 6.0, Color("#3A4A45")); draw_circle(Vector2(sx, hy), 4.5, Color("#101615")); hy += 54.0
		for sx in [40.0, size.x - 40.0]:
			var py := 0.0
			while py < size.y: draw_line(Vector2(sx, py), Vector2(sx, py + 4.0), Color(0, 0, 0, 0.2), 1.0); py += 8.0

class Circled extends Control:   # a printed line with the player's number circled in red pen
	var text := ""
	var circle_last := false
	var size_px := 22
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _ready() -> void: custom_minimum_size = Vector2(0, EqTheme.fs(size_px) + 14)
	func _draw() -> void:
		var f := EqTheme.font("print"); var fs := EqTheme.fs(size_px)
		draw_string(f, Vector2(0, fs), text, HORIZONTAL_ALIGNMENT_LEFT, size.x, fs, INKC)
		if not circle_last: return
		var re := RegEx.new(); re.compile("[-+]?[0-9][0-9,]*\\.?[0-9]*")
		var last: RegExMatch = null
		for m in re.search_all(text): last = m
		if last == null: return
		var x0 := f.get_string_size(text.substr(0, last.get_start()), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var w := f.get_string_size(last.get_string(), HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
		var c := Vector2(x0 + w * 0.5, fs * 0.62); var pts := PackedVector2Array()
		for i in range(0, 41):   # an imperfect, overshooting ellipse, like a pen
			var a := TAU * 1.08 * i / 40.0 + 0.4
			pts.append(c + Vector2(cos(a) * (w * 0.5 + 5.0 + i * 0.04), sin(a) * (fs * 0.62 + 2.0 - i * 0.03)))
		draw_polyline(pts, EqTheme.PEN_RED, 2.5, true)

static func card(app) -> Dictionary:
	var c = PaperStrings.q(app, "resultCard")
	if c is Dictionary and not (c as Dictionary).is_empty(): return c
	return stub

static func _line(vb: Control, text: String, col := INKC, size := 22, name := "") -> Label:
	var l := EqTheme.label(text, size, col, "print"); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if name != "": l.name = name
	vb.add_child(l); return l

static func _pad(s: String, n: int) -> String: return s + " ".repeat(maxi(1, n - s.length()))

## Open the printout. Returns false when the engine has no result card (the shell then shows its own end card).
static func open(app) -> bool:
	var real = PaperStrings.q(app, "resultCard")
	var in_level = PaperStrings.q(app, "levelInfo")
	if (not (real is Dictionary) or (real as Dictionary).is_empty()) and in_level is Dictionary and not (in_level as Dictionary).is_empty(): return false   # no result until the win (the first run is still playing)
	var rc := card(app)
	if rc.is_empty(): return false
	var ed: Dictionary = app.end_data()
	var li := Notebook.info(app)
	var won := bool(rc.get("won", ed.get("won", false)))
	var vs: Vector2 = app.get_viewport().get_visible_rect().size
	var d: Dictionary = app.dialog("printout", 760.0, 0.0, EqTheme.PEN_GREEN if won else EqTheme.RED, 0.6)
	var host: Control = d.host; var pn: PanelContainer = d.panel; var vb0: VBoxContainer = d.vb
	app.end_ui = host
	pn.add_theme_stylebox_override("panel", EqTheme.porcelain_sb(2, 0.0))
	var bg := Paper.new(); pn.add_child(bg); pn.move_child(bg, 0)
	var mg := MarginContainer.new(); mg.add_theme_constant_override("margin_left", 62); mg.add_theme_constant_override("margin_right", 62); mg.add_theme_constant_override("margin_top", 18); mg.add_theme_constant_override("margin_bottom", 14)
	vb0.reparent(mg); pn.add_child(mg)
	var sc := ScrollContainer.new(); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; vb0.add_child(sc)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 3); vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.custom_minimum_size.x = 620.0; sc.add_child(vb)
	var max_h := vs.y - 150.0
	var lid := str(ed.get("level_id", ""))
	if lid == "": lid = str(li.get("id", ""))
	var runs = PaperStrings.q(app, "runs")
	var run_n: int = (runs as Array).size() if runs is Array else 1
	_line(vb, "%s · %s · %s" % [PaperStrings.t("PR_HEAD"), PaperStrings.t("PR_RUN") % run_n, lid], INKC, 26, "Header")
	_line(vb, PaperStrings.t("PR_DONE") if won else PaperStrings.t("PR_ABORT"), EqTheme.PEN_GREEN if won else EqTheme.RED, 30, "Banner")
	if str(rc.get("verdictText", "")) != "": _line(vb, str(rc.verdictText), INKC, 22, "Verdict")
	if not won:
		if str(rc.get("cause", "")) != "":
			_line(vb, PaperStrings.t("PR_CAUSE") + ": " + str(rc.cause), EqTheme.RED.darkened(0.15), 22, "Cause")
		if str(rc.get("equation", "")) != "":
			var cl := Circled.new(); cl.name = "Equation"; cl.text = str(rc.equation); cl.circle_last = true; cl.size_px = 20; vb.add_child(cl)
	# goals
	_line(vb, "", INKC, 10)
	_line(vb, "GOALS", INKC, 22)
	for g in li.get("goals", []):
		var ok := bool(g.get("met", false))
		_line(vb, "%s  %s" % [PaperStrings.t("PR_PASS") if ok else PaperStrings.t("PR_FAIL"), str(g.text)], INKC if ok else EqTheme.RED.darkened(0.15), 21, "Goal_" + str(g.key))
	# flasks, stamped
	var stars: Dictionary = rc.get("stars", {})
	var earned: Array = stars.get("earned", [false, false, false])
	var fr := HBoxContainer.new(); fr.name = "Flasks"; fr.add_theme_constant_override("separation", 14); vb.add_child(fr)
	fr.add_child(EqTheme.label(PaperStrings.t("PR_STARS"), 22, INKC, "print"))
	var n_stamped := 0
	for i in range(3):
		var f := Notebook.Flask.new(); f.filled = bool(earned[i]) if i < earned.size() else false
		if f.filled: n_stamped += 1; f.name = "Stamp_%d" % i
		f.pivot_offset = Vector2(23, 23); f.rotation_degrees = [-9.0, 5.0, -3.0][i]; f.modulate = Color(1, 1, 1, 1.0 if f.filled else 0.45); fr.add_child(f)
	# metrics
	_line(vb, "", INKC, 8)
	_line(vb, PaperStrings.t("PR_METRICS"), INKC, 22)
	for m in rc.get("metrics", []):
		var vtxt := PaperStrings.num(float(m.value)) + " " + str(m.unit)
		_line(vb, _pad(str(m.label), 22) + vtxt, INKC, 21, "Metric_" + str(m.key))
	# histogram: only on a finished plant
	var hg = rc.get("histogram")
	if won and hg is Dictionary:
		_line(vb, "", INKC, 8)
		_line(vb, PaperStrings.t("PR_HIST") + " · " + str(hg.metric), INKC, 22, "HistHead")
		var bins: Array = hg.bins; var edges: Array = hg.edges; var mx := 1.0
		for b in bins: mx = maxf(mx, float(b))
		var you := float(hg.you)
		for i in range(bins.size()):
			var lo := float(edges[i]); var hi := float(edges[i + 1])
			var mine: bool = (i == int(hg.youBin)) if hg.has("youBin") else ((you >= lo and you < hi) or (i == bins.size() - 1 and you >= lo))   # the engine names the bin; older cards fall back to the edges
			var bar := "█".repeat(maxi(int(round(float(bins[i]) / mx * 22.0)), 1 if int(bins[i]) > 0 else 0))
			_line(vb, "%s|%s %d%s" % [_pad(CbKit.num(lo, 0), 9), bar, int(bins[i]), "  " + PaperStrings.t("PR_YOU") + " " + PaperStrings.num(you) if mine else ""], EqTheme.PEN_BLUE if mine else INKC, 20, "Hist_%d" % i)
	# call it
	var ci = rc.get("callIt")
	if ci is Dictionary:
		_line(vb, "", INKC, 8)
		var cok := bool(ci.get("ok", false))
		var ct := "%s: %s %s" % [PaperStrings.t("PR_CALLIT"), PaperStrings.num(float(ci.get("value", 0))), str(ci.get("unit", ""))]
		if ci.has("answer"): ct += "   ENGINE %s" % PaperStrings.num(float(ci.answer))
		_line(vb, ct + "   " + (PaperStrings.t("PR_PASS") if cok else PaperStrings.t("PR_FAIL")), INKC if cok else EqTheme.RED.darkened(0.15), 21, "CallIt")
	# Mara's note in blue pen, at the margin
	if str(rc.get("lesson", "")) != "":
		var nt := PanelContainer.new(); nt.name = "Margin"; var ns := StyleBoxEmpty.new(); ns.content_margin_top = 8; nt.add_theme_stylebox_override("panel", ns)
		var nl := EqTheme.label("%s: %s" % [str(li.get("setter", PaperStrings.t("PR_MARA"))), str(rc.lesson)], 19, EqTheme.PEN_BLUE, "sans"); nl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; nt.add_child(nl)
		nt.rotation_degrees = -0.8; vb.add_child(nt)
	var code := str(rc.get("designCode", ""))   # the full code goes to the clipboard; the sheet prints a short fingerprint
	if code != "": _line(vb, "CODE %s…%s  (%d chars)" % [code.substr(0, 10), code.substr(code.length() - 6), code.length()], INKC.lerp(Color.WHITE, 0.4), 16, "Code")
	# buttons on the paper edge
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); vb0.add_child(row)
	var retry := EqTheme.key_button(PaperStrings.t("PR_RETRY"), not won, 18); retry.name = "Retry"
	retry.pressed.connect(func(): host.queue_free(); app.end_ui = null; app.start_level(lid, true)); row.add_child(retry)
	var nxt := str(ed.get("next_level", ""))
	if won and nxt != "":
		var nb := EqTheme.key_button(PaperStrings.t("PR_NEXT"), true, 18); nb.name = "Next"; nb.pressed.connect(func(): host.queue_free(); app.end_ui = null; app.start_level(nxt, true)); row.add_child(nb)
	var cp := EqTheme.key_button(PaperStrings.t("PR_COPY"), false, 18); cp.name = "Copy"
	cp.pressed.connect(func(): DisplayServer.clipboard_set(str(rc.get("designCode", ""))); app.toast(PaperStrings.t("PR_COPIED"), "good")); row.add_child(cp)
	host.set_meta("stamped", n_stamped); host.set_meta("has_histogram", won and hg is Dictionary)
	_fit.call_deferred(app, pn, sc, vb, max_h)
	app.focus_dialog()
	return true

static func _fit(app, pn: Control, sc: ScrollContainer, vb: VBoxContainer, max_h: float) -> void:
	for i in 2: await pn.get_tree().process_frame
	if not is_instance_valid(sc) or not is_instance_valid(vb): return
	sc.custom_minimum_size.y = clampf(vb.get_combined_minimum_size().y + 4.0, 160.0, max_h)
	pn.reset_size(); app.center(pn, 760.0, 0.0)
