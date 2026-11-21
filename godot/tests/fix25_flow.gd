extends SceneTree
## F25 (round 9 wiring): chained piping (a pipe dropped on an inlet carries on from that unit's next free outlet; empty ground ends it), the first part row in hand,
## repeat placement from the checklist, "same catalyst on all beds", a missed pipe click names the nearest free inlet even with a pipe's line under it, the zero-duty
## warning names the unit type. The L25 move count (parts + pipes to a fully piped plant) is counted with the real handlers: every click_at / drag below is one move.
## Run: godot --headless --path godot --script res://tests/fix25_flow.gd     Prints FIX25-FLOW OK / FIX25-FLOW FAILED n.
var fails := 0
var checks := 0
var moves := 0
var app: CbApp
var w
var hub

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func click_at(p: Vector2) -> void:
	moves += 1
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r); await frames(2)
func drag(a: Vector2, b: Vector2) -> void:
	moves += 1
	var m := InputEventMouseMotion.new(); m.position = a; m.global_position = a; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = a; e.global_position = a; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(2)
	var mm := InputEventMouseMotion.new(); mm.position = b; mm.global_position = b; mm.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(mm); await frames(2)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = b; r.global_position = b; r.pressed = false; Input.parse_input_event(r); await frames(3)
func plant() -> Dictionary: return app.b.q("plant")
func nstreams() -> int: return (plant() as Dictionary).streams.size()
func ids_of(type: String) -> Array:
	var out: Array = []
	for u in plant().units: if str(u.type) == type: out.append(str(u.id))
	return out
func pip(id: String, port: String, inlet: bool) -> Vector2: return w.port_screen(id, port, inlet)
func click_tile(type: String, x: int, y: int) -> void:
	var fp: Vector2i = w.footprint_of(type, 0)
	await click_at(w.world_to_screen(w.tile_to_world(Vector2i(x + fp.x / 2, y + fp.y / 2), Vector2i(1, 1))))   # the tile the cursor's footprint is centred on
func level(id: String) -> void:
	app.start_level(id, true); await frames(10)
	app.b.act("callIt", [1.97]); app.game_on_changed(); await frames(3)
