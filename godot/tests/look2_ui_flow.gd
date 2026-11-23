extends SceneTree
## Phase 0.12 UI flow (Kofi): the new-look console reads like a game, not a dashboard.
## 1. the annunciator in a hall level writes only what is lit, in sentence case, plus one goal stamp; every condition stays reachable (tooltip).
## 2. the chart recorder: legends sit above the plot (never over the trace), the printout countdown has its own line under the paper, and the console row fits 1600x900 (the pause pip was cut at the right edge).
## 3. the notebook brief: at most three short lines first, the rest behind a More button, no Call-it rule said twice, every paragraph one or two sentences, the engine's note untouched.
## 4. 'tap' follows the device: click with a mouse, tap on touch, press A with a pad (the notebook's answer box, the intercom).
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
	await _brief()
	await _verbs()
	await _hall()
	await _small_text()

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

func _brief() -> void:
	check(BriefLines.sentences("Old notebook: 2.00 t of N2 in. Tell me what comes out. (Say 35 %). Ok.").size() == 4, "sentences: a decimal point is not a sentence end")
	for id in ["L01", "L02", "L03", "L04", "L10", "L11", "L12", "L13"]:
		app.start_level(id, true); await frames(8)
		var li = app.b.q("levelInfo")
		var engine_note := " ".join(PackedStringArray(li.note))
		check(li.get("predictNote") == null or engine_note.contains(str(li.predictNote)), "%s: the engine's note still carries the Call-it rule (the brief is shaped in the notebook only)" % id)
		Notebook.open(app); await frames(4)
		var note: Node = app.root.find_child("Note", true, false)
		if note == null: check(false, "%s: the notebook has a Note box" % id); continue
		var vis: Array = []
		for c in note.get_children():
			if c is Label and c.visible and not str(c.text).begins_with("—"): vis.append(str(c.text))
		check(vis.size() >= 1 and vis.size() <= 3, "%s: at most three short lines first (%d)" % [id, vis.size()])
		var all := " ".join(vis)
		var more: Node = note.get_node_or_null("NoteMore")
		var paras: Array = []
		if more != null: for c in more.get_children(): paras.append(str(c.text))
		for ptxt in paras: check(BriefLines.sentences(ptxt).size() <= 2, "%s: a paragraph behind More is one or two sentences: %s" % [id, ptxt.left(60)])
		all += " " + " ".join(paras)
		check(not all.contains("Call it") and not all.contains("answer box locks"), "%s: the Call-it rule is not repeated in the brief" % id)
		if li.get("predictNote") != null:
			var pn: Node = app.root.find_child("PredictNote", true, false)
			var rt: String = str(pn.text) if pn != null else ""
			check(rt != "" and not rt.begins_with("Call it"), "%s: the Call-it rule is printed once, on the Call-it row, without a second 'Call it:' ('%s')" % [id, rt.left(30)])
		var btn: Button = note.get_node_or_null("NoteMoreBtn")
		check((btn != null) == (more != null), "%s: a More button exactly when there is more" % id)
		if btn != null:
			check(not more.visible, "%s: the rest starts folded" % id)
			btn.pressed.emit(); await frames(2)
			check(more.visible and btn.text == "Less", "%s: More opens the rest" % id)
			btn.pressed.emit(); await frames(1)
		var words := 0
		for sx in vis: words += str(sx).split(" ").size()
		check(words <= 75, "%s: the first lines are short (%d words)" % [id, words])
		Notebook.close(app); await frames(3)

func _verbs() -> void:
	EqVerb.forced = "mouse"
	check(EqVerb.adapt("tap to enter") == "click to enter" and EqVerb.adapt("Tap the converter R-106.") == "Click the converter R-106.", "mouse: click")
	EqVerb.forced = "touch"
	check(EqVerb.adapt("tap to enter") == "tap to enter" and EqVerb.adapt("Tap the converter R-106.") == "Tap the converter R-106.", "touch: tap")
	EqVerb.forced = "pad"
	check(EqVerb.adapt("tap to enter") == "press A to enter" and EqVerb.adapt("Tap the converter R-106.") == "Press A on the converter R-106." and EqVerb.adapt("Turn, wheel, or tap the number") == "Turn, wheel, or press A on the number", "pad: press A")
	check(EqVerb.adapt("tapped out, no word here") == "tapped out, no word here" and EqVerb.adapt("Start work") == "Start work", "only the word tap changes")
	EqVerb.forced = ""
	# the last input decides: a touch, then a real mouse move
	var t := InputEventScreenTouch.new(); EqVerb.note(t)
	check(EqVerb.device() == "touch", "a touch makes it touch")
	var m := InputEventMouseMotion.new(); m.device = InputEvent.DEVICE_ID_EMULATION; EqVerb.note(m)
	check(EqVerb.device() == "touch", "a mouse event made by the touch itself does not change it")
	m = InputEventMouseMotion.new(); m.device = 0; EqVerb.note(m)
	check(EqVerb.device() == "mouse", "a real mouse makes it mouse")
	CbKit.pad_mode = true
	check(EqVerb.device() == "pad", "pad mode makes it pad")
	CbKit.pad_mode = false
	# on screen: the answer box in the notebook, under a mouse and a pad
	app.start_level("L04", true); await frames(8)
	Notebook.open(app); await frames(4)
	var ans: Node = app.root.find_child("Answer", true, false)
	EqTheme.drawn.clear(); EqTheme.audit = true; ans.queue_redraw(); await frames(2); EqTheme.audit = false
	var texts: Array = []
	for k in EqTheme.drawn: if str(k).contains(str(ans.get_path())): texts.append(str(EqTheme.drawn[k][1]))
	check(texts.has("click to enter"), "the notebook answer box says click to enter under a mouse: %s" % str(texts))
	CbKit.pad_mode = true
	EqTheme.drawn.clear(); EqTheme.audit = true; ans.queue_redraw(); await frames(2); EqTheme.audit = false
	texts = []
	for k in EqTheme.drawn: if str(k).contains(str(ans.get_path())): texts.append(str(EqTheme.drawn[k][1]))
	check(texts.has("press A to enter"), "and press A to enter with a pad: %s" % str(texts))
	CbKit.pad_mode = false
	check(app.chrome.intercom != null, "intercom exists")
	app.chrome.intercom.say("mara", "Tap the converter R-106.", "info")
	check(str(app.chrome.intercom.last().text) == "Click the converter R-106.", "the intercom says click under a mouse: %s" % str(app.chrome.intercom.last().text))
	Notebook.close(app)

