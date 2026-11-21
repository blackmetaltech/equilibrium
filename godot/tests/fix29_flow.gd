extends SceneTree
## F29 (0.8 incidents): a Career incident opens a real plant. Career -> "inerts in the ammonia loop feed" fires -> the board's incident card (GO TO THE PLANT, CALL THE CONTRACTOR, IGNORE IT) ->
## GO TO THE PLANT -> the incident level opens with the Career plant's state (inerts, catalyst, month) -> the reference purge, commission, the first run -> BACK TO THE CAREER on the printout ->
## the board at the same month with the log row and the plant running at the fix -> the run's file has it (save, rebuild the app, resume). A crash inside the plant keeps the run at the month
## it left with the incident still open.
## Run: godot --headless --path godot --script res://tests/fix29_flow.gd. Backs up and restores the real autosave file; the resume and marker files are scratch paths.
var fails := 0
var checks := 0
var app: CbApp
const SEED := 11   ## inerts in the feed in month 3 (the event of month index 2)
const FIX := "CAREER_FIX_NH3_INERTS"
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", [name] + args); app.game_on_changed(); return r
func view() -> Dictionary:
	var v = app.b.q("levelView"); return v if v is Dictionary else {}
func lid() -> String: return str(app.b.g.get("level", ""))
func board() -> CareerBoard: return app.lvbay.panel as CareerBoard if app.lvbay != null and app.lvbay.panel is CareerBoard else null
func refresh() -> void:
	if app.lvbay != null: app.lvbay.refresh(true)
	await frames(4)
func fresh_app() -> void:
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(10)
func kill_app() -> void:
	app.set_process(false); app.b.stop(); app.queue_free(); await frames(4)
