extends SceneTree
## Phase 0.12 UI flow (Kofi): the new-look console reads like a game, not a dashboard.
## 1. the annunciator in a hall level writes only what is lit, in sentence case, plus one goal stamp; every condition stays reachable (tooltip).
## Prints LOOK2-UI-FLOW OK / LOOK2-UI-FLOW FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", "")
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900)
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	await _run()
	print("LOOK2-UI-FLOW checks=%d" % checks)
	print("LOOK2-UI-FLOW OK" if fails == 0 else "LOOK2-UI-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _drawn_texts(ci: Node) -> Array:
	EqTheme.drawn.clear(); EqTheme.audit = true; ci.queue_redraw(); await frames(2); EqTheme.audit = false
	var r: Array = []
	for k in EqTheme.drawn: if str(k).contains(str(ci.get_path())): r.append(str(EqTheme.drawn[k][1]))
	return r

func _can(list: Array) -> void:   # a canned levelInfo on the console (the engine's would overwrite the windows on the next refresh)
	app.chrome.qa_li = {"id": "L02", "phase": "design", "annunciators": list}
	app.chrome.refresh()

func _run() -> void:
	check(Annunciator.sentence_case("NH3 OFF SPEC") == "NH3 off spec", "sentence case keeps a formula: %s" % Annunciator.sentence_case("NH3 OFF SPEC"))
	check(Annunciator.sentence_case("SULFUR FUME") == "Sulfur fume" and Annunciator.sentence_case("BED T HI") == "Bed temp high", "sentence case: %s / %s" % [Annunciator.sentence_case("SULFUR FUME"), Annunciator.sentence_case("BED T HI")])
	app.start_level("L02", true); await frames(10)
	var an: Annunciator = app.chrome.annunciator
	check(app.look2.gen != null and an.sentence, "L02 (hall level): the annunciator is in sentence mode")
	# a canned set: one lit amber, one dark, goal met
	_can([{"key": "a", "legend": "SULFUR FUME", "state": "high"}, {"key": "b", "legend": "SO2 OFF SPEC", "state": "off"}, {"key": "c", "legend": "AIR LIMITING", "state": "off"}, {"key": "solve", "legend": "SOLVE FAIL", "state": "off"}, {"key": "goal", "legend": "GOAL MET", "state": "normal"}])
	var t: Array = await _drawn_texts(an)
	check(t.has("Sulfur fume") and t.has("Goal met"), "the lit condition and the goal stamp are written in sentence case: %s" % str(t))
	check(not t.has("SO2 off spec") and not t.has("Air limiting") and not t.has("Solve fail"), "dark conditions are not drawn: %s" % str(t))
	var caps := 0
	for s in t: if s.length() > 3 and s == s.to_upper() and not s.contains("2"): caps += 1
	check(caps == 0, "no all-caps text left in the strip: %s" % str(t))
	check(an.tooltip_text.contains("SO2 off spec: quiet") and an.tooltip_text.contains("Sulfur fume: lit") and an.tooltip_text.contains("Goal met: met"), "every condition is reachable in the tooltip: %s" % an.tooltip_text)
	check(an.window_count() == 5, "the data is the same: five windows")
	_can([{"key": "goal", "legend": "GOAL MET", "state": "off"}, {"key": "a", "legend": "SULFUR FUME", "state": "off"}])
	t = await _drawn_texts(an)
	check(t.has("Goal not met yet") and t.has("Nothing is alarming."), "no alarms and no goal: two quiet lines: %s" % str(t))
	# a classic level keeps the caps windows
	app.start_level("L24", true); await frames(8)
	check(not app.chrome.annunciator.sentence, "a classic level keeps the caps annunciator")
