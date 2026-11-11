class_name Ch9Cards
extends Ch9Board
## L35 (start-up SOP) and L36 (permit to work): punched procedure cards on a pegboard. The rack holds the available cards (tap to add), the sequence is the ordered
## run (up/down to reorder, x to remove); each placed card carries the engine trace: done, blocked (amber) or hazard (red stamp) with its text. Gauges show the plant
## state, the footer minutes against the reference.
const FLAG_NAMES := {"cool": "COOLING", "flare": "FLARE", "circ": "CIRC", "leak": "TIGHT", "h2": "H2 IN", "red": "REDUCED", "in1": "IN 1", "in2": "IN 2", "out1": "OUT 1", "out2": "OUT 2",
	"bleedIn": "BLEED IN", "bleedOut": "BLEED OUT", "passOut": "PASSING", "blind": "BLIND", "dep": "DEPRESS", "drained": "DRAINED", "gas": "GAS TEST", "lock": "LOCKED", "open": "OPEN", "clean": "CLEAN", "back": "BACK IN"}
const FLAG_BAD := ["passOut"]

func _draw() -> void:
	# pegboard holes behind everything
	var step := 22.0
	for y in range(int(step * 0.5), int(size.y), int(step)):
		for x in range(int(step * 0.5), int(size.x), int(step)): draw_circle(Vector2(x, y), 2.2, Color(0, 0, 0, 0.28))

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#C9B48C"); return sb

func _is_sop() -> bool: return str(view.get("kind", "")) == "sop"

func _build() -> void:
	var sop := _is_sop()
	body.add_child(head("START-UP SOP CARDS" if sop else "PERMIT TO WORK", ""))
	body.add_child(_gauges())
	body.add_child(_summary())
	var split: BoxContainer = (VBoxContainer.new() if narrow else HBoxContainer.new()); split.add_theme_constant_override("separation", 10); body.add_child(split)
	# rack
	var rack := VBoxContainer.new(); rack.add_theme_constant_override("separation", 4); rack.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rack.size_flags_stretch_ratio = 0.9; split.add_child(rack)
	rack.add_child(tape("CARD RACK", 12))
	var cards: Array = view.get("cards", view.get("steps", []))
	for c in cards: rack.add_child(_rack_card(c, sop))
	# sequence
	var seq := VBoxContainer.new(); seq.add_theme_constant_override("separation", 4); seq.size_flags_horizontal = Control.SIZE_EXPAND_FILL; seq.size_flags_stretch_ratio = 1.15; split.add_child(seq)
	var sh := HBoxContainer.new(); seq.add_child(sh); sh.add_child(tape("SEQUENCE", 12)); var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sh.add_child(sp)
	sh.add_child(key("CLEAR", func(): emit_act("clear")))
	var order: Array = view.get("order", []); var trace: Array = view.get("trace", [])
	if order.is_empty():
		var hint := lbl("Tap cards on the rack to build the order.", 13, Color("#3A3020")); hint.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; seq.add_child(hint)
	for i in order.size():
		var ev := {}
		for e in trace: if int(e.i) == i: ev = e
		seq.add_child(_seq_card(order[i], i, order.size(), ev))

func _card_sb(col: Color, edge: Color) -> StyleBoxFlat:
	var sb := StyleBoxFlat.new(); sb.bg_color = col; sb.border_color = edge; sb.set_border_width_all(1); sb.border_width_left = 3; sb.set_corner_radius_all(3)
	sb.content_margin_left = 8; sb.content_margin_right = 6; sb.content_margin_top = 3; sb.content_margin_bottom = 3; sb.shadow_color = Color(0, 0, 0, 0.25); sb.shadow_size = 2; sb.shadow_offset = Vector2(1, 2)
	return sb

