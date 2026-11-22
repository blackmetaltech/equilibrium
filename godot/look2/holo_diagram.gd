class_name HoloDiagram
extends Control
## The equilibrium diagram, floating beside the converter: the ceiling X_eq(T) for the converter's own feed and pressure (engine query eqBeam.window),
## the operating point with a short trail, light-off and sinter bands (when the catalyst has them), the converter's own High and trip temperatures, and a
## Q/K needle from beam.out (centre = at equilibrium). Temperatures in deg C, conversion in %.
var data: Dictionary = {}
var marks: Dictionary = {}   ## {"t_hi": K, "t_trip": K} from the converter / interlock (optional)
var trail: Array = []        ## [T_K, X] points the operating point has visited
var _pt := Vector2(-1, -1)   ## eased operating point (T_K, X)
var _beam := 0.0
var _beam_to := 0.0
var _curve_T := PackedFloat32Array()
var _curve_X := PackedFloat32Array()
var _curve_to_T := PackedFloat32Array()
var _curve_to_X := PackedFloat32Array()
var _morph := 1.0
var _t := 0.0

func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; custom_minimum_size = Vector2(340, 280)

func set_data(d: Dictionary, m: Dictionary) -> void:
	data = d; marks = m
	var w = d.get("window", null)
	if w is Dictionary and (w.get("T", []) as Array).size() > 1:
		var nt := PackedFloat32Array(); var nx := PackedFloat32Array()
		for v in w.T: nt.append(float(v))
		for v in w.X: nx.append(float(v))
		if _curve_T.is_empty() or _curve_T.size() != nt.size(): _curve_T = nt; _curve_X = nx; _curve_to_T = nt; _curve_to_X = nx; _morph = 1.0
		elif nx != _curve_to_X or nt != _curve_to_T:
			_curve_T = _curve_now_T(); _curve_X = _curve_now_X(); _curve_to_T = nt; _curve_to_X = nx; _morph = 0.0   # the curve moves when the converter's pressure or feed does
	var pt = d.get("point", null)
	if pt is Dictionary and pt.has("T") and pt.has("X"):
		var p := Vector2(float(pt.T), float(pt.X))
		if _pt.x < 0.0: _pt = p
		var last: Vector2 = trail[trail.size() - 1] if not trail.is_empty() else Vector2(-1e6, 0)
		if Vector2((p.x - last.x) * 0.02, (p.y - last.y) * 100.0).length() > 0.6:
			trail.append(p)
			if trail.size() > 40: trail.pop_front()
	var b = d.get("beam", null)
	_beam_to = clampf(float(b.get("out", 0.0)), -3.0, 3.0) if b is Dictionary else 0.0
	queue_redraw()

func has_reading() -> bool: return _curve_T.size() > 1

func _curve_now_T() -> PackedFloat32Array:
	var o := PackedFloat32Array(); var k := _morph
	for i in _curve_to_T.size(): o.append(lerpf(_curve_T[mini(i, _curve_T.size() - 1)], _curve_to_T[i], k))
	return o
func _curve_now_X() -> PackedFloat32Array:
	var o := PackedFloat32Array(); var k := _morph
	for i in _curve_to_X.size(): o.append(lerpf(_curve_X[mini(i, _curve_X.size() - 1)], _curve_to_X[i], k))
	return o

func approach() -> float: return 100.0 * pow(10.0, -absf(_beam_to))   ## 100 % = at equilibrium (Q/K = 1)

func _process(dt: float) -> void:
	_t += dt
	var moving := false
	var pt = data.get("point", null)
	if pt is Dictionary and pt.has("T"):
		var p := Vector2(float(pt.T), float(pt.X))
		if _pt.distance_to(p) > 1e-4:
			_pt = p if CbSettings.reduced_motion else Vector2(lerpf(_pt.x, p.x, 1.0 - exp(-dt * 7.0)), lerpf(_pt.y, p.y, 1.0 - exp(-dt * 7.0))); moving = true
	if absf(_beam - _beam_to) > 0.002: _beam = _beam_to if CbSettings.reduced_motion else lerpf(_beam, _beam_to, 1.0 - exp(-dt * 6.0)); moving = true
	if _morph < 1.0: _morph = minf(1.0, _morph + dt / 0.45); moving = true
	if moving or is_visible_in_tree(): queue_redraw()

static func _nice_step(span: float, n: int) -> float:
	var raw := span / float(n); var mag := pow(10.0, floor(log(raw) / log(10.0)))
	for m in [1.0, 2.0, 2.5, 5.0, 10.0]: if m * mag >= raw: return m * mag
	return 10.0 * mag

func _dline(a: Vector2, b: Vector2, col: Color, w := 1.0, dash := 5.0) -> void:
	var d := b - a; var n := int(d.length() / (dash * 2.0)); if n < 1: draw_line(a, b, col, w); return
	var u := d / float(n * 2)
	for i in n: draw_line(a + u * float(i * 2), a + u * float(i * 2 + 1), col, w)

