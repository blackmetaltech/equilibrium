extends SceneTree
## Fix batch F6b (Godot gate fixes): relative vertical knob drag, linear wheel, nudge buttons, keypad Enter always answers, one-click key, uniform dial lock,
## dials survive stop/edit, "Keep improving", predict-first confirm.  Run: godot --headless --path godot --script res://tests/fix6_flow.gd
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
func mm(kn: Knob, y: float) -> void:
	var e := InputEventMouseMotion.new(); e.position = Vector2(48, y); kn._gui_input(e)
func mb(kn: Knob, pos: Vector2, pressed: bool, btn := MOUSE_BUTTON_LEFT) -> void:
	var e := InputEventMouseButton.new(); e.button_index = btn; e.pressed = pressed; e.position = pos; kn._gui_input(e)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	await _knob(); await _levels(); await _l00()
	print("FIX6-FLOW checks=%d" % checks)
	print("FIX6-FLOW OK" if fails == 0 else "FIX6-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _knob() -> void:
	var kn := Knob.new(); kn.app = app; root.add_child(kn); kn.size = Vector2(112, 132)
	kn.setup("T", "C", 0.0, 100.0, 1.0, 0.1, 50.0)
	# relative drag: only the vertical travel counts; the pointer sweeping sideways does nothing
	mb(kn, kn._center() + Vector2(20, 0), true); mm(kn, kn._center().y - 22.0)
	check(absf(kn.value - 53.0) < 0.6, "22 px up is three 1-unit steps: %f" % kn.value)
	var v1 := kn.value
	var e := InputEventMouseMotion.new(); e.position = kn._center() + Vector2(-30, -22.0); kn._gui_input(e)
	check(absf(kn.value - v1) < 1e-6, "moving sideways at the same height changes nothing")
	mb(kn, Vector2.ZERO, false); await frames(1)
	# nudge buttons
	var before := kn.value
	mb(kn, kn._nudge_rect(1).get_center(), true); mb(kn, kn._nudge_rect(1).get_center(), false)
	check(absf(kn.value - (before + 1.0)) < 1e-6, "+ nudges one step: %f" % kn.value)
	mb(kn, kn._nudge_rect(-1).get_center(), true); mb(kn, kn._nudge_rect(-1).get_center(), false)
	check(absf(kn.value - before) < 1e-6, "- nudges one step back")
	# linear wheel on a relative knob: the notch does not grow while the value climbs
	kn.relative = true; kn.setup("P", "bar", 0.01, 1000.0, 1.0, 0.1, 10.0); kn.relative = true
	var steps: Array = []
	for i in 6:
		var p := kn.value; mb(kn, Vector2(48, 30), true, MOUSE_BUTTON_WHEEL_UP); steps.append(kn.value - p)
	check(absf(steps[5] - steps[0]) < 1e-6 * maxf(1.0, steps[0]), "wheel steps are linear within a burst: %s" % str(steps))
	kn.queue_free()
	# keypad Enter always answers
	var d: Dictionary = Knob.keypad(app, "P", "bar", "5", 1.0, 100.0, func(_v: float): pass); await frames(2)
	var host: Control = d.host
	var kc: Knob.KeyCatcher = host.find_child("*", true, false) as Knob.KeyCatcher
	for c in host.get_children(): if c is Knob.KeyCatcher: kc = c
	var enter := InputEventKey.new(); enter.keycode = KEY_ENTER; enter.pressed = true
	var five := InputEventKey.new(); five.keycode = KEY_5; five.unicode = 53; five.pressed = true
	var zero := InputEventKey.new(); zero.keycode = KEY_0; zero.unicode = 48; zero.pressed = true
	kc.on_key.call(zero); kc.on_key.call(zero)   # "00" -> 0, out of range
	kc.on_key.call(enter); await frames(1)
	var rs: Label = host.find_child("Reason", true, false)
	check(is_instance_valid(host) and rs != null and rs.visible and rs.text != "", "Enter on a rejected value shows the reason")
	var clr := InputEventKey.new(); clr.keycode = KEY_BACKSPACE; clr.pressed = true
	kc.on_key.call(clr); kc.on_key.call(clr); kc.on_key.call(enter); await frames(1)
	check(rs.visible and rs.text != "", "Enter on an empty field says so")
	kc.on_key.call(five); kc.on_key.call(enter); await frames(2)
	check(not is_instance_valid(host) or host.is_queued_for_deletion(), "Enter on a good value accepts")

func _levels() -> void:
	await level("L30")
	app.lvbay.refresh(true); await frames(2)
	var p: ControlPanel = app.lvbay.panel
	var kn: Knob = p.knobs.kc
	kn.set_value(2.5); kn.committed.emit(2.5); await frames(2)
	# one click on DESIGN from any state
	app.chrome.turn_key(true); await frames(3)
	app.chrome.goto_pos(0); await frames(6)
	check(app.chrome.engine_phase() == "design", "goto DESIGN is one step")
	app.lvbay.refresh(true); await frames(2)
	p = app.lvbay.panel
	var now := 0.0
	for x in p.view.dials: if x.key == "kc": now = float(x.value)
	check(absf(now - 2.5) < 1e-6, "the dial survives stop/edit: %f" % now)
	# uniform lock while a run shows
	app.chrome.turn_key(true); await frames(3); app.lvbay.refresh(true); await frames(2)
	p = app.lvbay.panel
	var locked := true
	for k in p.knobs: if p.knobs[k].editable: locked = false
	if app.chrome.engine_phase() == "shift" or app.chrome.engine_phase() == "firstrun": check(locked, "every dial is locked while a run shows")
	app.chrome.goto_pos(0); await frames(6); app.lvbay.refresh(true); await frames(2)
	p = app.lvbay.panel
	var open := true
	for k in p.knobs: if not p.knobs[k].editable: open = false
	check(open, "dials unlock in design")
	# predict first: a call-it level with an empty answer asks
	await level("L06")
	app.chrome.turn_key(); await frames(3)
	check(app.root.find_child("PredictNow", true, false) != null or app.chrome._call_it_empty() == false, "an empty call-it asks before the first commission")

func _l00() -> void:
	root.size = Vector2i(1920, 1080); await frames(4)
	await level("L00"); Faceplate.attach(app)
	var pl = app.b.q("plant"); var cid := ""
	for u in pl.units: if str(u.type) == "cooler": cid = str(u.id)
	check(cid != "", "L00 has a cooler")
	if cid == "": return
	var fp: Faceplate = Faceplate.open(app, cid); await frames(6)
	var kn: Knob = null
	for k in fp.knobs: if fp.knobs[k] is Knob and str(k) == "T": kn = fp.knobs[k]
	if kn == null:
		for k in fp.knobs: if fp.knobs[k] is Knob: kn = fp.knobs[k]
	check(kn != null, "the cooler plate has a knob")
	if kn == null: return
	kn.size = Vector2(112, 132)
	var v0 := kn.value
	mb(kn, kn._center(), true); mm(kn, kn._center().y - 26.0); mb(kn, kn._center(), false)
	check(absf(kn.value - v0) < 0.15 * maxf(kn.hi - kn.lo, 1.0) and absf(kn.value - v0) > 0.0, "26 px moves the cooler dial a few steps, not across the scale: %f -> %f" % [v0, kn.value])
	var v1 := kn.value
	mb(kn, Vector2(48, 30), true, MOUSE_BUTTON_WHEEL_UP)
	check(kn.value > v1, "the wheel moves the cooler dial")
	# two plates open stay where they docked
	var fid := ""
	for u in pl.units: if str(u.type) == "feed": fid = str(u.id)
	if fid != "":
		var fp2: Faceplate = Faceplate.open(app, fid); await frames(6)
		var p1 := fp.position; var p2 := fp2.position
		await frames(20)
		check(fp.position.is_equal_approx(p1) and fp2.position.is_equal_approx(p2), "open plates do not move between clicks")
		check(not Rect2(fp.position, fp.size).intersects(Rect2(fp2.position, fp2.size)), "the two plates do not overlap %s %s %s %s" % [fp.position, fp.size, fp2.position, fp2.size])
