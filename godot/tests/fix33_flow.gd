extends SceneTree
## Lane F33 (0.9 plant objects). L39 in the plant: picks made through the local panel's rotary selectors change the 3D line's radius (in proportion to the schedule-40
## inside diameter) and its velocity-guide colour, and the NPSH sight-glass level; a starved suction lights the red band and makes the pump cavitate; the pump wears its
## name-plate; the plotter puts the operating point on the curves and the readouts say it; a click on a pipe in the 3D view puts its selector in hand; every selector is a
## focusable key and the pad's A turns it, B puts it down. Also: the recorder's pen legends are short and never cut with an ellipsis, the parts tray folds to a tab on a
## pre-built plant and is gone on L39, and the 1280x800 intercom holds three lines and its teleprinter reaches the end of a long line.
## Run: godot --headless --path godot --script res://tests/fix33_flow.gd
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func level(id: String) -> void:
	app.start_level(id, true); await frames(5)
	Notebook.close(app); await frames(3)
	app.lvbay.refresh(true); await frames(3)
func board() -> HydBoard:
	app.lvbay.refresh(true); await frames(3)
	return app.lvbay.panel as HydBoard
func hyd() -> PumpHouse:
	var d = app.world.deco() if app.world != null and app.world.has_method("deco") else null
	return d.hyd if d != null else null
