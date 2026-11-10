class_name ChartRecorder
extends Control
## The chart recorder (UI.md 5): porcelain paper scrolling right to left under up to three ink pens. Pen 1 (blue) is the level's hero quantity against a
## printed target band; pen 2 (red) the secondary with its limit line; pen 3 (green) an optional third. Every commission adds a short trace segment with a
## run tick (the paper is the player's experiment history, kept here on the client; every number comes from the engine). During a shift it scrolls in
## plant time (one sample per engine tick). Click opens the full-size recorder. `feed(levelInfo, runs)` is called on every engine change.
signal clicked
var hero := {}              ## {key, label, unit, value, lo, hi}
var sec := {}               ## {key, label, unit, value, limit} or {}
var third := {}             ## optional {key, label, unit, value}
var runs: Array = []        ## {n, h, s, t}: one per commission, numbers from the engine
var samples: Array = []     ## shift samples {h, s, t}
var phase := "design"
var level_id := ""
var paper := 0.0            ## paper travelled (px), animated toward `_target`
var big := false
var src: ChartRecorder      ## a full-size recorder mirrors the small one
var _target := 0.0
var _sig := ""
var _last_tick := -1
var _demo := true
var first_run := {}         ## levelInfo.firstRun {t, len, madeKg} while a first run plays
const RUN_W := 60.0
const SAMPLE_W := 3.0

func _init() -> void:
	EqStrings.load_strings()
	mouse_filter = Control.MOUSE_FILTER_STOP; custom_minimum_size = Vector2(200, 60); clip_contents = true
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	hero = {"key": "demo", "label": EqStrings.T("REC_DEMO_HERO"), "unit": "", "value": 0.0, "lo": 30.0, "hi": 34.0}
	sec = {"key": "demo2", "label": EqStrings.T("REC_DEMO_SEC"), "unit": "", "value": 0.0, "limit": 5.0}

func mirror(from: ChartRecorder) -> void: src = from; _pull()

func _pull() -> void:
	if src == null: return
	hero = src.hero; sec = src.sec; third = src.third; runs = src.runs; samples = src.samples; phase = src.phase; _demo = src._demo; first_run = src.first_run
	_target = src._target
	if absf(paper - src.paper) > 0.01: paper = src.paper

func _running() -> bool: return phase == "shift" or phase == "firstrun"

func _num(v) -> float:
	return float(v) if (v is float or v is int) and is_finite(float(v)) else 0.0

func _has(d: Dictionary, k: String) -> bool: return d.has(k) and (d[k] is float or d[k] is int) and is_finite(float(d[k]))

## Engine change. `li` is levelInfo (may be {}), `run_list` the engine's runs query.
func feed(li: Dictionary, run_list: Array, tick: int) -> void:
	if li.is_empty(): return
	var id := str(li.get("id", ""))
	if id != level_id:
		level_id = id; runs = []; samples = []; paper = 0.0; _target = 0.0; _sig = ""; _last_tick = -1
	if li.get("hero") is Dictionary: hero = li.hero; _demo = false
	sec = li.secondary if li.get("secondary") is Dictionary else {}
	third = li.third if li.get("third") is Dictionary else {}
	phase = str(li.get("phase", "design"))
	first_run = li.firstRun if li.get("firstRun") is Dictionary and phase == "firstrun" else {}
	var hv := _num(hero.get("value", 0.0)); var sv := _num(sec.get("value", 0.0)); var tv := _num(third.get("value", 0.0))
	if _running():
		if tick != _last_tick:
			_last_tick = tick
			samples.append({"h": hv, "s": sv, "t": tv})
			if samples.size() > 900: samples.pop_front()
			_target += SAMPLE_W
	elif phase != "design":
		var lt := int((run_list.back() as Dictionary).get("tick", 0)) if not run_list.is_empty() else 0
		var sig := "%s|%d|%d" % [str(hero.get("value", "")), lt, run_list.size()]
		if sig != _sig and _has(hero, "value"):
			_sig = sig
			record_run(hv, sv, tv)
	queue_redraw()

func record_run(h: float, s := 0.0, t := 0.0) -> void:
	runs.append({"n": runs.size() + 1, "h": h, "s": s, "t": t})
	if runs.size() > 40: runs.pop_front()
	_target = float(runs.size() - 1) * RUN_W
	_demo = false

func _process(dt: float) -> void:
	if src != null: _pull()
	elif absf(paper - _target) > 0.05:
		paper = move_toward(paper, _target, maxf(40.0, absf(_target - paper) * 4.0) * dt) if not CbSettings.reduced_motion else _target
	if _running() or absf(paper - _target) > 0.05 or src != null: queue_redraw()

func _gui_input(e: InputEvent) -> void:
	if big: return
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: clicked.emit(); accept_event()
	elif e is InputEventScreenTouch and e.pressed: clicked.emit(); accept_event()

