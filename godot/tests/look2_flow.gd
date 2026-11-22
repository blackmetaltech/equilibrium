extends SceneTree
## LOOK2 slice flow (docs/LOOK2.md): L00 in learner runs in the new look. Needs a display (Xvfb, compat renderer): the HUD's glass shader samples the screen.
## Run: xvfb-run -a godot --path godot --rendering-method gl_compatibility --script res://tests/look2_flow.gd     Prints LOOK2-FLOW OK / LOOK2-FLOW FAILED n.
## Checks: LOOK2 is on and the 0.9 console is hidden; the HUD has the dial, the brief and the command panel; Begin starts 1x; the dial commits a set point the engine
## reports; speed buttons and keys work; the converter pick advances the coach; no HUD text under 16 px; the end card shows after the decision with working buttons;
## with CB_LOOK2=0 the old console is used.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "")
	OS.set_environment("CB_LOOK2", "")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	await _run()
	print("LOOK2-FLOW checks=%d" % checks)
	print("LOOK2-FLOW OK" if fails == 0 else "LOOK2-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _cooler_T() -> float:
	for u in app.b.q("plant").units: if str(u.type) == "cooler": return float(u.params.T)
	return -1.0

func _small_text(n: Node) -> int:
	var bad := 0
	for c in n.find_children("*", "Label", true, false):
		if (c as Label).visible and (c as Label).get_theme_font_size("font_size") < 16: bad += 1
	for c in n.find_children("*", "Button", true, false):
		if (c as Button).visible and (c as Button).get_theme_font_size("font_size") < 16: bad += 1
	return bad

func _run() -> void:
	CbSettings.persist = false
	app.new_game("learner"); await frames(4)
	app.start_level("L00", true); await frames(6)
	check(app.look2 != null and app.look2.on, "LOOK2 is on for L00")
	check(app.chrome != null and not app.chrome.visible, "the 0.9 console is hidden")
	var hud: HoloHud = app.look2.hud
	check(hud != null and hud.is_inside_tree() and hud._built, "the HUD exists and is built")
	check(hud != null and hud._dial != null and hud._dial.is_inside_tree(), "the HUD has the cooler dial")
	check(hud._brief.shown and not hud._brief_done, "the opening brief is up")
	check(int(app.speed) == 0, "the level opens paused")
	check(hud._play.text == "Start", "the play button says Start")
	# Begin starts 1x
	(hud._brief.content.get_node("Begin") as Button).pressed.emit(); await frames(3)
	check(hud._brief_done and int(app.speed) == 1 and float(app.b.g.clock.speed) == 1.0, "Begin starts 1x (engine clock speed %s)" % str(app.b.g.clock.speed))
	# the converter pick advances the coach (step 1 -> 2)
	hud.refresh()
	var step0 := int(app.b.q("levelInfo").coach.step)
	hud._on_picked("converter"); await frames(3)
	var li = app.b.q("levelInfo")
	check(step0 == 1 and li.coach is Dictionary and int(li.coach.step) == 2, "picking the converter marks the coach step (was %d)" % step0)
	# speed: the buttons take the same path as the old console
	hud._speed_btns[2].pressed.emit(); await frames(2)
	check(int(app.speed) == 3 and float(app.b.g.clock.speed) == 16.0, "the 16x button sets the speed (engine %s)" % str(app.b.g.clock.speed))
	hud._play.pressed.emit(); await frames(2)
	check(int(app.speed) == 0, "the play button pauses")
	var ev := InputEventKey.new(); ev.keycode = KEY_SPACE; ev.pressed = true
	check(hud.key(ev) and int(app.speed) == 1, "Space resumes at 1x")
	hud.choose_speed(0)
	# the dial commits a set point the engine reports
	var t0 := _cooler_T()
	check(absf(t0 - 700.0) < 0.5, "the cooler starts at 700 K (%s)" % str(t0))
	check(absf(hud._dial.value_k - 700.0) < 0.5, "the dial shows the engine's 700 K")
	hud._dial.value_k = 560.0; hud._dial.committed.emit(560.0)
	app.b.act("tick", [60]); await frames(2)
	check(absf(_cooler_T() - 560.0) < 0.5, "the dial commits a set point: cooler T is %s K" % str(_cooler_T()))
	var bk := InputEventKey.new(); bk.keycode = KEY_BRACKETRIGHT; bk.pressed = true
	var before: float = hud._dial.value_k
	hud.key(bk)
	check(absf(hud._dial.value_k - (before + 5.0)) < 0.01, "] nudges the dial by 5 K")
	# a toast shows on the coach panel
	hud.toast("Cannot do that", "warn"); await frames(2)
	check(hud._toast_lbl.visible and hud._toast_lbl.text == "Cannot do that", "a toast appears on the coach panel")
	check(_small_text(hud) == 0, "no HUD text under 16 px")
	# tick past the decision: the end card
	hud.choose_speed(1)
	app.b.act("tick", [120]); await frames(8)
	check(str(app.b.g.status) != "playing", "the shift ended (%s)" % str(app.b.g.status))
	check(hud._end != null and hud._end.shown, "the end card is up")
	check(hud._end != null and hud._end.find_child("Retry", true, false) != null and hud._end.find_child("WorksMap", true, false) != null, "the end card has Retry and Works map")
	check(_small_text(hud) == 0, "no end-card text under 16 px")
	# Retry starts a fresh attempt and clears the card
	(hud._end.find_child("Retry", true, false) as Button).pressed.emit(); await frames(10)
	check(str(app.b.g.status) == "playing" and not hud._end.shown, "Retry starts again and the card closes")
	# CB_LOOK2=0: the old console
	OS.set_environment("CB_LOOK2", "0")
	app.start_level("L00", true); await frames(6)
	check(not app.look2.on and app.chrome.visible, "with CB_LOOK2=0 the old console is used")
	OS.set_environment("CB_LOOK2", "")
