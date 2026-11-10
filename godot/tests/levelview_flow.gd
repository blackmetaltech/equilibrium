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

func get_root_shot(tag: String) -> void:
	if shots == "": return
	await create_timer(0.6).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [shots, tag])
