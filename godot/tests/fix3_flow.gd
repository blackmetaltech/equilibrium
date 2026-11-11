extends SceneTree
## Fix batch F3b (playtest round 3, front-end): the key (auto-run, STOP + EDIT, nothing silent), restart that keeps the build and the Call it answers, heater
## utility picker and the 0 kW warning, feed card agreeing with its knob, relative knob steps, drag-to-connect with a ghost line, exchanger port tags,
## display scenes on the board levels, the camera framing every pre-placed unit, plates clear of the instrument bays, keypad hints, the Semenov axis.
## Run: godot --headless --path godot --script res://tests/fix3_flow.gd     Prints FIX3-FLOW OK / FIX3-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func lines_text() -> String:
	var s := ""
	for l in app.chrome.intercom.lines: s += str(l.speaker) + ": " + str(l.text) + "\n"
	return s

func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(2)

func fire_build(air: float) -> void:
	var acts := [["placeUnit", ["compressor", 4, 4, 0]], ["placeUnit", ["mixer", 10, 2, 0]], ["placeUnit", ["burner", 14, 0, 0]], ["placeUnit", ["boiler", 18, 0, 0]], ["placeUnit", ["stack", 22, 2, 0]],
		["setFeed", ["F-102", {"flow": air * 1000.0 / 3600.0}]], ["setParam", ["B-106", "T", 420.0 + 273.15]],
		["connect", ["F-102", "out", "K-103", "in"]], ["connect", ["K-103", "out", "M-104", "in2"]], ["connect", ["F-101", "out", "M-104", "in1"]],
		["connect", ["M-104", "out", "R-105", "in"]], ["connect", ["R-105", "out", "B-106", "in"]], ["connect", ["B-106", "out", "Z-107", "in"]]]
	for a in acts: app.b.act(a[0], a[1])
	app.game_on_changed()