## 0.13 (Kofi): over the hall the console is smoked glass (not the flat teal slab), the banner is short and says how to orbit and zoom, and the speed marks clear 16 px at 1600x900.
func _hall() -> void:
	CbKit.pad_mode = false
	app.start_level("L02", true); await frames(10)
	var l2 = app.look2
	var teal := (app.chrome.panel.get_theme_stylebox("panel") as StyleBoxFlat).bg_color
	check(not app.chrome.hall_hold, "L02 drafting: the hall is not showing")
	l2.gen_flip = true; l2.sync(); await frames(4)
	check(app.chrome.hall_hold, "L02: the hall shows")
	var sb := app.chrome.panel.get_theme_stylebox("panel") as StyleBoxFlat
	check(sb.bg_color.get_luminance() < 0.09 and sb.bg_color.a < 0.97, "the console over the hall is dark smoked glass, not the teal slab (%s)" % str(sb.bg_color))
	check(sb.bg_color != teal and sb.border_width_top <= 2 and sb.shadow_size >= 10, "the hall console has a thin edge and a deep shadow (border %d, shadow %d)" % [sb.border_width_top, sb.shadow_size])
	var line1: String = str(l2._banner_lbl.text).get_slice("\n", 0)
	check(line1.length() <= 56 and line1.contains("B: drafting table"), "the banner's first line is short and plain: '%s'" % line1)
	check(not str(l2._banner_lbl.text).contains("New look"), "no 'New look' in the banner")
	var l2t := str(l2._banner_lbl.text)
	check(l2t.contains("orbit") and l2t.contains("zoom") and l2t.contains("drag") and l2t.contains("wheel"), "the banner says how to orbit and zoom with the mouse: '%s'" % l2t)
	CbKit.pad_mode = true; await frames(3)
	l2t = str(l2._banner_lbl.text)
	check(l2t.to_lower().contains("right stick") and l2t.contains("orbit") and l2t.contains("zoom") and l2t.contains("X:") and not l2t.contains("wheel"), "with a pad the banner names the stick and the triggers: '%s'" % l2t)
	CbKit.pad_mode = false; await frames(3)
	check(str(l2._banner_lbl.text).contains("wheel"), "back to the mouse wording")
	l2.gen_flip = false; l2.sync(); await frames(4)
	var sb2 := app.chrome.panel.get_theme_stylebox("panel") as StyleBoxFlat
	check(not app.chrome.hall_hold and sb2.bg_color == teal, "the drafting table keeps the old enamel console (%s)" % str(sb2.bg_color))
	check(not str(l2._banner_lbl.text).contains("orbit"), "no orbit hint on the drafting table")

## The headless window does not stretch, so the project's canvas_items / expand rule is applied by hand: 1600x900 draws the 1920x1080 layout at 0.833.
const _STRETCH := 1600.0 / 1920.0
func _px(c: Control) -> float:
	var sz: int = (c as Label).label_settings.font_size if (c as Label).label_settings != null else c.get_theme_font_size("font_size")
	return float(sz) * c.get_global_transform_with_canvas().get_scale().y * c.get_viewport().get_final_transform().get_scale().y * _STRETCH

## 0.13 (Kofi): by eye at 1600x900 (canvas scale 0.83) the speed marks, the title foot and the Works map legend read about 12 px. Each must be 16 px or more on screen here.
func _small_text() -> void:
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900); await frames(6)
	app.start_level("L04", true); await frames(10)
	var sp: Control = app.chrome.keys.speed
	var t: Array = []
	EqTheme.drawn.clear(); EqTheme.audit = true; sp.queue_redraw(); await frames(2); EqTheme.audit = false
	var marks := 0
	for k in EqTheme.drawn:
		if not str(k).contains(str(sp.get_path())): continue
		var e: Array = EqTheme.drawn[k]
		if str(e[1]).ends_with("×"):
			marks += 1
			check(float(e[0]) * _STRETCH >= 16.0, "speed mark '%s' is %.1f px on screen at 1600x900" % [str(e[1]), float(e[0]) * _STRETCH])
	check(marks == 3, "three speed marks are drawn (%d)" % marks)
	app.to_title(); await frames(6)
	var foot := app.root.find_child("Foot", true, false) as Label
	check(foot != null and _px(foot) >= 16.0, "title foot line: %.1f px at 1600x900" % (_px(foot) if foot != null else 0.0))
	app.start_level("L01", true); await frames(6)
	WorksMap.open(app); await frames(6)
	var lg := app.root.find_child("Legend", true, false) as Label
	check(lg != null and _px(lg) >= 16.0, "Works map legend: %.1f px at 1600x900" % (_px(lg) if lg != null else 0.0))
	app.back(); await frames(3)
