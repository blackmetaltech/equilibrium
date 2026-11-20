extends SceneTree
## F22 (Career, careful teacher): the offer list never reflows under the cursor (an accepted or declined offer keeps its slot as a "SIGNED" / "DECLINED" row until the next month, so two clicks at one
## spot never sign two offers), the ledger defines the pace and labels the catalyst, the printout shows flask 3's reference number.
## Run: godot --headless --path godot --script res://tests/fix22_flow.gd  (at 1280x800 and 1920x1080)
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
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func buttons_at(n: Node, pt: Vector2, out: Array) -> void:
	if n is Button and (n as Button).is_visible_in_tree() and (n as Button).get_global_rect().has_point(pt): out.append(n)
	for c in n.get_children(): buttons_at(c, pt, out)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _offers(sz); await _ledger(sz)
	print("FIX22-FLOW checks=%d" % checks)
	print("FIX22-FLOW OK" if fails == 0 else "FIX22-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## Two consecutive clicks at the same position never sign a different offer: after the first ACCEPT the spot holds a settled row, not the next offer's ACCEPT.
func _offers(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1]); await refresh()
	var tag := " (%dx%d)" % [sz.x, sz.y]
	var offs: Array = view().get("offers", [])
	check(offs.size() >= 2, "the desk has offers to click: %d%s" % [offs.size(), tag])
	if offs.size() < 2: return
	var b := board(); b.open_all(); await frames(3)
	var first_id := int(offs[0].id); var second_id := int(offs[1].id)
	var ka := b.find_child("Accept_%d" % first_id, true, false) as Button
	check(ka != null, "every offer's ACCEPT carries its own id in its name" + tag)
	if ka == null: return
	var pt := ka.get_global_rect().get_center()
	var n_contracts := (view().get("contracts", []) as Array).size()
	ka.pressed.emit(); await frames(4)
	b = board()
	var after: Array = view().get("offers", [])
	var ids := after.map(func(o): return int(o.id))
	check(not ids.has(first_id) and ids.has(second_id), "the first offer is signed, the second is still on the desk" + tag)
	check((view().get("contracts", []) as Array).size() == n_contracts + 1, "exactly one contract was signed" + tag)
	check(b.find_child("OfferSettled", true, false) != null and all_text(b).contains("SIGNED:"), "the slot stays as a SIGNED row" + tag)
	var hit: Array = []; buttons_at(b, pt, hit)
	var names := hit.map(func(x): return str(x.name))
	check(not names.any(func(nm): return nm.begins_with("Accept_") or nm.begins_with("Decline_")), "a second click at the same spot lands on no ACCEPT or DECLINE: %s%s" % [str(names), tag])
	# and clicking whatever is there (nothing to press) leaves the contracts as they were
	for x in hit: if x is Button and not (x as Button).disabled: (x as Button).pressed.emit()
	await frames(3)
	check((view().get("contracts", []) as Array).size() == n_contracts + 1, "the second click signed nothing more" + tag)
	# DECLINE keeps its slot the same way
	b = board(); var kd := b.find_child("Decline_%d" % second_id, true, false) as Button
	check(kd != null, "the next offer can still be declined" + tag)
	if kd != null:
		var pt2 := kd.get_global_rect().get_center(); kd.pressed.emit(); await frames(4); b = board()
		check(all_text(b).contains("DECLINED:"), "a declined offer leaves a DECLINED row" + tag)
		var h2: Array = []; buttons_at(b, pt2, h2)
		check(not h2.any(func(x): return str(x.name).begins_with("Accept_")), "no ACCEPT slid under the DECLINE click" + tag)
	# the next month clears the placeholders
	act("advance", [1]); await refresh(); b = board(); b.open_all(); await frames(3)
	check(b.find_child("OfferSettled", true, false) == null, "a new month clears the settled rows" + tag)

## The ledger carries the pace definition and the catalyst label.
func _ledger(sz: Vector2i) -> void:
	await level("CAREER"); act("answer", [1])
	for i in 16: act("advance", [1])
	await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var ln := b.find_child("LedgerNote", true, false) as Label
	check(ln != null and ln.text.contains("plain extrapolation") and ln.text.contains("catalyst charges") and ln.text.contains("AFTER INVESTMENTS"), "the ledger defines the pace and labels the catalyst: %s%s" % [ln.text.left(100) if ln != null else "-", tag])
	check(all_text(b).contains("ON THIS PACE, FIVE YEARS (extrapolation)") and all_text(b).contains("INVESTMENTS, TOTAL (catalyst"), "the ledger captions say so" + tag)
