extends SceneTree
## Round 6 fixes (F12): the shift ETA is never negative and follows the measured plant-seconds per real second; the speed key shows the real rate when the machine lags
## ("4× · 3.1× real"); L24 reactor card says why the flow lags the feed; L24 checklist; the suggested-spot pad goes once the unit is placed (L25); every call line states its tolerance;
## the notebook tab keeps its arrow when the title is long.
## Run: godot --headless --path godot --script res://tests/fix12_flow.gd
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	_eta(); await _l24(); await _pad(); await _tab()
	print("FIX12-FLOW checks=%d" % checks)
	print("FIX12-FLOW OK" if fails == 0 else "FIX12-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## ETA: never negative or absurd; measured rate drives it; the speed key's note shows the real rate only when it lags.
func _eta() -> void:
	var rec := ChartRecorder.new()
	check(ChartRecorder.eta_fmt(-1913.0 * 60.0) == "", "a negative ETA prints nothing")
	check(ChartRecorder.eta_fmt(1.0e12) == "", "an absurd ETA prints nothing")
	rec.shift_clock = {"t": 0.0, "total": 2700.0, "speed": 4.0, "running": true, "ended": false, "etaWallS": -5.0}
	var v = rec.eta_smoothed(0.0)
	check(v != null and float(v) >= 0.0, "a negative engine figure is clamped to 0 (%s)" % str(v))
	# the machine lags: 4x asked, 3 plant seconds per real second delivered
	var out = null
	for i in 8:
		rec.shift_clock = {"t": 3.0 * i, "total": 2700.0, "speed": 4.0, "running": true, "ended": false, "etaWallS": (2700.0 - 3.0 * i) / 4.0}
		out = rec.eta_smoothed(float(i))
	var left := 2700.0 - 21.0
	check(absf(float(out) - left / 3.0) < 5.0, "ETA follows the measured rate: %s vs %.0f" % [str(out), left / 3.0])
	check(absf(rec.measured_rate() - 3.0) < 0.05, "measured rate is 3.0 (%.2f)" % rec.measured_rate())
	check(rec.rate_note() == "4× · running 3×", "the speed key says '4× · running 3×' while it lags ('%s') (0.12: owner rule, no 'real')" % rec.rate_note())
	# on time: no note
	var ok := ChartRecorder.new()
	for i in 8:
		ok.shift_clock = {"t": 4.0 * i, "total": 2700.0, "speed": 4.0, "running": true, "ended": false, "etaWallS": 600.0}
		ok.eta_smoothed(float(i))
	check(ok.rate_note() == "", "no note when the clock keeps up")
	# time going backwards (a new run) never produces a negative figure
	ok.shift_clock = {"t": 0.0, "total": 2700.0, "speed": 4.0, "running": true, "ended": false, "etaWallS": 675.0}
	var back = ok.eta_smoothed(9.0)
	check(back == null or float(back) >= 0.0, "a restarted clock gives no negative ETA")
	rec.free(); ok.free()

## L24: the checklist, the reactor card's lag note, the call line's tolerance.
func _l24() -> void:
	await level("L24")
	var li: Dictionary = app.b.q("levelInfo")
	var bg: Array = li.get("buildGuide", [])
	check(bg.size() >= 8, "L24 has a start-up checklist (%d rows)" % bg.size())
	var ids := bg.map(func(r): return str(r.id))
	for k in ["ilk", "relief", "feed", "warm", "lit", "cooled", "fed"]: check(ids.has(k), "row %s" % k)
	check(str((li.get("callIt", {}) as Dictionary).get("tol", "")).begins_with("within"), "the Call it line states its tolerance: %s" % str((li.get("callIt", {}) as Dictionary).get("tol", "")))
	var notes := " ".join(PackedStringArray((li.note as Array).map(func(s): return str(s))))
	check(notes.length() < 3300, "the L24 notebook prose is short (%d chars)" % notes.length())
	Faceplate.open(app, "R-103"); await frames(4)
	var fp = app.root.find_child("LagNote", true, false)
	check(fp != null and str(fp.text).contains("hold-up"), "the L24 reactor card explains the flow lag inline")
	var sem: Dictionary = app.b.q("semenov", ["R-103"])
	check(float(sem.get("feedKmolH", 0.0)) > 0.0, "the Semenov data names its feed")

## L25: the suggested-spot pad is cleared once a unit stands on it.
func _pad() -> void:
	await level("L25")
	var w = app.world
	var li: Dictionary = app.b.q("levelInfo")
	var first := {}
	for l in li.buildGuide: if str(l.kind) == "place" and l.get("at") is Array: first = l; break
	check(not first.is_empty(), "L25 has a place row with a suggested spot")
	if first.is_empty(): return
	w.suggest_place(str(first.type), Vector2i(int(first.at[0]), int(first.at[1])))
	check(w.suggested().x >= 0, "the pad is shown")
	var r: Dictionary = app.b.act("placeUnit", [str(first.type), int(first.at[0]), int(first.at[1]), 0])
	check(bool(r.get("ok", false)), "the unit is placed on the pad: %s" % str(r.get("message", "")))
	app.game_on_changed(); await frames(6)
	var sp: Vector2i = w.suggested()
	check(sp != Vector2i(int(first.at[0]), int(first.at[1])), "no pad is left on the unit just placed (pad now %s)" % str(sp))
	# the pad of a spot that gets taken some other way is withdrawn by the world itself
	w.suggest_place("cooler", Vector2i(int(first.at[0]), int(first.at[1])) + Vector2i(1, 0)); w._suggest_at = Vector2i(int(first.at[0]), int(first.at[1])); w._suggest_type = str(first.type); w._suggest.visible = true; await frames(3)
	check(w.suggested().x < 0, "a pad on a taken spot is cleared")

## The notebook tab shortens a long title and keeps its arrow.
func _tab() -> void:
	var tab := Notebook.Tab.new(); tab.app = app; root.add_child(tab); await frames(2)
	var s: String = tab.fit_text("NOTEBOOK  26 · ", "A very long job title that will never fit the fixed width of the tab button at all", "  ▸")
	check(s.ends_with("…  ▸"), "a long title is cut with an ellipsis and the arrow stays: '%s'" % s)
	check(tab.fit_text("NOTEBOOK  01 · ", "Short", "  ▸") == "NOTEBOOK  01 · Short  ▸", "a short title is untouched")
	tab.queue_free()
