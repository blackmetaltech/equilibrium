extends SceneTree
## F19 (Career, "The Works you run"): the board prices an overlap at BOOK time, warns of the emissions strike above the scroll with its levers, BUY CATALYST stays armed until pressed again or cancelled,
## BOOK without a charge says why, the outage change is explained in the BOOK row, the card's button and effect line agree, the annual review opens as a card at the year end with last year's card priced,
## and the end card says why. Run: godot --headless --path godot --script res://tests/fix19_flow.gd  (at 1280x800 and 1920x1080)
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func level(id: String) -> void:
	app.pinned_seed = 1003   # one seed: a random seed can shut the 110 % plant before the warning (F24 saw seed 16)
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", [name] + args); app.game_on_changed(); return r
func view() -> Dictionary: return app.b.q("levelView")
func refresh() -> void:
	app.lvbay.refresh(true); await frames(4)
func board() -> CareerBoard: return app.lvbay.panel as CareerBoard
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _overlap(sz); await _emissions(sz); await _catalyst_book(sz); await _card_rounding(sz); await _year_popup(sz); await _ending_why(sz)
	print("FIX19-FLOW checks=%d" % checks)
	print("FIX19-FLOW OK" if fails == 0 else "FIX19-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## Two turnarounds in one month: the BOOK row prices the overlap (extra days, MUSD) and names the first free month; a clear month shows nothing.
func _overlap(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1]); await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	act("buyCatalyst", ["nh3"]); act("buyCatalyst", ["meoh"]); act("turnaround", ["nh3", 5, 1, 0])
	await refresh()
	var b := board(); b.open_all(); await frames(3); b._ta["meoh"] = {"m": 5, "crane": 1, "crew": 0, "touched": true}; b._render(); await frames(2)
	var w: Array = b.find_children("BookWarn_meoh", "Label", true, false)
	var t := (w[0] as Label).text if not w.is_empty() else ""
	check(t.begins_with("Overlaps the ammonia turnaround in month 6") and t.contains("extra plant-days") and t.contains("MUSD") and t.contains("Month 7 has no other turnaround"), "BOOK prices the overlap: %s%s" % [t.left(140), tag])
	var wg := b.find_child("BookWeigh_meoh", true, false) as Label
	check(wg != null and wg.text.contains("overlap "), "and the weigh line carries it in its cost" + tag)
	b._ta["meoh"] = {"m": 6, "crane": 1, "crew": 0, "touched": true}; b._render(); await frames(2)
	check(b.find_children("BookWarn_meoh", "Label", true, false).is_empty(), "month 7 shows no overlap note" + tag)
	act("buyCatalyst", ["meoh"]); act("turnaround", ["meoh", 5, 1, 0]); await refresh(); b = board(); b.open_all(); await frames(3)
	check(b.find_child("BookedOverlap_meoh", true, false) != null, "a booked overlap is flagged on the plant card" + tag)

## All plants at 110 %: from the second half of the year the pinned area says the strike is coming; the levers sit in the body.
func _emissions(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1])
	for p in ["nh3", "acid", "meoh", "etoh"]: act("setRate", [p, 1.1])
	for i in 6: act("advance", [1])
	await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var pin := b.find_child("Pinned", true, false) as Control
	var ew := b.find_child("EmWarn", true, false) as Label
	check(ew != null and pin.is_ancestor_of(ew) and ew.text.begins_with("EMISSIONS AHEAD") and ew.text.contains("regulator strike"), "the pinned area carries the emissions warning: %s%s" % [ew.text.left(80) if ew != null else "-", tag])
	var el := b.find_child("EmLevers", true, false) as Label
	check(el != null and el.text.contains("rate down") and el.text.contains("abatement investment"), "with both levers, numbers included" + tag)
	check(pin.get_global_rect().size.y <= b.get_global_rect().size.y * 0.6, "the pinned area still leaves the page room (%.0f of %.0f)%s" % [pin.get_global_rect().size.y, b.get_global_rect().size.y, tag])

