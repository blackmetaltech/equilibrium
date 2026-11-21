class_name HydBoard
extends Ch9Board
## L39 Size the Line: the pump-house board. A side-view picture of the job (the collecting tank at grade, the suction spool, the pump on its plinth, the discharge riser
## and the deaerator up on the deck, with the elevations), a live H-Q plot (pump curve, full-impeller curve dashed, system curve, operating point, BEP diamond, the design
## flow and the catalogue range) with an NPSH strip under it, and physical selectors: pipe spools for each leg, pump name-plates, the impeller trim and the pump position.
## Every pick leaves as a level action; the board is a pure view of levelView(). Keyboard / pad: every selector is a focusable key and focus survives the rebuild.
const STEEL := Color("#5F6B70")
const WATER := Color("#3C8DBC")
const OKC := Color("#2E7D4F")
const BADC := Color("#C8323C")
const WARNC := Color("#B8780A")

var _focus_name := ""

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#E4E8E3"); return sb

## Keep the focused key across the rebuild (a pick re-renders the whole board).
func set_view(d: Dictionary) -> void:
	var vp := get_viewport()
	var fo: Control = vp.gui_get_focus_owner() if vp != null else null
	_focus_name = str(fo.name) if fo != null and is_ancestor_of(fo) else ""
	super(d)
	if _focus_name != "":
		var n := find_child(_focus_name, true, false)
		if n is Control: (n as Control).call_deferred("grab_focus")

# ---- UI handlers (also the test entry points) ------------------------------------------------------------------------------------------------
func pick_pipe(leg: String, nps: String) -> void: emit_act("setPipe", [leg, nps])
func pick_pump(id: String) -> void: emit_act("setPump", [id])
func set_trim(pct: int) -> void: emit_act("setTrim", [clampi(pct, int(view.get("trimMin", 75)), int(view.get("trimMax", 100)))])
func pick_place(id: String) -> void: emit_act("setPlace", [id])

func _build() -> void:
	var ch: Dictionary = view.get("choice", {}); var op: Dictionary = view.get("op", {}); var sc: Dictionary = view.get("scene", {})
	body.add_child(head("PUMP HOUSE · CONDENSATE RETURN", "%s m³/h · %d °C" % [fnum(float(view.get("designQ", 0))), int(sc.get("tempC", 0))]))
	var pic := Scheme.new(); pic.view = view; pic.name = "Scheme"; pic.custom_minimum_size = Vector2(300, 190 if not narrow else 160); body.add_child(pic)
	var plot := Curves.new(); plot.view = view; plot.name = "Curves"; plot.custom_minimum_size = Vector2(300, 230 if not narrow else 190); body.add_child(plot)
	body.add_child(_readouts(op))
	body.add_child(_pipe_row("SUCTION", "suction", str(ch.get("suction", "")), float(view.get("guide", {}).get("vsHi", 1.5)), 0.0))
	body.add_child(_pipe_row("DISCHARGE", "discharge", str(ch.get("discharge", "")), float(view.get("guide", {}).get("vdHi", 3.0)), float(view.get("guide", {}).get("vdLo", 1.0))))
	body.add_child(_pump_row(str(ch.get("pump", ""))))
	var trow := HFlowContainer.new(); trow.add_theme_constant_override("h_separation", 8); trow.add_theme_constant_override("v_separation", 4); body.add_child(trow)
	trow.add_child(tape("IMPELLER TRIM", 12))
	var tv := int(ch.get("trim", 100))
	var b5 := key("−5", func(): set_trim(tv - 5), false, 12); b5.name = "TrimDown5"; trow.add_child(b5)
	var b1 := key("◀", func(): set_trim(tv - 1), false, 12); b1.name = "TrimDown"; b1.tooltip_text = "Trim the impeller 1 % smaller"; trow.add_child(b1)
	trow.add_child(lbl("%d %%" % tv, 15, Color("#1E2A2E"), "mono_bold"))
	var u1 := key("▶", func(): set_trim(tv + 1), false, 12); u1.name = "TrimUp"; u1.tooltip_text = "Back towards the full impeller"; trow.add_child(u1)
	var u5 := key("+5", func(): set_trim(tv + 5), false, 12); u5.name = "TrimUp5"; trow.add_child(u5)
	trow.add_child(tape("PUMP POSITION", 12))
	for p in view.get("places", []):
		var pk := key("%s (%d m suction)" % [str(p.label), int(p.ls)], func(): pick_place(str(p.id)), str(ch.get("place", "")) == str(p.id), 12); pk.name = "Place_" + str(p.id); trow.add_child(pk)
	var mn: Dictionary = view.get("money", {})
	var ml := HFlowContainer.new(); ml.add_theme_constant_override("h_separation", 14); body.add_child(ml)
	ml.add_child(lbl("A YEAR %s" % str(mn.get("annual", "")), 14, Color("#1E2A2E"), "mono_bold"))
	ml.add_child(lbl("capital %s + power %s" % [str(mn.get("capexAnn", "")), str(mn.get("energy", ""))], 12, PENCIL))
	ml.add_child(lbl("installed %s" % str(mn.get("installed", "")), 12, PENCIL))
	if str(mn.get("best", "")) != "": ml.add_child(lbl("best line %s · third flask needs %s or less" % [str(mn.best), str(mn.get("star", ""))], 12, OKC, "mono_bold"))

