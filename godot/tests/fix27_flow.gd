extends SceneTree
## F27 (0.8 Career): a Career survives a crash (save, rebuild the app, reopen: same month, cash, seed and pending card; CB_LEVEL=C resumes, CB_NEW=1 starts fresh, the menu path asks RESUME / NEW CAREER),
## the board keeps its layout (the scroll anchor holds a card through ACCEPT / DECLINE and through folding the pinned decision card, a buy key never widens or shifts its neighbours), and STRIKE AHEAD is one
## banner (a line per plant, details behind "more").
## Run: godot --headless --path godot --script res://tests/fix27_flow.gd  (1280x800 and 1920x1080). Backs up and restores the real autosave file; the resume file is a scratch path.
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
func gy(nm: String) -> float:
	var c := board().find_child(nm, true, false) as Control
	return c.get_global_rect().position.y if c != null else -9999.0
func gx(nm: String) -> float:
	var c := board().find_child(nm, true, false) as Control
	return c.get_global_rect().position.x if c != null else -9999.0
func fresh_app() -> void:
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(10)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	var backup := ""
	if FileAccess.file_exists(CareerSave.engine_file()): backup = FileAccess.get_file_as_string(CareerSave.engine_file())
	await fresh_app(); CbSettings.persist = false
	await _resume()
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _layout(sz); await _strike_banner(sz)
	if backup != "":
		var f := FileAccess.open(CareerSave.engine_file(), FileAccess.WRITE); f.store_string(backup); f.close()
	CareerSave.force = false; CareerSave.clear()
	print("FIX27-FLOW checks=%d" % checks)
	print("FIX27-FLOW OK" if fails == 0 else "FIX27-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## Save, rebuild the app, reopen: the same month, cash, seed and pending card.
func _resume() -> void:
	CareerSave.force = true; CareerSave.path = "user://eq_career_resume_f27_test.json"; CareerSave.clear()
	check(CareerSave.info().is_empty(), "no saved career to start with")
	await level("CAREER"); act("answer", [1])
	for i in 12: act("advance", [1])
	act("setRate", ["nh3", 0.85])
	await frames(4)   # the flush runs in _process, the frame after the change
	var d0: Dictionary = view().dashboard
	var cash0 := float(d0.cashUSD); var m0 := int(d0.month)
	var pend0: bool = view().dashboard.decision != null and bool(view().dashboard.decision.pending)
	check(m0 == 12 and pend0, "a year in, a yearly card waits (month %d)" % m0)
	var inf := CareerSave.info(); var seed0 := int(inf.get("seed", -1))
	check(not inf.is_empty() and int(inf.month) == 12 and bool(inf.pending) and int(inf.seed) > 0 and absf(float(inf.cash) - cash0) < 1.0, "the career file holds the month, the cash, the seed and the pending card: %s" % str(inf))
	# an unrelated autosave (another level) does not touch the career file
	app.b.act("startLevel", ["L00", 5, "learner"]); app.b.act("save", ["auto"])
	check(int(CareerSave.info().get("month", -1)) == 12, "another level's autosave leaves the career file alone")
	# the window dies; the game starts again with CB_LEVEL=C
	app.set_process(false); app.b.stop(); app.queue_free(); await frames(4)
	OS.set_environment("CB_LEVEL", "C")
	await fresh_app()
	OS.unset_environment("CB_LEVEL")
	check(str(app.b.g.get("level", "")) == "CAREER", "CB_LEVEL=C reopens the Career")
	var d1: Dictionary = view().dashboard
	check(int(d1.month) == m0 and absf(float(d1.cashUSD) - cash0) < 1.0 and int(CareerSave.info().get("seed", -2)) == seed0, "...at the same month %d, cash %.1f and seed %d (got %d, %.1f)" % [m0, cash0 / 1e6, seed0, int(d1.month), float(d1.cashUSD) / 1e6])
	CareerSave.store(app); check(int(CareerSave.info().get("seed", -2)) == seed0, "...saved again from the resumed game: still seed %d" % seed0)
	check(d1.decision != null and bool(d1.decision.pending), "...with the yearly card still pending")
	await refresh()
	check(absf(float(view().plants[0].rate) - 0.85) < 0.001, "...and the rate set before the crash")
	# CB_NEW=1 starts a fresh run
	app.set_process(false); app.b.stop(); app.queue_free(); await frames(4)
	OS.set_environment("CB_LEVEL", "C"); OS.set_environment("CB_NEW", "1")
	await fresh_app()
	OS.unset_environment("CB_LEVEL"); OS.unset_environment("CB_NEW")
	check(str(app.b.g.get("level", "")) == "CAREER" and int(view().dashboard.month) == 0, "CB_NEW=1 starts a new career at month 0")
	# the menu path asks: RESUME month N or NEW CAREER (the saved run was dropped by CB_NEW, so save a run again first)
	for i in 3: act("advance", [1])
	await frames(4)
	check(int(CareerSave.info().get("month", -1)) == 3, "the new career is saved as it runs")
	app.start_level("CAREER", true); await frames(4)
	var dlg = app.root.get_node_or_null("career_resume")
	check(dlg != null, "opening the Career with a run saved asks RESUME or NEW CAREER")
	if dlg != null:
		check(dlg.find_child("CareerResume", true, false) != null and (dlg.find_child("CareerResume", true, false) as Button).text == "RESUME month 4" and dlg.find_child("CareerNew", true, false) != null, "the choice names month 4")
		act("advance", [1]); await frames(4)   # play on, then take the resume key: the saved month comes back
		(dlg.find_child("CareerResume", true, false) as Button).pressed.emit(); await frames(6)
		check(int(view().dashboard.month) == 4, "RESUME loads the saved month (the run had moved on to month 4 and saved it)")
		app.start_level("CAREER", true); await frames(4)
		dlg = app.root.get_node_or_null("career_resume")
		if dlg != null:
			(dlg.find_child("CareerNew", true, false) as Button).pressed.emit(); await frames(6)
			check(int(view().dashboard.month) == 0, "NEW CAREER starts at month 0")
	CareerSave.force = false

## The scroll anchor, reserved widths and the offer rows.
func _layout(sz: Vector2i) -> void:
	CareerSave.force = false
	var tag := " (%dx%d)" % [sz.x, sz.y]
	await level("CAREER"); act("answer", [1]); await refresh()
	var b := board(); b.open_all(); await frames(4)
	# a buy key keeps its width and its neighbours stay put through arm and cancel
	var x_abate := gx("Invest_abate"); var x_safety := gx("Invest_safety"); var x_hire := gx("HireCrew")
	var w_heat := (b.find_child("Invest_heat", true, false) as Control).size.x
	await press("Invest_heat")
	check(key_text("Invest_heat").begins_with("PRESS AGAIN TO BUY"), "Invest_heat is armed" + tag)
	b = board()
	check(absf(gx("Invest_abate") - x_abate) < 1.5 and absf(gx("Invest_safety") - x_safety) < 1.5 and absf(gx("HireCrew") - x_hire) < 1.5, "arming a programme moves no neighbour sideways (abate %.0f -> %.0f)%s" % [x_abate, gx("Invest_abate"), tag])
	check(absf((b.find_child("Invest_heat", true, false) as Control).size.x - w_heat) < 1.5, "the armed key has the width of the idle one" + tag)
	await press("InvestCancel_heat")
	check(absf(gx("Invest_abate") - x_abate) < 1.5, "cancelling moves nothing either" + tag)
	await press("HireCrew")
	check(absf(gx("Invest_abate") - x_abate) < 1.5 and absf(gx("Invest_safety") - x_safety) < 1.5, "arming HIRE CREW moves no programme key" + tag)
	await press("HireCancel")
	# an offer settles in place: the offers and cards below do not move; the scroll position is kept
	b = board(); b.open_all(); await frames(4)
	var offers: Array = view().offers
	check(offers.size() >= 2, "there are offers on the desk" + tag)
	if offers.size() >= 2:
		var o_id := int(offers[0].id)
		b.scroll.scroll_vertical = maxi(0, int(b.find_child("Accept_%d" % o_id, true, false).get_global_rect().position.y - b.scroll.global_position.y + b.scroll.scroll_vertical) - 40)
		await frames(4)
		var s0 := b.scroll.scroll_vertical; var y_next := gy("Accept_%d" % int(offers[1].id)); var y_inv := gy("Invest_heat"); var y_book := gy("Catalyst_nh3")
		var cant := bool(offers[0].get("overCapacity", false)) or str(offers[0].get("taNote", "")) != ""
		await press("Decline_%d" % o_id)
		await create_timer(1.0).timeout; await frames(4)
		b = board()
		# what the reader sees must not move (checked on screen below); the raw scroll value may shift by exactly what shrank ABOVE the view (F29: the alert strip
		# loses its offer line on a decline), so it is only bounded here
		check(absf(b.scroll.scroll_vertical - s0) <= 80.0, "DECLINE keeps the scroll near where it was (%d -> %d)%s" % [s0, b.scroll.scroll_vertical, tag])
		check(absf(gy("Accept_%d" % int(offers[1].id)) - y_next) < 2.0, "the next offer stays where it was (%.0f -> %.0f)%s" % [y_next, gy("Accept_%d" % int(offers[1].id)), tag])
		check(absf(gy("Invest_heat") - y_inv) < 2.0 and absf(gy("Catalyst_nh3") - y_book) < 2.0, "nothing else on the board reflowed after DECLINE" + tag)
		check(b.find_child("OfferSettled", true, false) != null, "the declined offer is one settled row" + tag)
	# folding the pinned decision card does not move what the reader is looking at
	for i in 12: act("advance", [1])
	await refresh()
	b = board(); b.open_all(); await frames(4)
	var dc: Variant = view().dashboard.decision
	check(dc is Dictionary and bool((dc as Dictionary).pending), "a card waits at month 12" + tag)
	b.scroll.scroll_vertical = maxi(0, b.scroll.get_v_scroll_bar().max_value * 0.4); await frames(4)
	var y_before := gy("Invest_heat")
	if b.find_child("DecisionDetails", true, false) != null:
		await press("DecisionDetails"); await frames(4)
		check(absf(gy("Invest_heat") - y_before) < 3.0, "folding or opening the decision card keeps the board where it was (%.0f -> %.0f)%s" % [y_before, gy("Invest_heat"), tag])
		await press("DecisionDetails"); await frames(4)
		check(absf(gy("Invest_heat") - y_before) < 3.0, "and so does the second press (%.0f -> %.0f)%s" % [y_before, gy("Invest_heat"), tag])
func key_text(nm: String) -> String:
	var k := board().find_child(nm, true, false) as Button
	return k.text if k != null else "-"

## At month 12 every plant is a strike ahead: one banner, a line per plant, the paragraphs behind "more"; the keys stay on screen.
func _strike_banner(sz: Vector2i) -> void:
	var tag := " (%dx%d)" % [sz.x, sz.y]
	await level("CAREER"); act("answer", [1])
	for i in 12: act("advance", [1])
	await refresh()
	var b := board()
	check((view().dashboard.strikeWarn as Array).size() == 4, "all four plants are a strike ahead" + tag)
	var head := b.find_child("StrikeWarn", true, false) as Label
	check(head != null and head.text.begins_with("STRIKE AHEAD at the year-end check in month 24"), "one headline" + tag)
	var lines := b.find_children("StrikeLine*", "Label", true, false)
	check(lines.size() == 4, "one short line per plant (%d)%s" % [lines.size(), tag])
	check(b.find_children("StrikeDetail*", "Label", true, false).is_empty(), "the paragraphs are behind more" + tag)
	var box := b.find_child("StrikeWarnBox", true, false) as Control
	check(box != null and box.size.y < 150.0, "the banner is short (%.0f px)%s" % [box.size.y if box != null else -1.0, tag])
	var a1 := b.find_child("Advance1", true, false) as Control
	check(a1 != null and a1.get_global_rect().end.y <= float(root.size.y), "ADVANCE 1 MONTH is on screen" + tag)
	await press("StrikeWarnMore")
	check(b.find_children("StrikeDetail*", "Label", true, false).size() == 4, "more opens the four paragraphs" + tag)
	await press("StrikeWarnMore")
	check(b.find_children("StrikeDetail*", "Label", true, false).is_empty(), "and folds them again" + tag)
