extends SceneTree
## Fix batch F8b (play-test round 4, tester b and c front end): drag OUT->IN piping, delete confirm, +/- steppers, keypad, stale guide lines, speed label,
## retry / predict, Semenov in DESIGN, intercom wrapping.   Run: godot --headless --path godot --script res://tests/fix8_flow.gd
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
func key(code: int, uni := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = uni; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r)
func mouse(p: Vector2, pressed: bool) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = pressed; Input.parse_input_event(e)
func click_at(p: Vector2) -> void:
	mouse(p, true); await frames(2); mouse(p, false); await frames(2)
func drag(a: Vector2, b: Vector2) -> void:
	mouse(a, true); await frames(2)
	var m := InputEventMouseMotion.new(); m.position = b; m.global_position = b; m.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(m); await frames(2)
	mouse(b, false); await frames(3)
func hub() -> Object: return app.root.get_node_or_null("PaperHub")
func place(type: String, x: int, y: int) -> String:
	var r: Dictionary = app.b.act("placeUnit", [type, x, y, 0]); app.game_on_changed(); await frames(2)
	return str(r.get("id", ""))
func pip(unit: String, port: String) -> Vector2:
	var w = app.world
	for i in range(w._marks.size()):
		var m: Dictionary = w._marks[i]
		if str(m.unit) == unit and str(m.port) == port: return w.cam.unproject_position((w._mark_nodes[i] as Node3D).global_position)
	return Vector2(-9999, -9999)
func piped(a: String, ap: String, b: String, bp: String) -> bool:
	for s in app.b.q("plant").streams:
		if str(s.from.unit) == a and str(s.from.port) == ap and str(s.to.unit) == b and str(s.to.port) == bp: return true
	return false
