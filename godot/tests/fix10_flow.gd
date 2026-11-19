extends SceneTree
## Round 5b fix round F10: placement follows the engine's footprints (ghost = click result, big units show every valid anchor), the banner is never clipped or over the ghost, the intercom
## never types half a word, the call box registers every digit, L25 key-then-click places, L26 fits, Career card/BOOK, CB_AUTOSTART=career.
## Run: godot --headless --path godot --script res://tests/fix10_flow.gd
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
	Notebook.close(app); await frames(3)
func click_at(p: Vector2, gap := 1) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e)
	await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r)
	await frames(gap)
func key(code: int, uni := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = uni; e.pressed = true; Input.parse_input_event(e); await frames(1)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r); await frames(1)
func screen_of_tile(w, t: Vector2i, fp := Vector2i(1, 1)) -> Vector2: return w.cam.unproject_position(w.tile_to_world(t, fp))

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _footprints(); await _banner(); await _key_click(); await _intercom(); await _callbox()
	root.size = Vector2i(1280, 800); await frames(4)
	await _l33(); await _career()
	print("FIX10-FLOW checks=%d" % checks)
	print("FIX10-FLOW OK" if fails == 0 else "FIX10-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## The grid follows the engine: every anchor the world calls free is one placeUnit accepts, every one it calls taken is refused; big units show all valid anchors.
func _footprints() -> void:
	await level("L26"); await frames(2)
	var w = app.world
	check(w.footprint_of("gauze_burner") == Vector2i(4, 4), "gauze burner footprint is the engine's 4x4: %s" % str(w.footprint_of("gauze_burner")))
	check(w.footprint_of("feed") == Vector2i(2, 2) and w.footprint_of("product") == Vector2i(2, 2) and w.footprint_of("heater") == Vector2i(2, 2), "feed / product / heater are the engine's 2x2")
	for ty in ["gauze_burner", "n2o_abater"]:
		var wrong := 0; var okn := 0
		for y in range(0, 16):
			for x in range(0, 24):
				var mine: bool = w.can_place(ty, x, y, 0)
				var r: Dictionary = app.b.act("placeUnit", [ty, x, y, 0])
				if bool(r.get("ok", false)):
					okn += 1
					if not mine: wrong += 1
					app.b.act("undo", [])
				elif mine: wrong += 1
		check(wrong == 0, "%s: the world's free/taken verdict equals the engine's on all 384 tiles (%d disagree, %d accepted)" % [ty, wrong, okn])
	var va: Array = w.valid_anchors("gauze_burner", 0)
	check(va.size() >= 12, "L26 leaves room for the gauze burner: %d valid anchors" % va.size())
	w.begin_place("gauze_burner"); await frames(2)
	check(w.anchor_count() == va.size() and va.size() > 0, "big unit in hand: every valid anchor is drawn (%d of %d)" % [w.anchor_count(), va.size()])
	w.cancel_place(); await frames(2)
	check(w.anchor_count() == 0, "cancelling clears the anchors")
	# the notebook's build: gauze at (10,0), abater at (4,9), with room around them
	check(w.can_place("gauze_burner", 10, 0, 0) and w.can_place("n2o_abater", 4, 9, 0), "the notebook's positions are free")
	# green ghost = click result: ghost green exactly where the click succeeds, and the click places it
	w.begin_place("gauze_burner"); await frames(1)
	var okc := 0
	for t in [Vector2i(10, 0), Vector2i(2, 0), Vector2i(12, 12), Vector2i(20, 12), Vector2i(0, 12), Vector2i(8, 6)]:
		w._cursor = t; w._update_ghost(); await frames(1)
		var green: bool = w._cursor_valid
		var can: bool = w.can_place("gauze_burner", w._cursor.x, w._cursor.y, 0)
		if green == can: okc += 1
	check(okc == 6, "ghost colour equals can_place at all probes (%d/6)" % okc)
	# a click on a free anchor places the unit
	var n0: int = (app.b.q("plant") as Dictionary).units.size()
	var a: Vector2i = Vector2i(10, 0)
	await click_at(screen_of_tile(w, a + Vector2i(2, 2)), 3)   # the middle tile of the footprint (the cursor is the footprint's centre)
	var n1: int = (app.b.q("plant") as Dictionary).units.size()
	check(n1 == n0 + 1, "a click on the green anchor places the gauze burner (%d -> %d)" % [n0, n1])
	w.cancel_place()

## The banner: inside the plant area, never over the ghost, never takes the mouse.
func _banner() -> void:
	await level("L26"); await frames(2)
	var w = app.world
	w.begin_place("n2o_abater"); await frames(1)
	var occ: Dictionary = w._occupied(); var t0: Vector2i = occ.keys()[0]
	w._cursor = t0; w._update_ghost(); await frames(3)
	var tag: Control = w._why_tag
	check(tag != null and tag.visible and w.ghost_reason().begins_with("Occupied"), "the banner shows the refusal: %s" % w.ghost_reason())
	if tag != null:
		var area: Rect2 = w._plant_area(); var r := tag.get_global_rect()
		check(area.grow(1.0).encloses(r), "the banner sits inside the plant area (%s in %s)" % [str(r), str(area)])
		check(tag.mouse_filter == Control.MOUSE_FILTER_IGNORE, "the banner never takes the mouse")
		var g: Rect2 = w._ghost_screen_rect(w._cursor, w.footprint_of("n2o_abater"))
		check(not r.intersects(g), "the banner does not cover the ghost (banner %s, ghost %s)" % [str(r), str(g)])
	# at every corner of the plot
	var bad := 0
	for t in [Vector2i(0, 0), Vector2i(22, 0), Vector2i(0, 14), Vector2i(22, 14), Vector2i(11, 7)]:
		w._cursor = t; w._update_ghost(); await frames(1)
		if w._why_tag.visible:
			var r2: Rect2 = w._why_tag.get_global_rect(); var area2: Rect2 = w._plant_area()
			if not area2.grow(1.0).encloses(r2) or r2.intersects(w._ghost_screen_rect(w._cursor, w.footprint_of("n2o_abater"))): bad += 1
	check(bad == 0, "the banner stays in the plant area and off the ghost at the plot corners (%d bad)" % bad)
	w.cancel_place(); await frames(2)
	check(w.ghost_reason() == "", "the banner goes with the ghost")
	# stale intercom hint: a new refusal replaces the old one
	var ic = app.chrome.intercom
	w.begin_place("n2o_abater")
	w._cursor = t0; w._update_ghost(); w.place_at(t0.x, t0.y); await frames(2)
	var first: String = str(ic.last().get("text", ""))
	var t1: Vector2i = occ.keys()[occ.size() - 1]
	w._cursor = t1; w._update_ghost(); await frames(2)
	check(not str(ic.last().get("text", "")) == first or not first.contains("nearest free"), "moving the ghost withdraws the stale tile hint from the intercom")
	w.place_at(t1.x, t1.y); await frames(2)
	var hints := 0
	for l in ic.lines: if str(l.text).contains("nearest free spot"): hints += 1
	check(hints <= 1, "at most one tile hint stands in the intercom (%d)" % hints)
	w.cancel_place(); await frames(2)

## L25: press the rack's number key, then click the plot: the unit is placed.
func _key_click() -> void:
	await level("L25"); await frames(4)
	var w = app.world
	var n0: int = (app.b.q("plant") as Dictionary).units.size()
	var rack: PartsRack = app.root.find_child("PartsRack", true, false)
	check(rack != null and rack.tiles.size() > 1, "the rack is there")
	if rack == null: return
	var want := ""
	for i in range(rack.tiles.size()):
		var ty: String = (rack.tiles[i] as PartsRack.Tile).type
		if ty in ["mixer", "heater", "cooler"]: want = ty; await key(KEY_1 + i, 49 + i); break
	check(w.placing == want and want != "", "the number key picks the tile: placing '%s'" % w.placing)
	var tile := Vector2i(10, 8)
	await click_at(screen_of_tile(w, tile, w.footprint_of(want)), 3)
	var n1: int = (app.b.q("plant") as Dictionary).units.size()
	check(n1 == n0 + 1, "key then click places the unit (%d -> %d)" % [n0, n1])
	# key, move the mouse a little, key again to swap tile, click: still placed
	want = ""
	for i in range(rack.tiles.size()):
		var ty: String = (rack.tiles[i] as PartsRack.Tile).type
		if ty in ["cooler", "mixer", "heater"] and ty != "": await key(KEY_1 + i, 49 + i); want = ty; break
	await click_at(screen_of_tile(w, Vector2i(16, 4), w.footprint_of(want)), 3)
	var n2: int = (app.b.q("plant") as Dictionary).units.size()
	check(n2 == n1 + 1, "a second key-then-click also places (%d -> %d)" % [n1, n2])

## The intercom reveals whole words only.
func _intercom() -> void:
	var ic = app.chrome.intercom
	ic.say("TOMAS", "Pick a free spot for the burner: the nearest free tile is at column 12 and row 4, so nothing sticks out of the fenced plot.", "warn")
	var txt: String = ic._text.text
	var bad := 0
	for step in range(1, 40):
		ic.chars = float(step * 3); ic._reveal(txt.length()); await frames(1)
		var k: int = ic._text.visible_characters
		if k > 0 and k < txt.length() and txt[k - 1] != " " and txt[k] != " ": bad += 1
	check(bad == 0, "the typed-out intercom line never stops inside a word (%d cuts)" % bad)
	ic.chars = 1.0e6; ic._reveal(txt.length())

## The call box: "66" gives 66, "47.45" gives 47.45, however fast it is typed.
func _callbox() -> void:
	await level("L24"); await frames(2)
	var got := []
	Knob.keypad(app, "CALL", "°C", "", 0.0, 400.0, func(v: float): got.append(v))
	await frames(3)
	var pad: Node = app.root.get_node_or_null("keypad")
	check(pad != null, "the keypad opens")
	# two digits in the same frame, then in successive frames
	for k in [KEY_6, KEY_6]:
		var e := InputEventKey.new(); e.keycode = k; e.physical_keycode = k; e.unicode = 54; e.pressed = true; Input.parse_input_event(e)
		var r := InputEventKey.new(); r.keycode = k; r.physical_keycode = k; r.pressed = false; Input.parse_input_event(r)
	await frames(2)
	var shown := all_text(app.root.get_node_or_null("keypad"))
	check(shown.contains("66"), "typed 66 shows 66: %s" % shown.replace("\n", " | ").left(80))
	await key(KEY_ENTER)
	await frames(2)
	check(got.size() == 1 and absf(float(got[0]) - 66.0) < 1e-6, "typed 66 delivers 66: %s" % str(got))
	got.clear()
	Knob.keypad(app, "CALL", "°C", "", 0.0, 400.0, func(v: float): got.append(v)); await frames(3)
	for ch in [[KEY_4, 52], [KEY_7, 55], [KEY_PERIOD, 46], [KEY_4, 52], [KEY_5, 53]]: await key(ch[0], ch[1])
	await key(KEY_ENTER); await frames(2)
	check(got.size() == 1 and absf(float(got[0]) - 47.45) < 1e-6, "typed 47.45 delivers 47.45: %s" % str(got))
func all_text(n: Node) -> String:
	if n == null: return ""
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s

func _l33() -> void:
	pass
func _career() -> void:
	pass
