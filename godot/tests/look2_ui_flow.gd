extends SceneTree
## Phase 0.12 UI flow (Kofi): the new-look console reads like a game, not a dashboard.
## 1. the annunciator in a hall level writes only what is lit, in sentence case, plus one goal stamp; every condition stays reachable (tooltip).
## 2. the chart recorder: legends sit above the plot (never over the trace), the printout countdown has its own line under the paper, and the console row fits 1600x900 (the pause pip was cut at the right edge).
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

	await _recorder()

func _recorder() -> void:
	app.start_level("L04", true); await frames(10)
	var rec: ChartRecorder = app.chrome.recorder
	_can([{"key": "goal", "legend": "GOAL MET", "state": "off"}])
	rec.hero = {"key": "nh3", "label": "NH3", "legend": "NH3", "unit": "kg/h", "value": 2432.0, "lo": 2420.0, "hi": 2444.0}
	rec.sec = {"key": "h2", "label": "H2 left", "legend": "H2 LEFT", "unit": "kg/h", "value": 281.9, "limit": 300.0}
	rec.third = {"key": "n2", "label": "N2", "legend": "N2", "unit": "kg/h", "value": 10.0}
	rec.runs = [{"n": 1, "h": 2430.0, "s": 280.0, "t": 9.0}, {"n": 2, "h": 2433.0, "s": 281.0, "t": 10.0}]
	rec.first_run = {"t": 20.0, "len": 29.0, "madeKg": 0.675}; rec.phase = "firstrun"
	EqTheme.drawn.clear(); EqTheme.audit = true; rec.queue_redraw(); await frames(2); EqTheme.audit = false
	var xf: Transform2D = rec.get_global_transform_with_canvas()
	var pl: Rect2 = xf * rec._plot()
	var paper_end: float = (xf * Rect2(0, 0, rec.size.x, rec.size.y - ChartRecorder.STRIP_H)).end.y
	var leg := 0; var over := 0; var count := 0; var clipped := 0
	for k in EqTheme.drawn:
		if not str(k).contains(str(rec.get_path())): continue
		var e: Array = EqTheme.drawn[k]; var t := str(e[1]); var gr: Rect2 = e[5]
		if t.begins_with("NH3") or t.begins_with("H2 LEFT") or t == "N2" or t.begins_with("N2 "):
			leg += 1
			if gr.end.y > pl.position.y + 1.0: over += 1
		if t.begins_with("Printout in"):
			count += 1
			if gr.position.y < paper_end - 1.0: over += 1
		if not bool(e[2]): clipped += 1
	check(leg == 3, "L04: three pen legends are drawn (%d)" % leg)
	check(over == 0, "L04: legends end above the plot, the printout countdown starts under the paper (%d misplaced)" % over)
	check(count == 1, "L04: the printout countdown is on its own line (%d)" % count)
	check(clipped == 0, "L04: no recorder text is squeezed past its width or clipped")
	# the whole console row fits the window: nothing (the pause pip) runs off the right edge
	var row: Control = app.chrome.top_row
	var right := 0.0
	for c in row.find_children("*", "Control", true, false):
		if (c as Control).is_visible_in_tree() and (c as Control).size.x > 0.0: right = maxf(right, (c as Control).get_global_rect().end.x)
	check(right <= 1600.0 - 8.0, "1600x900: the console row ends inside the window (right edge %.0f)" % right)
