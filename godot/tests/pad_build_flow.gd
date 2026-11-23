extends SceneTree
## The classic drafting table by pad alone, from the level's start to its win: L01 (the bench ammonia plant) and L10 (The Wall, drafting table of the gen-mode level).
## Everything is a real InputEventJoypadButton through Input.parse_input_event (D-pad, A, B, Y, Back, LB, RB), the real handlers answer, and the flow never calls
## the engine to build: it reads the engine only to check. Places by pad: the notebook's call-it field (keypad), Start, the tray (RB, A), the cursor (D-pad), A to
## place, the part's faceplate (A on the unit, chips and knobs by D-pad and keypad), a pipe between two ports (A on the outlet, A on the inlet), the key (Y, and A on
## the focused key), the speed dial (Back, and A on the focused dial). Also checks that the focus never leaves a dialog, that LB/RB never open the Codex behind the
## tray, and that a placed part leaves no red ghost. Prints PAD-BUILD-FLOW OK / PAD-BUILD-FLOW FAILED n.
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
	CbPad.enabled = true; CbLayout.forced = "desktop"   # a bare headless window is a handheld; the desktop layout is the one a monitor shows
	check(Input.get_connected_joypads().is_empty(), "no machine joypad reaches this test (another session's virtual pad would press buttons here; run via scripts/flows.sh, which sets the SDL ignore list): %s" % str(Input.get_connected_joypads().map(func(d): return Input.get_joy_name(d))))
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	root.size = Vector2i(1920, 1080); await frames(4)
	var only := OS.get_environment("CB_ONLY")   # CB_ONLY=L01 or L10 runs one level
	if only in ["", "L01"]: await _l01()
	if only in ["", "L10"]: await _l10()
	print("PAD-BUILD-FLOW checks=%d presses=%d" % [checks, presses])
	print("PAD-BUILD-FLOW OK" if fails == 0 else "PAD-BUILD-FLOW FAILED %d" % fails)
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
			if OS.get_environment("CB_VERBOSE") == "2": print("   to(%s): press %d -> focus %s" % [target.name, DPAD[k], str(focus().name) if focus() != null else "none"])
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

# ---- L01 ------------------------------------------------------------------------------------------------------------------------------------
func _l01() -> void:
	app.start_level("L01", true); await frames(12)
	await call_it_and_start("30.24")
	check(not (app.world.placing != ""), "L01: nothing in hand yet")
	var f1 := await place("feed", 0, 0)
	var f2 := await place("feed", 0, 4)
	var mx := await place("mixer", 4, 2)
	var rx := await place("stoich_reactor", 8, 0)
	var sp := await place("nh3_sep", 14, 0)
	var pr := await place("product", 18, 0)
	var vt := await place("vent", 18, 4)
	var ids := [f1, f2, mx, rx, sp, pr, vt]
	check(ids == ["F-101", "F-102", "M-103", "R-104", "D-105", "T-106", "Y-107"], "L01: the ids follow the order of placement: %s" % str(ids))
	# the two cylinder banks: N2 at 140.1 kg/h, H2 at 30.24 kg/h
	var fp := await open_plate("F-101")
	if fp != null:
		await press_on(fp._chips["N2"], "the N2 chip")
		await set_knob(fp, "bank", "140.1")
		await close_plate()
	fp = await open_plate("F-102")
	if fp != null:
		await press_on(fp._chips["H2"], "the H2 chip")
		await set_knob(fp, "bank", "30.24")
		await close_plate()
	await pipe("F-101", "out", "M-103", "in1")
	await pipe("F-102", "out", "M-103", "in2")
	await pipe("M-103", "out", "R-104", "in")
	await pipe("R-104", "out", "D-105", "in")
	await pipe("D-105", "liq", "T-106", "in")
	await pipe("D-105", "vap", "Y-107", "in")
	await btn(JOY_BUTTON_B); await frames(3)
	await _commission_and_win("L01", true)

func _commission_and_win(lvl: String, by_y: bool) -> void:
	var ch = app.chrome
	check(ch.engine_phase() == "design", "%s: the key stands at DESIGN" % lvl)
	if by_y: await key_turn_by_y()
	else:
		await press_on(ch.keys.key, "the key switch")
		await frames(4)
	if ch.engine_phase() == "commissioned":   # COMMISSION: one more turn of the key starts the run
		if by_y: await key_turn_by_y()
		else: await press_on(ch.keys.key, "the key switch")
		await frames(4)
	check(ch.engine_phase() != "design", "%s: the key turned past DESIGN (phase %s, status %s)" % [lvl, ch.engine_phase(), str(app.b.g.get("status", ""))])
	# the speed dial: Back steps it; A on the focused dial steps it too
	var ph := str(ch.engine_phase())
	if ph == "shift" or ph == "firstrun":
		var s0: int = ch.keys.speed_pos
		await btn(JOY_BUTTON_BACK); await frames(3)
		check(ch.keys.speed_pos == (s0 + 1) % 4 and app.speed == ch.keys.speed_pos, "%s: Back steps the speed dial (%d -> %d, clock %d)" % [lvl, s0, ch.keys.speed_pos, app.speed])
		await press_on(ch.keys.speed, "the speed dial")
		check(ch.keys.speed_pos == (s0 + 2) % 4, "%s: A on the focused speed dial steps it (-> %d)" % [lvl, ch.keys.speed_pos])
		while ch.keys.speed_pos != 3: await btn(JOY_BUTTON_BACK)
	var t := 0.0
	while t < 120.0 and str(app.b.g.get("status", "playing")) == "playing":
		await tick_wait(0.5); t += 0.5
		if app.modal() != null: break
	await frames(4)
	check(str(app.b.g.get("status", "")) == "won", "%s: the level is won by pad (status %s, phase %s)" % [lvl, str(app.b.g.get("status", "")), ch.engine_phase()])

# ---- L10 ------------------------------------------------------------------------------------------------------------------------------------
func _l10() -> void:
	app.start_level("L10", true); await frames(12)
	check(app.look2.gen != null and not app.look2.gen.visible, "L10: the drafting table first")
	await call_it_and_start("4.9")   # K of N2 + 3 H2 = 2 NH3 at 450 C is 4.899e-5 bar^-2 (the engine's own; the level takes 5 %)
	var comp := await place("compressor", 8, 2)
	var conv := await place("eq_reactor", 12, 0)
	var sep := await place("nh3_sep", 17, 0)
	var tank := await place("product", 21, 0)
	var vent := await place("vent", 21, 4)
	check([comp, conv, sep, tank, vent] == ["K-102", "R-103", "D-104", "T-105", "Y-106"], "L10: ids %s" % str([comp, conv, sep, tank, vent]))
	var fp := await open_plate(comp)
	if fp != null:
		await set_knob(fp, "P", "54")
		await set_knob(fp, "stages", "2")
		await close_plate()
	await pipe("F-101", "out", comp, "in")
	await pipe(comp, "out", conv, "in")
	await pipe(conv, "out", sep, "in")
	await pipe(sep, "liq", tank, "in")
	await pipe(sep, "vap", vent, "in")
	await btn(JOY_BUTTON_B); await frames(3)
	check(app.look2.gen != null and not app.look2.gen.visible, "L10: still on the drafting table (the hall's pad layer stayed out of the way)")
	await _commission_and_win("L10", false)

