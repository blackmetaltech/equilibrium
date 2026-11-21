class_name XtDiagram
extends InstrPaper
## The X-T staircase (DESIGN 2.7 L13, 5.4): conversion against temperature with the equilibrium curve, one adiabatic line per bed (inlet to outlet,
## climbing up and to the right) glowing in sequence, the cooler drops (back left at constant X), the catalyst's light-off band (grey, left) and
## sinter band (red, right). Data is the engine's `xtDiagram()`: {eq:[{T,X}], beds:[{inT,outT,inX,outX}], coolers:[{fromT,toT,X}], lightOffT, sinterT}.
## When a bed is added the staircase draws itself step by step (bed line, then cooler drop, next bed).
var _reveal := 99.0        ## steps drawn so far: bed i is full at i*2+1, the cooler after it at i*2+2
var _glow := 0.0

func _on_data(p: Dictionary) -> void:
	var nb := arr(data.get("beds", [])).size(); var pb := arr(p.get("beds", [])).size()
	if nb > pb and nb > 0 and not CbSettings.reduced_motion: _reveal = float(maxi(pb * 2 - 1, 0))
	else: _reveal = 99.0

func has_reading() -> bool: return arr(data.get("beds", [])).size() > 0 and arr(data.get("eq", [])).size() > 1

func _process(dt: float) -> void:
	super._process(dt)
	if mirror_of != null: _reveal = mirror_of._reveal; _glow = mirror_of._glow; return
	if not has_reading(): return
	_glow = fposmod(_glow + dt * 0.7, 1.0)
	if _reveal < 98.0: _reveal += dt * 3.2
	queue_redraw()

func _draw_body() -> void:
	if not has_reading():   # a helpful empty state, not a blank sheet: say what draws the staircase
		empty_note(InstrPaper.T("INS_XT_NONE")); return
	var eq := arr(data.eq); var beds := arr(data.beds); var coolers := arr(data.get("coolers", []))
	var t_lo := kelvin_c(num(eq[0].T)); var t_hi := kelvin_c(num(eq[eq.size() - 1].T))
	for b in beds: t_lo = minf(t_lo, kelvin_c(num(b.inT)) - 15.0); t_hi = maxf(t_hi, kelvin_c(num(b.outT)) + 15.0)
	var xr := Vector2(t_lo, t_hi); var yr := Vector2(0.0, 100.0)
	var pl := paper(xr, yr, func(v: float): return "%.0f" % v, func(v: float): return "%.0f" % v, 36.0, 18.0, 20.0, 6.0)
	var px := func(tk: float) -> float: return pl.position.x + (kelvin_c(tk) - xr.x) / maxf(xr.y - xr.x, 1e-6) * pl.size.x
	var py := func(x: float) -> float: return pl.end.y - clampf(x, 0.0, 1.0) * pl.size.y
	var lo = data.get("lightOffT", null); var hi = data.get("sinterT", null)
	if lo != null:
		var x1: float = clampf(px.call(num(lo)), pl.position.x, pl.end.x)
		if x1 > pl.position.x:
			draw_rect(Rect2(pl.position.x, pl.position.y, x1 - pl.position.x, pl.size.y), Color("#6B7C76", 0.24)); _dash(Vector2(x1, pl.position.y), Vector2(x1, pl.end.y), Color("#6B7C76"))
	if hi != null:
		var x2: float = clampf(px.call(num(hi)), pl.position.x, pl.end.x)
		if x2 < pl.end.x:
			draw_rect(Rect2(x2, pl.position.y, pl.end.x - x2, pl.size.y), Color(EqTheme.PEN_RED, 0.16)); _dash(Vector2(x2, pl.position.y), Vector2(x2, pl.end.y), EqTheme.PEN_RED)
	var ep := PackedVector2Array()
	for p in eq: ep.append(Vector2(px.call(num(p.T)), py.call(num(p.X))))
	draw_polyline(ep, EqTheme.TEAL.darkened(0.35), 4.0 if big else 3.0, true); draw_polyline(ep, EqTheme.TEAL, 2.0, true)
	# cooler drops
	for i in coolers.size():
		var c: Dictionary = coolers[i]
		if _reveal < float(i * 2 + 2): continue
		var a := Vector2(px.call(num(c.fromT)), py.call(num(c.X))); var b := Vector2(px.call(num(c.toT)), py.call(num(c.X)))
		draw_line(a, b, EqTheme.PEN_BLUE, 2.0, true)
		draw_colored_polygon(PackedVector2Array([b, b + Vector2(7, -4), b + Vector2(7, 4)]), EqTheme.PEN_BLUE)
	# the adiabatic lines, lit in sequence
	var n := beds.size()
	for i in n:
		var bd: Dictionary = beds[i]
		var a := Vector2(px.call(num(bd.inT)), py.call(num(bd.inX))); var b := Vector2(px.call(num(bd.outT)), py.call(num(bd.outX)))
		var shown := clampf(_reveal - float(i * 2), 0.0, 1.0)
		if shown <= 0.0: continue
		b = a.lerp(b, shown)
		var lit := clampf(1.0 - absf(fposmod(_glow * float(n) - float(i), float(n)) ) * 1.6, 0.0, 1.0) if n > 0 else 0.0
		var col := EqTheme.PEN_RED.lerp(Color("#FFB703"), lit)
		draw_line(a, b, Color(col, 0.30 + 0.3 * lit), 8.0 + 4.0 * lit, true)
		draw_line(a, b, col, 3.0, true)
		draw_circle(a, 3.5, EqTheme.INK); draw_circle(b, 4.0, col)
		draw_string(EqTheme.font("mono_bold"), (a + b) * 0.5 + Vector2(6, 14), "%d" % (i + 1), HORIZONTAL_ALIGNMENT_LEFT, 20.0, EqTheme.fs(12), EqTheme.INK)
	# readout on tape: the last bed's conversion, and the Tmax
	var last: Dictionary = beds[n - 1]
	var ly := tape(Vector2(pl.position.x + 4.0, pl.position.y + 2.0), "%s %.1f %%%s" % [InstrPaper.T("INS_BED") % n, num(last.outX) * 100.0, (" " + InstrPaper.T("INS_ESTIMATE")) if bool(data.get("estimate", false)) else ""], EqTheme.PEN_RED, pl.size.x - 8.0)
	if lo != null and px.call(num(lo)) > pl.position.x + 70.0: tape(Vector2(pl.position.x + 4.0, pl.end.y - 20.0), InstrPaper.T("INS_ASLEEP"), Color("#6B7C76"), px.call(num(lo)) - pl.position.x - 6.0, 11)
	if hi != null and pl.end.x - px.call(num(hi)) > 60.0: tape(Vector2(px.call(num(hi)) + 4.0, pl.end.y - 20.0), InstrPaper.T("INS_SINTER"), EqTheme.PEN_RED, pl.end.x - px.call(num(hi)) - 6.0, 11)
	frame()
