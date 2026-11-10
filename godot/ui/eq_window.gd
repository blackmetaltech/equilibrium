class_name EqWindowView
extends InstrPaper
## The Equilibrium Window (DESIGN 1.3, 5.4): X_eq against T for the reactor's own feed and pressure, the operating point (a dot carrying the
## player's number), the light-off and over-temperature bands, and the brass balance beam that tilts with log10(Q/K) (level = at equilibrium,
## teal glow). Data is the engine's `eqBeam(unitId)`: {window:{T,X}, point:{T,X,TIn}, beam:{out,in}, lightOffT, sinterT}. A new curve morphs over
## 0.4 s (index by index, so the axes slide too); the beam eases to its new angle. Temperatures are shown in deg C.
var _beam := 0.0           ## displayed beam value (eased toward the engine's)
var _beam_to := 0.0

func _on_data(_p: Dictionary) -> void:
	var b = data.get("beam", {})
	_beam_to = clampf(num(b.get("out", 0.0)) if b is Dictionary else 0.0, -3.0, 3.0)

func _process(dt: float) -> void:
	super._process(dt)
	if mirror_of != null: _beam = mirror_of._beam; _beam_to = mirror_of._beam_to
	if absf(_beam - _beam_to) > 0.002:
		_beam = _beam_to if CbSettings.reduced_motion else move_toward(_beam, _beam_to, maxf(2.5 * dt, absf(_beam_to - _beam) * 6.0 * dt)); queue_redraw()

func has_reading() -> bool: return data.get("window") is Dictionary and arr(data.window.get("T", [])).size() > 1

func _pts(w, pw) -> Array:
	var T := mix(arr(pw.get("T", [])) if pw is Dictionary else [], arr(w.get("T", [])), _k)
	var X := mix(arr(pw.get("X", [])) if pw is Dictionary else [], arr(w.get("X", [])), _k)
	return [T, X]

func _draw_body() -> void:
	if not has_reading(): empty_note(); return
	var w: Dictionary = data.window
	var pw = prev.get("window", null)
	var tx := _pts(w, pw); var ts: Array = tx[0]; var xs: Array = tx[1]
	var pt: Dictionary = data.get("point", {})
	var beam_w := minf(size.x * 0.34, 150.0) if size.x >= 330.0 else (size.x * 0.34 if size.x >= 210.0 else 0.0)
	var t_lo := kelvin_c(float(ts[0])); var t_hi := kelvin_c(float(ts[ts.size() - 1]))
	var plr := Rect2(0, 0, size.x - beam_w, size.y)
	# paper over the plot part only
	var xr := Vector2(t_lo, t_hi); var yr := Vector2(0.0, 100.0)
	var gl := 38.0
	var pl := Rect2(gl, 6.0, plr.size.x - gl - 22.0, size.y - 6.0 - 18.0)
	draw_rect(Rect2(Vector2.ZERO, size), EqTheme.PORCELAIN)
	var mono := EqTheme.font("mono"); var fsz := EqTheme.fs(11 if not big else 13)
	var nx := clampi(int(pl.size.x / 80.0), 2, 4)
	for k in nx + 1:
		var gx := pl.position.x + pl.size.x * float(k) / float(nx)
		draw_line(Vector2(gx, pl.position.y), Vector2(gx, pl.end.y), Color("#B9CBC4", 0.9 if k % 2 == 0 else 0.5), 1.0)
		draw_string(mono, Vector2(gx - 24.0, size.y - 3.0), "%.0f" % lerpf(xr.x, xr.y, float(k) / float(nx)), HORIZONTAL_ALIGNMENT_CENTER, 48.0, fsz, EqTheme.INK)
	for k in 5:
		var gy := pl.end.y - pl.size.y * float(k) / 4.0
		draw_line(Vector2(pl.position.x, gy), Vector2(pl.end.x, gy), Color("#B9CBC4", 0.9 if k % 2 == 0 else 0.5), 1.0)
		draw_string(mono, Vector2(1.0, gy + 4.0), "%.0f" % (25.0 * k), HORIZONTAL_ALIGNMENT_RIGHT, gl - 5.0, fsz, EqTheme.INK)
	var px := func(tk: float) -> float: return pl.position.x + (kelvin_c(tk) - xr.x) / maxf(xr.y - xr.x, 1e-6) * pl.size.x
	var py := func(x: float) -> float: return pl.end.y - clampf(x, 0.0, 1.0) * pl.size.y
	# light-off (asleep) and sinter bands
	var lo = data.get("lightOffT", null); var hi = data.get("sinterT", null)
	if lo != null:
		var x1: float = clampf(px.call(num(lo)), pl.position.x, pl.end.x)
		if x1 > pl.position.x:
			draw_rect(Rect2(pl.position.x, pl.position.y, x1 - pl.position.x, pl.size.y), Color("#6B7C76", 0.22))
			_dash(Vector2(x1, pl.position.y), Vector2(x1, pl.end.y), Color("#6B7C76"))
	if hi != null:
		var x2: float = clampf(px.call(num(hi)), pl.position.x, pl.end.x)
		if x2 < pl.end.x:
			draw_rect(Rect2(x2, pl.position.y, pl.end.x - x2, pl.size.y), Color(EqTheme.PEN_RED, 0.16))
			_dash(Vector2(x2, pl.position.y), Vector2(x2, pl.end.y), EqTheme.PEN_RED)
	# the curve
	var pts := PackedVector2Array()
	for i in ts.size(): pts.append(Vector2(px.call(float(ts[i])), py.call(float(xs[i]))))
	draw_polyline(pts, EqTheme.TEAL.darkened(0.35), 4.0 if big else 3.0, true)
	draw_polyline(pts, EqTheme.TEAL, 2.0, true)
	# the operating point
	if pt.has("T") and pt.has("X"):
		var ox: float = px.call(num(pt.T)); var oy: float = py.call(num(pt.X))
		if pt.has("TIn") and absf(num(pt.TIn) - num(pt.T)) > 1.0:   # the feed's own T as a small tick on the axis
			var ix: float = px.call(num(pt.TIn)); draw_line(Vector2(ix, pl.end.y), Vector2(ix, pl.end.y - 7.0), EqTheme.INK, 2.0)
		draw_line(Vector2(ox, oy), Vector2(ox, pl.end.y), Color(EqTheme.INK, 0.35), 1.0); draw_line(Vector2(pl.position.x, oy), Vector2(ox, oy), Color(EqTheme.INK, 0.35), 1.0)
		draw_circle(Vector2(ox, oy), 7.0, EqTheme.PORCELAIN); draw_circle(Vector2(ox, oy), 5.0, EqTheme.PEN_RED); draw_arc(Vector2(ox, oy), 7.0, 0.0, TAU, 20, EqTheme.INK, 1.5, true)
		var label := "%s %.0f °C  %.1f %%" % [T_("INS_NOW"), kelvin_c(num(pt.T)), num(pt.X) * 100.0] if pl.size.x >= 190.0 else "%.0f °C %.0f %%" % [kelvin_c(num(pt.T)), num(pt.X) * 100.0]
		var lx := clampf(ox - 10.0, pl.position.x + 2.0, maxf(pl.end.x - 150.0, pl.position.x + 2.0))
		var ly := oy + 12.0 if oy < pl.position.y + 40.0 else oy - 28.0
		tape(Vector2(lx, ly), label, EqTheme.PEN_RED, pl.size.x)
	tape(Vector2(pl.position.x + 4.0, pl.position.y + 2.0), (T_("INS_EQ") + " " + T_("INS_X")) if pl.size.x >= 190.0 else "ceiling %", EqTheme.TEAL, pl.size.x - 8.0)
	if lo != null and px.call(num(lo)) > pl.position.x + 60.0: tape(Vector2(pl.position.x + 4.0, pl.end.y - 20.0), T_("INS_ASLEEP"), Color("#6B7C76"), px.call(num(lo)) - pl.position.x - 6.0, 11)
	# the balance beam
	if beam_w > 0.0:
		_draw_beam(Rect2(size.x - beam_w, 0.0, beam_w, size.y))
	frame()

