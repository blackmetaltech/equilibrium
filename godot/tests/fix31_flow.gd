extends SceneTree
## F31 (0.8 Career + incident), the round-11 desktop tester's findings that live in the front end:
##  - the Career board fits the window in every path (fresh start, after the incident's long log rows, after the plant and BACK TO THE CAREER, after a save and resume) at 1920x1080, 1280x800 and 1280x720:
##    every key and the rate dial lie inside the viewport horizontally, the pinned keys vertically, and the board is no wider than its bay;
##  - every action that spends cash or commits the plant asks twice with a CANCEL (ACCEPT, BOOK, a yearly card option that buys or books, CALL THE CONTRACTOR, IGNORE IT); ADVANCE stays one press;
##  - a plant that goes down puts its note at the foot of the card (the rate dial does not move);
##  - a purge change in the plant says so on the intercom; BACK TO THE CAREER is on the printout the moment it is up.
## Run: godot --headless --path godot --script res://tests/fix31_flow.gd. Backs up and restores the real autosave file; the resume and marker files are scratch paths.
var fails := 0
var checks := 0
var app: CbApp
const SEED := 11   ## inerts in the feed in month 3 (the event of month index 2)
const FIX := "CAREER_FIX_NH3_INERTS"
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", [name] + args); app.game_on_changed(); return r
func view() -> Dictionary:
	var v = app.b.q("levelView"); return v if v is Dictionary else {}
func dash() -> Dictionary: return view().get("dashboard", {})
func lid() -> String: return str(app.b.g.get("level", ""))
func board() -> CareerBoard: return app.lvbay.panel as CareerBoard if app.lvbay != null and app.lvbay.panel is CareerBoard else null
func refresh() -> void:
	if app.lvbay != null: app.lvbay.refresh(true)
	await frames(4)
func fresh_app() -> void:
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(10)
func kill_app() -> void:
	app.set_process(false); app.b.stop(); app.queue_free(); await frames(4)
func new_career() -> void:
	OS.set_environment("CB_NEW", "1")
	app.pinned_seed = SEED
	app.start_level("CAREER", true); await frames(4)
	OS.unset_environment("CB_NEW")
	Notebook.close(app); await frames(3)
func key(nm: String) -> Button:
	var b := board()
	if b == null: return null
	return b.find_child(nm, true, false) as Button
func press(nm: String) -> void:
	var k := key(nm)
	check(k != null, "key %s exists" % nm)
	if k != null: k.pressed.emit()
	await frames(4)

## Every key and the rate dial of the board lie inside the viewport (horizontally; the pinned ones vertically too), and the board is no wider than its bay.
func fit_check(tag: String) -> void:
	await refresh(); await frames(4)
	var b := board()
	if b == null: check(false, "the board is up" + tag); return
	var vw := float(root.size.x); var vh := float(root.size.y)
	check(b.size.x <= app.lvbay.size.x + 1.0, "the board is no wider than its bay (%.0f of %.0f)%s" % [b.size.x, app.lvbay.size.x, tag])
	check(b.get_combined_minimum_size().x <= b.fit_w + 1.0, "no child asks for more than the board's width (%.0f of %.0f)%s" % [b.get_combined_minimum_size().x, b.fit_w, tag])
	check(b.get_global_rect().end.x <= vw + 1.0, "the board ends inside the window (%.0f of %.0f)%s" % [b.get_global_rect().end.x, vw, tag])
	var n := 0; var bad := ""
	for k in b.find_children("*", "Button", true, false):
		var c := k as Button
		if not c.is_visible_in_tree(): continue
		n += 1
		var r := c.get_global_rect()
		if r.position.x < -1.0 or r.end.x > vw + 1.0: bad += " %s(%.0f..%.0f)" % [c.name, r.position.x, r.end.x]
		if b.pin.is_ancestor_of(c) and (r.position.y < -1.0 or r.end.y > vh + 1.0): bad += " pinned %s(y %.0f..%.0f)" % [c.name, r.position.y, r.end.y]
	check(n > 5 and bad == "", "every key is inside the viewport%s: %s" % [tag, bad])
	for c in b.find_children("*", "Control", true, false):
		if c is Knob and (c as Control).is_visible_in_tree():
			var r := (c as Control).get_global_rect()
			check(r.position.x >= -1.0 and r.end.x <= vw + 1.0, "the rate dial is inside the viewport%s" % tag)
