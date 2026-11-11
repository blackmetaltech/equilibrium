extends SceneTree
## Screenshots for the F3b review: godot --path godot --script res://tests/fix3_shots.gd -- <out dir> <which>
var app: CbApp
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.5).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
var OUT := ""
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var which := str(args[1])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	match which:
		"intercom":
			await level("L01")
			app.chrome.intercom.say("MARA", "Hydrogen and nitrogen react one to three by moles, so count molecules before you buy a single kilogram of gas, then call the mass you will need for the job.", "info")
			await frames(30); await snap("intercom")
		"boards":
			for lid in ["L33", "L34", "L35", "L36", "L37", "L38", "CAREER"]:
				await level(lid); await frames(6); await snap("board_" + lid)
		"heater":
			app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
			app.b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
			var h: Dictionary = app.b.act("placeUnit", ["heater", 6, 6, 0]); var x: Dictionary = app.b.act("placeUnit", ["hx", 12, 6, 0]); app.game_on_changed(); await frames(3)
			Faceplate.attach(app); Faceplate.open(app, str(h.id)); app.plant_world.select(str(h.id)); await frames(6)
			await snap("heater")
		"run":
			await level("L05")
			app.b.act("callIt", [8.2])
			for a in [["placeUnit", ["compressor", 4, 4, 0]], ["placeUnit", ["mixer", 10, 2, 0]], ["placeUnit", ["burner", 14, 0, 0]], ["placeUnit", ["boiler", 18, 0, 0]], ["placeUnit", ["stack", 22, 2, 0]],
				["setFeed", ["F-102", {"flow": 860.0 * 1000.0 / 3600.0}]], ["setParam", ["B-106", "T", 693.15]], ["connect", ["F-102", "out", "K-103", "in"]], ["connect", ["K-103", "out", "M-104", "in2"]], ["connect", ["F-101", "out", "M-104", "in1"]], ["connect", ["M-104", "out", "R-105", "in"]], ["connect", ["R-105", "out", "B-106", "in"]], ["connect", ["B-106", "out", "Z-107", "in"]]]: app.b.act(a[0], a[1])
			app.game_on_changed(); await frames(4)
			await snap("run_design")
			app.chrome.turn_key(true); app.game_on_changed(); await frames(4)
			for i in 8: app.b.act("tick", [1]); app.game_on_changed()
			await frames(4); await snap("run_running")
			app.chrome.turn_key(true); app.game_on_changed(); await frames(6)
			await snap("run_stopped")
			Notebook.open(app); await frames(8); await snap("run_notebook")
		"ghost":
			await level("L01")
			var a: Dictionary = app.b.act("placeUnit", ["feed", 4, 6, 0]); var b2: Dictionary = app.b.act("placeUnit", ["mixer", 14, 6, 0]); app.game_on_changed(); await frames(3)
			Faceplate.attach(app)
			app.plant_world.port_clicked.emit(str(a.id), "out", false); await frames(3)
			var mp := Vector2(900, 400)
			var ev := InputEventMouseMotion.new(); ev.position = mp; ev.global_position = mp; Input.parse_input_event(ev); await frames(4)
			await snap("ghost")
		"l25":
			await level("L25"); await frames(8); await snap("l25")
	quit(0)
