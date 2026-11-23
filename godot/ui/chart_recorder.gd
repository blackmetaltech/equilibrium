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
var _phase_prev := ""
var _demo := true
var shift_clock := {}       ## levelInfo.shiftClock {t, total, speed, etaWallS, running, ended}: the shift clock and how long it will take at this speed
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
	hero = src.hero; sec = src.sec; third = src.third; runs = src.runs; samples = src.samples; phase = src.phase; _demo = src._demo; first_run = src.first_run; shift_clock = src.shift_clock
	_target = src._target
	if absf(paper - src.paper) > 0.01: paper = src.paper

func _running() -> bool: return phase == "shift" or phase == "firstrun"
## The paper scrolls in plant time during a shift (and after a trip when the level never had a commission: L00's trace stays on the paper).
func _scroll() -> bool: return phase == "shift" or (runs.is_empty() and not samples.is_empty() and phase != "design")

func _num(v) -> float:
	return float(v) if (v is float or v is int) and is_finite(float(v)) else 0.0

static func clock_fmt(sec: float) -> String:
	var s := int(maxf(sec, 0.0)); var h := s / 3600; var m := (s % 3600) / 60
	return "%d:%02d:%02d" % [h, m, s % 60] if h > 0 else "%d:%02d" % [m, s % 60]
static func eta_fmt(w) -> String:
	if w == null: return ""
	if not is_finite(float(w)) or float(w) > 6.0e5: return ""
	var s := int(ceil(float(w)))
	if s <= 0: return ""
	return "%ds" % s if s < 90 else "%d min" % int(ceil(s / 60.0))   # no "~": in the console font it read as a minus ("ETA -48 min", round 7)
## ETA smoothing: plant seconds advanced per wall second averaged over the last ETA_WINDOW_S seconds (the engine's figure is left / nominal speed and wobbles with the frame
## rate). Falls back to the engine's number until the window holds two seconds of history.
const ETA_WINDOW_S := 10.0
var _eta_hist: Array = []     ## [[wall seconds, plant seconds]]
func eta_smoothed(now_s: float = -1.0) -> Variant:
	if now_s < 0.0: now_s = float(Time.get_ticks_msec()) / 1000.0
	var t := float(shift_clock.get("t", 0.0)); var left := maxf(float(shift_clock.get("total", 0.0)) - t, 0.0)
	var raw = shift_clock.get("etaWallS")
	if not bool(shift_clock.get("running", false)) or raw == null: _eta_hist.clear(); return _clamp_eta(raw)
	if not _eta_hist.is_empty() and (t < float(_eta_hist.back()[1]) - 1e-6 or float(shift_clock.get("speed", 1.0)) != _eta_speed): _eta_hist.clear()
	_eta_speed = float(shift_clock.get("speed", 1.0))
	if _eta_hist.is_empty() or t > float(_eta_hist.back()[1]) + 1e-6 or now_s - float(_eta_hist.back()[0]) >= 0.25: _eta_hist.append([now_s, t])
	while _eta_hist.size() > 2 and now_s - float(_eta_hist[0][0]) > ETA_WINDOW_S: _eta_hist.pop_front()
	var rate := measured_rate()
	if rate <= 1e-9: return _clamp_eta(raw)
	return _clamp_eta(left / rate)
var _eta_speed := 1.0
## The ETA is never negative (a stale engine figure, a frame that ran backwards): clamped at zero.
static func _clamp_eta(w) -> Variant:
	if w == null: return null
	var v := float(w)
	return maxf(v, 0.0) if is_finite(v) else null
## Plant seconds the sim really advances per real second, from the ETA window; -1.0 until the window holds two seconds of history. Under load this falls below the speed key.
func measured_rate() -> float:
	if _eta_hist.size() < 2: return -1.0
	var dw := float(_eta_hist.back()[0]) - float(_eta_hist[0][0]); var dt := float(_eta_hist.back()[1]) - float(_eta_hist[0][1])
	if dw < 2.0 or dt <= 1e-9: return -1.0
	return dt / dw
## The speed key's note: the actual rate when the machine cannot keep the chosen speed ("4x · 3.1x real"), else "".
func rate_note() -> String:
	if not bool(shift_clock.get("running", false)): return ""
	var sp := float(shift_clock.get("speed", 1.0)); var r := measured_rate()
	if sp <= 0.0 or r < 0.0 or r >= sp * 0.85: return ""
	return "%s · %s real" % [EqStrings.T("SPEED_%d" % [[0, 1, 4, 16].find(int(sp))]), ("%.1f" % r).trim_suffix(".0") + "×"]