func _rack_card(c: Dictionary, sop: bool) -> Control:
	var b := Button.new(); b.focus_mode = Control.FOCUS_ALL; b.alignment = HORIZONTAL_ALIGNMENT_LEFT; b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	b.text = "%s  (%d min)" % [str(c.label), int(c.mins)]; b.tooltip_text = str(c.label)
	b.add_theme_font_override("font", EqTheme.font("mono")); b.add_theme_font_size_override("font_size", EqTheme.fs(13))
	for st in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(st, EqTheme.INK)
	for st in ["normal", "hover", "pressed", "focus"]: b.add_theme_stylebox_override(st, _card_sb(Color("#F6EFD9") if st != "hover" else Color("#FFFAE8"), Color("#8A7A55") if st != "focus" else EqTheme.TEAL))
	b.custom_minimum_size = Vector2(0, maxf(30.0, Ch9Board.tmin()))
	if sop and str(c.get("pre", "")) != "": b.tooltip_text = str(c.pre)
	b.pressed.connect(func(): emit_act("add", [c.id]))
	return b

func _seq_card(o: Dictionary, i: int, n: int, ev: Dictionary) -> Control:
	var kind := str(ev.get("kind", ""))
	var col := Color("#F6EFD9"); var edge := Color("#8A7A55")
	match kind:
		"done": edge = OKGREEN
		"blocked": col = Color("#F7E7B8"); edge = AMBER_INK
		"hazard": col = Color("#F3D3CC"); edge = STAMP_RED
		_: col = Color("#E4DCC3")
	var p := PanelContainer.new(); p.add_theme_stylebox_override("panel", _card_sb(col, edge)); p.mouse_filter = Control.MOUSE_FILTER_PASS
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 0); p.add_child(v)
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6); v.add_child(h)
	h.add_child(lbl("%d." % (i + 1), 13, PENCIL, "mono_bold"))
	var nm := lbl(str(o.label), 13, EqTheme.INK, "mono_bold"); nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL; nm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; nm.custom_minimum_size = Vector2(60, 0); h.add_child(nm)   # a long card name wraps, it never truncates
	if kind == "hazard": h.add_child(stamp("HAZARD", STAMP_RED))
	elif kind == "blocked": h.add_child(stamp("BLOCKED", AMBER_INK))
	elif kind == "done": h.add_child(stamp("DONE", OKGREEN))
	var up := key("▲", func(): emit_act("move", [i, i - 1]), false, 11); up.disabled = i == 0; up.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(24.0, Ch9Board.tmin())); h.add_child(up)
	var dn := key("▼", func(): emit_act("move", [i, i + 1]), false, 11); dn.disabled = i == n - 1; dn.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(24.0, Ch9Board.tmin())); h.add_child(dn)
	var rm := key("×", func(): emit_act("remove", [i]), false, 12); rm.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(24.0, Ch9Board.tmin())); h.add_child(rm)
	if str(ev.get("text", "")) != "":
		var t := lbl("%s   (t+%d min)" % [str(ev.text), int(ev.t)], 12, STAMP_RED if kind == "hazard" else AMBER_INK, "sans"); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(t)
	return p

func _summary() -> Control:
	var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 16)
	var mins := float(view.get("mins", 0.0))
	if _is_sop():
		h.add_child(lbl("MIN %s / ref %s" % [fnum(mins), fnum(view.get("refMins", 0))], 13, Color("#1E2A2E"), "mono_bold"))
		h.add_child(lbl("LOSS %s / %s" % [usd(float(view.get("lossUSD", 0.0))), usd(float(view.get("budgetUSD", 0.0)))], 13, STAMP_RED if float(view.get("lossUSD", 0)) > float(view.get("budgetUSD", 1)) else PENCIL, "mono_bold"))
		h.add_child(stamp("READY" if bool(view.get("ready", false)) else "NOT READY", OKGREEN if bool(view.get("ready", false)) else AMBER_INK))
	else:
		h.add_child(lbl("MIN %s  (%s h)" % [fnum(mins), fnum(view.get("hours", 0), 1)], 13, Color("#1E2A2E"), "mono_bold"))
		h.add_child(lbl("LOSS %s  ref %s  budget %s" % [usd(float(view.get("lossUSD", 0.0))), usd(float(view.get("refLossUSD", 0.0))), usd(float(view.get("budgetUSD", 0.0)))], 13, PENCIL, "mono_bold"))
		h.add_child(stamp("BACK IN SERVICE" if bool(view.get("done", false)) else "OUT OF SERVICE", OKGREEN if bool(view.get("done", false)) else AMBER_INK))
	h.add_child(stamp("SAFE" if bool(view.get("safe", false)) else "UNSAFE", OKGREEN if bool(view.get("safe", false)) else STAMP_RED))
	if bool(view.get("halted", false)): h.add_child(stamp("HALTED", STAMP_RED))
	return h

