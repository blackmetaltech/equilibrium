class_name HydBoard
extends Ch9Board
## L39 Size the Line. F33 (0.9 plant objects): the job is in the plant now. The lines, the pump's name-plate, cavitation and the NPSH sight-glass stand in the 3D pump house
## (world/pump_house.gd); this drawer is the control-room instrument: a big X-Y plotter of the pump curve (trimmed, full impeller dashed), the system curve, the operating point
## with the pen carriage on it, the BEP diamond, the design-flow line and the catalogue range, with large readouts under it. The choices are physical selectors on a local
## panel at the foot of the pump house (`station`, HydStation): rotary selector knobs for the suction and discharge sizes and the pump, the impeller trim and the pump position.
## Every pick leaves as a level action; both are pure views of levelView(). A click on a pipe or the pump in the 3D view puts its selector in hand (`take`).
const STEEL := Color("#5F6B70")
const OKC := Color("#2E7D4F")
const BADC := Color("#C8323C")
const WARNC := Color("#B8780A")

var station: HydStation

func _init() -> void:
	super()
	station = HydStation.new(); station.board = self; station.name = "HydStation"

func _exit_tree() -> void:
	if station != null and is_instance_valid(station) and not station.is_queued_for_deletion(): station.queue_free()

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#E4E8E3"); return sb

func set_view(d: Dictionary) -> void:
	super(d)
	if station != null: station.set_view(d)

# ---- UI handlers (also the test entry points) ------------------------------------------------------------------------------------------------
func pick_pipe(leg: String, nps: String) -> void: emit_act("setPipe", [leg, nps])
func pick_pump(id: String) -> void: emit_act("setPump", [id])
func set_trim(pct: int) -> void: emit_act("setTrim", [clampi(pct, int(view.get("trimMin", 75)), int(view.get("trimMax", 100)))])
func pick_place(id: String) -> void: emit_act("setPlace", [id])
## A click on the plant: "suction" / "discharge" / "pump" puts that selector in hand (its knob takes the keyboard / pad focus, the pipe glows).
func take(what: String) -> void:
	if station != null: station.take(what)

## A control of the board or of its local panel by name (tests).
func control(nm: String) -> Control:
	var n := find_child(nm, true, false)
	if n == null and station != null: n = station.find_child(nm, true, false)
	return n as Control

func _build() -> void:
	var sc: Dictionary = view.get("scene", {}); var op: Dictionary = view.get("op", {})
	body.add_child(head("PUMP CURVE · X-Y PLOTTER", "%s m³/h · %d °C" % [fnum(float(view.get("designQ", 0))), int(sc.get("tempC", 0))]))
	var plot := Curves.new(); plot.view = view; plot.name = "Curves"
	plot.custom_minimum_size = Vector2(300, clampf(fit_h - 250.0, 240.0, 560.0)); body.add_child(plot)
	body.add_child(_readouts(op))
	var mn: Dictionary = view.get("money", {})
	var ml := HFlowContainer.new(); ml.name = "Money"; ml.add_theme_constant_override("h_separation", 14); ml.add_theme_constant_override("v_separation", 0); body.add_child(ml)
	ml.add_child(lbl("A YEAR %s" % str(mn.get("annual", "")), 16, Color("#1E2A2E"), "mono_bold"))
	ml.add_child(lbl("capital %s + power %s" % [str(mn.get("capexAnn", "")), str(mn.get("energy", ""))], 16, PENCIL))
	if str(mn.get("best", "")) != "": ml.add_child(lbl("best line %s · third flask at %s or less" % [str(mn.best), str(mn.get("star", ""))], 16, OKC, "mono_bold"))

func _readouts(op: Dictionary) -> Control:
	var g: Dictionary = view.get("guide", {})
	var f := HFlowContainer.new(); f.name = "Readouts"; f.add_theme_constant_override("h_separation", 18); f.add_theme_constant_override("v_separation", 0)
	if not bool(op.get("ok", false)):
		var nf := lbl("NO FLOW: the pump cannot lift the static head", 20, BADC, "mono_bold"); nf.name = "Readout_Q"; f.add_child(nf); return f
	var q := float(op.q); var dq := float(view.get("designQ", 60))
	var ql := lbl("%s m³/h" % fnum(q, 1), 28, OKC if q >= dq else BADC, "mono_bold"); ql.name = "Readout_Q"; ql.tooltip_text = "Flow at the operating point"; f.add_child(ql)
	var hl := lbl("at %s m" % fnum(float(op.h), 1), 24, Color("#1E2A2E"), "mono_bold"); hl.name = "Readout_H"; f.add_child(hl)
	var mg := float(op.margin)
	var nl := lbl("NPSH margin %s m" % fnum(mg, 2), 20, OKC if mg >= float(g.get("margin", 1.0)) else BADC, "mono_bold"); nl.name = "Readout_NPSH"; f.add_child(nl)
	var bep := float(op.bepPct)
	f.add_child(lbl("η %d %%" % int(round(100.0 * float(op.eta))), 18, PENCIL, "mono_bold"))
	f.add_child(lbl("%s kW" % fnum(float(op.kW), 2), 18, PENCIL, "mono_bold"))
	f.add_child(lbl("BEP %d %%" % int(round(bep)), 18, OKC if bep >= 100.0 * float(g.get("bepLo", 0.7)) and bep <= 100.0 * float(g.get("bepHi", 1.1)) else WARNC, "mono_bold"))
	if str(op.get("reason", "")) == "runout": f.add_child(stamp("off the curve", BADC, 16))
	return f

