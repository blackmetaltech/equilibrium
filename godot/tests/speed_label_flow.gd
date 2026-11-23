extends SceneTree
## The line under the speed dial says what the clock does, in every phase and when the clock is stopped or started away from the console (a window that lost its focus,
## the pad's Back, the menu): "PAUSED . 1x" only in DESIGN with the dial at the pause bars; during a first run nothing while it rolls and "PAUSED: press 1x" while it is stopped,
## and the dial follows app.speed. Plays the L01 plant to its first run. Prints SPEED-LABEL-FLOW OK / SPEED-LABEL-FLOW FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func note() -> String: return app.chrome.keys.speed.note

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(10)
	app.start_level("L01", true); await frames(8)
	while app.modal() != null: app.back(); await frames(2)
	var id := {}
	for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["nh3_sep", 14, 0, 0], ["product", 18, 0, 0], ["vent", 18, 4, 0]]:
		var r: Dictionary = app.b.act("placeUnit", a)
		var k: String = a[0] if a[0] != "feed" or not id.has("feed") else "feed2"
		id[k] = str(r.get("id", ""))
	app.b.act("setBank", [id.feed, "N2", 140.1]); app.b.act("setBank", [id.feed2, "H2", 30.24])
	for c in [[id.feed, "out", id.mixer, "in1"], [id.feed2, "out", id.mixer, "in2"], [id.mixer, "out", id.stoich_reactor, "in"], [id.stoich_reactor, "out", id.nh3_sep, "in"], [id.nh3_sep, "liq", id.product, "in"], [id.nh3_sep, "vap", id.vent, "in"]]:
		app.b.act("connect", c)
	app.game_on_changed(); await frames(4)
	check(app.chrome.engine_phase() == "design" and note().begins_with("PAUSED") and app.chrome.keys.speed_pos == 0, "DESIGN: the dial stands at the pause bars and says PAUSED ('%s')" % note())
	app.chrome.turn_key(true); await frames(6)
	check(app.chrome.engine_phase() == "firstrun", "the key rolls the first run (%s)" % app.chrome.engine_phase())
	check(app.speed >= 1 and app.chrome.keys.speed_pos == app.speed and note() == "", "first run, clock running: the dial shows %dx and there is no PAUSED note ('%s')" % [app.speed, note()])
	for i in 20:
		await frames(1)
		check(not note().begins_with("PAUSED ·") and not note().begins_with("PAUSED ·"), "frame %d of the first run: the design note never shows (%s)" % [i, note()])
		if note() != "": break
	# the clock stops away from the console: the dial and the note follow within a few frames
	app.set_speed(0); await frames(4)
	check(app.chrome.keys.speed_pos == 0, "clock stopped (focus lost, menu): the dial goes to the pause bars (pos %d)" % app.chrome.keys.speed_pos)
	check(note() == PaperStrings.t("CLOCK_PAUSED_RUN"), "clock stopped during the first run: the note says so ('%s')" % note())
	# ... and starts again
	app.set_speed(1); await frames(4)
	check(app.chrome.keys.speed_pos == 1 and note() == "", "clock started again: dial 1x, no note (pos %d, '%s')" % [app.chrome.keys.speed_pos, note()])
	app.set_speed(3); await frames(4)
	check(app.chrome.keys.speed_pos == 3 and note() == "", "16x: dial 16x, no note (pos %d, '%s')" % [app.chrome.keys.speed_pos, note()])
	print("SPEED-LABEL-FLOW checks=%d" % checks)
	print("SPEED-LABEL-FLOW OK" if fails == 0 else "SPEED-LABEL-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)
