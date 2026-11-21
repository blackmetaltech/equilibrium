extends SceneTree
## Lane F30 (0.8 new skill): L39 Size the Line. The level has a node on the Works map in chapter 10 (Hydraulics) and the Career moved to node 40; the pump-house board
## opens with its picture, H-Q plot and selectors; a too-small discharge pipe commissioned through the board says why in plain words; the reference line picked through
## the board's own handlers wins, the printout names the run and its goals pass; the selectors take keyboard focus and keep it across a pick.
## Run: godot --headless --path godot --script res://tests/fix30_flow.gd
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
func board() -> HydBoard:
	app.lvbay.refresh(true); await frames(3)
	return app.lvbay.panel as HydBoard
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	_map()
	await _fail_small_pipe()
	await _win()
	print("FIX30-FLOW checks=%d" % checks)
	print("FIX30-FLOW OK" if fails == 0 else "FIX30-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _map() -> void:
	var C := WorksMap.Campaign
	C.set_levels(app.b.levels())
	check(C.ids.has("L39"), "the engine lists L39")
	check(C.chapter_of("L39") == 10 and C.chapter_name(10) == "Hydraulics", "L39 sits in chapter 10, Hydraulics (%d)" % C.chapter_of("L39"))
	check(C.chapter_of("CAREER") == 11 and C.num("CAREER") == 40, "the Career is node 40 in chapter 11")
	check(C.ids.find("L39") < C.ids.find("CAREER") and C.ids.find("L39") == C.ids.find("L38") + 1, "L39 comes after L38 and before the Career in campaign order")
	check(C.chapter_ids(10) == ["L39"], "chapter 10 holds L39 on its critical path")

func _fail_small_pipe() -> void:
	await level("L39")
	var hb := await board()
	check(hb != null, "the pump-house board opens for L39")
	if hb == null: return
	check(hb.find_child("Scheme", true, false) != null and hb.find_child("Curves", true, false) != null, "the board has the job picture and the H-Q plot")
	var txt := all_text(hb)
	check(txt.contains("SUCTION") and txt.contains("DISCHARGE") and txt.contains("PUMP") and txt.contains("IMPELLER TRIM"), "the selectors are on the board")
	hb.pick_pipe("suction", "5"); hb = await board()
	hb.pick_pump("P2"); hb = await board()   # discharge stays at the fitter's 3-inch
	check(str(hb.view.choice.pump) == "P2" and str(hb.view.choice.suction) == "5" and str(hb.view.choice.discharge) == "3", "picks reach the engine (%s)" % str(hb.view.choice))
	app.chrome.turn_key(true); await frames(8)
	var rc = app.b.q("resultCard")
	check(rc is Dictionary and not bool(rc.get("won", true)), "the 3-inch discharge does not win")
	var cause := str(rc.get("cause", "")) if rc is Dictionary else ""
	check(cause.contains("friction loss") and cause.contains("% of the flow you need"), "the cause says it in plain words: " + cause)
	app.chrome.stop_and_edit(); await frames(4)

func _win() -> void:
	await level("L39")
	var hb := await board()
	if hb == null: check(false, "board for the win"); return
	# keyboard focus: a pipe spool key takes focus and keeps it across the rebuild its pick causes
	var k := hb.find_child("Pipe_discharge_4", true, false) as Button
	check(k != null and k.focus_mode == Control.FOCUS_ALL, "the 4-inch discharge spool is a focusable key")
	if k != null:
		k.grab_focus(); await frames(2)
		k.pressed.emit(); await frames(2); hb = await board(); await frames(3)
		var fo := hb.get_viewport().gui_get_focus_owner()
		check(fo != null and str(fo.name) == "Pipe_discharge_4", "focus stays on the key after the pick (%s)" % (str(fo.name) if fo != null else "none"))
	hb.pick_pipe("suction", "5"); hb = await board()
	hb.pick_pump("P2"); hb = await board()
	for i in 7: hb.set_trim(int(hb.view.choice.trim) - 1); hb = await board()
	hb.pick_place("near"); hb = await board()
	check(int(hb.view.choice.trim) == 93 and bool(hb.view.op.flowOk) and bool(hb.view.op.npshOk), "the reference line is live on the board before the run (trim %d, Q %.1f)" % [int(hb.view.choice.trim), float(hb.view.op.q)])
	app.b.act("callIt", [93.0]); app.game_on_changed(); await frames(2)
	app.chrome.turn_key(true); await frames(10)
	for i in 10:
		if str(app.b.g.get("status", "")) == "won": break
		app.b.act("tick", [1]); await frames(2)
	check(str(app.b.g.get("status", "")) == "won", "the reference line wins (%s)" % str(app.b.g.get("status", "")))
	await frames(10)
	var po := app.root.get_node_or_null("printout")
	check(po != null, "the printout opens on the win")
	if po == null: return
	var ptxt := all_text(po)
	check(ptxt.contains("L39"), "the printout names the level")
	for gk in ["flow", "velocity", "npsh", "curve"]:
		var gl := po.find_child("Goal_" + gk, true, false) as Label
		check(gl != null and gl.text.begins_with(PaperStrings.t("PR_PASS")), "goal %s passes on the printout (%s)" % [gk, gl.text if gl != null else "-"])
	var ml := po.find_child("Metric_annual", true, false) as Label
	check(ml != null and (ml.text.contains("USD") or ml.text.contains("$")) and ml.text.contains("/y"), "the annual cost metric is a yearly sum in the pack's currency (%s)" % (ml.text if ml != null else "-"))
	var st: Dictionary = (app.b.q("resultCard") as Dictionary).get("stars", {})
	check(int(st.get("have", 0)) == 3, "three stars (%s)" % str(st))
