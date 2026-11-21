extends SceneTree
## F20 (round 7 wiring and camera): a pipe in hand snaps to the nearest legal port within a generous radius, a missed drop says so and names the nearest free port,
## a click on a unit body selects it and never starts a pipe, zoom levels / pan / frame-the-plot move the camera, ctrl+z undoes a placement, Esc cancels in order.
## Run: godot --headless --path godot --script res://tests/fix20_flow.gd     Prints FIX20-FLOW OK / FIX20-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp
var w
var hub

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func key(code: int, ctrl := false, shift := false) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.ctrl_pressed = ctrl; e.shift_pressed = shift; e.pressed = true; Input.parse_input_event(e); await frames(2)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.ctrl_pressed = ctrl; r.pressed = false; Input.parse_input_event(r); await frames(2)
func click_at(p: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r); await frames(2)
func place(t: String, x: int, y: int) -> String:
	var r: Dictionary = app.b.act("placeUnit", [t, x, y, 0]); app.game_on_changed(); await frames(3)
	return str(r.get("id", ""))
func nstreams() -> int: return (app.b.q("plant") as Dictionary).streams.size()
func nunits() -> int: return (app.b.q("plant") as Dictionary).units.size()
func pip(id: String, port: String, inlet: bool) -> Vector2: return w.port_screen(id, port, inlet)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	app.new_game("sandbox"); await frames(4)
	Notebook.close(app); await frames(2)
	w = app.world; hub = app.root.get_node("PaperHub")
	await _wiring()
	await _camera()
	await _undo_and_esc()
	print("FIX20-FLOW checks=%d" % checks)
	print("FIX20-FLOW OK" if fails == 0 else "FIX20-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _wiring() -> void:
	var f := await place("feed", 2, 2); var f2 := await place("feed", 2, 8)
	var m := await place("mixer", 10, 4); var m2 := await place("mixer", 10, 10)
	check(f != "" and f2 != "" and m != "" and m2 != "", "four parts placed")
	w.set_camera("mid"); await frames(4)
	# a pipe from the feed's outlet (selected unit: its pips are lit)
	w.select(f); hub._refresh_ports(); await frames(2)
	await click_at(pip(f, "out", false))
	check(hub.from_unit == f and w.pipe_ghost_active(), "a click on the outlet pip starts a pipe (%s)" % hub.from_unit)
	# snap: a click 24 px off the mixer's in1 pip still takes it; the highlighted index is that pip
	var p1 := pip(m, "in1", true); var p2 := pip(m, "in2", true)
	var off := (p1 - p2).normalized() * 24.0
	var sn: Dictionary = w.snap_legal(p1 + off)
	check(not sn.is_empty() and str(sn.mark.unit) == m and str(sn.mark.port) == "in1", "snap finds in1 24 px away (radius %.0f)" % w.snap_radius())
	check(w.snap_legal(p1 + Vector2(400, 300)).is_empty(), "nothing snaps 500 px away")
	var n0 := nstreams()
	await click_at(p1 + off); await frames(2)
	check(nstreams() == n0 + 1 and (hub.from_unit == "" or hub.chained), "the near-miss click piped feed -> mixer (%d -> %d); F25: the mixer's outlet is armed by the chain" % [n0, nstreams()])
	# a missed drop: the pipe stays in hand, the message names the nearest free inlet
	w.select(f2); hub._refresh_ports(); await frames(2)
	await click_at(pip(f2, "out", false))
	check(hub.from_unit == f2, "second pipe started")
	w.last_pipe_msg = ""
	await click_at(w.world_to_screen(w.tile_to_world(Vector2i(22, 14), Vector2i(1, 1))))
	check(w.last_pipe_msg.begins_with("Dropped on nothing: the nearest free inlet is "), "missed drop says so (%s)" % w.last_pipe_msg)
	check(hub.from_unit == f2 and nstreams() == n0 + 1, "and nothing was attached, the pipe stays in hand")
	check(str(w.last_pipe_msg).contains(" M-") or str(w.last_pipe_msg).contains(" IN"), "it names a unit and a port")
	var said := false
	for l in app.chrome.intercom.lines: if str(l.text).begins_with("Dropped on nothing"): said = true
	check(said, "the intercom carries it")
	# a body click with a pipe in hand: two legal ports on that unit -> says which, connects nothing
	var c0 := nstreams()
	hub._on_unit(m2); await frames(2)
	var which := false
	for l in app.chrome.intercom.lines: if str(l.text).contains("more than one port that fits"): which = true
	check(which and nstreams() == c0 and hub.from_unit == f2, "a body click with two fitting ports names them and attaches nothing")
	await key(KEY_ESCAPE)
	check(hub.from_unit == "" and app.menu_ui == null, "Esc drops the pipe in hand, no pause menu")
	# a click on a unit body selects it; it never starts a pipe
	w.select(""); hub._refresh_ports(); await frames(2)
	var body: Vector2 = w.unit_screen_pos(m2)
	var close_pip := 1e9
	for pn in ["in1", "in2", "out"]: close_pip = minf(close_pip, body.distance_to(pip(m2, pn, pn != "out")))
	check(close_pip > w.PIPE_START_PX + 1.0, "the mixer's body centre is clear of its pips (%.0f px)" % close_pip)
	await click_at(body)
	check(hub.from_unit == "" and not w.pipe_ghost_active() and w.selected_id == m2, "a click on the body selects the unit, no pipe starts (selected %s)" % w.selected_id)
	check(Faceplate.plates.has(m2), "and its card opens")
	# tooltips: a drag clears the hovered pipe / unit
	w._hover_pipe = "x"; w._hover_unit = m2
	var mm := InputEventMouseMotion.new(); mm.position = Vector2(500, 300); mm.relative = Vector2(5, 0); mm.button_mask = MOUSE_BUTTON_MASK_RIGHT; Input.parse_input_event(mm); await frames(2)
	check(w._hover_pipe == "" and w._hover_unit == "", "a drag drops the hover state (tooltips)")
	Faceplate.close_all(); w.select(""); await frames(2)

func _camera() -> void:
	var rig = w.cam_rig
	check(PlantCamera.ZOOMS.size() >= 3, "three zoom levels (%d)" % PlantCamera.ZOOMS.size())
	rig.set_zoom_index(0); rig.snap(); await frames(3)
	var s0: float = rig._size_to
	rig.zoom_step(-1); await frames(2)
	var s1: float = rig._size_to
	rig.zoom_step(-1); await frames(2)
	var s2: float = rig._size_to
	check(s1 > s0 and s2 > s1, "zoom steps through the middle level (%.0f -> %.0f -> %.0f)" % [s0, s1, s2])
	var wheel := InputEventMouseButton.new(); wheel.button_index = MOUSE_BUTTON_WHEEL_UP; wheel.pressed = true; wheel.position = Vector2(900, 400); Input.parse_input_event(wheel); await frames(2)
	check(rig._size_to < s2 and rig._size_to > PlantCamera.ZMIN, "the wheel zooms smoothly (%.1f)" % rig._size_to)
	var pan0: Vector3 = rig.pan_target()
	var rd := InputEventMouseMotion.new(); rd.position = Vector2(900, 400); rd.relative = Vector2(90, 40); rd.button_mask = MOUSE_BUTTON_MASK_RIGHT; Input.parse_input_event(rd); await frames(2)
	check(rig.pan_target().distance_to(pan0) > 0.5, "a right-drag pans (%s -> %s)" % [pan0, rig.pan_target()])
	var pan1: Vector3 = rig.pan_target()
	rig.pan_ground(Vector3(3, 0, 0)); check(rig.pan_target() != pan1, "keyboard / pad pan moves the target")
	rig.set_size(30.0); rig.look_at_ground(Vector3(10, 0, 8)); await frames(2)
	await key(KEY_F)
	check(rig.pan_target().distance_to(Vector3(10, 0, 8)) > 6.0 and rig._size_to > 34.0, "F frames the placed equipment (F23) (pan %s size %.0f)" % [rig.pan_target(), rig._size_to])
	check(CamButtons.KINDS.has("frame"), "a frame button sits on the touch pad")

func _undo_and_esc() -> void:
	var n0 := nunits()
	var v := await place("mixer", 16, 2)
	check(v != "" and nunits() == n0 + 1, "a mixer is placed")
	await key(KEY_Z, true)
	check(nunits() == n0, "ctrl+z undoes the placement (%d -> %d)" % [n0 + 1, nunits()])
	var said := false
	for l in app.chrome.intercom.lines: if str(l.text) == "Undone": said = true
	check(said, "with a toast")
	await key(KEY_Y, true)
	check(nunits() == n0 + 1, "ctrl+y redoes it")
	# Esc order: pipe in hand, then placement tool, then cards, then the pause menu
	var ids: Array = (app.b.q("plant") as Dictionary).units.map(func(u): return str(u.id))
	var u0: String = ids[0]
	Faceplate.open(app, u0); await frames(3)
	hub.from_unit = u0; hub.from_port = "out"; hub.from_inlet = false
	await key(KEY_ESCAPE)
	check(hub.from_unit == "" and Faceplate.plates.has(u0) and app.menu_ui == null, "Esc 1: the pipe in hand goes, the card stays")
	w.begin_place("mixer"); await frames(2)
	await key(KEY_ESCAPE)
	check(w.placing == "" and Faceplate.plates.has(u0) and app.menu_ui == null, "Esc 2: the placement tool goes, the card stays")
	await key(KEY_ESCAPE)
	check(not Faceplate.plates.has(u0) and app.menu_ui == null, "Esc 3: the cards close, no menu yet")
	await key(KEY_ESCAPE)
	check(app.menu_ui != null, "Esc 4: the pause menu opens")
	await key(KEY_ESCAPE); await frames(2)
