extends SceneTree
## Paper layer flow, headless with the real engine bridge and the real app shell: the rack lists units and places two (ghost -> placeUnit), a pipe is made
## through the piping hub (the engine flowsheet has it), the notebook opens on level start and Esc closes it, a failed run prints no histogram, a won run
## prints stamped flasks and the histogram. Prints PAPER-FLOW OK / FAILED n.
var fails := 0
var checks := 0
func check(c: bool, m: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", m)

func _initialize() -> void:
	var app: CbApp = load("res://main.gd").new(); root.add_child(app)
	for i in 40: await process_frame
	if app.b == null or not app.b.g.has("tick") and app.b.init_data.is_empty(): check(false, "engine started"); _end(); return
	app.new_game("sandbox")
	for i in 5: await process_frame
	var rack := PartsRack.build(app) as PartsRack
	var holder := PanelContainer.new(); holder.size = Vector2(1200, 130); app.root.add_child(holder); holder.add_child(rack)
	for i in 3: await process_frame
	check(app.world != null and app.world.has_method("begin_place"), "the world exists")
	check(rack.tiles.size() > 3, "the rack lists the palette (%d tiles)" % rack.tiles.size())
	# place a feed and a product from the rack
	rack.pick("feed"); check(app.world.placing == "feed", "picking a tile starts the ghost")
	check(app.world.place_at(3, 6), "the ghost accepts a free spot")
	await process_frame
	var pl: Dictionary = app.b.q("plant")
	check((pl.units as Array).size() == 1 and app.world.placing == "", "placing a feed made one unit and ended the ghost")
	rack.pick_index(rack.tiles.find_custom(func(t): return t.type == "product")); check(app.world.placing == "product", "keys 1-9 / pick_index pick too")
	app.world.place_at(9, 6); await process_frame
	pl = app.b.q("plant"); check((pl.units as Array).size() == 2, "two units placed")
	var f_id := str(pl.units[0].id); var p_id := str(pl.units[1].id)
	# a refusal goes to the intercom (toast): placing on an occupied tile
	rack.pick("feed"); var okp: bool = app.world.place_at(3, 6); check(not okp, "an occupied spot is refused by the ghost"); app.world.cancel_place()
	# pipe: outlet then inlet through the hub
	var fc: Dictionary = app.b.q("unitCard", [f_id]); var pc: Dictionary = app.b.q("unitCard", [p_id])
	var hub = Faceplate.attach(app)
	hub._on_unit(f_id)
	check(Faceplate.plates.has(f_id), "selecting a unit opens its faceplate")
	var op := str(fc.outlets[0].port); var ip := str(pc.inlets[0].port)
	hub._on_port(f_id, op, false); check(hub.from_unit == f_id and not hub.legal.is_empty(), "an outlet click lights legal inlets")
	hub._on_port(p_id, ip, true); await process_frame
	pl = app.b.q("plant"); check((pl.streams as Array).size() == 1 and pl.streams[0].from.unit == f_id and pl.streams[0].to.unit == p_id, "the engine flowsheet has the pipe")
	# the notebook: opens when a level (here a stub) starts, Esc closes it
	Notebook.stub = Notebook.stub_info(); Notebook.stub.spentUSD = 0; Notebook.stub.id = "T1"
	for i in 6: await process_frame
	var m = app.modal()
	check(m != null and m.name == "notebook", "the notebook opens on level start")
	var nb_title: Label = m.find_child("Title", true, false) if m != null else null
	check(nb_title != null and nb_title.text.contains("Moles"), "the notebook shows the level title")
	app.escape(); for i in 3: await process_frame
	check(app.modal() == null, "Esc closes the notebook")
	# the printout
	app.end_seen = false
	Printout.stub = Notebook.result_stub(false)
	check(Printout.open(app), "a failed run prints")
	for i in 3: await process_frame
	var host = app.modal()
	check(host != null and host.name == "printout", "the printout is the modal")
	check(host.find_children("Hist*", "", true, false).is_empty() and not bool(host.get_meta("has_histogram")), "no histogram on a failed run")
	check(host.find_child("Banner", true, false).text.contains("ABORTED") and host.find_child("Equation", true, false) != null, "ABORTED banner and the equation")
	app.back(); for i in 3: await process_frame
	Printout.stub = Notebook.result_stub(true)
	check(Printout.open(app), "a won run prints")
	for i in 3: await process_frame
	host = app.modal()
	check(int(host.get_meta("stamped")) >= 1 and host.find_children("Stamp_*", "", true, false).size() >= 1, "a won run has a stamped flask")
	check(not host.find_children("Hist_*", "", true, false).is_empty(), "the won run prints the histogram")
	var yous := 0
	for n in host.find_children("Hist_*", "Label", true, false): if (n as Label).text.contains("◄ YOU"): yous += 1
	check(yous == 1, "exactly one bin is marked ◄ YOU")
	app.back()
	_end()

func _end() -> void:
	print("PAPER-FLOW checks=%d" % checks)
	print("PAPER-FLOW OK" if fails == 0 else "PAPER-FLOW FAILED %d" % fails)
	quit(0 if fails == 0 else 1)
