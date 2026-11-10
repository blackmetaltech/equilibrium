extends SceneTree
## Campaign flow (task C1): the Works map for every chapter, unlock rules, stars and rank, the backdrop's revival, and the "Continue resumes the wrong level" bug.
## Run: XDG_DATA_HOME=/tmp/some/scratch godot --headless --path godot --script res://tests/campaign_flow.gd     Prints CAMPAIGN-FLOW OK / FAILED n.
## The engine's autosave is ON here (that is the point), so the saves checks only run when the user data dir is under /tmp (set XDG_DATA_HOME); otherwise they are skipped.
var fails := 0
var checks := 0
var app: CbApp
var C = WorksMap.Campaign

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

const L01_SCRIPT := [["callIt", [30.24]], ["placeUnit", ["feed", 0, 0, 0]], ["placeUnit", ["feed", 0, 4, 0]], ["placeUnit", ["mixer", 4, 2, 0]], ["placeUnit", ["stoich_reactor", 8, 0, 0]],
	["placeUnit", ["nh3_sep", 14, 0, 0]], ["placeUnit", ["product", 18, 0, 0]], ["placeUnit", ["vent", 18, 4, 0]], ["setBank", ["F-101", "N2", 140.1]], ["setBank", ["F-102", "H2", 30.24]],
	["connect", ["F-101", "out", "M-103", "in1"]], ["connect", ["F-102", "out", "M-103", "in2"]], ["connect", ["M-103", "out", "R-104", "in"]], ["connect", ["R-104", "out", "D-105", "in"]],
	["connect", ["D-105", "liq", "T-106", "in"]], ["connect", ["D-105", "vap", "Y-107", "in"]], ["commission", []]]

func win_l01() -> bool:
	app.start_level("L01", true); await frames(2)
	for a in L01_SCRIPT: app.b.act(a[0], a[1])
	for i in 60:
		if str(app.b.g.get("status", "")) != "playing": break
		app.b.act("tick", [10])
	await frames(2)
	return str(app.b.g.get("status", "")) == "won"

