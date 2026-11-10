extends SceneTree
## Screenshots for the F2 review (needs a display): godot --path godot --script res://tests/fix2_shots.gd -- <out dir> <tag>
var app: CbApp
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(path: String) -> void:
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png(path); print("saved ", path)
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func build(n2: float, h2: float) -> void:
	for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["nh3_sep", 14, 0, 0], ["product", 18, 0, 0], ["vent", 18, 4, 0]]: app.b.act("placeUnit", a)
	app.b.act("setBank", ["F-101", "N2", n2]); app.b.act("setBank", ["F-102", "H2", h2])
	for c in [["F-101", "out", "M-103", "in1"], ["F-102", "out", "M-103", "in2"], ["M-103", "out", "R-104", "in"], ["R-104", "out", "D-105", "in"], ["D-105", "liq", "T-106", "in"], ["D-105", "vap", "Y-107", "in"]]: app.b.act("connect", c)
	app.game_on_changed()
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); var out := str(args[0]); var tag := str(args[1])
	DirAccess.make_dir_recursive_absolute(out)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	await level("L01")
	build(42.6, 127.7); await frames(3)
	app.chrome.turn_key(); app.game_on_changed(); await frames(3)
	app.b.act("setBank", ["F-101", "N2", 140.1]); app.b.act("setBank", ["F-102", "H2", 30.24]); app.game_on_changed(); await frames(3)
	app.chrome.turn_key(); app.game_on_changed(); await frames(3)
	for i in 6: app.b.act("tick", [1]); app.game_on_changed()
	await snap("%s/l01_two_runs_%s.png" % [out, tag])
	app.chrome.open_recorder(); await frames(4)
	await snap("%s/l01_recorder_big_%s.png" % [out, tag])
	app.back(); await frames(2)
	var m: Control = app.modal()
	if m != null: m.queue_free()
	await frames(2)
	# delete key-cap on a faceplate (and the confirm strip)
	await level("L01")
	build(140.1, 30.24); await frames(3)
	Faceplate.attach(app)
	app.plant_world.select("M-103"); app.plant_world.unit_clicked.emit("M-103"); await frames(3)
	key(KEY_DELETE); await frames(4)
	await snap("%s/faceplate_delete_%s.png" % [out, tag])
	# failed solve chevron
	await level("L01")
	for a in [["feed", 0, 0, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 6, 0]]: app.b.act("placeUnit", a)
	app.b.act("connect", ["F-101", "out", "M-102", "in1"]); app.game_on_changed(); await frames(3)
	app.b.g["failure"] = {"code": "UNFED", "unitId": "R-103"}
	app.chrome._failure(); await frames(3)
	await snap("%s/failed_solve_%s.png" % [out, tag])
	# L00 after the trip
	await level("L00")
	Faceplate.attach(app)
	app.b.act("tick", [40]); app.b.act("trip", ["I-112"]); app.game_on_changed(); await frames(2)
	for i in 6: app.b.act("tick", [5]); app.game_on_changed()
	Faceplate.open(app, "C-105"); await frames(3)
	var cool: Faceplate = Faceplate.plates.get("C-105")
	if cool != null:
		var kn: Knob = cool.knobs.T
		kn.set_value(kn.value - 30.0); kn.committed.emit(kn.value); await frames(3)
	await snap("%s/l00_after_trip_%s.png" % [out, tag])
	if app.b != null: app.b.stop()
	quit(0)
func key(code: int) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r)