func guide_done() -> int:
	var n := 0
	for l in (app.b.q("levelInfo") as Dictionary).buildGuide: if bool(l.done): n += 1
	return n

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _l25_budget()
	await _catalyst_all()
	await _miss_and_chain_end()
	await _zero_duty()
	print("FIX25-FLOW checks=%d moves=%d" % [checks, moves])
	print("FIX25-FLOW OK" if fails == 0 else "FIX25-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## L25 from an empty plot to a fully piped plant with the real handlers: 12 parts, 12 pipes.
func _l25_budget() -> void:
	await level("L25")
	Notebook.close(app); await frames(4)
	w = app.world; hub = app.root.get_node("PaperHub")
	w.set_camera("far"); await frames(4)
	check(w.placing == "packed_bed", "the first part row is in hand when the level opens (%s)" % w.placing)
	moves = 0
	var spots := [["packed_bed", 2, 0], ["cooler", 6, 0], ["packed_bed", 8, 0], ["cooler", 12, 0], ["packed_bed", 14, 0], ["absorber", 18, 0], ["heater", 22, 0], ["packed_bed", 2, 5],
		["absorber", 6, 5], ["stack", 11, 5], ["product", 14, 5], ["product", 16, 5]]
	var armed_ok := true
	for i in spots.size():
		if w.placing != str(spots[i][0]): armed_ok = false; print("  part ", i, " in hand: '", w.placing, "' wanted ", spots[i][0])
		await click_tile(str(spots[i][0]), int(spots[i][1]), int(spots[i][2]))
		await frames(3)
	check(armed_ok, "every part is already in hand when its turn comes (repeat placement from the checklist)")
	check(ids_of("packed_bed").size() == 4 and ids_of("absorber").size() == 2 and ids_of("product").size() == 2, "all twelve parts are on the plot")
	var parts_moves := moves
	w.cancel_place(); await frames(2)
	# pipes: the chain. Link 1 is one drag (feed out -> bed 1 in); each next link is one click on the next inlet.
	var feed: String = ids_of("feed")[0]
	var beds := ids_of("packed_bed"); var cools := ids_of("cooler"); var abs := ids_of("absorber"); var heat: String = ids_of("heater")[0]; var stack: String = ids_of("stack")[0]; var tanks := ids_of("product")
	w.select(feed); hub._refresh_ports(); await frames(2)
	var n0 := nstreams()
	await drag(pip(feed, "out", false), pip(beds[0], "in", true))
	check(nstreams() == n0 + 1 and hub.chained and hub.from_unit == beds[0], "one drag piped feed -> bed 1 and re-armed from bed 1 (%s, chained %s)" % [hub.from_unit, str(hub.chained)])
	var chain := [[cools[0], "in"], [beds[1], "in"], [cools[1], "in"], [beds[2], "in"], [abs[0], "in"]]
	for c in chain: await click_at(pip(str(c[0]), str(c[1]), true))
	check(nstreams() == n0 + 6, "five clicks piped the train down to absorber 1 (%d streams)" % (nstreams() - n0))
	check(hub.from_unit == abs[0] and hub.from_port == "out", "the chain armed absorber 1's gas outlet (%s %s)" % [hub.from_unit, hub.from_port])
	for c in [[heat, "in"], [beds[3], "in"], [abs[1], "in"], [stack, "in"]]: await click_at(pip(str(c[0]), str(c[1]), true))
	check(nstreams() == n0 + 10 and hub.from_unit == "", "four more clicks reached the stack, where the chain ended itself (%d streams, from '%s')" % [nstreams() - n0, hub.from_unit])
	await drag(pip(abs[0], "acid", false), pip(tanks[0], "in", true))
	await drag(pip(abs[1], "acid", false), pip(tanks[1], "in", true))
	check(nstreams() == n0 + 12, "the two acid lines make twelve pipes")
	var total := parts_moves + (moves - parts_moves)
	print("  L25 moves to fully piped: ", total, " (parts ", parts_moves, ")")
	check(total < 25, "parts and pipes in under 25 moves (%d)" % total)
	var li := app.b.q("levelInfo") as Dictionary
	check(int(guide_done()) >= 24, "the checklist ticked every part and pipe (%d done)" % guide_done())
	check(str(li.coach.text).contains("Next on the build checklist") if li.get("coach") is Dictionary else true, "the coach follows the checklist while rows are open")

func _catalyst_all() -> void:
	var beds := ids_of("packed_bed")
	Faceplate.open(app, beds[0]); await frames(4)
	var fp = Faceplate.plates.get(beds[0])
	check(fp != null, "bed 1 faceplate opens")
	if fp == null: return
	var okc: Dictionary = app.b.act("setCatalyst", [beds[0], "v2o5"]); app.game_on_changed(); await frames(3)
	app.b.act("setParam", [beds[0], "W", 8000.0]); app.game_on_changed(); await frames(3)
	check(fp._cat_all != null and fp._cat_all.visible, "the 'same catalyst on all beds' key is on the faceplate once a catalyst is chosen")
	fp._cat_all.pressed.emit(); await frames(4)
	var all_ok := true
	for id in beds:
		var u: Dictionary = {}
		for x in plant().units: if str(x.id) == id: u = x
		var card = app.b.q("unitCard", [id]) as Dictionary
		if card.catalyst == null or str(card.catalyst.id) != "v2o5": all_ok = false
	check(all_ok, "all four beds carry V2O5 after one press")
	var guide: Array = (app.b.q("levelInfo") as Dictionary).buildGuide
	var cat_row := {}
	for l in guide: if str(l.id) == "catalyst": cat_row = l
	check(bool(cat_row.get("done", false)), "the checklist's catalyst row ticked (catalyst and 8000 kg on all four beds)")

func _miss_and_chain_end() -> void:
	# a pipe in hand, a click on empty ground: the chain ends with a message; a plain pipe in hand names the nearest free inlet
	var feed: String = ids_of("feed")[0]
	await level("L25"); Notebook.close(app); await frames(3); w = app.world; hub = app.root.get_node("PaperHub")
	w.cancel_place(); await frames(1)
	app.b.act("placeUnit", ["packed_bed", 2, 0, 0]); app.b.act("placeUnit", ["cooler", 6, 0, 0]); app.b.act("placeUnit", ["packed_bed", 8, 0, 0]); app.game_on_changed(); await frames(4)
	w.cancel_place(); await frames(2)   # the checklist put the next part in hand after the engine placements
	w.set_camera("far"); await frames(3)
	feed = ids_of("feed")[0]
	var beds := ids_of("packed_bed"); var cools := ids_of("cooler")
	w.select(feed); hub._refresh_ports(); await frames(2)
	await click_at(pip(feed, "out", false))
	check(hub.from_unit == feed, "pipe started from the feed")
	w.last_pipe_msg = ""
	await click_at(w.world_to_screen(w.tile_to_world(Vector2i(20, 12), Vector2i(1, 1))))
	check(w.last_pipe_msg.begins_with("Dropped on nothing: the nearest free inlet is "), "a miss in L25 names the nearest free inlet (%s)" % w.last_pipe_msg)
	check(hub.from_unit == feed, "and the plain pipe stays in hand")
	await click_at(pip(beds[0], "in", true))
	check(hub.chained and hub.from_unit == beds[0], "dropped on bed 1: the chain re-armed from bed 1")
	w.last_pipe_msg = ""
	await click_at(w.world_to_screen(w.tile_to_world(Vector2i(20, 12), Vector2i(1, 1))))
	check(hub.from_unit == "" and w.last_pipe_msg == "Piping chain ended.", "a click on empty ground ends the chain (%s)" % w.last_pipe_msg)
	await click_at(pip(beds[0], "out", false)); await click_at(pip(cools[0], "in", true))
	check(hub.chained and hub.from_unit == cools[0], "the chain starts again from the next free outlet")
	await key_esc()
	check(hub.from_unit == "", "Esc ends the chain")

func key_esc() -> void:
	var e := InputEventKey.new(); e.keycode = KEY_ESCAPE; e.physical_keycode = KEY_ESCAPE; e.pressed = true; Input.parse_input_event(e); await frames(2)
	var r := InputEventKey.new(); r.keycode = KEY_ESCAPE; r.physical_keycode = KEY_ESCAPE; r.pressed = false; Input.parse_input_event(r); await frames(2)

func _zero_duty() -> void:
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(2)
	w = app.world
	var r: Dictionary = app.b.act("placeUnit", ["cooler", 6, 2, 0]); app.game_on_changed(); await frames(3)
	var id := str(r.get("id", ""))
	Faceplate.open(app, id); await frames(4)
	var fp = Faceplate.plates.get(id)
	check(fp != null and fp._warn != null, "cooler faceplate opens")
	if fp == null: return
	check(str(fp._warn.text).begins_with("This cooler does 0 kW"), "the zero-duty warning names the unit type (%s)" % str(fp._warn.text))
