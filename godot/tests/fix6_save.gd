extends SceneTree
## F6b: a design edit is autosaved without a tick, so Continue after a killed game restores the build.
## Run (own data dir!): XDG_DATA_HOME=/tmp/x godot --headless --path godot --script res://tests/fix6_save.gd
func frames(n := 3) -> void:
	for i in n: await process_frame
func _initialize() -> void:
	OS.set_environment("CB_NOCOACH", "1")
	var app := (load("res://main.tscn") as PackedScene).instantiate() as CbApp; root.add_child(app)
	await frames(8); CbSettings.persist = false
	app.start_level("L06", true); await frames(4); Notebook.close(app); await frames(3)
	var n0: int = (app.b.q("plant").units as Array).size()
	var r: Dictionary = app.b.act("placeUnit", ["burner", 8, 2, 0]); app.game_on_changed()
	await create_timer(1.6).timeout; await frames(3)
	var n1: int = (app.b.q("plant").units as Array).size()
	app._save_dirty = false; app.b.act("deleteUnit", [str(r.id)]); app._save_dirty = false   # a different state in memory ("the game was killed")
	app._save_dirty = false; app.load_slot("auto"); await create_timer(1.0).timeout; await frames(10)
	var n2: int = (app.b.q("plant").units as Array).size()
	var ok := bool(r.get("ok", false)) and n1 == n0 + 1 and n2 == n1
	print("FIX6-SAVE n0=%d n1=%d n2=%d -> %s" % [n0, n1, n2, "OK" if ok else "FAILED"])
	if app.b != null: app.b.stop()
	quit(0 if ok else 1)
