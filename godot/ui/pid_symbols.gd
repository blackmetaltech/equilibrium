class_name PidSymbols
extends RefCounted
## P&ID symbols (ISO 10628 / ISA 5.1 style) drawn with CanvasItem primitives. Pure helpers: `PidSymbols.draw(ci, type, rect, col)` from any `_draw()`.
## Each symbol lives in a unit box (0..1 x 0..1) with its own aspect, fitted and centred in `rect`. No engine knowledge here beyond the type id.
const ASPECT := {
	"hx": 1.5, "compressor": 1.4, "boiler": 1.5, "heater": 1.0, "cooler": 1.0, "stack": 0.55, "flare": 0.6, "absorber": 0.62, "flash": 0.72, "nh3_sep": 0.72,
	"feed": 1.3, "relief": 0.9, "valve": 1.3, "splitter": 1.2, "purge": 1.2, "mixer": 1.2, "mixer3": 1.2, "mixer4": 1.2, "eq_reactor": 0.8, "eq_bed": 0.8,
	"packed_bed": 0.8, "multibed": 0.8, "cstr": 0.8, "batch": 0.8, "stoich_reactor": 0.8, "burner": 0.8, "gasifier": 0.8, "co_burner": 0.8, "lab_flask": 0.8, "product": 1.0,
	"vent": 1.1, "sink": 1.0, "interlock": 1.0,
}
const W := 2.0

static func aspect(type: String) -> float: return ASPECT.get(type, 1.0)

static func draw(ci: CanvasItem, type: String, rect: Rect2, col: Color, acc := Color(0, 0, 0, 0)) -> void:
	if acc.a == 0.0: acc = col
	var r := PaperStrings.rect_fit(rect, aspect(type))
	var w := maxf(1.5, minf(r.size.x, r.size.y) / 28.0) if r.size.x > 20.0 else 1.5
	match type:
		"feed": _feed(ci, r, col, acc, w)
		"mixer", "mixer3", "mixer4": _mixer(ci, r, col, w, 4 if type == "mixer4" else (3 if type == "mixer3" else 2))
		"splitter", "purge": _splitter(ci, r, col, acc, w, type == "purge")
		"heater", "cooler": _heater(ci, r, col, acc, w, type == "heater")
		"hx": _hx(ci, r, col, acc, w)
		"compressor": _compressor(ci, r, col, w)
		"valve": _valve(ci, r, col, w)
		"flash", "nh3_sep": _flash(ci, r, col, acc, w, type == "nh3_sep")
		"boiler": _boiler(ci, r, col, acc, w)
		"absorber": _column(ci, r, col, w)
		"stack": _stack(ci, r, col, acc, w)
		"relief": _relief(ci, r, col, w)
		"flare": _flare(ci, r, col, acc, w)
		"interlock": _interlock(ci, r, col, acc, w)
		"vent": _vent(ci, r, col, w)
		"sink": _sink(ci, r, col, w)
		"product": _sphere(ci, r, col, acc, w)
		"eq_reactor", "stoich_reactor", "gasifier", "co_burner": _reactor(ci, r, col, acc, w, 1, type == "co_burner" or type == "gasifier")
		"eq_bed", "packed_bed": _reactor(ci, r, col, acc, w, 1, false)
		"multibed": _reactor(ci, r, col, acc, w, 3, false)
		"burner": _reactor(ci, r, col, acc, w, 0, true)
		"cstr", "batch": _cstr(ci, r, col, acc, w)
		"lab_flask": _flask(ci, r, col, acc, w)
		_: _vessel_generic(ci, r, col, w)

# ---- helpers ----------------------------------------------------------------------------------------------------------------
static func P(r: Rect2, x: float, y: float) -> Vector2: return r.position + Vector2(x * r.size.x, y * r.size.y)

static func _pl(ci: CanvasItem, pts: PackedVector2Array, col: Color, w: float) -> void: ci.draw_polyline(pts, col, w, true)

static func _line(ci: CanvasItem, r: Rect2, a: Vector2, b: Vector2, col: Color, w: float) -> void: ci.draw_line(P(r, a.x, a.y), P(r, b.x, b.y), col, w, true)

