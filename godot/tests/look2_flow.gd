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
	# round 2: tags and one card, the docked diagram, the world's wheel
	await _tags_and_dock(hud)
	# CB_LOOK2=0: the old console
	OS.set_environment("CB_LOOK2", "0")
	app.start_level("L00", true); await frames(6)
	check(not app.look2.on and app.chrome.visible, "with CB_LOOK2=0 the old console is used")
	OS.set_environment("CB_LOOK2", "")
	await _run_l14()

## L00 round 2: every anchored role has a tag, at most one card is open, the diagram is docked in the top-right corner and a click enlarges it, the world's
## control_changed("T") commits the cooler set point and the dial follows.
func _tags_and_dock(hud: HoloHud) -> void:
	await frames(4)
	check(hud._tags.size() == 5 and hud._cards.size() == 5, "L00 has five tags and five cards")
	hud._pick_role = "cooler"; hud._pick_until = Time.get_ticks_msec() * 0.001 + 5.0; await frames(6)
	var open := 0
	for r in hud._cards: if (hud._cards[r].p as HoloPanel).shown: open += 1
	check(open <= 1, "at most one card is open (%d)" % open)
	var vp := hud._vp(); var dr := Rect2(hud._dg_panel.position, hud._dg_panel.size)
	check(hud._dg_panel.shown and dr.position.x > vp.x * 0.5 and dr.position.y < vp.y * 0.5, "the diagram is docked in the top-right (%s)" % str(dr))
	check(dr.size.x <= 320.0 and dr.size.y <= 210.0, "the docked diagram is compact (%s)" % str(dr.size))
	hud.toggle_diagram(); await frames(3)
	check(hud._dg_panel.size.x > dr.size.x and not hud._diagram.mini, "a click enlarges the diagram in place")
	hud.toggle_diagram(); await frames(3)
	check(hud._diagram.mini, "another click docks it again")
	check(hud.find_children("Cam_*", "Button", true, false).is_empty(), "the camera button row is gone")
	var lab = app.look2.lab
	lab.control_changed.emit("T", 610.0); app.b.act("tick", [60]); await frames(3)
	check(absf(_cooler_T() - 610.0) < 0.5 and absf(hud._dial.value_k - 610.0) < 0.5, "control_changed T from the world commits the cooler set point (%s)" % str(_cooler_T()))
	check(_small_text(hud) == 0, "no tag or card text under 16 px")

func _run_l14() -> void:
	OS.set_environment("CB_LOOK2", "")
	app.start_level("L14", true); await frames(8)
	check(app.look2.on and app.look2.level == "L14", "LOOK2 is on for L14")
	var hud: HoloHud = app.look2.hud
	check(hud != null and hud._fl != null and hud._built, "the L14 HUD is built")
	check(hud._brief.shown and not hud._brief_done, "the L14 brief is up")
	var v: VBoxContainer = hud._brief.content
	check((v.get_child(0) as Label).text == "The glassware bench" and (v.get_child(1) as Label).text.begins_with("Exam Bridge"), "the brief has the place and the title")
	check((v.get_child(2) as Label).text.contains("13.8 grams") and (v.get_child(3) as Label).text.begins_with("Write Kp"), "the brief has the two notes")
	(v.get_node("Begin") as Button).pressed.emit(); await frames(3)
	var fl: HoloFlask = hud._fl
	check(hud._tags.size() == 3 and hud._cards.size() == 3, "tags on the flask, the argon bottle and the vent")
	check(not fl.run() and not (app.b.q("levelInfo").callIt.answered), "RUN before the call is held (Kp first)")
	check(fl.call_kp(85.87) and app.b.q("levelInfo").callIt.answered, "Call Kp reaches the engine")
	# the HUD field: V to 0.5 L
	fl.f_V.committed.emit(0.5); await frames(2)
	check(absf(_flask_param("V") - 0.0005) < 1e-9, "V from the HUD field reaches the engine (%s)" % str(_flask_param("V")))
	check(fl.run(), "RUN commissions")
	await frames(3)
	var li = app.b.q("levelInfo")
	check(not bool(li.hero.pending) and absf(float(li.hero.value) - 17.37) < 0.2, "the gauge reads back after RUN (%s bar)" % str(li.hero.value))
	check(fl.last.has and absf(float(fl.last.kp) - 85.87) < 0.5 and float(fl.last.alpha) > 50.0, "the last run shows P, alpha and Kp (%s)" % str(fl.last))
	# the world's knob
	var lab = app.look2.lab
	lab.control_changed.emit("T", 450.0); await frames(2)
	check(absf(_flask_param("T") - 450.0) < 0.5 and absf(fl.f_T.value - 176.85) < 0.1, "control_changed T from the lab commits and the field follows (%s)" % str(_flask_param("T")))
	fl.f_A.committed.emit(0.15); await frames(2)
	var af := 0.0
	for u in app.b.q("plant").units: if str(u.id) == str(hud.ids.get("argon", "?")): af = float(u.params.flow)
	check(absf(af - 0.15) < 1e-9, "argon from the HUD field reaches the engine (%s)" % str(af))
	# one card at most, and a pick opens the flask card
	hud._on_picked("wheel_v"); await frames(8)
	var open := 0
	for r in hud._cards: if (hud._cards[r].p as HoloPanel).shown: open += 1
	check(open <= 1, "at most one L14 card is open (%d)" % open)
	check(_small_text(hud) == 0, "no L14 HUD text under 16 px")

func _flask_param(k: String) -> float:
	for u in app.b.q("plant").units: if str(u.type) == "lab_flask": return float(u.params[k])
	return -1.0
