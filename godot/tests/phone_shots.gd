extends SceneTree
## Phone screenshots (2424x1080, phone layout forced) and the same scenes on 1920x1080 / 1280x800:
##   xvfb-run -a godot --path godot --resolution 2424x1080 --script res://tests/phone_shots.gd -- <out dir> <scene> [phone|desktop|hand] [WxH]
## scenes: title drawer map brief inspector result keypad intercom ledger
var app: CbApp
var OUT := ""
var tag := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s%s.png" % [OUT, name, tag]); print("saved ", name)
func level(id: String, close_nb := true) -> void:
	app.start_level(id, true); await frames(4)
	if close_nb: Notebook.close(app); await frames(3)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var which := str(args[1])
	var kind := str(args[2]) if args.size() > 2 else "phone"
	var wh := str(args[3]).split("x") if args.size() > 3 else PackedStringArray(["2424", "1080"])
	tag = "" if kind == "phone" else "_" + kind
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	CbLayout.forced = kind
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(int(wh[0]), int(wh[1])); await frames(4); CbLayout.update(root); app._relayout(); await frames(3)
	match which:
		"title": await frames(6); await snap("title")
		"drawer":
			await level("L01"); app.chrome.parts_btn.pressed.emit(); await frames(6); await snap("drawer")
		"map": WorksMap.open(app); await frames(6); await snap("map")
		"brief": await level("L01", false); await frames(6); await snap("brief")
		"intercom":
			await level("L01"); app.chrome.intercom.say("TOMAS", "The mixer inlet is open: connect the hydrogen feed and the nitrogen feed to the mixer before you commission.", "warn"); await frames(6); await snap("intercom")
		"inspector":
			await level("L01")
			for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["product", 18, 0, 0]]: app.b.act("placeUnit", a)
			app.game_on_changed(); await frames(4); app.plant_world.fit_view(); await frames(10)
			var sp: Vector2 = app.plant_world.unit_screen_pos("R-104")
			var ev := InputEventMouseButton.new(); ev.position = sp; ev.button_index = MOUSE_BUTTON_LEFT; ev.pressed = true; app.plant_world._click_at(sp)
			await frames(8); await snap("inspector")
		"keypad":
			await level("L01"); Knob.keypad(app, "H2 needed for 140 kg/h of N2", "kg/h", "", 0.0, 1000.0, func(_v): pass); await frames(6); await snap("keypad")
		"result":
			app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
			Notebook.stub = Notebook.stub_info(); Printout.stub = Notebook.result_stub(false)
			Printout.stub.aborted = true; Printout.stub.abortText = "The run stopped before the goals were met. Hydrogen left through the vent."
			Printout.open(app); await frames(10); await snap("result")
		"ledger":
			await level("L07"); await frames(4); app.bay.pin("ledger"); await frames(8); await snap("ledger")
	if app.b != null: app.b.stop()
	quit(0)
