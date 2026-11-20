extends SceneTree
## Round 7 fixes (F16): the notebook shows what each Call it needs ("What you have: ...") under its row; a run opens at the level's recommended speed.
## Run: godot --headless --path godot --script res://tests/fix16_flow.gd
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func clear_modals() -> void:
	for n in app.root.get_children(): if n.has_meta("cb_modal"): n.queue_free()
	app.end_ui = null; await frames(3)
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func _given(id: String, must: String) -> void:
	await clear_modals()
	Notebook._seen.clear()
	app.start_level(id, true); await frames(8)
	var nb := app.root.get_node_or_null("notebook")
	var g: Node = nb.find_child("CallGiven", true, false) if nb != null else null
	check(g != null and (g as Label).text.begins_with("What you have"), "%s: the notebook shows a 'What you have' line under the call (%s)" % [id, (g as Label).text if g != null else "none"])
	check(g != null and (g as Label).text.contains(must), "%s: the line carries %s" % [id, must])
	Notebook.close(app); await frames(3)
func _speed() -> void:
	await clear_modals()
	app.start_level("L24", true); await frames(6); Notebook.close(app); await frames(3)
	check(int(app.b.q("levelInfo").get("recommendedSpeed", 0)) == 16, "L24 recommends 16x")
	app.set_speed(1); app.chrome.choose_speed(1)
	app.b.act("setParam", ["I-106", "setpoint", 125.0 + 273.15]); app.b.act("setParam", ["R-104", "orifice", "T"]); app.game_on_changed()
	app.chrome.turn_key(true); await frames(6)
	check(app.speed == 3, "L24 opens its shift at 16x (speed index %d)" % app.speed)
	await clear_modals()
	app.start_level("L15", true); await frames(6); Notebook.close(app); await frames(3)
	check(int(app.b.q("levelInfo").get("recommendedSpeed", 0)) == 1, "L15 recommends 1x")
func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	await _given("L24", "Fogler")
	await _given("L15", "unlimited catalyst")
	await _given("L18", "first order")
	await _speed()
	print("FIX16-FLOW checks=%d" % checks)
	print("FIX16-FLOW OK" if fails == 0 else "FIX16-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	await frames(2)
	quit(0 if fails == 0 else 1)