func nstreams() -> int: return (app.b.q("plant").streams as Array).size()
func show_ports_of(ids: Array) -> void:
	var marks: Array = []
	for id in ids: marks.append_array(hub()._free_ports(str(id)))
	app.world.show_ports(marks); await frames(2)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _piping(); await _delete(); await _steppers(); await _keypad(); await _stale(); await _speed(); await _predict_retry(); await _semenov(); await _intercom(); await _engine_addendum(); await _novice(); await _feeds_and_first_drag()
	print("FIX8-FLOW checks=%d" % checks)
	print("FIX8-FLOW OK" if fails == 0 else "FIX8-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# ---- 1. piping ----------------------------------------------------------------------------------------------------------------
func _piping() -> void:
	await level("L01"); Faceplate.attach(app)
	var f1 := await place("feed", 0, 0); var f2 := await place("feed", 0, 6); var mx := await place("mixer", 6, 3); var rx := await place("stoich_reactor", 12, 3)
	var tail := await place("product", 18, 3)
	app.world.select(f1); hub()._refresh_ports(); await frames(2)
	# the hint names one method
	check(PaperStrings.t("PIPE_HINT").to_lower().contains("drag") and not PaperStrings.t("PIPE_HINT").to_lower().contains("click"), "the pipe hint names the drag method only: " + PaperStrings.t("PIPE_HINT"))
	# drag OUT -> IN lands exactly one pipe, between the right units
	await show_ports_of([f1, mx]); var a := pip(f1, "out")
	check(a.x > -9000, "the feed's OUT pip is on screen")
	hub()._on_port(f1, "out", false); await frames(2)   # light targets to find the pip of the mixer inlet
	var b := pip(mx, "in1")
	hub().clear_pipe(); await show_ports_of([f1, mx])
	await drag(a, b)
	check(piped(f1, "out", mx, "in1"), "drag OUT->IN pipes feed to the mixer's in1"); check(nstreams() == 1, "exactly one pipe after the drag: %d" % nstreams())
	check(hub().from_unit == "" or hub().chained, "no half pipe is left in hand after a drag (F25: only the chain's re-armed pipe from the mixer)")
	# letting go over a unit's body takes its one lit inlet
	await show_ports_of([f2, mx]); var a2 := pip(f2, "out")
	var body: Vector2 = app.world.unit_screen_pos(mx) + Vector2(0, 8)
	await drag(a2, body)
	check(piped(f2, "out", mx, "in2"), "dropping on the mixer's body takes its free inlet in2"); check(nstreams() == 2, "two pipes now: %d" % nstreams())
	# the release never lands on another unit than the one under the pointer
	await show_ports_of([mx, rx]); var ra := pip(mx, "out")
	hub()._on_port(mx, "out", false); await frames(2)
	var tgt := pip(rx, "in")
	hub().clear_pipe(); await show_ports_of([mx, rx, tail])
	var rt: Dictionary = app.world.release_target(app.world.unit_screen_pos(tail), {"unit": mx, "port": "out", "inlet": false})
	check(rt.is_empty() or str(rt.unit) != rx, "letting go on the product tank never pipes to the reactor: %s" % str(rt))
	var rt2: Dictionary = app.world.release_target(tgt, {"unit": mx, "port": "out", "inlet": false})
	check(not rt2.is_empty() and str(rt2.unit) == rx, "letting go on the reactor's inlet pip picks the reactor: %s" % str(rt2))
	# click OUT, then click IN still works, and leaves nothing half made
	await show_ports_of([mx, rx]); var ca := pip(mx, "out")
	await click_at(ca); check(hub().from_unit == mx, "a click on OUT takes the pipe in hand")
	var cb := pip(rx, "in")
	await click_at(cb)
	check(piped(mx, "out", rx, "in"), "click OUT then click IN pipes mixer to reactor"); check(hub().from_unit == "" or hub().chained, "click-click leaves no half pipe in hand (F25: only the chain's re-armed pipe; its release starts nothing)")
	check(nstreams() == 3, "three pipes: %d" % nstreams())
	# click OUT then click the body of the target unit
	await show_ports_of([rx, tail]); var da := pip(rx, "out")
	await click_at(da); check(hub().from_unit == rx, "OUT of the reactor in hand")
	await click_at(app.world.unit_screen_pos(tail) + Vector2(0, 6))
	check(piped(rx, "out", tail, "in"), "click OUT then the target's body pipes it (one legal inlet)")
	hub().clear_pipe()

# ---- 2. delete ----------------------------------------------------------------------------------------------------------------
func _delete() -> void:
	await level("L01"); Faceplate.attach(app)
	var f1 := await place("feed", 0, 0); var mx := await place("mixer", 6, 3)
	app.b.act("connect", [f1, "out", mx, "in1"]); app.game_on_changed(); await frames(2)
	var fp: Faceplate = Faceplate.open(app, mx); await frames(6)
	app.world.select(mx)
	# the bin on a piped unit: the confirm is shown in front, on screen, with focus; the plate stays; nothing is deleted yet
	fp._trash.pressed.emit(); await frames(6)
	var ask: Control = app.root.get_node_or_null("DeleteAsk")
	check(ask != null, "the bin on a piped unit shows DeleteAsk")
	if ask != null:
		var vr := root.get_visible_rect()
		check(vr.encloses(ask.get_global_rect()), "the confirm is wholly on screen: %s in %s" % [str(ask.get_global_rect()), str(vr)])
		check(ask.visible and ask.z_index >= 50, "the confirm is in front (z %d)" % ask.z_index)
		var fo := root.gui_get_focus_owner()
		check(fo != null and ask.is_ancestor_of(fo), "a button of the confirm has focus: %s" % str(fo))
	check(Faceplate.plates.has(mx), "the panel is still open while the confirm is up")
	check(_has(mx), "the unit is not deleted before the answer")
	# a real mouse click on the bin does the same (never closes the panel silently)
	key(KEY_ESCAPE); await frames(3)
	if not Faceplate.plates.has(mx): fp = Faceplate.open(app, mx); await frames(6)
	await click_at(fp._trash.get_global_rect().get_center()); await frames(4)
	check(app.root.get_node_or_null("DeleteAsk") != null and _has(mx) and Faceplate.plates.has(mx), "a mouse click on the bin shows the confirm and keeps the panel")
	# Esc drops the confirm and keeps the unit
	key(KEY_ESCAPE); await frames(3)
	check(app.root.get_node_or_null("DeleteAsk") == null and _has(mx), "Esc keeps the unit and drops the confirm")
	# the Delete key on the selected piped unit: the same confirm
	app.world.select(mx); Faceplate.close_all(); await frames(2)
	key(KEY_DELETE); await frames(6)
	ask = app.root.get_node_or_null("DeleteAsk")
	check(ask != null, "Delete key on a piped selected unit shows the confirm")
	if ask != null:
		check(root.get_visible_rect().encloses(ask.get_global_rect()) and ask.z_index >= 50, "Delete-key confirm is on screen and in front")
		var fo2 := root.gui_get_focus_owner()
		check(fo2 != null and ask.is_ancestor_of(fo2), "Delete-key confirm has focus")
		key(KEY_DELETE); await frames(4)   # Delete again answers yes
	check(not _has(mx), "pressing Delete again on the confirm deletes the unit")

func _has(id: String) -> bool:
	for u in app.b.q("plant").units: if str(u.id) == id: return true
	return false

# ---- 3. steppers ----------------------------------------------------------------------------------------------------------------
func _knob_of(fp: Faceplate) -> Knob:
	for k in fp.knobs: if (fp.knobs[k] as Knob).choices.is_empty() and (fp.knobs[k] as Knob).editable: return fp.knobs[k]
	return null
func _press(kn: Knob, dir: int, pressed: bool) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.pressed = pressed; e.position = kn._nudge_rect(dir).get_center(); kn._gui_input(e)
func _mb(p: Vector2, pressed: bool) -> InputEventMouseButton:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.pressed = pressed; e.position = p; e.global_position = p; return e

func _steppers() -> void:
	await level("L10")
	var cid := await place("compressor", 8, 2)
	Faceplate.attach(app); var fp: Faceplate = Faceplate.open(app, cid); await frames(6)
	var kn := _knob_of(fp)
	check(kn != null, "the compressor plate has a stepping knob")
	if kn == null: return
	var v0 := kn.value
	_press(kn, 1, true); _press(kn, 1, false)
	var st := kn.value - v0
	check(st > 0.0, "one + click moves the knob: %f" % st)
	for i in 5:
		fp.refresh(); await frames(1)   # the engine refresh between clicks must not put the number back
		_press(kn, 1, true); _press(kn, 1, false)
	check(kn.value > v0 + 5.5 * st, "six rapid + clicks register all six: moved %f of %f" % [kn.value - v0, 6.0 * st])
	await create_timer(0.7).timeout; await frames(3)
	fp = Faceplate.plates.values()[0]; kn = _knob_of(fp)
	check(kn.value > v0 + 5.5 * st, "after the commit the knob keeps the six steps: %f" % (kn.value - v0))
	var v1 := kn.value
	_press(kn, -1, true); _press(kn, -1, false); _press(kn, -1, true); _press(kn, -1, false)
	check(kn.value < v1 - 1.0 * st, "rapid - clicks register too")
	# press and hold repeats
	var v2 := kn.value
	var pp := kn.get_global_rect().position + kn._nudge_rect(1).get_center()
	Input.parse_input_event(_mb(pp, true))   # a real press on the + button: the knob starts the repeat and the mouse state is down
	await create_timer(1.1).timeout
	var held := kn.value - v2
	Input.parse_input_event(_mb(pp, false))
	check(held > 3.0 * st, "holding + repeats: %f in 1.1 s (one step %f)" % [held, st])
	var v3 := kn.value
	await create_timer(0.4).timeout
	check(absf(kn.value - v3) < 1e-9, "the repeat stops when the button comes up")

# ---- 4. keypad ----------------------------------------------------------------------------------------------------------------
func _keypad() -> void:
	var fp: Faceplate = Faceplate.plates.values()[0]
	var kn := _knob_of(fp)
	kn._tap_number(); await frames(4)
	var rs: Label = root.find_child("Reason", true, false)
	check(rs != null and rs.visible, "the keypad always carries its reason line (reserved)")
	if rs == null: return
	var vb: Control = rs.get_parent()
	var h0 := vb.get_global_rect().size.y; var top0 := vb.get_global_rect().position.y
	for ch in [KEY_9, KEY_9, KEY_9, KEY_9, KEY_9]: key(ch, 48 + ch - KEY_0)
	await frames(3)
	var typed := ""
	for l in root.find_children("*", "Label", true, false): if (l as Label).text.begins_with("99999"): typed = (l as Label).text
	check(typed != "", "typed keyboard digits enter the keypad")
	key(KEY_ENTER); await frames(3)
	check(rs.text != "", "an out-of-range value says why: " + rs.text)
	var r1 := vb.get_global_rect()
	check(absf(r1.size.y - h0) < 0.5 and absf(r1.position.y - top0) < 0.5, "the pad does not move when the reason appears: %f -> %f, top %f -> %f" % [h0, r1.size.y, top0, r1.position.y])
	check(rs.get_line_count() <= 1, "the reason is one line")
	key(KEY_BACKSPACE); await frames(2)
	check(rs.text == "" and absf(vb.get_global_rect().size.y - h0) < 0.5, "typing clears the reason without a shift")
	key(KEY_ESCAPE); await frames(3)

# ---- 5. the stale guide line --------------------------------------------------------------------------------------------------
func _stale() -> void:
	await level("L01")
	var a := await place("feed", 2, 2)
	var w = app.world
	w.begin_place("feed"); await frames(2)
	check(not w.place_at(2, 2), "placing on a taken tile is refused")
	var ic = app.chrome.intercom
	check(str(ic.last().text).begins_with("Occupied by"), "the refusal is on the intercom: " + str(ic.last().text))
	check(w.place_at(10, 6), "a free tile accepts"); await frames(3)
	var txt := ""
	for l in ic.lines.slice(maxi(0, ic.lines.size() - 2)): txt += str(l.text) + "|"
	check(not str(ic.last().text).begins_with("Occupied by") and not ic.shown_text().begins_with("Occupied by"), "the Occupied line is gone once the placement succeeded: " + txt)
	w.begin_place("feed"); await frames(2); w.place_at(2, 2); await frames(1)
	check(str(ic.last().text).begins_with("Occupied by"), "refused again")
	w.begin_place("mixer"); await frames(2)
	check(not str(ic.last().text).begins_with("Occupied by"), "changing tool withdraws the stale Occupied line")
	w.cancel_place()

# ---- 6. the speed label ---------------------------------------------------------------------------------------------------------
func _speed() -> void:
	await level("L24"); await frames(3)
	var keys = app.chrome.keys
	check(keys.speed.note.begins_with("PAUSED"), "DESIGN: the clock says PAUSED (%s)" % keys.speed.note)
	app.chrome.turn_key(true); await frames(6)
	app.chrome.choose_speed(3); await frames(6)
	check(app.speed == 3 and keys.speed_pos == 3, "the shift runs at 16x and the dial shows it")
	check(keys.speed.note == "", "no PAUSED note over a 16x shift: '%s'" % keys.speed.note)
	app.chrome.choose_speed(0); await frames(4)
	# moved on purpose (0.12 speed-label fix): the note now follows the clock every frame, so a paused run says "PAUSED: press 1x" (what the old refresh-only code said at its next engine event); what must never show is the DESIGN note
	check(keys.speed.note == PaperStrings.t("CLOCK_PAUSED_RUN") and keys.speed_pos == 0, "pausing a running shift shows the pause bars and says PAUSED: press 1x ('%s')" % keys.speed.note)
	check(not keys.speed.note.begins_with(PaperStrings.t("CLOCK_PAUSED").left(8) + " ") or keys.speed.note != PaperStrings.t("CLOCK_PAUSED"), "the DESIGN note never shows over a paused shift ('%s')" % keys.speed.note)

# ---- 7. retry keeps the design; the predict question is asked once --------------------------------------------------------
func _predict_retry() -> void:
	await level("L24"); await frames(3)
	var iid := ""; var key_name := ""; var want := 0.0
	for u in app.b.q("plant").units:
		if iid != "": break
		var c2 = app.b.q("unitCard", [str(u.id)])
		for k in c2.knobs:
			if str(k.kind) != "choice" and k.get("min") != null and float(k.max) > float(k.min):
				var nv: float = float(k.min) + (float(k.max) - float(k.min)) * 0.37
				var r: Dictionary = app.b.act("setParam", [str(u.id), str(k.key), nv])
				if bool(r.get("ok", false)):
					iid = str(u.id); key_name = str(k.key)
					for x in app.b.q("unitCard", [iid]).knobs: if str(x.key) == key_name: want = float(x.value)
					break
	check(iid != "", "found a knob to edit")
	app.chrome.turn_key(true); await frames(4)
	var host := Control.new(); root.add_child(host)
	await Printout._retry(app, host); await frames(4)
	var got := -1.0
	for k in app.b.q("unitCard", [iid]).knobs: if str(k.key) == key_name: got = float(k.value)
	check(absf(got - want) <= 1e-9 * maxf(1.0, absf(want)), "Retry keeps the edited knob %s: %f -> %f" % [key_name, want, got])
	check(app.chrome.intercom.lines.any(func(l): return str(l.text) == PaperStrings.t("IC_RETRY_KEPT")), "Retry says the build is kept")
	# the predict question: once per attempt
	await level("L01")
	if app.chrome._call_it_empty():
		BuildKeeper.predict_done.erase("L01")
		build_l01_plant()
		app.chrome.turn_key(); await frames(4)
		check(app.root.find_child("RunAnyway", true, false) != null, "the first commission asks for the prediction")
		var ra: Button = app.root.find_child("RunAnyway", true, false)
		if ra != null: ra.pressed.emit(); await frames(8)
		check(app.root.find_child("RunAnyway", true, false) == null, "Run anyway closes the question")
		app.chrome.stop_and_edit(); await frames(4)
		app.chrome.turn_key(); await frames(4)
		check(app.root.find_child("RunAnyway", true, false) == null, "after the answer (or Run anyway) the question never comes back for this attempt")
		await Printout._retry(app, Control.new()); await frames(4)
		app.chrome.turn_key(); await frames(4)
		check(app.root.find_child("RunAnyway", true, false) == null, "nor after a Retry")
	else:
		check(false, "L01 should have an open Call it at the start")

func build_l01_plant() -> void:
	var id := {}
	for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["nh3_sep", 14, 0, 0], ["product", 18, 0, 0], ["vent", 18, 4, 0]]:
		var r: Dictionary = app.b.act("placeUnit", a)
		var k: String = a[0] if a[0] != "feed" or not id.has("feed") else "feed2"
		id[k] = str(r.get("id", ""))
	app.b.act("setBank", [id.feed, "N2", 140.0]); app.b.act("setBank", [id.feed2, "H2", 30.0])
	for c in [[id.feed, "out", id.mixer, "in1"], [id.feed2, "out", id.mixer, "in2"], [id.mixer, "out", id.stoich_reactor, "in"], [id.stoich_reactor, "out", id.nh3_sep, "in"], [id.nh3_sep, "liq", id.product, "in"], [id.nh3_sep, "vap", id.vent, "in"]]:
		app.b.act("connect", c)
	app.game_on_changed()

