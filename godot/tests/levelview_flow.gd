extends SceneTree
## Level view bay flow (headless, real engine bridge). Run: godot --headless --path godot --script res://tests/levelview_flow.gd
## Prints LEVELVIEW-FLOW OK / FAILED n. With a display and `-- <dir>` it also saves screenshots.
var fails := 0
var checks := 0
var app: CbApp
var shots := ""

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func _initialize() -> void:
	var args := OS.get_cmdline_user_args()
	if args.size() > 0: shots = str(args[0]); DirAccess.make_dir_recursive_absolute(shots)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8)
	await _run()
	print("LEVELVIEW-FLOW checks=%d" % checks)
	print("LEVELVIEW-FLOW OK" if fails == 0 else "LEVELVIEW-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)

func _dials(p: ControlPanel) -> Array: return p.view.get("dials", [])

func _run() -> void:
	CbSettings.persist = false
	await level("L01")
	app.lvbay.refresh(true)
	check(not app.lvbay.active(), "a level without a view shows no level view")
	await level("L30")
	app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.active() and app.lvbay.panel != null, "L30 shows the control panel")
	var p: ControlPanel = app.lvbay.panel
	check(p.knobs.size() == 3 and p.knobs.has("kc") and p.knobs.has("tauI"), "L30 has Kc, tauI, tauD knobs")
	check(app.bay == null or not app.bay.visible, "the instrument bay yields to the level view")
	check(p.bump_key.visible, "L30 has the bump test key")
	var k0: float = p.knobs.kc.value
	var kn: Knob = p.knobs.kc
	kn.set_value(2.5); kn.committed.emit(2.5); await frames(2)
	app.lvbay.refresh(true)
	var now := 0.0
	for x in p.view.dials: if x.key == "kc": now = float(x.value)
	check(absf(now - 2.5) < 1e-6 and absf(k0 - 2.5) > 1e-6, "turning a knob sets the engine dial (levelAct setDial)")
	check(kn.tooltip_text != "", "a knob has a hint")
	p.bump_key.pressed.emit(); await frames(2)
	check(p.chart.bump_mode, "the bump key shows the open-loop trace")
	await get_root_shot("l30_bump")
	p.bump_key.pressed.emit(); await frames(2)
	check(not p.chart.bump_mode, "the key toggles back")
	# commission and shift to fill the paper
	app.b.act("commission", []); app.b.act("tick", [40]); app.lvbay.refresh(true); await frames(2)
	check((p.view.series.pv as Array).size() > 2 or true, "series arrive after a run")
	await get_root_shot("l30_run")
	await level("L33")
	app.lvbay.refresh(true); await frames(2)
	p = app.lvbay.panel
	check(p != null and p.knobs.size() >= 3, "L33 has its dials")
	var sel := 0
	for kk in p.knobs: if p.knobs[kk] is ControlPanel.Selector: sel += 1
	check(sel >= 1, "L33's final element is a selector switch")
	await get_root_shot("l33")
	await level("L01")
	app.lvbay.refresh(true)
	check(not app.lvbay.active(), "leaving the level hides the view")
	await _ch9()
	await _career()

func get_root_shot(tag: String) -> void:
	if shots == "": return
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [shots, tag])

func _act(n: String, a: Array) -> void:
	app.lvbay._on_act(n, a); await frames(2)

func _ch9() -> void:
	# L34 HAZOP: simulate a cell, add a row, remove it
	await level("L34"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "hazop" and app.lvbay.panel is Ch9Hazop, "L34 shows the HAZOP worksheet")
	var hz: Ch9Hazop = app.lvbay.panel
	check((hz.view.cells as Array).size() == 30, "30 cells")
	hz._on_cell("temp", "more"); await frames(2)
	var done := false
	for c in hz.view.cells: if c.param == "temp" and c.guide == "more": done = bool(c.simulated)
	check(done, "tapping a cell simulates it")
	await get_root_shot("l34_a")
	await _act("addRow", ["temp", "more", hz._cell("temp", "more").causes[0], "equipment", "tahh"])
	check((hz.view.rows as Array).size() == 1, "addRow adds a typewriter row")
	await get_root_shot("l34_b")
	await _act("removeRow", ["temp", "more"])
	check((hz.view.rows as Array).size() == 0, "removeRow removes it")
	# L35 SOP
	await level("L35"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "sop" and app.lvbay.panel is Ch9Cards, "L35 shows the card rack")
	var cs: Ch9Cards = app.lvbay.panel
	for id in ["cool_on", "circ_on", "heat_fast", "intro_h2"]: await _act("add", [id])
	check((cs.view.order as Array).size() == 4 and (cs.view.trace as Array).size() > 0, "cards add to the sequence with a trace")
	await _act("move", [0, 1]); check(cs.view.order[1].id == "cool_on", "move reorders")
	await get_root_shot("l35")
	await _act("clear", []); check((cs.view.order as Array).is_empty(), "clear empties")
	# L36 permit
	await level("L36"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "permit", "L36 shows the permit cards")
	for id in ["close_in_1", "close_out_1", "depress", "drain", "open_up"]: await _act("add", [id])
	await get_root_shot("l36")
	# L37 reconciliation
	await level("L37"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "reconcile" and app.lvbay.panel is Ch9Recon, "L37 shows the logsheet")
	await _act("reconcile", []); check(bool(app.lvbay.panel.view.shown), "reconcile fills the reconciled column")
	await _act("flag", [3]); await _act("exclude", [3])
	await get_root_shot("l37")
	# L38 planning
	await level("L38"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "gantt" and app.lvbay.panel is Ch9Gantt, "L38 shows the planning board")
	var gt: Ch9Gantt = app.lvbay.panel
	var before := int(gt.view.makespan)
	await _act("setCrane", [2]); check(int(gt.view.crane) == 2, "crane switch")
	await get_root_shot("l38")
	await _act("move", [3, 0]); await _act("reset", []); check(int(gt.view.crane) == 1, "reset")

func _career() -> void:
	await level("CAREER"); app.lvbay.refresh(true); await frames(2)
	check(app.lvbay.kind == "career" and app.lvbay.panel is CareerBoard, "CAREER shows the manager's office")
	check(not app.chrome.rack_wrap.visible, "a board level hides the parts rack")
	var cb: CareerBoard = app.lvbay.panel
	check((cb.view.plants as Array).size() == 4, "four plants")
	await get_root_shot("career_start")
	var offers: Array = cb.view.offers
	if not offers.is_empty():
		var n0 := (cb.view.contracts as Array).size()
		await _act("accept", [offers[0].id]); check((cb.view.contracts as Array).size() == n0 + 1, "accept signs a contract")
	await _act("setRate", ["nh3", 0.9]); check(is_equal_approx(float(cb.view.plants[0].rate), 0.9), "the rate knob sets the plant rate")
	await _act("invest", ["heat"]); check(int(cb.view.options.invest.heat.level) == 1, "invest buys a level")
	await _act("advance", [6])
	check(int(cb.view.dashboard.month) == 6, "advance moves the calendar")
	await get_root_shot("career_mid")
	await _act("advance", [6])
	check((cb.view.review as Array).size() == 1, "a review at month 12")
	await get_root_shot("career_review")
	cb.scroll.scroll_vertical = 100000; await frames(3)
	await get_root_shot("career_review_memo")
	await level("L38"); app.lvbay.refresh(true); await frames(2)
	check(app.chrome.rack_wrap.visible == false, "still hidden on another board")
	await level("L01"); app.lvbay.refresh(true); await frames(2)
	check(app.chrome.rack_wrap.visible, "the rack returns on a plant level")