func _initialize() -> void:
	OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8)
	CbSettings.persist = false
	var scratch := OS.get_user_data_dir().begins_with("/tmp")
	if scratch: C.path = "user://eq_campaign_test.cfg"; C.force_persist = true
	root.size = Vector2i(1920, 1080); await frames(4)
	C.unlock_all = false
	await _rules()
	await _map_nodes()
	await _revival()
	await _layouts()
	if scratch: await _continue_bug()
	else: print("SKIP: continue-bug checks need XDG_DATA_HOME under /tmp")
	print("CAMPAIGN-FLOW checks=%d" % checks)
	print("CAMPAIGN-FLOW OK" if fails == 0 else "CAMPAIGN-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _star_ch(chs: Array) -> void:   ## every critical-path level of these chapters, from the engine's own list (levels arrive over time)
	for n in chs: _star(C.chapter_ids(n))

func _star(ids: Array, n := 1, hard := false) -> void:
	for id in ids: C.stars[id] = n; C.hard[id] = hard

# unlock rules, rank, next level
func _rules() -> void:
	C.reset(); C.attach(app)
	check(C.ids.size() >= 30 and C.ids.has("L00") and C.ids.has("L29") and C.ids.has("L38"), "the engine lists the campaign (%d levels)" % C.ids.size())
	check(C.lock_reason("L00") == "" and C.lock_reason("L01") == "", "the prologue and the first level are open")
	check(C.lock_reason("L02") != "", "L02 waits for L01 (%s)" % C.lock_reason("L02"))
	check(C.lock_reason("L04") != "" and C.is_bridge("L04"), "the exam bridge L04 waits for the critical path")
	check(C.lock_reason("L05") != "", "chapter 2 is closed at the start")
	check(C.lock_reason("L29") != "" and C.lock_reason("L34") != "", "chapters 8 and 9 are closed at the start")
	_star(["L01", "L02"])
	check(C.lock_reason("L03") == "" and not C.ch_done(1), "L03 opens after L02; the chapter is not done")
	_star(["L03"])
	check(C.ch_done(1) and C.lock_reason("L04") == "" and not C.starred("L04"), "chapter 1 is done on L01-L03, bridges are not needed")
	check(C.lock_reason("L05") == "" and C.lock_reason("L06") != "", "chapter 2 opens with its first level only")
	check(C.next_after("L03") == C.chapter_ids(2)[0], "next after L03 is L05, skipping the optional bridge (%s)" % C.next_after("L03"))
	_star_ch([2])
	check(C.ch_done(2) and C.lock_reason("L10") == "", "chapter 3 opens when chapter 2's critical path has stars")
	check(C.lock_reason("L29") != "", "chapter 8 still waits for chapter 5")
	_star_ch([3, 4, 5])
	check(C.ch_done(5) and C.lock_reason("L29") == "" and C.lock_reason("L34") == "" and C.lock_reason("L24") == "", "chapters 6, 8 and 9 open after chapter 5")
	check(C.lock_reason("L30") != "", "inside chapter 8 the levels go in order")
	check(not C.ch_done(7) and C.chapter_ids(7).is_empty() and C.lock_reason("L28") == "" or C.chapter_ids(7).is_empty(), "the integrated Works has no levels yet and is never 'done'")
	C.reset(); check(C.rank_name() == "Trainee", "rank starts at Trainee")
	for i in range(1, 8): C.stars["L%02d" % i] = 3
	check(C.total_stars() == 21 and C.rank_name() == "Senior Engineer", "21 stars is Senior Engineer (%s)" % C.rank_name())
	C.reset()
	check(C.record("L01", 2, false) and C.stars.L01 == 2 and not C.hard.L01, "a first result is kept")
	check(not C.record("L01", 1, true) and C.stars.L01 == 2, "fewer stars never replace more")
	check(C.record("L01", 2, true) and C.hard.L01, "the same stars won in Engineer mode become solid")
	if C.persisting():
		C.stars.clear(); C.hard.clear(); C._loaded = false; C.load_all()
		check(C.stars.get("L01", 0) == 2 and C.hard.get("L01", false) == true, "stars persist across a reload")
	C.reset()

# the map: every level a node with its state, side nodes for bridges, chapter sites, rank plate
func _map_nodes() -> void:
	_star(["L01", "L02", "L03", "L04"], 1)
	C.stars["L00"] = 3; C.stars["L01"] = 3; C.hard["L01"] = true
	WorksMap.open(app); await frames(4)
	var lm := app.root.get_node_or_null("levels")
	check(lm != null, "the Works map opens")
	var n_lv := 0; var n_locked := 0
	for l in app.b.levels():
		var nb := lm.find_child("Level_" + str(l.id), true, false) as WorksMap.NodeBtn
		check(nb != null, "node for %s" % l.id)
		if nb != null: n_lv += 1; if nb.state == "locked": n_locked += 1
	check(n_lv == app.b.levels().size() and n_locked > 10, "every engine level has a node, most still locked (%d locked)" % n_locked)
	var sites := 0
	for n in 10: if lm.find_child("Site_%d" % n, true, false) != null: sites += 1
	check(sites == 10, "ten sites: the gate and chapters 1-9")
	var b0 := lm.find_child("Level_L00", true, false) as Button
	check(b0 != null and b0.text.begins_with("00 · "), "L00 is numbered 00")
	check((lm.find_child("Level_L04", true, false) as WorksMap.NodeBtn).bridge, "L04 is a bridge side node")
	check((lm.find_child("Level_L01", true, false) as WorksMap.NodeBtn).hard and (lm.find_child("Level_L01", true, false) as WorksMap.NodeBtn).stars == 3, "L01 shows three solid stars")
	check((lm.find_child("Level_L05", true, false) as WorksMap.NodeBtn).state == "open", "chapter 2 opened by chapter 1's stars")
	check((lm.find_child("Level_L19", true, false) as WorksMap.NodeBtn).state == "locked", "chapter 5 is locked")
	var rn := lm.find_child("RankName", true, false) as Label
	check(rn != null and rn.text.to_upper() == C.rank_name().to_upper(), "the rank plate shows the rank")
	# pressing a locked node never starts it; an open node starts (mouse)
	app.start_level("L00", true); await frames(2)
	app.back(); await frames(2)
	WorksMap.open(app); await frames(3); lm = app.root.get_node_or_null("levels")
	(lm.find_child("Level_L19", true, false) as Button).pressed.emit(); await frames(2)
	check(str(app.b.g.get("level", "")) == "L00", "a locked node does not start (%s)" % str(app.b.g.get("level", "")))
	check(lm != null and is_instance_valid(lm) and not lm.is_queued_for_deletion(), "the map stays open after a locked press")
	(lm.find_child("Level_L05", true, false) as Button).pressed.emit(); await frames(3)
	check(str(app.b.g.get("level", "")) == "L05", "an open node starts the level on one click")
	# touch: the first tap selects, the second starts
	WorksMap._touch_override = true
	WorksMap.open(app); await frames(3); lm = app.root.get_node_or_null("levels")
	(lm.find_child("Level_L01", true, false) as Button).pressed.emit(); await frames(2)
	check(str(app.b.g.get("level", "")) == "L05" and WorksMap.sel_id == "L01", "touch: the first tap only selects")
	var sb := lm.find_child("Start", true, false) as Button
	check(sb != null and not sb.disabled, "START is live for an open node")
	(lm.find_child("Level_L01", true, false) as Button).pressed.emit(); await frames(3)
	check(str(app.b.g.get("level", "")) == "L01", "touch: the second tap starts")
	WorksMap._touch_override = false
	check(CbSmoke.small_fonts(app.root) == 0, "no text below the minimum size")
	C.reset()

# backdrop revival: chapters done -> lights, steam, ship
func _revival() -> void:
	var sc: Scenery = app.plant_world.scenery
	C.reset(); C.push_world(app)
	check(sc.revived_chapters().is_empty() and sc.puffs_visible() == 0, "a new works: the old Works is dark")
	var dark_lit := sc.lit_count()
	_star_ch([1]); C.push_world(app)
	check(sc.revived_chapters() == [1] and sc.lit_count() > dark_lit, "chapter 1 done lights the lab beacon")
	_star_ch([2]); C.push_world(app)
	check(sc.revived_chapters() == [1, 2] and sc.puffs_visible() >= 2, "chapter 2 done lights the burner tank and its steam")
	var some := sc.lit_count()
	_star_ch([3, 4, 5]); C.push_world(app)
	check(sc.lit_count() > some and sc.revived_chapters().size() == 5, "chapters 3, 4, 5 light more of the Works (%s)" % str(sc.revived_chapters()))
	sc.set_revived(3)
	check(sc.revived_chapters() == [1, 2, 3], "set_revived(n) lights the first n chapters")
	C.reset(); C.push_world(app)
	check(sc.revived_chapters().is_empty(), "reset puts the lights out")

# narrow / portrait: one column down the coast, nothing wider than the dialog, vertical scroll only
func _layouts() -> void:
	_star(["L00"], 3)
	for spec in [["phone", Vector2i(1080, 2400)], ["phone", Vector2i(2424, 1080)], ["handheld", Vector2i(1280, 800)], ["desktop", Vector2i(1920, 1080)]]:
		CbLayout.forced = spec[0]; root.size = spec[1]; await frames(4)
		CbLayout.update(root); app._relayout(); await frames(3)
		WorksMap.open(app); await frames(4)
		var lm := app.root.get_node_or_null("levels")
		var tag := "%s %s" % [spec[0], str(spec[1])]
		check(lm != null, "%s: the map opens" % tag)
		if lm != null:
			var sc := lm.find_child("List", true, false) as ScrollContainer
			check(sc != null and sc.horizontal_scroll_mode == ScrollContainer.SCROLL_MODE_DISABLED, "%s: vertical scroll only" % tag)
			var host_w := (lm.get_child(1) as Control).get_global_rect().end.x if lm.get_child_count() > 1 else 0.0
			var wide := 0
			for nb in lm.find_children("Level_*", "Button", true, false):
				var r := (nb as Control).get_global_rect()
				if r.end.x > host_w + 1.0 or r.position.x < -1.0: wide += 1
				if CbLayout.touch and r.size.x < 44.0: wide += 1
			check(wide == 0, "%s: every node is inside the panel and big enough" % tag)
			check(lm.find_child("Site_9", true, false) != null and lm.find_child("Start", true, false) != null, "%s: all sites and the info bar exist" % tag)
			app.back(); await frames(2)
	CbLayout.forced = ""; root.size = Vector2i(1920, 1080); await frames(4); CbLayout.update(root); app._relayout(); await frames(2)
	C.reset()

# the bug: win L01, go to L02, leave without a tick, Continue
func _continue_bug() -> void:
	C.reset()
	for sl in ["auto", "main", "slot2", "slot3"]: app.b.act("deleteSave", [sl])
	check(await win_l01(), "L01 can be won through the engine")
	check(C.starred("L01") and C.stars.get("L01", 0) == 3, "the win is recorded on the map with its stars (%s)" % str(C.stars.get("L01", 0)))
	var s1: Array = app.b.q("saves")
	check(s1.size() > 0 and str(s1[0].level) == "L01" and str(s1[0].status) == "won", "the engine autosave is the won L01")
	app.start_level("L02", true); await frames(4)
	var s2: Array = app.b.q("saves")
	check(s2.size() > 0 and str(s2[0].level) == "L02" and str(s2[0].status) == "playing", "starting L02 autosaves it at once (newest save: %s)" % (str(s2[0].level) if s2.size() > 0 else "-"))
	# an old stale save (the won L01 on top) still continues to the next job
	app.b.act("save", ["auto"])
	var stale := {"slot": "auto", "level": "L01", "status": "won", "tick": 30}
	C.stars["L01"] = 1
	TitleScreen.continue_play(app, stale); await frames(3)
	check(str(app.b.g.get("level", "")) == "L02", "Continue on a won L01 goes to L02, not back to L01's end card (%s)" % str(app.b.g.get("level", "")))
	TitleScreen.continue_play(app, {"slot": "auto", "level": "L02", "status": "lost", "tick": 9}); await frames(3)
	check(str(app.b.g.get("level", "")) == "L02" and str(app.b.g.get("status", "")) == "playing", "Continue on a lost level restarts it")
	# a normal Continue loads the save as it is
	app.start_level("L02", true); await frames(3)
	app.b.act("save", ["main"]); app.start_level("L01", true); await frames(3)
	TitleScreen.continue_play(app, {"slot": "main", "level": "L02", "status": "playing", "tick": 0}); await frames(3)
	check(str(app.b.g.get("level", "")) == "L02", "Continue on a playing save loads that level (%s)" % str(app.b.g.get("level", "")))
	C.reset()
	for sl in ["auto", "main", "slot2", "slot3"]: app.b.act("deleteSave", [sl])
	DirAccess.remove_absolute(ProjectSettings.globalize_path(C.path))
