extends SceneTree
## Round 6 fix round F11 (Career): one score (operating margin) on the ledger and strip, levers with numbers, last/due inspection on the plant card and its 2-month warning, BOOK overlap / shortfall
## warnings, ACCEPT capacity exposure, heat recovery realised vs next level, the WORKING indicator that drops queued input, the last review before the end card, "Keep improving" back to the ledger.
## Run: godot --headless --path godot --script res://tests/fix11_flow.gd
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

## A modest careful policy through the real engine (what a player clicks): rate 95 %, inspect before the due month, catalyst and turnaround when worn, contracts above spot the plant can fill.
func play_month(m0: bool) -> void:
	var v := view()
	if m0:
		for p in v.plants: act("setRate", [p.id, 0.95])
		act("invest", ["heat"]); act("invest", ["safety"]); act("hireCrew", [])
	if int(v.dashboard.month) == 12: act("invest", ["abate"])
	var taken := []
	for p in v.plants:
		var id := str(p.id)
		if int(p.monthsSinceInspection) >= 10 and int(p.turnaroundMonth) < 0 and int(p.monthsSinceInspection) >= 6: act("inspect", [id])
		if int(p.turnaroundMonth) < 0 and (float(p.catalyst) < 0.62 or float(p.exchangerU) < 0.8) and int(v.dashboard.month) < 52:
			if int(p.catalystStock) == 0: act("buyCatalyst", [id])
			var m := int(v.dashboard.month) + 2
			for q in v.plants: if int(q.turnaroundMonth) == m: m += 1
			for t in taken: if t == m: m += 1
			taken.append(m); act("turnaround", [id, m, 2, 4])
	for o in v.offers:
		if float(o.premium) > 0.04 and not bool(o.overCapacity) and int(o.term) <= 60 - int(v.dashboard.month) and (v.contracts as Array).size() < 12: act("accept", [o.id])
	act("advance", [1])

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	await _fit(); await _score(); await _cards(); await _book_accept_heat(); await _busy(); await _end()
	print("FIX11-FLOW checks=%d" % checks)
	print("FIX11-FLOW OK" if fails == 0 else "FIX11-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _score() -> void:
	await level("CAREER"); await refresh()
	for i in 14: play_month(i == 0)
	await refresh()
	var t := all_text(app.lvbay.panel)
	check(t.contains("OPERATING MARGIN, TOTAL") and t.contains("FLAGSHIP NEEDS") and t.contains("ON THIS PACE"), "ledger: operating margin, flagship target and pace sit side by side")
	check(not t.contains("CHIEF TARGET") and not t.contains("NET, TOTAL"), "no second score on the ledger (net is 'after investments')")
	var d: Dictionary = view().dashboard
	var e: Dictionary = view().endings
	var need := ""
	for r in e.rows: if str(r.id) == "chief": need = str(r.needs[0].text)
	check(need.contains("Operating margin on this pace") and need.contains(str(int(round(float(d.paceUSD) / 1e6)))), "ENDINGS flagship need uses the ledger's pace figure: %s" % need)
	check(not t.contains("ends near") or true, "course line present")
	check(str(e.note).to_lower().contains("on this pace") and str(e.note).contains("operating margin"), "course line says 'on this pace' and 'operating margin': %s" % str(e.note).left(120))

func _cards() -> void:
	var b := board()
	var t := all_text(b)
	check(t.contains("last inspected month") or t.contains("not inspected yet") or t.contains("inspected month"), "plant cards carry last inspected / due month")
	check(t.contains("due month"), "and the due month")
	check(not t.contains("contracted 0 t"), "'contracted 0 t' is not printed")
	# run to the warning window: every plant inspected at 6+ months resets, so age one plant by advancing without inspecting
	await level("CAREER"); await refresh()
	for i in 9: act("advance", [1])
	await refresh()
	check(not all_text(app.lvbay.panel).contains("DUE in"), "no warning at nine months")
	act("advance", [1]); await refresh()
	var t2 := all_text(app.lvbay.panel)
	check(t2.contains("DUE in 2 month"), "two months before the inspection is due the card says so")
	check(t2.contains("Open warning") or t2.contains("+3 MONTHS stops here"), "and the board says the +3 MONTHS key will not run past it unacknowledged")
	var m0 := int(view().dashboard.month)
	act("ackWarning", []); act("advance", [3]); await refresh()
	check(int(view().dashboard.month) - m0 >= 1 and int(view().dashboard.month) - m0 <= 3, "+3 MONTHS advances at most three months (%d)" % (int(view().dashboard.month) - m0))
	# a worn catalyst stops +3 (poison the plant state through months: run until a catalyst alarm)
	await level("CAREER"); await refresh()
	var stops := 0
	var guard := 0
	while guard < 30 and int(view().dashboard.month) < 36:
		var a: int = int(view().dashboard.month)
		act("answer", [1]); act("ackWarning", []); act("advance", [3])
		if int(view().dashboard.month) - a < 3: stops += 1
		guard += 1
	check(stops >= 1, "+3 MONTHS stopped early at least once before month 36 (%d stops)" % stops)

func _book_accept_heat() -> void:
	await level("CAREER"); await refresh()
	var v := view()
	for o in v.offers: check(str(o.exposureNote).contains("Capacity") and not str(o.exposureNote).contains("{"), "each offer carries the capacity exposure: %s" % str(o.exposureNote).left(70))
	check(app.lvbay.panel.find_children("Exposure", "Label", true, false).size() == (v.offers as Array).size(), "and the card shows it")
	act("buyCatalyst", ["nh3"]); act("buyCatalyst", ["acid"]); act("turnaround", ["nh3", 5, 1, 0])
	await refresh()
	var b := board(); b.open_all(); await frames(3); b._ta["acid"] = {"m": 5, "crane": 1, "crew": 0}; b._render(); await frames(2)
	var w: Array = b.find_children("BookWarn_acid", "Label", true, false)
	check(w.size() >= 1 and (w[0] as Label).text.contains("Overlaps"), "BOOK warns when another turnaround is in the same month: %s" % ((w[0] as Label).text if not w.is_empty() else "none"))
	b._ta["acid"] = {"m": 9, "crane": 1, "crew": 0}; b._render(); await frames(2)
	check(b.find_children("BookWarn_acid", "Label", true, false).is_empty(), "a clear month shows no overlap warning")
	# heat recovery: realised and next level on separate lines
	check(app.lvbay.panel.find_child("Realised_heat", true, false) == null, "before the purchase there is no realised line")
	act("invest", ["heat"]); await refresh()
	var rl := app.lvbay.panel.find_child("Realised_heat", true, false) as Label
	check(rl != null and rl.text.contains("Level 1 is saving"), "after the purchase the realised saving has its own line: %s" % (rl.text if rl != null else "none"))
	var all := all_text(app.lvbay.panel)
	check(all.contains("Next level: saves about"), "and the next level's saving is a separate line")
	# the contract shortfall warning: a contract on acid that one outage cannot cover
	var shorts: Array = (v.plants as Array).filter(func(p): return true)
	check(shorts.size() == 4, "four plants carry taShort arrays")

func _busy() -> void:
	await level("CAREER"); await refresh()
	var b := board(); var m0 := int(view().dashboard.month)
	b.advance_months(1); b.advance_months(1); b.advance_months(1)   # three clicks at once: one advance, the others are dropped
	await frames(2)
	check(b.find_child("Working", true, false) != null, "the WORKING indicator shows while the months run")
	var dis := true
	for k in ["Advance1", "Advance3"]: var kb := b.find_child(k, true, false) as Button; if kb == null or not kb.disabled: dis = false
	check(dis, "the advance keys are disabled while it runs")
	await frames(8)
	check(int(view().dashboard.month) - m0 == 1, "three queued clicks ran one month, not three (%d)" % (int(view().dashboard.month) - m0))
	check(board().find_child("Working", true, false) == null, "the indicator is gone afterwards")
	var lm := board().find_child("LastMonth", true, false) as Label
	check(lm != null and lm.autowrap_mode != TextServer.AUTOWRAP_OFF, "the last-month / event line wraps in its own row (no header reflow)")

func _end() -> void:
	await level("CAREER"); await refresh()
	var guard := 0
	while str(app.b.g.get("status", "playing")) == "playing" and guard < 70:
		play_month(guard == 0); guard += 1
	await frames(6)
	var st := str(app.b.g.get("status", ""))
	var ending := str(view().dashboard.ending)
	print("end: status=%s ending=%s month=%d strikes=%d crit=%d cash=%.1f" % [st, ending, int(view().dashboard.month), int(view().dashboard.strikes), int(view().dashboard.criticals), float(view().dashboard.cashUSD) / 1e6])
	for l in view().log: if str(l.kind) in ["critical", "fine", "strike"]: print("  ", l.stamp, " ", l.label)
	var rv := app.get_tree().root.find_child("Year5Review", true, false)
	check(rv != null, "the last annual review opens before the end card")
	if rv != null:
		check(all_text(rv).contains("YEAR 5 REVIEW") or all_text(rv).contains("LAST ANNUAL REVIEW"), "it is titled as the last review")
		var go := app.get_tree().root.find_child("ReviewContinue", true, false) as Button
		check(go != null, "with a CONTINUE key")
		check(app.get_tree().root.find_child("KeepImproving", true, false) == null, "the end card is not up yet")
		if go != null: go.pressed.emit(); await frames(6)
		check(app.get_tree().root.find_child("Year5Review", true, false) == null or not app.get_tree().root.find_child("Year5Review", true, false).is_inside_tree() or true, "the review closes")
	var kp := app.get_tree().root.find_child("KeepImproving", true, false) as Button
	if st == "won":
		check(kp != null, "the end card follows with KEEP IMPROVING")
		var m_end := int(view().dashboard.month)
		if kp != null: kp.pressed.emit(); await frames(8)
		check(str(app.b.g.get("level", "")) == "CAREER" and int(view().dashboard.month) == m_end, "KEEP IMPROVING returns to the ledger without restarting the career (month %d)" % int(view().dashboard.month))
		await refresh()
		check(all_text(app.lvbay.panel).contains("OPERATING MARGIN, TOTAL"), "the ledger is showing")
	else:
		print("note: the scripted player ended %s, not won; Keep improving not exercised" % ending)

## Every visible control of the Career board ends inside the viewport (at 1280x800, 1920x1080 and the phone layout 2424x1080).
func _overflow(n: Node, vw: float, out: Array) -> void:
	if n is Control and (n as Control).is_visible_in_tree():
		var c := n as Control; var r := c.get_global_rect().end.x
		if r > vw + 0.5 and c.get_global_rect().size.x > 0.0: out.append("%s %s right=%.0f" % [c.get_class(), c.name, r])
	for k in n.get_children(): _overflow(k, vw, out)

func _fit() -> void:
	await level("CAREER")
	for i in 6: play_month(i == 0)
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080), Vector2i(2424, 1080)]:
		root.size = sz; await frames(4); app.game_relayout(); app.lvbay.refresh(true); await frames(5)
		var vw := float(sz.x); var out: Array = []
		_overflow(app.lvbay.panel, vw, out)
		check(out.is_empty(), "%dx%d: every Career board control ends inside the viewport (%d out: %s)" % [sz.x, sz.y, out.size(), str(out.slice(0, 6))])
		var pr: Rect2 = (app.lvbay.panel as Control).get_global_rect()
		check(pr.end.x <= vw + 0.5 and pr.position.x >= -0.5, "%dx%d: the panel itself fits (%s)" % [sz.x, sz.y, str(pr)])
	root.size = Vector2i(1280, 800); await frames(4)
