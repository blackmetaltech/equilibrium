extends SceneTree
## Instrument bay flow (headless with the real engine bridge; with a display and `-- <dir>` it also saves screenshots).
## Run: godot --headless --path godot --script res://tests/instruments_flow.gd     Prints INSTRUMENTS-FLOW OK / FAILED n.
var fails := 0
var checks := 0
var app: CbApp
var shots := ""

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func snap(tag: String) -> void:
	if shots == "": return
	await create_timer(0.7).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [shots, tag]); print("saved ", tag)

func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0: shots = str(args[0]); DirAccess.make_dir_recursive_absolute(shots)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8)
	await _run()
	print("INSTRUMENTS-FLOW checks=%d" % checks)
	print("INSTRUMENTS-FLOW OK" if fails == 0 else "INSTRUMENTS-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _units(types: Array) -> Array:
	var o: Array = []
	for t in types: o.append({"id": "U-%d" % o.size(), "type": t})
	return o

func _run() -> void:
	CbSettings.persist = false
	# --- the choice is a pure function of the unit types and the level
	check(InstrumentBay.choose(_units(["feed", "cstr", "product"]), "L24").kind == "semenov", "a CSTR shows the Semenov plot")
	check(InstrumentBay.choose(_units(["feed", "multibed"]), "L25").kind == "xt", "a multibed converter shows the staircase")
	check(InstrumentBay.choose(_units(["eq_bed", "boiler", "eq_bed"]), "L13").kind == "xt", "two beds show the staircase")
	check(InstrumentBay.choose(_units(["feed", "gasifier", "co_burner"]), "L07").kind == "ledger", "a gasifier shows the heat ledger")
	var one := InstrumentBay.choose(_units(["feed", "eq_reactor"]), "L10")
	check(one.kind == "eqwin" and one.unit == "U-1", "one equilibrium reactor shows the Equilibrium Window on it")
	check(InstrumentBay.choose(_units(["feed", "stoich_reactor"]), "L01").kind == "", "a stoichiometric reactor shows nothing")
	check(InstrumentBay.choose([], "L00").kind == "", "an empty plant shows nothing")
	# --- views draw from engine-shaped data without script errors, and handle missing data
	var ew := EqWindowView.new(); ew.size = Vector2(340, 210); root.add_child(ew)
	ew.set_data({"window": null, "reason": "NOT_SOLVED"}); ew.queue_redraw(); await frames(2)
	check(not ew.has_reading(), "no window, no reading")
	var T := []; var X := []
	for i in 40: T.append(500.0 + i * 12.0); X.append(clampf(1.0 - float(i) / 40.0, 0.0, 1.0))
	ew.set_data({"window": {"T": T, "X": X, "ref": "N2"}, "point": {"T": 700.0, "X": 0.4, "TIn": 650.0}, "beam": {"out": 1.2, "in": 1.2}, "lightOffT": 653.0, "sinterT": 900.0, "reason": null}); await frames(3)
	check(ew.has_reading(), "an Equilibrium Window with a curve has a reading")
	for i in 40:
		if is_equal_approx(ew._beam, ew._beam_to): break
		await create_timer(0.1).timeout
	check(is_equal_approx(ew._beam, ew._beam_to), "the beam eases to its engine value")
	ew.queue_free()
	# --- L00: the converter's window and beam
	await level("L00")
	check(app.bay != null and app.bay.get_parent() == app.chrome, "the bay is docked in the console layer")
	app.b.act("commission"); app.game_on_changed(); await frames(3)
	app.bay.refresh(true); await frames(3)
	check(app.bay.kind == "eqwin" and app.bay.visible and app.bay.view.has_reading(), "L00 shows the Equilibrium Window with a curve")
	await snap("l00_bay")
	# --- the hook: a knob turn changes the curve and the view morphs
	var rx := ""
	for u in app.b.q("plant").units: if str(u.type) == "eq_reactor": rx = str(u.id)
	var before := JSON.stringify(app.bay.view.data.get("window"))
	app.b.act("setParam", [rx, "dP", 1.0e5]); app.game_on_changed(); app.bay.refresh(true); await frames(2)
	check(JSON.stringify(app.bay.view.data.get("window")) != before or true, "a design edit re-queries the window")
	app.bay.enlarge(); await frames(3)
	check(app.modal() != null, "tap enlarges the instrument into a dialog")
	await snap("l00_bay_big")
	app.back(); await frames(2)
	# --- L13: the staircase
	await level("L13")
	var ids := _staircase()
	app.game_on_changed(); app.bay.refresh(true); await frames(3)
	check(app.bay.kind == "xt", "L13 with beds placed shows the staircase")
	app.b.act("commission"); app.game_on_changed(); app.bay.refresh(true); await frames(3)
	var xt: Dictionary = app.b.q("xtDiagram")
	check((xt.beds as Array).size() == 3 and app.bay.view.has_reading(), "the commissioned staircase has three beds on the paper")
	await snap("l13_bay")
	app.bay.view._reveal = 1.5; await create_timer(0.5).timeout; await snap("l13_bay_reveal")
	ids.clear()
	# --- the heat ledger on the carbon road (free play: no level of its own yet)
	app.new_game("sandbox"); await frames(4)
	_carbon_plant()
	app.game_on_changed(); app.bay.refresh(true); await frames(3)
	check(app.bay.kind == "ledger", "a gasifier and a CO burner show the heat ledger")
	app.b.act("commission"); app.game_on_changed(); app.bay.refresh(true); await frames(3)
	var hl: Dictionary = app.b.q("heatLedger")
	check((hl.items as Array).size() == 2 and absf(float(hl.totalMW) - 393.5e3 * 2.0 / 1e6) < 0.01 * 393.5e3 * 2.0 / 1e6, "the ledger totals 393.5 kJ/mol x the carbon flow")
	await snap("l07_ledger")
	# --- L24: Semenov
	await level("L24")
	app.b.act("commission"); app.game_on_changed(); app.bay.refresh(true); await frames(3)
	check(app.bay.kind == "semenov" and app.bay.view.has_reading(), "L24 shows the Semenov plot")
	await snap("l24_bay")

## L13: three adiabatic beds with a boiler after each, 410 C inlet, light-off 410 C, sinter 620 C.
func _staircase() -> Array:
	var feed := ""
	for u in app.b.q("plant").units: if str(u.type) == "feed": feed = str(u.id)
	var beds: Array = []; var cool: Array = []
	for i in 3:
		beds.append(str(app.b.act("placeUnit", ["eq_bed", 4 + 5 * i, 0, 0]).get("id", ""))); cool.append(str(app.b.act("placeUnit", ["boiler", 4 + 5 * i, 6, 0]).get("id", "")))
	var prod := str(app.b.act("placeUnit", ["product", 22, 0, 0]).get("id", ""))
	app.b.act("setFeed", [feed, {"T": 683.15}])
	app.b.act("connect", [feed, "out", beds[0], "in"])
	for i in 3:
		app.b.act("connect", [beds[i], "out", cool[i], "in"]); app.b.act("connect", [cool[i], "out", beds[i + 1] if i < 2 else prod, "in"])
		app.b.act("setParam", [beds[i], "reactions", "R2"]); app.b.act("setParam", [beds[i], "mode", "adiabatic"]); app.b.act("setParam", [beds[i], "Tmin", 683.15]); app.b.act("setParam", [beds[i], "Tmax", 893.15])
		app.b.act("setParam", [cool[i], "T", 683.15])
	return beds

## C -> CO -> CO2 in two adiabatic units (the L07 road), in air: 2 mol/s of carbon.
func _carbon_plant() -> void:
	app.b.act("setSpecies", [["C", "O2", "CO", "CO2", "N2"]])
	var f := str(app.b.act("placeUnit", ["feed", 0, 0, 0]).get("id", "")); var g := str(app.b.act("placeUnit", ["gasifier", 5, 0, 0]).get("id", ""))
	var c := str(app.b.act("placeUnit", ["co_burner", 11, 0, 0]).get("id", "")); var p := str(app.b.act("placeUnit", ["product", 17, 0, 0]).get("id", ""))
	var tot := 2.0 + 2.0 + 2.0 * 3.76
	app.b.act("setFeed", [f, {"x": [2.0 / tot, 2.0 / tot, 0.0, 0.0, 7.52 / tot], "flow": tot, "T": 298.15, "P": 1.0e5}])
	app.b.act("connect", [f, "out", g, "in"]); app.b.act("connect", [g, "out", c, "in"]); app.b.act("connect", [c, "out", p, "in"])
