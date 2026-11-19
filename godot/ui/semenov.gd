class_name SemenovView
extends InstrPaper
## The Semenov plot (DESIGN 2.7 L24): heat generated G(T) (red pen, the S-curve) and heat removed R(T) (blue pen, a straight line) on chart-recorder
## paper. Each crossing is a steady state: a filled disc if stable, a ring with a cross if unstable. The operating point rides a dot on the
## paper. When the cooling changes the R line rotates (morph over 0.4 s). Data is the engine's `semenov(unitId)`: {T,G,R,states:[{T,stable}],op:{T}}.
var live := true       ## false in DESIGN before a run: the curves only, no operating point (nothing is "actual" yet)
var _y_hold := 0.0     ## kW: the axis only grows while a plant is on show, so it does not jump between 0-1000 and 0-1.0 as the curves move
func has_reading() -> bool:
	var ts := arr(data.get("T", []))
	if ts.size() < 2 or absf(float(ts[ts.size() - 1]) - float(ts[0])) < 1.0: _y_hold = 0.0; return false   # no temperature span: nothing to draw (no vertical line)
	var m := 0.0
	for v in arr(data.get("G", [])): m = maxf(m, absf(float(v)))
	for v in arr(data.get("R", [])): m = maxf(m, absf(float(v)))
	if m < 1.0: _y_hold = 0.0; return false   # a degenerate plant (no heat anywhere)
	return true

func _draw_body() -> void:
	if not has_reading(): empty_note(); return
	var ts := mix(arr(prev.get("T", [])), arr(data.T), _k); var gs := mix(arr(prev.get("G", [])), arr(data.G), _k); var rs := mix(arr(prev.get("R", [])), arr(data.R), _k)
	var t_lo := kelvin_c(float(ts[0])); var t_hi := kelvin_c(float(ts[ts.size() - 1]))
	var gmax := 0.0
	for v in gs: gmax = maxf(gmax, float(v))
	var rmax := 0.0
	for v in rs: rmax = maxf(rmax, float(v))
	var y_kw := nice_ceil(maxf(maxf(gmax, minf(rmax, gmax * 3.0)) * 1.2, 100000.0) / 1000.0)   # kW, never below a 100 kW sheet
	_y_hold = maxf(_y_hold, y_kw)
	if mirror_of != null and mirror_of is SemenovView: _y_hold = maxf(_y_hold, (mirror_of as SemenovView)._y_hold)
	var y_hi := _y_hold * 1000.0
	var y_lo := 0.0
	var xr := Vector2(t_lo, t_hi); var yr := Vector2(y_lo / 1000.0, y_hi / 1000.0)
	var pl := paper(xr, yr, func(v: float): return "%.0f" % v, func(v: float): return "%.0f" % v if absf(v) >= 10.0 else "%.1f" % v, 40.0, 18.0, 20.0, 6.0)
	var px := func(tk: float) -> float: return pl.position.x + (kelvin_c(tk) - xr.x) / maxf(xr.y - xr.x, 1e-6) * pl.size.x
	var py := func(w: float) -> float: return pl.end.y - (w / 1000.0 - yr.x) / maxf(yr.y - yr.x, 1e-6) * pl.size.y
	var gp: Array = []; var rp: Array = []
	for i in ts.size(): gp.append(Vector2(px.call(float(ts[i])), py.call(float(gs[i])))); rp.append(Vector2(px.call(float(ts[i])), py.call(float(rs[i]))))
	for i in range(1, gp.size()):
		clipped_line(rp[i - 1], rp[i], pl, EqTheme.PEN_BLUE, 2.5)
		clipped_line(gp[i - 1], gp[i], pl, EqTheme.PEN_RED, 2.5)
	# steady states
	var stat := arr(data.get("states", []))
	for s in stat:
		var tk := num(s.T)
		var gi := _interp(ts, gs, tk)
		var c := Vector2(px.call(tk), py.call(gi))
		if bool(s.get("stable", false)):
			draw_circle(c, 6.0, EqTheme.PORCELAIN); draw_circle(c, 4.5, EqTheme.GOOD)
		else:
			draw_circle(c, 6.0, EqTheme.PORCELAIN); draw_arc(c, 5.0, 0.0, TAU, 16, EqTheme.PEN_RED, 2.0, true)
			draw_line(c + Vector2(-3, -3), c + Vector2(3, 3), EqTheme.PEN_RED, 1.5); draw_line(c + Vector2(-3, 3), c + Vector2(3, -3), EqTheme.PEN_RED, 1.5)
		draw_arc(c, 6.5, 0.0, TAU, 16, EqTheme.INK, 1.0, true)
		draw_string(EqTheme.font("mono"), c + Vector2(8, -6), "%.0f" % kelvin_c(tk), HORIZONTAL_ALIGNMENT_LEFT, 40.0, EqTheme.fs(11 if not big else 13), EqTheme.INK)
	# operating point: a pen-carriage marker on the G curve
	var op: Dictionary = data.get("op", {})
	var now_txt := ""
	var opT := num(op.get("T", 0.0))
	if opT > 0.0 and live:
		var ox: float = px.call(opT); var oy: float = py.call(_interp(ts, gs, opT))
		draw_line(Vector2(ox, pl.position.y), Vector2(ox, pl.end.y), Color(EqTheme.INK, 0.4), 1.0)
		draw_colored_polygon(PackedVector2Array([Vector2(ox, pl.end.y - 1.0), Vector2(ox - 6, pl.end.y + 8), Vector2(ox + 6, pl.end.y + 8)]), EqTheme.INK)
		draw_circle(Vector2(ox, oy), 3.5, EqTheme.INK)
		now_txt = "%s %.0f °C" % [InstrPaper.T("INS_NOW"), kelvin_c(opT)]
	var ly := tape(Vector2(pl.position.x + 4.0, pl.position.y + 2.0), InstrPaper.T("INS_G") + " · " + InstrPaper.T("INS_KW"), EqTheme.PEN_RED, pl.size.x - 8.0, 11)
	ly = tape(Vector2(pl.position.x + 4.0, ly), InstrPaper.T("INS_R"), EqTheme.PEN_BLUE, pl.size.x - 8.0, 11)
	if now_txt != "": ly = tape(Vector2(pl.position.x + 4.0, ly), now_txt, EqTheme.INK, pl.size.x - 8.0, 11)
	if num(data.get("feedKmolH", 0.0)) > 0.0: tape(Vector2(pl.position.x + 4.0, ly), InstrPaper.T("INS_AT_FEED") % ("%.0f" % num(data.get("feedKmolH", 0.0))), EqTheme.INK, pl.size.x - 8.0, 11)
	frame()

func _interp(ts: Array, ys: Array, tk: float) -> float:
	for i in range(1, ts.size()):
		if float(ts[i]) >= tk:
			var a := float(ts[i - 1]); var b := float(ts[i])
			return lerpf(float(ys[i - 1]), float(ys[i]), clampf((tk - a) / maxf(b - a, 1e-9), 0.0, 1.0))
	return float(ys[ys.size() - 1])
