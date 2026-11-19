extends SceneTree
## Screenshots for F10: godot --rendering-driver opengl3 --path godot --script res://tests/fix10_shots.gd -- <out dir> <w> <h> <l26place|l24nb|l33nb|career>
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
		"l26place":
			await level("L26"); await frames(3)
			var wd = app.world
			wd.begin_place("gauze_burner"); wd._cursor = Vector2i(8, 3); wd._update_ghost(); await frames(4); await snap(tag + "_taken")
			wd._cursor = Vector2i(10, 0); wd._update_ghost(); await frames(4); await snap(tag + "_free")
		"l24nb":
			app.start_level("L24", true); await frames(6); Notebook.open(app); await frames(10); await snap(tag)
		"l33nb":
			app.start_level("L33", true); await frames(10); await snap(tag)
		"career0":
			await level("CAREER"); app.lvbay.refresh(true); await frames(4)
			var sc0: ScrollContainer = app.lvbay.panel.scroll
			sc0.scroll_vertical = 100000; await frames(3); await snap(tag + "_bottom")
			sc0.scroll_vertical = 500; await frames(3); await snap(tag + "_mid")
		"career":
			await level("CAREER"); for i in 3: act("levelAct", ["advance", 1])
			app.lvbay.refresh(true); await frames(4)
			var sc: ScrollContainer = app.lvbay.panel.scroll
			sc.scroll_vertical = 100000; await frames(3); await snap(tag + "_bottom")
			sc.scroll_vertical = 700; await frames(3); await snap(tag + "_mid")
	if app.b != null: app.b.stop()
	quit(0)
