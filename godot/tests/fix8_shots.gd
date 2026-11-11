extends SceneTree
## Screenshots for F8b: godot --path godot --script res://tests/fix8_shots.gd -- <out dir> <w> <h> <l24|l18|keypad>
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.8).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var w := int(args[1]); var h := int(args[2]); var which := str(args[3])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(w, h); await frames(4)
	var tag := "%s_%dx%d" % [which, w, h]
	match which:
		"l24":
			await level("L24"); await frames(6); await snap(tag + "_design")
			app.chrome.turn_key(true); await frames(20); await snap(tag + "_run")
		"l03":
			await level("L03"); await frames(10); await snap(tag)
		"keypad":
			await level("L10"); app.b.act("placeUnit", ["compressor", 8, 2, 0]); app.game_on_changed(); await frames(3)
			Faceplate.attach(app); Faceplate.open(app, "K-101" if false else str(app.b.q("plant").units.back().id)); await frames(6)
			var fp: Faceplate = Faceplate.plates.values()[0]
			for k in fp.knobs: (fp.knobs[k] as Knob)._tap_number(); break
			await frames(4); await snap(tag)
	if app.b != null: app.b.stop()
	quit(0)
