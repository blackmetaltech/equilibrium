extends SceneTree
## Fix batch F4b (playtest round 2, front-end): widgets clear on level load, digits never fire palette hotkeys in a field, Esc cancels the placement tool,
## palette clicks after placing, refused placement with a reason, wheel over a panel, the Works Map (Career node, stars only where unlocked), nothing raw on screen.
## Run: godot --headless --path godot --script res://tests/fix4_flow.gd     Prints FIX4-FLOW OK / FIX4-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(2)

func lines_text() -> String:
	var s := ""
	for l in app.chrome.intercom.lines: s += str(l.speaker) + ": " + str(l.text) + "\n"
	return s

func mouse(p: Vector2, pressed: bool, btn := MOUSE_BUTTON_LEFT) -> void:
	var e := InputEventMouseButton.new(); e.button_index = btn; e.position = p; e.global_position = p; e.pressed = pressed; Input.parse_input_event(e)
func click(p: Vector2) -> void:
	mouse(p, true); await frames(1); mouse(p, false); await frames(2)
func motion(p: Vector2) -> void:
	var e := InputEventMouseMotion.new(); e.position = p; e.global_position = p; Input.parse_input_event(e)
func key(code: int, unicode := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = unicode; e.pressed = true; Input.parse_input_event(e)
	await frames(2)
	var u := InputEventKey.new(); u.keycode = code; u.physical_keycode = code; u.pressed = false; Input.parse_input_event(u); await frames(1)

func tile_center(type: String) -> Vector2:
	var rack: PartsRack = app.root.find_child("PartsRack", true, false)
	for t in rack.tiles: if (t as PartsRack.Tile).type == type: return (t as Control).get_global_rect().get_center()
	return Vector2(-1, -1)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _placement()
	await _fresh_levels()
	await _map()
	print("FIX4-FLOW checks=%d" % checks)
	print("FIX4-FLOW OK" if fails == 0 else "FIX4-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _placement() -> void:
	await level("L05")
	var w: PlantWorld = app.plant_world
	var tp := tile_center("mixer")
	check(tp.x > 0, "the rack has a mixer tile")
	# a real click on a tile picks it; a digit key while a keypad is open does not
	await click(tp)
	check(w.placing == "mixer", "a click on a palette tile starts placement")
	await key(KEY_ESCAPE)
	check(w.placing == "", "Esc cancels the placement tool")
	check(app.root.get_node_or_null("PauseMenu") == null and app.modal() == null, "Esc with a ghost does not open the pause plate")
	# placing, then an immediate second palette click works
	await click(tile_center("mixer"))
	w.cancel_place()
	w.begin_place("mixer"); w._cursor = Vector2i(10, 8); w._update_ghost()
	check(w.place_at(10, 8), "a free spot places")
	await frames(3)
	await click(tile_center("compressor"))
	check(w.placing == "compressor", "the first palette click after placing works")
	# over another unit: refused with the reason
	var ids := w.unit_ids()
	var occ_id := ""
	for id in ids: if str((w._unit_state[id] as Array)[0]) == "mixer": occ_id = str(id)
	var st: Array = w._unit_state[occ_id]
	w._cursor = Vector2i(int(st[1]), int(st[2])); w._update_ghost()
	check(not w._cursor_valid and w.ghost_reason().contains(occ_id), "the red ghost names the unit it overlaps: '%s'" % w.ghost_reason())
	var n0 := w.unit_count()
	check(not w.place_at(int(st[1]), int(st[2])), "placement over another unit is refused")
	check(app.chrome.intercom.last().text.contains(occ_id), "the intercom says why: %s" % app.chrome.intercom.last().text)
	w.cancel_place()
	check(w.ghost_reason() == "", "the reason goes with the ghost")
	# a click with no mouse move before it still places (no hover needed)
	await click(tile_center("compressor"))
	var n_before := w.unit_count()
	await click(Vector2(500, 420))   # no motion event first
	await frames(3)
	check(w.unit_count() == n_before + 1, "a placement click with no prior hover places the unit (%d -> %d)" % [n_before, w.unit_count()])
	w.cancel_place()
	# digits in a keypad do not pick tiles
	Knob.keypad(app, "TEST", "x", "1", 0.0, 100.0, func(_v: float): pass); await frames(2)
	await key(KEY_2, 50)
	check(w.placing == "", "digit keys in the keypad never start placement")
	app.root.get_node("keypad").queue_free(); await frames(2)
	# wheel over the console does not zoom the camera; over the open plot it does
	var s0 := w.cam_rig._size_to
	var over: Vector2 = app.chrome.keys.get_global_rect().get_center()
	motion(over); await frames(2)
	mouse(over, true, MOUSE_BUTTON_WHEEL_DOWN); await frames(2)
	check(is_equal_approx(w.cam_rig._size_to, s0), "the wheel over the key switch leaves the camera alone")
	var open: Vector2 = Vector2(700, 300)
	motion(open); await frames(2)
	mouse(open, true, MOUSE_BUTTON_WHEEL_DOWN); await frames(2)
	check(not is_equal_approx(w.cam_rig._size_to, s0), "the wheel over the plot still zooms")

func fire_build(air: float) -> void:
	var acts := [["placeUnit", ["compressor", 4, 4, 0]], ["placeUnit", ["mixer", 10, 2, 0]], ["placeUnit", ["burner", 14, 0, 0]], ["placeUnit", ["boiler", 18, 0, 0]], ["placeUnit", ["stack", 22, 2, 0]],
		["setFeed", ["F-102", {"flow": air * 1000.0 / 3600.0}]], ["setParam", ["B-106", "T", 420.0 + 273.15]],
		["connect", ["F-102", "out", "K-103", "in"]], ["connect", ["K-103", "out", "M-104", "in2"]], ["connect", ["F-101", "out", "M-104", "in1"]],
		["connect", ["M-104", "out", "R-105", "in"]], ["connect", ["R-105", "out", "B-106", "in"]], ["connect", ["B-106", "out", "Z-107", "in"]]]
	for a in acts: app.b.act(a[0], a[1])
	app.game_on_changed()

func _fresh_levels() -> void:
	await level("L05")
	app.chrome.intercom.say("TOMAS", "ZZMARKER stale line from L05", "warn")
	await level("L06")
	check(not lines_text().contains("ZZMARKER"), "the intercom carries nothing from the previous level")
	check(not str(app.chrome.intercom.shown_text()).contains("ZZMARKER"), "...and neither does its visible line")
	check(not PaperStrings.fail_text("NO_EXIT").contains("NO_EXIT") and PaperStrings.fail_text("SOME_NEW_CODE") == "Some new code", "raw solver codes are put into words")
	# stop and edit puts the whole build back, and says nothing is missing when nothing is
	await level("L05"); fire_build(900.0); await frames(2)
	var r: Dictionary = BuildKeeper.restart(app, true); await frames(2)
	check(int(r.get("fails", -1)) == 0 and (r.get("missing", ["x"]) as Array).is_empty(), "restart keeps a complete build with nothing reported missing: %s" % str(r.get("missing")))
	# display scenes for the control levels
	for id in ["L29", "L30", "L31", "L32"]: check(DisplayScene.UNITS.has(id), "%s has a display scene" % id)
	# a heater on cooling water is told so; a small unit carries a tag
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(2)
	app.b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]])
	var h: Dictionary = app.b.act("placeUnit", ["heater", 6, 6, 0]); app.game_on_changed(); await frames(2)
	Faceplate.attach(app); var fp := Faceplate.open(app, str(h.id)); await frames(2)
	app.b.act("setParam", [str(h.id), "utility", "cw"]); app.game_on_changed(); await frames(3)
	check(str(fp._warn.text).contains("cannot heat"), "a heater on cooling water shows the warning: '%s'" % fp._warn.text)
	Faceplate.close_all(); await frames(2)
	var rl: Dictionary = app.b.act("placeUnit", ["relief", 14, 10, 0]); app.game_on_changed(); await frames(3)
	var rn = app.plant_world.unit_node(str(rl.get("id", "")))
	check(rn != null and rn.get_node_or_null("SmallTag") != null, "a relief valve carries a visible tag")
	check(app.plant_world.pick(app.plant_world.unit_screen_pos(str(rl.id)) + Vector2(14, 6)) == str(rl.id), "a small unit is picked from beside its body")

func _map() -> void:
	WorksMap.Campaign.set_levels(app.b.levels())
	check(WorksMap.Campaign.chapter_of("CAREER") == 10 and WorksMap.Campaign.num("CAREER") == 39, "CAREER is its own chapter, not the gate")
	check(WorksMap.CHAPTERS.size() == 11 and int(WorksMap.PREREQ[10]) == 5, "the Works Map has a Career node that opens after chapter 5")
	WorksMap.Campaign.stars.clear(); WorksMap.Campaign.stars["L38"] = 3; WorksMap.Campaign.stars["L00"] = 2
	check(WorksMap.Campaign.total_stars() == 2, "a star on a locked node does not count (%d)" % WorksMap.Campaign.total_stars())
	WorksMap.Campaign.stars.clear()
	WorksMap.open(app); await frames(4)
	check(app.root.find_child("Site_10", true, false) != null and app.root.find_child("Level_CAREER", true, false) != null, "the map shows the Career site and node")
	var nb = app.root.find_child("Level_L38", true, false)
	check(nb != null and nb.stars == 0, "a locked node draws no stars")
	app.root.get_node("levels").queue_free(); await frames(2)
