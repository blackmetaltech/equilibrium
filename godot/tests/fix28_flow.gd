extends SceneTree
## F28 (0.8 perf): fast-forward is bounded by the wall clock, not by the frame rate. L08's 30-plant-minute shift at 16x must take about two real minutes even when frames are slow
## (Godot clamps the dt it hands to _process, and the shell used to run one tick per bridge call, eight at most per frame). Checks: a batched run (ticks(k), one engine call each) ends in
## exactly the state of N single ticks; it is faster; and the real _process loop at 16x delivers ticks at the wall-clock rate even when a frame is stalled.
## Run: godot --headless --path godot --script res://tests/fix28_flow.gd
const N := 400   ## absolute tick both runs stop at
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
const BUILD := [["placeUnit", ["hx", 6, 2, 0]], ["placeUnit", ["heater", 12, 2, 0]], ["placeUnit", ["stack", 12, 8, 0]], ["placeUnit", ["product", 18, 2, 0]],
	["setParam", ["E-103", "area", 990.0]], ["connect", ["F-102", "out", "E-103", "hot_in"]], ["connect", ["F-101", "out", "E-103", "cold_in"]],
	["connect", ["E-103", "hot_out", "Z-105", "in"]], ["connect", ["E-103", "cold_out", "H-104", "in"]], ["connect", ["H-104", "out", "T-106", "in"]], ["commission", []], ["startShift", ["shift"]]]
func shift() -> bool:
	app.pinned_seed = 1003
	app.start_level("L08", true); await frames(6); Notebook.close(app); await frames(3)
	for a in BUILD:
		var r: Dictionary = app.b.act(a[0], a[1])
		if not r.get("ok", false): print("build step failed: ", a, r); return false
	app.set_speed(0); app.chrome.keys.set_speed_pos(0)   # the shift opens at its recommended speed: park the clock, the test steps by hand to an absolute tick
	app.game_on_changed(); await frames(3)   # 0.12: parked BEFORE the frames (under load a stalled frame let the 16x clock run ticks through _process first: 1 failure in 6)
	return true
func snap() -> String: return JSON.stringify(app.b.g)
func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	# 1. N single ticks
	check(await shift(), "L08 shift starts")
	app.quiet = true
	var t0 := Time.get_ticks_msec()
	while int(app.b.g.get("tick", 0)) < N: app.b.act("tick", [1])
	var ms_single := Time.get_ticks_msec() - t0
	var a := snap(); var tick_a := int(app.b.g.get("tick", 0))
	# 2. the same N plant seconds through the shell's batched call (32 a call)
	check(await shift(), "L08 shift restarts")
	app.quiet = true
	t0 = Time.get_ticks_msec()
	while int(app.b.g.get("tick", 0)) < N:
		app.ticks(mini(app.FF_MAX, N - int(app.b.g.get("tick", 0))))
	var ms_batch := Time.get_ticks_msec() - t0
	var b := snap()
	check(int(app.b.g.get("tick", 0)) == tick_a, "same tick count (%d)" % tick_a)
	check(a == b, "a batched fast-forward ends in exactly the state of unbatched ticks")
	check(ms_batch < 20000, "to tick %d batched in %d ms (generous bound 20 s; unbatched %d ms)" % [N, ms_batch, ms_single])
	check(ms_batch <= ms_single * 1.5 + 200, "batching is not slower than single ticks (%d vs %d ms)" % [ms_batch, ms_single])
	print("FIX28 single=%d ms batched=%d ms to tick %d" % [ms_single, ms_batch, N])
	# 3. the real loop: speed 16x, one frame stalled for 1.5 s (a software-rendered frame); the ticks owed come from the wall clock, not from the clamped dt
	check(await shift(), "L08 shift restarts for the loop")
	app.set_speed(3); app.chrome.keys.set_speed_pos(3); await frames(2)
	var k0 := int(app.b.g.get("tick", 0)); var w0 := Time.get_ticks_msec()
	OS.delay_msec(1500); await process_frame
	while Time.get_ticks_msec() - w0 < 4000: await process_frame
	var wall := float(Time.get_ticks_msec() - w0) / 1000.0
	var rate := float(int(app.b.g.get("tick", 0)) - k0) / wall
	check(rate >= 16.0 * 0.8, "16x delivers %.1f plant s per wall s across a stalled frame (>= 12.8)" % rate)
	print("FIX28-FLOW checks=%d" % checks)
	print("FIX28-FLOW OK" if fails == 0 else "FIX28-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	await frames(2)
	quit(0 if fails == 0 else 1)
