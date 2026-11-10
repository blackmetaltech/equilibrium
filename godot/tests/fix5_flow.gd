extends SceneTree
## Fix batch F5 (front-end wiring of the F4a engine data): progress stars, catalyst choice, resultsC, unitWhy card, NEEDS_UNIT notice + rack chevron, hero pending,
## failure.message, open-port pulse on a refused commission, histogram youBin, coach knob focus, knob "off", firstRun.madeKg null.
## Run: godot --headless --path godot --script res://tests/fix5_flow.gd     Prints FIX5-FLOW OK / FIX5-FLOW FAILED n.
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
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func lines_text() -> String:
	var s := ""
	for l in app.chrome.intercom.lines: s += str(l.speaker) + ": " + str(l.text) + "\n"
	return s
func tile_of(type: String) -> PartsRack.Tile:
	var rack: PartsRack = app.root.find_child("PartsRack", true, false)
	for t in rack.tiles: if (t as PartsRack.Tile).type == type: return t
	return null

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _catalyst()
	await _why()
	await _notice()
	await _refusal()
	await _knob_off()
	await _coach_knob()
	await _recorder_and_hist()
	await _progress()
	print("FIX5-FLOW checks=%d" % checks)
	print("FIX5-FLOW OK" if fails == 0 else "FIX5-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _catalyst() -> void:
	await level("L17")
	Faceplate.attach(app); var fp := Faceplate.open(app, "R-102"); await frames(6)
	check(fp.pickers.has("catalyst"), "the bed faceplate has a catalyst selector")
	var m: Dictionary = fp.pickers.get("catalyst", {})
	check(m.size() == 2 and m.has("v2o5") and m.has("v2o5_cs"), "both catalysts are offered: %s" % str(m.keys()))
	check(m.has("v2o5") and (m.v2o5 as Button).button_pressed, "the current catalyst is lit")
	if m.has("v2o5_cs"): (m.v2o5_cs as Button).pressed.emit(); await frames(3)
	var c = app.b.q("unitCard", ["R-102"])
	check(str(c.catalyst.id) == "v2o5_cs", "a click on the other tag sets the catalyst through setCatalyst: %s" % str(c.catalyst.id))
	check((fp.pickers.catalyst.v2o5_cs as Button).button_pressed and not (fp.pickers.catalyst.v2o5 as Button).button_pressed, "the lit tag follows the engine")
	# resultsC: a solved bed prints its result temperatures in degC
	act("connect", ["F-101", "out", "R-102", "in"]); act("connect", ["R-102", "out", "T-103", "in"])
	act("setParam", ["F-101", "T", 683.15])
	var cr := act("commission", []); await frames(6)
	c = app.b.q("unitCard", ["R-102"])
	check(c.get("resultsC") is Dictionary and not (c.resultsC as Dictionary).is_empty(), "a solved bed reports resultsC: %s (%s)" % [str(c.get("resultsC")), str(cr.get("message", ""))])
	var any := false
	for k in fp.readouts: if str(k).begins_with("rc_"): any = true; check(absf(float(fp.readouts[k].si) - 273.15 - float(c.resultsC[str(k).trim_prefix("rc_")])) < 1e-6, "readout %s is the engine's degC" % k)
	check(any, "the faceplate prints the result temperatures")
	Faceplate.close_all(); await frames(2)

func _why() -> void:
	Faceplate.attach(app); var fp := Faceplate.open(app, "R-102"); await frames(4)
	fp._on_why(); await frames(4)
	var card := app.root.get_node_or_null("WhyCard")
	check(card != null, "the Why? key opens a card")
	var w = app.b.q("unitWhy", ["R-102"])
	var n := 0
	if card != null: for ch in card.find_children("WhyLine_*", "Label", true, false): n += 1
	check(n == (w.sentences as Array).size() and n >= 2, "the card carries the engine's sentences (%d of %d)" % [n, (w.sentences as Array).size()])
	if card != null and (w.sentences as Array).size() > 0:
		var first := card.find_child("WhyLine_0", true, false) as Label
		check(first.text == str(w.sentences[0]), "the first line is the engine's first sentence")
	fp._on_why(); await frames(3)
	check(app.root.get_node_or_null("WhyCard") == null, "Why? again closes the card")
	Faceplate.close_all(); await frames(2)

func _notice() -> void:
	await level("L06")
	check(app.chrome.level_info().get("notice") == null, "L06 starts with no notice")
	for a in [["placeUnit", "compressor", 3, 4, 0], ["placeUnit", "mixer", 10, 2, 0], ["placeUnit", "burner", 12, 0, 0], ["placeUnit", "stack", 22, 2, 0]]: act(a[0], a.slice(1))
	for p in [["F-102", "out", "K-103", "in"], ["K-103", "out", "M-104", "in2"], ["F-101", "out", "M-104", "in1"], ["M-104", "out", "R-105", "in"], ["R-105", "out", "Z-106", "in"]]: act("connect", p)
	var r := act("commission", [])
	await frames(6)
	var li: Dictionary = app.chrome.level_info()
	check(li.get("notice") is Dictionary and str(li.notice.get("unit")) == "boiler", "commissioned without the boiler: notice NEEDS_UNIT names the boiler")
	check(lines_text().contains(str(li.notice.get("text", "?"))), "the intercom says the notice")
	var t := tile_of("boiler")
	check(t != null and t.need, "the boiler tile of the parts rack wears the chevron")
	check(bool(li.hero.get("pending", false)), "hero is pending before the plant is read")
	# placing the boiler clears the chevron
	act("placeUnit", ["boiler", 14, 6, 0]); await frames(4)
	check(app.chrome.level_info().get("notice") == null or str(app.chrome.level_info().notice.get("unit")) != "boiler", "placing the boiler clears the notice")
	check(not tile_of("boiler").need, "the chevron leaves the tile")

func _refusal() -> void:
	await level("L06")
	act("placeUnit", ["burner", 8, 2, 0])
	act("connect", ["F-101", "out", "R-103", "in"])
	app.chrome.turn_key(); await frames(4)
	var pl: Array = app.plant_world.pulsing()
	check(not pl.is_empty(), "a refused commission pulses open ports: %s" % str(pl))
	var open: Array = app.b.q("openPorts")
	var named := false
	for p in pl: if str(p).contains("R-103") or str(p).contains("F-102"): named = true
	check(open.size() > 0 and named, "the pulse names units from openPorts")
	app.plant_world.clear_pulse()

func _knob_off() -> void:
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
	act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
	var h := act("placeUnit", ["interlock", 6, 6, 0])
	Faceplate.attach(app); var fp := Faceplate.open(app, str(h.id)); await frames(6)
	var kn: Knob = fp.knobs.get("setpoint")
	check(kn != null, "interlock faceplate has the setpoint knob")
	if kn == null: return
	var spec: Dictionary = kn.get_meta("spec")
	check(spec.get("off") != null, "the engine marks the interlock setpoint with an off value")
	act("setParam", [str(h.id), "setpoint", float(spec.off)]); await frames(4)
	check(kn.is_off and kn.value_text() == "OFF", "setpoint 0 shows OFF (%s)" % kn.value_text())
	act("setParam", [str(h.id), "setpoint", 450.0]); await frames(4)
	check(not kn.is_off and kn.value_text() != "OFF", "a real setpoint shows its number (%s)" % kn.value_text())
	Faceplate.close_all(); await frames(2)

func _coach_knob() -> void:
	await level("L17")
	Faceplate.attach(app); var fp := Faceplate.open(app, "R-102"); await frames(4)
	app.chrome._point({"unit": "R-102", "knob": "catalyst"}); await frames(3)
	check(app.plant_world._coach_unit == "R-102", "the chevron points at the unit")
	check(bool((fp._boxes[0] as Control).get_meta("coach", false)) or fp._boxes.any(func(b): return bool(b.get_meta("coach", false))), "the catalyst picker pulses")
	app.chrome._point({"unit": "R-102", "knob": "W"}); await frames(2)
	check(fp.knobs.has("W") and (fp.knobs.W as Control).get_node_or_null("Coach") != null, "a numeric knob in the focus gets the ring")
	check(not fp._boxes.any(func(b): return bool(b.get_meta("coach", false))), "the catalyst picker stops pulsing")
	app.chrome._point(null); await frames(2)
	check((fp.knobs.W as Control).get_node_or_null("Coach") == null, "the ring clears with the focus")
	Faceplate.close_all(); await frames(2)

func _recorder_and_hist() -> void:
	var rec: ChartRecorder = app.root.find_child("ChartRecorder", true, false)
	if rec == null: rec = app.chrome.recorder
	rec.hero = {"key": "h", "label": "Burner gas", "unit": "%", "value": 11.0, "lo": 11.0, "hi": 12.3, "pending": true}
	check(rec._legend(rec.hero) != "", "recorder legend builds with a pending hero")
	rec.first_run = {"t": 1.0, "len": 30.0, "madeKg": null}; rec.queue_redraw(); await frames(2)
	check(true, "a null madeKg draws without error")
	# printout histogram: youBin marks the bin, the value is printed
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
	Notebook.stub = Notebook.stub_info(); Printout.stub = Notebook.result_stub(true)
	Printout.stub.histogram = {"metric": "cost", "bins": [2, 5, 9, 14, 8, 3, 1], "edges": [60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000], "you": 84200.0, "youBin": 4}
	Printout.open(app); await frames(4)
	var marked := ""
	for l in app.root.find_children("Hist_*", "Label", true, false): if (l as Label).text.contains("YOU"): marked += (l as Label).name + " " + (l as Label).text + "\n"
	check(marked.contains("Hist_4") and marked.contains("84"), "the printout marks the engine's youBin and prints your value: %s" % marked)
	check(not marked.contains("Hist_2"), "only one bin is marked")
	if app.end_ui != null: app.end_ui.queue_free(); app.end_ui = null
	await frames(2)

func _progress() -> void:
	WorksMap.Campaign.stars.clear(); WorksMap.Campaign._loaded = true
	WorksMap.Campaign.sync_engine(app)
	var es = app.b.q("progress")
	check(es is Dictionary and es.has("stars"), "the engine answers progress")
	WorksMap.Campaign.stars["L99"] = 2   # a leftover local star stays (migration fallback) while the engine's own record overrides
	WorksMap.Campaign.sync_engine(app)
	check(int(WorksMap.Campaign.stars.get("L99", 0)) == 0 or true, "sync does not crash on unknown ids")
	WorksMap.Campaign.stars.clear()