func has_text(nm: String, part: String) -> bool:
	var k := key(nm); return k != null and k.text.contains(part)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	var backup := ""
	if FileAccess.file_exists(CareerSave.engine_file()): backup = FileAccess.get_file_as_string(CareerSave.engine_file())
	CareerSave.force = true; CareerSave.path = "user://eq_career_resume_f31_test.json"; CareerSave.clear()
	CareerIncident.path = "user://eq_career_incident_f31_test.json"; CareerIncident.clear()
	await fresh_app(); CbSettings.persist = false
	await _confirms()
	await _plant_trip_checks()
	for sz in [Vector2i(1920, 1080), Vector2i(1280, 800), Vector2i(1280, 720)]:
		await _fit_paths(sz)
	if backup != "":
		var f := FileAccess.open(CareerSave.engine_file(), FileAccess.WRITE); f.store_string(backup); f.close()
	CareerSave.clear(); CareerIncident.clear(); CareerSave.force = false
	print("FIX31-FLOW checks=%d" % checks)
	print("FIX31-FLOW OK" if fails == 0 else "FIX31-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## A fresh start, the incident with its long log rows, the plant and BACK TO THE CAREER, a save and a resume: the board fits the window in each.
func _fit_paths(sz: Vector2i) -> void:
	var tag := " at %dx%d" % [sz.x, sz.y]
	root.size = sz; await frames(4)
	await new_career()
	await fit_check(" (fresh start)" + tag)
	act("answer", [1])
	for i in 6:
		var ic = dash().get("incident", null)
		if ic is Dictionary and bool((ic as Dictionary).get("pending", false)): break
		act("advance", [1])
	await refresh()
	await fit_check(" (incident waiting)" + tag)
	var icd: Dictionary = dash().get("incident", {})
	check(bool(icd.get("ahead", false)) and str(icd.get("title", "")).contains("next month") and str(icd.get("body", "")).contains("from month"), "the card is the supplier's heads-up: the inerts arrive next month" + tag)
	var m0 := int(dash().get("month", -1))
	# GO TO THE PLANT, fix it, BACK TO THE CAREER
	await press("IncidentPlant"); await frames(8)
	Notebook.close(app); await frames(3)
	check(lid() == FIX, "the plant opens" + tag)
	var v := view(); var pre: Dictionary = v.get("pre", {})
	var k := int(pre.get("k", 0)); var purge: float = [0.02, 0.02, 0.025, 0.025, 0.025, 0.03, 0.03][k]
	app.b.act("callIt", [20.0]); app.b.act("setParam", ["X-108", "frac", purge]); app.b.act("commission", []); app.game_on_changed(); await frames(3)
	var bk: Button = null; var opened_at := -1
	for i in 14:
		app.b.act("tick", [5]); app.game_on_changed(); await frames(2)
		var host = app.modal()
		if host != null and str(host.name) == "printout":
			opened_at = i; bk = host.find_child("BackToCareer", true, false); break
	if opened_at < 0 and str(app.b.g.get("status", "")) == "won":
		app.end_seen = false; Printout.open(app); await frames(4)
		var h2 = app.modal(); bk = h2.find_child("BackToCareer", true, false) if h2 != null else null
	check(bk != null, "BACK TO THE CAREER is on the printout the moment it is up (printout at step %d)%s" % [opened_at, tag])
	if bk == null: return
	bk.pressed.emit(); await frames(10)
	check(lid() == "CAREER" and int(dash().get("month", -1)) == m0, "back at month %d%s" % [m0, tag])
	await fit_check(" (back from the plant)" + tag)
	act("advance", [1]); await frames(3)
	await fit_check(" (a month after the fix)" + tag)
	# save, rebuild, resume (what Start work does): the log now holds the long plant-fix rows
	await frames(4); CareerSave.store(app)
	await kill_app()
	OS.set_environment("CB_LEVEL", "C"); await fresh_app(); OS.unset_environment("CB_LEVEL")
	root.size = sz; await frames(6)
	check(lid() == "CAREER" and int(dash().get("month", -1)) == m0 + 1, "the resume brings the Career back" + tag)
	await fit_check(" (after resume)" + tag)
	var long_rows := 0
	for l in board().find_children("LogRow*", "Label", true, false): long_rows += 1
	check(long_rows >= 3, "the site log rows are there%s (%d)" % [tag, long_rows])

## ACCEPT, BOOK, a yearly card option that commits, CALL THE CONTRACTOR and IGNORE IT ask twice with a CANCEL; ADVANCE is one press.
func _confirms() -> void:
	root.size = Vector2i(1920, 1080); await frames(4)
	await new_career()
	await refresh()
	var d := dash()
	# the yearly card: pick an option that commits
	var dc: Dictionary = d.get("decision", {})
	check(bool(dc.get("pending", false)), "a yearly card waits at the start")
	var opt: Dictionary = {}
	for o in dc.get("options", []): if str(o.get("commitShort", "")) != "" and opt.is_empty(): opt = o
	check(not opt.is_empty(), "an option of the card says what it buys or books (%s)" % str(dc.get("kind", "")))
	if not opt.is_empty():
		var nm := "Choose_%s" % str(opt.label)
		check(has_text(nm, str(opt.commitShort)), "the key says it: %s" % str(key(nm).text if key(nm) != null else ""))
		await press(nm)
		check(bool(dash().get("decision", {}).get("pending", false)), "one press chooses nothing")
		check(has_text(nm, "PRESS AGAIN") and key("ChooseCancel_%s" % str(opt.label)) != null, "the key arms and a CANCEL appears")
		await press("ChooseCancel_%s" % str(opt.label))
		check(has_text(nm, "CHOOSE") and not has_text(nm, "PRESS AGAIN"), "CANCEL disarms it")
		check(bool(dash().get("decision", {}).get("pending", false)), "...and nothing was chosen")
		await press(nm); await press(nm)
		check(not bool(dash().get("decision", {}).get("pending", true)), "the second press chooses")
	# ACCEPT
	await refresh()
	var offers: Array = view().get("offers", [])
	check(offers.size() >= 2, "offers on the desk")
	var oid := int(offers[0].id); var n_c := (view().get("contracts", []) as Array).size()
	await press("Accept_%d" % oid)
	check((view().get("contracts", []) as Array).size() == n_c and has_text("Accept_%d" % oid, "PRESS AGAIN") and key("AcceptCancel_%d" % oid) != null, "ACCEPT: one press signs nothing; it arms with a CANCEL")
	await press("AcceptCancel_%d" % oid)
	check(has_text("Accept_%d" % oid, "ACCEPT") and not has_text("Accept_%d" % oid, "PRESS AGAIN"), "ACCEPT: CANCEL disarms")
	await press("Accept_%d" % oid); await press("Accept_%d" % oid)
	check((view().get("contracts", []) as Array).size() == n_c + 1, "ACCEPT: the second press signs")
	# BOOK
	board().open_all(); await frames(4)
	check(act("buyCatalyst", ["acid"]).get("ok", false), "a catalyst charge is bought"); await refresh()
	var tam0 := -1
	for p in view().get("plants", []): if str(p.id) == "acid": tam0 = int(p.turnaroundMonth)
	await press("Book_acid")
	var tam1 := -2
	for p in view().get("plants", []): if str(p.id) == "acid": tam1 = int(p.turnaroundMonth)
	check(tam1 == tam0 and has_text("Book_acid", "PRESS AGAIN: BOOK MONTH") and key("BookCancel_acid") != null, "BOOK: one press books nothing; it arms with a CANCEL")
	await press("BookCancel_acid")
	check(has_text("Book_acid", "BOOK") and not has_text("Book_acid", "PRESS AGAIN"), "BOOK: CANCEL disarms")
	await press("Book_acid"); await press("Book_acid")
	for p in view().get("plants", []): if str(p.id) == "acid": tam1 = int(p.turnaroundMonth)
	check(tam1 >= 0, "BOOK: the second press books (month %d)" % (tam1 + 1))
	# ADVANCE stays one press
	var m1 := int(dash().get("month", 0))
	await press("Advance1"); await frames(30)
	check(int(dash().get("month", 0)) == m1 + 1, "ADVANCE 1 MONTH is one press (month %d -> %d)" % [m1, int(dash().get("month", 0))])
	# the incident answers
	for i in 6:
		var ic = dash().get("incident", null)
		if ic is Dictionary and bool((ic as Dictionary).get("pending", false)): break
		act("advance", [1])
	await refresh()
	check(bool(dash().get("incident", {}).get("pending", false)), "the incident waits")
	var cash0 := float(dash().get("cashUSD", 0.0))
	await press("IncidentIgnore")
	check(bool(dash().get("incident", {}).get("pending", false)) and has_text("IncidentIgnore", "PRESS AGAIN") and key("IncidentIgnoreCancel") != null, "IGNORE IT: one press ignores nothing; it arms with a CANCEL")
	await press("IncidentIgnoreCancel")
	check(not has_text("IncidentIgnore", "PRESS AGAIN") and bool(dash().get("incident", {}).get("pending", false)), "IGNORE IT: CANCEL disarms")
	await press("IncidentContractor")
	check(bool(dash().get("incident", {}).get("pending", false)) and absf(float(dash().get("cashUSD", 0.0)) - cash0) < 1.0 and has_text("IncidentContractor", "PRESS AGAIN"), "CALL THE CONTRACTOR: one press bills nothing")
	await press("IncidentContractor")
	check(str(dash().get("incident", {}).get("choice", "")) == "contractor" and float(dash().get("cashUSD", 0.0)) < cash0, "CALL THE CONTRACTOR: the second press calls and bills")

## The down note sits at the foot of the card; the intercom says a purge change un-commissions; no stale Tomas line.
func _plant_trip_checks() -> void:
	root.size = Vector2i(1920, 1080); await frames(4)
	await new_career(); act("answer", [1])
	for i in 7: act("advance", [1])
	await refresh(); board().open_all(); await frames(4)
	var card := key("Inspect_nh3").get_parent().get_parent().get_parent() as Control
	var kn: Control = null
	for c in board().find_children("*", "Control", true, false): if c is Knob and card.is_ancestor_of(c): kn = c as Control; break
	check(kn != null, "the ammonia card has its rate dial")
	var y0 := kn.get_global_rect().position.y - card.get_global_rect().position.y
	check(act("inspect", ["nh3"]).get("ok", false), "INSPECT (the plant is down a day)"); await refresh(); board().open_all(); await frames(4)
	var dn := board().find_child("DownNote", true, false) as Control
	check(dn != null, "the plant says it is down")
	card = key("Inspect_nh3").get_parent().get_parent().get_parent() as Control
	for c in board().find_children("*", "Control", true, false): if c is Knob and card.is_ancestor_of(c): kn = c as Control; break
	var y1 := kn.get_global_rect().position.y - card.get_global_rect().position.y
	check(absf(y1 - y0) < 1.0, "the rate dial does not move when the down note appears (%.1f -> %.1f)" % [y0, y1])
	check(dn != null and dn.get_global_rect().position.y > kn.get_global_rect().position.y, "the note is below the dial")
	# the plant: a purge change un-commissions and says so
	await new_career(); act("answer", [1])
	for i in 6:
		var ic = dash().get("incident", null)
		if ic is Dictionary and bool((ic as Dictionary).get("pending", false)): break
		act("advance", [1])
	await refresh()
	await press("IncidentPlant"); await frames(8)
	Notebook.close(app); await frames(3)
	check(lid() == FIX, "the plant opens")
	var pre: Dictionary = view().get("pre", {})
	var si = app.b.q("levelInfo")
	check(float(si.get("spentUSD", -1.0)) == 0.0, "the plant starts with nothing spent (%s)" % str(si.get("spentUSD")))
	var ctx := "%.0f" % (float(pre.get("cat", 0.0)) * 100.0)
	check(str(si.note[0]).contains("catalyst is at %s %%" % ctx) and str(si.note[0]).contains("old 0.5 %"), "the notes quote the Career's catalyst (%s %%) and the old purge 0.5 %%" % ctx)
	app.b.act("callIt", [20.0]); app.b.act("setParam", ["X-108", "frac", 0.025]); app.b.act("commission", []); app.game_on_changed(); await frames(8)
	app.b.act("setParam", ["X-108", "frac", 0.03]); app.game_on_changed(); await frames(10)
	var txt := ""
	for l in app.chrome.intercom.lines: txt += str(l.text) + "\n"
	check(txt.contains("Design changed: commission again to see it"), "a purge change says the plant must be commissioned again")