func _gauges() -> Control:
	var g := Gauges.new(); g.view = view; g.sop = _is_sop(); g.custom_minimum_size = Vector2(300, 74 if _is_sop() else 92); return g

class Gauges extends Control:
	var view := {}
	var sop := true
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _bar(x: float, y: float, w: float, cap: String, v: float, lo: float, hi: float, marks: Array, col: Color) -> void:
		var f := EqTheme.font("mono_bold")
		draw_string(f, Vector2(x, y + 11), "%s %s" % [cap, Ch9Board.fnum(v, 1 if absf(v) < 10 else 0)], HORIZONTAL_ALIGNMENT_LEFT, w, EqTheme.fs(12), Color("#1E2A2E"))
		var r := Rect2(x, y + 16, w, 9); draw_rect(r, Color("#3A3020")); draw_rect(Rect2(r.position, Vector2(r.size.x * clampf((v - lo) / (hi - lo), 0, 1), r.size.y)), col)
		for m in marks:
			var mx := x + w * clampf((float(m[0]) - lo) / (hi - lo), 0, 1); draw_line(Vector2(mx, y + 13), Vector2(mx, y + 28), Color(m[1]), 2.0)
	func _draw() -> void:
		var st: Dictionary = view.get("state", {}); var lim: Dictionary = view.get("limits", {})
		var bw := (size.x - 20.0) / 3.0
		if sop:
			var o2 := float(st.get("o2", 0)); var cl := Color("#2E8B57") if o2 < float(lim.get("o2Safe", 1)) else (Color("#E0A020") if o2 < float(lim.get("o2Loc", 5)) else Color("#C8323C"))
			_bar(0, 0, bw, "O2 %", o2, 0, 21, [[lim.get("o2Safe", 1), "#E0A020"], [lim.get("o2Loc", 5), "#C8323C"]], cl)
			var pp := float(st.get("p", 0)); _bar(bw + 10, 0, bw, "P bar", pp, 0, 100, [[lim.get("pFlareMax", 60), "#C8323C"]], Color("#2D5DA8") if pp <= float(lim.get("pFlareMax", 60)) else Color("#C8323C"))
			_bar(2 * (bw + 10), 0, bw, "T K", float(st.get("t", 0)), 280, 700, [[620, "#E0A020"]], Color("#C8793C"))
			_lamps(["cool", "flare", "circ", "leak", "h2", "red"], 36.0, st)
		else:
			var rs := float(st.get("resid", 0)); _bar(0, 0, bw * 1.4, "RESIDUAL %", rs, 0, 100, [[view.get("residPass", 10), "#2E8B57"]], Color("#C8793C") if rs > float(view.get("residPass", 10)) else Color("#2E8B57"))
			_lamps(["in1", "in2", "out1", "out2", "bleedIn", "bleedOut", "passOut", "blind", "dep", "drained", "gas", "lock", "open", "clean", "back"], 34.0, st)
	func _lamps(keys: Array, y0: float, st: Dictionary) -> void:
		var f := EqTheme.font("dymo"); var x := 0.0; var y := y0; var fs := EqTheme.fs(11)
		for k in keys:
			var on := float(st.get(k, 0)) >= 0.5; var cap: String = Ch9Cards.FLAG_NAMES.get(k, k)
			var w := f.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 22.0
			if x + w > size.x: x = 0.0; y += 18.0
			var col := Color("#555") if not on else (Color("#C8323C") if Ch9Cards.FLAG_BAD.has(k) else Color("#2E8B57"))
			draw_circle(Vector2(x + 6, y + 8), 5.0, col); draw_arc(Vector2(x + 6, y + 8), 5.0, 0, TAU, 14, Color(0, 0, 0, 0.6), 1.0)
			draw_string(f, Vector2(x + 15, y + 12), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E") if on else Color("#4A4030")); x += w + 4.0
