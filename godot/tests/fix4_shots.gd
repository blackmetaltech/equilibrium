extends SceneTree
## Screenshots for the F4b review: godot --path godot --script res://tests/fix4_shots.gd -- <out dir> <which>
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func motion(p: Vector2) -> void:
	var e := InputEventMouseMotion.new(); e.position = p; e.global_position = p; Input.parse_input_event(e)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var which := str(args[1])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	match which:
		"scenes":
			for lid in ["L29", "L30", "L31", "L32", "L34"]:
				await level(lid); await frames(8); await snap("scene_" + lid)
		"map":
			WorksMap.Campaign.unlock_all = true
			WorksMap.open(app); await frames(8); await snap("map")
		"ghost":
			await level("L05")
			var w: PlantWorld = app.plant_world
			app.b.act("placeUnit", ["mixer", 10, 8, 0]); app.game_on_changed(); await frames(3)
			w.begin_place("mixer"); w._cursor = Vector2i(10, 8); w._update_ghost(); await frames(4)
			await snap("ghost_red")
		"hx":
			await level("L16")
			await frames(6); await snap("hx")
		"cards":
			await level("L05")
			app.b.act("placeUnit", ["mixer", 10, 8, 0]); app.b.act("placeUnit", ["burner", 14, 8, 0]); app.game_on_changed(); await frames(3)
			Faceplate.attach(app); Faceplate.open(app, "M-102"); Faceplate.open(app, "B-103"); await frames(10)
			await snap("cards")
		"heater":
			app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
			app.b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
			var h: Dictionary = app.b.act("placeUnit", ["heater", 6, 6, 0]); app.game_on_changed(); await frames(3)
			Faceplate.attach(app); Faceplate.open(app, str(h.id)); app.plant_world.select(str(h.id))
			app.b.act("setParam", [str(h.id), "utility", "cw"]); app.game_on_changed(); await frames(8)
			await snap("heater_cw")
		"intercom":
			await level("L17")
			app.chrome.intercom.say("TOMAS", "Heater E-104 will not solve: the cold inlet is hotter than the hot one, so heat would flow the wrong way. Swap the streams or lower the temperature.", "bad")
			await frames(60); await snap("intercom_long")
	quit(0)