static func T_(k: String) -> String: return InstrPaper.T(k)

func _draw_beam(r: Rect2) -> void:
	draw_rect(r, EqTheme.PORCELAIN.darkened(0.04))
	draw_line(Vector2(r.position.x, 0), Vector2(r.position.x, size.y), Color("#8C9A94"), 1.0)
	var lvl := absf(_beam) < 0.06
	var c := Vector2(r.position.x + r.size.x * 0.5, r.position.y + r.size.y * 0.42)
	var half := minf(r.size.x * 0.42, 62.0)
	var ang := clampf(_beam / 3.0, -1.0, 1.0) * deg_to_rad(15.0)
	var brass := Color("#B58A2B") if not lvl else Color("#C9A13B")
	if lvl: draw_circle(c, half * 0.55, Color(EqTheme.TEAL, 0.18))
	# stand: foot and fulcrum
	var foot_y := r.end.y - 22.0
	draw_rect(Rect2(c.x - half * 0.45, foot_y, half * 0.9, 5.0), Color("#5A5249"))
	draw_colored_polygon(PackedVector2Array([Vector2(c.x - 8.0, foot_y), Vector2(c.x + 8.0, foot_y), c + Vector2(0, 4)]), Color("#6B6258"))
	# beam and pans (right pan = products, goes down when Q/K > 1)
	var l := c + Vector2(-cos(ang), -sin(ang)) * half; var rr := c + Vector2(cos(ang), sin(ang)) * half
	draw_line(l, rr, Color("#6B5316"), 6.0, true); draw_line(l, rr, brass, 3.5, true)
	draw_circle(c, 5.0, Color("#6B5316")); draw_circle(c, 3.0, brass.lightened(0.3))
	var drop := minf(r.size.y * 0.22, 40.0)
	for side in [[l, EqTheme.PEN_BLUE, "R"], [rr, EqTheme.PEN_RED, "P"]]:
		var p0: Vector2 = side[0]; var pan_c := p0 + Vector2(0, drop)
		draw_line(p0, pan_c + Vector2(-13, 0), Color("#6B5316"), 1.0); draw_line(p0, pan_c + Vector2(13, 0), Color("#6B5316"), 1.0)
		draw_rect(Rect2(pan_c + Vector2(-14, 0), Vector2(28, 5)), brass)
		draw_circle(pan_c + Vector2(0, -5), 5.0, side[1])
		draw_string(EqTheme.font("mono_bold"), pan_c + Vector2(-5, 17), side[2], HORIZONTAL_ALIGNMENT_CENTER, 10.0, EqTheme.fs(10), EqTheme.INK)
	var txt := T_("INS_BEAM_LEVEL") if lvl else (T_("INS_QK_HI") if _beam > 0.0 else T_("INS_QK_LO"))
	tape(Vector2(r.position.x + 4.0, r.end.y - 18.0), "%s  %s" % [T_("INS_BEAM"), txt] if r.size.x > 120.0 else txt, EqTheme.TEAL if lvl else EqTheme.AMBER, r.size.x - 8.0, 10)
