extends SceneTree
## F24 (0.7 Career): the board does not re-lay-out under the cursor (a card keeps its height through a purchase or a booking), BOOK confirms itself (a stamp on the card and a toast), every cash purchase asks twice
## (INSPECT, the programmes, HIRE CREW, BUY CATALYST), the red banners stop at two lines on a handheld with a "more" key, INSPECT says what it does not reset.
## Run: godot --headless --path godot --script res://tests/fix24_flow.gd  (1280x800 and 1920x1080)
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
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", [name] + args); app.game_on_changed(); return r
func view() -> Dictionary: return app.b.q("levelView")
func refresh() -> void:
	app.lvbay.refresh(true); await frames(4)
func board() -> CareerBoard: return app.lvbay.panel as CareerBoard
func press(nm: String) -> void:
	var b := board(); var k := b.find_child(nm, true, false) as Button
	check(k != null, "key %s exists" % nm)
	if k != null: k.pressed.emit()
	await frames(4)
func key_text(nm: String) -> String:
	var k := board().find_child(nm, true, false) as Button
	return k.text if k != null else "-"

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _purchases(sz); await _book_stable(sz); await _banners(sz); app.pinned_seed = -1   # the banners pin a seed (see _banners); the rest runs as before
	print("FIX24-FLOW checks=%d" % checks)
	print("FIX24-FLOW OK" if fails == 0 else "FIX24-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## INSPECT, a heat-recovery level and HIRE CREW each pay on the second press only; CANCEL disarms; INSPECT says what it leaves alone.
func _purchases(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1])
	for i in 7: act("advance", [1])
	await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	var b := board(); b.open_all(); await frames(4)
	var dn := b.find_child("InspectDoes_nh3", true, false) as Label
	check(dn != null and dn.text.contains("resets only the inspection clock") and dn.text.contains("does not renew the catalyst"), "INSPECT says what it does and does not reset" + tag)
	var cash0 := float(view().dashboard.cashUSD)
	await press("Inspect_nh3")
	check(key_text("Inspect_nh3").begins_with("PRESS AGAIN") and float(view().dashboard.cashUSD) == cash0, "one press of INSPECT arms it and pays nothing: %s%s" % [key_text("Inspect_nh3"), tag])
	await press("InspectCancel_nh3")
	check(key_text("Inspect_nh3").begins_with("INSPECT") and board().find_child("InspectCancel_nh3", true, false) == null, "CANCEL disarms INSPECT" + tag)
	await press("Inspect_nh3"); await press("Inspect_nh3")
	check(float(view().dashboard.cashUSD) < cash0 and int(view().plants[0].monthsSinceInspection) == 0, "the second press inspects" + tag)
	var lvl0 := int(view().options.invest.heat.level); cash0 = float(view().dashboard.cashUSD)
	await press("Invest_heat")
	check(int(view().options.invest.heat.level) == lvl0 and key_text("Invest_heat").begins_with("PRESS AGAIN TO BUY"), "one press of a programme pays nothing: %s%s" % [key_text("Invest_heat"), tag])
	await press("Invest_heat")
	check(int(view().options.invest.heat.level) == lvl0 + 1 and float(view().dashboard.cashUSD) < cash0, "the second press buys the level" + tag)
	var crews0 := int(view().options.crews.hired)
	await press("HireCrew")
	check(int(view().options.crews.hired) == crews0 and key_text("HireCrew").begins_with("PRESS AGAIN TO HIRE"), "one press of HIRE CREW hires nobody: %s%s" % [key_text("HireCrew"), tag])
	await press("HireCancel")
	check(key_text("HireCrew") == "HIRE CREW", "CANCEL disarms HIRE CREW" + tag)
	await press("HireCrew"); await press("HireCrew")
	check(int(view().options.crews.hired) == crews0 + 1, "the second press hires" + tag)

## BUY CATALYST then BOOK: the cards below never move, BOOK stamps the card and speaks.
func _book_stable(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1]); await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	var b := board(); b.open_all(); await frames(4)
	var y0 := {}
	for id in ["acid", "meoh", "etoh"]: y0[id] = (b.find_child("Book_" + id, true, false) as Control).get_global_rect().position.y - b.scroll.scroll_vertical
	await press("Catalyst_nh3"); await press("Catalyst_nh3")
	check(int(view().plants[0].catalystStock) == 1, "the catalyst is bought" + tag)
	b = board()
	for id in ["acid", "meoh", "etoh"]:
		var y1 := (b.find_child("Book_" + id, true, false) as Control).get_global_rect().position.y - b.scroll.scroll_vertical
		check(absf(y1 - float(y0[id])) < 1.5, "the %s card did not move after BUY CATALYST (%.1f -> %.1f)%s" % [id, float(y0[id]), y1, tag])
	await press("Book_nh3"); await press("Book_nh3")   # F31: BOOK asks twice
	check(int(view().plants[0].turnaroundMonth) >= 0, "BOOK books" + tag)
	b = board()
	var st := b.find_child("Booked_nh3", true, false)
	check(st != null, "a BOOKED stamp sits on the plant card" + tag)
	var said := false
	for l in app.chrome.intercom.lines: if str(l.get("text", "")).begins_with("BOOKED: the ammonia turnaround is booked for month"): said = true
	check(said, "and the intercom said so" + tag)
	for id in ["acid", "meoh", "etoh"]:
		var y2 := (b.find_child("Book_" + id, true, false) as Control).get_global_rect().position.y - b.scroll.scroll_vertical
		check(absf(y2 - float(y0[id])) < 1.5, "the %s card did not move after BOOK (%.1f -> %.1f)%s" % [id, float(y0[id]), y2, tag])

## The red banners are cut at two lines on a handheld, with "more" to open them in full.
func _banners(sz: Vector2i) -> void:
	# 0.13: the cause of this check's 1-in-3 failure: the Career seed came from the wall clock, so the stop's text changed run to run (inspections only, or
	# inspections with the inerts incident, or the emissions warning), and the short one fits in two lines at 1280x800, so no "more" key was due. Pinned seed.
	app.pinned_seed = 4
	await level("CAREER"); act("answer", [1])
	for i in 9: act("advance", [1])
	await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	var b := board()
	await press("Advance3")
	b = board()
	var sp := b.find_child("Stopped", true, false) as Label
	check(sp != null, "the stop is shown" + tag)
	if sp == null: return
	if sz.x < 1600:
		check(sp.max_lines_visible == 2, "on the handheld the Stopped banner is cut at two lines" + tag)
		var mk := b.find_child("StoppedMore", true, false) as Button
		check(mk != null, "with a more key" + tag)
		check(sp.tooltip_text.contains("Open warning"), "and the whole text in its tooltip" + tag)
		# the key is shown a frame or two after the banner (the board settles): wait for it, at most 120 frames, instead of racing one frame
		for i in 120:
			b = board(); mk = b.find_child("StoppedMore", true, false) as Button
			if mk != null and mk.visible: break
			await process_frame
		check(mk != null and mk.visible, "the more key is visible" + tag)
		if mk != null and mk.visible:
			mk.pressed.emit(); await frames(4); b = board(); sp = b.find_child("Stopped", true, false) as Label
			check(sp.max_lines_visible == -1 or sp.max_lines_visible == 0, "more opens it in full" + tag)
	else:
		check(sp.max_lines_visible <= 0, "on a desktop the banner is whole" + tag)
