extends SceneTree
## Fix batch F1 (chapter-1 playtest, front-end): shift set points through the faceplate, auto 1x on a shift, cylinder-bank faceplates, keypad keys, the Esc order,
## the stream tag, port pips, intercom reset, docked plates, the Works map numbering, the router skirt, and faceplate flow truth across the L00 trip.
## Run: godot --headless --path godot --script res://tests/fix1_flow.gd     Prints FIX1-FLOW OK / FIX1-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func key(code: int, uni := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = uni; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r)

func click_at(p: Vector2) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r)

func knob_value(unit: String, k: String) -> float:
	for kk in app.b.q("unitCard", [unit]).knobs: if kk.key == k: return float(kk.value)
	return NAN

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	print("viewport ", root.get_visible_rect().size, " layout ", CbLayout.kind)
	await _l00()
	await _keypad_and_esc()
	await _bank()
	await _misc()
	_router()
	print("FIX1-FLOW checks=%d" % checks)
	print("FIX1-FLOW OK" if fails == 0 else "FIX1-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# 1, 2, 9: L00 opens in a running shift; the faceplate knob is a set point; flow readouts stay the engine's across the trip
func _l00() -> void:
	app.start_level("L00", true); await frames(4)
	var li: Dictionary = app.b.q("levelInfo")
	check(str(li.phase) == "shift", "L00 opens in a shift")
	check(app.speed == 1 and app.chrome.keys.speed_pos == 1, "a level that opens in a shift starts at 1x (speed %d)" % app.speed)
	var hub = Faceplate.attach(app)
	var fp := Faceplate.open(app, "C-105"); await frames(2)
	check(fp.knobs.has("T"), "the cooler has a T knob")
	var t0 := knob_value("C-105", "T")
	var s_before: Dictionary = {}
	for r in app.b.q("streamTable", [{}]).rows: if str(r.id) == "S-118": s_before = r
	var kn: Knob = fp.knobs.T
	var target_disp := EqFmt.to_disp(t0, "degC") + (EqFmt.to_disp(float(kn.hi), "") - 0.0) * 0.0 - 40.0
	check(target_disp > kn.lo, "the target is inside the knob range")
	kn.set_value(target_disp); kn.committed.emit(target_disp); await frames(2)
	check(fp._cmd.has("T"), "a shift commit records the ramp target")
	check(is_equal_approx(fp._pv.sp, target_disp), "the PV bar's SP marker shows the ramp target (%f vs %f)" % [fp._pv.sp, target_disp])
	check(is_equal_approx(kn.value, target_disp), "the knob holds at its target while the plant ramps")
	app.b.act("tick", [10]); await frames(2)
	var t1 := knob_value("C-105", "T")
	check(t1 < t0 - 0.5, "the engine's cooler T falls after the set point (%f -> %f K)" % [t0, t1])
	var s_after: Dictionary = {}
	for r in app.b.q("streamTable", [{}]).rows: if str(r.id) == "S-118": s_after = r
	check(float(s_after.T) < float(s_before.T) - 0.5, "the converter outlet falls (%f -> %f K)" % [s_before.T, s_after.T])
	check(not str(app.b.q("levelInfo").phase) == "design", "still a shift")
	fp.close()
	# flow truth across the trip: the readout always equals the engine's value x 3.6 (the 1000x jump is the engine's 0.1 % residual flow after the feed is cut)
	var fr := Faceplate.open(app, "R-106"); await frames(2)
	var seen: Array = []
	for i in 30:
		app.b.act("tick", [4]); await frames(1)
		var row: Dictionary = {}
		for r in app.b.q("streamTable", [{}]).rows: if str(r.id) == "S-118": row = r
		if row.is_empty(): continue
		var want := float(row.flow) * 3.6
		var txt: String = fr.readouts.flow.text
		var d := txt.replace(",", "").to_float()
		check(absf(d - want) <= (0.5 if want >= 100.0 else 0.0051 if want >= 1.0 else 0.00051) + 1e-9, "R-106 flow readout %s == engine %f kmol/h at tick %s" % [txt, want, app.b.g.tick])
		seen.append(want)
	check(seen.size() > 10 and seen.max() / maxf(seen.min(), 1e-9) > 100.0, "the trip really cuts the flow by orders of magnitude in the engine (%f -> %f)" % [seen.max(), seen.min()])
	fr.close()
	await _docking()

# 11: plates dock to the right edge above the console, off the unit
func _docking() -> void:
	var a := Faceplate.open(app, "R-106"); var b := Faceplate.open(app, "C-105"); await frames(3)
	var vr := root.get_visible_rect().size
	var ch: float = app.chrome.console_height()
	for fp in [a, b]:
		var r := Rect2(fp.position, fp.size)
		check(r.end.x <= vr.x - 8.0 + 0.5 and r.end.y <= vr.y - ch + 0.5, "plate %s is on screen above the console (%s)" % [fp.unit_id, str(r)])
		check(r.position.x > vr.x * 0.4, "plate %s is docked on the right half" % fp.unit_id)
	check(not Rect2(a.position, a.size).intersects(Rect2(b.position, b.size)), "two docked plates do not overlap")
	Faceplate.close_all(); await frames(2)

# 4, 5, 6: keypad keys, Esc order, stream tag
func _keypad_and_esc() -> void:
	var got := []
	var d := Knob.keypad(app, "TEST KNOB", "kg/h", "12", 0.0, 100.0, func(v: float): got.append(v))
	await frames(2)
	check(app.modal() != null and app.modal().name == "keypad", "keypad is the topmost modal")
	key(KEY_4, 0); key(KEY_PERIOD, 0); key(KEY_5, 0); key(KEY_BACKSPACE); key(KEY_7, 0)   # 4 . 5 <back> 7 -> "4.7"
	await frames(2)
	var shown := ""
	for l in d.host.find_children("*", "Label", true, false): if (l as Label).text.begins_with("4"): shown = (l as Label).text
	check(shown.begins_with("4.7"), "keypad accepts digits, '.', Backspace from the keyboard (shows '%s')" % shown)
	key(KEY_ENTER); await frames(3)
	check(got.size() == 1 and absf(float(got[0]) - 4.7) < 1e-9, "Enter commits the typed value (%s)" % str(got))
	check(app.modal() == null, "Enter closes the keypad")
	var got2 := []
	var d2 := Knob.keypad(app, "TEST KNOB", "kg/h", "12", 0.0, 100.0, func(v: float): got2.append(v)); await frames(2)
	key(KEY_9, 0); key(KEY_MINUS, 45); await frames(2)
	key(KEY_ESCAPE); await frames(3)
	check(got2.is_empty() and app.modal() == null, "Esc closes the keypad without committing")
	check(app.menu_ui == null, "...and does not open the pause plate")
	# Esc clears everything in one press: stream tag + pipe highlight, faceplates + selection, placement ghost, half-made pipe; only then the pause plate
	app.start_level("L00", true); await frames(4)
	var hub = Faceplate.attach(app)
	var w: PlantWorld = app.plant_world
	w.select("C-105"); w.unit_clicked.emit("C-105"); await frames(2)
	check(Faceplate.plates.size() == 1 and w.selected_id == "C-105", "a unit is selected with its faceplate")
	var tag: StreamTag = StreamTag.attach(app)
	tag._pin_t = 5.0; tag.show_for("S-118", Vector2(400, 300)); await frames(1)
	w.pipes.select("S-118")
	w.begin_place("heater")
	hub.from_unit = "C-105"; hub.from_port = "out"; hub.from_inlet = false
	check(tag.visible and w.placing != "" and w.pipes.selected != "", "tag, pipe highlight, selection, ghost and a half-made pipe are all up")
	key(KEY_ESCAPE); await frames(3)
	check(not tag.visible and w.pipes.selected == "" and Faceplate.plates.is_empty() and w.selected_id == "" and w.placing == "" and hub.from_unit == "" and app.menu_ui == null, "Esc 1 clears everything and the pause plate stays shut")
	key(KEY_ESCAPE); await frames(3)
	check(app.menu_ui != null, "Esc 2: only then the pause plate opens")
	key(KEY_ESCAPE); await frames(3)
	check(app.menu_ui == null, "Esc closes the pause plate")
	# the stream tag: never blocks, closes on any click or drag elsewhere
	tag._pin_t = 5.0; tag.show_for("S-118", Vector2(400, 300)); await frames(1)
	var blockers := 0
	for c in tag.find_children("*", "Control", true, false): if (c as Control).mouse_filter == Control.MOUSE_FILTER_STOP and c.name != "Close" and c.name != "Trash" and not (c.get_parent() is Button): blockers += 1
	check(tag.mouse_filter == Control.MOUSE_FILTER_IGNORE and blockers == 0, "the stream tag takes no mouse except its close button (%d blockers)" % blockers)
	click_at(Vector2(60, 200)); await frames(2)
	check(not tag.visible, "a click elsewhere closes the pinned tag")
	tag._pin_t = 5.0; tag.show_for("S-118", Vector2(400, 300)); await frames(1)
	var mm := InputEventMouseMotion.new(); mm.position = Vector2(100, 100); mm.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(mm); await frames(2)
	check(not tag.visible, "a drag elsewhere closes the tag")

# 3: cylinder-bank faceplate (L01 / L04), masked and carried contents
func _bank() -> void:
	app.start_level("L01", true); await frames(4)
	Faceplate.li_extra = {"bankSpecies": ["N2", "H2"]}
	var hub = Faceplate.attach(app)
	var f: Dictionary = app.b.act("placeUnit", ["feed", 0, 0, 0]); check(bool(f.ok), "feed placed")
	var set1: Dictionary = app.b.act("setBank", [f.id, "N2", 140.0]); check(bool(set1.ok), "bank set: %s" % str(set1.get("message", "")))
	var fp := Faceplate.open(app, str(f.id)); await frames(2)
	check(fp._bank and fp._chips.has("N2") and fp._chips.has("H2"), "a bank faceplate has species chips")
	check(fp._chips.N2.text == "N₂" and fp._chips.H2.text == "H₂", "chips are written with subscripts")
	check(fp._chips.N2.button_pressed and not fp._chips.H2.button_pressed, "the carried species chip is lit")
	check(fp.knobs.has("bank") and fp.knobs.size() == 1 and fp.knobs.bank.unit == "kg/h", "one knob, in kg/h")
	check(absf(fp.knobs.bank.value - 140.0) < 0.01, "the knob shows the engine's kg/h (%f)" % fp.knobs.bank.value)
	var be: Dictionary = {}
	for b in app.b.q("levelInfo").banks: if str(b.unit) == str(f.id): be = b
	check(fp._kmol_lbl.text == "= " + PaperStrings.num(float(be.kmolPerH)) + " kmol/h", "the kmol/h readout is the engine's (%s)" % fp._kmol_lbl.text)
	check(absf(float(be.kmolPerH) - 140.0 / 28.0134) < 0.02, "and 140 kg/h of N2 is 5 kmol/h (%f)" % float(be.kmolPerH))
	check(fp._carry_lbl.text == "NITROGEN", "the faceplate says what the feed carries (%s)" % fp._carry_lbl.text)
	var tagtxt := ""
	for l in fp.find_children("*", "Label", true, false): tagtxt += (l as Label).text + "|"
	check(tagtxt.contains("N₂ BANK") or tagtxt.to_upper().contains("N₂ BANK"), "the Dymo name is the bank (%s)" % tagtxt)
	fp.knobs.bank.set_value(77.0); fp.knobs.bank.committed.emit(77.0); await frames(2)
	be = {}
	for b in app.b.q("levelInfo").banks: if str(b.unit) == str(f.id): be = b
	check(absf(float(be.kgPerH) - 77.0) < 1e-6 and str(be.species) == "N2", "turning the knob calls setBank in kg/h (%f)" % float(be.kgPerH))
	fp._chips.H2.pressed.emit(); await frames(2)
	be = {}
	for b in app.b.q("levelInfo").banks: if str(b.unit) == str(f.id): be = b
	check(str(be.species) == "H2" and absf(float(be.kgPerH) - 77.0) < 1e-6, "the H2 chip switches the species at the same kg/h (%s %f)" % [be.species, float(be.kgPerH)])
	check(fp._chips.H2.button_pressed and not fp._chips.N2.button_pressed, "and lights")
	check(fp._carry_lbl.text == "HYDROGEN", "the carries line follows (%s)" % fp._carry_lbl.text)
	fp.close()
	Faceplate.li_extra = {"masked": [str(f.id)]}
	var fm := Faceplate.open(app, str(f.id)); await frames(2)
	check(fm._carry_lbl.text == "FUEL · unknown", "a masked feed reads FUEL · unknown (%s)" % fm._carry_lbl.text)
	fm.close(); Faceplate.li_extra = {}
	# what feeds carry
	check(EqStrings.carries(["N2", "H2", "S"], [0, 0, 1.0]) == "SULFUR", "pure sulfur bank")
	check(EqStrings.carries(["O2", "N2", "Ar"], [0.21, 0.78, 0.01]) == "AIR (O₂ 21 %)", "air")
	check(EqStrings.formula("NH3") == "NH₃" and EqStrings.formula("H2SO4") == "H₂SO₄" and EqStrings.formula("Ar") == "Ar", "formula subscripts")

# 7, 8, ports, intercom, Works map
func _misc() -> void:
	# ports: pips with caps on a selected separator
	app.start_level("L01", true); await frames(4)
	var hub = Faceplate.attach(app)
	var sep: Dictionary = app.b.act("placeUnit", ["nh3_sep", 6, 4, 0]); check(bool(sep.ok), "separator placed")
	await frames(2)
	var w: PlantWorld = app.plant_world
	w.select(str(sep.id)); w.unit_clicked.emit(str(sep.id)); await frames(2)
	var caps := {}
	for m in w._marks: caps[str(m.port)] = str(m.get("label", ""))
	check(caps.get("vap", "") == "V" and caps.get("liq", "") == "L" and caps.get("in", "") == "IN", "a selected separator shows IN / V / L pips (%s)" % str(caps))
	var n3d := 0
	for n in w._mark_nodes: for c in (n as Node).get_children(): if c is Label3D: n3d += 1
	check(n3d == w._marks.size() and n3d >= 3, "every pip carries its cap label (%d)" % n3d)
	w.select(""); w.unit_clicked.emit(""); await frames(2)
	check(w._marks.is_empty(), "no selection, no hover: no pips")
	w.unit_hover.emit(str(sep.id)); await frames(2)
	check(w._marks.size() >= 3, "hovering a unit lights its free ports")
	w.unit_hover.emit(""); await frames(2)
	check(w._marks.is_empty(), "leaving it puts them out")
	check(Faceplate.Hub.cap("out", false) == "OUT" and Faceplate.Hub.cap("in2", true) == "IN2", "port caps from engine port names")
	# the intercom clears on a level change
	app.chrome.intercom.say("MARA", "Stale coach line from the last job.", "coach", "x1", "")
	app.start_level("L02", true); await frames(4)
	var stale := false
	for l in app.chrome.intercom.lines: if str(l.text).begins_with("Stale"): stale = true
	check(not stale and not app.chrome.intercom.shown_text().begins_with("Stale"), "the intercom is cleared on a level change")
	# the Works map numbers levels by engine id
	WorksMap.open(app); await frames(3)
	var lm := app.root.get_node_or_null("levels")
	check(lm != null, "the Works map opens")
	var b0 := lm.find_child("Level_L00", true, false) as Button
	check(b0 != null and b0.text.begins_with("00 · "), "L00 is numbered 00 (%s)" % (b0.text if b0 else "-"))
	check(lm.find_child("Level_L04", true, false) != null and (lm.find_child("Level_L04", true, false) as Button).text.begins_with("04 · "), "L04 is numbered 04")
	app.back(); await frames(2)
	check(CbSmoke.small_fonts(app.root) == 0, "no text below the minimum size")

# 10: the router keeps a tile off every footprint and does not give up when a stub lands inside one
func _router() -> void:
	var r := PipeRouter.new(24, 16)
	r.block_rect(6, 4, 3, 3); r.block_rect(14, 4, 3, 3)
	var path := r.route(Vector2i(4, 5), 0, Vector2i(18, 5), 0)
	check(not path.is_empty(), "a route exists between two units")
	var hit := false
	for i in range(path.size() - 1):
		var p := path[i]; var q := path[i + 1]; var st := Vector2i(signi(q.x - p.x), signi(q.y - p.y)); var c := p
		while true:
			if r.blocked.has(c): hit = true
			if c == q: break
			c += st
	check(not hit, "no pipe tile is inside a unit footprint")
	var near := false
	for i in range(path.size() - 1):
		var p := path[i]; var q := path[i + 1]; var st := Vector2i(signi(q.x - p.x), signi(q.y - p.y)); var c := p
		while true:
			if r.skirt.has(c) and c != path[0] and c != path[-1]: near = true
			if c == q: break
			c += st
	check(not near, "the pipe keeps a free tile off the footprints where it can")
	var r2 := PipeRouter.new(24, 16)
	r2.block_rect(6, 4, 3, 3)
	var p2 := r2.route(Vector2i(7, 5), 0, Vector2i(20, 5), 0)   # the start stub is inside the footprint
	check(not p2.is_empty() and not r2.blocked.has(p2[0]), "a stub inside a footprint starts from the nearest free tile")
