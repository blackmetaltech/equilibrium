extends SceneTree
## Fix batch F7 (wiring the F6a engine data): knob.disp numbers + unit labels on faceplates, annunciators.lit, L33 scenario strip, Career monthNow / log stamp,
## L37 node colours, picker optionLabels, unitCard.live, predictNote.  Run: godot --headless --path godot --script res://tests/fix7_flow.gd
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
func knob_of(fp: Faceplate, unit_pref: String) -> Knob:
	for k in fp.knobs:
		var sp: Dictionary = (fp.knobs[k] as Knob).get_meta("spec")
		if str(sp.get("unit", "")) == unit_pref: return fp.knobs[k]
	return null

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _knobs(); await _views()
	print("FIX7-FLOW checks=%d" % checks)
	print("FIX7-FLOW OK" if fails == 0 else "FIX7-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _plate(type: String, x := 8, y := 2) -> Faceplate:
	var r: Dictionary = app.b.act("placeUnit", [type, x, y, 0]); app.game_on_changed(); await frames(2)
	if not bool(r.get("ok", false)): print("place ", type, " ", r); return null
	Faceplate.attach(app)
	var fp: Faceplate = Faceplate.open(app, str(r.id)); await frames(5)
	return fp

func _knobs() -> void:
	await level("L10")
	var fp: Faceplate = await _plate("compressor")
	check(fp != null, "L10 compressor placed")
	if fp != null:
		var kn := knob_of(fp, "bar")
		check(kn != null and kn.unit == "bar(a)", "the compressor pressure knob is labelled bar(a): %s" % (kn.unit if kn != null else "none"))
		check(kn != null and kn.value > 0.5 and kn.value < 100.0, "the L10 compressor shows bar, not Pa: %f" % (kn.value if kn != null else -1.0))
		if kn != null:   # typing 25 bar sends 2.5 MPa back through setParam
			kn.set_value(25.0); kn.committed.emit(25.0); await frames(2)
			var c = app.b.q("unitCard", [fp.unit_id])
			var pv := 0.0
			for k in c.knobs: if str(k.unit) == "bar": pv = float(k.value)
			check(absf(pv - 2.5e6) < 1.0, "25 bar goes back as 2.5e6 Pa: %f" % pv)
			check(absf(kn.value - 25.0) < 0.01, "the knob reads 25 bar(a) after the round trip: %f" % kn.value)
	await level("L14")
	var f2: Faceplate = null
	for u in app.b.q("plant").units: if str(u.type) == "lab_flask": Faceplate.attach(app); f2 = Faceplate.open(app, str(u.id))
	await frames(5)
	check(f2 != null, "L14 has its flask")
	if f2 != null:
		var kv := knob_of(f2, "L")
		check(kv != null and kv.unit == "L" and kv.value >= 0.01 and kv.value <= 1000.0, "the L14 flask volume is in litres: %s" % ("%f %s" % [kv.value, kv.unit] if kv != null else "none"))
	await level("L24")
	var seen := false
	for u in app.b.q("plant").units:
		var cd = app.b.q("unitCard", [str(u.id)])
		for k in cd.knobs:
			if str(k.get("unitLabel", "")) == "bar(a)" or (str(k.key).to_lower().contains("relief") or str(k.key) == "Pset"):
				seen = true; check(k.has("disp") and float(k.disp.value) > 0.5 and float(k.disp.value) < 100.0, "L24 %s knob is in bar: %s" % [k.key, str(k.get("disp"))])
	check(seen, "L24 has a pressure knob")
	check(EqFmt.to_disp(0.001, "L") == 1.0 and EqFmt.to_si(1.0, "L") == 0.001, "EqFmt knows litres")
	await level("L05")
	var f3: Faceplate = await _plate("boiler")
	if f3 != null:
		var txt := ""
		for key in f3.pickers: for o in f3.pickers[key]: txt += (f3.pickers[key][o] as Button).text + "|"
		check(txt.contains("bar"), "boiler options carry their pressure: %s" % txt)

func _views() -> void:
	# annunciators: lit only when the engine says so; a healthy window is dark
	var an: Annunciator = Annunciator.new(); root.add_child(an)
	an.set_windows([{"key": "a", "legend": "A", "state": "high", "lit": false}, {"key": "b", "legend": "B", "state": "high", "lit": true}, {"key": "c", "legend": "C", "state": "normal", "lit": false}])
	check(an.wins[0].state == "normal" and an.wins[1].state == "high" and an.wins[2].state == "normal", "an unlit window never draws lit")
	an.queue_free()
	# L33 scenarios
	await level("L33"); app.lvbay.refresh(true); await frames(3)
	var p: ControlPanel = app.lvbay.panel
	var view: Dictionary = p.view.duplicate(true)
	view["scenarios"] = [{"name": "Cooling lost", "id": "x", "sensors": [{"id": "A", "reading": 80.0, "failed": false}, {"id": "B", "reading": 0.0, "failed": true}, {"id": "C", "reading": 81.0, "failed": false}], "votes": 2, "need": 2, "tripped": true, "trippedAt": 42.0, "outcome": "Saved"}, {"name": "Sensor noise", "id": "y", "sensors": [{"id": "A", "reading": 70.0, "failed": false}], "votes": 0, "need": 2, "tripped": false, "trippedAt": -1.0, "outcome": "Fine"}]
	p.set_view(view); await frames(3)
	check(p._scen.visible and p._scen.get_child_count() == 3, "the scenario strip has a title and one row per scenario: %d" % p._scen.get_child_count())
	var real = app.b.q("levelView")
	check(real is Dictionary and real.has("scenarios") and real.has("tripAt"), "the engine's L33 view carries scenarios and tripAt")
	# Career
	await level("CAREER"); app.lvbay.refresh(true); await frames(3)
	var cb = app.lvbay.panel
	check(cb is CareerBoard, "L38 shows the career board")
	# predictNote on the notebook
	await level("L06"); Notebook.open(app); await frames(4)
	var li = app.b.q("levelInfo")
	check(li.get("predictNote") != null, "levelInfo.predictNote exists on a call-it level")
	check(app.root.find_child("PredictNote", true, false) != null, "the notebook prints the predict note on the call-it row")
	Notebook.close(app)
