extends SceneTree
## F28 profile: L08's shift at 16x through the real _process loop. Env PROF_SECS (wall seconds to run, default 20), PROF_SPEED (1..3, default 3).
var app: CbApp
func frames(n := 3) -> void:
	for i in n: await process_frame
func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	app.start_level("L08", true); await frames(6); Notebook.close(app); await frames(3)
	var acts := [["placeUnit", ["hx", 6, 2, 0]], ["placeUnit", ["heater", 12, 2, 0]], ["placeUnit", ["stack", 12, 8, 0]], ["placeUnit", ["product", 18, 2, 0]],
		["setParam", ["E-103", "area", 990.0]], ["connect", ["F-102", "out", "E-103", "hot_in"]], ["connect", ["F-101", "out", "E-103", "cold_in"]],
		["connect", ["E-103", "hot_out", "Z-105", "in"]], ["connect", ["E-103", "cold_out", "H-104", "in"]], ["connect", ["H-104", "out", "T-106", "in"]]]
	for a in acts:
		var r := app.b.act(a[0], a[1])
		if not r.get("ok", false): print("ACT FAIL ", a, r)
	app.game_on_changed(); await frames(3)
	print(app.b.act("commission")); print(app.b.act("startShift", ["shift"])); app.game_on_changed(); await frames(6)
	var sp := int(OS.get_environment("PROF_SPEED")) if OS.has_environment("PROF_SPEED") else 3
	app.set_speed(sp); app.chrome.keys.set_speed_pos(sp); await frames(2)
	print("phase=", app.chrome.engine_phase(), " speed=", app.speed, " tick0=", app.b.g.get("tick"))
	if OS.get_environment("PROF_MODE") == "parts":
		var n := 40
		var t := Time.get_ticks_usec()
		for i in n: app.b.act("tick", [1])
		print("PARTS act(tick,1) alone: %.1f ms each (g size %d bytes json)" % [(Time.get_ticks_usec() - t) / 1000.0 / n, JSON.stringify(app.b.g).length()])
		t = Time.get_ticks_usec()
		for i in n: app.game_on_changed()
		print("PARTS game_on_changed (queries cached after 1st) %.1f ms each" % [(Time.get_ticks_usec() - t) / 1000.0 / n])
		t = Time.get_ticks_usec()
		for i in n:
			app.b.act("tick", [1]); app.game_on_changed()
		print("PARTS act+on_changed %.1f ms each, reqs/iter %.1f" % [(Time.get_ticks_usec() - t) / 1000.0 / n, 0.0])
		var r0 := CbBridge.req_n
		app.b.act("tick", [1]); app.game_on_changed(); print("PARTS reqs per tick: ", CbBridge.req_n - r0)
		app.set_speed(0); await frames(3)
		t = Time.get_ticks_usec(); var m := 30
		for i in m: await process_frame
		print("PARTS idle frame (paused shift) %.1f ms each" % [(Time.get_ticks_usec() - t) / 1000.0 / m])
		root.disable_3d = true
		t = Time.get_ticks_usec()
		for i in m: await process_frame
		print("PARTS idle frame, 3D disabled %.1f ms each" % [(Time.get_ticks_usec() - t) / 1000.0 / m])
		root.disable_3d = false; app.chrome.visible = false
		t = Time.get_ticks_usec()
		for i in m: await process_frame
		print("PARTS idle frame, chrome hidden %.1f ms each" % [(Time.get_ticks_usec() - t) / 1000.0 / m])
		app.b.stop(); quit(0); return
	var secs := float(OS.get_environment("PROF_SECS")) if OS.has_environment("PROF_SECS") else 20.0
	var t0 := Time.get_ticks_msec(); var k0 := int(app.b.g.get("tick", 0)); var fr := 0
	var req0 := CbBridge.req_n
	var tp := 0.0; var tpn := 0
	while float(Time.get_ticks_msec() - t0) < secs * 1000.0 and str(app.b.g.get("status", "playing")) == "playing":
		var kk := int(app.b.g.get("tick", 0)); var tt := Time.get_ticks_usec()
		await process_frame; fr += 1
		if fr < 25 and OS.has_environment("PROF_TRACE"): print("frame dt=%.0fms ticks+%d owed=%.2f speed=%d modal=%s" % [(Time.get_ticks_usec() - tt) / 1000.0, int(app.b.g.get("tick", 0)) - kk, app._owed, app.speed, str(app.modal())])
		tp += Performance.get_monitor(Performance.TIME_PROCESS); tpn += 1
	var wall := float(Time.get_ticks_msec() - t0) / 1000.0
	var dk := int(app.b.g.get("tick", 0)) - k0
	print("PROF wall=%.1fs frames=%d (%.1f fps) ticks=%d (%.2f ticks/s) reqs=%d draw_calls=%d objs=%d nodes=%d TIME_PROCESS_avg=%.1fms" % [wall, fr, fr / wall, dk, dk / wall, CbBridge.req_n - req0,
		int(Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME)), int(Performance.get_monitor(Performance.OBJECT_COUNT)), int(Performance.get_monitor(Performance.OBJECT_NODE_COUNT)), tp / maxf(tpn, 1) * 1000.0])
	print("status=", app.b.g.get("status"), " tick=", app.b.g.get("tick"))
	if app.b != null: app.b.stop()
	quit(0)
