extends SceneTree
## Round 4 lane F8e: the phone (Pixel 9a, 2424x1080 physical, phone layout forced) is playable by touch. One check group per backlog item.
## Run: godot --headless --path godot --script res://tests/phone_flow.gd      (screens: tests/phone_shots.gd)
var fails := 0
var checks := 0
var app: CbApp
const DP := 62.4   ## 48 dp at 2.6 px/dp, in logical px (the phone layout is 0.5 physical px per logical px)

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func level(id: String, close_nb := true) -> void:
	app.start_level(id, true); await frames(4)
	if close_nb: Notebook.close(app); await frames(3)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func find_named(n: Node, nm: String) -> Node:
	if n.name == nm: return n
	for c in n.get_children():
		var r := find_named(c, nm)
		if r != null: return r
	return null
func vis(n: Control) -> bool: return n != null and n.is_visible_in_tree()
func size_ok(c: Control, what: String, min_dp := DP - 1.0) -> void:
	check(c != null and c.get_global_rect().size.x >= min_dp and c.get_global_rect().size.y >= min_dp, "%s is >= 48 dp (%s)" % [what, str(c.get_global_rect().size) if c != null else "missing"])

# ---- touch injection (what the phone sends: screen touch + the emulated mouse) -------------------------------------------------------
var _mdown := false
func ev_touch(p: Vector2, down: bool, idx := 0) -> void:
	var t := InputEventScreenTouch.new(); t.index = idx; t.position = p; t.pressed = down; root.push_input(t, true)
func ev_mouse(p: Vector2, down: bool, motion := false, rel := Vector2.ZERO) -> void:
	if motion:
		var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; m.relative = rel; m.button_mask = MOUSE_BUTTON_MASK_LEFT if _mdown else 0; m.device = InputEvent.DEVICE_ID_EMULATION; root.push_input(m, true)
	else:
		var b := InputEventMouseButton.new(); b.position = p; b.global_position = p; b.button_index = MOUSE_BUTTON_LEFT; b.pressed = down; b.device = InputEvent.DEVICE_ID_EMULATION
		b.button_mask = MOUSE_BUTTON_MASK_LEFT if down else 0; _mdown = down; root.push_input(b, true)
func tap(p: Vector2) -> void:
	ev_mouse(p, true, true); ev_touch(p, true); ev_mouse(p, true); await frames(2)
	ev_touch(p, false); ev_mouse(p, false); await frames(3)
func drag(a: Vector2, b: Vector2, steps := 8, idx := 0) -> void:
	ev_touch(a, true, idx); ev_mouse(a, true); await frames(1)
	var prev := a
	for i in range(1, steps + 1):
		var p := a.lerp(b, float(i) / steps)
		var d := InputEventScreenDrag.new(); d.index = idx; d.position = p; d.relative = p - prev
		ev_mouse(p, true, true, p - prev); root.push_input(d, true); prev = p; await frames(1)   # the engine emulates the mouse motion first, then dispatches the drag
	ev_touch(b, false, idx); ev_mouse(b, false); await frames(3)
