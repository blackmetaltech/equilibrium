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
		"l10":
			await level("L10"); var rr: Dictionary = act("placeUnit", ["compressor", 8, 2, 0]); Faceplate.attach(app); Faceplate.open(app, str(rr.id)); await frames(8); await snap(tag)
		"l33":
			await level("L33"); app.lvbay.refresh(true); await frames(4)
			var pv: Dictionary = app.lvbay.panel.view.duplicate(true)
			if not pv.has("scenarios") or (pv.scenarios as Array).is_empty():
				pv["scenarios"] = [{"name": "Cooling lost", "id": "x", "sensors": [{"id": "A", "reading": 80.0, "failed": false}, {"id": "B", "reading": 0.0, "failed": true}, {"id": "C", "reading": 81.0, "failed": false}], "votes": 2, "need": 2, "tripped": true, "trippedAt": 42.0, "outcome": "Saved the vessel"}, {"name": "Sensor noise", "id": "y", "sensors": [{"id": "A", "reading": 70.0, "failed": false}], "votes": 0, "need": 2, "tripped": false, "trippedAt": -1.0, "outcome": "No false trip"}]
			app.lvbay.panel.set_view(pv); await frames(4); await snap(tag)
		"run_l31", "run_l32", "run_l33", "run_l34", "run_l35", "run_l36", "run_l37", "run_l38", "run_l29":
			await level(which.substr(4).to_upper()); app.lvbay.refresh(true); await frames(4); await snap(tag + "_design")
			app.chrome.turn_key(true); await frames(10); app.lvbay.refresh(true); await frames(3); await snap(tag + "_run1")
			app.chrome.turn_key(true); await frames(10); app.lvbay.refresh(true); await frames(6); await snap(tag + "_run2")
		"career_y2":
			await level("CAREER"); for i in 14: act("levelAct", ["advance", 1])
			app.lvbay.refresh(true); await frames(4); await snap(tag + "_top")
			var sc: ScrollContainer = app.lvbay.panel.scroll; sc.scroll_vertical = 1100; await frames(3); await snap(tag + "_mid")
			sc.scroll_vertical = 100000; await frames(3); await snap(tag + "_bottom")
		"l34_row":
			await level("L34"); app.lvbay.refresh(true); await frames(4)
			var cells: Array = app.lvbay.panel.view.cells; var cc: Dictionary = {}
			for c in cells: if bool(c.meaningful): cc = c; break
			app.lvbay.panel._on_cell(cc.param, cc.guide); await frames(3); app.lvbay.refresh(true); await frames(3); app.lvbay.panel._on_cell(cc.param, cc.guide); await frames(4); await snap(tag)
		"l35", "l37", "career":
			await level({"l35": "L35", "l37": "L37", "career": "CAREER"}[which]); app.lvbay.refresh(true); await frames(4); await snap(tag)
	if app.b != null: app.b.stop()
	quit(0)
