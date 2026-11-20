extends SceneTree
## Round 7 fixes (F17): the Loop Panel fits a 1280x800 handheld (Stop and the hint pinned, dials in cells), Esc mid-run and a second key click never lose or double the run,
## a winning first run ends in the printout (bucket labels are ranges), the keypad is one size (Enter never moves), L38 chips drag to the right place and the board hides the CPM,
## L35 hides the heat-up minutes on the card, L37 clears the alarm of a flagged meter.
## Run: godot --headless --path godot --script res://tests/fix17_flow.gd
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func clear_modals() -> void:
	for n in app.root.get_children(): if n.has_meta("cb_modal"): n.queue_free()
	app.end_ui = null; app.menu_ui = null; await frames(3)
func level(id: String) -> void:
	await clear_modals()
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
	app.lvbay.refresh(true); await frames(5)
func lact(args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", args); app.game_on_changed(); return r
func dials(keys: Array, vals: Array) -> void:
	for i in keys.size(): lact(["setDial", keys[i], vals[i]])
	app.lvbay.refresh(true)
func phase() -> String: return str(app.b.q("levelInfo").get("phase", ""))
func all_text(n: Node) -> String:
	if n == null: return ""
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func click(c: Control, p: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.pressed = pressed; e.position = p; c._gui_input(e)
func drag(c: Control, a: Vector2, b: Vector2) -> void:
	click(c, a, true)
	var m := InputEventMouseMotion.new(); m.position = b; c._gui_input(m)
	click(c, b, false)

const L32_KEYS := ["on", "mKc", "mTauI", "sKc", "sTauI"]
const L32_REF := [1, 1.5, 150, 2, 6]

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false; CbSettings.last_mode = "learner"
	root.size = Vector2i(1280, 800); await frames(4)
	await _panel_fit()
	await _cascade_chart()
	await _esc_and_repeat()
	await _first_run_printout()
	await _keypad()
	await _chips()
	await _l35_l37()
	print("FIX17-FLOW checks=%d" % checks)
	print("FIX17-FLOW OK" if fails == 0 else "FIX17-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	await frames(2)
	quit(0 if fails == 0 else 1)

## Loop Panel at 1280x800 (L31-L33): the Stop key row and the hint line are fixed (same place in design and during a run), inside the panel and above the console;
## L31 / L32 need no scrolling; the "Dials are locked" sentence is whole.
func _panel_fit() -> void:
	var ctop := 0.0
	var refs := {"L31": [[], []], "L32": [L32_KEYS, L32_REF], "L33": [["sensors", "k", "tripC", "action"], [3, 2, 89, 3]]}
	for id in ["L31", "L32", "L33"]:
		await level(id)
		var cp: ControlPanel = app.lvbay.panel as ControlPanel
		check(cp != null, id + ": the loop panel exists")
		if cp == null: continue
		ctop = app.chrome.panel.global_position.y
		var hint0 := cp._hint.get_global_rect()
		dials(refs[id][0], refs[id][1])
		app.chrome.turn_key(true); await frames(8); app.lvbay.refresh(true); await frames(6)
		check(phase() == "firstrun" or phase() == "commissioned", "%s: commissioned (%s)" % [id, phase()])
		var locked := phase() == "firstrun"
		var pr := cp.get_global_rect()
		check(pr.end.y <= ctop + 1.0, "%s: panel bottom %.0f above the console %.0f" % [id, pr.end.y, ctop])
		check(cp.stop_key.visible == locked, "%s: Stop shows exactly while a run shows" % id)
		check(not locked or cp.stop_key.get_global_rect().end.x >= pr.end.x - 20.0, "%s: Stop is at the panel's right edge, off the dials" % id)
		check(pr.encloses(cp.stop_key.get_global_rect()), "%s: Stop is inside the panel" % id)
		check(absf(cp._hint.get_global_rect().position.y - hint0.position.y) <= 2.0, "%s: the hint line does not move (%.0f -> %.0f)" % [id, hint0.position.y, cp._hint.get_global_rect().position.y])
		check(pr.encloses(cp._hint.get_global_rect()), "%s: the hint is inside the panel" % id)
		if locked:
			check(cp._hint.text.begins_with("Dials are locked") and cp._hint.get_line_count() == cp._hint.get_visible_line_count() and cp._hint.size.y >= cp._hint.get_combined_minimum_size().y - 1.0, "%s: the locked sentence is shown whole (%d lines, %d visible, %.0f px)" % [id, cp._hint.get_line_count(), cp._hint.get_visible_line_count(), cp._hint.size.y])
		var sc := cp._scroll
		if id != "L33": check(cp._body.size.y <= sc.size.y + 2.0, "%s: no scrolling at 1280x800 (%d of %d px)" % [id, int(cp._body.size.y), int(sc.size.y)])
		check(sc.get_global_rect().end.y <= cp._hint.get_global_rect().position.y + 1.0, "%s: the body ends above the hint line" % id)
		# the dials sit in cells: each label is inside its own ruled cell
		var cells := cp.find_children("Cell_*", "PanelContainer", true, false)
		check(cells.size() == cp.knobs.size() and cells.size() > 0, "%s: one cell per dial (%d / %d)" % [id, cells.size(), cp.knobs.size()])
		cp.stop_key.pressed.emit(); await frames(10); app.lvbay.refresh(true); await frames(4)
	app.set_speed(0)

## L32: the flow pen is on the percent axis, so the bed temperature has its own scale.
func _cascade_chart() -> void:
	await level("L32"); dials(L32_KEYS, L32_REF)
	app.chrome.turn_key(true); await frames(8); app.lvbay.refresh(true); await frames(6)
	var cp: ControlPanel = app.lvbay.panel as ControlPanel
	check(bool(cp.view.get("extrasPct", false)), "L32: the view asks for the flow pen on the 0-100 % axis")
	var ser: Dictionary = cp.view.series
	var pv: Array = ser.pv; var flow: Array = ser.flow
	var pmin := 1e9; var pmax := -1e9
	for v in pv: pmin = minf(pmin, float(v)); pmax = maxf(pmax, float(v))
	var fmax := -1e9
	for v in flow: fmax = maxf(fmax, float(v))
	check(pmax - pmin < 30.0 and fmax > 40.0, "L32: bed temperature (span %.1f K) and quench flow (%.0f) differ by orders: they cannot share an axis" % [pmax - pmin, fmax])
	var labs := all_text(cp)
	check(not labs.contains("tauI") and not labs.contains("TAUI"), "L32: no dial is called tauI")
	cp.stop_key.pressed.emit(); await frames(8); app.lvbay.refresh(true); await frames(3)
	# a failed run names the dial
	dials(L32_KEYS, [1, 0.5, 300, 0.5, 20])
	app.chrome.turn_key(true); await frames(8)
	var rc = app.b.q("resultCard")
	var cause := str(rc.get("cause", "")) if rc is Dictionary else ""
	var li: Dictionary = app.b.q("levelInfo")
	check(cause.contains("slave Kc dial") or str(li.get("lesson", "")).contains("slave Kc dial"), "L32: a failed run names the dial to move (%s)" % (cause if cause != "" else str(li.get("lesson", ""))))

## Esc mid-run opens the pause menu and the run survives it; a second click on the key never starts a second run.
func _esc_and_repeat() -> void:
	await level("L32"); dials(L32_KEYS, L32_REF)
	app.chrome.turn_key(true); await frames(8)
	check(phase() == "firstrun", "L32: the winning dials roll a first run (%s)" % phase())
	var runs0 := (app.b.q("runs") as Array).size(); var t0 := int(app.b.g.get("tick", 0))
	app.set_speed(1)
	app.escape(); await frames(6)
	check(app.menu_ui != null and is_instance_valid(app.menu_ui), "Esc mid-run opens the pause menu")
	var tp := int(app.b.g.get("tick", 0))
	await frames(40)
	check(int(app.b.g.get("tick", 0)) == tp, "the run waits while the menu is open (tick %d -> %d)" % [tp, int(app.b.g.get("tick", 0))])
	app.escape(); await frames(4)
	check(app.menu_ui == null, "Esc again closes the menu")
	check(phase() == "firstrun" and (app.b.q("runs") as Array).size() == runs0, "the run is still there after the menu (%s, %d runs)" % [phase(), (app.b.q("runs") as Array).size()])
	app.chrome.turn_key(); await frames(3); app.chrome.turn_key(); await frames(3)
	check(phase() == "firstrun" and (app.b.q("runs") as Array).size() == runs0 and app.b.g.get("shift") == null, "repeat clicks on the key do not start another run (%s, %d runs)" % [phase(), (app.b.q("runs") as Array).size()])
	check(int(app.b.g.get("tick", 0)) >= t0, "the clock did not go back")
	# a plant that missed its goals: the key stays at COMMISSIONED, however often it is clicked
	await level("L32")
	app.chrome.turn_key(true); await frames(6)
	check(phase() == "commissioned", "L32 on the default dials is commissioned, not running (%s)" % phase())
	var r1 := (app.b.q("runs") as Array).size()
	app.chrome.turn_key(); await frames(3); app.chrome.turn_key(); await frames(3)
	check(phase() == "commissioned" and (app.b.q("runs") as Array).size() == r1, "the second and third click start nothing (%s)" % phase())
	check(app.b.g.get("shift") == null, "no shift object was created")
	app.chrome.stop_and_edit(); await frames(4)

## A winning first run ends in the printout; the histogram buckets are ranges with the YOU value inside the label it sits on.
func _first_run_printout() -> void:
	await level("L32"); dials(L32_KEYS, L32_REF)
	app.chrome.turn_key(true); await frames(8)
	for i in 12:
		if str(app.b.g.get("status", "")) == "won": break
		app.b.act("tick", [10]); await frames(2)
	check(str(app.b.g.get("status", "")) == "won", "L32: the first run ends and the level is won (%s)" % str(app.b.g.get("status", "")))
	await frames(8)
	var po := app.root.get_node_or_null("printout")
	check(po != null and app.end_ui != null, "the printout opens when the first run ends")
	if po == null: return
	var you_ok := false; var bucket_ok := true
	for l in po.find_children("Hist_*", "Label", true, false):
		var t := (l as Label).text
		var head := t.split("|")[0].strip_edges()
		check(head.contains("–"), "a bucket is labelled by its range (%s)" % head)
		if t.contains("YOU"):
			var rng := head.split("–"); var lo := rng[0].replace(",", "").to_float(); var hi := rng[1].replace(",", "").to_float()
			var tail := t.substr(t.find("YOU") + 3).strip_edges().replace(",", "")
			var v := tail.to_float()
			you_ok = v >= lo - 1e-6 and v <= hi + 1e-6 + (hi - lo)
			if not you_ok: bucket_ok = false
			print("  YOU bucket: ", t.strip_edges())
	check(you_ok and bucket_ok, "the YOU value lies inside the range of the bucket it is printed on")
	await clear_modals()

## The keypad is one size: Enter (OK) is in the same place whatever the title or the range line.
func _keypad() -> void:
	await clear_modals()
	var seen: Array = []
	for cfg in [["Short", "K", 0.0, 100.0, true], ["A very long dial title that wraps onto the tape over two lines", "K s", 0.0, 600.0, true], ["Mid", "%", 0.0, 1.0e7, true], ["Call it: the heat-up time", "min", 0.0, 100.0, false]]:
		Knob.keypad(app, str(cfg[0]), str(cfg[1]), "5", float(cfg[2]), float(cfg[3]), func(_v: float): pass, false, bool(cfg[4])); await frames(4)
		var m := app.modal()
		var ok: Button = null
		for b in m.find_children("*", "Button", true, false): if (b as Button).text == PaperStrings.t("KEYPAD_OK"): ok = b
		check(ok != null, "keypad '%s' has an Enter key" % str(cfg[0]).left(12))
		if ok != null: seen.append(ok.get_global_rect())
		await clear_modals()
	var same := seen.size() == 4
	for r in seen: if not (r as Rect2).position.is_equal_approx((seen[0] as Rect2).position) or not (r as Rect2).size.is_equal_approx((seen[0] as Rect2).size): same = false
	check(same, "Enter is in the same place and size in every keypad: %s" % str(seen))

## L38: the board hides the CPM until the call is locked; chips drag to the chip they are dropped on, a short drag moves one place, the arrows move the picked chip.
func _chips() -> void:
	await level("L38")
	var board: Ch9Gantt = app.lvbay.panel as Ch9Gantt
	check(board != null, "L38 board exists")
	if board == null: return
	check(not all_text(board).contains("CPM"), "L38: no CPM figure on the board before the call is locked")
	check(not all_text(board).contains("Critical path"), "L38: no critical-path hint before the call is locked")
	var order0: Array = app.b.q("levelView").priority
	var ch := board.find_child("Chips", true, false)
	check(ch != null and ch.chips.size() == 8, "L38: eight chips")
	if ch == null: return
	var rects: Array = ch._layout()
	# 1. drag chip 4 onto chip 1 (long drag to the left): lands in place 1, nothing else misplaced
	drag(ch, (rects[4] as Rect2).get_center(), (rects[1] as Rect2).get_center()); await frames(5)
	var o1: Array = app.b.q("levelView").priority
	var want := order0.duplicate(); var x = want[4]; want.remove_at(4); want.insert(1, x)
	check(o1 == want, "a chip dropped on a chip takes its place (%s)" % str(o1))
	# 2. a short drag of a chip to the right, ending on its own rectangle: one place later
	board = app.lvbay.panel as Ch9Gantt; ch = board.find_child("Chips", true, false); rects = ch._layout()
	var c3: Vector2 = (rects[3] as Rect2).position + Vector2(8.0, 12.0)
	drag(ch, c3, c3 + Vector2(16.0, 0.0)); await frames(5)
	var o2: Array = app.b.q("levelView").priority
	var want2 := o1.duplicate(); var y = want2[3]; want2.remove_at(3); want2.insert(4, y)
	check(o2 == want2, "a short drag to the right moves the chip one place (%s)" % str(o2))
	# 3. a drop inside a wide chip's right part goes to that chip even when the next, narrower chip's centre is nearer
	board = app.lvbay.panel as Ch9Gantt; ch = board.find_child("Chips", true, false); rects = ch._layout()
	var wide := -1
	for i in range(1, 7): if (rects[i] as Rect2).size.x > (rects[i + 1] as Rect2).size.x + 20.0 and (rects[i] as Rect2).position.y == (rects[i + 1] as Rect2).position.y: wide = i; break
	if wide > 0:
		var drop := Vector2((rects[wide] as Rect2).end.x - 3.0, (rects[wide] as Rect2).get_center().y)
		check(ch.slot_at(drop) == wide, "a point inside a wide chip belongs to it, not to the narrower neighbour")
	# 4. pick + arrow button
	board = app.lvbay.panel as Ch9Gantt; ch = board.find_child("Chips", true, false); rects = ch._layout()
	var before: Array = app.b.q("levelView").priority
	click(ch, (rects[2] as Rect2).get_center(), true); click(ch, (rects[2] as Rect2).get_center(), false); await frames(2)
	var later := board.find_child("ChipLater", true, false) as Button
	check(later != null, "the arrow buttons exist")
	if later != null: later.pressed.emit(); await frames(5)
	var o4: Array = app.b.q("levelView").priority
	var want4 := before.duplicate(); var z = want4[2]; want4.remove_at(2); want4.insert(3, z)
	check(o4 == want4, "pick a chip, press the later arrow: one place later (%s)" % str(o4))
	# the call locked: the CPM appears
	app.b.act("callIt", [13]); app.game_on_changed(); app.lvbay.refresh(true); await frames(5)
	check(all_text(app.lvbay.panel).contains("CPM 13 d"), "once the call is locked the board shows the CPM")

## L35: the heat-up card has no minutes until the call is locked. L37: a flagged meter's alarm is cleared.
func _l35_l37() -> void:
	await level("L35")
	var cards := app.lvbay.panel as Ch9Cards
	var txt := all_text(cards)
	check(txt.contains("Heat at 50 K/h") and not txt.contains("Heat at 50 K/h  ("), "L35: the 50 K/h card shows no minutes before the call (%s)" % txt.substr(maxi(txt.find("Heat at 50"), 0), 30).replace("\n", " "))
	check(txt.contains("Purge with nitrogen  ("), "L35: the other cards keep their minutes")
	app.b.act("callIt", [420]); app.game_on_changed(); app.lvbay.refresh(true); await frames(5)
	check(all_text(app.lvbay.panel).contains("Heat at 50 K/h  (420 min)"), "L35: after the call the card shows its minutes")
	await level("L37")
	var rec := app.lvbay.panel as Ch9Recon
	lact(["reconcile"]); app.lvbay.refresh(true); await frames(5)
	var meters: Array = app.b.q("levelView").meters; var worst := 0; var wz := 0.0
	var wz_signed := 0.0
	for m in meters: if absf(float(m.z)) > wz: wz = absf(float(m.z)); worst = int(m.i); wz_signed = float(m.z)
	var before := all_text(app.lvbay.panel)
	lact(["flag", worst]); app.lvbay.refresh(true); await frames(5)
	var after := all_text(app.lvbay.panel)
	var zs := "%+.2f" % wz_signed
	check(after.contains(zs + " out") and not after.contains(zs + " !"), "L37: once flagged (excluded) the meter's own alarm mark is gone and its z reads 'out' (%s)" % zs)
	check(not before.contains(zs + " out") and before.contains(zs + " !"), "L37: before the flag it was the red alarm")