func pinch(c: Vector2, d0: float, d1: float, steps := 8) -> void:
	ev_touch(c + Vector2(-d0, 0), true, 0); ev_touch(c + Vector2(d0, 0), true, 1); await frames(1)
	var p0 := c + Vector2(-d0, 0); var p1 := c + Vector2(d0, 0)
	for i in range(1, steps + 1):
		var dd := lerpf(d0, d1, float(i) / steps)
		var n0 := c + Vector2(-dd, 0); var n1 := c + Vector2(dd, 0)
		var e0 := InputEventScreenDrag.new(); e0.index = 0; e0.position = n0; e0.relative = n0 - p0; root.push_input(e0, true)
		var e1 := InputEventScreenDrag.new(); e1.index = 1; e1.position = n1; e1.relative = n1 - p1; root.push_input(e1, true)
		p0 = n0; p1 = n1; await frames(1)
	ev_touch(p0, false, 0); ev_touch(p1, false, 1); await frames(3)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	CbLayout.forced = "phone"
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(2424, 1080); await frames(4); CbLayout.update(root); app._relayout(); await frames(3)
	check(CbLayout.kind == "phone" and absf(app.vw() - 1212.0) < 60.0, "phone layout at 2424x1080 (vw %.0f)" % app.vw())
	var only := OS.get_cmdline_user_args()
	for step in ["save", "drawer", "map", "camera", "brief", "inspector", "picking", "targets", "intercom"]:
		if not only.is_empty() and not only.has(step): continue
		await call("_" + step)
		await frames(2)
	print("PHONE-FLOW checks=%d" % checks)
	print("PHONE-FLOW OK" if fails == 0 else "PHONE-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# ---- 9. progress ----------------------------------------------------------------------------------------------------------------------
func _save() -> void:
	var C := WorksMap.Campaign
	var old_path := C.path; var old_fp := C.force_persist
	C.path = "user://eq_campaign_phone_test.cfg"; C.force_persist = true
	DirAccess.remove_absolute(C.path)
	# a file that has no [stars] section (written by an older build, or before any win) must load without an error and leave the map at zero
	var f := ConfigFile.new(); f.set_value("meta", "version", 1); f.save(C.path)
	C._loaded = false; C.stars.clear(); C.hard.clear(); C.load_all()
	check(C.stars.is_empty(), "a save with no stars section loads as an empty record")
	var e := FileAccess.open(C.path, FileAccess.WRITE); e.store_string(""); e.close()
	C._loaded = false; C.load_all(); check(C.stars.is_empty(), "an empty save file loads as an empty record")
	# persistence off at first read: the file is still read once it is on
	C._loaded = false; C.stars.clear(); C.force_persist = false
	var was := CbSettings.persist; CbSettings.persist = false; C.load_all(); check(not C._loaded, "an unread record is not marked loaded while persistence is off")
	CbSettings.persist = was; C.force_persist = true
	# a win persists its stars
	C.reset(); C.set_levels(app.b.levels())
	check(C.record("L00", 2, false), "a win is recorded")
	var f2 := ConfigFile.new(); check(f2.load(C.path) == OK and f2.has_section("stars") and int(f2.get_value("stars", "L00", 0)) == 2, "the star is on disk right after the win")
	# restart: memory cleared, the file read back
	C._loaded = false; C.stars.clear(); C.hard.clear(); C.load_all()
	check(int(C.stars.get("L00", 0)) == 2, "after a restart the stars come back (L00 = %s)" % str(C.stars.get("L00", 0)))
	# the engine's fresh all-zero record must not wipe the file's stars
	C.sync_engine(app); check(int(C.stars.get("L00", 0)) == 2, "the engine's fresh record cannot lower stars")
	# reset keeps a valid file
	C.reset(); var f3 := ConfigFile.new(); check(f3.load(C.path) == OK, "reset writes a loadable file")
	C._loaded = false; C.load_all(); check(C.stars.is_empty(), "a reset record reloads empty")
	DirAccess.remove_absolute(C.path)
	C.path = old_path; C.force_persist = old_fp; C._loaded = true; C.stars.clear(); C.hard.clear()

# ---- 1. the parts drawer ----------------------------------------------------------------------------------------------------------------
func _drawer() -> void:
	await level("L01")
	var ch: EqConsole = app.chrome
	check(vis(ch.parts_btn), "the Parts button shows on the phone")
	size_ok(ch.parts_btn, "the Parts button")
	check(not ch._rack_float.visible, "the drawer starts shut")
	await tap(ch.parts_btn.get_global_rect().get_center()); await frames(3)
	var fl: Control = ch._rack_float
	check(fl.visible, "tapping Parts opens the drawer")
	var r := fl.get_global_rect(); var br := ch.parts_btn.get_global_rect()
	check(r.size.x >= 400.0 and r.size.y >= 200.0, "the drawer is a real sheet, not a sliver (%s)" % str(r.size))
	check(not r.intersects(br), "the drawer does not sit under its own button (drawer %s, button %s)" % [str(r), str(br)])
	var vp := Rect2(Vector2.ZERO, app.get_viewport().get_visible_rect().size)
	check(vp.encloses(r), "the drawer is on screen (%s)" % str(r))
	check(r.end.y <= ch.panel.get_global_rect().position.y + 1.0, "the drawer is above the console")
	var rack: PartsRack = ch.rack
	check(rack != null and rack.tiles.size() >= 3, "the drawer has tiles (%d)" % (rack.tiles.size() if rack != null else -1))
	var seen := 0
	for t in rack.tiles: if r.encloses((t as Control).get_global_rect().grow(-2.0)) and (t as Control).is_visible_in_tree(): seen += 1
	check(seen >= 3, "at least three tiles are visible and whole without scrolling (%d)" % seen)
	for t in rack.tiles: if (t as Control).get_global_rect().size.x < DP - 1.0 or (t as Control).get_global_rect().size.y < DP - 1.0: check(false, "tile %s is big enough" % str((t as PartsRack.Tile).type))
	# the list scrolls by finger when it holds more than fits
	var sc := ch.rack_scroll
	await frames(2)
	var room := sc.get_v_scroll_bar().max_value - sc.get_v_scroll_bar().page
	if room > 4.0:
		var c := sc.get_global_rect().get_center(); var y0 := sc.scroll_vertical
		await drag(c + Vector2(0, 50), c - Vector2(0, 50)); await frames(2)
		check(sc.scroll_vertical > y0, "a swipe scrolls the parts list (%d -> %d)" % [y0, sc.scroll_vertical])
		check(app.world.placing == "", "a scrolling swipe over a tile does not pick it")
		sc.scroll_vertical = 0; await frames(2)
	# a tap on a tile places the ghost and folds the drawer
	var tile: Control = rack.tiles[0]
	await tap(tile.get_global_rect().get_center()); await frames(3)
	check(app.world.placing == (tile as PartsRack.Tile).type, "tapping a tile starts placing it (%s)" % app.world.placing)
	check(not fl.visible, "the drawer folds away after a pick")
	app.world.cancel_place()
# ---- 2. the Works map -------------------------------------------------------------------------------------------------------------------
func _map() -> void:
	var C := WorksMap.Campaign
	C.stars.clear(); C.hard.clear()
	WorksMap.open(app); await frames(5)
	var lm := app.root.get_node_or_null("levels")
	check(lm != null, "the map opens")
	if lm == null: return
	var sc := lm.find_child("List", true, false) as ScrollContainer
	check(sc != null, "the map has a list")
	size_ok(lm.find_child("Close", true, false) as Control, "the map's Close key")
	size_ok(lm.find_child("Start", true, false) as Control, "the map's START key")
	var all_sites := true
	for n in 11: if lm.find_child("Site_%d" % n, true, false) == null: all_sites = false
	check(all_sites, "all eleven sites (chapters 0-9 and Career) are on the map")
	var room := sc.get_v_scroll_bar().max_value - sc.get_v_scroll_bar().page
	var fits := true
	for n in 11:
		var card := lm.find_child("Site_%d" % n, true, false) as Control
		if card != null and not sc.get_global_rect().grow(2.0).encloses(card.get_global_rect()): fits = false
	check(fits or room > 4.0, "either every site fits or the list scrolls (room %.0f)" % room)
	# swipe up from a lamp node, then from bare background: the list moves by finger
	var node: Control = lm.find_child("Level_L00", true, false)
	var from: Vector2 = node.get_global_rect().get_center()
	var y0 := sc.scroll_vertical
	if room > 4.0:
		await drag(from, from - Vector2(0, 160)); await frames(2)
		check(sc.scroll_vertical > y0, "a swipe that starts on a lamp scrolls the map (%d -> %d)" % [y0, sc.scroll_vertical])
		check(str(app.b.g.get("level", "")) != "L00" or lm.is_inside_tree(), "the swipe did not start a job")
		for i in 6: await drag(sc.get_global_rect().get_center() + Vector2(300, 100), sc.get_global_rect().get_center() + Vector2(300, -100)); await frames(1)
		var last := lm.find_child("Site_10", true, false) as Control
		check(last != null and sc.get_global_rect().intersects(last.get_global_rect()) and sc.get_global_rect().intersection(last.get_global_rect()).size.y > 40.0, "the Career site can be swiped into view")
		await drag(sc.get_global_rect().get_center(), sc.get_global_rect().get_center() + Vector2(0, 400), 10); await frames(1)
		await drag(sc.get_global_rect().get_center(), sc.get_global_rect().get_center() + Vector2(0, 400), 10); await frames(2)
		check(sc.scroll_vertical <= 2, "and swiped back to the top (%d)" % sc.scroll_vertical)
	# a locked level says why, and START stays dark
	var locked := lm.find_child("Level_L05", true, false) as Control
	if locked != null:
		sc.ensure_control_visible(locked); await frames(2)
		await tap(locked.get_global_rect().get_center()); await frames(3)
		var info := lm.find_child("Info", true, false) as Label
		check(info != null and info.text.contains("Finish chapter") and (lm.find_child("Start", true, false) as Button).disabled, "a locked level says why in the info bar (%s)" % (info.text.replace("\n", " / ") if info != null else ""))
	# the open, selected level starts on a tap; a swipe starting on it does not
	var l1 := lm.find_child("Level_L00", true, false) as Control
	sc.scroll_vertical = 0; await frames(2)
	await tap(l1.get_global_rect().get_center()); await frames(3)
	check(str(app.b.g.get("level", "")) == "L00" and app.root.get_node_or_null("levels") == null, "a tap on the selected open level starts it (%s)" % str(app.b.g.get("level", "")))
	Notebook.close(app); await frames(2)

# ---- 3. the camera by touch --------------------------------------------------------------------------------------------------------------
func _camera() -> void:
	await level("L01")
	var cam: PlantCamera = app.plant_world.cam_rig
	var bt: CamButtons = app.plant_world._btns
	check(vis(bt), "the camera buttons show on the phone")
	for k in CamButtons.KINDS: size_ok(bt.get_node(k) as Control, "camera button " + k)
	# clear of the Equilibrium window, the gear, the Parts button and the console
	app.bay.pin("ledger"); await frames(4); app.bay.visible = true; await frames(2)
	var br := bt.get_global_rect()
	check(not br.intersects(app.bay.get_global_rect()), "the camera buttons are clear of the Equilibrium window (%s vs %s)" % [str(br), str(app.bay.get_global_rect())])
	check(not br.intersects(app.chrome.gear.get_global_rect()), "...and of the gear")
	check(not br.intersects(app.chrome.panel.get_global_rect()), "...and of the console")
	check(not br.intersects(app.chrome.parts_btn.get_global_rect()), "...and of the Parts button")
	check(Rect2(Vector2.ZERO, app.get_viewport().get_visible_rect().size).encloses(br), "...and on screen")
	app.bay._forced_kind = ""; app.bay.reset(); await frames(2)
	# +/- by tap
	var z0 := cam._size_to
	await tap(bt.get_node("zoom_in").get_global_rect().get_center()); await frames(2)
	var z1 := cam._size_to
	check(z1 < z0 - 1.0, "the + button zooms in (%.1f -> %.1f)" % [z0, z1])
	await tap(bt.get_node("zoom_out").get_global_rect().get_center()); await tap(bt.get_node("zoom_out").get_global_rect().get_center()); await frames(2)
	check(cam._size_to > z1 + 1.0, "the - button zooms out (%.1f)" % cam._size_to)
	for i in 6: await tap(bt.get_node("zoom_in").get_global_rect().get_center())
	check(cam._size_to <= PlantCamera.ZMIN + 0.01, "+ stops at the closest zoom (%.1f)" % cam._size_to)
	var yaw0 := cam.yaw_step
	await tap(bt.get_node("rot_r").get_global_rect().get_center()); await frames(2)
	check(cam.yaw_step != yaw0, "the rotate button turns the view")
	await tap(bt.get_node("rot_l").get_global_rect().get_center())
	# one finger on empty ground pans
	cam.set_size(56.0); cam.look_at_ground(Vector3.ZERO); await frames(3)
	var p0 := cam.pan_target(); var tapped := [0]
	var sig := func(_p: Vector2): tapped[0] += 1
	cam.tapped.connect(sig)
	await drag(Vector2(300, 150), Vector2(500, 230), 10); await frames(2)
	check(cam.pan_target().distance_to(p0) > 2.0, "one finger dragging empty ground pans the view (moved %.1f m)" % cam.pan_target().distance_to(p0))
	check(tapped[0] == 0, "a pan is not a tap")
	# two fingers pinch
	var s0 := cam._size_to
	await pinch(Vector2(500, 200), 60.0, 160.0); await frames(2)
	check(cam._size_to < s0 * 0.7, "a pinch out zooms in (%.1f -> %.1f)" % [s0, cam._size_to])
	var s1 := cam._size_to
	await pinch(Vector2(500, 200), 160.0, 50.0); await frames(2)
	check(cam._size_to > s1 * 1.5, "a pinch in zooms out (%.1f -> %.1f)" % [s1, cam._size_to])
	await tap(Vector2(500, 200)); check(tapped[0] == 1, "a short touch is a tap (%d)" % tapped[0])
	cam.tapped.disconnect(sig)
# ---- 4. the brief / notebook sheet ----------------------------------------------------------------------------------------------------
func _brief() -> void:
	Notebook._seen.clear(); Notebook.started.clear()
	await level("L01", false); await frames(8)
	await create_timer(0.6).timeout
	var nb := app.root.get_node_or_null("notebook")
	check(nb != null, "the brief opens on a new level")
	if nb == null: return
	var vp := Rect2(Vector2.ZERO, app.get_viewport().get_visible_rect().size)
	var pn := nb.get_child(1) as Control
	check(vp.grow(1.0).encloses(pn.get_global_rect()), "the sheet fits the screen (%s)" % str(pn.get_global_rect()))
	var start := nb.find_child("Start", true, false) as Control
	var call := nb.find_child("Answer", true, false) as Control
	check(start != null and vp.encloses(start.get_global_rect()), "Start work is on screen without scrolling (%s)" % (str(start.get_global_rect()) if start != null else "-"))
	check(call != null and vp.encloses(call.get_global_rect()), "Call it is on screen without scrolling")
	size_ok(start, "Start work"); size_ok(call, "the Call it answer line")
	var sc := nb.find_child("PageScroll", true, false) as ScrollContainer
	check(sc != null and sc.get_global_rect().end.y <= start.get_global_rect().position.y + 1.0, "the page scrolls above the pinned footer")
	var room := sc.get_v_scroll_bar().max_value - sc.get_v_scroll_bar().page
	if room > 4.0:
		var c := sc.get_global_rect().get_center(); await drag(c + Vector2(0, 60), c - Vector2(0, 60)); await frames(2)
		check(sc.scroll_vertical > 0, "the page scrolls by swipe")
		check(vp.encloses(start.get_global_rect()), "Start work stays put while the page scrolls")
		sc.scroll_vertical = 0; await frames(2)
	# outside tap
	await tap(Vector2(60, 300)); await frames(4)
	check(app.root.get_node_or_null("notebook") == null, "a tap outside the sheet puts it away")
	# swipe down
	Notebook.open(app); await create_timer(0.6).timeout
	check(app.root.get_node_or_null("notebook") != null, "the notebook reopens from its tab")
	await drag(Vector2(600, 120), Vector2(600, 330), 8); await frames(4)
	check(app.root.get_node_or_null("notebook") == null, "a swipe down puts the sheet away")
	# Start work still starts
	Notebook.open(app); await create_timer(0.6).timeout
	var st2 := app.root.get_node_or_null("notebook").find_child("Start", true, false) as Button
	await tap(st2.get_global_rect().get_center()); await frames(4)
	check(app.root.get_node_or_null("notebook") == null, "Start work closes the sheet")
func _inspector() -> void: pass
func _picking() -> void: pass
func _targets() -> void: pass
func _intercom() -> void: pass