# ---- 8. the Semenov plot in DESIGN ----------------------------------------------------------------------------------------------
func _semenov() -> void:
	await level("L24"); await frames(6)
	app.bay.refresh(true); await frames(3)
	check(app.bay.view is SemenovView, "L24 shows the Semenov plot")
	if not (app.bay.view is SemenovView): return
	var sv: SemenovView = app.bay.view
	check(not sv.live, "DESIGN: the plot draws no operating point (no 'actual' T before a run)")
	var design_size: Vector2 = app.bay.size
	app.chrome.turn_key(true); await frames(6); app.bay.refresh(true); await frames(3)
	check((app.bay.view as SemenovView).live, "after commissioning the operating point is live")
	check(design_size.x < app.bay.size.x and design_size.y < app.bay.size.y, "the DESIGN sheet is smaller than the running one: %s vs %s" % [str(design_size), str(app.bay.size)])
	app.chrome.stop_and_edit(); await frames(12); app.bay.refresh(true); await frames(3); app.bay.refresh(true); await frames(3)
	check(app.bay.size.is_equal_approx(design_size) and not (app.bay.view as SemenovView).live, "back in DESIGN it is small again with no operating point: %s vs %s live %s phase %s compact %s vmin %s" % [str(app.bay.size), str(design_size), str((app.bay.view as SemenovView).live), app.chrome.engine_phase(), str(app.bay._compact), str(app.bay.view.custom_minimum_size)])

