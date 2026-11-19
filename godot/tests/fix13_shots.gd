extends SceneTree
## Screenshots for F13: godot --rendering-driver opengl3 --path godot --script res://tests/fix13_shots.gd -- <out dir> <w> <h> <career|l24>
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.8).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func act(name: String, args: Array) -> void:
	app.b.act("levelAct", [name] + args); app.game_on_changed()
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var w := int(args[1]); var h := int(args[2]); var which := str(args[3])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(w, h); await frames(4)
	var tag := "%s_%dx%d" % [which, w, h]
	if which == "career":
		app.start_level("CAREER", true); await frames(4); Notebook.close(app); await frames(3)
		for i in 10: act("advance", [1])
		app.lvbay.refresh(true); await frames(5)
		await snap(tag + "_top")
		var sc: ScrollContainer = app.lvbay.panel.scroll
		for i in 14: act("advance", [1])
		app.lvbay.refresh(true); await frames(5)
		var b: CareerBoard = app.lvbay.panel
		var ah = b.find_child("ANNUAL", true, false)
		sc.scroll_vertical = 100000; await frames(3)
		# find the first memo and scroll to it
		for n in b.find_children("MemoMoney", "GridContainer", true, false):
			sc.scroll_vertical = maxi(0, int((n as Control).global_position.y - b.body.global_position.y) - 40); break
		await frames(3); await snap(tag + "_memo")
	else:
		app.start_level("L24", true); await frames(10)
		Notebook.close(app); await frames(3); Notebook.open(app); await frames(12)
		var rows = app.root.find_children("*", "ScrollContainer", true, false)
		for r in rows: if (r as Control).is_visible_in_tree(): (r as ScrollContainer).scroll_vertical = 100000
		await frames(4)
		await snap(tag + "_checklist")
	if app.b != null: app.b.stop()
	quit(0)
