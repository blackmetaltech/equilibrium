extends SceneTree
## Screenshots for fix9a: godot --rendering-driver opengl3 --path godot --script res://tests/fix9a_shots.gd -- <out dir> <w> <h> <l16|ledger|l11|inspector>
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
		"l16":
			app.start_level("L16", true); await frames(10); Notebook.open(app); await frames(10); await snap(tag + "_ticket")
		"ledger":
			await level("L08"); app.bay.pin("ledger"); await frames(6); app.bay.refresh(true); await frames(4)
			app.bay.view.set_data({"items": [{"unitId": "R-1", "tag": "R-105", "MW": 2.66, "kind": "release"}, {"unitId": "R-2", "tag": "B-107", "MW": 1.9, "kind": "release"}, {"unitId": "C-3", "tag": "H-108", "MW": 0.8, "kind": "recovered"}, {"unitId": "C-4", "tag": "Z-109", "MW": 0.4, "kind": "lost"}], "totalMW": 4.56, "exchangerMW": 0.8, "heaters": [{"label": "H-108: 2.66 MW of duty from 3.3 MW of fuel, 80 % efficient (the rest goes up the stack)"}], "labels": {"release": "released", "total": "total released"}})
			await frames(8); await snap(tag)
		"l11":
			await level("L11"); await frames(4)
			print(app.b.act("placeUnit", ["product", 20, 0, 0])); print(app.b.act("placeUnit", ["mixer", 12, 6, 0])); app.game_on_changed(); await frames(3)
			var us: Array = app.b.q("plant").units
			print("L11 units ", us.map(func(u): return str(u.id) + ":" + str(u.type)))
			var tk := ""
			for u in us: if str(u.type) in ["tank", "product"]: tk = str(u.id)
			print("connect ", app.b.act("connect", ["F-101", "out", tk, "in"]))
			app.game_on_changed(); await frames(3)
			app.chrome.turn_key(true); await frames(8); await create_timer(2.5).timeout; await snap(tag)
		"inspector":
			await level("L01")
			for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["product", 18, 0, 0]]: app.b.act("placeUnit", a)
			app.game_on_changed(); await frames(4); app.plant_world.fit_view(); await frames(10)
			var sp: Vector2 = app.plant_world.unit_screen_pos("R-104")
			app.plant_world._click_at(sp); await frames(8); await snap(tag)
	if app.b != null: app.b.stop()
	quit(0)