# ---- 9. the intercom wraps whole words ---------------------------------------------------------------------------------------------
func _intercom() -> void:
	await level("L24")
	var ic = app.chrome.intercom
	for sz in [Vector2i(1920, 1080), Vector2i(1280, 720)]:
		root.size = sz; await frames(6)
		ic.say("MARA", "Propylene glycol reactor. It has two personalities: lazy at 28 degrees and productive at 117. Between them is a cliff. The cooling pump is old, so keep the coolant a little above where the interlock trips and reset the interlock first. %d" % sz.x, "info"); await frames(8)
		await create_timer(4.5).timeout
		var t: Label = ic._text
		var lh := t.get_line_height()
		check(t.max_lines_visible * lh <= t.size.y + 1.5, "%s: the shown lines fit the box height (%d x %.0f <= %.0f)" % [str(sz), t.max_lines_visible, lh, t.size.y])
		check(t.visible_characters == -1, "%s: the whole line is revealed" % str(sz))
		for _i in 40:   # a new line starts at its first word, then reads itself down like a teleprinter (F23)
			if t.get_line_count() <= t.max_lines_visible or t.lines_skipped > 0: break
			await create_timer(0.25).timeout
		check(t.get_line_count() <= t.max_lines_visible or t.lines_skipped > 0, "%s: a line longer than the box scrolls by whole lines" % str(sz))
	root.size = Vector2i(1920, 1080); await frames(4)

