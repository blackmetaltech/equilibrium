extends SceneTree
## F21 (round 8, feedback truth): the intercom follows the plant (no coach line for a step that is done, bound lines leave with their state, a log line gives the floor
## back to the current instruction), L03's late call is not asked for first, "no call" on the slip, the run number counts on across a Retry, goal units, the L09 notebook
## fits 1080p, WASD pans with a slider focused, a drag released on empty ground says so.
## Run: godot --headless --path godot --script res://tests/fix21_flow.gd     Prints FIX21-FLOW OK / FIX21-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func clear_modals() -> void:
	for n in app.root.get_children(): if n.has_meta("cb_modal"): n.queue_free()
	app.end_ui = null; await frames(3)
func level(id: String) -> void:
	await clear_modals()
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); await frames(2); return r
func li() -> Dictionary: return app.b.q("levelInfo")
func ic() -> Intercom: return app.chrome.intercom
func last_line() -> String: return str(ic().last().get("text", ""))
## The truth rule: if the newest intercom line is a coach line of this level, it is the step the engine is on right now (never one already done).
func coach_true(tag: String) -> void:
	var l := ic().last(); var info := li()
	if l.is_empty() or str(l.get("kind", "")) != "coach" or not str(l.get("step", "")).begins_with(str(info.id) + ":"): return
	var c = info.get("coach")
	check(c is Dictionary and str(l.step) == "%s:%s" % [info.id, str(c.step)], "%s: the coach line on top is the current step (%s vs %s)" % [tag, str(l.step), str(c.step) if c is Dictionary else "none"])
