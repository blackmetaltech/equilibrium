extends SceneTree
## Play-test round 5 fixes (fix9b): temperature knobs step 1 degC per -/+ click, rapid clicks all register, speed dial clicks never lost, the chart recorder opens only on a
## deliberate click on its paper, the notebook tab opens on the first click, the placement refusal names a free tile, L24/L27/L28 text numbers, Trips as an integer.
## Run: godot --headless --path godot --script res://tests/fix9b_flow.gd
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
## A real click through the viewport's input pipeline (hover first, then press, then release), the way a mouse delivers it.
func click_at(p: Vector2, gap := 1) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e)
	await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r)
	await frames(gap)
func centre(c: Control) -> Vector2: return c.get_global_rect().get_center()

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _knobs(); await _dials(); await _recorder(); await _notebook_tab(); await _placement(); await _texts()
	print("FIX9B-FLOW checks=%d" % checks)
	print("FIX9B-FLOW OK" if fails == 0 else "FIX9B-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## The interlock set point and the coolant: -/+ = 1 degC, wheel = 5, Shift on a button = 5; ten rapid clicks are ten steps and one committed value.
func _knobs() -> void:
	await level("L24"); Faceplate.attach(app)
	var ilk := "I-106"; var cstr := "R-103"
	var fp: Faceplate = Faceplate.open(app, ilk); await frames(6)
	var kn: Knob = fp.knobs.get("setpoint")
	check(kn != null and kn.nudge_fine and kn.engine_steps, "the interlock set point knob has 1 degC nudge buttons")
	if kn == null: return
	check(absf(kn.value - 130.0) < 1e-6 and absf(kn.fine - 1.0) < 1e-9 and absf(kn.coarse - 5.0) < 1e-9, "130 degC, steps 5 / 1: %f %f %f" % [kn.value, kn.coarse, kn.fine])
	# real clicks on the - button, as fast as the frames come: five clicks 130 -> 125
	var minus := kn.get_global_rect().position + kn._nudge_rect(-1).get_center()
	for i in 5: await click_at(minus, 0)
	await frames(2)
	check(absf(kn.value - 125.0) < 1e-6, "five rapid - clicks step 130 -> 125 (1 degC each): %f" % kn.value)
	await get_root().get_tree().create_timer(0.5).timeout; await frames(2)
	var c: Dictionary = app.b.q("unitCard", [ilk])
	var sp := 0.0
	for k in c.knobs: if str(k.key) == "setpoint": sp = float(k.disp.value)
	check(absf(sp - 125.0) < 1e-6, "the engine holds 125 after the burst, no click lost: %f" % sp)
	# + 3 clicks fast, then straight on with - 1 before the commit timer fires: still every click counts
	var plus := kn.get_global_rect().position + kn._nudge_rect(1).get_center()
	for i in 3: await click_at(plus, 0)
	await click_at(minus, 0); await frames(2)
	check(absf(kn.value - 127.0) < 1e-6, "+3 then -1 in one burst = 127: %f" % kn.value)
	await get_root().get_tree().create_timer(0.5).timeout; await frames(2)
	for k in app.b.q("unitCard", [ilk]).knobs: if str(k.key) == "setpoint": sp = float(k.disp.value)
	check(absf(sp - 127.0) < 1e-6, "committed once: %f" % sp)
	# Shift on a button = the coarse step
	Input.action_press("ui_accept"); Input.action_release("ui_accept")
	var ev := InputEventMouseButton.new(); ev.button_index = MOUSE_BUTTON_LEFT; ev.pressed = true; ev.position = kn._nudge_rect(1).get_center()
	kn.set_value(120.0); kn._step(1, true, true)
	check(absf(kn.value - 125.0) < 1e-6, "a modifier on the + button = the coarse 5 degC: %f" % kn.value)
	# the wheel is still the coarse step
	kn.set_value(120.0); var w := InputEventMouseButton.new(); w.button_index = MOUSE_BUTTON_WHEEL_UP; w.pressed = true; kn._gui_input(w)
	check(absf(kn.value - 125.0) < 1e-6, "one wheel notch = 5 degC: %f" % kn.value)
	kn._timer.stop()
	Faceplate.close_all(); await frames(2)
	# the coolant knob of the reactor
	var f2: Faceplate = Faceplate.open(app, cstr); await frames(6)
	var kc: Knob = f2.knobs.get("Tc")
	check(kc != null and kc.nudge_fine and absf(kc.fine - 1.0) < 1e-9, "the coolant knob steps 1 degC on - / +")
	if kc != null:
		kc.set_value(25.0)
		var plus2 := kc.get_global_rect().position + kc._nudge_rect(1).get_center()
		for i in 7: await click_at(plus2, 0)
		await frames(2)
		check(absf(kc.value - 32.0) < 1e-6, "seven rapid + clicks on the coolant: 25 -> 32: %f" % kc.value)
	Faceplate.close_all(); await frames(2)

## Pause / 1x / 4x / 16x: every click on a position lands, clicks in consecutive frames included.
func _dials() -> void:
	await level("L24")
	var r1: Dictionary = app.chrome.turn_key(true); await frames(4)
	var r2: Dictionary = {}   # one key turn commissions AND starts a level's shift; a second one would stop it again
	check(app.chrome.engine_phase() == "shift", "the shift runs (phase %s; %s | %s)" % [app.chrome.engine_phase(), str(r1.get("message", r1.get("ok", ""))), str(r2.get("message", r2.get("ok", "")))])
	var sd: KeySwitch.SpeedDial = app.chrome.keys.speed
	var org := sd.get_global_rect().position
	var c := sd._centre()
	var want := [[3, 1.3], [2, 0.45], [1, -0.45], [0, -1.3], [3, 1.3], [1, -0.45], [2, 0.45], [0, -1.3]]
	var all_ok := true
	for w in want:
		var a: float = w[1]; var p := org + c + Vector2(sin(a), -cos(a)) * 40.0
		await click_at(p, 0)
		if app.speed != int(w[0]): all_ok = false; print("  speed after click at angle %.2f: %d (want %d)" % [a, app.speed, int(w[0])])
	check(all_ok, "eight back-to-back clicks on the speed dial each set the speed they point at")
	check(app.chrome.keys.speed_pos == app.speed, "the dial shows the clock speed")
	app.chrome.choose_speed(1); await frames(2)

## The recorder opens on a deliberate click on its paper only.
func _recorder() -> void:
	var rec: ChartRecorder = app.chrome.recorder
	var opened := [0]
	rec.clicked.connect(func(): opened[0] += 1)
	var r := rec.get_global_rect()
	await click_at(r.position + Vector2(3, r.size.y * 0.5))   # the gutter beside the intercom / annunciator
	check(opened[0] == 0, "a click in the recorder's edge gutter does not open it")
	var ic: Rect2 = app.chrome.intercom.get_global_rect()
	check(ic.end.x <= r.position.x + 1.0 or not ic.intersects(r), "the intercom and the recorder do not overlap")
	# press in the edge gutter, release over the recorder paper: no open either
	var m0 := InputEventMouseButton.new(); m0.button_index = MOUSE_BUTTON_LEFT; m0.position = r.position + Vector2(3, r.size.y * 0.5); m0.global_position = m0.position; m0.pressed = true; Input.parse_input_event(m0); await frames(1)
	var m1 := InputEventMouseButton.new(); m1.button_index = MOUSE_BUTTON_LEFT; m1.position = centre(rec); m1.global_position = m1.position; m1.pressed = false; Input.parse_input_event(m1); await frames(2)
	check(opened[0] == 0, "a press that began in the gutter and ends over the paper does not open it")
	await click_at(centre(rec)); await frames(2)
	if opened[0] != 1:
		var hv: Control = root.gui_get_hovered_control() if root.has_method("gui_get_hovered_control") else null
		print("  recorder rect %s hovered %s path %s big=%s" % [str(r), str(hv), str(hv.get_path()) if hv != null else "-", str(rec.big)])
	check(opened[0] == 1, "a click in the middle of the paper opens it: %d" % opened[0])
	var big: Node = app.modal()
	if big != null: big.queue_free()
	await frames(3)

## The notebook tab: one click opens the notebook.
func _notebook_tab() -> void:
	await level("L28"); await frames(8)
	check(app.root.get_node_or_null("notebook") == null, "the notebook is closed")
	var tab := root.find_child("NotebookTab", true, false) as Control
	check(tab != null and tab.visible, "the notebook tab shows (found %s, modal %s)" % [str(tab != null), str(app.modal())])
	if tab == null: return
	await click_at(centre(tab), 3)
	check(app.root.get_node_or_null("notebook") != null, "ONE click on the notebook tab opens the notebook")
	Notebook.close(app); await frames(3)

## A refused placement names a free tile and draws it.
func _placement() -> void:
	await level("L25"); await frames(2)
	var w = app.world
	var occ: Dictionary = w._occupied()
	check(not occ.is_empty(), "L25 has pre-built units")
	var t0: Vector2i = occ.keys()[0]
	var why: String = w.place_problem_hint("heater", t0.x, t0.y, 0)
	check(why.begins_with("Occupied by") and why.contains("column") and why.contains("row"), "the refusal names a free column and row: " + why)
	var f: Vector2i = w.nearest_free("heater", t0.x, t0.y, 0)
	check(f.x >= 0 and w.place_problem("heater", f.x, f.y, 0) == "", "the named tile really is free")
	w.begin_place("heater"); w._cursor = t0; w._update_ghost(); await frames(2)
	check(w._free_foot != null and w._free_foot.visible, "the free tile is drawn on the plot while the ghost sits on a taken one")
	var tag: String = w.ghost_reason()
	check(tag.contains("column"), "the ghost's tag carries the hint: " + tag)
	w.cancel_place(); await frames(2)
	check(w._free_foot == null or not w._free_foot.visible, "cancelling hides the free tile")

func _texts() -> void:
	await level("L24")
	var li: Dictionary = app.b.q("levelInfo")
	var notes := " ".join(PackedStringArray(li.note))
	for frag in ["182 kmol/h", "66 °C", "80 °C", "100 °C", "235 kmol/h", "260.6 kmol/h", "1x", "16x"]:
		check(notes.contains(frag), "the L24 notebook has " + frag)
	check(Printout.metric_text(2.0, "") == "2", "a count metric is an integer, never 2.00: " + Printout.metric_text(2.0, ""))
	check(Printout.metric_text(2.5, "") != "2", "a non-count keeps its decimals")
	await level("L27")
	var l27: Dictionary = app.b.q("levelInfo")
	var gtxt := ""
	for g in l27.goals: gtxt += str(g.text) + " "
	check(gtxt.contains("33.0 bar(g)") and gtxt.contains("gauge"), "the L27 goal states the 110 % on the gauge scale: " + gtxt)
	await level("L28")
	var l28: Dictionary = app.b.q("levelInfo")
	check(JSON.stringify(l28.stars.rules).contains("32.2 GJ"), "the L28 card shows the calibrated best 32.2 GJ/t")