func _readouts(op: Dictionary) -> Control:
	var g: Dictionary = view.get("guide", {})
	var f := HFlowContainer.new(); f.name = "Readouts"; f.add_theme_constant_override("h_separation", 14); f.add_theme_constant_override("v_separation", 2)
	if not bool(op.get("ok", false)):
		f.add_child(lbl("NO FLOW: the pump cannot lift the static head", 14, BADC, "mono_bold")); return f
	var q := float(op.q); var dq := float(view.get("designQ", 60))
	f.add_child(lbl("Q %s m³/h" % fnum(q, 1), 14, OKC if q >= dq else BADC, "mono_bold"))
	f.add_child(lbl("H %s m" % fnum(float(op.h), 1), 14, Color("#1E2A2E"), "mono_bold"))
	f.add_child(lbl("η %d %%" % int(round(100.0 * float(op.eta))), 13, PENCIL))
	f.add_child(lbl("%s kW" % fnum(float(op.kW), 2), 13, PENCIL))
	var bep := float(op.bepPct)
	f.add_child(lbl("BEP %d %%" % int(round(bep)), 13, OKC if bep >= 100.0 * float(g.get("bepLo", 0.7)) and bep <= 100.0 * float(g.get("bepHi", 1.1)) else WARNC))
	var mg := float(op.margin)
	f.add_child(lbl("NPSH %s − %s = %s m" % [fnum(float(op.npsha), 2), fnum(float(op.npshr), 2), fnum(mg, 2)], 13, OKC if mg >= float(g.get("margin", 1.0)) else BADC, "mono_bold"))
	if str(op.get("reason", "")) == "runout": f.add_child(stamp("off the curve", BADC))
	return f

