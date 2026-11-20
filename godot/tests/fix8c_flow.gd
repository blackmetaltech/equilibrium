extends SceneTree
## Round 4 lane F8c: Ch8 Loop Panel never covers the console (key) and has Stop, L33 strip peak/lag + no-return line, L34 sticky footer + ticks = COVERED, L36 ref hidden,
## L38 hint, Career readable log / payback / drivers / month strip.  Run: godot --headless --path godot --script res://tests/fix8c_flow.gd
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
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func lact(args: Array) -> Dictionary: return act("levelAct", args)
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func find_named(n: Node, nm: String) -> Node:
	if n.name == nm: return n
	for c in n.get_children():
		var r := find_named(c, nm)
		if r != null: return r
	return null

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	for sz in [Vector2i(1280, 800), Vector2i(1920, 1080)]:
		root.size = sz; await frames(4)
		await _panel_clear(sz)
	root.size = Vector2i(1280, 800); await frames(4)
	await _l33(); await _l34(); await _l36(); await _l38(); await _career()
	print("FIX8C-FLOW checks=%d" % checks)
	print("FIX8C-FLOW OK" if fails == 0 else "FIX8C-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## After a run the Loop Panel ends above the console (the DESIGN key / Commission dial live in it) and the panel has a Stop key that returns to design.
func _panel_clear(sz: Vector2i) -> void:
	await level("L33"); app.lvbay.refresh(true); await frames(3)
	lact(["setDial", "sensors", 3]); lact(["setDial", "k", 2]); lact(["setDial", "tripC", 89]); lact(["setDial", "action", 3])   # winning dials: the commission rolls the first run (F17: a second click on the key no longer starts a run of its own)
	app.chrome.turn_key(true); await frames(10); app.lvbay.refresh(true); await frames(6)
	var cp: ControlPanel = app.lvbay.panel as ControlPanel
	var tag := "%dx%d" % [sz.x, sz.y]
	check(cp != null, "control panel exists " + tag)
	var ctop: float = app.chrome.panel.global_position.y
	check(cp.global_position.y + cp.size.y <= ctop + 1.0, "loop panel bottom %.0f above console top %.0f at %s" % [cp.global_position.y + cp.size.y, ctop, tag])
	check(cp.stop_key != null and cp.stop_key.visible, "Stop key visible during a run " + tag)
	cp.stop_key.pressed.emit(); await frames(10); app.lvbay.refresh(true); await frames(4)
	var li: Dictionary = PaperStrings.q(app, "levelInfo")
	check(str(li.get("phase", "")) == "design", "Stop returns to design (phase %s) %s" % [str(li.get("phase", "")), tag])
	cp = app.lvbay.panel as ControlPanel
	check(cp != null and not cp.stop_key.visible, "Stop key hides in design " + tag)

func _l33() -> void:
	await level("L33")
	lact(["setDial", "sensors", 3]); lact(["setDial", "k", 2]); lact(["setDial", "tripC", 89]); lact(["setDial", "action", 1])
	app.chrome.turn_key(true); await frames(8); app.chrome.turn_key(true); await frames(10); app.lvbay.refresh(true); await frames(5)
	var cp: ControlPanel = app.lvbay.panel as ControlPanel
	var txt := all_text(cp._scen)
	check(txt.contains("°C ·") and txt.contains(" s"), "L33 strip shows peak and lag per scenario")
	check(txt.contains("NO RETURN") and txt.contains("Cut feed") and txt.contains("Dump") and txt.contains("none"), "L33 strip footer names the point of no return per element: " + txt.substr(txt.find("NO RETURN"), 90))

func _l34() -> void:
	await level("L34"); app.lvbay.refresh(true); await frames(4)
	var hz: Ch9Hazop = app.lvbay.panel as Ch9Hazop
	check(hz != null and hz._footer != null, "L34 hazop has a footer")
	var sig: Dictionary = {}
	for c in hz.view.cells: if bool(c.meaningful): sig = c; break
	hz._on_cell(sig.param, sig.guide); await frames(3); app.lvbay.refresh(true); await frames(4)
	hz._on_cell(sig.param, sig.guide); await frames(3)
	check(all_text(hz._footer).contains("ADD ROW"), "L34 ADD ROW sits in the sticky footer")
	check(not all_text(hz.body).contains("ADD ROW"), "L34 ADD ROW is not inside the scrolling body")
	var ftop: float = hz._footer.global_position.y + hz._footer.size.y
	check(ftop <= hz.global_position.y + hz.size.y + 1.0, "L34 footer inside the panel at 1280x800")
	# a wrong-class row is a cross, not a tick; COVERED stays at the engine's count
	var cov := 0
	for c in hz.view.cells: if str(c.get("rowState", "")) == "covered": cov += 1
	check(cov == int(hz.view.coverage.covered), "L34 ticks %d equal COVERED %d" % [cov, int(hz.view.coverage.covered)])

func _l36() -> void:
	await level("L36"); app.lvbay.refresh(true); await frames(4)
	var cb: Ch9Board = app.lvbay.panel as Ch9Board
	check(all_text(cb).contains("ref hidden until you call it"), "L36 ref cost hidden before the prediction")
	act("callIt", [20000]); app.lvbay.refresh(true); await frames(4)
	check(all_text(app.lvbay.panel).contains("ref +3 %"), "L36 shows the 3 % tolerance after the prediction")

func _l38() -> void:
	await level("L38"); app.lvbay.refresh(true); await frames(4)
	var t := all_text(app.lvbay.panel)
	check(t.contains("second crane") and t.contains("18 d") and t.contains("16 d"), "L38 board hints the second-crane trade-off")

func _career() -> void:
	await level("CAREER"); app.lvbay.refresh(true); await frames(4)
	for i in 14: lact(["advance", 1])
	app.lvbay.refresh(true); await frames(5)
	var t := all_text(app.lvbay.panel)
	check(not t.contains("cw_") and not t.contains("feed_") and not t.contains("end_") and not t.contains("Event "), "Career shows no raw event key")
	check(t.contains("MARGIN DRIVERS"), "Career year review explains the margin drivers")
	check(t.contains("pays back in") or t.contains("no gas saving"), "Career investments show a payback preview")
	var cal := find_named(app.lvbay.panel, "x")   # the calendar is a custom draw; its month follows monthNow in the view
	var d: Dictionary = app.lvbay.panel.view.dashboard
	check(int(d.monthNow) == int(d.month) + 1, "Career monthNow is the month in progress")