# ---- addendum: interlock reset, engine knob steps, the L18 rig card ----------------------------------------------------------------
func _engine_addendum() -> void:
	await level("L24"); Faceplate.attach(app)
	var ilk := ""
	for u in app.b.q("plant").units: if str(u.type) == "interlock": ilk = str(u.id)
	check(ilk != "", "L24 has its interlock")
	var fp: Faceplate = Faceplate.open(app, ilk); await frames(6)
	var rb: Button = fp.find_child("ResetInterlock", true, false)
	check(rb != null, "the interlock card carries a RESET button")
	if rb != null:
		var n0: int = app.chrome.intercom.lines.size()
		rb.pressed.emit(); await frames(3)
		var ic = app.chrome.intercom
		check(ic.lines.size() > n0 and str(ic.last().text) != "" and str(ic.last().kind) == "warn", "RESET with nothing tripped shows the engine's refusal text: %s" % str(ic.last().text))
	var kn: Knob = null
	for k in fp.knobs: kn = fp.knobs[k]
	var d = null
	for k in app.b.q("unitCard", [ilk]).knobs: d = k.get("disp")
	check(d is Dictionary and kn != null and absf(kn.coarse - float(d.coarse)) < 1e-9 and absf(kn.fine - float(d.fine)) < 1e-9, "the knob steps are the engine's disp.coarse / disp.fine: %s vs %s" % [str(d), str(kn.coarse if kn else -1)])
	if kn != null:
		kn.set_value(130.0)
		var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.pressed = true; e.position = kn._nudge_rect(-1).get_center(); kn._gui_input(e); e.pressed = false; kn._gui_input(e)
		check(absf(kn.value - (130.0 - kn.fine)) < 1e-6, "one - click on a temperature knob steps 1 degC (the engine's fine step): %f" % kn.value)
		var e2 := InputEventMouseButton.new(); e2.button_index = MOUSE_BUTTON_WHEEL_DOWN; e2.pressed = true; kn.set_value(130.0); kn._gui_input(e2)
		check(absf(kn.value - (130.0 - kn.coarse)) < 1e-6, "one wheel notch steps by the engine's coarse step: %f" % kn.value)
	await level("L18"); Faceplate.attach(app)
	var rig := ""
	for u in app.b.q("plant").units: if str(u.type) == "batch": rig = str(u.id); break
	check(rig != "", "L18 has bench rigs")
	var f2: Faceplate = Faceplate.open(app, rig); await frames(6)
	var c = app.b.q("unitCard", [rig])
	check(f2._cat_note != null and f2._cat_note.text.contains(str(c.rig.catalystName)) and f2._cat_note.text.contains(str(c.rig.kTextNow)), "the rig card names its catalyst and shows k now: %s" % (f2._cat_note.text if f2._cat_note else ""))
	var lv = app.b.q("levelView")
	check(f2._cat_note.text.contains(str(lv.kNeededText)) and (f2._cat_note.text.contains("fast enough") or f2._cat_note.text.contains("too slow")), "the bench summary gives fast enough / too slow against kNeeded")
	var ids := (f2.pickers["catalyst"] as Dictionary).keys()
	check(ids.size() == 3 and ids.has("iodide") and ids.has("catalase") and ids.has("none"), "the rig's picker offers none / iodide / catalase: %s" % str(ids))
	check((f2.pickers["catalyst"]["iodide"] as Button).tooltip_text.contains("k "), "an option's tooltip carries its k")