func _pipe_row(cap: String, leg: String, sel: String, vhi: float, vlo: float) -> Control:
	var r := HFlowContainer.new(); r.name = "Row_" + leg; r.add_theme_constant_override("h_separation", 6); r.add_theme_constant_override("v_separation", 4)
	var t := tape(cap, 12); t.custom_minimum_size = Vector2(92, 0); r.add_child(t)
	var op: Dictionary = view.get("op", {})
	for p in view.get("pipes", []):
		var nps := str(p.nps); var v := float(p.vAtDesign)
		var good := v <= vhi + 1e-9 and v >= vlo - 1e-9
		var b := key("%s\"  %s m/s" % [nps, fnum(v, 1)], func(): pick_pipe(leg, nps), nps == sel, 12)
		b.name = "Pipe_%s_%s" % [leg, nps]; b.tooltip_text = "%s-inch schedule 40, ID %s mm, %s per metre installed; %s m/s at the design flow" % [nps, fnum(float(p.idMm), 1), str(p.perM), fnum(v, 2)]
		b.add_theme_color_override("font_color", EqTheme.INK if good else Color("#7A5A20"))
		r.add_child(b)
	var vnow := float(op.get("vs" if leg == "suction" else "vd", 0.0))
	if bool(op.get("ok", false)):
		var ok := vnow <= vhi + 1e-9 and vnow >= vlo - 1e-9
		r.add_child(lbl("now %s m/s" % fnum(vnow, 2), 13, OKC if ok else BADC, "mono_bold"))
	return r

func _pump_row(sel: String) -> Control:
	var r := HFlowContainer.new(); r.name = "Row_pump"; r.add_theme_constant_override("h_separation", 6); r.add_theme_constant_override("v_separation", 4)
	var t := tape("PUMP", 12); t.custom_minimum_size = Vector2(92, 0); r.add_child(t)
	for p in view.get("pumps", []):
		var id := str(p.id)
		var b := key("%s  %s m @ %s" % [id, fnum(float(p.hBep), 0), fnum(float(p.qBep), 0)], func(): pick_pump(id), id == sel, 12)
		b.name = "Pump_" + id; b.tooltip_text = "%s: shut-off %s m, best efficiency %d %% at %s m³/h, %s kW motor, %s" % [str(p.label), fnum(float(p.shutoff), 0), int(round(100.0 * float(p.etaBep))), fnum(float(p.qBep), 0), fnum(float(p.motorKw), 1), str(p.price)]
		r.add_child(b)
	return r

