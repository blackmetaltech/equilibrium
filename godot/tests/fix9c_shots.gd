extends SceneTree
## Screenshots for F9c: godot --rendering-driver opengl3 --path godot --script res://tests/fix9c_shots.gd -- <out dir> <w> <h> <l35|l37|career>
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
		"l35":
			await level("L35")
			for id in ["cool_on", "flare_on", "purge", "circ_on", "press_test", "heat_slow"]: act("levelAct", ["add", id])
			app.lvbay.refresh(true); await frames(6); await snap(tag)
		"l37":
			await level("L37"); act("levelAct", ["reconcile"]); act("levelAct", ["flag", 1]); app.lvbay.refresh(true); await frames(6); await snap(tag)
		"career":
			await level("CAREER"); for i in 26: act("levelAct", ["advance", 1])
			app.lvbay.refresh(true); await frames(4)
			var sc: ScrollContainer = app.lvbay.panel.scroll
			await snap(tag + "_top")
			sc.scroll_vertical = 1100; await frames(3); await snap(tag + "_mid")
			sc.scroll_vertical = 100000; await frames(3); await snap(tag + "_bottom")
	if app.b != null: app.b.stop()
	quit(0)
