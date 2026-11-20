extends SceneTree
## Round 7 (F18, tester d4): the Career board on a 1280x800 handheld. The action row and a pending decision card are pinned above the scroll, plant cards fold, nothing is clipped on the right,
## BUY CATALYST asks twice, BOOK looks dark when it cannot be pressed, CONTINUE ANYWAY acknowledges and runs in one press, and CB_LEVEL=C opens the Career.
## Run: godot --headless --path godot --script res://tests/fix18_flow.gd
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
func has_ancestor(n: Node, nm: String) -> bool:
	var p := n.get_parent()
	while p != null:
		if p.name == nm: return true
		p = p.get_parent()
	return false

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	await _alias()
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _layout(sz); await _cards(sz); await _catalyst_and_book(sz)
	root.size = Vector2i(1280, 800); await frames(4)
	await _continue()
	print("FIX18-FLOW checks=%d" % checks)
	print("FIX18-FLOW OK" if fails == 0 else "FIX18-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## CB_LEVEL=C is the Career, like CB_AUTOSTART=career.
func _alias() -> void:
	app.start_level("C", true); await frames(4)
	check(str(app.b.g.get("level", "")) == "CAREER", "CB_LEVEL=C opens the Career level (level=%s)" % str(app.b.g.get("level", "")))
	app.start_level("c", true); await frames(4)
	check(str(app.b.g.get("level", "")) == "CAREER", "and so does a lower-case c")
	Notebook.close(app); await frames(3)

## The pinned rows stay put while the page scrolls, and no control reaches past the right edge of the board.
func _layout(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var pin := b.find_child("Pinned", true, false) as Control
	check(pin != null and pin.find_child("ActionRow", true, false) != null, "the action row sits in the pinned area" + tag)
	for nm in ["Advance1", "NextDecision", "Advance3"]:
		var k := b.find_child(nm, true, false) as Control
		check(k != null and has_ancestor(k, "Pinned") and not b.scroll.is_ancestor_of(k), "%s is pinned, outside the scroll%s" % [nm, tag])
	var card := b.find_child("DecisionCard", true, false) as Control
	check(card != null and pin.is_ancestor_of(card), "the pending decision card is pinned" + tag)
	var k1 := b.find_child("Advance1", true, false) as Control; var y0 := k1.global_position.y
	b.scroll.scroll_vertical = 100000; await frames(3)
	check(absf(k1.global_position.y - y0) < 1.0 and k1.get_global_rect().intersects(b.get_global_rect()), "scrolled to the end, the action row has not moved" + tag)
	b.scroll.scroll_vertical = 0; await frames(2)
	var pr := b.scroll.get_global_rect(); var bad: Array = []
	for c in _controls(b.body):
		var r := (c as Control).get_global_rect()
		if r.size.x > 1.0 and r.end.x > pr.end.x + 1.5 and (c as Control).is_visible_in_tree(): bad.append("%s %s" % [c.name, str(r)])
	check(bad.is_empty(), "no control reaches past the right edge of the page (%s)%s" % [str(bad.slice(0, 3)), tag])
	var pb: Array = []
	for c in _controls(pin):
		var r := (c as Control).get_global_rect()
		if r.size.x > 1.0 and r.end.x > pr.end.x + 1.5 and (c as Control).is_visible_in_tree(): pb.append("%s %s" % [c.name, str(r)])
	check(pb.is_empty(), "nor does the pinned area (%s)%s" % [str(pb.slice(0, 3)), tag])
	check(pin.get_global_rect().size.y <= b.get_global_rect().size.y * 0.6, "the pinned area leaves the page room (%.0f of %.0f)%s" % [pin.get_global_rect().size.y, b.get_global_rect().size.y, tag])

func _controls(n: Node) -> Array:
	var out: Array = []
	for c in n.get_children():
		if c is Control: out.append(c)
		out.append_array(_controls(c))
	return out

## Plant cards fold on a handheld (open where an alert lights), the pending card's long text hides behind DETAILS there.
func _cards(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	var compact := sz.y < 900
	check(b._compact() == compact, "the board knows it is a handheld: %.0fx%.0f%s" % [b.fit_w, b.fit_h, tag])
	for id in ["nh3", "acid", "meoh", "etoh"]:
		var tg := b.find_child("PlantToggle_" + id, true, false) as Button
		check(tg != null, "plant card %s has a fold key%s" % [id, tag])
		var has_cat := b.find_child("Catalyst_" + id, true, false) != null
		check(has_cat != compact, "%s is %s by default%s" % [id, "folded" if compact else "open", tag])
		check(b.find_child("InspNote_" + id, true, false) != null, "the inspection state shows even when folded" + tag)
	if compact:
		check(b.find_child("Summary_nh3", true, false) != null, "a folded card carries a one-line summary" + tag)
		var dd := b.find_child("DecisionDetails", true, false) as Button
		var ot := b.find_child("OptionText_A", true, false) as Control
		check(dd != null and ot != null and not ot.visible, "the pending card's option text is behind DETAILS" + tag)
		check(b.find_child("Effect_A", true, false) != null and (b.find_child("Effect_A", true, false) as Control).visible, "but its effect line, with the terms that add up to the MUSD, stays visible" + tag)
		dd.pressed.emit(); await frames(4); b = board()
		check((b.find_child("OptionText_A", true, false) as Control).visible, "DETAILS opens the option text" + tag)
		var tg2 := b.find_child("PlantToggle_nh3", true, false) as Button
		tg2.pressed.emit(); await frames(4); b = board()
		check(b.find_child("Catalyst_nh3", true, false) != null and b.find_child("Catalyst_acid", true, false) == null, "opening one card opens only that one" + tag)
		b.open_all(); await frames(4); b = board()
		check(b.find_child("Catalyst_etoh", true, false) != null, "open_all opens the rest" + tag)
	# an alert opens its plant's card by default: ten months on, an inspection is due
	await level("CAREER"); act("answer", [1])
	for i in 10: act("advance", [1])
	await refresh(); b = board()
	var al: Array = view().dashboard.alerts
	check(al.size() > 0, "ten months on there is an alert" + tag)
	if al.size() > 0 and compact:
		var pid := str(al[0].plant)
		check(b.find_child("Catalyst_" + pid, true, false) != null, "the plant with an alert is open by default (%s)%s" % [pid, tag])

## BUY CATALYST asks twice; BOOK is dark (not teal) when it cannot be pressed.
func _catalyst_and_book(sz: Vector2i) -> void:
	await level("CAREER"); await refresh()
	var b := board(); var tag := " (%dx%d)" % [sz.x, sz.y]
	b.open_all(); await frames(4); b = board()
	var kb := b.find_child("Book_nh3", true, false) as Button
	check(kb != null and kb.disabled, "BOOK is disabled without a charge" + tag)
	var sbd := kb.get_theme_stylebox("disabled") as StyleBoxFlat; var sbn := kb.get_theme_stylebox("normal") as StyleBoxFlat
	var k1 := b.find_child("Advance1", true, false) as Button
	var teal := (k1.get_theme_stylebox("normal") as StyleBoxFlat).bg_color
	check(sbd != null and (absf(sbd.bg_color.r - teal.r) + absf(sbd.bg_color.g - teal.g) + absf(sbd.bg_color.b - teal.b)) > 0.1, "its disabled face is not the teal of a pressable primary key (%s against %s)%s" % [str(sbd.bg_color), str(teal), tag])
	var kc := b.find_child("Catalyst_nh3", true, false) as Button
	var cash0 := float(view().dashboard.cashUSD)
	kc.pressed.emit(); await frames(4); b = board()
	check(int(view().plants[0].catalystStock) == 0 and float(view().dashboard.cashUSD) == cash0, "one press of BUY CATALYST buys nothing" + tag)
	kc = b.find_child("Catalyst_nh3", true, false) as Button
	check(kc != null and kc.text.begins_with("PRESS AGAIN"), "it says it waits for a second press: %s%s" % [kc.text if kc != null else "-", tag])
	kc.pressed.emit(); await frames(4); b = board()
	check(int(view().plants[0].catalystStock) == 1 and float(view().dashboard.cashUSD) < cash0, "the second press pays and the charge is in stock" + tag)
	kb = b.find_child("Book_nh3", true, false) as Button
	check(kb != null and not kb.disabled, "BOOK opens once there is a charge" + tag)

## CONTINUE ANYWAY: one press acknowledges the warning and runs again.
func _continue() -> void:
	await level("CAREER"); await refresh()
	var b := board()
	var guard := 0
	while guard < 30 and not bool(view().dashboard.needsAck) and str(view().dashboard.ending) == "":
		act("answer", [1]); b.advance_months(3); await frames(12); guard += 1
	check(bool(view().dashboard.needsAck), "a +3 MONTHS stop leaves a warning open (%d presses)" % guard)
	await create_timer(1.3).timeout; await frames(3)
	b = board()
	var ca := b.find_child("ContinueAnyway", true, false) as Button
	check(ca != null and not ca.disabled and has_ancestor(ca, "Pinned"), "CONTINUE ANYWAY is lit, in the pinned row")
	var m0 := int(view().dashboard.month)
	ca.pressed.emit(); await frames(16); b = board()
	check(int(view().dashboard.month) > m0, "one press of CONTINUE ANYWAY acknowledged and ran on (month %d to %d)" % [m0, int(view().dashboard.month)])
