extends SceneTree
## 0.13 the Works map as a scale model on the planning table: one building per chapter stop, lit when open / grey when locked / a flag when done (the model's states follow the save),
## and choosing a stop (mouse hover, mouse click, pad focus) changes the sheet beside it. Prints HOME-MAP-FLOW OK / FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func btn(b: int) -> void:
	var e := InputEventJoypadButton.new(); e.button_index = b; e.pressed = true
	Input.parse_input_event(e); await frames(2)
	var u := InputEventJoypadButton.new(); u.button_index = b; u.pressed = false
	Input.parse_input_event(u); await frames(2)

func hover(p: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(3)

func click_at(p: Vector2) -> void:
	await hover(p)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r); await frames(3)

## the point on a stop's paper tag, in the viewport's own pixels
func tag_at(c: Control) -> Vector2:
	return c.get_viewport().get_final_transform() * (c.get_global_transform_with_canvas() * Vector2(c.size.x * 0.5, c.size.y - 16.0))

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_HOME", ""); OS.set_environment("CB_UNLOCK_ALL", "")
	CbPad.enabled = true
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900); await frames(10)
	await _run()
	print("HOME-MAP-FLOW checks=%d" % checks)
	print("HOME-MAP-FLOW OK" if fails == 0 else "HOME-MAP-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _focus_name() -> String:
	var f := root.gui_get_focus_owner()
	return str(f.name) if f != null else ""

func _shown_chapters(map: Node) -> Array:
	var out: Array = []
	for n in 12:
		var g: Control = map.find_child("Site_%d" % n, true, false)
		if g != null and g.visible: out.append(n)
	return out

func _open_map() -> Node:
	if app.root.get_node_or_null("levels") != null: app.root.get_node("levels").queue_free(); await frames(3)
	var sm: Control = app.root.get_node("title").find_child("Strip_map", true, false)
	await frames(20)
	await click_at(app.root.get_viewport().get_final_transform() * (sm.get_global_transform_with_canvas() * (sm.size * 0.5))); await frames(4)
	return app.root.get_node_or_null("levels")

func _run() -> void:
	var C := WorksMap.Campaign
	C.attach(app); C.unlock_all = false; C.stars.clear()
	check(LabHome.is_up() and not app.started, "the lab is up behind the title")
	var map = await _open_map()
	check(map != null and HomeMap.model != null and HomeMap.sheet_w > 0.0, "the map opens as the site model with a sheet")
	if map == null or HomeMap.model == null: return
	var n_ch: int = WorksMap.CHAPTERS.size()
	check(n_ch == 12 and HomeMap.model.stops.size() == n_ch, "the model has one building per chapter (%d of %d)" % [HomeMap.model.stops.size(), n_ch])
	for n in n_ch:
		var b = HomeMap.model.get_node_or_null("Stop_%d" % n)
		check(b != null and b is Node3D and b.get_child_count() > 0, "chapter %d has a building node with parts" % n)
		check(map.find_child("Stop_%d" % n, true, false) is Button, "chapter %d has a tag the player can hover, click and focus" % n)
	# a fresh save: the prologue, the gate chapter and chapter 3 are open, the rest is locked
	var fresh := ["open", "open", "locked", "open", "locked", "locked", "locked", "locked", "locked", "locked", "locked", "locked"]
	for n in n_ch: check(HomeMap.model.states[n] == fresh[n] and (map.find_child("Stop_%d" % n, true, false) as HomeMap.StopBtn).state == fresh[n], "fresh save: chapter %d is %s on the model and on its tag (model '%s')" % [n, fresh[n], HomeMap.model.states[n]])
	# mouse: hovering a tag shows that chapter's sheet and only that one; a click does too
	for n in [3, 1, 0, 3]:
		await hover(tag_at(map.find_child("Stop_%d" % n, true, false)))
		check(_shown_chapters(map) == [n], "mouse hover on tag %d: the sheet shows chapter %d only (%s)" % [n, n, str(_shown_chapters(map))])
		check(HomeMap.model.sel == n, "mouse hover on tag %d: the model's marker moves to it" % n)
	await click_at(tag_at(map.find_child("Stop_1", true, false)))
	check(_shown_chapters(map) == [1] and app.root.get_node_or_null("homecard") == null, "a click on tag 1: its sheet shows, no card opens")
	check(map.find_child("Site_1", true, false).find_child("SiteTitle", true, false).text.begins_with("01"), "the sheet of chapter 1 is headed with chapter 1's number")
	# pad: the d-pad walks the tags and the sheet follows the focus
	await btn(JOY_BUTTON_B); await frames(2)
	map = await _open_map()
	var seen := {}
	var presses := 0
	while presses < 30 and not _focus_name().begins_with("Stop_"):
		await btn(JOY_BUTTON_DPAD_LEFT); presses += 1
	check(_focus_name().begins_with("Stop_"), "pad: the d-pad reaches a building tag (focus '%s')" % _focus_name())
	for dir in [JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_LEFT]:
		await btn(dir)
		var now := _focus_name()
		if now.begins_with("Stop_"):
			var k := int(now.trim_prefix("Stop_"))
			check(_shown_chapters(map) == [k] and HomeMap.model.sel == k, "pad: focus on %s shows chapter %d's sheet and marks its building" % [now, k])
			seen[k] = true
	check(seen.size() >= 2, "pad: the sheet changed between at least two chapters (%s)" % str(seen.keys()))
	# the save moves the model: chapter 1 done opens chapter 2 (the model is built when the map opens)
	for id in C.chapter_ids(1): C.stars[id] = 1
	map = await _open_map()
	check(HomeMap.model.states[1] == "done" and HomeMap.model.states[2] == "open" and HomeMap.model.states[4] == "locked", "chapter 1 starred: it is done, chapter 2 opens, chapter 4 stays locked (%s)" % str(HomeMap.model.states))
	var s1 := map.find_child("Stop_1", true, false) as HomeMap.StopBtn
	var s2 := map.find_child("Stop_2", true, false) as HomeMap.StopBtn
	check(s1.state == "done" and s2.state == "open", "the tags follow: 1 done, 2 open")
	await hover(tag_at(s2))
	var lv: WorksMap.NodeBtn = map.find_child("Site_2", true, false).find_child("Level_L05", true, false) as WorksMap.NodeBtn
	check(_shown_chapters(map) == [2] and lv != null and lv.state != "locked", "chapter 2's first job is playable on its sheet once chapter 1 is starred")
	C.stars.clear()
