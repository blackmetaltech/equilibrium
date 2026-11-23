extends SceneTree
## 0.12 "the lab as the game's home", by mouse clicks only (hover lights a chapter, a click opens it): the title shows over the private lab, the Works Map is the plan on the planning table, a chosen job is a briefing card,
## Start work starts it. Every chapter is walked: a click on the chapter's first job opens the card, Back closes it, a click again, a click on Start work. Also the flag: with EqSettings.home_lab off the classic screens come up. Prints HOME-MOUSE-FLOW OK / FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func click_at(p: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(2)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e); await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r); await frames(3)

## A control's centre in the viewport's own pixels (the shell scales the canvas: a rect read in canvas units is not where the mouse has to go).
func at(c: Control) -> Vector2:
	return c.get_viewport().get_final_transform() * (c.get_global_transform_with_canvas() * (c.size * 0.5))

## Wait until a control holds still (a wheel scroll glides for a while).
func settle(c: Control) -> void:
	var last := Vector2(-1, -1); var same := 0; var n := 0
	while same < 4 and n < 120:
		await frames(1); n += 1
		var p := c.get_global_rect().position
		same = same + 1 if p == last else 0; last = p

func hover(p: Vector2) -> void:
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(3)

func wheel(p: Vector2, up: bool) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_WHEEL_UP if up else MOUSE_BUTTON_WHEEL_DOWN; e.position = p; e.global_position = p; e.pressed = true; Input.parse_input_event(e); await frames(1)
	var e2 := InputEventMouseButton.new(); e2.button_index = e.button_index; e2.position = p; e2.global_position = p; e2.pressed = false; Input.parse_input_event(e2); await frames(2)

## Click a control by its centre. A job node inside the map's list is first scrolled into view with the mouse wheel.
func click(c: Control, in_list := false) -> void:
	if in_list:
		var sc: ScrollContainer = app.root.get_node("levels").find_child("List", true, false)
		var n := 0
		while n < 40:
			var vr: Rect2 = sc.get_global_rect(); var r: Rect2 = c.get_global_rect()
			if r.position.y >= vr.position.y + 40.0 and r.end.y <= vr.end.y - 120.0: break   # well inside: a press focuses the node and the list follows the focus, which would move it from under the mouse
			await wheel(at(sc), r.position.y < vr.position.y); n += 1
		await settle(c)
	await click_at(at(c))

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_HOME", "")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900); await frames(10)
	await _run()
	print("HOME-MOUSE-FLOW checks=%d" % checks)
	print("HOME-MOUSE-FLOW OK" if fails == 0 else "HOME-MOUSE-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

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
	var firsts := _chapter_firsts()
	check(firsts.size() >= 11, "the map lists the chapters (%d)" % firsts.size())
	for id in firsts:
		if not LabHome.is_up(): await frames(6)
		check(LabHome.is_up() and LabHome.up.view == "title", "%s: the title is over the lab" % id)
		var sm: Control = app.root.get_node("title").find_child("Strip_map", true, false)
		await frames(20)
		await click(sm); await frames(3)
		var map = app.root.get_node_or_null("levels")
		check(map != null and LabHome.up.view == "table", "%s: a click on Works map opens it and the camera goes to the planning table" % id)
		if map == null: break
		var nb: Control = map.find_child("Level_" + id, true, false)
		check(nb != null, "%s: the map has the chapter's first job" % id)
		if nb == null: break
		# hover lights the node
		var sc: ScrollContainer = map.find_child("List", true, false)
		var n0 := 0
		while n0 < 40:
			var vr: Rect2 = sc.get_global_rect(); var r: Rect2 = nb.get_global_rect()
			if r.position.y >= vr.position.y + 40.0 and r.end.y <= vr.end.y - 120.0: break   # well inside: a press focuses the node and the list follows the focus, which would move it from under the mouse
			await wheel(at(sc), r.position.y < vr.position.y); n0 += 1
		await settle(nb)
		await hover(at(nb))
		check(nb.is_hovered(), "%s: hovering the job lights it" % id)
		await click_at(at(nb)); await frames(3)
		if id == "CAREER":
			check(app.started, "CAREER: a click starts the Career directly (no engine card for it)")
			app.to_title(); await frames(8); continue
		var card = app.root.get_node_or_null("homecard")
		check(card != null and LabHome.up.view == "card" and not app.started, "%s: a click opens the briefing card in the lab, nothing has started" % id)
		if card == null: break
		var lines := 0
		for c in card.find_children("CardLine", "Label", true, false): lines += 1
		check(lines >= 1 and lines <= 3, "%s: the card has at most three short lines (%d)" % [id, lines])
		check(card.find_children("CardCallIt", "Label", true, false).size() <= 1, "%s: at most one Call it" % id)
		await click(card.find_child("CardBack", true, false)); await frames(3)
		check(app.root.get_node_or_null("homecard") == null and (app.root.get_node("levels") as Control).visible and LabHome.up.view == "table", "%s: Back closes the card and shows the table again" % id)
		await click(nb, true); await frames(3)
		check(app.root.get_node_or_null("homecard") != null, "%s: a click on the job opens the card again" % id)
		await click(app.root.get_node("homecard").find_child("CardStart", true, false)); await frames(8)
		check(app.started and str(app.b.g.get("level", "")) == id, "%s: Start work starts the level (level '%s')" % [id, str(app.b.g.get("level", ""))])
		check(not LabHome.is_up(), "%s: the lab is gone when the level runs" % id)
		app.to_title(); await frames(10)
	# the map's own Close, then the Lab home strip
	await click(app.root.get_node("title").find_child("Strip_map", true, false)); await frames(3)
	await click(app.root.get_node("levels").find_child("Close", true, false)); await frames(3)
	check(app.root.get_node_or_null("levels") == null and LabHome.up.view == "title" and (app.root.get_node("title") as Control).visible, "Close on the map: back to the title over the lab")
	await click(app.root.get_node("title").find_child("Strip_home", true, false)); await frames(4)
	check(not EqSettings.home_lab and not LabHome.is_up(), "a click on the Lab home strip: flag off, no lab")
	await click(app.root.get_node("title").find_child("Strip_map", true, false)); await frames(3)
	check(app.root.get_node_or_null("levels") != null and (app.root.get_node("levels") as Control).find_child("Level_L01", true, false) != null, "flag off: the classic map opens by a click")
	app.back(); await frames(2)
	await click(app.root.get_node("title").find_child("Strip_home", true, false)); await frames(6)
	check(EqSettings.home_lab and LabHome.is_up(), "a click again: the lab is back")
