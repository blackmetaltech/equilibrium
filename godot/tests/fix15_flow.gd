extends SceneTree
## Round 7 UI fixes (F15): L00's "tap the converter" step clears when the converter card opens; its two units carry name labels; no stale "Stopped. Back in DESIGN" line;
## a Call it answer survives Retry on a real run; the L05 ledger holds back the answer until it is called; the notebook opens once per level start (a level with preset parts too);
## L10's window stays up with another card open and digit keys say why they did nothing; L03 burns are carried across a Retry; L01 histogram axes and star hint.
## Run: godot --headless --path godot --script res://tests/fix15_flow.gd
var fails := 0
var checks := 0
var app: CbApp
const L10_BUILD := [["placeUnit", ["compressor", 8, 2, 0]], ["placeUnit", ["eq_reactor", 12, 0, 0]], ["placeUnit", ["nh3_sep", 17, 0, 0]], ["placeUnit", ["product", 21, 0, 0]], ["placeUnit", ["vent", 21, 4, 0]], ["setParam", ["K-102", "P", 5400000]], ["setParam", ["K-102", "stages", 2]], ["setParam", ["R-103", "T", 653.15]], ["connect", ["F-101", "out", "K-102", "in"]], ["connect", ["K-102", "out", "R-103", "in"]], ["connect", ["R-103", "out", "D-104", "in"]], ["connect", ["D-104", "liq", "T-105", "in"]], ["connect", ["D-104", "vap", "Y-106", "in"]], ["commission", []]]
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func clear_modals() -> void:
	for n in app.root.get_children(): if n.has_meta("cb_modal"): n.queue_free()
	app.end_ui = null; await frames(3)
func level(id: String) -> void:
	await clear_modals()
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func li() -> Dictionary: return app.b.q("levelInfo")
func lines_text() -> String:
	var s := ""
	for l in app.chrome.intercom.lines: s += str(l.text) + "\n"
	return s
func last_line() -> String: return str(app.chrome.intercom.last().get("text", ""))
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	elif n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func key(code: int) -> InputEventKey:
	var e := InputEventKey.new(); e.keycode = code; e.pressed = true; return e

