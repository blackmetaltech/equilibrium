class_name InstrPaper
extends Control
## Base of the chapter 2-7 instruments (Equilibrium Window, X-T staircase, Semenov plot, heat ledger): porcelain chart paper with a mono axis,
## Dymo tape legends, pen colours from EqTheme. Subclasses implement `_draw_body()` and read `data` (the engine query result). Numbers on the
## paper come from the engine only; this class only places them. Strings are InstrPaper.T("INS_*"), registered here (own catalogue, no clash).
signal clicked
var data := {}
var prev := {}             ## the data before the last set_data (the morph starts from it)
var big := false
var mirror_of: InstrPaper
var _k := 1.0              ## morph progress 0..1 from the previous data to the new one (0.4 s)
var _tw: Tween

const S := {
	"INS_EQWIN": "Equilibrium window", "INS_XT": "X-T staircase", "INS_SEM": "Semenov plot", "INS_LEDGER": "Heat ledger",
	"INS_X": "conversion %", "INS_T": "T °C", "INS_NOW": "now", "INS_ASLEEP": "catalyst asleep", "INS_SINTER": "sinters",
	"INS_G": "heat made", "INS_R": "heat removed", "INS_STABLE": "stable", "INS_UNSTABLE": "unstable", "INS_KW": "kW",
	"INS_RELEASED": "released", "INS_RECOVERED": "recovered", "INS_LOST": "lost", "INS_DUTY": "duty", "INS_MW": "MW",
	"INS_BED": "bed %d", "INS_COOL": "cooler", "INS_EQ": "equilibrium", "INS_BEAM_LEVEL": "level", "INS_QK_HI": "too much product", "INS_QK_LO": "too little product",
	"INS_NONE": "No reading yet", "INS_CLOSE": "Close", "INS_TAP": "tap to enlarge", "INS_MORE": "+%d more", "INS_TOTAL": "total",
	"INS_FROM": "ribbon", "INS_ROAD": "all roads", "INS_BEAM": "Q/K",
}
static var _loaded := false
static func T(key: String) -> String:
	if not _loaded:
		_loaded = true
		var t := Translation.new(); t.locale = "en"
		for k in S: t.add_message(k, S[k])
		TranslationServer.add_translation(t)
	return TranslationServer.translate(key)

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_STOP; custom_minimum_size = Vector2(160, 110); clip_contents = true
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND

## New engine data. A change of the curve morphs over 0.4 s (the hook: turn the knob, the curve moves).
func set_data(d: Dictionary) -> void:
	prev = data
	data = d
	_on_data(prev)
	_morph_start()
	queue_redraw()

func _on_data(_prev: Dictionary) -> void: pass

func _morph_start() -> void:
	if _tw != null and _tw.is_valid(): _tw.kill()
	if CbSettings.reduced_motion or not is_inside_tree(): _k = 1.0; return
	_k = 0.0
	_tw = create_tween(); _tw.tween_method(func(v: float): _k = v; queue_redraw(), 0.0, 1.0, 0.4).set_trans(Tween.TRANS_CUBIC).set_ease(Tween.EASE_OUT)

func _gui_input(e: InputEvent) -> void:
	if big: return
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: clicked.emit(); accept_event()
	elif e is InputEventScreenTouch and e.pressed: clicked.emit(); accept_event()

# ---- helpers --------------------------------------------------------------------------------------------------------------------------------
static func num(v, d := 0.0) -> float:
	return float(v) if (v is float or v is int) and is_finite(float(v)) else d

static func arr(v) -> Array: return v if v is Array else []

static func kelvin_c(k: float) -> float: return k - 273.15

## Lerp two equally long arrays element-wise (a different length takes the new one).
static func mix(a: Array, b: Array, k: float) -> Array:
	if a.size() != b.size() or k >= 1.0: return b
	var o: Array = []
	for i in b.size(): o.append(lerpf(float(a[i]), float(b[i]), k))
	return o

func _fmt(v: float) -> String:
	var a := absf(v)
	if a >= 1000.0: return "%.0f" % v
	if a >= 100.0: return "%.0f" % v
	if a >= 10.0: return "%.1f" % v
	return "%.2f" % v

func _dash(a: Vector2, b: Vector2, col: Color, w := 1.5) -> void:
	var d := b - a; var l := d.length(); var dir := d / maxf(l, 0.001); var t := 0.0
	while t < l:
		draw_line(a + dir * t, a + dir * minf(t + 6.0, l), col, w); t += 11.0

