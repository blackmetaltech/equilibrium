extends SceneTree
## Round 6b fixes (F13): L24 checklist row says "from 130 down to 125"; Career: the alert strip with JUMP TO PLANT, +3 MONTHS dark after a stop and CONTINUE ANYWAY, one inspection state per card,
## one catalyst vocabulary, BOOK weighs cost against risk, Flagship everywhere, the annual memo as a table, the third flask rule on the end slip.
## Run: godot --headless --path godot --script res://tests/fix13_flow.gd
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
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	elif n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func board() -> CareerBoard: return app.lvbay.panel as CareerBoard

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	await _l24(); await _office(); await _advance_lock(); await _memo_and_slip()
	print("FIX13-FLOW checks=%d" % checks)
	print("FIX13-FLOW OK" if fails == 0 else "FIX13-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## L24: the interlock row says what to do to the default, the notebook agrees, and the speed guidance is 16x.
func _l24() -> void:
	await level("L24")
	var li: Dictionary = app.b.q("levelInfo")
	var rows: Array = li.get("buildGuide", [])
	var ilk := ""
	for r in rows: if str(r.id) == "ilk": ilk = str(r.text)
	check(ilk.contains("from 130 down to 125"), "the interlock row says 'from 130 down to 125' (%s)" % ilk)
	var nb := " ".join(PackedStringArray(li.get("note", [])))
	check(nb.contains("from its default 130 °C down to 125 °C"), "and the notebook says the same")
	var start := ""
	for r in rows: if str(r.id) == "start": start = str(r.text)
	check(start.contains("16x") and not nb.contains("4x until"), "the start row and the notebook speak 16x (%s)" % start)

## The office: alert strip, one inspection line, one catalyst vocabulary, BOOK weighs.
func _office() -> void:
	await level("CAREER"); await refresh()
	var b := board()
	check(b.find_child("AlertStrip", true, false) != null, "the office top has an alert strip")
	for i in 10: act("advance", [1])
	await refresh(); b = board()
	var al: Array = view().dashboard.alerts
	check(al.size() >= 1, "after ten months an inspection is due: %d alerts" % al.size())
	var jumps: Array = b.find_children("Jump_*", "Button", true, false)
	var plants_with := {}
	for x in al: plants_with[str(x.plant)] = true
	check(jumps.size() == plants_with.size() and jumps.size() >= 1, "each plant with an alert has a JUMP TO PLANT key (%d for %d plants)" % [jumps.size(), plants_with.size()])
	b.scroll.scroll_vertical = 0; await frames(2)
	var pid := str(al[0].plant)
	(jumps[0] as Button).pressed.emit(); await frames(3)
	check(b.scroll.scroll_vertical > 100, "JUMP TO PLANT scrolls to the card (%d)" % b.scroll.scroll_vertical)
	var card: Control = b._cards.get(pid)
	check(card != null and absf(card.global_position.y - b.scroll.global_position.y) < 60.0, "the card is at the top of the view")
	var notes: Array = b.find_children("InspNote_*", "Label", true, false)
	check(notes.size() == 4, "one inspection line per plant card (%d)" % notes.size())
	var t := all_text(b)
	check(not t.contains("INSPECT is locked"), "no second 'locked' line beside the state")
	var kinds := {}
	for p in view().plants: kinds[str(p.inspectionState)] = true
	check(kinds.has("due"), "the plants are in the due state: %s" % str(kinds.keys()))
	check(t.contains("BUY CATALYST") and not t.contains("no catalyst in stock"), "catalyst vocabulary: BUY CATALYST, never 'no catalyst in stock'")
	act("buyCatalyst", ["nh3"]); await refresh(); b = board()
	t = all_text(b)
	check(t.contains("CATALYST: 1 CHARGE IN STOCK"), "after buying: 'CATALYST: 1 CHARGE IN STOCK'")
	var ww: Array = b.find_children("BookWeigh_nh3", "Label", true, false)
	check(ww.size() == 1 and (ww[0] as Label).text.contains("MUSD now") and (ww[0] as Label).text.contains("incidents over twelve months"), "BOOK weighs the cost of booking against the cost of not booking: %s" % ((ww[0] as Label).text.left(90) if not ww.is_empty() else "none"))
	check(not t.contains("above nominal"), "no 'above nominal' noise")

## +3 MONTHS stops at a warning, goes dark for about a second, then needs CONTINUE ANYWAY.
func _advance_lock() -> void:
	await level("CAREER"); await refresh()
	var b := board()
	var guard := 0
	while guard < 30 and not bool(view().dashboard.needsAck) and str(view().dashboard.ending) == "":
		b.advance_months(3); await frames(12); guard += 1   # not awaited to the end: the one-second dark period after a stop must still be running when we look
	check(bool(view().dashboard.needsAck), "a +3 MONTHS stop at a warning leaves it unacknowledged (%d presses)" % guard)
	b = board()
	var k3 := b.find_child("Advance3", true, false) as Button
	check(k3 != null and k3.disabled, "+3 MONTHS is dark right after the stop")
	var ca := b.find_child("ContinueAnyway", true, false) as Button
	check(ca != null and ca.disabled, "CONTINUE ANYWAY is dark for the first second too")
	check(b.find_child("Stopped", true, false) != null, "the stop is named on the board")
	await create_timer(1.3).timeout; await frames(3)
	b = board(); ca = b.find_child("ContinueAnyway", true, false) as Button
	check(ca != null and not ca.disabled, "after about a second CONTINUE ANYWAY opens")
	k3 = b.find_child("Advance3", true, false) as Button
	check(k3 != null and k3.disabled, "and +3 MONTHS stays dark until the warning is acknowledged")
	var m0 := int(view().dashboard.month)
	act("advance", [3])
	check(int(view().dashboard.month) == m0, "a +3 sent past the board is refused by the engine")
	ca.pressed.emit(); await frames(4); b = board()
	check(not bool(view().dashboard.needsAck), "CONTINUE ANYWAY acknowledges it")
	k3 = b.find_child("Advance3", true, false) as Button
	check(k3 != null and not k3.disabled, "+3 MONTHS is lit again")

## The memo is a table, the top ending is FLAGSHIP, and the end slip carries the third flask rule.
func _memo_and_slip() -> void:
	await level("CAREER"); await refresh()
	for i in 13: act("advance", [1])
	await refresh()
	var b := board()
	check(b.find_child("MemoMoney", true, false) is GridContainer and b.find_child("MemoScores", true, false) is GridContainer, "the annual memo is a pair of tables")
	var t := all_text(b)
	check(t.contains("REVENUE") and t.contains("OPERATING MARGIN (the score)") and t.contains("THIS YEAR") and t.contains("LAST YEAR"), "with the money rows and the year columns")
	check(t.contains("FLAGSHIP") or t.contains("Flagship"), "the top ending is called Flagship on the board")
	check(not t.contains("Chief Engineer") and not t.contains("CHIEF ENGINEER"), "and never Chief Engineer")
	check(t.contains("Regulator strike rule"), "the strike rule is stated on the alert strip or the board")
	var rules: Array = app.b.q("levelInfo").stars.rules
	check(rules.size() == 3 and str(rules[2]).contains("reference engineer"), "the level info carries the third flask rule: %s" % str(rules[2]).left(60))
	# the end slip: finish the career quickly with idle months, then read the printout
	var guard := 0
	while str(view().dashboard.ending) == "" and guard < 80:
		act("ackWarning", []); act("advance", [12]); guard += 1
	await frames(6)
	Printout.open(app); await frames(8)
	var slip := app.find_child("FlaskRule3", true, false) as Label
	check(slip != null and slip.text.begins_with("FLASK 3:") and slip.text.contains("reference engineer"), "the end slip states the third flask rule: %s" % (slip.text.left(70) if slip != null else "none"))
