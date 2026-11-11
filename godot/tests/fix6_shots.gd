extends SceneTree
## Screenshots for F6b: godot --path godot --script res://tests/fix6_shots.gd -- <out dir> <w> <h> <l30|l06|l35|l37|career>
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
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var w := int(args[1]); var h := int(args[2]); var which := str(args[3])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(w, h); await frames(4)
	var tag := "%s_%dx%d" % [which, w, h]
	match which:
		"l30":
			await level("L30"); app.lvbay.refresh(true); await frames(3); await snap(tag + "_design")
			app.chrome.turn_key(true); await frames(10); app.lvbay.refresh(true); await frames(3); await snap(tag + "_run")
		"l06":
			await level("L06"); Faceplate.attach(app); Faceplate.open(app, "F-101"); await frames(8); await snap(tag + "_plate")
			app.chrome.turn_key(); await frames(6); await snap(tag + "_predict")
		"l35", "l37", "career":
			await level({"l35": "L35", "l37": "L37", "career": "L38"}[which]); app.lvbay.refresh(true); await frames(4); await snap(tag)
	if app.b != null: app.b.stop()
	quit(0)
