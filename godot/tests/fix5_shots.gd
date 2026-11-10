extends SceneTree
## Screenshots for F5: godot --path godot --script res://tests/fix5_shots.gd -- <out dir> <l17|l06|why|hist>
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
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var which := str(args[1])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	match which:
		"l17":
			await level("L17")
			act("connect", ["F-101", "out", "R-102", "in"]); act("connect", ["R-102", "out", "T-103", "in"]); act("setParam", ["F-101", "T", 683.15]); act("commission", [])
			Faceplate.attach(app); Faceplate.open(app, "R-102"); app.plant_world.select("R-102")
			app.chrome._point({"unit": "R-102", "knob": "catalyst"}); await frames(10)
			await snap("l17_catalyst")
		"l06":
			await level("L06")
			for a in [["placeUnit", "compressor", 3, 4, 0], ["placeUnit", "mixer", 10, 2, 0], ["placeUnit", "burner", 12, 0, 0], ["placeUnit", "stack", 22, 2, 0]]: act(a[0], a.slice(1))
			for p in [["F-102", "out", "K-103", "in"], ["K-103", "out", "M-104", "in2"], ["F-101", "out", "M-104", "in1"], ["M-104", "out", "R-105", "in"], ["R-105", "out", "Z-106", "in"]]: act("connect", p)
			act("commission", []); await frames(12)
			await snap("l06_notice")
		"why":
			await level("L17")
			act("connect", ["F-101", "out", "R-102", "in"]); act("connect", ["R-102", "out", "T-103", "in"]); act("setParam", ["F-101", "T", 683.15]); act("commission", [])
			Faceplate.attach(app); var fp := Faceplate.open(app, "R-102"); app.plant_world.select("R-102"); await frames(8)
			fp._on_why(); await frames(8)
			await snap("why")
		"hist":
			app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
			Notebook.stub = Notebook.stub_info(); Printout.stub = Notebook.result_stub(true)
			Printout.stub.histogram = {"metric": "cost", "bins": [2, 5, 9, 14, 8, 3, 1], "edges": [60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000], "you": 94200.0, "youBin": 3}
			Printout.open(app); await frames(10)
			await snap("hist")
	quit(0)
