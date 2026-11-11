extends SceneTree
## Phone screenshots (2424x1080, phone layout forced):
##   xvfb-run -a godot --path godot --resolution 2424x1080 --script res://tests/phone_shots.gd -- <out dir> <scene>
## scenes: title drawer map brief faceplate pick result keypad intercom zoom
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func level(id: String, close_nb := true) -> void:
	app.start_level(id, true); await frames(4)
	if close_nb: Notebook.close(app); await frames(3)
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var which := str(args[1])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	CbLayout.forced = "phone"
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(2424, 1080); await frames(4); CbLayout.update(root); app._relayout(); await frames(3)
	match which:
		"title": await frames(6); await snap("title")
		"drawer":
			await level("L01"); app.chrome.parts_btn.pressed.emit(); await frames(6); await snap("drawer")
		"map": WorksMap.open(app); await frames(6); await snap("map")
		"brief": await level("L01", false); await frames(6); await snap("brief")
		"intercom": await level("L01"); await frames(6); await snap("intercom")
	if app.b != null: app.b.stop()
	quit(0)