static func _circle(ci: CanvasItem, c: Vector2, rad: float, col: Color, w: float) -> void: ci.draw_arc(c, rad, 0.0, TAU, 40, col, w, true)

## A vertical capsule (vessel with elliptical heads) in rect `cr`.
static func _capsule(ci: CanvasItem, cr: Rect2, col: Color, w: float) -> void:
	var rad := cr.size.x * 0.5
	var top := cr.position + Vector2(rad, rad); var bot := cr.position + Vector2(rad, cr.size.y - rad)
	ci.draw_arc(top, rad, PI, TAU, 20, col, w, true); ci.draw_arc(bot, rad, 0.0, PI, 20, col, w, true)
	ci.draw_line(cr.position + Vector2(0, rad), cr.position + Vector2(0, cr.size.y - rad), col, w, true)
	ci.draw_line(cr.position + Vector2(cr.size.x, rad), cr.position + Vector2(cr.size.x, cr.size.y - rad), col, w, true)

static func _hatch(ci: CanvasItem, hr: Rect2, col: Color, gap: float, w: float) -> void:
	var t := -hr.size.y
	while t < hr.size.x:
		var a := Vector2(t, hr.size.y); var b := Vector2(t + hr.size.y, 0.0)
		if a.x < 0.0: a = Vector2(0.0, hr.size.y + t)
		if b.x > hr.size.x: b = Vector2(hr.size.x, t + hr.size.y - hr.size.x)
		if a.x <= hr.size.x and b.x >= 0.0 and a.y >= 0.0 and b.y >= 0.0: ci.draw_line(hr.position + a, hr.position + b, col, w, true)
		t += gap

static func _nozzle(ci: CanvasItem, p: Vector2, dir: Vector2, len: float, col: Color, w: float) -> void: ci.draw_line(p, p + dir * len, col, w, true)

static func _flame(ci: CanvasItem, c: Vector2, s: float, col: Color) -> void:
	ci.draw_colored_polygon(PackedVector2Array([c + Vector2(0, -s), c + Vector2(s * 0.6, s * 0.2), c + Vector2(s * 0.25, s), c + Vector2(-s * 0.25, s), c + Vector2(-s * 0.6, s * 0.2)]), col)

# ---- symbols ----------------------------------------------------------------------------------------------------------------
static func _feed(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # cylinder bank: three gas cylinders on a manifold
	for i in range(3):
		var cx := 0.2 + 0.3 * i
		var cr := Rect2(P(r, cx - 0.11, 0.1), Vector2(r.size.x * 0.22, r.size.y * 0.72))
		_capsule(ci, cr, col, w)
		ci.draw_line(P(r, cx - 0.04, 0.1), P(r, cx - 0.04, 0.0), col, w, true); ci.draw_line(P(r, cx + 0.04, 0.1), P(r, cx + 0.04, 0.0), col, w, true)
		ci.draw_rect(Rect2(P(r, cx - 0.11, 0.36), Vector2(r.size.x * 0.22, r.size.y * 0.08)), Color(acc, 0.8))
	ci.draw_line(P(r, 0.12, 0.88), P(r, 0.88, 0.88), col, w, true); ci.draw_line(P(r, 0.12, 0.98), P(r, 0.88, 0.98), col, w, true)

static func _mixer(ci: CanvasItem, r: Rect2, col: Color, w: float, n: int) -> void:
	var c := P(r, 0.62, 0.5); var rad := r.size.y * 0.3
	_circle(ci, c, rad, col, w)
	for i in range(n):
		var y := 0.5 if n == 1 else lerpf(0.2, 0.8, float(i) / float(maxi(n - 1, 1)))
		ci.draw_line(P(r, 0.0, y), c + Vector2(-rad * 0.8, (y - 0.5) * r.size.y * 0.35), col, w, true)
	ci.draw_line(c + Vector2(rad, 0), P(r, 1.0, 0.5), col, w, true)
	ci.draw_line(c + Vector2(-rad * 0.6, -rad * 0.6), c + Vector2(rad * 0.6, rad * 0.6), col, w, true); ci.draw_line(c + Vector2(-rad * 0.6, rad * 0.6), c + Vector2(rad * 0.6, -rad * 0.6), col, w, true)

static func _splitter(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float, purge: bool) -> void:   # tee with a flow-split triangle
	ci.draw_line(P(r, 0.0, 0.42), P(r, 1.0, 0.42), col, w, true); ci.draw_line(P(r, 0.5, 0.42), P(r, 0.5, 1.0), col, w, true)
	ci.draw_colored_polygon(PackedVector2Array([P(r, 0.4, 0.42), P(r, 0.4, 0.12), P(r, 0.6, 0.27)]), Color(acc, 0.85))
	if purge: ci.draw_line(P(r, 0.38, 0.9), P(r, 0.62, 0.9), col, w, true)

static func _heater(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float, heat: bool) -> void:
	var c := P(r, 0.5, 0.5); var rad := minf(r.size.x, r.size.y) * 0.38
	_circle(ci, c, rad, col, w)
	var pts := PackedVector2Array()
	for i in range(7): pts.append(c + Vector2(lerpf(-rad * 0.7, rad * 0.7, i / 6.0), (rad * 0.28) * (1.0 if i % 2 == 0 else -1.0)))
	_pl(ci, pts, col, w)
	ci.draw_line(P(r, 0.0, 0.5), c + Vector2(-rad, 0), col, w, true); ci.draw_line(c + Vector2(rad, 0), P(r, 1.0, 0.5), col, w, true)
	var ay := -rad - r.size.y * 0.05
	if heat: ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-rad * 0.28, ay + rad * 0.0 - 1), c + Vector2(rad * 0.28, ay), c + Vector2(0, ay - rad * 0.42)]), acc)
	else: ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-rad * 0.28, ay - rad * 0.4), c + Vector2(rad * 0.28, ay - rad * 0.4), c + Vector2(0, ay)]), acc)