## The shift clock line the recorder prints: plant time of the shift, and the wall time left at the chosen speed.
func clock_text() -> String:
	if shift_clock.is_empty(): return ""
	var t := float(shift_clock.get("t", 0.0)); var tot := float(shift_clock.get("total", 0.0))
	if bool(shift_clock.get("ended", false)): return EqStrings.T("CLK_ENDED") % clock_fmt(tot)
	if not bool(shift_clock.get("running", false)): return EqStrings.T("CLK_IDLE") % clock_fmt(tot)
	var eta := eta_fmt(eta_smoothed())
	return EqStrings.T("CLK_RUN") % [clock_fmt(t), clock_fmt(tot), ("  " + EqStrings.T("CLK_ETA") % eta) if eta != "" else ""]

func _has(d: Dictionary, k: String) -> bool: return d.has(k) and (d[k] is float or d[k] is int) and is_finite(float(d[k]))

## Engine change. `li` is levelInfo (may be {}), `run_list` the engine's runs query.
func feed(li: Dictionary, run_list: Array, tick: int) -> void:
	if li.is_empty(): return
	var id := str(li.get("id", ""))
	if id != level_id:
		level_id = id; runs = []; samples = []; paper = 0.0; _target = 0.0; _sig = ""; _last_tick = -1; _phase_prev = ""
	if li.get("hero") is Dictionary: hero = li.hero; _demo = false
	sec = li.secondary if li.get("secondary") is Dictionary else {}
	third = li.third if li.get("third") is Dictionary else {}
	phase = str(li.get("phase", "design"))
	shift_clock = li.shiftClock if li.get("shiftClock") is Dictionary else {}
	first_run = li.firstRun if li.get("firstRun") is Dictionary and phase == "firstrun" else {}
	var hv := _num(hero.get("value", 0.0)); var sv := _num(sec.get("value", 0.0)); var tv := _num(third.get("value", 0.0))
	if phase == "shift":
		if tick != _last_tick:
			# a fast-forward call advances several ticks at once (F28): the paper still gets one sample per plant second, the in-between ones interpolated
			var d := clampi(tick - _last_tick, 1, 32) if _last_tick >= 0 and tick > _last_tick else 1
			_last_tick = tick
			var prev: Dictionary = samples.back() if not samples.is_empty() else {"h": hv, "s": sv, "t": tv}
			for i in range(1, d + 1):
				var f := float(i) / float(d)
				samples.append({"h": lerpf(_num(prev.h), hv, f), "s": lerpf(_num(prev.s), sv, f), "t": lerpf(_num(prev.t), tv, f)})
			while samples.size() > 900: samples.pop_front()
			_target += SAMPLE_W * float(d)
	elif phase != "design" and phase != "lost":
		# every commission is one point on the paper, kept for the whole level: recorded the moment the plant leaves design (a first run counts too);
		# a game loaded mid-level records its last run once
		var lt := int((run_list.back() as Dictionary).get("tick", 0)) if not run_list.is_empty() else 0
		var sig := "%s|%d|%d" % [str(hero.get("value", "")), lt, run_list.size()]
		var fresh := _phase_prev == "design" or (runs.is_empty() and samples.is_empty()) or (phase == "commissioned" and sig != _sig)
		if fresh and _has(hero, "value") and not bool(hero.get("pending", false)):   # a pending hero (the plant has not been read yet) is no point on the paper
			_sig = sig; record_run(hv, sv, tv)
	_phase_prev = phase
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

## The recorder opens on a deliberate click: pressed AND released on the paper itself (not in the 10 px gutter it shares with the intercom and the annunciator), so a stray
## click or a drag that ends on it from beside the intercom never opens the big chart.
var _press_ok := false
func _on_paper(p: Vector2) -> bool: return Rect2(Vector2(10, 6), size - Vector2(20, 12)).has_point(p)
func _gui_input(e: InputEvent) -> void:
	if big: return
	if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
		if e.pressed: _press_ok = _on_paper(e.position)
		else:
			var go := _press_ok and _on_paper(e.position); _press_ok = false
			if go: clicked.emit()
		accept_event()
	elif e is InputEventScreenTouch:
		if e.pressed: _press_ok = _on_paper(e.position)
		else:
			var go2 := _press_ok and _on_paper(e.position); _press_ok = false
			if go2: clicked.emit()
		accept_event()

