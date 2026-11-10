extends SceneTree
## Console chrome flow (UI.md 3-6, 9): headless with the real engine bridge. Title shows with no kit title nodes; New works -> the console is up and the kit
## bar is hidden; a toast lands on the intercom as TOMAS; Esc opens and closes the pause plate; the annunciator renders 4-8 windows and acknowledges;
## the chart recorder records one run per commission; the key switch turns to COMMISSION and the engine reports a solve; Cute mode persists.
## Run: godot --headless --path godot --script res://tests/console_flow.gd     Prints CONSOLE-FLOW OK / CONSOLE-FLOW FAILED n.
var fails := 0
var checks := 0
var app: CbApp

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func key(code: int) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.pressed = true; Input.parse_input_event(e)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	var scene: PackedScene = load("res://main.tscn")
	app = scene.instantiate(); root.add_child(app)
	await frames(6)
	await _run()
	print("CONSOLE-FLOW checks=%d" % checks)
	print("CONSOLE-FLOW OK" if fails == 0 else "CONSOLE-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _run() -> void:
	CbSettings.persist = false
	# --- title: ours, not the kit's
	var title := app.root.get_node_or_null("title")
	check(title != null and not app.started, "the title is up")
	check(title != null and title.get_node_or_null("EqTitleMenu") != null, "the title is the Dymo-strip title")
	var kit_tagline := false
	if title != null:
		for l in title.find_children("*", "Label", true, false): if (l as Label).text == str(app.cfg.tagline).to_upper(): kit_tagline = true
	check(not kit_tagline and title.find_child("Strip_new", true, false) != null and title.find_child("Beam", true, false) != null, "no kit title nodes: strips and the balance beam only")
	check(CbSmoke.small_fonts(app.root) == 0, "no text below the minimum size on the title")
	var cute0 := EqSettings.cute
	# --- New works
	(title.find_child("Strip_new", true, false) as Button).pressed.emit()
	await frames(4)
	check(app.started and app.root.get_node_or_null("title") == null, "New works starts a game and closes the title")
	check(app.chrome != null and app.chrome.visible, "the console is visible in a game")
	check(not app.top.visible and not app.dock_scroll.visible, "the kit top bar and dock are hidden")
	var ch: EqConsole = app.chrome
	check(ch.rack_slot != null and ch.hud_top_left != null and ch.rack_slot.is_inside_tree(), "the rack slot and the notebook slot exist")
	# --- intercom
	app.toast("Cannot do that", "warn")
	check(ch.intercom.last().speaker == "TOMAS" and ch.intercom.last().kind == "warn" and ch.intercom.last().text == "Cannot do that", "a warn toast lands on the intercom as TOMAS")
	ch.intercom.say("MARA", "Count moles.", "coach", "s1", "Because moles react.")
	check(ch.intercom.speaker == "MARA" and ch.intercom.current == "s1", "a coach line carries the tick")
	ch.intercom.ask_why()
	check(ch.intercom.last().kind == "why" and ch.intercom.last().text == "Because moles react.", "why? makes Mara explain")
	await frames(2)
	# --- annunciator
	var n := ch.annunciator.window_count()
	check(n >= 4 and n <= 8, "the annunciator renders 4-8 windows (%d)" % n)
	ch.annunciator.set_windows([{"key": "a", "legend": "VENT FLOW HI", "state": "off"}, {"key": "b", "legend": "NH3 OFF SPEC", "state": "off"}, {"key": "c", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "d", "legend": "SOLVE FAIL", "state": "off"}])
	check(ch.annunciator.window_count() == 4 and ch.annunciator.unacked() == 0, "four quiet windows")
	ch.annunciator.set_windows([{"key": "a", "legend": "VENT FLOW HI", "state": "high"}, {"key": "b", "legend": "NH3 OFF SPEC", "state": "off"}, {"key": "c", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "d", "legend": "SOLVE FAIL", "state": "off"}])
	check(ch.annunciator.unacked() == 1, "a new High alarm arrives unacknowledged (flashing)")
	key(KEY_K); await frames(2)
	check(ch.annunciator.unacked() == 0, "K acknowledges (steady)")
	ch.annunciator.set_windows([{"key": "a", "legend": "VENT FLOW HI", "state": "high"}, {"key": "b", "legend": "NH3 OFF SPEC", "state": "off"}, {"key": "c", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "d", "legend": "SOLVE FAIL", "state": "off"}])
	check(ch.annunciator.unacked() == 0, "an acknowledged alarm stays steady across refreshes")
	ch.annunciator.set_windows([{"key": "a", "legend": "VENT FLOW HI", "state": "normal"}, {"key": "b", "legend": "NH3 OFF SPEC", "state": "off"}, {"key": "c", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "d", "legend": "SOLVE FAIL", "state": "off"}])
	ch.annunciator.set_windows([{"key": "a", "legend": "VENT FLOW HI", "state": "high"}, {"key": "b", "legend": "NH3 OFF SPEC", "state": "off"}, {"key": "c", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "d", "legend": "SOLVE FAIL", "state": "off"}])
	check(ch.annunciator.unacked() == 1, "after it clears, a returning alarm flashes again")
	ch.annunciator.set_windows([])
	# --- chart recorder: one trace per commission
	var rec := ch.recorder
	rec.level_id = ""; rec.runs = []
	var li := {"id": "T", "phase": "commissioned", "hero": {"key": "h", "label": "NH3", "unit": "kmol/h", "value": 20.5, "lo": 28.0, "hi": 34.0}, "secondary": {"key": "v", "label": "vent", "unit": "%", "value": 9.0, "limit": 5.0}}
	rec.feed(li, [{"tick": 0}], 0); rec.feed(li, [{"tick": 0}], 0)
	check(rec.runs.size() == 1 and absf(float(rec.runs[0].h) - 20.5) < 1e-9, "one run per commission, the number is the engine's")
	li.hero.value = 30.2
	rec.feed(li, [{"tick": 0}, {"tick": 0}], 0)
	check(rec.runs.size() == 2 and rec.runs[1].n == 2, "a second commission adds a second trace with run number 2")
	li.phase = "design"; rec.feed(li, [{"tick": 0}, {"tick": 0}], 0)
	check(rec.runs.size() == 2, "design phase records nothing")
	li.phase = "shift"; rec.feed(li, [], 5); rec.feed(li, [], 6)
	check(rec.samples.size() == 2, "a shift records one sample per engine tick")
	rec.level_id = ""; rec.runs = []; rec.samples = []
	# --- key switch: DESIGN -> COMMISSION runs the engine's solve
	var b := app.b
	app.new_game("sandbox"); await app.get_tree().process_frame   # a free design plot (New works now opens the L00 cold open, a running shift)
	check(b.act("setSpecies", [["N2", "H2", "Ar", "NH3"]]).get("ok", false), "setSpecies")
	var f: Dictionary = b.act("placeUnit", ["feed", 0, 0, 0]); var p: Dictionary = b.act("placeUnit", ["product", 6, 0, 0])
	check(f.get("ok", false) and p.get("ok", false), "feed and product placed: %s %s" % [str(f.get("message", "")), str(p.get("message", ""))])
	if f.get("ok", false) and p.get("ok", false):
		b.act("setFeed", [str(f.id), {"x": [0.25, 0.75, 0.0, 0.0], "flow": 1, "T": 300, "P": 2e6}])
		var cn: Dictionary = b.act("connect", [str(f.id), "out", str(p.id), "in"]); check(cn.get("ok", false), "connect: %s" % str(cn.get("message", "")))
		await frames(2)
		check(ch.keys.pos == 0, "the key rests at DESIGN")
		var r: Dictionary = ch.turn_key()
		await frames(2)
		check(bool(r.get("ok", false)) and bool(r.get("commissioned", false)), "turning the key commissions: %s" % str(r.get("message", "")))
		check(ch.keys.pos == 1 and ch.keys.clunks >= 1, "the key stands at COMMISSION and clunked")
		var pl = b.q("plant")
		check(pl is Dictionary and str(pl.phase) == "commissioned" and (pl.kpis as Dictionary).size() > 0, "the engine reports a solve (phase commissioned, KPIs present)")
	# --- pause: Esc opens, Esc closes
	check(app.modal() == null, "nothing modal before Esc")
	key(KEY_ESCAPE); await frames(3)
	check(app.menu_ui != null and app.modal() != null and app.modal().name == "menu", "Esc opens the pause plate")
	check(app.modal().find_child("Strip_resume", true, false) != null and app.modal().find_child("Strip_cute", true, false) != null, "the plate has Dymo strips and the Cute switch")
	check(CbSmoke.small_fonts(app.root) == 0, "no text below the minimum size in the game")
	key(KEY_ESCAPE); await frames(3)
	check(app.modal() == null and app.started, "Esc closes the pause plate and never quits")
	# --- cute mode persists
	CbSettings.persist = true; EqSettings.path = "user://eq_settings_test.cfg"
	EqSettings.set_cute(app, not cute0)
	check(EqSettings.cute == (not cute0), "the switch flips EqSettings.cute")
	EqSettings.cute = cute0; EqSettings._loaded = false; EqSettings.load_all()
	check(EqSettings.cute == (not cute0) or OS.get_environment("CB_CUTE") != "", "Cute mode is read back from the file")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(EqSettings.path))
	EqSettings.cute = cute0; CbSettings.persist = false
