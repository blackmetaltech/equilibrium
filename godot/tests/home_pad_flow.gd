extends SceneTree
## 0.12 "the lab as the game's home", by pad only: the title shows over the private lab, the Works Map is the plan on the planning table, a chosen job is a briefing card,
## Start work starts it. Every chapter is walked: d-pad to the chapter's first job, A opens the card, B goes back to the table (and from the table to the title), A again,
## A on Start work. Also the flag: with EqSettings.home_lab off the classic screens come up. Prints HOME-PAD-FLOW OK / FAILED n.
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

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_HOME", "")
	CbPad.enabled = true
	check(Input.get_connected_joypads().is_empty(), "no machine joypad reaches this test (run via scripts/flows.sh)")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900); await frames(10)
	await _run()
	print("HOME-PAD-FLOW checks=%d" % checks)
	print("HOME-PAD-FLOW OK" if fails == 0 else "HOME-PAD-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _focus_name() -> String:
	var f := root.gui_get_focus_owner()
	return str(f.name) if f != null else ""

## d-pad to a named control by the shortest run of presses over the focus neighbours the screen declares (breadth first from where the focus is); fails when none exists
## (a node the pad cannot reach) or when the focus does not end on it.
func _walk_to(name: String) -> bool:
	if _focus_name() == name: return true
	var start := root.gui_get_focus_owner()
	var tgt: Node = app.root.find_child(name, true, false)
	if start == null or tgt == null: return false
	var dirs := {"top": JOY_BUTTON_DPAD_UP, "bottom": JOY_BUTTON_DPAD_DOWN, "left": JOY_BUTTON_DPAD_LEFT, "right": JOY_BUTTON_DPAD_RIGHT}
	var prev := {start: null}; var how := {}; var q: Array = [start]
	while not q.is_empty() and not prev.has(tgt):
		var cur: Control = q.pop_front()
		for dn in dirs:
			var np: NodePath = cur.get("focus_neighbor_" + dn)
			if np.is_empty(): continue
			var nx := cur.get_node_or_null(np)
			if nx != null and not prev.has(nx): prev[nx] = cur; how[nx] = dirs[dn]; q.append(nx)
	if not prev.has(tgt): return false
	var path: Array = []; var c: Node = tgt
	while c != start: path.push_front(how[c]); c = prev[c]
	for b in path: await btn(b)
	return _focus_name() == name

func _chapter_firsts() -> Array:
	var out: Array = []
	for ch in WorksMap.CHAPTERS:
		for id in WorksMap.Campaign.ids:
			var n := str(id).trim_prefix("L")
			var num := 40 if str(id) == "CAREER" else (int(n) if n.is_valid_int() else -1)
			if num >= int(ch[4]) and num <= int(ch[5]): out.append(str(id)); break
	return out

func _run() -> void:
	WorksMap.Campaign.attach(app); WorksMap.Campaign.unlock_all = true
	check(LabHome.is_up() and not app.started, "the lab is up behind the title")
	var title = app.root.get_node_or_null("title")
	check(title != null, "the title is shown")
	var firsts := _chapter_firsts()
	check(firsts.size() >= 11, "the map lists the chapters (%d)" % firsts.size())
	for id in firsts:
		if not LabHome.is_up(): await frames(6)
		check(LabHome.is_up() and LabHome.up.view == "title", "%s: the title is over the lab" % id)
		check(await _walk_to("Strip_map"), "%s: the d-pad reaches Works map on the title (focus '%s')" % [id, _focus_name()])
		await btn(JOY_BUTTON_A); await frames(4)
		var map = app.root.get_node_or_null("levels")
		check(map != null and LabHome.up.view == "table", "%s: A opens the map and the camera goes to the planning table" % id)
		if map == null: break
		check(not (app.root.get_node("title") as Control).visible, "%s: the title menu steps aside while the map is on the table" % id)
		check(await _walk_to("Level_" + id), "%s: the d-pad reaches the chapter's first job (focus '%s')" % [id, _focus_name()])
		await btn(JOY_BUTTON_A); await frames(4)
		if id == "CAREER":
			check(app.started, "CAREER: A starts the Career directly (no engine card for it)")
			app.to_title(); await frames(8); continue
		var card = app.root.get_node_or_null("homecard")
		check(card != null and LabHome.up.view == "card" and not app.started, "%s: A opens the briefing card in the lab, nothing has started" % id)
		if card == null: break
		var lines := 0
		for c in card.find_children("CardLine", "Label", true, false): lines += 1
		check(lines >= 1 and lines <= 3, "%s: the card has at most three short lines (%d)" % [id, lines])
		check(card.find_children("CardCallIt", "Label", true, false).size() <= 1, "%s: at most one Call it" % id)
		await btn(JOY_BUTTON_B); await frames(4)
		check(app.root.get_node_or_null("homecard") == null and app.root.get_node_or_null("levels") != null and (app.root.get_node("levels") as Control).visible and LabHome.up.view == "table", "%s: B closes the card and shows the table again" % id)
		await btn(JOY_BUTTON_A); await frames(4)
		check(app.root.get_node_or_null("homecard") != null, "%s: A on the focused job opens the card again (focus '%s')" % [id, _focus_name()])
		check(_focus_name() == "CardStart", "%s: pad focus sits on Start work" % id)
		await btn(JOY_BUTTON_A); await frames(8)
		check(app.started and str(app.b.g.get("level", "")) == id, "%s: Start work starts the level (level '%s')" % [id, str(app.b.g.get("level", ""))])
		check(not LabHome.is_up(), "%s: the lab is gone when the level runs" % id)
		app.to_title(); await frames(10)
	# B on the map goes back to the title view
	await _walk_to("Strip_map"); await btn(JOY_BUTTON_A); await frames(4)
	await btn(JOY_BUTTON_B); await frames(4)
	check(app.root.get_node_or_null("levels") == null and LabHome.is_up() and LabHome.up.view == "title" and (app.root.get_node("title") as Control).visible, "B on the map: back to the title over the lab")
	# the flag, from the title's own strip: off = the classic screens and no lab; on again brings the lab back
	check(await _walk_to("Strip_home"), "the d-pad reaches the Lab home strip (focus '%s')" % _focus_name())
	await btn(JOY_BUTTON_A); await frames(4)
	check(not EqSettings.home_lab and not LabHome.is_up(), "A on the strip: flag off, no lab behind the title")
	WorksMap.open(app); await frames(3)
	var m2 = app.root.get_node_or_null("levels")
	check(m2 != null and m2.find_child("Level_L01", true, false) != null and (app.root.get_node("title") as Control).visible, "flag off: the classic Works Map opens over the title")
	app.back(); await frames(2)
	check(await _walk_to("Strip_home"), "the strip is still reachable")
	await btn(JOY_BUTTON_A); await frames(6)
	check(EqSettings.home_lab and LabHome.is_up(), "A again: the lab is back")