## The job from the side: tank, suction, pump, riser, deaerator on its deck. Pipe width follows the size; colour follows the velocity guide; bubbles when it cavitates.
class Scheme extends Control:
	var view := {}
	var t := 0.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _ready() -> void: set_process(true)
	func _process(dt: float) -> void:
		if CbSettings.reduced_motion: return
		t += dt; queue_redraw()
	func _vcol(v: float, lo: float, hi: float) -> Color: return HydBoard.OKC if v >= lo and v <= hi else HydBoard.BADC
	func _draw() -> void:
		var sc: Dictionary = view.get("scene", {}); var ch: Dictionary = view.get("choice", {}); var op: Dictionary = view.get("op", {}); var g: Dictionary = view.get("guide", {})
		var w := size.x; var h := size.y; var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold"); var fs := EqTheme.fs(11)
		var gy := h - 18.0                    # grade
		var deck := 26.0                      # the boiler-house deck, dz up
		var mpp := (gy - deck) / maxf(float(sc.get("dz", 14.0)), 1.0)
		draw_rect(Rect2(0, gy, w, h - gy), Color("#B9B29E")); draw_line(Vector2(0, gy), Vector2(w, gy), Color("#6E6A5C"), 2.0)
		# boiler house and deck (right)
		var bx := w * 0.70
		draw_rect(Rect2(bx, deck, w - bx - 6.0, gy - deck), Color("#CFC8B6")); draw_rect(Rect2(bx - 6.0, deck - 4.0, w - bx, 5.0), Color("#7C7466"))
		for i in 3: draw_rect(Rect2(bx + 14.0 + i * 26.0, deck + 30.0, 14.0, 20.0), Color("#8EA6B0"))
		# deaerator drum on the deck
		var dc := Vector2(w * 0.83, deck - 15.0)
		draw_rect(Rect2(dc.x - 40.0, dc.y - 11.0, 80.0, 22.0), Color("#9AA4A8")); draw_circle(dc + Vector2(-40, 0), 11.0, Color("#9AA4A8")); draw_circle(dc + Vector2(40, 0), 11.0, Color("#9AA4A8"))
		draw_string(fb, dc + Vector2(-30, 4), "D-302", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E"))
		draw_string(f, dc + Vector2(-44, -15), "%s bar g" % Ch9Board.fnum(float(sc.get("pDeaBarg", 0.0)), 2), HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(10), Color("#1E2A2E"))
		# collecting tank at grade (left), vented, with its level
		var tx := 18.0; var tw := 64.0; var th := 58.0
		var zs := float(sc.get("zs", 2.0)) * mpp
		draw_rect(Rect2(tx, gy - th, tw, th), Color("#9AA4A8")); draw_rect(Rect2(tx + 3, gy - 6.0 - zs - 8.0, tw - 6, zs + 8.0), Color(HydBoard.WATER, 0.85))
		draw_line(Vector2(tx + tw * 0.5, gy - th), Vector2(tx + tw * 0.5, gy - th - 10.0), HydBoard.STEEL, 3.0)
		draw_string(fb, Vector2(tx + 8, gy - th + 14), "T-301", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E"))
		draw_string(f, Vector2(tx + 6, gy - th + 28), "90 °C", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(10), Color("#1E2A2E"))
		# pump: near the tank or at the foot of the boiler house
		var far := str(ch.get("place", "near")) == "far"
		var pc := Vector2((bx - 34.0) if far else (tx + tw + 46.0), gy - 10.0)
		var nozzle := Vector2(tx + tw, gy - 8.0)
		var sw := _pw(str(ch.get("suction", "4"))); var dw := _pw(str(ch.get("discharge", "4")))
		var scol := _vcol(float(op.get("vs", 0.0)), 0.0, float(g.get("vsHi", 1.5))) if bool(op.get("ok", false)) else HydBoard.STEEL
		var dcol := _vcol(float(op.get("vd", 0.0)), float(g.get("vdLo", 1.0)), float(g.get("vdHi", 3.0))) if bool(op.get("ok", false)) else HydBoard.STEEL
		draw_line(nozzle, Vector2(pc.x - 12.0, nozzle.y), scol, sw)
		var rx := bx - 14.0 if not far else pc.x + 16.0
		var riser := PackedVector2Array([pc + Vector2(0, -12), Vector2(pc.x, gy - 34.0), Vector2(rx, gy - 34.0), Vector2(rx, dc.y + 12.0), Vector2(dc.x - 30.0, dc.y + 12.0)])
		if far: riser = PackedVector2Array([pc + Vector2(0, -12), Vector2(pc.x, dc.y + 12.0), Vector2(dc.x - 30.0, dc.y + 12.0)])
		draw_polyline(riser, dcol, dw)
		# the pump on its plinth: volute, motor
		draw_rect(Rect2(pc.x - 18.0, gy - 4.0, 52.0, 4.0), Color("#6E6A5C"))
		draw_circle(pc, 11.0, Color("#2D5DA8")); draw_circle(pc, 4.0, Color("#E4E8E3"))
		draw_rect(Rect2(pc.x + 10.0, pc.y - 7.0, 22.0, 14.0), Color("#3C4B48"))
		draw_string(fb, pc + Vector2(-12, -18), str(ch.get("pump", "")), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E"))
		# flow arrows on the discharge and bubbles at the eye when the margin is gone
		if bool(op.get("ok", false)) and float(op.get("q", 0.0)) > 0.0:
			var ph := fmod(t * 0.8, 1.0)
			var a0 := riser[riser.size() - 2]; var a1 := riser[riser.size() - 1]
			var p := a0.lerp(a1, ph)
			draw_colored_polygon(PackedVector2Array([p + Vector2(6, 0), p + Vector2(-3, -4), p + Vector2(-3, 4)]), Color.WHITE)
		if bool(op.get("ok", false)) and float(op.get("margin", 9.0)) < float(g.get("margin", 1.0)):
			for i in 5:
				var ph2 := fposmod(t * 1.3 + i * 0.2, 1.0)
				draw_circle(pc + Vector2(-14.0 - 8.0 * i, -2.0 - 6.0 * ph2), 1.5 + 2.0 * ph2, Color(1, 1, 1, 0.9 * (1.0 - ph2)))
			draw_string(fb, pc + Vector2(-60, 22), "CAVITATING", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, HydBoard.BADC)
		# elevation ruler and lengths
		var ex := bx - 52.0 if not far else bx * 0.5
		draw_line(Vector2(ex, gy), Vector2(ex, deck), Color("#1E2A2E"), 1.0)
		draw_line(Vector2(ex - 4, gy), Vector2(ex + 4, gy), Color("#1E2A2E"), 1.0); draw_line(Vector2(ex - 4, deck), Vector2(ex + 4, deck), Color("#1E2A2E"), 1.0)
		draw_string(fb, Vector2(ex + 5, (gy + deck) * 0.5), "%s m" % Ch9Board.fnum(float(sc.get("dz", 0.0))), HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E"))
		draw_string(f, Vector2(tx + tw + 4, gy - zs - 12.0), "+%s m" % Ch9Board.fnum(float(sc.get("zs", 0.0))), HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(10), Color("#1E2A2E"))
		draw_string(f, Vector2((nozzle.x + pc.x) * 0.5 - 30.0, gy + 13.0), "suction %s m · %s\"" % [Ch9Board.fnum(float(sc.get("ls", 0.0))), str(ch.get("suction", ""))], HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(10), Color("#1E2A2E"))
		draw_string(f, Vector2(bx - 170.0 if not far else bx + 6.0, gy - 40.0), "discharge %s m · %s\"" % [Ch9Board.fnum(float(sc.get("ld", 0.0))), str(ch.get("discharge", ""))], HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(10), Color("#1E2A2E"))
	func _pw(nps: String) -> float: return 2.0 + 1.3 * float(nps)

## The H-Q plot: pump curve (trimmed, solid; full impeller dashed), system curve, operating point, BEP diamond, design flow and the catalogue range; an NPSH strip below.
class Curves extends Control:
	var view := {}
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_PASS
	func _draw() -> void:
		var cv: Dictionary = view.get("curves", {}); var op: Dictionary = view.get("op", {})
		var w := size.x; var h := size.y; var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold"); var fs := EqTheme.fs(10)
		var L := 40.0; var R := 10.0; var T := 8.0; var strip := 52.0; var B := 22.0
		var ph := h - T - B - strip - 8.0
		var qTop := maxf(float(cv.get("qTop", 140.0)), 1.0)
		var hTop := 10.0
		for k in ["pump", "full"]: for p in cv.get(k, []): hTop = maxf(hTop, float(p[1]))
		hTop = ceil(hTop * 1.1 / 10.0) * 10.0
		var X := func(q: float) -> float: return L + (w - L - R) * q / qTop
		var Y := func(hh: float) -> float: return T + ph * (1.0 - clampf(hh / hTop, -0.05, 1.05))
		draw_rect(Rect2(L, T, w - L - R, ph), Color("#F7F9F6"))
		var rg: Array = cv.get("range", [0, 0])
		draw_rect(Rect2(X.call(float(rg[0])), T, X.call(float(rg[1])) - X.call(float(rg[0])), ph), Color(HydBoard.OKC, 0.07))
		for i in range(0, int(hTop) + 1, 10):
			draw_line(Vector2(L, Y.call(float(i))), Vector2(w - R, Y.call(float(i))), Color(0, 0, 0, 0.08)); draw_string(f, Vector2(4, Y.call(float(i)) + 4), "%d" % i, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		for q in range(0, int(qTop) + 1, 20):
			draw_line(Vector2(X.call(float(q)), T), Vector2(X.call(float(q)), T + ph), Color(0, 0, 0, 0.06)); draw_string(f, Vector2(X.call(float(q)) - 8, T + ph + 12), "%d" % q, HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		draw_string(f, Vector2(4, T + 10), "H m", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		draw_string(f, Vector2(w - R - 50, T + ph + 12), "Q m³/h", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		var dq := float(view.get("designQ", 60.0))
		for yy in range(int(T), int(T + ph), 8): draw_line(Vector2(X.call(float(dq)), yy), Vector2(X.call(float(dq)), yy + 4), Color("#E0A020"), 1.5)
		_poly(cv.get("full", []), X, Y, Color("#2D5DA8", 0.45), 1.5, true)
		_poly(cv.get("pump", []), X, Y, Color("#2D5DA8"), 2.5, false)
		_poly(cv.get("system", []), X, Y, Color("#C8793C"), 2.5, false)
		var bp: Array = cv.get("bep", [0, 0]); var bc := Vector2(X.call(float(bp[0])), Y.call(float(bp[1])))
		draw_colored_polygon(PackedVector2Array([bc + Vector2(0, -6), bc + Vector2(6, 0), bc + Vector2(0, 6), bc + Vector2(-6, 0)]), Color("#2D5DA8"))
		draw_string(fb, bc + Vector2(7, -6), "BEP", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#2D5DA8"))
		if bool(op.get("ok", false)):
			var oc := Vector2(X.call(float(op.q)), Y.call(float(op.h)))
			draw_circle(oc, 7.0, Color("#1E2A2E")); draw_circle(oc, 4.0, Color("#FFB703"))
			draw_string(fb, oc + Vector2(8, 14), "%s m³/h, %s m" % [Ch9Board.fnum(float(op.q), 1), Ch9Board.fnum(float(op.h), 1)], HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#1E2A2E"))
		draw_string(fb, Vector2(L + 6, T + 12), "PUMP", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#2D5DA8"))
		draw_string(fb, Vector2(L + 46, T + 12), "SYSTEM", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color("#C8793C"))
		# NPSH strip: available (green) against required (red), 0..12 m
		var sy := T + ph + 18.0; var nTop := 12.0
		var Yn := func(n: float) -> float: return sy + strip * (1.0 - clampf(n / nTop, 0.0, 1.0))
		draw_rect(Rect2(L, sy, w - L - R, strip), Color("#F7F9F6"))
		draw_string(f, Vector2(2, sy + 12), "NPSH", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		_poly(cv.get("npsha", []), X, Yn, HydBoard.OKC, 2.0, false)
		_poly(cv.get("npshr", []), X, Yn, HydBoard.BADC, 2.0, false)
		draw_string(fb, Vector2(w - R - 120, sy + 12), "avail / req'd", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Ch9Board.PENCIL)
		if bool(op.get("ok", false)): draw_line(Vector2(X.call(float(op.q)), sy), Vector2(X.call(float(op.q)), sy + strip), Color("#1E2A2E", 0.6), 1.0)
	func _poly(pts: Array, X: Callable, Y: Callable, col: Color, wd: float, dashed: bool) -> void:
		if pts.size() < 2: return
		var a := PackedVector2Array()
		for p in pts: a.append(Vector2(X.call(float(p[0])), Y.call(float(p[1]))))
		if dashed:
			for i in range(0, a.size() - 1, 2): draw_line(a[i], a[i + 1], col, wd)
		else: draw_polyline(a, col, wd, true)
	func _get_tooltip(_at: Vector2) -> String:
		var op: Dictionary = view.get("op", {})
		if not bool(op.get("ok", false)): return "The pump curve never reaches the system curve: no flow."
		return "Operating point %s m³/h at %s m: where the pump curve (blue) crosses the system curve (orange). The diamond is the best-efficiency point." % [Ch9Board.fnum(float(op.q), 1), Ch9Board.fnum(float(op.h), 1)]