## One strip of Dymo tape; returns the y for the next strip below it.
func tape(p: Vector2, text: String, accent: Color, avail := 1.0e6, sz := 12) -> float:
	var f := EqStrings.font("cap"); var s := EqTheme.fs(sz)
	var w := minf(f.get_string_size(text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, s).x + 12.0, avail)
	var h := float(s) + 5.0
	draw_rect(Rect2(p, Vector2(w, h)), EqTheme.DYMO_TAPE)
	draw_rect(Rect2(p + Vector2(0, h), Vector2(w, 1.0)), Color(1, 1, 1, 0.12))
	draw_rect(Rect2(p, Vector2(3.0, h)), accent.lightened(0.2))
	draw_string(f, p + Vector2(7.0, float(s) + 1.0), text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, w - 9.0, s, EqTheme.DYMO_TEXT)
	return p.y + h + 2.0

## Draw the segment a-b clipped to `r` (Liang-Barsky); nothing when it is outside.
func clipped_line(a: Vector2, b: Vector2, r: Rect2, col: Color, w: float) -> void:
	var t0 := 0.0; var t1 := 1.0; var d := b - a
	var p := [-d.x, d.x, -d.y, d.y]; var q := [a.x - r.position.x, r.end.x - a.x, a.y - r.position.y, r.end.y - a.y]
	for i in 4:
		if is_zero_approx(p[i]):
			if q[i] < 0.0: return
		else:
			var t: float = q[i] / p[i]
			if p[i] < 0.0: t0 = maxf(t0, t)
			else: t1 = minf(t1, t)
	if t0 > t1: return
	draw_line(a + d * t0, a + d * t1, col, w, true)

## Paper, grid and axis frame. Returns the plot rect. `xr`/`yr` are the value ranges, `xfmt`/`yfmt` tick formatters (Callable(float) -> String).
func paper(xr: Vector2, yr: Vector2, xfmt: Callable, yfmt: Callable, gl := 44.0, gb := 18.0, gr := 18.0, gt := 6.0) -> Rect2:
	draw_rect(Rect2(Vector2.ZERO, size), EqTheme.PORCELAIN)
	var pl := Rect2(gl, gt, maxf(size.x - gl - gr, 20.0), maxf(size.y - gt - gb, 20.0))
	var mono := EqTheme.font("mono"); var fsz := EqTheme.fs(11 if not big else 13)
	var nx := clampi(int((size.x - gl - gr) / 80.0), 2, 4); var ny := 4
	for k in nx + 1:
		var x := pl.position.x + pl.size.x * float(k) / float(nx)
		draw_line(Vector2(x, pl.position.y), Vector2(x, pl.end.y), Color("#B9CBC4", 0.9 if k % 2 == 0 else 0.5), 1.0)
		var v := lerpf(xr.x, xr.y, float(k) / float(nx))
		draw_string(mono, Vector2(x - 24.0, size.y - 3.0), xfmt.call(v), HORIZONTAL_ALIGNMENT_CENTER, 48.0, fsz, EqTheme.INK)
	for k in ny + 1:
		var y := pl.end.y - pl.size.y * float(k) / float(ny)
		draw_line(Vector2(pl.position.x, y), Vector2(pl.end.x, y), Color("#B9CBC4", 0.9 if k % 2 == 0 else 0.5), 1.0)
		var v := lerpf(yr.x, yr.y, float(k) / float(ny))
		draw_string(mono, Vector2(1.0, y + 4.0), yfmt.call(v), HORIZONTAL_ALIGNMENT_RIGHT, gl - 5.0, fsz, EqTheme.INK)
	return pl

func frame() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), Color("#4B5B55"), false, 1.0)

func empty_note() -> void:
	draw_rect(Rect2(Vector2.ZERO, size), EqTheme.PORCELAIN)
	draw_string(EqStrings.font("body"), Vector2(10, size.y * 0.5 + 5.0), T("INS_NONE"), HORIZONTAL_ALIGNMENT_LEFT, size.x - 20.0, EqTheme.fs(13), Color("#6B7C76"))
	frame()

func _draw() -> void:
	if mirror_of != null: data = mirror_of.data; prev = mirror_of.prev; _k = mirror_of._k
	_draw_body()

func _draw_body() -> void: empty_note()

func _process(_dt: float) -> void:
	if mirror_of != null: queue_redraw()

## A round axis maximum at or above v (1, 2, 2.5, 5, 10 x 10^n), so the ticks read as plain numbers.
static func nice_ceil(v: float) -> float:
	if v <= 0.0: return 1.0
	var e := pow(10.0, floorf(log(v) / log(10.0)))
	for m in [1.0, 2.0, 2.5, 5.0, 10.0]:
		if v <= m * e + 1e-9: return m * e
	return 10.0 * e