## BUY CATALYST stays armed (no timer) until pressed again or CANCELled; BOOK without a charge answers in red; the outage change is explained.
func _catalyst_book(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	b.open_all(); await frames(4); b = board()
	var cash0 := float(view().dashboard.cashUSD)
	var kc := b.find_child("Catalyst_nh3", true, false) as Button
	kc.pressed.emit(); await frames(4); b = board()
	kc = b.find_child("Catalyst_nh3", true, false) as Button
	check(kc != null and kc.text.begins_with("PRESS AGAIN"), "one press arms it" + tag)
	await create_timer(4.6).timeout; await frames(3); b = board()
	kc = b.find_child("Catalyst_nh3", true, false) as Button
	check(kc != null and kc.text.begins_with("PRESS AGAIN") and float(view().dashboard.cashUSD) == cash0, "after the old four seconds it is still armed and nothing was bought" + tag)
	var kx := b.find_child("CatalystCancel_nh3", true, false) as Button
	check(kx != null, "a CANCEL key sits beside it" + tag)
	if kx != null: kx.pressed.emit(); await frames(4); b = board()
	kc = b.find_child("Catalyst_nh3", true, false) as Button
	check(kc != null and kc.text.begins_with("BUY CATALYST") and b.find_child("CatalystCancel_nh3", true, false) == null, "CANCEL disarms it" + tag)
	# BOOK without a charge
	var kb := b.find_child("Book_nh3", true, false) as Button
	kb.pressed.emit(); await frames(4); b = board()
	var bm := b.find_child("BookMsg_nh3", true, false) as Label
	check(bm != null and bm.text.contains("press BUY CATALYST first") and int(view().plants[0].turnaroundMonth) == -1, "BOOK without a charge says why and books nothing: %s%s" % [bm.text.left(60) if bm != null else "-", tag])
	var td := b.find_child("TaDays_nh3", true, false) as Label
	check(td != null and td.text.contains("catalyst change-out"), "the BOOK row explains why the outage grows with the charge" + tag)
	# arm and buy
	kc = b.find_child("Catalyst_nh3", true, false) as Button
	kc.pressed.emit(); await frames(3); b = board(); (b.find_child("Catalyst_nh3", true, false) as Button).pressed.emit(); await frames(4); b = board()
	check(int(view().plants[0].catalystStock) == 1 and float(view().dashboard.cashUSD) < cash0, "pressed again, it pays" + tag)
	check(b.find_child("BookMsg_nh3", true, false) == null, "and the BOOK message is gone" + tag)

## The button and the Expected line carry the same rounded number.
func _card_rounding(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var dc: Dictionary = view().dashboard.decision
	for o in dc.options:
		var lab: String = str(o.label)
		var ch := b.find_child("Choose_" + lab, true, false) as Button; var ef := b.find_child("Effect_" + lab, true, false) as Label
		var want := "%+.2f" % float(o.effMusd)
		check(ch != null and ch.text.contains(want + " MUSD"), "CHOOSE %s says %s: %s%s" % [lab, want, ch.text if ch != null else "-", tag])
		check(ef != null and (float(o.effMusd) == 0.0 or ef.text.contains(want)), "and the effect line says the same%s" % tag)

## A year ends under the board's own keys: the review opens as a card with last year's card priced against the road not taken.
func _year_popup(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var host: Node = null
	for i in 60:
		var d: Dictionary = view().dashboard
		if d.decision is Dictionary and bool((d.decision as Dictionary).get("pending", false)): act("answer", [0 if i % 2 == 0 else 1])
		if bool(d.needsAck): await create_timer(1.2).timeout; b.continue_anyway()
		else: b.advance_months(3)
		await frames(14)
		host = root.find_child("career_year_review", true, false)
		if host != null or str(view().dashboard.ending) != "": break
	check(host != null, "the annual review opens as a card at the year end" + tag)
	if host == null: return
	var txt := all_text(host)
	check(txt.contains("YEAR 1 REVIEW") and txt.contains("MARGIN DRIVERS"), "it is the year's memo" + tag)
	check(txt.contains("LAST YEAR'S CARD") and txt.contains("you chose") and txt.contains("realised about"), "with last year's card priced: %s%s" % [txt.substr(maxi(0, txt.find("LAST YEAR")), 160), tag])
	var go := host.find_child("YearReviewContinue", true, false) as Button
	check(go != null and go.get_global_rect().end.y <= root.size.y, "CONTINUE is on screen" + tag)
	if go != null: go.pressed.emit(); await frames(5)
	check(root.find_child("career_year_review", true, false) == null or not root.find_child("career_year_review", true, false).is_inside_tree() or root.find_child("career_year_review", true, false).is_queued_for_deletion(), "CONTINUE closes it" + tag)

## The end card says why: the losing years, with their margins.
func _ending_why(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	for p in ["nh3", "acid", "meoh", "etoh"]: act("setRate", [p, 0.7])
	var guard := 0
	while str(view().dashboard.ending) == "" and guard < 70: act("advance", [1]); guard += 1
	await refresh()
	var why := str(view().dashboard.endingWhy)
	check(str(view().dashboard.ending) == "sold" and (why.begins_with("Two losing years in a row: year 1 -") or why.contains("lenders allow")), "the engine says why (the losing years, or the cash): %s%s" % [why, tag])
	var ew := board().find_child("EndingWhy", true, false) as Label
	check(ew != null and ew.text == why, "and the end card shows it" + tag)
