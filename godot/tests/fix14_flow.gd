extends SceneTree
## Round 7 (F14): the Career board has NEXT DECISION (runs months until something needs the manager, says why it stopped) and a yearly decision card (two options with MUSD, blocks the multi-month keys until answered,
## keeps the chosen state). Fits 1280x800 and 1920x1080.
## Run: godot --headless --path godot --script res://tests/fix14_flow.gd
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
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	elif n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _card(sz); await _skip(sz)
	print("FIX14-FLOW checks=%d" % checks)
	print("FIX14-FLOW OK" if fails == 0 else "FIX14-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## The yearly decision card: present at the start, two CHOOSE keys with MUSD, the multi-month keys dark, an answer unlocks them and the chosen state stays on the slip.
func _card(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var card := b.find_child("DecisionCard", true, false) as Control
	check(card != null, "the board shows the yearly decision card" + tag)
	var ka := b.find_child("Choose_A", true, false) as Button; var kb := b.find_child("Choose_B", true, false) as Button
	check(ka != null and kb != null and ka.text.contains("MUSD") and kb.text.contains("MUSD"), "two option keys carry their expected MUSD: %s | %s" % [ka.text if ka != null else "-", kb.text if kb != null else "-"])
	var nd := b.find_child("NextDecision", true, false) as Button; var k3 := b.find_child("Advance3", true, false) as Button; var k1 := b.find_child("Advance1", true, false) as Button
	check(nd != null and nd.text.begins_with("NEXT DECISION"), "the NEXT DECISION key exists" + tag)
	check(nd != null and nd.disabled and k3 != null and k3.disabled and k1 != null and not k1.disabled, "a pending decision darkens NEXT DECISION and +3 MONTHS; ADVANCE 1 MONTH stays")
	check(b.find_child("OptionText_A", true, false) != null and b.find_child("Effect_A", true, false) != null, "each option has its text and its effect line")
	if card != null:
		var r := card.get_global_rect(); var pr := b.scroll.get_global_rect()
		check(r.position.x >= pr.position.x - 1.0 and r.end.x <= pr.end.x + 1.0, "the card fits the board width (%.0f..%.0f in %.0f..%.0f)%s" % [r.position.x, r.end.x, pr.position.x, pr.end.x, tag])
		check(r.end.x <= float(sz.x) + 1.0, "and the screen" + tag)
	var m0 := int(view().dashboard.month)
	var r0: Dictionary = act("advanceToDecision", [])
	check(int(view().dashboard.month) == m0, "the engine refuses NEXT DECISION while the decision is pending")
	var commits := str(view().dashboard.decision.options[0].get("commitShort", "")) != ""
	ka.pressed.emit(); await frames(4); b = board()
	if commits:   # F31: an option that buys or books asks twice
		check(bool(view().dashboard.decision.pending), "one press on a committing option only arms it (F31)")
		(b.find_child("Choose_A", true, false) as Button).pressed.emit(); await frames(4); b = board()
	check(not bool(view().dashboard.decision.pending) and int(view().dashboard.decision.choice) == 0, "pressing CHOOSE A answers it in the engine")
	check(b.find_child("DecisionChosen", true, false) != null and b.find_child("Choose_A", true, false) == null, "the card keeps the chosen state and the keys are gone")
	nd = b.find_child("NextDecision", true, false) as Button; k3 = b.find_child("Advance3", true, false) as Button
	check(nd != null and not nd.disabled and k3 != null and not k3.disabled, "NEXT DECISION and +3 MONTHS light after the answer")

## NEXT DECISION: runs months, says why it stopped, and a second answer comes at the year end.
func _skip(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	act("answer", [0]); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	check(all_text(b).contains("NEXT DECISION runs up to 12 months"), "the note beside the key says what it will stop at" + tag)
	if bool(view().dashboard.get("needsAck", false)): act("ackWarning", [])   # F31: the supplier's heads-up can be lit at the start: it stops the run until it is acknowledged
	b.advance_to_decision(); await frames(14); b = board()
	var d: Dictionary = view().dashboard
	check(int(d.month) >= 1 and int(d.month) <= 12, "NEXT DECISION ran %d months" % int(d.month))
	var w := b.find_child("WhyStopped", true, false) as Label
	check(w != null and w.text.begins_with("Stopped:"), "and says why it stopped: %s" % (w.text if w != null else "none"))
	var guard := 0
	while guard < 40 and str(view().dashboard.ending) == "" and not bool(view().dashboard.decision.pending):
		act("ackWarning", []); act("advanceToDecision", []); guard += 1
	check(bool(view().dashboard.decision.pending) and int(view().dashboard.decision.year) == 2 and int(view().dashboard.month) == 12, "at month 12 the year-two decision is waiting (%d presses)" % guard)
	await refresh(); b = board()
	var nd := b.find_child("NextDecision", true, false) as Button
	check(nd != null and nd.disabled and b.find_child("Choose_B", true, false) != null, "and it blocks NEXT DECISION again" + tag)
	act("answer", [1]); await refresh()
	check(int(view().dashboard.decisionsDone) == 2, "two decisions answered")