# ---- drawing -------------------------------------------------------------------------------------------------------------------------------------
func _plot() -> Rect2:
	var gl := 62.0 if big else 54.0   # wide enough for 130.2 / 1.56M without the left digits being clipped
	return Rect2(gl, 4.0, size.x - gl - 60.0, size.y - 8.0 - 16.0)

## The hero pen's axis: the target band and every plotted value (and the live reading) with a margin, so no trace ever leaves the paper.
func _range() -> Vector2:
	var vmin := INF; var vmax := -INF
	if _has(hero, "lo"): vmin = _num(hero.lo)
	if _has(hero, "hi"): vmax = _num(hero.hi)
	var vals: Array = []
	for p in _pts(): vals.append(_num(p.h))
	if _has(hero, "value"): vals.append(_num(hero.value))
	for v in vals: vmin = minf(vmin, float(v)); vmax = maxf(vmax, float(v))
	if not is_finite(vmin) or not is_finite(vmax): vmin = 0.0; vmax = 1.0
	var span := maxf(maxf(vmax - vmin, absf(vmax) * 0.02), 1e-6)
	var pad := span * 0.14
	var lo := vmin - pad; var hi := vmax + pad
	if vmin >= 0.0 and lo < 0.0: lo = 0.0   # a quantity that cannot go below nothing never shows a negative axis
	return Vector2(lo, hi)

func _srange() -> Vector2:
	var hi := maxf(_num(sec.get("limit", 0.0)) * 1.5, 0.0)
	for p in _pts(): hi = maxf(hi, _num(p.s) * 1.12)
	if _has(sec, "value"): hi = maxf(hi, _num(sec.value) * 1.12)
	return Vector2(0.0, hi if hi > 0.0 else 1.0)