func key(code: int, pressed: bool) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.pressed = pressed; Input.parse_input_event(e)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	await _walk_l01()
	await _walk_l03()
	await _walk_l04()
	await _bound_and_transient()
	await _misc()
	await _l09_notebook()
	await _camera_and_drag()
	print("FIX21-FLOW checks=%d" % checks)
	print("FIX21-FLOW OK" if fails == 0 else "FIX21-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _walk_l01() -> void:
	await level("L01")
	var acts := [["placeUnit", ["feed", 0, 0, 0]], ["placeUnit", ["feed", 0, 4, 0]], ["placeUnit", ["mixer", 4, 2, 0]], ["placeUnit", ["stoich_reactor", 8, 0, 0]], ["placeUnit", ["nh3_sep", 14, 0, 0]],
		["placeUnit", ["product", 18, 0, 0]], ["placeUnit", ["vent", 18, 4, 0]], ["setBank", ["F-101", "N2", 140.0]], ["setBank", ["F-102", "H2", 30.0]],
		["connect", ["F-101", "out", "M-103", "in1"]], ["connect", ["F-102", "out", "M-103", "in2"]], ["connect", ["M-103", "out", "R-104", "in"]], ["connect", ["R-104", "out", "D-105", "in"]],
		["connect", ["D-105", "liq", "T-106", "in"]], ["connect", ["D-105", "vap", "Y-107", "in"]], ["commission", []]]
	for a in acts:
		await act(a[0], a[1]); coach_true("L01 after %s" % a[0])
	await frames(3); coach_true("L01 after the commission")
	check(not last_line().begins_with("First run: the plant is making product") or str(li().phase) == "firstrun", "L01: the first-run line is only up while the first run rolls (%s)" % last_line())

func _walk_l03() -> void:
	await level("L03")
	check(not app.chrome._call_it_empty(), "L03: a late call never holds the first commission (no 'predict first' popup)")
	await act("carryBurns", [2]); await frames(2); app.chrome.refresh(); await frames(2)
	var c = li().get("coach")
	check(not (c is Dictionary and str(c.text).contains("test burn")), "L03: no test-burn line after two burns")
	coach_true("L03")

func _walk_l04() -> void:
	await level("L04")
	check(app.chrome._call_it_empty(), "L04: the call is asked for before the first commission")
	coach_true("L04 start")
	await act("callIt", [30.0, "N2"]); await frames(2); coach_true("L04 after the call")
	check(not last_line().contains("printout"), "L04: 'read the printout' is not said right after the call (%s)" % last_line())
	check(last_line().to_lower().contains("build the bench"), "L04: building the bench is the next step (the key comes once it is piped) (%s)" % last_line())
	for a in [["placeUnit", ["feed", 0, 0, 0]], ["placeUnit", ["feed", 0, 4, 0]], ["placeUnit", ["mixer", 4, 2, 0]], ["placeUnit", ["stoich_reactor", 8, 0, 0]], ["placeUnit", ["nh3_sep", 14, 0, 0]], ["placeUnit", ["product", 18, 0, 0]], ["placeUnit", ["vent", 18, 4, 0]],
		["setBank", ["F-101", "N2", 140.0]], ["setBank", ["F-102", "H2", 30.0]], ["connect", ["F-101", "out", "M-103", "in1"]], ["connect", ["F-102", "out", "M-103", "in2"]], ["connect", ["M-103", "out", "R-104", "in"]],
		["connect", ["R-104", "out", "D-105", "in"]], ["connect", ["D-105", "liq", "T-106", "in"]], ["connect", ["D-105", "vap", "Y-107", "in"]], ["commission", []]]:
		await act(a[0], a[1]); coach_true("L04 after %s" % a[0])
	await frames(4); app.chrome.refresh(); await frames(2); coach_true("L04 after the run")
	if str(li().phase) == "won": check(str(ic().last().get("kind", "")) != "coach", "L04: no coach line is left on top of a won level (%s)" % last_line())

func _bound_and_transient() -> void:
	await level("L01")
	app.chrome._say_bound("MARA", "First run: the plant is making product. Watch the recorder.", "firstrun")
	check(last_line().begins_with("First run"), "a bound line is said")
	app.chrome.refresh(); await frames(2)
	check(not last_line().begins_with("First run"), "a first-run line is withdrawn when no first run is rolling (%s)" % last_line())
	# a log line gives the floor back to the current coach step
	app.chrome._coach_id = "<unset>"; app.chrome.refresh(); await frames(2)
	var coach_text := str(li().coach.text)
	app.toast("Piped F-101 to M-103", "good"); await frames(2)
	check(last_line().begins_with("Piped"), "the log line shows")
	app.chrome.settle_intercom(); await frames(2)
	check(last_line() == coach_text, "after the log line the intercom shows the current instruction (%s)" % last_line())

func _misc() -> void:
	check(PaperStrings.t("PR_NOCALL") == "no call", "the slip says 'no call' for a call never made")
	await level("L00")
	check(str(li().goals[0].get("unit", "")) == "s", "L00's goal carries its unit")
	await level("L04")
	BuildKeeper.run_prior.erase("L04")
	var o := BuildKeeper.restart(app, true); await frames(3)
	check(int(BuildKeeper.run_prior.get("L04", -1)) >= 0, "a restart records the runs already printed (run counter counts on)")
	await level("L09")
	await act("callIt", [885.3, "du_ch4"])
	var g: Dictionary = {}
	for x in li().goals: if str(x.key) == "du": g = x
	check(str(g.get("text", "")).contains("after the run") and not str(g.get("text", "")).contains(": - "), "L09: the goal says the target comes after the run (%s)" % str(g.get("text", "")))

func _l09_notebook() -> void:
	await clear_modals()
	app.start_level("L09", true); await frames(8)
	Notebook.open(app); await frames(6)
	var nb = app.root.get_node_or_null("notebook")
	check(nb != null, "the L09 notebook is open")
	if nb == null: return
	await frames(10)
	var vr := root.get_visible_rect()
	var st := (nb as Node).find_child("Start", true, false) as Control
	# under load the notebook can still be sliding in after 10 frames (the suite saw the key at y 1032 mid-slide); wait, at most 240 frames,
	# until the key has held still for 5 frames, then judge it where it rests. The assertion is unchanged.
	if st != null:
		var last := st.get_global_rect(); var still := 0; var n := 0
		while still < 5 and n < 240:
			await frames(1); n += 1
			var now := st.get_global_rect(); still = still + 1 if now.is_equal_approx(last) else 0; last = now
	var tt := (nb as Node).find_child("Title", true, false) as Control
	check(st != null and st.get_global_rect().end.y <= vr.size.y + 1.0 and st.is_visible_in_tree(), "the Start key is on screen at 1080p (%s)" % str(st.get_global_rect() if st != null else "none"))
	check(tt != null and tt.get_global_rect().position.y >= -1.0, "the title is on screen (%s)" % str(tt.get_global_rect() if tt != null else "none"))
	check((nb as Node).find_child("CallScroll", true, false) != null, "the call list scrolls inside the page")
	var notes := (nb as Node).find_children("CallNote", "Label", true, false)
	var h0 := (nb as Control).size.y
	check(notes.size() >= 4 and (notes[0] as Label).is_visible_in_tree(), "every call row reserves its note line")
	Notebook.close(app); await frames(3)

func _camera_and_drag() -> void:
	await level("L09")
	var w = app.world; var cam = w.cam_rig
	# a slider that kept focus does not freeze WASD
	var sl := HSlider.new(); app.root.add_child(sl); sl.grab_focus(); await frames(2)
	var p0: Vector3 = cam.pan_target()
	key(KEY_D, true); await frames(20); key(KEY_D, false); await frames(2)
	check(cam.pan_target().distance_to(p0) > 0.05, "WASD pans with a slider holding focus (%s -> %s)" % [str(p0), str(cam.pan_target())])
	sl.queue_free(); await frames(2)
	# a drag from an outlet pip released on empty ground says so
	await level("L01")
	var f: String = (await act("placeUnit", ["feed", 2, 2, 0])).get("id", "")
	await act("placeUnit", ["mixer", 10, 4, 0])
	w.set_camera("mid"); await frames(4)
	var hub = app.root.get_node("PaperHub")
	w.select(f); hub._refresh_ports(); await frames(2)
	var p: Vector2 = w.port_screen(f, "out", false)
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var d := InputEventMouseButton.new(); d.button_index = MOUSE_BUTTON_LEFT; d.position = p; d.global_position = p; d.pressed = true; d.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(d); await frames(2)
	var q: Vector2 = w.world_to_screen(w.tile_to_world(Vector2i(22, 14), Vector2i(1, 1)))
	var mv := InputEventMouseMotion.new(); mv.position = q; mv.global_position = q; mv.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(mv); await frames(1)
	w.last_pipe_msg = ""
	var u := InputEventMouseButton.new(); u.button_index = MOUSE_BUTTON_LEFT; u.position = q; u.global_position = q; u.pressed = false; Input.parse_input_event(u); await frames(3)
	check(w.last_pipe_msg.begins_with("Dropped on nothing"), "a drag released on empty ground says 'Dropped on nothing' (%s)" % w.last_pipe_msg)
