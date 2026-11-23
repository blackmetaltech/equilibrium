extends SceneTree
## Regression: a pipe drag with the mouse that silently did nothing (playtest, L11). Real mouse events on the plot: press on a port, move, release on another.
## The cases: a plain drag; a drag while an earlier click left a half-made pipe in hand (the press on another outlet restarts the pipe there, and its release must finish it);
## a drag from an inlet to an outlet; a drag after a chained pipe. Each must connect or say why (a toast), never nothing.
## Run: godot --headless --path godot --script res://tests/pipe_drag_flow.gd     Prints PIPE-DRAG-FLOW OK / PIPE-DRAG-FLOW FAILED n.
var fails := 0
var checks := 0
var app
var w
var hub

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func click_at(p: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r); await frames(2)
func drag(a: Vector2, b: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = a; m.global_position = a; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = a; e.global_position = a; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(2)
	var mm := InputEventMouseMotion.new(); mm.position = b; mm.global_position = b; mm.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(mm); await frames(2)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = b; r.global_position = b; r.pressed = false; Input.parse_input_event(r); await frames(3)
func nstreams() -> int: return (app.b.q("plant") as Dictionary).streams.size()
func pip(id: String, port: String, inlet: bool) -> Vector2: return w.port_screen(id, port, inlet)

const BUILD := [["placeUnit", ["feed", 0, 0, 0]], ["placeUnit", ["feed", 0, 4, 0]], ["placeUnit", ["mixer", 4, 2, 0]], ["placeUnit", ["stoich_reactor", 8, 0, 0]],
	["placeUnit", ["nh3_sep", 14, 0, 0]], ["placeUnit", ["product", 18, 0, 0]], ["placeUnit", ["vent", 18, 4, 0]]]

func fresh() -> void:
	app.start_level("L01", true); await frames(10)
	Notebook.close(app); await frames(3)
	for a in BUILD: app.b.act(a[0], a[1])
	app.game_on_changed(); await frames(6)
	w = app.world; hub = app.root.get_node("PaperHub")
	w.set_camera("far"); await frames(6)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1"); OS.set_environment("CB_LOOK2", "")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await fresh()
	var n0 := nstreams()
	# 1. a plain drag
	await drag(pip("F-101", "out", false), pip("M-103", "in1", true))
	check(nstreams() == n0 + 1, "1: a plain drag F-101 -> M-103 connects (%d -> %d streams)" % [n0, nstreams()])
	# 2. a click on an outlet leaves a pipe in hand; then a drag from ANOTHER outlet to its inlet. The press restarts the pipe there; the release must finish it.
	await fresh()
	n0 = nstreams()
	await click_at(pip("F-101", "out", false))
	check(hub.from_unit == "F-101", "2: a click on F-101's outlet puts a pipe in hand")
	await drag(pip("F-102", "out", false), pip("M-103", "in2", true))
	check(nstreams() == n0 + 1, "2: with a pipe already in hand, a drag from another outlet still connects (%d -> %d streams, in hand: '%s')" % [n0, nstreams(), hub.from_unit])
	# 3. a drag from an inlet to an outlet
	await fresh()
	n0 = nstreams()
	await drag(pip("M-103", "in1", true), pip("F-101", "out", false))
	check(nstreams() == n0 + 1, "3: a drag from an inlet to an outlet connects (%d -> %d streams)" % [n0, nstreams()])
	# 4. after a connect the chain arms the next outlet; a drag from a different outlet then still connects
	await fresh()
	n0 = nstreams()
	await drag(pip("F-101", "out", false), pip("M-103", "in1", true))
	await drag(pip("F-102", "out", false), pip("M-103", "in2", true))
	check(nstreams() == n0 + 2, "4: a second drag after a chained pipe connects too (%d -> %d streams)" % [n0, nstreams()])
	# 5. a drag that ends on nothing says so (never silent): a toast or the pipe stays in hand
	await fresh()
	n0 = nstreams()
	await drag(pip("F-101", "out", false), Vector2(60, 400))
	check(nstreams() == n0 and (hub.from_unit != "" or w.last_pipe_msg != ""), "5: a drag dropped on nothing keeps the pipe in hand or says why (in hand '%s', msg '%s')" % [hub.from_unit, w.last_pipe_msg])
	# 6. L03 (playtest, three tries): a drag that connects a feed to the mixer arms the chain from the mixer's outlet; a drag from that very outlet to the burner must connect
	app.start_level("L03", true); await frames(10); Notebook.close(app); await frames(3)
	for p in [["mixer", 4, 2], ["boiler", 8, 7], ["burner", 12, 3], ["stack", 18, 3], ["product", 18, 8]]: app.b.act("placeUnit", [p[0], p[1], p[2], 0])
	app.game_on_changed(); await frames(6)
	w = app.world; hub = app.root.get_node("PaperHub"); w.set_camera("far"); await frames(6)
	n0 = nstreams()
	await drag(pip("F-101", "out", false), pip("M-103", "in1", true))
	check(hub.from_unit == "M-103" and hub.chained, "6: the feed -> mixer pipe arms the chain at the mixer's outlet (in hand '%s')" % hub.from_unit)
	await drag(pip("M-103", "out", false), pip("R-105", "in", true))
	check(nstreams() == n0 + 2, "6: a drag from the chain's own outlet to the burner connects (%d -> %d streams, in hand '%s')" % [n0, nstreams(), hub.from_unit])
	# 7. (0.12) the port pips are 1.6x larger and a press 18 px off one still starts a pipe (a playtester could not hit them): a 24 px radius target
	await fresh()
	n0 = nstreams()
	var pr := pip("F-101", "out", false)
	var smallest := 99.0
	for mn in w._mark_nodes:
		if is_instance_valid(mn) and (mn as MeshInstance3D).mesh is SphereMesh: smallest = minf(smallest, ((mn as MeshInstance3D).mesh as SphereMesh).radius)
	check(smallest >= 0.19 * 1.6 and smallest < 99.0, "7: the smallest outlet pip is 1.6x its old size (radius %.2f)" % smallest)
	check(PlantWorld.PIP_SCALE >= 1.6 and PlantWorld.PIPE_PICK_PX >= 24.0 and PlantWorld.PIPE_START_PX >= 18.0, "7: the pick radius is at least 24 px and a resting pip's start radius at least 18")
	await drag(pr + Vector2(18, 0), pip("M-103", "in1", true))
	check(nstreams() == n0 + 1, "7: a press 18 px beside F-101's outlet still starts the pipe (%d -> %d streams)" % [n0, nstreams()])
	print("PIPE-DRAG-FLOW checks=%d" % checks)
	print("PIPE-DRAG-FLOW OK" if fails == 0 else "PIPE-DRAG-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)
