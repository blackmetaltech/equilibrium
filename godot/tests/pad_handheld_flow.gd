extends SceneTree
## The handheld layout (Steam Deck, 1280x800) by pad alone: the feed bank's faceplate. A on F-101 opens the card; the focus must stand on the dial with a ring
## when it opens, LEFT/RIGHT and UP/DOWN step the dial (the engine's bank value changes), the plate says in one line which buttons do what, and the trash can
## is never the dial's neighbour (it takes no pad focus). Also: A with nothing focused on the drafting table lands on the parts tray, Start (not A) opens the menu.
## Prints PAD-HANDHELD-FLOW OK / PAD-HANDHELD-FLOW FAILED n.
var fails := 0
var checks := 0
var app
var presses := 0

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func btn(b: int) -> void:
	presses += 1
	var e := InputEventJoypadButton.new(); e.button_index = b; e.pressed = true
	Input.parse_input_event(e); await frames(2)
	var u := InputEventJoypadButton.new(); u.button_index = b; u.pressed = false
	Input.parse_input_event(u); await frames(2)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_NOCOACH", "1")
	CbPad.enabled = true; CbLayout.forced = "handheld"
	check(Input.get_connected_joypads().is_empty(), "no machine joypad reaches this test (run via scripts/flows.sh, which sets the SDL ignore list)")
	root.size = Vector2i(1280, 800)
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	root.size = Vector2i(1280, 800); await frames(4)
	check(CbLayout.kind == "handheld", "the layout is handheld (%s)" % CbLayout.kind)
	await _case()
	print("PAD-HANDHELD-FLOW checks=%d presses=%d" % [checks, presses])
	print("PAD-HANDHELD-FLOW OK" if fails == 0 else "PAD-HANDHELD-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# ---- reading --------------------------------------------------------------------------------------------------------------------------------
func focus() -> Control: return root.gui_get_focus_owner()
func plant() -> Dictionary: return app.b.q("plant")
func li() -> Dictionary: return app.b.q("levelInfo")
func units() -> Array: return plant().units
func uid_of(type: String, nth := 0) -> String:
	var n := 0
	for u in units():
		if str(u.type) == type:
			if n == nth: return str(u.id)
			n += 1
	return ""
func in_modal(c: Control) -> bool:
	var m = app.modal()
	return m != null and c != null and (m == c or m.is_ancestor_of(c))

# ---- the hand: D-pad navigation like a player's thumb: toward the thing, one press at a time -----------------------------------------------------
func _unused_dir_btn(d: Vector2, second := false) -> int:
	var horizontal: bool = absf(d.x) > absf(d.y)
	if second: horizontal = not horizontal
	if horizontal: return JOY_BUTTON_DPAD_RIGHT if d.x > 0.0 else JOY_BUTTON_DPAD_LEFT
	return JOY_BUTTON_DPAD_DOWN if d.y > 0.0 else JOY_BUTTON_DPAD_UP

const DPAD := [JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_UP]
const DVEC := [Vector2(1, 0), Vector2(-1, 0), Vector2(0, 1), Vector2(0, -1)]

## Press the D-pad toward `target` until it holds the focus, like a thumb that tries the way the thing lies first, then the other ways, and does not go back to
## where it has been (at most `cap` presses). Inside a dialog every press must keep the focus inside it.
func to(target: Control, cap := 90) -> bool:
	var visited := {}
	var used := 0
	while used < cap:
		if not is_instance_valid(target): return false
		var f := focus()
		if f == target: return true
		if f == null or not target.is_visible_in_tree(): await btn(JOY_BUTTON_DPAD_DOWN); used += 1; continue
		visited[f] = true
		var d := target.get_global_rect().get_center() - f.get_global_rect().get_center()
		var order := [0, 1, 2, 3]
		order.sort_custom(func(a, b): return DVEC[a].dot(d) > DVEC[b].dot(d))
		var moved := false
		for k in order:
			var modal_before: bool = app.modal() != null
			await btn(DPAD[k]); used += 1
			if modal_before and app.modal() != null and not in_modal(focus()): check(false, "focus left the dialog (%s)" % str(focus().get_path()))
			var nf := focus()
			if nf == f: continue
			if nf == target: return true
			if not visited.has(nf): moved = true; break
			await btn(DPAD[k ^ 1]); used += 1   # been there: back to where it was, try the next way
			if focus() != f: moved = true; break
		if not moved: break
	return focus() == target

func press_on(target: Control, what: String) -> void:
	var ok := await to(target)
	check(ok, "the D-pad reaches %s (focus: %s)" % [what, str(focus().name) if focus() != null else "none"])
	if not ok:
		print("   want ", target.name, " ", target.get_global_rect(), " vis ", target.is_visible_in_tree(), " mode ", target.focus_mode)
		for t in app.root.find_children("Pad_*", "Control", true, false): print("   ", t.name, " ", (t as Control).get_global_rect(), " ", (t as Control).visible, " ", (t as Control).focus_mode)
	if ok: await btn(JOY_BUTTON_A)

func find_btn(host: Node, text: String) -> Button:
	for b in host.find_children("*", "Button", true, false): if (b as Button).text == text and (b as Button).is_visible_in_tree(): return b
	return null

## A number on the keypad, by pad: each key by D-pad and A, then OK.
func keypad(text: String) -> void:
	await frames(3)
	var m = app.modal()
	check(m != null and m.name == "keypad", "a keypad is up")
	if m == null or m.name != "keypad": return
	for ch in text:
		var nm := "Key_dot" if ch == "." else "Key_" + ch
		var k: Control = m.find_child(nm, true, false)
		await press_on(k, "key " + ch)
	var ok := find_btn(m, PaperStrings.t("KEYPAD_OK"))
	await press_on(ok, "OK")
	await frames(4)

func tick_wait(sec: float) -> void: await create_timer(sec).timeout

# ---- the build, by pad -----------------------------------------------------------------------------------------------------------------------
## Open the notebook's call-it line by pad, type the number on the keypad, then Start work.
func call_it_and_start(value: String) -> void:
	for i in 80:   # the notebook opens a few frames after the level starts (more on a loaded machine)
		if app.modal() != null and app.modal().name == "notebook" and app.modal().find_child("Answer", true, false) != null: break
		await frames(5)
	await frames(6)
	check(app.modal() != null and app.modal().name == "notebook", "the notebook is up at the level's start")
	var psc = app.modal().find_child("PageScroll", true, false) if app.modal() != null else null
	check(psc != null and (psc as ScrollContainer).scroll_vertical == 0, "the notebook opens at the top of its page, the title whole (scroll %s)" % str((psc as ScrollContainer).scroll_vertical if psc != null else -1))
	# every D-pad direction a few times: the focus never leaves the page (the tray behind it is not reachable)
	for b in [JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_RIGHT]:
		await btn(b)
		check(in_modal(focus()), "notebook: focus stays on the page after D-pad %d (%s)" % [b, str(focus().get_path()) if focus() != null else "none"])
	var nb = app.modal()
	var ans: Control = nb.find_child("Answer", true, false)
	check(ans != null, "the notebook has its call-it line")
	if ans != null:
		await press_on(ans, "the call-it line")
		await keypad(value)
	check(bool(li().callIt.answered) and absf(float(li().callIt.value) - float(value)) < 1e-6, "the call-it answer is locked in: %s" % str(li().callIt))
	nb = app.modal()
	var go: Button = null
	for b in nb.find_children("*", "Button", true, false): if (b as Button).is_visible_in_tree() and (b as Button).get_parent() is HBoxContainer and (b as Button).get_index() == (b as Button).get_parent().get_child_count() - 1: go = b
	await press_on(go, "Start work")
	await frames(4)
	check(app.modal() == null, "Start work puts the notebook away (modal %s)" % str(app.modal()))

func rack() -> PartsRack: return app.root.find_child("PartsRack", true, false)

## Take a part from the tray (LB / RB walk the tiles, A takes one), move the cursor to the tile, place it with A.
func place(type: String, tx: int, ty: int) -> String:
	var w = app.world
	var n0 := units().size()
	var r := rack()
	var tile: Control = null
	for i in 14:
		await btn(JOY_BUTTON_RIGHT_SHOULDER)
		check(app.cur == app.home, "RB walks the tray, it never opens the Codex behind it")
		tile = focus()
		if tile != null and "type" in tile and str(tile.type) == type: break
	check(tile != null and "type" in tile and str(tile.type) == type, "RB brings the %s tile into focus (focus: %s)" % [type, str(tile.name) if tile != null else "none"])
	await btn(JOY_BUTTON_A)
	check(w.placing == type, "A takes a %s from the tray (placing '%s')" % [type, w.placing])
	check(bool(w.get("_cursor_valid")) and w.ghost_reason() == "", "the ghost starts green, not a red slab (%s)" % w.ghost_reason())
	# D-pad -> cursor deltas, learned from the screen like a player would: press each once and watch (an edge that clamps a step is read from the opposite button)
	var dirs := [JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_UP]
	var map := {}
	for b in dirs:
		var c0: Vector2i = w.get("_cursor"); await btn(b); map[b] = (w.get("_cursor") as Vector2i) - c0
	for i in 2:
		var opp := [1, 0, 3, 2]
		for j in 4:
			if map[dirs[j]] == Vector2i.ZERO and map[dirs[opp[j]]] != Vector2i.ZERO: map[dirs[j]] = -map[dirs[opp[j]]]
	if OS.get_environment("CB_VERBOSE") != "": print("  pad map ", map, " cursor ", w.get("_cursor"))
	for i in 100:
		var c: Vector2i = w.get("_cursor")
		var d := Vector2i(tx, ty) - c
		if d == Vector2i.ZERO: break
		var best := -1; var bd := absi(d.x) + absi(d.y)
		for b in dirs:
			var nd := absi((d - map[b]).x) + absi((d - map[b]).y)
			if nd < bd: bd = nd; best = b
		if best < 0: break
		await btn(best)
		if OS.get_environment("CB_VERBOSE") != "": print("   pressed ", best, " -> ", w.get("_cursor"))
	check(w.get("_cursor") == Vector2i(tx, ty), "the cursor reaches (%d, %d): %s" % [tx, ty, str(w.get("_cursor"))])
	await btn(JOY_BUTTON_A); await frames(4)
	check(units().size() == n0 + 1, "A places the %s (%d -> %d units)" % [type, n0, units().size()])
	check(w.placing == "" and w.get("_ghost") == null and w.ghost_reason() == "", "after the %s is down no ghost and no red overlay is left" % type)
	var id := uid_of(type, 0)
	return id if type != "feed" or units().is_empty() else str(units()[units().size() - 1].id)

## A on the unit opens its faceplate and the focus lands on it.
func open_plate(id: String) -> Faceplate:
	var t: Control = app.root.find_child("Pad_u_" + id, true, false)
	await press_on(t, "unit " + id)
	await frames(6)
	var fp = Faceplate.plates.get(id)
	check(fp != null and is_instance_valid(fp), "A on %s opens its faceplate" % id)
	check(fp != null and focus() != null and fp.is_ancestor_of(focus()), "the focus lands inside the %s plate (%s)" % [id, str(focus().get_path()) if focus() != null else "none"])
	return fp

func close_plate() -> void:
	await btn(JOY_BUTTON_B); await frames(3)
	check(Faceplate.plates.is_empty(), "B puts the faceplate away")

## Number on a knob: focus it, A, keypad.
func set_knob(fp: Faceplate, key: String, value: String) -> void:
	var k: Control = fp.knobs.get(key)
	check(k != null, "the plate has a '%s' knob" % key)
	if k == null: return
	await press_on(k, "knob " + key)
	await keypad(value)

## A pipe between two ports: A on the outlet, A on the inlet.
func pipe(a: String, ap: String, b: String, bp: String) -> void:
	var n0 := (plant().streams as Array).size()
	var t1: Control = app.root.find_child("Pad_p_%s_%s_false" % [a, ap], true, false)
	var t2: Control = app.root.find_child("Pad_p_%s_%s_true" % [b, bp], true, false)
	check(t1 != null and t2 != null, "port targets %s.%s and %s.%s are on the sheet" % [a, ap, b, bp])
	if t1 == null or t2 == null: return
	await press_on(t1, "outlet %s.%s" % [a, ap])
	check(app.root.get_node("PaperHub").from_unit == a, "A on the outlet takes the pipe in hand")
	await press_on(t2, "inlet %s.%s" % [b, bp])
	await frames(4)
	check((plant().streams as Array).size() == n0 + 1, "A on the inlet connects %s.%s to %s.%s (%d streams)" % [a, ap, b, bp, (plant().streams as Array).size()])

func key_turn_by_y() -> void:
	await btn(JOY_BUTTON_Y); await frames(4)

# ---- the case -------------------------------------------------------------------------------------------------------------------------------
func bank_kg(id: String) -> float:
	for b in (li().get("banks", []) as Array):
		if str(b.unit) == id: return float(b.kgPerH)
	return -1.0

func _case() -> void:
	app.start_level("L01", true); await frames(12)
	await call_it_and_start("30.24")
	# a focus that was lost (a plate put away, a dialog closed) is never parked on the gear: the tray takes it, and A does not open the menu
	app.get_viewport().gui_release_focus(); await frames(4)
	check(focus() != null and rack() != null and rack().is_ancestor_of(focus()), "a lost focus lands on the parts tray, not the gear (focus: %s)" % (str(focus().get_path()) if focus() != null else "none"))
	# the first pad press after the mouse: A with nothing focused puts the focus on the tray; the menu stays shut (Start opens it)
	app.pad.set_active(false); app.get_viewport().gui_release_focus(); await frames(4)
	check(focus() == null, "mouse mode: nothing is focused (focus: %s)" % str(focus()))
	await btn(JOY_BUTTON_A); await frames(4)
	check(app.modal() == null, "A with nothing focused does not open the menu (modal %s)" % str(app.modal()))
	check(focus() != null and rack() != null and rack().is_ancestor_of(focus()), "A with nothing focused puts the focus on the parts tray (focus: %s)" % (str(focus().get_path()) if focus() != null else "none"))
	check(app.world.placing == "", "that A took no part from the tray (placing '%s')" % app.world.placing)
	var f1 := await place("feed", 0, 0)
	check(f1 == "F-101", "the bank is F-101: %s" % f1)
	var fp := await open_plate("F-101")
	if fp == null: return
	var kn: Control = fp.knobs.get("bank")
	check(kn != null and focus() == kn, "on open the focus sits on the dial (focus: %s)" % (str(focus().get_path()) if focus() != null else "none"))
	check(kn != null and kn.is_visible_in_tree() and kn.get_global_rect().size.x > 20.0, "the dial is on screen")
	var hint := fp.find_child("PadHint", true, false)
	check(hint != null and hint is Label and (hint as Label).visible and (hint as Label).text != "", "the plate shows a one-line pad hint")
	if hint != null:
		var hl := hint as Label
		check(hl.text.contains("D-pad") and hl.text.contains("A") and hl.text.contains("B") and not hl.text.contains("\n"), "the hint names D-pad, A and B in one line: '%s'" % hl.text)
		var tw := hl.get_theme_font("font").get_string_size(hl.text, HORIZONTAL_ALIGNMENT_LEFT, -1, hl.get_theme_font_size("font_size")).x if hl.label_settings == null else hl.label_settings.font.get_string_size(hl.text, HORIZONTAL_ALIGNMENT_LEFT, -1, hl.label_settings.font_size).x
		check(tw <= hl.size.x + 0.5, "the hint line fits the plate (text %.0f px, label %.0f px)" % [tw, hl.size.x])
	# the dial steps by D-pad, both ways; the engine's value follows
	var v0 := bank_kg("F-101")
	await btn(JOY_BUTTON_DPAD_RIGHT); await tick_wait(0.5)
	var v1 := bank_kg("F-101")
	check(v1 > v0, "RIGHT raises the bank (%.2f -> %.2f)" % [v0, v1])
	await btn(JOY_BUTTON_DPAD_RIGHT); await tick_wait(0.5)
	var v2 := bank_kg("F-101")
	check(v2 > v1, "RIGHT again raises it (%.2f -> %.2f)" % [v1, v2])
	await btn(JOY_BUTTON_DPAD_LEFT); await btn(JOY_BUTTON_DPAD_LEFT); await btn(JOY_BUTTON_DPAD_LEFT); await tick_wait(0.5)
	var v3 := bank_kg("F-101")
	check(v3 < v2, "LEFT lowers the bank (%.2f -> %.2f)" % [v2, v3])
	check(focus() == kn, "the focus stayed on the dial through the presses (focus: %s)" % (str(focus().get_path()) if focus() != null else "none"))
	# UP / DOWN walk off the dial and back (a dial that took every direction would be a trap: the chips above it could never be reached)
	await btn(JOY_BUTTON_DPAD_UP)
	check(focus() != null and str(focus().name).begins_with("Chip_"), "UP from the dial reaches the species chips (focus: %s)" % (str(focus().name) if focus() != null else "none"))
	await btn(JOY_BUTTON_DPAD_DOWN)
	check(focus() == kn, "DOWN brings the focus back to the dial (focus: %s)" % (str(focus().name) if focus() != null else "none"))
	# the chip row is reachable too: N2 -> H2 -> N2 by the pad
	await press_on(fp._chips["H2"], "the H2 chip")
	await frames(3)
	check(str(fp._bank_entry(fp._li()).species) == "H2", "A on the H2 chip picks H2")
	await press_on(fp._chips["N2"], "the N2 chip")
	# trash is not on the focus path: no D-pad press from the dial lands on it, and A never deletes
	check(await to(kn), "the pad is back on the dial")
	var t0 := units().size()
	for b in [JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_LEFT]:
		await btn(b)
		check(not (focus() is Faceplate.TrashButton), "the trash can never takes the pad focus")
	check(units().size() == t0, "no press deleted the bank")
	await close_plate()
	# Start (not A) opens the menu
	await btn(JOY_BUTTON_START); await frames(4)
	check(app.modal() != null, "Start opens the menu")