func career_to_incident() -> void:
	app.pinned_seed = SEED
	app.start_level("CAREER", true); await frames(4)
	Notebook.close(app); await frames(3)
	check(lid() == "CAREER" and app.last_seed == SEED, "the Career opens on seed %d (%d)" % [SEED, app.last_seed])
	act("answer", [1])
	for i in 6:
		var ic = view().get("dashboard", {}).get("incident", null)
		if ic is Dictionary and bool(ic.get("pending", false)): break
		act("advance", [1])
	await frames(4)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	var backup := ""
	if FileAccess.file_exists(CareerSave.engine_file()): backup = FileAccess.get_file_as_string(CareerSave.engine_file())
	CareerSave.force = true; CareerSave.path = "user://eq_career_resume_f29_test.json"; CareerSave.clear()
	CareerIncident.path = "user://eq_career_incident_f29_test.json"; CareerIncident.clear()
	await fresh_app(); CbSettings.persist = false
	await _round_trip()
	await _crash_in_plant()
	if backup != "":
		var f := FileAccess.open(CareerSave.engine_file(), FileAccess.WRITE); f.store_string(backup); f.close()
	CareerSave.clear(); CareerIncident.clear(); CareerSave.force = false
	print("FIX29-FLOW checks=%d" % checks)
	print("FIX29-FLOW OK" if fails == 0 else "FIX29-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _round_trip() -> void:
	await career_to_incident()
	var d: Dictionary = view().get("dashboard", {})
	var ic: Dictionary = d.get("incident", {}) if d.get("incident") is Dictionary else {}
	check(bool(ic.get("pending", false)), "inerts in the ammonia loop feed: the incident waits (month %d)" % int(d.get("month", -1)))
	var m0 := int(d.get("month", -1)); var cash0 := float(d.get("cashUSD", 0.0))
	await refresh()
	var b := board()
	check(b != null, "the Career board is up")
	if b == null: return
	for nm in ["IncidentCard", "IncidentPlant", "IncidentContractor", "IncidentIgnore"]: check(b.find_child(nm, true, false) != null, "the incident card has %s" % nm)
	var kp := b.find_child("IncidentPlant", true, false) as Button
	check(kp != null and kp.text == "GO TO THE PLANT", "the plant key reads GO TO THE PLANT")
	var kc := b.find_child("IncidentContractor", true, false) as Button
	check(kc != null and kc.text.begins_with("CALL THE CONTRACTOR"), "the contractor key names the bill (%s)" % (kc.text if kc != null else "-"))
	check(b.pin.find_child("IncidentCard", true, false) != null, "the waiting incident is pinned above the scroll")
	var opts: Array = ic.get("options", [])
	var con_loss := float(opts[0].lossUSD) if opts.size() > 0 else 0.0
	# GO TO THE PLANT
	kp.pressed.emit(); await frames(8)
	Notebook.close(app); await frames(3)
	check(lid() == FIX, "GO TO THE PLANT opens the incident level (%s)" % lid())
	var v := view(); var pre: Dictionary = v.get("pre", {}) if v.get("pre") is Dictionary else {}
	check(bool(v.get("fromCareer", false)), "the plant knows it came from the Career")
	check(int(pre.get("m", -1)) == int(ic.month) and absf(float(pre.get("y", 0)) - float(ic.yPct) / 100.0) < 1e-9 and absf(float(pre.get("cat", 0)) - float(ic.cat)) < 1e-9, "...pre-loaded with the Career state: month %d, inerts %.1f %%, catalyst %.0f %%" % [int(pre.get("m", -1)) + 1, float(pre.get("y", 0)) * 100.0, float(pre.get("cat", 0)) * 100.0])
	var li = app.b.q("levelInfo")
	check(li is Dictionary and (li.get("note", []) as Array).size() == 3 and str(li.note[0]).contains("Month %d of your Career" % (m0)), "the notes name the Career month")
	check(li is Dictionary and li.get("callIt") is Dictionary and (li.get("goals", []) as Array).size() == 2, "a call-it and two goals")
	check(int(CareerSave.info().get("month", -1)) == m0, "the run's file still holds month %d while in the plant" % m0)
	# the reference fix: call it, set the purge, commission, let the first run roll
	var k := int(pre.get("k", 0)); var purge: float = [0.02, 0.02, 0.025, 0.025, 0.025, 0.03, 0.03][k]   # BEST_PURGE of src/sim/career/incident.ts
	app.b.act("callIt", [20.0]); app.b.act("setParam", ["X-108", "frac", purge]); app.b.act("commission", []); app.game_on_changed(); await frames(3)
	for i in 8:
		if str(app.b.g.get("status", "")) != "playing": break
		app.b.act("tick", [5]); app.game_on_changed(); await frames(2)
	check(str(app.b.g.get("status", "")) == "won", "the fixed loop runs and the job is won")
	var res: Dictionary = view().get("result", {}) if view().get("result") is Dictionary else {}
	var fix: Dictionary = view().get("fix", {}) if view().get("fix") is Dictionary else {}
	check(not fix.is_empty() and absf(float(fix.purge) - purge) < 1e-9, "the level hands back the loop at %.1f %% purge" % (purge * 100.0))
	check(float(res.get("lossMUSD", 99.0)) * 1e6 < con_loss, "the reference fix costs the Career less than the contractor (%.2f against %.2f MUSD)" % [float(res.get("lossMUSD", 99.0)), con_loss / 1e6])
	await frames(6)
	var host = app.modal()
	if host == null or str(host.name) != "printout":
		app.end_seen = false; Printout.open(app); await frames(4); host = app.modal()
	check(host != null and str(host.name) == "printout", "the printout is up")
	var bk: Button = host.find_child("BackToCareer", true, false) if host != null else null
	check(bk != null, "the printout offers BACK TO THE CAREER")
	check(host == null or host.find_child("Next", true, false) == null, "and no NEXT job (the plant is reached from the board only)")
	if bk == null: return
	bk.pressed.emit(); await frames(10)
	check(lid() == "CAREER", "BACK TO THE CAREER reopens the Career")
	var d1: Dictionary = view().get("dashboard", {})
	check(int(d1.get("month", -1)) == m0, "...at the same month %d (got %d)" % [m0, int(d1.get("month", -1))])
	check(absf(float(d1.get("cashUSD", 0.0)) - cash0) < 1.0, "...with the same cash (no contractor bill)")
	var ic1: Dictionary = d1.get("incident", {}) if d1.get("incident") is Dictionary else {}
	check(not bool(ic1.get("pending", true)) and str(ic1.get("choice", "")) == "plant", "the incident is answered at the plant")
	check(absf(float(ic1.get("outF", 0.0)) - float(res.get("outPct", 0.0)) / 100.0) < 1e-6, "the plant now runs at the fix's output factor (%.1f %%)" % (float(ic1.get("outF", 0.0)) * 100.0))
	var rows: Array = view().get("log", [])
	var row := ""
	for r in rows: if str(r.get("kind", "")) == "fix" and str(r.get("code", "")) == "plant": row = str(r.label)
	check(row.begins_with("Purge set to %s %% at the plant: inerts " % str(snappedf(purge * 100.0, 0.1)).trim_suffix(".0")) and row.contains("output back to"), "the log says what was done: %s" % row)
	await refresh()
	b = board()
	check(b != null and b.find_child("IncidentDone", true, false) != null and b.pin.find_child("IncidentCard", true, false) == null, "the answered card leaves the pinned strip and says what was done")
	check(CareerIncident.marker().is_empty(), "the incident marker is cleared")
	# the numbers change: next month the ammonia plant makes its nominal output times the fix
	var nom := float(view().plants[0].nominalT)
	act("advance", [1]); await frames(3)
	var p0: Dictionary = view().plants[0]
	check(str(p0.id) == "nh3" and float(p0.outputT) < nom, "next month the ammonia plant makes less than its nominal %.0f t (%.0f t)" % [nom, float(p0.outputT)])
	# save and resume: the file holds the answered incident; rebuild the app and reopen
	await frames(4); CareerSave.store(app)
	var inf := CareerSave.info()
	check(int(inf.get("month", -1)) == m0 + 1, "the run's file follows the month after the fix (%s)" % str(inf))
	await kill_app()
	OS.set_environment("CB_LEVEL", "C"); await fresh_app(); OS.unset_environment("CB_LEVEL")
	check(lid() == "CAREER" and int(view().get("dashboard", {}).get("month", -1)) == m0 + 1, "CB_LEVEL=C resumes the Career at month %d" % (m0 + 2))
	var ic2 = view().get("dashboard", {}).get("incident", null)
	check(ic2 is Dictionary and str(ic2.get("choice", "")) == "plant", "...with the plant fix still in force")

## A crash while in the plant: the run comes back at the month it left, with the incident still open; the incident level's autosave still knows it came from the Career.
func _crash_in_plant() -> void:
	OS.set_environment("CB_NEW", "1")
	await career_to_incident()
	OS.unset_environment("CB_NEW")
	var d: Dictionary = view().get("dashboard", {}); var m0 := int(d.get("month", -1))
	check(d.get("incident") is Dictionary and bool(d.incident.pending), "a fresh run reaches the incident again (month %d)" % m0)
	await refresh()
	var kp := board().find_child("IncidentPlant", true, false) as Button if board() != null else null
	if kp == null: check(false, "GO TO THE PLANT key"); return
	kp.pressed.emit(); await frames(8)
	check(lid() == FIX and bool(view().get("fromCareer", false)), "in the plant")
	app.b.act("setParam", ["X-108", "frac", 0.03]); app.b.act("save", ["auto"])
	await kill_app()
	await fresh_app()
	app.load_slot("auto"); await frames(6)
	check(lid() == FIX and bool(view().get("fromCareer", false)), "after the crash Continue brings the plant back, still from the Career")
	check(CareerIncident.can_back(app) == false, "...and nothing goes back before the loop is fixed")
	app.start_level("CAREER", true); await frames(4)
	var dlg = app.root.get_node_or_null("career_resume")
	check(dlg != null, "opening the Career offers RESUME")
	if dlg != null:
		(dlg.find_child("CareerResume", true, false) as Button).pressed.emit(); await frames(6)
	var d1: Dictionary = view().get("dashboard", {})
	check(lid() == "CAREER" and int(d1.get("month", -1)) == m0, "RESUME brings the run back at month %d (got %d)" % [m0, int(d1.get("month", -1))])
	check(d1.get("incident") is Dictionary and bool(d1.incident.pending), "...with the incident still waiting")