func view() -> Dictionary:
	var v = app.b.q("levelView")
	return v if v is Dictionary else {}

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	CbLayout.forced = "handheld"; root.size = Vector2i(1280, 800); await frames(6)
	await _pipes_and_gauge()
	await _plotter()
	await _hand_and_keys()
	await _legends()
	await _tray()
	await _intercom()
	CbLayout.forced = ""
	print("FIX33-FLOW checks=%d" % checks)
	print("FIX33-FLOW OK" if fails == 0 else "FIX33-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _press(hb: HydBoard, nm: String) -> HydBoard:
	var k := hb.control(nm) as Button
	check(k != null, "the selector key %s exists" % nm)
	if k != null: k.pressed.emit()
	await frames(2)
	return await board()

func _pipes_and_gauge() -> void:
	await level("L39")
	var hb := await board()
	var h := hyd()
	check(hb != null and hb.station != null and hb.station.is_visible_in_tree(), "L39 has its local panel of selectors")
	check(h != null, "the pump house stands in the plant")
	if hb == null or h == null: return
	await frames(2)
	var i0 := h.info()
	check(str(i0.discharge.nps) == "3" and str(i0.suction.nps) == "3", "the fitter's 3-inch lines are drawn at the start (%s / %s)" % [i0.suction.nps, i0.discharge.nps])
	var id3 := 0.0; var id4 := 0.0; var id5 := 0.0
	for p in view().pipes:
		if str(p.nps) == "3": id3 = float(p.idMm)
		if str(p.nps) == "4": id4 = float(p.idMm)
		if str(p.nps) == "5": id5 = float(p.idMm)
	check(absf(float(i0.discharge.radius) / float(i0.suction.radius) - 1.0) < 1e-6 and absf(float(i0.discharge.radius) - PumpHouse.R_SCALE * id3 / 1000.0) < 1e-6, "a 3-inch line is drawn at R_SCALE x its 77.9 mm inside diameter")
	var vd0 := float(view().op.vd); var g: Dictionary = view().guide
	check(str(i0.discharge.verdict) == ("fast" if vd0 > float(g.vdHi) else ("slow" if vd0 < float(g.vdLo) else "ok")), "the line's colour is the guide's verdict at the operating point (%s at %.2f m/s)" % [i0.discharge.verdict, vd0])
	hb = await _press(hb, "Pump_P2"); hb = await _press(hb, "Pipe_discharge_8"); await frames(2)
	i0 = hyd().info()
	check(str(i0.discharge.verdict) == "slow" and (i0.discharge.color as Color).is_equal_approx(PumpHouse.AMBER) and float(view().op.vd) < float(g.vdLo), "an 8-inch discharge runs too slow: the line is amber (%.2f m/s)" % float(view().op.vd))
	# discharge 8 -> 4 through the discharge selector's detent key
	hb = await _press(hb, "Pipe_discharge_4"); await frames(2)
	var i1 := hyd().info()
	check(str(view().choice.discharge) == "4", "the detent key reaches the engine (%s)" % str(view().choice.discharge))
	check(absf(float(i1.discharge.radius) - PumpHouse.R_SCALE * id4 / 1000.0) < 1e-6 and float(i1.discharge.radius) < float(i0.discharge.radius), "the discharge line is drawn smaller: radius %.3f -> %.3f (%.1f mm inside)" % [float(i0.discharge.radius), float(i1.discharge.radius), id4])
	check(absf(float(i1.discharge.radius) / float(i0.suction.radius) - id4 / id3) < 1e-6, "radius ratio equals the inside-diameter ratio (4-inch against the 3-inch suction)")
	check(str(i1.discharge.verdict) == "ok" and (i1.discharge.color as Color).is_equal_approx(PumpHouse.GREEN), "4-inch discharge sits in the guide: the line turns green (%s, %.2f m/s)" % [i1.discharge.verdict, float(i1.discharge.v)])
	# suction 3 -> 5 by turning the knob (two clicks of the knob body)
	var rs: HydStation.RotarySel = hb.station.sels.suction
	var n0: float = float(i1.npsh.level)
	rs.step(1); await frames(2); hb = await board()
	rs = hb.station.sels.suction; rs.step(1); await frames(2); hb = await board(); await frames(2)
	var i2 := hyd().info()
	check(str(view().choice.suction) == "5" and absf(float(i2.suction.radius) - PumpHouse.R_SCALE * id5 / 1000.0) < 1e-6, "two turns of the suction knob: the 5-inch line is drawn (%s, r %.3f)" % [str(view().choice.suction), float(i2.suction.radius)])
	check(float(i2.npsh.level) > n0 + 1e-4, "a bigger suction loses less head: the sight-glass level rises (%.3f -> %.3f)" % [n0, float(i2.npsh.level)])
	check(absf(float(i2.npsh.avail) - float(view().op.npsha)) < 1e-9 and absf(float(i2.npsh.req) - float(view().op.npshr)) < 1e-9, "the glass shows the engine's NPSH available and required")
	check(absf(float(i2.npsh.level) - PumpHouse.GLASS_H * float(view().op.npsha) / PumpHouse.NPSH_TOP) < 1e-6, "the level is NPSH available on the glass's scale")
	# the pump name-plate follows the pump selector
	hb = await _press(hb, "Pump_P2"); await frames(2)
	check(str(hyd().info().plate) == "P2" and h._plate.text.strip_edges() == "P2", "the pump on the plinth wears the P2 name-plate")
	# a starved suction: pump at the boiler house on a 2-inch suction -> margin under 1 m: red band, bubbles, shake
	hb = await _press(hb, "Place_far"); hb = await _press(hb, "Pipe_suction_2"); await frames(2)
	var i3 := hyd().info(); var op: Dictionary = view().op
	if bool(op.ok):
		check(float(op.margin) < 1.0, "far pump on a 2-inch suction: NPSH margin %.2f m" % float(op.margin))
		check(bool(i3.npsh.band_low) and bool(i3.cavitating), "the red band lights and the pump cavitates")
		check(h._cav.visible and h._pump != null and h._pump._shake_hold > 0.0, "CAVITATING tag over the pump, and it shakes")
	else:
		check(not bool(i3.cavitating), "no flow: nothing to cavitate")
	hb = await _press(hb, "Place_near"); hb = await _press(hb, "Pipe_suction_5"); await frames(2)
	check(not bool(hyd().info().cavitating) and not bool(hyd().info().npsh.band_low), "back near the tank on 5-inch: the band is dark, no cavitation")

func _plotter() -> void:
	var hb := await board()
	if hb == null: return
	hb.set_trim(93); hb = await board(); await frames(3)
	var cv := hb.find_child("Curves", true, false) as HydBoard.Curves
	check(cv != null and cv.size.y >= 240.0 and cv.size.x >= 400.0, "the pump curve is a big instrument (%s)" % (str(cv.size) if cv != null else "-"))
	if cv == null: return
	cv.queue_redraw(); await frames(2)
	var op: Dictionary = view().op
	check(bool(op.ok) and cv.op_px.x > 0.0 and Rect2(Vector2.ZERO, cv.size).has_point(cv.op_px), "the plotter draws the operating point (%s)" % str(cv.op_px))
	var rq := hb.find_child("Readout_Q", true, false) as Label
	check(rq != null and rq.text.begins_with(Ch9Board.fnum(float(op.q), 1)) and rq.label_settings.font_size >= 24, "the flow readout is large and is the operating point's (%s)" % (rq.text if rq != null else "-"))
	var rn := hb.find_child("Readout_NPSH", true, false) as Label
	check(rn != null and rn.text.contains(Ch9Board.fnum(float(op.margin), 2)), "the NPSH margin is read out (%s)" % (rn.text if rn != null else "-"))

func _hand_and_keys() -> void:
	var hb := await board()
	var h := hyd()
	if hb == null or h == null: return
	# every selector detent and key takes the keyboard / pad focus
	var keys: Array = []
	for nm in ["Pipe_suction_4", "Pipe_discharge_6", "Pump_P3", "TrimDown", "TrimUp", "TrimDown5", "TrimUp5", "Place_near", "Place_far"]: keys.append(hb.control(nm))
	var allf := true
	for k in keys: allf = allf and k != null and (k as Control).focus_mode == Control.FOCUS_ALL
	check(allf, "every selector detent and trim / position key is focusable")
	# a click on the suction pipe in the 3D view puts the suction selector in hand
	await frames(3)
	var sp := h.leg_screen("suction", app.world.cam)
	check(h.pick(sp, app.world.cam) == "suction", "the suction line answers a click on it (%s)" % str(sp))
	app.world._click_at(sp); await frames(3)
	var fo := hb.station.get_viewport().gui_get_focus_owner()
	check(hb.station.hand == "suction" and fo != null and str(fo.name) == "Pipe_suction_%s" % str(view().choice.suction), "the suction selector is in hand, focused on its detent (%s)" % (str(fo.name) if fo != null else "none"))
	var lit := true
	for seg in h._legs.suction: lit = lit and float((seg[3] as ShaderMaterial).get_shader_parameter("sel")) > 0.5
	check(lit, "the suction line glows while its selector is in hand")
	# keyboard / pad: walk to the next detent and press A
	var nb := hb.control("Pipe_suction_6") as Button
	nb.grab_focus(); await frames(2)
	var ev := InputEventAction.new(); ev.action = "ui_accept"; ev.pressed = true
	Input.parse_input_event(ev); await frames(2)
	var ev2 := InputEventAction.new(); ev2.action = "ui_accept"; ev2.pressed = false
	Input.parse_input_event(ev2); await frames(2)
	hb = await board()
	check(str(view().choice.suction) == "6", "A on the 6-inch detent turns the suction knob to it (%s)" % str(view().choice.suction))
	var fo2 := hb.station.get_viewport().gui_get_focus_owner()
	check(fo2 != null and str(fo2.name) == "Pipe_suction_6", "focus stays on the detent after the pick (%s)" % (str(fo2.name) if fo2 != null else "none"))
	# B puts the selector down (and opens no pause plate)
	var eb := InputEventAction.new(); eb.action = "ui_cancel"; eb.pressed = true
	Input.parse_input_event(eb); await frames(3)
	var eb2 := InputEventAction.new(); eb2.action = "ui_cancel"; eb2.pressed = false
	Input.parse_input_event(eb2); await frames(2)
	check(hb.station.hand == "" and app.modal() == null, "B puts the selector down, no pause plate")
	hb.pick_pipe("suction", "5"); await board()

func _legends() -> void:
	for id in ["CAREER_FIX_NH3_INERTS", "L39", "L20"]:
		await level(id)
		var li = app.b.q("levelInfo")
		var hero: Dictionary = li.get("hero", {}) if li is Dictionary else {}
		var sec: Dictionary = li.get("secondary", {}) if li is Dictionary and li.get("secondary") is Dictionary else {}
		check(str(hero.get("legend", "")).length() <= 12 and str(sec.get("legend", "")).length() <= 12 and str(hero.get("legend", "")) != "", "%s has short pen legends (%s / %s)" % [id, str(hero.get("legend", "")), str(sec.get("legend", ""))])
		var rec: ChartRecorder = app.chrome.recorder
		EqTheme.drawn.clear(); EqTheme.audit = true; rec.queue_redraw(); await frames(2); EqTheme.audit = false
		var tapes := 0; var cut := false; var clip := false
		for k in EqTheme.drawn:
			if not str(k).contains("Recorder"): continue
			var e: Array = EqTheme.drawn[k]
			if str(e[1]).contains("…"): cut = true
			if not bool(e[2]): clip = true
			if str(e[1]).begins_with(str(hero.get("legend", "?")).to_upper()) or str(e[1]).begins_with(str(sec.get("legend", "?")).to_upper()): tapes += 1
		check(not cut and not clip and tapes >= 2, "%s: the recorder's legends are whole, no ellipsis (%d tapes)" % [id, tapes])

func _tray() -> void:
	var c: EqConsole = app.chrome
	await level("CAREER_FIX_NH3_INERTS"); await frames(4)
	check(c.rack_tab and c.parts_btn.visible and not c.rack_wrap.visible, "a pre-built plant: the tray is a small PARTS tab, not three tiles")
	c.toggle_rack(); await frames(3)
	check(c.rack_wrap.visible, "the tab opens the tray")
	c.toggle_rack(); await frames(3)
	check(not c.rack_wrap.visible, "and folds it again")
	await level("L39"); await frames(4)
	check(not c.rack_wrap.visible and not c.parts_btn.visible, "L39 (nothing to place): no tray and no tab")
	c.layout(); await frames(3)
	check(not c.rack_wrap.visible, "...even after the console lays itself out again")
	await level("L01"); await frames(4)
	check(not c.rack_tab and not c.parts_btn.visible and c.rack_wrap.visible, "a build level keeps its tray of tiles")

func _intercom() -> void:
	var ic: Intercom = app.chrome.intercom
	await frames(3)
	check(ic.max_lines == 3 and ic.fit_lines() == 3, "the 1280x800 intercom holds three lines (%d / fit %d)" % [ic.max_lines, ic.fit_lines()])
	ic.say("MARA", "A long line on purpose: the teleprinter must read itself all the way down to the very last word of this sentence, which goes on and on past three lines of the strip so that it has to scroll at least twice before it ends with the word omega.", "info")
	ic.chars = 1.0e6; await frames(2)
	for i in 40: ic._process(1.2)
	var t := ic._text
	check(t.get_line_count() > t.max_lines_visible and t.lines_skipped == t.get_line_count() - t.max_lines_visible, "the teleprinter reaches the end of a long line (skipped %d of %d, %d shown)" % [t.lines_skipped, t.get_line_count(), t.max_lines_visible])