func mouse(p: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = pressed; Input.parse_input_event(e)
func motion(p: Vector2) -> void:
	var e := InputEventMouseMotion.new(); e.position = p; e.global_position = p; Input.parse_input_event(e)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _key_and_restart()
	await _faceplate()
	await _pipes()
	await _boards()
	await _misc()
	print("FIX3-FLOW checks=%d" % checks)
	print("FIX3-FLOW OK" if fails == 0 else "FIX3-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# the key: commissioning a shift level runs it; the key again is STOP + EDIT; restart keeps the build and the call
func _key_and_restart() -> void:
	await level("L05")
	var ch: EqConsole = app.chrome
	check(Notebook.open(app) != null, "the notebook opens")
	var nb = app.root.get_node_or_null("notebook")
	check(nb != null and (nb.find_child("Start", true, false) as Button).text == "Start work", "a fresh job says Start work")
	var r: Dictionary = app.b.act("callIt", [8.2]); check(bool(r.get("ok", false)), "the call is accepted: %s" % str(r))
	Notebook.close(app); await frames(2)
	nb = Notebook.open(app); await frames(3)
	var note := (nb as Node).find_child("CallNote", true, false) as Label
	check(note != null and note.visible and note.text.contains("predicted") and note.text.contains("8.2"), "the answer persists as 'predicted: 8.2 MW' after reopening (%s)" % (note.text if note != null else "none"))
	Notebook.close(app); await frames(2)
	fire_build(860.0); await frames(2)
	check(ch.keys.key.next == 1 and ch.keys.key.next_text != "", "before commissioning the key says what one more turn does (%s)" % ch.keys.key.next_text)
	ch.turn_key(true); app.game_on_changed(); await frames(3)
	check(ch.phase == "shift" and ch.keys.pos == 2, "commissioning a shift level starts the shift (phase %s, key %d)" % [ch.phase, ch.keys.pos])
	check(lines_text().contains("RUNNING"), "the intercom says the plant is running")
	check(ch.keys.key.next == 0 and ch.keys.key.next_text == "STOP + EDIT", "while running the key offers STOP + EDIT")
	var n_units: int = (app.b.q("plant") as Dictionary).units.size()
	ch.turn_key(true); app.game_on_changed(); await frames(4)
	check(ch.phase == "design" and ch.keys.pos == 0, "STOP + EDIT returns to design (phase %s)" % ch.phase)
	check((app.b.q("plant") as Dictionary).units.size() == n_units and (app.b.q("plant") as Dictionary).streams.size() == 6, "the build is kept: %d units, %d pipes" % [(app.b.q("plant") as Dictionary).units.size(), (app.b.q("plant") as Dictionary).streams.size()])
	check(lines_text().contains("Stopped"), "the intercom says what happened")
	var nb2 = Notebook.open(app); await frames(3)
	check(nb2 != null and (nb2.find_child("Start", true, false) as Button).text == "Back to work", "after the job has started the key says Back to work")
	Notebook.close(app); await frames(2)
	var li: Dictionary = app.b.q("levelInfo")
	check(bool(li.callIt.answered) and absf(float(li.callIt.value) - 8.2) < 1e-9, "the Call it answer survives the stop")
	var f: Dictionary = app.b.q("unitCard", ["F-102"]).feed
	check(absf(float(f.flow) * 3.6 - 860.0) < 0.01, "the air flow knob value survives (%s kmol/h)" % str(float(f.flow) * 3.6))
	# restart job: asks, keeps the build, or clears the plot
	PauseMenu._restart(app); await frames(3)
	var ask = app.root.get_node_or_null("restartask")
	check(ask != null and ask.find_child("KeepBuild", true, false) != null and ask.find_child("ClearPlot", true, false) != null, "Restart job asks: keep the build or clear the plot")
	(ask.find_child("Cancel", true, false) as Button).pressed.emit(); await frames(3)
	check((app.b.q("plant") as Dictionary).units.size() == n_units, "Cancel changes nothing")
	var r2 := BuildKeeper.restart(app, false); await frames(3)
	check((app.b.q("plant") as Dictionary).units.size() == 2 and bool((app.b.q("levelInfo") as Dictionary).callIt.answered), "clear the plot: back to the preplaced feeds, the Call it answer kept")
	# a dial edit during a run says what happened (L30 loop panel)
	app.chrome.intercom.clear()

# the faceplate: heater utility picker, 0 kW warning, feed card, relative knob steps
func _faceplate() -> void:
	await level("L05")
	Faceplate.attach(app)
	var fp := Faceplate.open(app, "F-102"); await frames(3)
	var kn: Knob = fp.knobs.flow
	kn.set_value(1000.0); kn.committed.emit(1000.0); await frames(3)
	var spec: float = float(app.b.q("unitCard", ["F-102"]).feed.flow) * 3.6
	check(absf(kn.value - 1000.0) < 1e-6 and absf(spec - 1000.0) < 0.01 and str(fp.readouts.flow.text) == "1,000", "typed 1000: knob %s, spec %s, FLOW %s all agree" % [kn.value, spec, fp.readouts.flow.text])
	check(kn.relative and kn.rel_step(false) <= 0.02 * kn.value and kn.rel_step(true) <= 0.002 * kn.value + 1e-9, "the wheel moves a share of the value (coarse %s, fine %s at %s)" % [kn.rel_step(false), kn.rel_step(true), kn.value])
	kn.set_value(100.0)
	check(kn.rel_step(false) <= 2.0 and kn.rel_step(true) <= 0.2, "at 100 the wheel can land a 0.75 pct window (coarse %s, fine %s)" % [kn.rel_step(false), kn.rel_step(true)])
	Faceplate.close_all(); await frames(2)
	app.new_game("sandbox"); await frames(4)
	Notebook.close(app); await frames(2)
	app.b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
	var h: Dictionary = app.b.act("placeUnit", ["heater", 4, 4, 0]); app.game_on_changed(); await frames(2)
	Faceplate.attach(app)
	var hp := Faceplate.open(app, str(h.id)); await frames(3)
	check(hp.pickers.has("utility") and (hp.pickers.utility as Dictionary).size() == 5, "the heater has a labelled utility picker with five options")
	var labels: Array = []
	for o in hp.pickers.utility: labels.append((hp.pickers.utility[o] as Button).text)
	check(labels.has("FIRED") and labels.has("STEAM") and labels.has("COOLING WATER") and labels.has("REFRIGERANT") and labels.has("NONE (ADIABATIC)"), "picker labels: %s" % str(labels))
	var wb: Control = hp.find_child("WarnBox", true, false)
	check(wb != null and wb.modulate.a > 0.9 and (hp.find_child("Warn", true, false) as Label).text.contains("0 kW"), "a heater with no utility carries the loud 0 kW warning")
	(hp.pickers.utility["steam"] as Button).pressed.emit(); await frames(3)
	check(str(app.b.q("unitCard", [str(h.id)]).params.get("utility", "")) == "steam" and (hp.pickers.utility["steam"] as Button).button_pressed, "picking steam sets the utility")
	check(wb.modulate.a < 0.1, "...and the warning goes quiet")
	# the card's layout is fixed: an error line does not move the readouts
	var y0: float = (hp.find_child("Cell_flow", true, false) as Control).global_position.y
	hp._need.text = "A long refusal that wraps over two lines of the card text to prove the fields do not jump when it appears"; hp._need.modulate.a = 1.0; await frames(3)
	check(absf((hp.find_child("Cell_flow", true, false) as Control).global_position.y - y0) < 0.5, "an error line does not move the fields")
	# the plate never covers an instrument bay
	app.bay.visible = true; app.bay.layout(); await frames(2)
	hp._place(true); await frames(2)
	check(not hp.get_global_rect().intersects(app.bay.get_global_rect()), "the faceplate stays clear of the instrument bay (%s vs %s)" % [hp.get_global_rect(), app.bay.get_global_rect()])
	app.bay.visible = false
	Faceplate.close_all()

# pipes: ghost line after an OUT click, drag from port to port, exchanger tags
func _pipes() -> void:
	await level("L01")
	var hub = Faceplate.attach(app)
	var w: PlantWorld = app.plant_world
	var a: Dictionary = app.b.act("placeUnit", ["feed", 2, 4, 0]); var b2: Dictionary = app.b.act("placeUnit", ["mixer", 12, 4, 0]); print(b2); app.game_on_changed(); await frames(3)
	w.port_clicked.emit(str(a.id), "out", false); await frames(3)
	check(hub.from_unit == str(a.id) and w.pipe_ghost_active(), "clicking an OUT starts a ghost line")
	check(lines_text().contains("now click an inlet") or str(app.chrome.intercom.shown_text()).contains("now click an inlet"), "the intercom says now click an inlet")
	hub.clear_pipe(); await frames(2)
	check(not w.pipe_ghost_active(), "the ghost line goes when the pipe is dropped")
	# a real drag: press on the OUT pip, release on the IN pip
	w.select(str(a.id)); w.unit_clicked.emit(str(a.id)); await frames(3)
	var pip: Vector2 = Vector2(-1, -1)
	for i in w._mark_nodes.size():
		if str(w._marks[i].port) == "out": pip = w.cam.unproject_position((w._mark_nodes[i] as Node3D).global_position)
	check(pip.x > 0.0, "the free OUT of the feed is lit")
	mouse(pip, true); await frames(3)
	check(hub.from_unit == str(a.id), "pressing on the OUT starts the pipe")
	var tgt: Vector2 = Vector2(-1, -1)
	for i in w._mark_nodes.size():
		if str(w._marks[i].unit) == str(b2.id) and bool(w._marks[i].inlet) and bool(w._marks[i].get("hot", false)): tgt = w.cam.unproject_position((w._mark_nodes[i] as Node3D).global_position); break
	check(tgt.x > 0.0, "a legal inlet of the mixer is lit")
	motion(tgt); await frames(2); mouse(tgt, false); await frames(4)
	check(((app.b.q("plant") as Dictionary).streams as Array).size() == 1, "releasing on the inlet connects the pipe (drag)")
	# exchanger ports are tagged permanently
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(2)
	app.b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
	var hx: Dictionary = app.b.act("placeUnit", ["hx", 6, 6, 0]); app.game_on_changed(); await frames(3)
	check(bool(hx.get("ok", false)), "an exchanger is placed in the sandbox: %s" % str(hx))
	var m: UnitModel = w.unit_node(str(hx.get("id", "")))
	var caps: Array = []
	if m != null: for c in m.get_children(): if c is Label3D: caps.append((c as Label3D).text)
	check(caps.has("HOT IN") and caps.has("HOT OUT") and caps.has("COLD IN") and caps.has("COLD OUT"), "the exchanger carries HOT IN/OUT, COLD IN/OUT tags: %s" % str(caps))

# board levels: a scene each; the camera frames every pre-placed unit
func _boards() -> void:
	for lid in ["L33", "L34", "L35", "L36", "L37", "L38", "CAREER"]:
		await level(lid); await frames(3)
		check(app.plant_world.deco_level() == lid and app.plant_world._deco.get_child_count() > 3, "%s shows a display scene (%d parts)" % [lid, app.plant_world._deco.get_child_count() if app.plant_world._deco != null else 0])
	await level("L25"); await frames(6)
	var w: PlantWorld = app.plant_world
	var ch_h: float = app.chrome.console_height()
	var ok := true
	for id in w.unit_ids():
		var p: Vector2 = w.unit_screen_pos(str(id))
		if p.x < 0.0 or p.x > 1920.0 or p.y < 40.0 or p.y > 1080.0 - ch_h: ok = false; print("  off-screen: ", id, p)
	check(ok and w.unit_ids().size() >= 1, "L25: every pre-placed unit is on screen above the console")

func _misc() -> void:
	# keypad range: absurd bounds show only the unit
	var d: Dictionary = Knob.keypad(app, "X", "%", "1", 0.0, 1.0e9, func(_v: float): pass); await frames(2)
	var found := ""
	for l in (d.host as Node).find_children("*", "Label", true, false): if (l as Label).text.begins_with("in ") or (l as Label).text.contains(" to "): found = (l as Label).text
	check(found == "in %", "an absurd range shows just the unit (%s)" % found)
	(d.host as Node).queue_free(); await frames(2)
	var d2: Dictionary = Knob.keypad(app, "X", "bar", "1", 1.0, 400.0, func(_v: float): pass); await frames(2)
	found = ""
	for l in (d2.host as Node).find_children("*", "Label", true, false): if (l as Label).text.contains(" to "): found = (l as Label).text
	check(found == "1 to 400 bar", "a sensible range keeps its bounds and unit (%s)" % found)
	(d2.host as Node).queue_free(); await frames(2)
	# the Semenov axis: a degenerate curve draws nothing instead of a vertical line
	var sv := SemenovView.new()
	sv.set_data({"T": [300.0, 300.0], "G": [0.0, 0.0], "R": [0.0, 0.0], "states": [], "op": {"T": 0.0}})
	check(not sv.has_reading(), "a degenerate Semenov curve is not drawn")
	sv.set_data({"T": [300.0, 400.0, 500.0], "G": [10.0, 5000.0, 90000.0], "R": [0.0, 20000.0, 40000.0], "states": [], "op": {"T": 400.0}})
	check(sv.has_reading(), "a real curve is drawn")
	sv.free()
	# the heat ledger stays away until something is placed
	await level("L07"); await frames(4)
	check(not app.bay.visible, "L07: no empty heat ledger before anything is placed")
	# Nixie honesty
	var cp := ControlPanel.new(); cp.nix.set_data({"label": "cost", "value": 100.0, "unit": "USD/yr", "star3": 200.0}); cp.nix.goals_ok = false
	check(cp.nix.m.value == 100.0 and not cp.nix.goals_ok, "the Nixie keeps goals_ok false until the goals are met")
	cp.free()
