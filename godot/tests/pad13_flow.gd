extends SceneTree
## 0.13 pad leftovers (Kofi), handheld 1280x800, pad only:
##  a. the Codex: a lone A never opens it (the notebook tab opens the notebook; LB / RB over the table or the hall never switch to it), and one B leaves it.
##  b. LB from the plot lands on the first tray tile (then LB steps back from there, so the last tile is one more press away).
##  c. the keypad shows a one-line pad hint, starts on 5, and 30.24 + Enter takes at most 16 presses (it took a tester about 20 on the plain grid).
##  d. the pad's hint row is not shown over the hall (its actions do nothing there) and is back on the drafting table.
## Prints PAD13-FLOW OK / PAD13-FLOW FAILED n.
var fails := 0
var checks := 0
var presses := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func btn(b: int) -> void:
	presses += 1
	var e := InputEventJoypadButton.new(); e.button_index = b; e.pressed = true
	Input.parse_input_event(e); await frames(2)
	var u := InputEventJoypadButton.new(); u.button_index = b; u.pressed = false
	Input.parse_input_event(u); await frames(2)
func focus() -> Control: return root.gui_get_focus_owner()

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_NOCOACH", "1")
	CbPad.enabled = true; CbLayout.forced = "handheld"
	check(Input.get_connected_joypads().is_empty(), "no machine joypad reaches this test (run via scripts/flows.sh)")
	root.size = Vector2i(1280, 800)
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	root.size = Vector2i(1280, 800); await frames(4)
	app.start_level("L02", true); await frames(10)
	if app.modal() != null: app.back(); await frames(3)
	app.pad.set_active(true); await frames(4)
	await _codex()
	await _tray()
	await _placing_shoulders()
	await _keypad()
	await _hall_hint()
	print("PAD13-FLOW checks=%d presses=%d" % [checks, presses])
	print("PAD13-FLOW OK" if fails == 0 else "PAD13-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _codex() -> void:
	# the notebook tab: A opens the notebook, never the Codex; one B closes it
	var tab = app.root.find_child("NotebookTab", true, false)
	var tb: Control = null
	for c in tab.find_children("*", "Button", true, false): tb = c
	check(tb != null, "the notebook tab has a button")
	tb.grab_focus(); await frames(2)
	await btn(JOY_BUTTON_A)
	check(app.cur == "home" and app.modal() != null and app.modal().name == "notebook", "A on the notebook tab opens the notebook, not the Codex (cur %s)" % app.cur)
	await btn(JOY_BUTTON_B)
	check(app.cur == "home" and app.modal() == null, "one B closes the notebook (cur %s)" % app.cur)
	# LB / RB, on the table and over the hall, never open the Codex
	for hall in [false, true]:
		app.look2.gen_flip = hall; app.look2.sync(); await frames(6)
		for b in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER, JOY_BUTTON_A]:
			await btn(b)
			check(app.cur != "codex", "hall=%s: button %d does not open the Codex" % [str(hall), b])
			if app.modal() != null: app.back(); await frames(2)
	app.look2.gen_flip = false; app.look2.sync(); await frames(6)
	# and from the Codex itself one B is enough
	app.show_screen("codex"); await frames(6)
	await btn(JOY_BUTTON_B)
	check(app.cur == "home", "one B leaves the Codex (cur %s)" % app.cur)

func _tray() -> void:
	# 0.13: the LB/RB/A presses above can leave a part in hand and move the tray's place (this check failed 1 run in 3, placing=mixer: LB with a part in
	# hand opened the Codex; that is fixed and checked in _placing_shoulders). Here the claim is about a fresh tray: put the part back, the pad's place at the start.
	app.show_screen("home"); await frames(4)
	if app.world.placing != "": app.world.cancel_place(); await frames(2)
	var rk0 = app.root.find_child("PartsRack", true, false)
	if rk0 != null: rk0._focus = 0
	var rk = app.root.find_child("PartsRack", true, false)
	check(rk != null and rk.tiles.size() > 2, "the tray has tiles")
	# the focus is on the plot (a unit target), not on a tile
	for c in app.root.find_children("Pad_u_*", "Control", true, false): (c as Control).grab_focus(); break
	await frames(3)
	check(not (focus() is PartsRack.Tile), "start: the focus is on the plot (%s)" % str(focus().name if focus() != null else "none"))
	await btn(JOY_BUTTON_LEFT_SHOULDER)
	var f = focus()
	check(f is PartsRack.Tile and rk.tiles.find(f) == 0, "LB from the plot lands on the first tile (index %d of %d)" % [rk.tiles.find(f), rk.tiles.size()])
	await btn(JOY_BUTTON_RIGHT_SHOULDER)
	check(rk.tiles.find(focus()) == 1, "RB from a tile steps to the next (index %d)" % rk.tiles.find(focus()))
	await btn(JOY_BUTTON_LEFT_SHOULDER); await btn(JOY_BUTTON_LEFT_SHOULDER)
	check(rk.tiles.find(focus()) == rk.tiles.size() - 1, "LB from the first tile wraps to the last (index %d)" % rk.tiles.find(focus()))