# ---- novice addendum: a lost level has a way back; Retry = the menu's keep-my-build; first drag from a feed; feeds tell air from fuel ---------------
func _units_sig() -> String:
	var a: Array = []
	for u in app.b.q("plant").units: a.append("%s@%d,%d" % [str(u.id), int(u.pos.x), int(u.pos.y)])
	for st in app.b.q("plant").streams: a.append("%s>%s" % [str(st.from.unit), str(st.to.unit)])
	a.sort(); return ",".join(a)
func _novice() -> void:
	await level("L24"); await frames(3)
	var before := _units_sig()
	app.chrome.turn_key(true); await frames(6)
	app.b.g["status"] = "lost"; app.chrome.refresh(); await frames(4)   # the engine's lost state as the client mirrors it
	if true:
		app.chrome.turn_key(); await frames(8)
		check(str(app.b.g.get("status", "playing")) == "playing", "turning the key on a lost level returns to a playable DESIGN")
		check(app.chrome.engine_phase() == "design", "and the phase is design: %s" % app.chrome.engine_phase())
		check(_units_sig() == before, "the plant is kept exactly through the way back")
		# Retry from a ticket == Restart, keep my build
		await Printout._retry(app, Control.new()); await frames(6)
		check(_units_sig() == before, "Retry keeps the plant exactly like the menu's keep-my-build")

