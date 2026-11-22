extends SceneTree
## Fix batch F2 (chapter-1 playtest round 2, front-end): delete (keys, bin key-caps, confirm strip), the intercom never contradicts the plant, bank faceplate
## header and one kmol/h rounding, the chart recorder (legend, every commission kept, autoscale, first-run counter), knob steps and clamps, picking,
## Esc and click-to-place, failed-solve chevron, Call it refusals, faceplates closing on level change, the duplicate-bank hint, the tripped plant.
## Run: godot --headless --path godot --script res://tests/fix2_flow.gd     Prints FIX2-FLOW OK / FIX2-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func key(code: int, uni := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = uni; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r)

func click_at(p: Vector2) -> void:
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r)

func lines_text() -> String:
	var s := ""
	for l in app.chrome.intercom.lines: s += str(l.speaker) + ": " + str(l.text) + "\n"
	return s

## The bench plant of L01/L04 as a player builds it (ids follow the placement order); `n2`/`h2` are bank flows in kg/h.
func build_l01(n2: float, h2: float, commission := false) -> Dictionary:
	var id := {}
	for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0], ["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["nh3_sep", 14, 0, 0], ["product", 18, 0, 0], ["vent", 18, 4, 0]]:
		var r: Dictionary = app.b.act("placeUnit", a)
		var k: String = a[0] if a[0] != "feed" or not id.has("feed") else "feed2"
		id[k] = str(r.get("id", ""))
	app.b.act("setBank", [id.feed, "N2", n2]); app.b.act("setBank", [id.feed2, "H2", h2])
	for c in [[id.feed, "out", id.mixer, "in1"], [id.feed2, "out", id.mixer, "in2"], [id.mixer, "out", id.stoich_reactor, "in"], [id.stoich_reactor, "out", id.nh3_sep, "in"], [id.nh3_sep, "liq", id.product, "in"], [id.nh3_sep, "vap", id.vent, "in"]]:
		app.b.act("connect", c)
	app.game_on_changed()
	if commission: app.chrome.turn_key(true)
	app.game_on_changed()
	return id

func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(2)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	await _delete()
	await _intercom_and_recorder()
	await _bank_and_knobs()
	await _picking_and_placing()
	await _failure_and_callit()
	await _l00()
	print("FIX2-FLOW checks=%d" % checks)
	print("FIX2-FLOW OK" if fails == 0 else "FIX2-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# 1: Delete / Backspace, the bin key-caps, the confirm strip
func _delete() -> void:
	await level("L01")
	var hub = Faceplate.attach(app)
	var w: PlantWorld = app.plant_world
	# an unpiped unit goes at once
	var lone: Dictionary = app.b.act("placeUnit", ["vent", 4, 10, 0]); app.game_on_changed(); await frames(2)
	check(bool(lone.ok) and w.unit_count() == 1, "a spare unit is placed: %s" % str(lone))
	w.select(str(lone.id)); w.unit_clicked.emit(str(lone.id)); await frames(2)
	key(KEY_DELETE); await frames(3)
	check(w.unit_count() == 0 and w.selected_id == "" and Faceplate.plates.is_empty(), "Delete removes the selected unpiped unit and its faceplate")
	var ids := build_l01(140.1, 30.24); await frames(2)
	var n0: int = w.unit_count()
	var mx: String = ids.mixer
	# a piped unit asks first (a small strip, not a modal)
	w.select(mx); w.unit_clicked.emit(mx); await frames(2)
	key(KEY_BACKSPACE); await frames(3)
	var ask := app.root.get_node_or_null("DeleteAsk")
	check(ask != null and app.modal() == null and w.unit_count() == n0, "Backspace on a piped unit shows the confirm strip, not a modal")
	check(ask != null and ask.find_child("Yes", true, false) != null and ask.find_child("No", true, false) != null, "the strip has Delete and Keep")
	key(KEY_ESCAPE); await frames(3)
	check(app.root.get_node_or_null("DeleteAsk") == null and w.unit_count() == n0, "Esc drops the strip and keeps the unit")
	w.select(mx); w.unit_clicked.emit(mx); await frames(2)
	var fp: Faceplate = Faceplate.plates.get(mx)
	check(fp != null and fp.find_child("Trash", true, false) is Button, "the faceplate carries a bin key-cap")
	(fp.find_child("Trash", true, false) as Button).pressed.emit(); await frames(3)
	ask = app.root.get_node_or_null("DeleteAsk")
	check(ask != null, "the bin key-cap asks too")
	(ask.find_child("Yes", true, false) as Button).pressed.emit(); await frames(3)
	check(w.unit_count() == n0 - 1 and not w.unit_ids().has(mx), "confirming deletes the mixer")
	var streams: Array = app.b.q("plant").streams
	var touching := 0
	for p in streams: if str(p.from.unit) == mx or str(p.to.unit) == mx: touching += 1
	check(touching == 0, "...with its pipes")
	# a pipe: highlight, Delete
	var pid := str(streams[0].id)
	w.pipes.select(pid); key(KEY_DELETE); await frames(3)
	var left := 0
	for p in app.b.q("plant").streams: if str(p.id) == pid: left += 1
	check(left == 0, "Delete on a highlighted pipe disconnects it")
	# the pinned stream tag has a bin too
	var rem: Array = app.b.q("plant").streams
	var tag: StreamTag = StreamTag.attach(app)
	var sid := str(rem[0].id)
	tag._pin_t = 5.0; tag.show_for(sid, Vector2(500, 300)); await frames(2)
	var tb := tag.find_child("Trash", true, false) as Button
	check(tb != null, "the pinned stream tag has a bin key-cap")
	if tb != null:
		click_at(tb.get_global_rect().get_center()); await frames(3)
		var gone := true
		for p in app.b.q("plant").streams: if str(p.id) == sid: gone = false
		check(gone, "clicking the tag's bin disconnects that pipe (a click on it does not just dismiss the tag)")
	Faceplate.close_all(); w.select("")

# 2, 4, 11: intercom outcomes, recorder legend / history / autoscale / first-run counter
func _intercom_and_recorder() -> void:
	await level("L01")
	var ch: EqConsole = app.chrome
	app.game_on_changed(); await frames(2)
	for a in [["feed", 0, 0, 0], ["feed", 0, 4, 0]]: app.b.act("placeUnit", a)
	app.game_on_changed(); await frames(2)
	check(lines_text().contains("Both banks carry N₂: switch one to H₂ with its chip."), "both banks N2: Mara says to switch one to H2 (%s)" % lines_text())
	app.b.act("setBank", ["F-102", "H2", 30.0]); app.game_on_changed(); await frames(2)
	check(not ch.intercom.last().text.begins_with("Both banks"), "...and stops saying it once fixed")
	for a in [["mixer", 4, 2, 0], ["stoich_reactor", 8, 0, 0], ["nh3_sep", 14, 0, 0], ["product", 18, 0, 0], ["vent", 18, 4, 0]]: app.b.act("placeUnit", a)
	app.b.act("setBank", ["F-101", "N2", 42.6]); app.b.act("setBank", ["F-102", "H2", 127.7])
	for c in [["F-101", "out", "M-103", "in1"], ["F-102", "out", "M-103", "in2"], ["M-103", "out", "R-104", "in"], ["R-104", "out", "D-105", "in"], ["D-105", "liq", "T-106", "in"], ["D-105", "vap", "Y-107", "in"]]:
		var rc: Dictionary = app.b.act("connect", c)

	app.game_on_changed(); await frames(2)
	ch.turn_key(true); app.game_on_changed(); await frames(3)
	check(ch.intercom.last().speaker == "MARA" and str(ch.intercom.last().text).contains("Kilograms do not count molecules"), "a missed commission says the lesson")
	var rec := ch.recorder
	check(rec.runs.size() == 1, "the first commission is on the recorder (%d)" % rec.runs.size())
	# the design is edited: nothing on the intercom talks about the old ratio
	app.b.act("setBank", ["F-101", "N2", 140.1]); app.game_on_changed(); await frames(3)
	check(not str(ch.intercom.last().text).contains("ratio"), "after a design edit the intercom no longer shows the lesson (%s)" % ch.intercom.last().text)
	app.b.act("setBank", ["F-102", "H2", 30.24]); app.game_on_changed(); await frames(2)
	ch.turn_key(true); app.game_on_changed(); await frames(3)
	var txt := lines_text()
	check(txt.contains("Goal met: "), "a winning commission says Goal met")
	check(str(ch.intercom.last().text) == str(app.b.q("levelInfo").get("runLine", "")) and str(ch.intercom.last().text) != "", "...then the engine's run line (%s)" % ch.intercom.last().text)
	check(rec.runs.size() == 2 and rec.runs[0].n == 1 and rec.runs[1].n == 2, "every commission stays on the recorder: two runs (%d)" % rec.runs.size())
	check(app.speed == 1, "the first run starts at 1x (speed %d)" % app.speed)
	# the first-run counter rolls with plant time
	var m0 := float(rec.first_run.get("madeKg", -1.0))
	for i in 3: app.b.act("tick", [1]); app.game_on_changed()
	var m1 := float(rec.first_run.get("madeKg", -1.0))
	check(m1 > m0 and m1 > 0.0, "the made-so-far counter rolls every tick (%f -> %f)" % [m0, m1])
	# the legend names each pen with its unit
	var li: Dictionary = app.b.q("levelInfo")
	var h := rec._legend(rec.hero); var s := rec._legend(rec.sec)
	check(h == "%s %s" % [str(li.hero.legend).to_upper(), li.hero.unit] and s == "%s %s" % [str(li.secondary.legend).to_upper(), li.secondary.unit] and s.contains("%"), "pen legends carry the level's short legend and unit (%s | %s)" % [h, s])   # F33: short legends, never cut
	# the plot fits every run and the axis holds every value (also a value far off the target band)
	rec.runs = []
	for v in [3.0, 10.0, 31.0, 250.0]: rec.record_run(v, 1.0, 0.0)
	rec.phase = "commissioned"
	var r := rec._range()
	check(r.x <= 0.0 + 1e-9 and r.y > 250.0, "autoscale keeps a 250 reading on the axis (%s)" % str(r))
	rec.runs = []; rec.samples = [{"h": 599.0, "s": 0.0, "t": 0.0}, {"h": 560.0, "s": 0.0, "t": 0.0}]
	rec.hero = {"key": "x", "label": "Conv", "unit": "°C", "value": 599.0, "lo": 542.0, "hi": 569.0}; rec.phase = "shift"
	r = rec._range()
	check(r.x < 542.0 and r.y > 599.0, "L00 599 °C sits inside the axis %s" % str(r))

# 3, 5: bank faceplate header, one rounding, knob steps and clamps
func _bank_and_knobs() -> void:
	await level("L01")
	Faceplate.li_extra = {}
	var hub = Faceplate.attach(app)
	app.b.act("placeUnit", ["feed", 0, 0, 0]); app.game_on_changed()
	app.b.act("setBank", ["F-101", "N2", 140.1]); app.game_on_changed(); await frames(2)
	var fp := Faceplate.open(app, "F-101"); await frames(2)
	check(fp._bank, "a bank faceplate")
	check(fp._name_lbl.text.contains("N₂"), "header says N₂ BANK (%s)" % fp._name_lbl.text)
	fp._chips.H2.pressed.emit(); await frames(2)
	check(fp._name_lbl.text.contains("H₂") and not fp._name_lbl.text.contains("N₂"), "the header follows the chip: H₂ BANK (%s)" % fp._name_lbl.text)
	var be: Dictionary = app.b.q("levelInfo").banks[0]
	var want := "%.2f" % float(be.kmolPerH)
	check(fp._kmol_lbl.text == "= " + want + " kmol/h", "kmol/h under the knob is banks[].kmolPerH to 2 dp (%s vs %s)" % [fp._kmol_lbl.text, want])
	check(str(fp.readouts.flow.text) == want and (fp._cells.flow[1] as Label).text == want, "the FLOW cell shows the same number (%s)" % fp.readouts.flow.text)
	fp.close()
	# knobs: 1 % coarse, 0.1 % fine of the engine's range, clamped to it
	app.b.act("placeUnit", ["mixer", 4, 2, 0]); app.b.act("placeUnit", ["stoich_reactor", 8, 0, 0]); app.game_on_changed(); await frames(2)
	var rp := Faceplate.open(app, "R-103"); await frames(2)
	var spec: Dictionary = {}
	for k in app.b.q("unitCard", ["R-103"]).knobs: if str(k.key) == "X": spec = k
	var kn: Knob = rp.knobs.X
	var span := kn.hi - kn.lo
	check(kn.coarse > 0.0 and spec.get("disp") is Dictionary and absf(kn.coarse - float(spec.disp.coarse)) < 1e-9 and kn.coarse <= span * 0.1, "wheel step is the engine's disp.coarse (%f of %f)" % [kn.coarse, span])   # F8: knobs carry the engine's own steps
	check(kn.fine <= kn.coarse * 0.25 and kn.fine > 0.0, "Shift step is a tenth of that (%f)" % kn.fine)
	kn.set_value(kn.hi + 1000.0); check(kn.value <= kn.hi + 1e-9, "a knob never goes above the engine max")
	kn.set_value(kn.lo - 1000.0); check(kn.value >= kn.lo - 1e-9, "...or below the engine min")
	rp.close()

# 6, 7: models, picking priority, Esc and the first click on the pad
func _picking_and_placing() -> void:
	await level("L01")
	var hub = Faceplate.attach(app)
	var w: PlantWorld = app.plant_world
	for t in ["stoich_reactor", "burner"]:
		var m := UnitModels.create(t, "x")
		check(m.tiles == Vector2i(4, 4) and m.height > 3.0 and UnitModels.kind(t) != "valve", "%s is a full-size reactor-class model, not a valve (tiles %s h %f)" % [t, str(m.tiles), m.height])
		m.free()
	for a in [["stoich_reactor", 8, 4, 0], ["vent", 8, 10, 0]]: app.b.act("placeUnit", a)
	app.game_on_changed(); await frames(3)
	var rid := "R-101"; var vid := "Y-102"
	check(w.unit_ids().has(rid) and w.unit_ids().has(vid), "a reactor and a vent are on the plot (%s)" % str(w.unit_ids()))
	# looking at the reactor body from where the camera is, the tall vent drawn in front must not take the pick
	var rm: UnitModel = w.unit_node(rid)
	var body := w.world_to_screen(rm.position + Vector3(0, 1.6, 0))
	check(w.pick(body) == rid, "a point on the reactor's body picks the reactor (%s)" % w.pick(body))
	var vm: UnitModel = w.unit_node(vid)
	check(w.pick(w.world_to_screen(vm.position + Vector3(0, 1.0, 0))) == vid, "and the vent's own body picks the vent")
	# Esc clears a half-made pipe and the highlight in one press
	hub.from_unit = rid; hub.from_port = "out"; hub.from_inlet = false; w.pipes.select(""); key(KEY_ESCAPE); await frames(3)
	check(hub.from_unit == "" and app.menu_ui == null, "Esc clears the half-made pipe")
	# the first click on the pad places at the clicked tile with no hover first
	var before: int = w.unit_count()
	w.begin_place("mixer"); await frames(2)
	var tile := Vector2i(16, 10)
	var sp := w.world_to_screen(w.tile_to_world(tile, Vector2i(1, 1)))
	click_at(sp); await frames(4)
	check(w.unit_count() == before + 1, "the first click places a mixer with no prior hover (%d -> %d)" % [before, w.unit_count()])
	var placed: Dictionary = {}
	for u in app.b.q("plant").units: if str(u.type) == "mixer": placed = u
	var px := int(placed.pos.x); var py := int(placed.pos.y)
	check(placed.has("pos") and absi(px - tile.x) <= 2 and absi(py - tile.y) <= 2, "...at the tile that was clicked (%d,%d for %s)" % [px, py, str(tile)])

# 8, 9: failed solve, Call it
func _failure_and_callit() -> void:
	await level("L01")
	var ch: EqConsole = app.chrome
	var w: PlantWorld = app.plant_world
	for a in [["feed", 0, 0, 0], ["mixer", 4, 2, 0]]: app.b.act("placeUnit", a)
	app.game_on_changed(); await frames(2)
	app.b.g["failure"] = {"code": "TEST", "unitId": "M-102"}
	ch._last_fail_msg = "The mixer has no inlet stream."
	ch._failure(); await frames(2)
	check(w.fail_focus() == "M-102" and w._fail_mark != null and w._fail_mark.visible, "a red chevron is over the failed unit")
	check(ch.intercom.last().speaker == "TOMAS" and str(ch.intercom.last().text).contains("M-102") and str(ch.intercom.last().text).contains("failed to solve"), "TOMAS names the tag and says why (%s)" % ch.intercom.last().text)
	app.b.g["failure"] = null; ch._failure(); await frames(1)
	check(w.fail_focus() == "", "the chevron clears with the failure")
	# Call it: refusal on the page, typed value kept; success shows the value and outlines the third flask
	await level("L01")
	build_l01(140.1, 30.24, true); await frames(3)
	Notebook.open(app); await frames(4)
	var nb := app.root.get_node_or_null("notebook")
	check(nb != null, "the notebook opens")
	var an := nb.find_child("Answer", true, false)
	an.tapped.emit(); await frames(3)
	var kp := app.modal()
	check(kp != null and kp.name == "keypad", "tapping the answer opens the keypad")
	var ttl := kp.find_child("Title", true, false)
	check(ttl != null and (ttl.get_child(0) as Label).autowrap_mode != TextServer.AUTOWRAP_OFF, "the keypad title wraps")
	key(KEY_3, 51); key(KEY_0, 48); key(KEY_ENTER); await frames(4)
	nb = app.root.get_node_or_null("notebook"); an = nb.find_child("Answer", true, false)
	var note := nb.find_child("CallNote", true, false) as Label
	check(note != null and note.visible and note.text.length() > 10, "the engine's refusal is on the page (%s)" % (note.text if note else "-"))
	check(is_equal_approx(an.text.to_float(), 30.0) and an.refused, "the typed value stays on the line (%s)" % an.text)
	Notebook.close(app); await frames(2)
	# a fresh level: a valid answer shows the value and arms the third flask
	await level("L01")
	Notebook.open(app); await frames(4)
	nb = app.root.get_node_or_null("notebook"); an = nb.find_child("Answer", true, false)
	an.tapped.emit(); await frames(3)
	key(KEY_3, 51); key(KEY_0, 48); key(KEY_ENTER); await frames(4)
	nb = app.root.get_node_or_null("notebook"); an = nb.find_child("Answer", true, false)
	var f3 := nb.find_child("Flask_2", true, false)
	check(is_equal_approx(an.text.to_float(), 30.0) and not an.refused, "an accepted answer shows the value (%s)" % an.text)
	check(f3 != null and f3.armed, "the third flask is outlined once an answer is locked in")
	Notebook.close(app); await frames(2)
	# 10: faceplates close on a level change
	Faceplate.attach(app)
	app.b.act("placeUnit", ["feed", 0, 0, 0]); app.game_on_changed(); await frames(2)
	Faceplate.open(app, "F-101"); await frames(2)
	check(not Faceplate.plates.is_empty(), "a faceplate is open")
	await level("L02")
	check(Faceplate.plates.is_empty(), "a level change closes every faceplate")

# 12: L00, the tripped plant
func _l00() -> void:
	await level("L00")
	var ch: EqConsole = app.chrome
	Faceplate.attach(app)
	var hf := Faceplate.open(app, "H-104"); await frames(2)
	var kn: Knob = hf.knobs.T
	var tspan := kn.hi - kn.lo
	check(kn.coarse > 0.0 and kn.coarse <= tspan * 0.1 and kn.fine <= kn.coarse * 0.25, "T wheel step is the engine's coarse, Shift its fine: %f / %f of %f" % [kn.coarse, kn.fine, tspan])
	kn.set_value(kn.lo - 500.0); check(kn.value >= kn.lo - 1e-9 and kn.value > -124.0, "T is clamped to the unitCard minimum (%f)" % kn.value)
	kn.set_value(t_start(hf))
	var t0 := kn.value
	var tgt := t0 + 20.0
	kn.set_value(tgt); kn.committed.emit(tgt); await frames(2)
	app.b.act("tick", [10]); await frames(2)
	var eng := 0.0
	for k in app.b.q("unitCard", ["H-104"]).knobs: if str(k.key) == "T": eng = EqFmt.to_disp(float(k.value), "degC")
	check(eng > t0 + 1.0, "the heater's set point ramps during the shift (%f -> %f)" % [t0, eng])
	var cool := Faceplate.open(app, "C-105"); await frames(2)
	var cp := ch.annunciator.wins.size()
	check(cp >= 4, "the annunciator is up")
	var r: Dictionary = app.b.act("trip", ["I-112"]); app.game_on_changed(); await frames(2)
	check(bool(r.get("ok", false)), "the interlock is tripped: %s" % str(r.get("message", "")))
	var ck: Knob = cool.knobs.T
	var before := EqFmt.to_si(ck.value, "degC")
	ck.set_value(ck.value - 30.0); ck.committed.emit(ck.value); await frames(3)
	check(str(ch.intercom.last().text) == "Plant tripped: reset the interlock first" and ch.intercom.last().speaker == "TOMAS", "a knob on a tripped plant says so (%s)" % ch.intercom.last().text)
	var after := 0.0
	for k in app.b.q("unitCard", ["C-105"]).knobs: if str(k.key) == "T": after = float(k.value)
	check(absf(after - before) < 1.0 or absf(after - 700.0) < 1.0, "...and the set point did not move (%f)" % after)
	check(absf(EqFmt.to_si(ck.value, "degC") - after) < 1.0, "the knob goes back to the engine's value")

func t_start(fp: Faceplate) -> float:
	for k in fp.card.knobs: if str(k.key) == "T": return EqFmt.to_disp(float(k.value), "degC")
	return 0.0
