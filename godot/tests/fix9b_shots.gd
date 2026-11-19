extends SceneTree
## Screenshots for fix9b: godot --rendering-driver opengl3 --path godot --script res://tests/fix9b_shots.gd -- <out dir> <w> <h> <l24|l27|l28>
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.8).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var w := int(args[1]); var h := int(args[2]); var which := str(args[3])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(w, h); await frames(4)
	var tag := "%s_%dx%d" % [which, w, h]
	app.start_level(which.to_upper(), true); await frames(10)
	Notebook.close(app); await frames(3); Notebook.open(app); await frames(12)
	await snap(tag + "_notebook")
	if which == "l27":
		Notebook.close(app); await frames(4)
		app.b.act("placeUnit", ["relief", 14, 8, 0]); app.game_on_changed(); await frames(4)
		await snap(tag + "_design")
	if app.b != null: app.b.stop()
	quit(0)