static func _hx(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # shell and tube: circle with the tube line through it
	var c := P(r, 0.5, 0.5); var rad := r.size.y * 0.4
	_circle(ci, c, rad, col, w)
	var pts := PackedVector2Array([P(r, 0.0, 0.5), c + Vector2(-rad, 0)])
	for i in range(1, 6): pts.append(c + Vector2(lerpf(-rad, rad, i / 6.0), rad * 0.45 * (-1.0 if i % 2 == 1 else 1.0)))
	pts.append(c + Vector2(rad, 0)); pts.append(P(r, 1.0, 0.5))
	_pl(ci, pts, acc, w)
	ci.draw_line(c + Vector2(-rad * 0.5, -rad * 0.87), c + Vector2(-rad * 0.5, -r.size.y * 0.5), col, w, true); ci.draw_line(c + Vector2(rad * 0.5, rad * 0.87), c + Vector2(rad * 0.5, r.size.y * 0.5), col, w, true)

static func _compressor(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:   # circle with the converging trapezoid
	var c := P(r, 0.5, 0.5); var rad := r.size.y * 0.42
	_circle(ci, c, rad, col, w)
	_pl(ci, PackedVector2Array([c + Vector2(-rad * 0.72, -rad * 0.7), c + Vector2(rad * 0.72, -rad * 0.28), c + Vector2(rad * 0.72, rad * 0.28), c + Vector2(-rad * 0.72, rad * 0.7), c + Vector2(-rad * 0.72, -rad * 0.7)]), col, w)
	ci.draw_line(P(r, 0.0, 0.5), c + Vector2(-rad, 0), col, w, true); ci.draw_line(c + Vector2(rad, 0), P(r, 1.0, 0.5), col, w, true)

static func _valve(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:   # bow-tie with the diaphragm actuator
	var c := P(r, 0.5, 0.62); var hh := r.size.y * 0.26; var hw := r.size.x * 0.22
	_pl(ci, PackedVector2Array([c + Vector2(-hw, -hh), c + Vector2(hw, hh), c + Vector2(hw, -hh), c + Vector2(-hw, hh), c + Vector2(-hw, -hh)]), col, w)
	ci.draw_line(P(r, 0.0, 0.62), c + Vector2(-hw, 0), col, w, true); ci.draw_line(c + Vector2(hw, 0), P(r, 1.0, 0.62), col, w, true)
	ci.draw_line(c, c + Vector2(0, -r.size.y * 0.36), col, w, true)
	ci.draw_arc(c + Vector2(0, -r.size.y * 0.36), r.size.x * 0.13, PI, TAU, 14, col, w, true); ci.draw_line(c + Vector2(-r.size.x * 0.13, -r.size.y * 0.36), c + Vector2(r.size.x * 0.13, -r.size.y * 0.36), col, w, true)

static func _flash(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float, cold: bool) -> void:   # flash drum: capsule, liquid line, demister
	var cr := Rect2(P(r, 0.12, 0.04), Vector2(r.size.x * 0.76, r.size.y * 0.92))
	_capsule(ci, cr, col, w)
	ci.draw_rect(Rect2(P(r, 0.12, 0.62), Vector2(r.size.x * 0.76, r.size.y * 0.3)), Color(acc, 0.35))
	ci.draw_line(P(r, 0.12, 0.62), P(r, 0.88, 0.62), acc, w, true)
	ci.draw_line(P(r, 0.2, 0.28), P(r, 0.8, 0.28), col, w * 0.7, true); ci.draw_line(P(r, 0.2, 0.34), P(r, 0.8, 0.34), col, w * 0.7, true)
	ci.draw_line(P(r, 0.88, 0.5), P(r, 1.0, 0.5), col, w, true); ci.draw_line(P(r, 0.5, 0.96), P(r, 0.5, 1.0), col, w)
	if cold: ci.draw_line(P(r, 0.2, 0.78), P(r, 0.8, 0.78), col, w * 0.7, true)

static func _boiler(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # steam drum over a fired box
	ci.draw_rect(Rect2(P(r, 0.05, 0.5), Vector2(r.size.x * 0.9, r.size.y * 0.42)), col, false, w)
	var dr := Rect2(P(r, 0.1, 0.08), Vector2(r.size.x * 0.8, r.size.y * 0.3))
	ci.draw_arc(dr.position + Vector2(dr.size.y * 0.5, dr.size.y * 0.5), dr.size.y * 0.5, PI * 0.5, PI * 1.5, 12, col, w, true)
	ci.draw_arc(dr.position + Vector2(dr.size.x - dr.size.y * 0.5, dr.size.y * 0.5), dr.size.y * 0.5, -PI * 0.5, PI * 0.5, 12, col, w, true)
	ci.draw_line(dr.position + Vector2(dr.size.y * 0.5, 0), dr.position + Vector2(dr.size.x - dr.size.y * 0.5, 0), col, w, true); ci.draw_line(dr.position + Vector2(dr.size.y * 0.5, dr.size.y), dr.position + Vector2(dr.size.x - dr.size.y * 0.5, dr.size.y), col, w, true)
	ci.draw_line(P(r, 0.3, 0.38), P(r, 0.3, 0.5), col, w, true); ci.draw_line(P(r, 0.7, 0.38), P(r, 0.7, 0.5), col, w, true)
	for fx in [0.3, 0.5, 0.7]: _flame(ci, P(r, fx, 0.72), r.size.y * 0.13, acc)

static func _column(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:   # column with trays
	var cr := Rect2(P(r, 0.2, 0.02), Vector2(r.size.x * 0.6, r.size.y * 0.96))
	_capsule(ci, cr, col, w)
	for i in range(5):
		var y := 0.2 + 0.14 * i
		ci.draw_line(P(r, 0.2 if i % 2 == 0 else 0.5, y), P(r, 0.5 if i % 2 == 0 else 0.8, y), col, w * 0.8, true)
	ci.draw_line(P(r, 0.8, 0.3), P(r, 1.0, 0.3), col, w, true); ci.draw_line(P(r, 0.0, 0.8), P(r, 0.2, 0.8), col, w, true)

static func _stack(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:
	_pl(ci, PackedVector2Array([P(r, 0.22, 1.0), P(r, 0.34, 0.2), P(r, 0.66, 0.2), P(r, 0.78, 1.0)]), col, w)
	ci.draw_line(P(r, 0.3, 0.45), P(r, 0.7, 0.45), col, w * 0.7, true)
	for i in range(3): ci.draw_circle(P(r, 0.5 + 0.06 * i, 0.14 - 0.045 * i), r.size.x * (0.08 + 0.03 * i), Color(acc, 0.4))

static func _relief(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:   # PSV: angle body and the spring
	ci.draw_colored_polygon(PackedVector2Array([P(r, 0.2, 0.9), P(r, 0.2, 0.5), P(r, 0.6, 0.7)]), col)
	_pl(ci, PackedVector2Array([P(r, 0.4, 0.6), P(r, 0.4, 0.5), P(r, 0.6, 0.4), P(r, 0.2, 0.3), P(r, 0.6, 0.2), P(r, 0.4, 0.1)]), col, w)
	ci.draw_line(P(r, 0.6, 0.7), P(r, 1.0, 0.7), col, w, true); ci.draw_line(P(r, 0.2, 0.9), P(r, 0.0, 0.9), col, w, true)

static func _flare(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:
	ci.draw_line(P(r, 0.5, 1.0), P(r, 0.5, 0.42), col, w * 1.4, true); ci.draw_line(P(r, 0.3, 1.0), P(r, 0.7, 1.0), col, w, true)
	_flame(ci, P(r, 0.5, 0.22), r.size.y * 0.2, acc)
	ci.draw_line(P(r, 0.38, 0.45), P(r, 0.62, 0.45), col, w, true)

static func _interlock(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:
	var c := P(r, 0.5, 0.5); var s := minf(r.size.x, r.size.y) * 0.4
	_pl(ci, PackedVector2Array([c + Vector2(0, -s), c + Vector2(s, 0), c + Vector2(0, s), c + Vector2(-s, 0), c + Vector2(0, -s)]), col, w)
	ci.draw_line(c + Vector2(0, -s * 0.5), c + Vector2(0, s * 0.5), acc, w * 1.6, true); ci.draw_line(c + Vector2(-s * 0.25, -s * 0.5), c + Vector2(s * 0.25, -s * 0.5), acc, w * 1.6, true); ci.draw_line(c + Vector2(-s * 0.25, s * 0.5), c + Vector2(s * 0.25, s * 0.5), acc, w * 1.6, true)

static func _vent(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_line(P(r, 0.0, 0.5), P(r, 0.55, 0.5), col, w, true)
	_pl(ci, PackedVector2Array([P(r, 0.55, 0.2), P(r, 0.95, 0.5), P(r, 0.55, 0.8), P(r, 0.55, 0.2)]), col, w)

static func _sink(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	ci.draw_line(P(r, 0.0, 0.5), P(r, 0.3, 0.5), col, w, true)
	ci.draw_rect(Rect2(P(r, 0.3, 0.2), Vector2(r.size.x * 0.6, r.size.y * 0.6)), col, false, w)
	ci.draw_line(P(r, 0.3, 0.2), P(r, 0.9, 0.8), col, w * 0.7, true); ci.draw_line(P(r, 0.3, 0.8), P(r, 0.9, 0.2), col, w * 0.7, true)

static func _sphere(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # product tank: sphere on legs
	var c := P(r, 0.5, 0.42); var rad := minf(r.size.x, r.size.y) * 0.34
	ci.draw_circle(c + Vector2(0, rad * 0.3), rad * 0.7, Color(acc, 0.28))
	_circle(ci, c, rad, col, w)
	ci.draw_line(c + Vector2(-rad * 0.95, rad * 0.25), c + Vector2(rad * 0.95, rad * 0.25), acc, w * 0.8, true)
	for sx in [-0.7, 0.0, 0.7]: ci.draw_line(c + Vector2(rad * sx, rad * 0.95 if sx == 0.0 else rad * 0.72), P(r, 0.5 + sx * 0.28, 0.98), col, w, true)
	ci.draw_line(P(r, 0.24, 0.98), P(r, 0.76, 0.98), col, w, true)

static func _reactor(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float, beds: int, flame: bool) -> void:   # vessel with bed hatching
	var cr := Rect2(P(r, 0.18, 0.04), Vector2(r.size.x * 0.64, r.size.y * 0.9))
	_capsule(ci, cr, col, w)
	if beds > 0:
		var top := 0.3; var bot := 0.74; var gap := 0.05
		var bh := (bot - top - gap * (beds - 1)) / beds
		for i in range(beds):
			var y := top + i * (bh + gap)
			var hr := Rect2(P(r, 0.18, y), Vector2(r.size.x * 0.64, r.size.y * bh))
			ci.draw_rect(hr, Color(acc, 0.12)); _hatch(ci, hr, acc, maxf(4.0, r.size.x * 0.1), w * 0.7)
			ci.draw_line(hr.position, hr.position + Vector2(hr.size.x, 0), col, w * 0.7, true); ci.draw_line(hr.position + Vector2(0, hr.size.y), hr.position + hr.size, col, w * 0.7, true)
	if flame: _flame(ci, P(r, 0.5, 0.55), r.size.y * 0.16, acc)
	ci.draw_line(P(r, 0.5, 0.04), P(r, 0.5, 0.0), col, w, true); ci.draw_line(P(r, 0.5, 0.94), P(r, 0.5, 1.0), col, w, true)
	ci.draw_line(P(r, 0.0, 0.2), P(r, 0.18, 0.2), col, w, true); ci.draw_line(P(r, 0.82, 0.8), P(r, 1.0, 0.8), col, w, true)

static func _cstr(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # vessel with an agitator
	var cr := Rect2(P(r, 0.15, 0.1), Vector2(r.size.x * 0.7, r.size.y * 0.82))
	_capsule(ci, cr, col, w)
	ci.draw_line(P(r, 0.5, 0.0), P(r, 0.5, 0.66), acc, w * 1.2, true); ci.draw_line(P(r, 0.3, 0.66), P(r, 0.7, 0.66), acc, w * 1.2, true)
	ci.draw_rect(Rect2(P(r, 0.4, -0.02), Vector2(r.size.x * 0.2, r.size.y * 0.07)), col, false, w)
	ci.draw_line(P(r, 0.15, 0.45), P(r, 0.85, 0.45), col, w * 0.6, true)

static func _flask(ci: CanvasItem, r: Rect2, col: Color, acc: Color, w: float) -> void:   # lab flask
	var poly := PackedVector2Array([P(r, 0.38, 0.05), P(r, 0.38, 0.38), P(r, 0.1, 0.92), P(r, 0.9, 0.92), P(r, 0.62, 0.38), P(r, 0.62, 0.05)])
	_pl(ci, poly, col, w); ci.draw_line(P(r, 0.32, 0.05), P(r, 0.68, 0.05), col, w, true)
	ci.draw_colored_polygon(PackedVector2Array([P(r, 0.25, 0.68), P(r, 0.75, 0.68), P(r, 0.87, 0.9), P(r, 0.13, 0.9)]), Color(acc, 0.45))

static func _vessel_generic(ci: CanvasItem, r: Rect2, col: Color, w: float) -> void:
	_capsule(ci, Rect2(P(r, 0.2, 0.05), Vector2(r.size.x * 0.6, r.size.y * 0.9)), col, w)

## A flask pictogram for stars: the stamped variants use `fill`.
static func flask(ci: CanvasItem, c: Vector2, s: float, col: Color, filled: bool, fill: Color) -> void:
	var pts := PackedVector2Array([c + Vector2(-s * 0.18, -s * 0.5), c + Vector2(-s * 0.18, -s * 0.12), c + Vector2(-s * 0.5, s * 0.5), c + Vector2(s * 0.5, s * 0.5), c + Vector2(s * 0.18, -s * 0.12), c + Vector2(s * 0.18, -s * 0.5)])
	if filled: ci.draw_colored_polygon(PackedVector2Array([c + Vector2(-s * 0.3, s * 0.12), c + Vector2(s * 0.3, s * 0.12), c + Vector2(s * 0.5, s * 0.5), c + Vector2(-s * 0.5, s * 0.5)]), fill)
	ci.draw_polyline(pts, col, maxf(1.5, s / 14.0), true); ci.draw_line(c + Vector2(-s * 0.26, -s * 0.5), c + Vector2(s * 0.26, -s * 0.5), col, maxf(1.5, s / 14.0), true)
