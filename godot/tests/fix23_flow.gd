extends SceneTree
## F23 (round 8, truth): the coach steps follow the plant (L10-L13), the L11 prune trap, a compressor card says power IN, the Equilibrium Window states its pressure, the flask's
## fixed-pressure knob reads OFF at 0, the L13 staircase is not a spoiler, L02 has no TANK tile, Esc drops the build tool and the tile does not look chosen, F frames the equipment,
## a new intercom line starts at its first word.
## Run: godot --headless --path godot --script res://tests/fix23_flow.gd     Prints FIX23-FLOW OK / FIX23-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func clear_modals() -> void:
	for n in app.root.get_children(): if n.has_meta("cb_modal"): n.queue_free()
	app.end_ui = null; await frames(3)
func level(id: String) -> void:
	await clear_modals()
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); await frames(2); return r
func li() -> Dictionary: return app.b.q("levelInfo")
func ic() -> Intercom: return app.chrome.intercom
func key(code: int) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.pressed = true; Input.parse_input_event(e); await frames(2)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r); await frames(2)
func coach_text() -> String:
	var c = li().get("coach")
	return str(c.text) if c is Dictionary else ""

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	await _l10()
	await _l11()
	await _l12_l13()
	await _l14()
	await _l02_rack()
	await _esc_and_camera()
	await _intercom()
	print("FIX23-FLOW checks=%d" % checks)
	print("FIX23-FLOW OK" if fails == 0 else "FIX23-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _l10() -> void:
	await level("L10")
	var acts := [["placeUnit", ["compressor", 8, 2, 0]], ["placeUnit", ["eq_reactor", 12, 0, 0]], ["placeUnit", ["nh3_sep", 17, 0, 0]], ["placeUnit", ["product", 21, 0, 0]], ["placeUnit", ["vent", 21, 4, 0]],
		["setParam", ["K-102", "P", 3.0e6]], ["setParam", ["K-102", "stages", 1]], ["setParam", ["R-103", "T", 723.15]]]
	for a in acts: await act(a[0], a[1])
	check(coach_text().contains("Pipe it"), "L10: all placed but not piped: the coach says pipe (%s)" % coach_text())
	for a in [["connect", ["F-101", "out", "K-102", "in"]], ["connect", ["K-102", "out", "R-103", "in"]], ["connect", ["R-103", "out", "D-104", "in"]], ["connect", ["D-104", "liq", "T-105", "in"]], ["connect", ["D-104", "vap", "Y-106", "in"]]]:
		await act(a[0], a[1])
	check(coach_text().begins_with("Commission"), "L10: piped: the coach says commission now (%s)" % coach_text())
	await act("commission", []); await frames(3)
	var fp := Faceplate.open(app, "K-102"); await frames(4)
	var d: Dictionary = fp.readouts.get("duty", {})
	check(not d.is_empty() and float(d.si) > 0.0 and str(d.cap).to_upper().contains("POWER IN"), "L10: the compressor card shows positive power in (%s)" % str(d))
	check(absf(float(d.get("si", 0.0))) > 1.0, "L10: a running compressor never reads 0.000 kW")
	Faceplate.close_all(); await frames(2)
	var w: Dictionary = app.b.q("eqBeam", ["R-103"])
	check(w.has("pBar") and float(w.pBar) > 20.0, "L10: the Equilibrium Window data says the pressure of its curve (%s bar)" % str(w.get("pBar")))
	check(not coach_text().contains("changed design") and not str(li().get("runLine", "") if li().get("runLine") != null else "").contains("changed design"), "L10: no 'changed design' on the first run")

func _l11() -> void:
	await level("L11")
	check(coach_text().contains("Set the flow"), "L11: start: pick the gas (%s)" % coach_text())
	await act("placeUnit", ["mixer3", 4, 2, 0])
	await act("connect", ["F-101", "out", "M-104", "in1"])
	var r: Dictionary = await act("commission", [])
	check(not bool(r.get("ok", true)), "L11: an unpiped mixer inlet refuses the commission")
	check(str(r.get("message", "")).contains("Every mixer inlet needs a pipe"), "L11: the message names the rule (%s)" % str(r.get("message", "")))
	var strays = app.b.q("strayUnits")
	check(strays is Array and (strays as Array).is_empty(), "L11: the contract feeds are not offered for deletion (%s)" % str(strays))
	var before: int = (app.b.q("plant") as Dictionary).units.size()
	await app.chrome.turn_key(true); await frames(3)
	var offered := false
	for l in ic().lines: if str(l.get("action_label", "")) == "Delete all unconnected" or l.has("action"): offered = true
	check(not offered, "L11: no 'Delete all unconnected' key is offered")
	check((app.b.q("plant") as Dictionary).units.size() == before, "L11: nothing was deleted")
	var codes := 0
	check(not coach_text().begins_with("Commission and read the ammonia formed") or ((app.b.q("plant") as Dictionary).streams.size() >= 8), "L11: the commission step waits for the pipes (%s)" % coach_text())

func _l12_l13() -> void:
	await level("L13")
	check(not coach_text().contains("Commission"), "L13: the commission step is not first (%s)" % coach_text())
	var xt: Dictionary = app.b.q("xtDiagram")
	check((xt.beds as Array).is_empty(), "L13: no staircase before the first commission (no bed 3 conversion)")
	check(app.bay == null or not app.bay.visible or app.bay.kind != "xt", "L13: no blank X-T slab over the plot")
	var n13 := str((app.b.q("levelInfo") as Dictionary).get("title", ""))
	var notes = li().get("note", [])
	var said := false
	for t in notes: if str(t).contains("absorber"): said = true
	check(said, "L13: the notebook says the acid tank is the absorber")

func _l14() -> void:
	await level("L14")
	var fl := ""
	for u in (app.b.q("plant") as Dictionary).units: if str(u.type) == "lab_flask": fl = str(u.id)
	var fp := Faceplate.open(app, fl); await frames(4)
	var kn: Knob = fp.knobs.get("Pfix")
	check(kn != null and kn.value_text() == "off", "L14: the fixed-pressure knob reads off at 0, not 0.000 bar(a) (%s)" % (kn.value_text() if kn != null else "no knob"))
	check(kn != null and kn.label.length() < 30, "L14: the knob caption is short enough not to clip (%s)" % (kn.label if kn != null else ""))
	Faceplate.close_all(); await frames(2)
	await act("callIt", [1.0])
	await act("setParam", [fl, "V", 0.0005]); await act("commission", [])
	var gauge := ""
	for a in li().annunciators: if str(a.key) == "gauge": gauge = str(a.state)
	check(gauge == "off", "L14: no GAUGE OFF BOOK alarm during a deliberate halved-volume test (%s)" % gauge)

func _l02_rack() -> void:
	await level("L02")
	var rack: PartsRack = app.chrome.rack_slot.get_child(0)
	var tank := false
	for t in rack.tiles: if str(t.type) == "product": tank = true
	check(not tank, "L02: no TANK tile (All 0 placed at $1)")

func _esc_and_camera() -> void:
	await level("L11")
	var rack: PartsRack = app.chrome.rack_slot.get_child(0)
	rack.pick("mixer3"); await frames(3)
	check(app.world.placing == "mixer3", "a rack tile in hand")
	await key(KEY_ESCAPE)
	check(app.world.placing == "" and app.menu_ui == null, "Esc drops the build tool, no pause menu")
	for t in rack.tiles: check(not (t as Control).has_focus(), "the tile no longer keeps a chosen-looking focus (%s)" % str(t.type))
	# F frames the equipment placed (not the plot)
	await act("placeUnit", ["compressor", 20, 10, 0]); await act("placeUnit", ["eq_reactor", 26, 10, 0]); await act("placeUnit", ["nh3_sep", 32, 10, 0]); await frames(3)
	app.world.cam_rig.look_at_ground(Vector3(-30, 0, 30)); app.world.cam_rig.set_size(90.0); app.world.cam_rig.snap(); await frames(3)
	await key(KEY_F); await frames(30)
	var tgt: Vector3 = app.world.cam_rig.pan_target()
	var u0: Vector3 = app.world.tile_to_world(Vector2i(26, 10), Vector2i(2, 2))
	check(tgt.distance_to(Vector3(-30, 0, 30)) > 15.0 and tgt.distance_to(u0) < 40.0, "F frames the equipment placed (pan %s, unit at %s)" % [str(tgt), str(u0)])
	check(app.world.cam_rig.ortho_size() < 80.0, "F zooms in to the equipment (%.1f)" % app.world.cam_rig.ortho_size())

func _intercom() -> void:
	await level("L12")
	var long := "One. Two sentences of text. " .repeat(12) + "The very end."
	ic().say("MARA", "First short line.", "info"); await frames(2)
	ic().say("MARA", long, "info"); ic().chars = 1.0e6; ic()._show_last(); await frames(3)
	var t: Label = ic()._text
	check(t.lines_skipped == 0, "a new long intercom line starts at its first word (skipped %d lines)" % t.lines_skipped)