func _feeds_and_first_drag() -> void:
	await level("L03"); await frames(6)
	app.game_on_changed(); app.world._feed_ms = 0; app.world.set_snapshot(app.b.g); await frames(3)
	var ids: Array = []
	for u in app.b.q("plant").units: if str(u.type) == "feed": ids.append(str(u.id))
	check(ids.size() >= 2, "L03 has two feeds")
	var tags: Array = []; var bands: Array = []
	for id in ids:
		var m = app.world.unit_node(id) if app.world.has_method("unit_node") else app.world._units[id]
		var lb: Label3D = m.get_node_or_null("SpeciesTag"); tags.append(lb.text if lb != null else ""); bands.append(m._bands[0].albedo_color if m._bands.size() > 0 else Color.BLACK)
	check(tags.size() >= 2 and tags[0] != tags[1] and tags[0] != "" and tags[1] != "", "air and fuel feeds carry different tags: %s" % str(tags))
	check(bands.size() >= 2 and not bands[0].is_equal_approx(bands[1]), "and different colour bands: %s" % str(bands))
	check(str(tags).contains("AIR"), "the air feed says AIR")
	# the first press on a feed's port, with another part placed since and no hover first, pipes (does not just select a machine)
	Faceplate.attach(app)
	var f1: String = ids[0]; var bn := await place("burner", 10, 3)
	app.world.select(bn); hub()._refresh_ports(); hub().hover_id = ""; await frames(3)
	var pf: Dictionary = app.world.port_frame(f1, "out", false)
	var toward: Vector3 = app.world.cam.global_transform.basis.z.normalized()
	var sp: Vector2 = app.world.cam.unproject_position(pf.pos + pf.dir * 0.3 + toward * 1.2 + Vector3(0, 0.25, 0))
	var sel0: String = app.world.selected_id
	mouse(sp, true); await frames(2)
	check(hub().from_unit == f1, "the first press on the feed's port starts a pipe from it (from=%s)" % hub().from_unit)
	mouse(sp, false); await frames(2)
	hub().clear_pipe()