func _keypad() -> void:
	var got := [-1.0]
	var before := presses
	Knob.keypad(app, "TEST", "bar", "", 0.0, 1000.0, func(v: float) -> void: got[0] = v)
	await frames(8)
	var m = app.modal()
	check(m != null and m.name == "keypad", "a keypad is up")
	var ph := m.find_child("PadHint", true, false) as Label
	check(ph != null and ph.text != "" and ph.text.contains("D-pad") and ph.text.contains("A") and ph.text.contains("X") and not ph.text.contains("\n"), "the keypad says the pad keys in one line: '%s'" % (ph.text if ph != null else ""))
	check(focus() != null and focus().name == "Key_5", "the pad starts on 5 (%s)" % str(focus().name if focus() != null else "none"))
	# 3 0 . 2 4 by thumb: from 5: DOWN RIGHT A | DOWN LEFT A | RIGHT A | UP LEFT A | UP LEFT A, then RB = Enter
	var seq := [JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_A, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_A, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_A, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_A, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_A]
	for b in seq: await btn(b)
	var disp := ""
	for l in m.find_children("*", "Label", true, false): if str(l.text).ends_with(" bar") and not str(l.text).contains(" to "): disp = str(l.text)
	check(disp.begins_with("30.24"), "the thumb path typed 30.24 (the display reads '%s')" % disp)
	await btn(JOY_BUTTON_RIGHT_SHOULDER)
	check(absf(got[0] - 30.24) < 1e-9, "RB is Enter: the keypad returned %s" % str(got[0]))
	check(presses - before <= 16, "30.24 and Enter took %d presses (at most 16)" % (presses - before))
	# X deletes and Y clears
	Knob.keypad(app, "TEST", "bar", "", 0.0, 1000.0, func(v: float) -> void: got[0] = v)
	await frames(8)
	m = app.modal()
	await btn(JOY_BUTTON_A)   # 5
	await btn(JOY_BUTTON_A)   # 55
	await btn(JOY_BUTTON_X)   # 5
	var d2 := ""
	for l in m.find_children("*", "Label", true, false): if str(l.text).ends_with(" bar") and not str(l.text).contains(" to "): d2 = str(l.text)
	check(d2.begins_with("5 ") or d2 == "5 bar", "X deletes one digit ('%s')" % d2)
	await btn(JOY_BUTTON_Y)
	for l in m.find_children("*", "Label", true, false): if str(l.text).ends_with(" bar") and not str(l.text).contains(" to "): d2 = str(l.text)
	check(d2.begins_with("0"), "Y clears ('%s')" % d2)
	app.back(); await frames(3)

func _hall_hint() -> void:
	app.show_screen("home"); await frames(4)
	app.look2.gen_flip = false; app.look2.sync(); await frames(8)
	check(app.pad.hint.visible, "the drafting table shows the pad hint row")
	app.look2.gen_flip = true; app.look2.sync(); await frames(8)
	check(app.look2.gen.visible and not app.pad.hint.visible, "the hall hides the pad hint row (hall %s, hint %s)" % [str(app.look2.gen.visible), str(app.pad.hint.visible)])
	app.look2.gen_flip = false; app.look2.sync(); await frames(8)
	check(app.pad.hint.visible, "and the table gets it back")

## 0.13: with a part in hand, LB and RB put it back and step the tray; they never open the Codex (they fell through to the shell's drawer switch: the 0.12 "stray Codex").
func _placing_shoulders() -> void:
	app.start_level("L02", true); await frames(10)
	if app.modal() != null: app.back(); await frames(3)
	app.show_screen("home"); await frames(4)
	var rk = app.root.find_child("PartsRack", true, false)
	for b in [JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER]:
		var t = null
		for tt in rk.tiles: if tt.available and (tt.limit == null or tt.count < int(tt.limit)): t = tt; break
		check(t != null, "a tile with a part left to take")
		if t == null: return
		t.grab_focus(); await frames(4)
		await btn(JOY_BUTTON_A)
		check(app.world.placing != "", "A on a tile puts a part in hand (%s)" % str(app.world.placing))
		await btn(b)
		check(app.cur != "codex", "button %d with a part in hand does not open the Codex (cur %s)" % [b, app.cur])
		check(app.world.placing == "", "button %d puts the part back (%s)" % [b, str(app.world.placing)])
		if app.cur != "home": app.show_screen("home"); await frames(4)