func _pts() -> Array: return samples if _scroll() else runs

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
	var shiftm := _scroll()
	var n := pts.size()
	# runs: every commission of the level is on the paper, spread to fit (never scrolled off); a shift scrolls in plant time
	var step := SAMPLE_W if shiftm else minf(RUN_W, maxf(4.0, (pl.size.x - 24.0) / float(maxi(n - 1, 1))))
	var px := pl.end.x - 2.0 if shiftm else pl.position.x + 12.0
	var hp := PackedVector2Array(); var sp := PackedVector2Array(); var tp := PackedVector2Array()
	for i in n:
		var xi := (px - (paper - float(i) * step)) if shiftm else (px + float(i) * step)
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
			if step >= 18.0 or i == n - 1 or i % 2 == 0: EqTheme.ds(self, mono, Vector2(xi - 20.0, size.y - 2.0), "%d" % int(pts[i].n), HORIZONTAL_ALIGNMENT_CENTER, 40.0, fsz, EqTheme.INK)
	elif n > 0:
		draw_circle(hp[n - 1], 3.0, EqTheme.PEN_BLUE)
	# gutters over the traces: left axis, right pen readout
	draw_rect(Rect2(0, 0, pl.position.x - 1.0, size.y), EqTheme.PORCELAIN)
	var rx := size.x - 56.0
	draw_rect(Rect2(rx, 0, 56.0, size.y), EqTheme.PORCELAIN)
	draw_line(Vector2(rx, 0), Vector2(rx, size.y), Color("#8C9A94"), 1.0)
	draw_line(Vector2(pl.position.x - 1.0, 0), Vector2(pl.position.x - 1.0, size.y), Color("#8C9A94"), 1.0)
	if _has(hero, "hi"):
		EqTheme.ds(self, mono, Vector2(2, _y(_num(hero.hi), r, pl) - 1.0), _fmtax(_num(hero.hi)), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, EqTheme.PEN_BLUE.darkened(0.2))
	if _has(hero, "lo"):
		EqTheme.ds(self, mono, Vector2(2, _y(_num(hero.lo), r, pl) + 13.0), _fmtax(_num(hero.lo)), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, EqTheme.PEN_BLUE.darkened(0.2))
	# the axis ends too: the paper's own top and bottom, so a trace far from the target band still reads against a scale
	var top_v := r.y; var bot_v := r.x
	var hi_y := _y(_num(hero.get("hi", top_v)), r, pl) if _has(hero, "hi") else -99.0; var lo_y := _y(_num(hero.get("lo", bot_v)), r, pl) if _has(hero, "lo") else 999.0
	if absf(hi_y - (pl.position.y + 10.0)) > 14.0 and absf(lo_y - (pl.position.y + 10.0)) > 14.0: EqTheme.ds(self, mono, Vector2(2, pl.position.y + 11.0), _fmtax(top_v), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, Color("#6B7C76"))
	if absf(lo_y - pl.end.y) > 14.0 and absf(hi_y - pl.end.y) > 14.0: EqTheme.ds(self, mono, Vector2(2, pl.end.y - 1.0), _fmtax(bot_v), HORIZONTAL_ALIGNMENT_RIGHT, pl.position.x - 6.0, fsz, Color("#6B7C76"))
	var ct := clock_text()
	var clock_w := 0.0
	if ct != "" and size.x > 150.0:   # the clock line gives up its ETA, then its total, before it would be smaller than 16 px or run off a narrow paper
		var room := rx - pl.position.x - 8.0
		var cf := EqTheme.font("semi")
		for cand in [ct, ct.get_slice("  ", 0), ct.get_slice(" /", 0)]:
			ct = cand
			if cf.get_string_size(ct, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x * 0.9 <= room: break
		var cw := minf(cf.get_string_size(ct, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x + 8.0, rx - pl.position.x - 4.0)
		clock_w = cw + 6.0
		draw_rect(Rect2(rx - cw - 2.0, pl.end.y - 22.0, cw, 21.0), Color(EqTheme.PORCELAIN, 0.92)); EqTheme.ds(self, cf, Vector2(rx - cw + 2.0, pl.end.y - 6.0), ct, HORIZONTAL_ALIGNMENT_LEFT, cw - 4.0, EqTheme.fs(12), EqTheme.PEN_RED.darkened(0.15))
	# latest pen values at the right edge
	if n > 0:
		var hy := clampf(hp[n - 1].y + 5.0, 14.0, size.y - 6.0)
		EqTheme.ds(self, mono, Vector2(rx + 4.0, hy), _fmt(_num(pts[n - 1].h)), HORIZONTAL_ALIGNMENT_LEFT, 52.0, fsz, EqTheme.PEN_BLUE)
		if not sec.is_empty():
			var sy := clampf(sp[n - 1].y + 5.0, 14.0, size.y - 6.0)
			if absf(sy - hy) < 14.0: sy = hy + 14.0 if hy + 14.0 <= size.y - 4.0 else hy - 14.0   # two readouts never print over each other
			EqTheme.ds(self, mono, Vector2(rx + 4.0, sy), _fmt(_num(pts[n - 1].s)), HORIZONTAL_ALIGNMENT_LEFT, 52.0, fsz, EqTheme.PEN_RED)
	# pen legends on dymo tape: each pen's label and unit in its own ink (blue hero, red secondary, green third)
	var avail := pl.size.x - 4.0   # the pen readouts live in the gutter to the right: a legend never runs over them
	var ly := pl.position.y + 2.0
	var tape_max := (pl.end.y - 24.0) if clock_w > 0.0 else 1.0e6
	ly = _tape(Vector2(pl.position.x + 4.0, ly), _legend(hero) + (" —" if bool(hero.get("pending", false)) else ""), EqTheme.PEN_BLUE, avail, tape_max)   # pending: the reading is "—", never a made-up number
	if not sec.is_empty(): ly = _tape(Vector2(pl.position.x + 4.0, ly), _legend(sec) + (" —" if bool(sec.get("pending", false)) else ""), EqTheme.PEN_RED, avail, tape_max)
	if not third.is_empty(): ly = _tape(Vector2(pl.position.x + 4.0, ly), _legend(third), EqTheme.PEN_GREEN, avail, tape_max)
	if n == 0 and clock_w == 0.0 and ly + 18.0 <= pl.end.y and pl.size.x > 80.0:   # no runs yet: the line sits under the pen legends, and only when there is room for it
		EqTheme.ds(self, EqStrings.font("body"), Vector2(pl.position.x + 8.0, ly + 15.0), EqStrings.T("REC_EMPTY"), HORIZONTAL_ALIGNMENT_LEFT, pl.size.x - 10.0, fsz, Color("#6B7C76"))
	if not first_run.is_empty():   # the first run plays: what it made so far (when the level makes product) and how long until the printout (Priya's gate: never a silent wait)
		var left := maxi(0, int(ceil(_num(first_run.get("len", 0.0)) - _num(first_run.get("t", 0.0)))))
		var made := first_run.get("madeKg") != null and _num(first_run.get("madeKg", 0.0)) > 0.0 and runs.size() <= 1
		var txt := "%s %s kg · %d s" % [EqStrings.T("REC_FIRSTRUN").to_upper(), PaperStrings.num(_num(first_run.get("madeKg", 0.0))), left] if made else (EqStrings.T("REC_FIRSTRUN_T") % left).to_upper()
		_tape(Vector2(pl.position.x + 4.0, pl.end.y - 25.0), txt, EqTheme.TEAL, avail - clock_w)
	draw_rect(Rect2(Vector2.ZERO, size), Color("#4B5B55"), false, 1.0)

func _fmtax(v: float) -> String:   # axis labels: compact, never wider than the gutter
	if absf(v) >= 1.0e6: return "%.2fM" % (v / 1.0e6)
	if absf(v) >= 1.0e4: return "%.0fk" % (v / 1.0e3)
	if absf(v) >= 100.0: return "%.0f" % v
	if absf(v) >= 10.0: return "%.1f" % v
	return "%.2f" % v

func _fmt(v: float) -> String:
	# a 52 px label used to clip 1562000 to "156200" (a silent factor of ten): big numbers are written compactly instead
	if absf(v) >= 1.0e6: return "%.2fM" % (v / 1.0e6)
	if absf(v) >= 1.0e4: return "%.0fk" % (v / 1.0e3)
	if absf(v) >= 1000.0: return "%.0f" % v
	if absf(v) >= 100.0: return "%.1f" % v
	return "%.2f" % v

func _dash(a: Vector2, b: Vector2, col: Color) -> void:
	var d := (b - a); var l := d.length(); var dir := d / maxf(l, 0.001); var t := 0.0
	while t < l:
		draw_line(a + dir * t, a + dir * minf(t + 6.0, l), col, 1.5); t += 11.0

func _legend(d: Dictionary) -> String:
	var u := str(d.get("unit", ""))
	var lab := str(d.get("label", "")) if big else str(d.get("legend", d.get("label", "")))   # F33: the level's short pen legend ("NH₃", "COMP"); the long label is the full recorder's title
	if u == "" or lab.ends_with(" " + u) or lab.ends_with(", " + u) or lab.ends_with("(" + u + ")") or lab.ends_with("[" + u + "]"): return lab.to_upper()   # the label already says its unit
	return lab.to_upper() + " " + u   # the unit keeps its case (m³/h, not M³/H)

## One strip of Dymo tape no wider than `avail` px; returns the y for the next strip below it. F33: a legend is never cut with an ellipsis: one that does not fit on one line
## goes on two (split at the space nearest its middle), and only then is it squeezed (EqTheme.ds, at most to 78 %).
func _tape(p: Vector2, text: String, accent: Color, avail := 1.0e6, max_y := 1.0e6) -> float:
	var f := EqStrings.font("cap"); var sz := EqTheme.fs(13)
	var lines := [text]
	var tw := func(t: String) -> float: return f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x + 12.0
	if tw.call(lines[0]) > avail and lines[0].contains(" ") and p.y + 39.0 <= max_y:   # two lines only where they clear the shift clock below
		var t0: String = lines[0]; var mid := t0.length() / 2; var best := -1
		for i in t0.length():
			if t0[i] == " " and (best < 0 or absi(i - mid) < absi(best - mid)): best = i
		lines = [t0.left(best), t0.substr(best + 1)]
	var w := 0.0
	for ln in lines: w = maxf(w, tw.call(ln))
	w = minf(w, avail)
	var h := 21.0 + 18.0 * float(lines.size() - 1)
	draw_rect(Rect2(p, Vector2(w, h)), EqTheme.DYMO_TAPE)
	draw_rect(Rect2(p + Vector2(0, h), Vector2(w, 1.0)), Color(1, 1, 1, 0.12))
	draw_rect(Rect2(p, Vector2(3.0, h)), accent.lightened(0.2))
	for i in lines.size(): EqTheme.ds(self, f, p + Vector2(7.0, 16.0 + 18.0 * i), lines[i], HORIZONTAL_ALIGNMENT_LEFT, w - 9.0, sz, EqTheme.DYMO_TEXT)
	return p.y + h + 2.0