func _draw() -> void:
	if not has_reading(): return
	var f := HoloTheme.font(500); var fb := HoloTheme.font(600); var fz := HoloTheme.fs(16)
	var ts := _curve_now_T(); var xs := _curve_now_X()
	var padl := 56.0; var padr := 14.0; var top := 28.0
	var qk_h := 44.0; var foot := 22.0; var xl := 46.0
	var pl := Rect2(padl, top, size.x - padl - padr, maxf(size.y - top - qk_h - foot - xl, 60.0))
	var tlo := HoloTheme.c_of(ts[0]); var thi := HoloTheme.c_of(ts[ts.size() - 1])
	var px := func(tk: float) -> float: return pl.position.x + (HoloTheme.c_of(tk) - tlo) / maxf(thi - tlo, 1e-6) * pl.size.x
	var py := func(x: float) -> float: return pl.end.y - clampf(x, 0.0, 1.0) * pl.size.y
	# title row
	draw_string(fb, Vector2(0, 16), "Equilibrium window", HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.TEAL_HI)
	if data.has("pBar"):
		var pt := "%s bar" % str(int(round(float(data.pBar))))
		draw_string(f, Vector2(size.x - f.get_string_size(pt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x, 16), pt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.MUTED)
	# grid and axis labels
	draw_rect(pl, Color(1, 1, 1, 0.035))
	for yv in [0, 50, 100]:
		var gy: float = py.call(yv / 100.0)
		draw_line(Vector2(pl.position.x, gy), Vector2(pl.end.x, gy), Color(1, 1, 1, 0.10 if yv != 0 else 0.28), 1.0)
		var yt := "%d" % yv
		draw_string(f, Vector2(pl.position.x - 8.0 - f.get_string_size(yt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x, gy + 5.0), yt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.MUTED)
	var step := _nice_step(thi - tlo, 3); var tv := ceilf(tlo / step) * step
	while tv <= thi + 0.01:
		var gx: float = pl.position.x + (tv - tlo) / (thi - tlo) * pl.size.x
		draw_line(Vector2(gx, pl.position.y), Vector2(gx, pl.end.y), Color(1, 1, 1, 0.07), 1.0)
		var xt := "%d" % int(round(tv)); var xw := f.get_string_size(xt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x
		draw_string(f, Vector2(clampf(gx - xw * 0.5, 0.0, size.x - xw), pl.end.y + 19.0), xt, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.MUTED)
		tv += step
	var xa := "Temperature, °C"
	draw_string(f, Vector2(pl.position.x + (pl.size.x - f.get_string_size(xa, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x) * 0.5, pl.end.y + 38.0), xa, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.DIM)
	draw_set_transform(Vector2(18.0, pl.position.y + (pl.size.y + f.get_string_size("Conversion, %", HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x) * 0.5), -PI * 0.5, Vector2.ONE)
	draw_string(f, Vector2.ZERO, "Conversion, %", HORIZONTAL_ALIGNMENT_LEFT, -1, fz, HoloTheme.DIM)
	draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	# bands: asleep (below light-off), sinter and the trip temperature (hot end), the High line
	var lo = data.get("lightOffT", null); var hi = data.get("sinterT", null)
	if lo != null:
		var x1: float = clampf(px.call(float(lo)), pl.position.x, pl.end.x)
		if x1 > pl.position.x:
			draw_rect(Rect2(pl.position.x, pl.position.y, x1 - pl.position.x, pl.size.y), Color(0.45, 0.6, 0.75, 0.14)); _dline(Vector2(x1, pl.position.y), Vector2(x1, pl.end.y), Color(0.6, 0.75, 0.9, 0.6))
	var hot = hi if hi != null else marks.get("t_trip", null)
	if hot != null:
		var x2: float = clampf(px.call(float(hot)), pl.position.x, pl.end.x)
		if x2 < pl.end.x:
			draw_rect(Rect2(x2, pl.position.y, pl.end.x - x2, pl.size.y), Color(HoloTheme.RED, 0.14)); _dline(Vector2(x2, pl.position.y), Vector2(x2, pl.end.y), Color(HoloTheme.RED, 0.85), 1.5)
			var tl := "Trip" if hi == null else "Sinters"
			draw_string(f, Vector2(maxf(x2 - f.get_string_size(tl, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x - 5.0, pl.position.x + 3.0), pl.position.y + 17.0), tl, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color(HoloTheme.RED, 0.95))
	if marks.get("t_hi", null) != null:
		var x3: float = px.call(float(marks.t_hi))
		if x3 > pl.position.x and x3 < pl.end.x: _dline(Vector2(x3, pl.position.y + 20.0), Vector2(x3, pl.end.y), Color(HoloTheme.AMBER, 0.75), 1.2)
	# the ceiling: a soft fill, then the luminous line
	var pts := PackedVector2Array()
	for i in ts.size(): pts.append(Vector2(px.call(ts[i]), py.call(xs[i])))
	var fill := PackedVector2Array(pts); fill.append(Vector2(pts[pts.size() - 1].x, pl.end.y)); fill.append(Vector2(pts[0].x, pl.end.y))
	draw_colored_polygon(fill, Color(HoloTheme.TEAL, 0.09))
	draw_polyline(pts, Color(HoloTheme.TEAL, 0.07), 11.0, true); draw_polyline(pts, Color(HoloTheme.TEAL, 0.16), 6.0, true); draw_polyline(pts, HoloTheme.TEAL_HI, 2.2, true)
	# the trail and the operating point
	if _pt.x > 0.0:
		var op := Vector2(px.call(_pt.x), py.call(_pt.y))
		if trail.size() > 1:
			for i in range(1, trail.size()):
				var a := Vector2(px.call(trail[i - 1].x), py.call(trail[i - 1].y)); var b := Vector2(px.call(trail[i].x), py.call(trail[i].y))
				draw_line(a, b, Color(1, 1, 1, 0.12 + 0.55 * float(i) / float(trail.size())), 1.6 + 1.2 * float(i) / float(trail.size()), true)
		_dline(Vector2(op.x, op.y), Vector2(op.x, pl.end.y), Color(1, 1, 1, 0.35), 1.0, 3.0); _dline(Vector2(pl.position.x, op.y), op, Color(1, 1, 1, 0.35), 1.0, 3.0)
		var pt = data.get("point", {})
		if pt is Dictionary and pt.has("TIn"):   # the feed's own temperature: a tick on the axis and the heat the bed adds
			var ix: float = px.call(float(pt.TIn))
			if absf(ix - op.x) > 4.0: draw_line(Vector2(ix, pl.end.y - 1.0), Vector2(op.x, pl.end.y - 1.0), Color(HoloTheme.TEAL, 0.8), 2.0)
			draw_circle(Vector2(ix, pl.end.y), 3.5, HoloTheme.TEAL)
		var pulse := 0.5 + 0.5 * sin(_t * 3.0)
		draw_circle(op, 12.0 + 2.0 * pulse, Color(HoloTheme.TEAL_HI, 0.12)); draw_circle(op, 7.0, Color(HoloTheme.TEAL, 0.55)); draw_circle(op, 4.2, Color.WHITE)
		var lab := "%d °C" % int(round(HoloTheme.c_of(_pt.x)))
		var lw := fb.get_string_size(lab, HORIZONTAL_ALIGNMENT_LEFT, -1, fz).x
		var lx := op.x + 12.0 if op.x + 12.0 + lw < pl.end.x else op.x - 12.0 - lw
		var ly := op.y - 10.0 if op.y - 10.0 > pl.position.y + 16.0 else op.y + 22.0
		draw_string(fb, Vector2(lx, ly), lab, HORIZONTAL_ALIGNMENT_LEFT, -1, fz, Color.WHITE)
		# inlet to outlet line
		if pt is Dictionary and pt.has("TIn"):
			var ft := "Inlet %d °C, outlet %d °C" % [int(round(HoloTheme.c_of(float(pt.TIn)))), int(round(HoloTheme.c_of(_pt.x)))]
			draw_string(f, Vector2(0, pl.end.y + xl + 16.0), ft, HORIZONTAL_ALIGNMENT_LEFT, size.x, fz, HoloTheme.MUTED)
	# the Q/K needle: centre = at equilibrium
	var by := size.y - 18.0
	var bx0 := padl - 10.0; var bx1 := size.x - padr
	var cx := (bx0 + bx1) * 0.5; var span := (bx1 - bx0) * 0.5
	var far := absf(_beam) > 1.0
	var ncol := HoloTheme.AMBER if far else HoloTheme.TEAL_HI
	draw_line(Vector2(bx0, by), Vector2(bx1, by), Color(1, 1, 1, 0.14), 4.0, true)
	var nx := cx + clampf(_beam / 3.0, -1.0, 1.0) * span
	draw_line(Vector2(cx, by), Vector2(nx, by), Color(ncol, 0.8), 4.0, true)
	draw_line(Vector2(cx, by - 9.0), Vector2(cx, by + 9.0), Color(1, 1, 1, 0.55), 1.5)
	draw_colored_polygon(PackedVector2Array([Vector2(nx, by - 4.0), Vector2(nx - 6.0, by - 15.0), Vector2(nx + 6.0, by - 15.0)]), ncol)
	var qk := pow(10.0, _beam_to)
	var qt := "Q/K %s" % (("%.2f" % qk) if qk >= 0.01 else "%.0e" % qk)
	var st := "at equilibrium" if absf(_beam_to) < 0.05 else ("short of equilibrium" if _beam_to < 0.0 else "past equilibrium")
	draw_string(fb, Vector2(0, size.y - 36.0 + 0.0), qt + "  " + st, HORIZONTAL_ALIGNMENT_LEFT, size.x, fz, HoloTheme.INK if not far else HoloTheme.AMBER)