func fire_build(air: float) -> void:
	var acts := [["placeUnit", ["compressor", 4, 4, 0]], ["placeUnit", ["mixer", 10, 2, 0]], ["placeUnit", ["burner", 14, 0, 0]], ["placeUnit", ["boiler", 18, 0, 0]], ["placeUnit", ["stack", 22, 2, 0]],
		["setFeed", ["F-102", {"flow": air * 1000.0 / 3600.0}]], ["setParam", ["B-106", "T", 420.0 + 273.15]],
		["connect", ["F-102", "out", "K-103", "in"]], ["connect", ["K-103", "out", "M-104", "in2"]], ["connect", ["F-101", "out", "M-104", "in1"]],
		["connect", ["M-104", "out", "R-105", "in"]], ["connect", ["R-105", "out", "B-106", "in"]], ["connect", ["B-106", "out", "Z-107", "in"]]]
	for a in acts: app.b.act(a[0], a[1])
	app.game_on_changed()

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1920, 1080); await frames(4)
	await _l00()
	await _retry_call()
	await _spoiler()
	await _notebook_opens()
	await _l10()
	await _polish()
	print("FIX15-FLOW checks=%d" % checks)
	print("FIX15-FLOW OK" if fails == 0 else "FIX15-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## L00: the converter card ticks the coach step off; the converter and the cooler have name labels; no stale intercom after Stop.
func _l00() -> void:
	app.start_level("L00", true); await frames(6)
	app.game_on_changed(); await frames(3)
	var rid := ""; var cid := ""
	for u in app.b.q("plant").units:
		if str(u.type) == "eq_reactor": rid = str(u.id)
		if str(u.type) == "cooler": cid = str(u.id)
	check(rid != "" and cid != "", "L00 has a converter and a cooler (%s, %s)" % [rid, cid])
	check(int(li().coach.step) == 1 and str(li().coach.text).contains("Tap the converter"), "the coach starts at 'Tap the converter'")
	check(lines_text().contains("Tap the converter"), "and says it on the intercom")
	var hub = Faceplate.attach(app)
	hub._on_unit(cid); await frames(4)
	check(int(li().coach.step) == 1, "opening the cooler's card does not tick the converter step")
	hub._on_unit(rid); await frames(4); app.game_on_changed(); await frames(3)
	check(int(li().coach.step) == 2, "opening the converter's card ticks 'tap the converter' (coach step %s)" % str(li().coach.step))
	check(last_line().contains("TEMPERATURE dial") and not last_line().contains("setpoint"), "the intercom moves on to the cooler line, in the plate's words: %s" % last_line())
	for id in [rid, cid]:
		var m = app.world._units.get(id)
		var tag: Label3D = m.get_node_or_null("SmallTag") if m != null else null
		check(tag != null and tag.text.contains(id), "%s carries a floating name label (%s)" % [id, tag.text if tag != null else "none"])
	# Stop-and-edit on a level that has no DESIGN says nothing about DESIGN; and the "Stopped" line leaves once the plant runs
	app.chrome.stop_and_edit(); await frames(4); app.game_on_changed(); await frames(3)
	check(not lines_text().contains("Back in DESIGN") or not last_line().contains("Back in DESIGN"), "no 'Back in DESIGN' on the intercom of a level that restarts running: %s" % last_line())
	app.chrome.intercom.say("MARA", PaperStrings.t("IC_STOPPED"), "info")
	app.chrome.refresh(); await frames(2)
	check(not last_line().contains("Back in DESIGN"), "a stale 'Stopped. Back in DESIGN' line is withdrawn once the plant runs (%s)" % last_line())

## Retry after a real run keeps the Call it answer, through the printout's Retry too; a second run is graded on it.
func _retry_call() -> void:
	await level("L05")
	check(bool(act("callIt", [8.2]).get("ok", false)), "the call is accepted")
	fire_build(860.0)
	act("commission", []); act("startShift", ["shift"]); act("tick", [500])
	check(str(app.b.g.get("status", "")) == "lost" or str(app.b.g.get("status", "")) == "won", "the run ended (%s)" % str(app.b.g.get("status", "")))
	var rc: Dictionary = app.b.q("resultCard")
	check(float((rc.get("callIt", {}) as Dictionary).get("value", 0.0)) == 8.2, "the card shows the call: %s" % str(rc.get("callIt")))
	await Printout._retry(app, Control.new()); await frames(6)
	check(bool(li().callIt.answered) and float(li().callIt.value) == 8.2, "after Retry the answer is back: %s" % str(li().callIt))
	await Printout._retry(app, Control.new()); await frames(6)
	check(bool(li().callIt.answered) and float(li().callIt.value) == 8.2, "and after a second Retry")
	act("commission", []); act("startShift", ["shift"]); act("tick", [500])
	var rc2: Dictionary = app.b.q("resultCard")
	check(float((rc2.get("callIt", {}) as Dictionary).get("value", 0.0)) == 8.2 and (rc2.callIt as Dictionary).has("ok"), "the second run's card is graded on it, not 'CALL IT: 0.000': %s" % str(rc2.get("callIt")))
	# restore_calls falls back to predict() and reports a call it could not restore
	var snap := {"calls": [{"key": "heat_mw", "value": 7.7}], "units": [], "burns": 0}
	await level("L05")
	BuildKeeper.restore_calls(app, snap)
	check(float(li().callIt.value) == 7.7, "restore_calls puts a keyed answer back on a fresh level")
	# L03: the burns of the attempt a Retry replaces are carried
	await level("L03")
	check(not (li() as Dictionary).has("burns") or int(li().burns) == 0, "a fresh L03 has no burns")
	act("carryBurns", [2])
	var o := BuildKeeper.restart(app, true); await frames(3)
	check(int(li().burns) == 2 and int(o.get("calls", 0)) == 0, "a Retry carries L03's burns: %s" % str(li().get("burns")))

## L05: the heat ledger does not print R-105's megawatts before the commission while the call is open.
func _spoiler() -> void:
	await level("L05")
	fire_build(860.0); await frames(4)
	var hl: Dictionary = app.b.q("heatLedger")
	check((hl.items as Array).is_empty() and float(hl.totalMW) == 0.0, "the ledger is empty before the call: %s" % str(hl.items))
	check(not app.bay.visible, "and the instrument bay shows no slab")
	act("callIt", [8.2]); await frames(4); app.bay.refresh(true); await frames(2)
	check(not (app.b.q("heatLedger").items as Array).is_empty(), "once the call is in the ledger reads")

## The notebook opens once per level start, a level with preset parts and the next job included; a Retry does not reopen it.
func _notebook_opens() -> void:
	await clear_modals()
	Notebook._seen.clear()   # the seed is the clock second: two starts of one level in a second look like one
	for id in ["L03", "L06", "L10"]:
		app.start_level(id, true); await frames(8)
		check(app.root.get_node_or_null("notebook") != null, "%s opens its notebook on a fresh start (spent %s)" % [id, str(li().spentUSD)])
		Notebook.close(app); await frames(3)
		await frames(6)
		check(app.root.get_node_or_null("notebook") == null, "%s: closed stays closed" % id)
	BuildKeeper.restart(app, true); await frames(8)
	check(app.root.get_node_or_null("notebook") == null, "a Retry does not reopen the notebook")

## L10: the window stays while another card is open; a digit key that does nothing says why.
func _l10() -> void:
	await level("L10")
	for a in L10_BUILD:
		var r = app.b.act(a[0], a[1])
		if not r.get("ok", false): print("L10 step failed: ", a, r)
	app.game_on_changed(); await frames(6)
	await clear_modals()
	var hub = Faceplate.attach(app)
	app.bay.refresh(true); await frames(3)
	check(app.bay.kind == "eqwin" and app.bay.visible, "L10: the Equilibrium Window is up (%s, %s)" % [app.bay.kind, str(app.bay.visible)])
	for sz in [Vector2i(1920, 1080), Vector2i(1280, 800)]:
		root.size = sz; await frames(4); app.bay.layout(); app.bay.refresh(true); await frames(3)
		for id in ["K-102", "R-103", "D-104"]:
			hub._on_unit(id); await frames(4); app.game_on_changed(); await frames(3)
			check(app.bay.visible and app.bay.kind == "eqwin", "%s: window visible with the %s card open" % [str(sz), id])
			var pl = Faceplate.plates.get(id)
			if pl != null: check(not (pl as Control).get_global_rect().intersects(app.bay.get_global_rect()), "%s: the %s card does not sit on the window" % [str(sz), id])
	root.size = Vector2i(1920, 1080); await frames(3)
	hub._on_unit(""); await frames(2)
	await clear_modals()
	var rack: PartsRack = app.root.find_child("PartsRack", true, false)
	app.chrome.intercom.clear()
	rack._unhandled_key_input(key(KEY_9)); await frames(2)
	if str(app.b.q("levelInfo").phase) == "design":
		check(last_line().contains("No part on key 9"), "a digit with no part behind it says so: %s" % last_line())
	else:
		check(last_line().contains("DESIGN"), "a digit while the plant runs says parts go down in DESIGN: %s" % last_line())
	check(rack.tiles.size() > 0, "the rack has tiles")

## L01 flask hint, L02 / L07 units on tolerances, the histogram's axes.
func _polish() -> void:
	await level("L01")
	var rules: Array = li().stars.rules
	check(str(rules[1]).contains("3 mol of H₂") and str(rules[1]).contains("0.1 %"), "the vent flask says what reduces it: %s" % str(rules[1]))
	await level("L02")
	var gt := ""
	for g in li().goals: gt += str(g.text) + "\n"
	check(gt.contains("percentage points"), "L02's SO₂ tolerance has a unit: %s" % gt)
	await clear_modals()
	app.new_game("sandbox"); await frames(4); Notebook.close(app); await frames(3)
	Notebook.stub = Notebook.stub_info()
	Printout.stub = Notebook.result_stub(true)
	Printout.stub.histogram = {"metric": "test_burns", "title": "Test burns", "unit": "", "labels": ["8.5", "9.0", "9.5", "10.0"], "bins": [2, 5, 9], "edges": [8.5, 9, 9.5, 10], "you": 9.2, "youBin": 1}
	Printout.open(app); await create_timer(0.8).timeout
	var po := app.root.get_node_or_null("printout")
	var ax := po.find_child("HistAxis", true, false) as Label if po != null else null
	check(ax != null and ax.text.contains("other runs"), "the histogram has an axis line: %s" % (ax.text if ax != null else "none"))
	if po != null: po.queue_free()
	app.end_ui = null; Notebook.stub = {}; Printout.stub = {}; await frames(3)