## The X-Y plotter: graph paper, the pump curve (trimmed, solid; full impeller dashed), the system curve, the catalogue range, the design flow, the BEP diamond and the
## operating point under the pen carriage, its flow and head flagged on the axes.
class Curves extends Control:
	var view := {}
	var op_px := Vector2(-1, -1)      ## where the operating point is drawn (tests)
	const PAPER := Color("#F3EFD8")
	const GRID := Color("#8DB89A")
	const PUMP := Color("#2D5DA8")
	const SYS := Color("#C8632C")
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_PASS
	func _draw() -> void:
		var cv: Dictionary = view.get("curves", {}); var op: Dictionary = view.get("op", {})
		var w := size.x; var h := size.y; var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold"); var fs := 16
		# the plotter's case and its paper
		draw_rect(Rect2(Vector2.ZERO, size), Color("#3B3F3A"))
		var pp := Rect2(6, 6, w - 12, h - 12)
		draw_rect(pp, PAPER)
		var L := pp.position.x + 46.0; var R := pp.end.x - 12.0; var T := pp.position.y + 12.0; var B := pp.end.y - 30.0
		var qTop := maxf(float(cv.get("qTop", 140.0)), 1.0)
		var hTop := 10.0
		for k in ["pump", "full", "system"]:
			for p in cv.get(k, []):
				if float(p[0]) <= qTop: hTop = maxf(hTop, float(p[1]))
		hTop = ceil(minf(hTop, 80.0) * 1.12 / 10.0) * 10.0
		var X := func(q: float) -> float: return L + (R - L) * clampf(q / qTop, 0.0, 1.0)
		var Y := func(hh: float) -> float: return B - (B - T) * clampf(hh / hTop, 0.0, 1.0)
		# graph paper: fine lines every 2 m and 5 m³/h, bold every 10 m and 20 m³/h
		for i in range(0, int(hTop) + 1, 2): draw_line(Vector2(L, Y.call(float(i))), Vector2(R, Y.call(float(i))), Color(GRID, 0.55 if i % 10 == 0 else 0.2), 1.0)
		for qi in range(0, int(qTop) + 1, 5): draw_line(Vector2(X.call(float(qi)), T), Vector2(X.call(float(qi)), B), Color(GRID, 0.55 if qi % 20 == 0 else 0.2), 1.0)
		draw_rect(Rect2(L, T, R - L, B - T), Color(GRID.darkened(0.3), 0.9), false, 1.5)
		var ok := bool(op.get("ok", false))
		var oq := float(op.get("q", 0.0)); var oh := float(op.get("h", 0.0))
		# the catalogue range and the design flow
		var rg: Array = cv.get("range", [0, 0])
		var rx0: float = X.call(float(rg[0])); var rx1: float = X.call(float(rg[1]))
		draw_rect(Rect2(rx0, T, rx1 - rx0, B - T), Color(Ch9Board.OKGREEN, 0.10))
		var dq := float(view.get("designQ", 60.0)); var dx: float = X.call(dq)
		var yy := T
		while yy < B: draw_line(Vector2(dx, yy), Vector2(dx, minf(yy + 7.0, B)), Color("#D08A10"), 2.0); yy += 12.0
		# curves
		_poly(cv.get("full", []), X, Y, Color(PUMP, 0.45), 2.0, true, qTop)
		_poly(cv.get("system", []), X, Y, SYS, 3.0, false, qTop)
		_poly(cv.get("pump", []), X, Y, PUMP, 3.5, false, qTop)
		var bp: Array = cv.get("bep", [0, 0]); var bc := Vector2(X.call(float(bp[0])), Y.call(float(bp[1])))
		draw_colored_polygon(PackedVector2Array([bc + Vector2(0, -8), bc + Vector2(8, 0), bc + Vector2(0, 8), bc + Vector2(-8, 0)]), PUMP)
		# the pen carriage: a rail across the top of the bed, the arm down to the pen on the operating point
		draw_rect(Rect2(pp.position.x, pp.position.y, pp.size.x, 6), Color("#5E635C"))
		if ok:
			var ox: float = X.call(oq); var oy: float = Y.call(oh)
			op_px = Vector2(ox, oy)
			draw_rect(Rect2(ox - 4.0, pp.position.y, 8.0, oy - pp.position.y - 8.0), Color("#7C827A", 0.55))
			draw_line(Vector2(L, oy), Vector2(ox, oy), Color("#1E2A2E", 0.55), 1.0); draw_line(Vector2(ox, oy), Vector2(ox, B), Color("#1E2A2E", 0.55), 1.0)
			draw_circle(Vector2(ox, oy), 11.0, Color("#1E2A2E")); draw_circle(Vector2(ox, oy), 7.0, Color("#FFB703")); draw_circle(Vector2(ox, oy), 2.5, Color("#1E2A2E"))
		else: op_px = Vector2(-1, -1)
		# axis numbers (a tick under a flag is left out) and titles
		var qflag: float = X.call(oq) if ok else -999.0; var hflag: float = Y.call(oh) if ok else -999.0
		for i in range(0, int(hTop) + 1, 10):
			var ty: float = Y.call(float(i))
			if absf(ty - hflag) > 20.0: EqTheme.ds(self, f, Vector2(pp.position.x + 2.0, ty + 6.0), "%d" % i, HORIZONTAL_ALIGNMENT_RIGHT, L - pp.position.x - 8.0, fs, Ch9Board.PENCIL)
		for qi in range(0, int(qTop) + 1, 20):
			var tx: float = X.call(float(qi))
			if absf(tx - qflag) > 34.0 and tx + 20.0 < R - 64.0: EqTheme.ds(self, f, Vector2(tx - 20.0, B + 22.0), "%d" % qi, HORIZONTAL_ALIGNMENT_CENTER, 40.0, fs, Ch9Board.PENCIL)
		EqTheme.ds(self, f, Vector2(R - 62.0, B + 22.0), "Q m³/h", HORIZONTAL_ALIGNMENT_RIGHT, 62.0, fs, Ch9Board.PENCIL)
		EqTheme.ds(self, f, Vector2(L + 6.0, T + 18.0), "H m", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		if ok:   # the operating point flagged on both axes, like the plotter's cursor readout
			_flag(Vector2(X.call(oq) - 30.0, B + 4.0), Vector2(60.0, 22.0), Ch9Board.fnum(oq, 1), fb)
			_flag(Vector2(pp.position.x + 1.0, Y.call(oh) - 11.0), Vector2(L - pp.position.x - 3.0, 22.0), Ch9Board.fnum(oh, 1), fb)
		EqTheme.ds(self, fb, bc + Vector2(-17.0, -14.0), "BEP", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, PUMP)
		EqTheme.ds(self, fb, Vector2(dx + 6.0, B - 10.0), "DESIGN %s" % Ch9Board.fnum(dq), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#9A6408"))
		if rx1 - rx0 > 60.0: EqTheme.ds(self, f, Vector2(rx0 + 4.0, T + 44.0), "CATALOGUE", HORIZONTAL_ALIGNMENT_LEFT, rx1 - rx0 - 8.0, fs, Ch9Board.OKGREEN)
		# pen legends on tape, top right
		_tape(Vector2(R - 94.0, T + 4.0), "PUMP", PUMP, 90.0, fb)
		_tape(Vector2(R - 94.0, T + 30.0), "SYSTEM", SYS, 90.0, fb)
	func _flag(p: Vector2, sz: Vector2, text: String, fb: Font) -> void:
		draw_rect(Rect2(p, sz), Color("#FFB703")); draw_rect(Rect2(p, sz), Color("#1E2A2E"), false, 1.0)
		EqTheme.ds(self, fb, p + Vector2(2.0, sz.y - 5.0), text, HORIZONTAL_ALIGNMENT_CENTER, sz.x - 4.0, 16, Color("#1E2A2E"))
	func _tape(p: Vector2, text: String, accent: Color, w: float, fb: Font) -> void:
		draw_rect(Rect2(p, Vector2(w, 22.0)), EqTheme.DYMO_TAPE); draw_rect(Rect2(p, Vector2(4.0, 22.0)), accent.lightened(0.15))
		draw_line(p + Vector2(10.0, 11.0), p + Vector2(24.0, 11.0), accent.lightened(0.3), 3.0)
		EqTheme.ds(self, fb, p + Vector2(28.0, 16.0), text, HORIZONTAL_ALIGNMENT_LEFT, w - 30.0, 16, EqTheme.DYMO_TEXT)
	func _poly(pts: Array, X: Callable, Y: Callable, col: Color, wd: float, dashed: bool, qTop: float) -> void:
		var a := PackedVector2Array()
		for p in pts:
			if float(p[0]) <= qTop + 1e-6: a.append(Vector2(X.call(float(p[0])), Y.call(float(p[1]))))
		if a.size() < 2: return
		if dashed:
			for i in range(0, a.size() - 1, 2): draw_line(a[i], a[i + 1], col, wd)
		else: draw_polyline(a, col, wd, true)
	func _get_tooltip(_at: Vector2) -> String:
		var op: Dictionary = view.get("op", {})
		if not bool(op.get("ok", false)): return "The pump curve never reaches the system curve: no flow."
		return "Operating point %s m³/h at %s m: where the pump curve (blue) crosses the system curve (orange). The diamond is the best-efficiency point; the green band is the pump's catalogue range." % [Ch9Board.fnum(float(op.q), 1), Ch9Board.fnum(float(op.h), 1)]