# ---- drawing -------------------------------------------------------------------------------------------------------------------------------------
func _plot() -> Rect2:
	var gl := 46.0 if big else 40.0
	return Rect2(gl, 4.0, size.x - gl - 60.0, size.y - 8.0 - 16.0)

func _range() -> Vector2:
	var lo := 0.0; var hi := _num(hero.get("hi", 1.0)) * 1.35
	var arr := _pts()
	for p in arr:
		hi = maxf(hi, _num(p.h) * 1.12); lo = minf(lo, _num(p.h))
	if hi <= lo: hi = lo + 1.0
	return Vector2(lo, hi)

func _srange() -> Vector2:
	var hi := maxf(_num(sec.get("limit", 0.0)) * 1.5, 0.0)
	for p in _pts(): hi = maxf(hi, _num(p.s) * 1.12)
	return Vector2(0.0, hi if hi > 0.0 else 1.0)

func _pts() -> Array: return samples if (_running() and not samples.is_empty()) else runs

func _y(v: float, r: Vector2, pl: Rect2) -> float: return pl.end.y - (v - r.x) / (r.y - r.x) * pl.size.y

func _draw() -> void:
	var pl := _plot()
	var mono := EqTheme.font("mono"); var fsz := EqTheme.fs(13)
	draw_rect(Rect2(Vector2.ZERO, size), EqTheme.PORCELAIN)
	var r := _range(); var sr := _srange()
	# grid, scrolling with the paper
	var gx := fposmod(-paper, 16.0)
	var gi := 0
	var x := pl.position.x + gx
	while x < pl.end.x:
		draw_line(Vector2(x, pl.position.y), Vector2(x, pl.end.y), Color("#B9CBC4", 0.55 if gi % 5 else 0.95), 1.0)
		x += 16.0; gi += 1
	for k in 5:
		var yy := pl.position.y + pl.size.y * float(k) / 4.0
		draw_line(Vector2(pl.position.x, yy), Vector2(pl.end.x + 60.0, yy), Color("#B9CBC4", 0.9 if k % 2 == 0 else 0.5), 1.0)
	# target band
	if _has(hero, "lo") and _has(hero, "hi"):
		var y0 := _y(_num(hero.hi), r, pl); var y1 := _y(_num(hero.lo), r, pl)
		draw_rect(Rect2(pl.position.x, y0, pl.size.x + 60.0, y1 - y0), Color(EqTheme.TEAL, 0.22))
		_dash(Vector2(pl.position.x, y0), Vector2(pl.end.x + 60.0, y0), EqTheme.TEAL.darkened(0.25)); _dash(Vector2(pl.position.x, y1), Vector2(pl.end.x + 60.0, y1), EqTheme.TEAL.darkened(0.25))
	# limit of the secondary
	if _has(sec, "limit") and _num(sec.limit) > 0.0:
		var ly := _y(_num(sec.limit), sr, pl)
		_dash(Vector2(pl.position.x, ly), Vector2(pl.end.x + 60.0, ly), EqTheme.PEN_RED)
	# traces
	var pts := _pts()
	var shiftm := _running() and not samples.is_empty()
	var step := SAMPLE_W if shiftm else RUN_W
	var px := pl.end.x - 20.0
	if shiftm: px = pl.end.x - 2.0
	var n := pts.size()
	var hp := PackedVector2Array(); var sp := PackedVector2Array(); var tp := PackedVector2Array()
	for i in n:
		var xi := px - (paper - float(i) * step)
		hp.append(Vector2(xi, _y(_num(pts[i].h), r, pl)))
		sp.append(Vector2(xi, _y(_num(pts[i].s), sr, pl)))
		tp.append(Vector2(xi, _y(_num(pts[i].t), r, pl)))
	if n >= 2:
		draw_polyline(hp, Color(EqTheme.PEN_BLUE, 0.85), 2.0, true)
		if not sec.is_empty(): draw_polyline(sp, Color(EqTheme.PEN_RED, 0.85), 2.0, true)
		if not third.is_empty(): draw_polyline(tp, Color(EqTheme.PEN_GREEN, 0.85), 2.0, true)
	if not shiftm:
		for i in n:   # a run = a short pen stroke and a tick mark with the run number
			var xi := hp[i].x
			draw_line(Vector2(xi - 10.0, hp[i].y), Vector2(xi + 10.0, hp[i].y), EqTheme.PEN_BLUE, 3.0)
			if not sec.is_empty(): draw_line(Vector2(xi - 10.0, sp[i].y), Vector2(xi + 10.0, sp[i].y), EqTheme.PEN_RED, 3.0)
			if not third.is_empty(): draw_line(Vector2(xi - 10.0, tp[i].y), Vector2(xi + 10.0, tp[i].y), EqTheme.PEN_GREEN, 3.0)
			draw_line(Vector2(xi, pl.end.y), Vector2(xi, pl.end.y + 6.0), EqTheme.INK, 1.5)
			draw_string(mono, Vector2(xi - 20.0, size.y - 2.0), "%d" % int(pts[i].n), HORIZONTAL_ALIGNMENT_CENTER, 40.0, fsz, EqTheme.INK)
	elif n > 0:
		draw_circle(hp[n - 1], 3.0, EqTheme.PEN_BLUE)
	# gutters over the traces: left axis, right pen readout
	draw_rect(Rect2(0, 0, pl.position.x - 1.0, size.y), EqTheme.PORCELAIN)
	var rx := size.x - 56.0
	draw_rect(Rect2(rx, 0, 56.0, size.y), EqTheme.PORCELAIN)
	draw_line(Vector2(rx, 0), Vector2(rx, size.y), Color("#8C9A94"), 1.0)
	draw_line(Vector2(pl.position.x - 1.0, 0), Vector2(pl.position.x - 1.0, size.y), Color("#8C9A94"), 1.0)
	if _has(hero, "hi"):
		draw_string(mono, Vector2(2, _y(_num(hero.hi), r, pl) - 1.0), _fmt(_num(hero.hi)), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, EqTheme.PEN_BLUE.darkened(0.2))
	if _has(hero, "lo"):
		draw_string(mono, Vector2(2, _y(_num(hero.lo), r, pl) + 13.0), _fmt(_num(hero.lo)), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, EqTheme.PEN_BLUE.darkened(0.2))
	# latest pen values at the right edge
	if n > 0:
		var hy := clampf(hp[n - 1].y + 5.0, 14.0, size.y - 6.0)
		draw_string(mono, Vector2(rx + 4.0, hy), _fmt(_num(pts[n - 1].h)), HORIZONTAL_ALIGNMENT_LEFT, 52.0, fsz, EqTheme.PEN_BLUE)
		if not sec.is_empty():
			var sy := clampf(sp[n - 1].y + 5.0, 14.0, size.y - 6.0)
			if absf(sy - hy) < 14.0: sy = hy + 14.0 if hy + 14.0 <= size.y - 4.0 else hy - 14.0   # two readouts never print over each other
			draw_string(mono, Vector2(rx + 4.0, sy), _fmt(_num(pts[n - 1].s)), HORIZONTAL_ALIGNMENT_LEFT, 52.0, fsz, EqTheme.PEN_RED)
	else:
		draw_string(EqStrings.font("body"), Vector2(pl.position.x + 8.0, pl.position.y + pl.size.y * 0.5 + 5.0), EqStrings.T("REC_EMPTY"), HORIZONTAL_ALIGNMENT_LEFT, pl.size.x - 10.0, fsz, Color("#6B7C76"))
	# pen legends on dymo tape
	var lab := str(hero.get("label", ""))
	_tape(Vector2(pl.position.x + 4.0, pl.position.y + 2.0), lab + ("" if str(hero.get("unit", "")) == "" else " " + str(hero.unit)), EqTheme.PEN_BLUE)
	if not first_run.is_empty():   # a rolling "made so far" counter while the first run plays
		_tape(Vector2(pl.position.x + 4.0, pl.end.y - 21.0), "%s %s kg" % [EqStrings.T("REC_FIRSTRUN"), PaperStrings.num(_num(first_run.get("madeKg", 0.0)))], EqTheme.TEAL)
	draw_rect(Rect2(Vector2.ZERO, size), Color("#4B5B55"), false, 1.0)

func _fmt(v: float) -> String:
	if absf(v) >= 1000.0: return "%.0f" % v
	if absf(v) >= 100.0: return "%.1f" % v
	return "%.2f" % v

func _dash(a: Vector2, b: Vector2, col: Color) -> void:
	var d := (b - a); var l := d.length(); var dir := d / maxf(l, 0.001); var t := 0.0
	while t < l:
		draw_line(a + dir * t, a + dir * minf(t + 6.0, l), col, 1.5); t += 11.0

func _tape(p: Vector2, text: String, accent: Color) -> void:
	var f := EqStrings.font("cap"); var sz := EqTheme.fs(13)
	var w := f.get_string_size(text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x + 12.0
	draw_rect(Rect2(p, Vector2(w, 17.0)), EqTheme.DYMO_TAPE)
	draw_rect(Rect2(p + Vector2(0, 17.0), Vector2(w, 1.0)), Color(1, 1, 1, 0.12))
	draw_rect(Rect2(p, Vector2(3.0, 17.0)), accent.lightened(0.2))
	draw_string(f, p + Vector2(7.0, 13.0), text.to_upper(), HORIZONTAL_ALIGNMENT_LEFT, -1, sz, EqTheme.DYMO_TEXT)
