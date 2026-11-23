extends SceneTree
## Phase B pad flow: the new-look controls work from a controller alone. L14: the pad cursor picks the T and V wheels, turns them, pulls RUN, opens the argon
## valve and the clamp, and opens the keypad for the Call box; LB/RB step the camera. L10 (gen mode): R3 shows the hall, X in the hall returns to the drafting table (D-C5). L00: up/down turns
## the cooler handwheel and the engine set point follows. Prints PAD3-FLOW OK / PAD3-FLOW FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func btn(b: int) -> void:
	var e := InputEventJoypadButton.new(); e.button_index = b; e.pressed = true
	Input.parse_input_event(e); await frames(2)
	var u := InputEventJoypadButton.new(); u.button_index = b; u.pressed = false
	Input.parse_input_event(u); await frames(2)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", "")
	CbPad.enabled = true
	check(Input.get_connected_joypads().is_empty(), "no machine joypad reaches this test (another session's virtual pad would press buttons here; run via scripts/flows.sh, which sets the SDL ignore list): %s" % str(Input.get_connected_joypads().map(func(d): return Input.get_joy_name(d))))
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	await _run()
	print("PAD3-FLOW checks=%d" % checks)
	print("PAD3-FLOW OK" if fails == 0 else "PAD3-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _param(type: String, k: String) -> float:
	for u in app.b.q("plant").units: if str(u.type) == type: return float(u.params[k])
	return -1.0

func _run() -> void:
	# --- L00: the handwheel
	app.start_level("L00", true); await frames(8)
	var hud = app.look2.hud
	if hud._brief != null and hud._brief.shown: (hud._brief.content.get_node("Begin") as Button).pressed.emit(); await frames(3)
	var t0 := _param("cooler", "T")
	await btn(JOY_BUTTON_DPAD_DOWN); await btn(JOY_BUTTON_DPAD_DOWN); await get_tree_timer(0.4)
	app.b.act("tick", [10]); await frames(3)   # the set point ramps (the cooler moves 13.5 K/s)
	check(absf(_param("cooler", "T") - (t0 - 20.0)) < 0.6, "L00: D-pad down twice turns the cooler handwheel 20 K (%s -> %s)" % [t0, _param("cooler", "T")])
	await btn(JOY_BUTTON_RIGHT_SHOULDER)
	check(app.look2.pad_cam == 1, "L00: RB steps the camera preset")
	# --- L14: the wheels, the lever, the valve, the clamp, the call box
	app.start_level("L14", true); await frames(8)
	hud = app.look2.hud
	(hud._brief.content.get_node("Begin") as Button).pressed.emit(); await frames(3)
	var lab = app.look2.lab
	app.look2.pad_i = 0
	CbKit.pad_mode = true; await frames(2)
	check(app.look2._padl != null and app.look2._padl.visible and app.look2._pad_lbl.text.begins_with("T wheel"), "L14: the pad cursor shows on the T wheel")
	await btn(JOY_BUTTON_DPAD_UP); await btn(JOY_BUTTON_DPAD_UP); await get_tree_timer(0.4)
	check(absf(_param("lab_flask", "T") - 402.0) < 0.6, "L14: up twice on the T wheel = 402 K, 1 K steps since phase C (the goal wins only at 406 or 407 K) (%s)" % _param("lab_flask", "T"))
	await btn(JOY_BUTTON_DPAD_DOWN); await btn(JOY_BUTTON_DPAD_DOWN); await get_tree_timer(0.4)
	await btn(JOY_BUTTON_DPAD_RIGHT)
	await btn(JOY_BUTTON_DPAD_DOWN); await get_tree_timer(0.4)
	check(absf(_param("lab_flask", "V") - 0.00095) < 1e-9, "L14: the V wheel steps 0.05 L (%s)" % _param("lab_flask", "V"))
	await btn(JOY_BUTTON_DPAD_UP); await get_tree_timer(0.4)
	app.look2.pad_i = 5
	await btn(JOY_BUTTON_A)
	check(app.modal() != null, "L14: A on the Call box opens the keypad")
	app.back(); await frames(3)
	hud._fl.call_kp(85.87); await frames(2)
	app.look2.pad_i = 2
	var runs0 := int(app.b.q("levelInfo").get("runs", 0)) if app.b.q("levelInfo").has("runs") else -1
	await btn(JOY_BUTTON_A); await frames(4)
	check(not bool(app.b.q("levelInfo").hero.pending), "L14: A on the RUN lever runs the flask")
	app.look2.pad_i = 3
	await btn(JOY_BUTTON_A); await get_tree_timer(0.4)
	var af := 0.0
	for u in app.b.q("plant").units: if str(u.id) == str(hud.ids.get("argon", "?")): af = float(u.params.flow)
	check(lab.argon_on and absf(af - 0.15) < 1e-9, "L14: A on the valve opens the argon (%s)" % af)
	app.look2.pad_i = 4
	await btn(JOY_BUTTON_A); await get_tree_timer(0.4)
	check(_param("lab_flask", "Pfix") > 0.0, "L14: A on the clamp releases the piston (Pfix %s)" % _param("lab_flask", "Pfix"))
	# --- L10: gen mode, R3 to the hall, X back
	app.start_level("L10", true); await frames(8)
	Notebook.close(app); await frames(3)
	check(app.look2.gen != null and not app.look2.gen.visible, "L10: the drafting table first")
	var rack0 := [app.chrome.rack_wrap.is_visible_in_tree(), app.chrome.rack_hold, app.chrome.parts_btn.visible if app.chrome.parts_btn != null else false]   # the table's rack state before the flip
	await btn(JOY_BUTTON_X); await frames(3)
	check(not app.look2.gen.visible, "L10 (D-C5): X on the drafting table belongs to the table (turn a part), not the hall flip")
	await btn(JOY_BUTTON_RIGHT_STICK); await frames(3)
	check(app.look2.gen.visible, "L10: R3 shows the hall")
	app.lvbay.refresh(true); await frames(3)   # 0.12: the bay's own refresh once restored the rack over the hall (seen on L05/L06)
	check(not app.chrome.rack_wrap.is_visible_in_tree() and app.chrome.hall_hold and (app.chrome.parts_btn == null or not app.chrome.parts_btn.visible), "0.12 (Sigrid): the parts rack and its tab are hidden in the hall")
	await btn(JOY_BUTTON_X); await frames(3)
	check(not app.look2.gen.visible, "L10: X in the hall, back to the drafting table")
	var rack1 := [app.chrome.rack_wrap.is_visible_in_tree(), app.chrome.rack_hold, app.chrome.parts_btn.visible if app.chrome.parts_btn != null else false]
	check(rack1 == rack0 and not bool(rack1[1]), "and the drafting table's parts rack is as it was (%s, before %s)" % [str(rack1), str(rack0)])

func get_tree_timer(s: float) -> void:
	await create_timer(s).timeout
