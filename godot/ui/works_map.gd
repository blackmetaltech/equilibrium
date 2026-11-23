class_name WorksMap
extends RefCounted
## The Works map (DESIGN 2.4, UI.md 10): the whole complex on the bay. One site per chapter (the gate, the QC lab, the burner house, the converter house,
## the catalyst house, the loop, the containment yard, the integrated Works, the control room, the turnaround yard); every level is a lamp node under its
## site (dark -> white when won -> teal at three stars; stars below; exam bridges are square book-marked side nodes, optional). Finishing a chapter lights its
## plant (windows, steam, a ship at the jetty) and lays the pipe to the next; the same count lights the backdrop of every level (Scenery.set_revived).
## Unlocks: chapter N+1 opens when chapter N's critical-path levels all have a star (bridges are optional); chapters 8 and 9 open after chapter 5; inside
## a chapter the levels go in order. Engineer rank comes from total stars. Mouse, touch (tap selects, tap again or START starts) and pad all work.
## Landscape: a grid of site cards joined by pipes on the bay; narrow or portrait: one column down the coast with the pipe in a left gutter.
## Progress lives in `Campaign` (user://eq_campaign.cfg): the engine's own progress record is never written by the shell (see the campaign report).

const S := {
	"MAP_TITLE": "Works map", "MAP_RANK": "Engineer rank", "MAP_STARS": "%d of %d stars", "MAP_NEXT": "next: %s at %d", "MAP_TOP": "highest rank",
	"MAP_START": "START", "MAP_CLOSE": "Close", "MAP_BRIDGE": "Exam bridge (optional)", "MAP_SOON": "Under construction",
	"MAP_LOCK_CH": "Finish chapter %d, %s, first.", "MAP_LOCK_LV": "Needs a star on %s first.", "MAP_PICK": "Pick a job. Teal lamps are three stars.",
	"MAP_LEGEND": "dark: locked   white: done   teal: three stars   book: exam bridge",
	"MAP_NEW_ASK": "Start the works over? The map goes dark again and your stars are cleared.", "MAP_NEW_YES": "New works",
	"CARD_START": "Start work", "CARD_BACK": "Back", "MAP_LEARNER": "Stars won in Learner mode are hollow gold; Engineer mode makes them solid.",
}
static func T(k: String) -> String: return S.get(k, k)

## 0.12 lab home: the map is a plan inked on paper lying on the drafting table (set by open() when the lab is up); everywhere else it keeps the glass look.
static var paper := false
const P_PAPER := Color("#EFE9D8")
const P_INK := Color("#1D2330")
const P_DIM := Color("#555C6A")   ## 5.6:1 on the paper
const P_BLUE := Color("#124E78")
const P_GRID := Color(0.36, 0.45, 0.58, 0.16)
## `p` on paper, `g` on glass.
static func pk(g: Color, p: Color) -> Color: return p if paper else g

## [chapter, title, site, kind, first level number, last level number]. Level ids are matched by number against the engine's list, so a level the engine
## does not have yet (L23, L26, L28) simply has no node.
const CHAPTERS := [
	[0, "Night Shift", "The gate", "gate", 0, 0],
	[1, "The Bench", "QC lab", "lab", 1, 4],
	[2, "Fire", "Burner house", "burner", 5, 9],
	[3, "The Wall", "Converter house", "converter", 10, 14],
	[4, "Speed", "Catalyst house", "catalyst", 15, 18],
	[5, "The Loop", "The loop", "loop", 19, 23],
	[6, "Containment", "Containment yard", "yard", 24, 27],
	[7, "The Works", "Integrated Works", "works", 28, 28],
	[8, "The Control Room", "Control room", "control", 29, 33],
	[9, "Turnaround", "Turnaround yard", "turnaround", 34, 38],
	[10, "Hydraulics", "Pump house", "pumps", 39, 39],
	[11, "Career", "Plant manager's office", "career", 40, 40],
]
const BRIDGES := [4, 9, 14, 18]
## Which chapter must be done before this one opens (-1: open from the start).
## D-B4 (phase B): chapter 3 is the new-look chapter and opens from the start (the title screen has a strip for it); 00 is the new-look prologue.
const NEW_LOOK := [0, 1, 2, 3]
const PART_LOOK := {2: "L09 classic"}   ## 0.12: chapter 2 builds in the hall (L05-L08); the L09 bench is still the classic view
const PREREQ := {0: -1, 1: -1, 2: 1, 3: -1, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 5, 10: 5, 11: 5}   # Hydraulics and Career open after chapter 5 like chapters 8 and 9
## Total stars for each Engineer rank.
const RANKS := [["Trainee", 0], ["Shift Engineer", 6], ["Senior Engineer", 20], ["Process Engineer", 40], ["Plant Manager", 65], ["Chief Engineer", 90]]
## Grid order of the chapters (landscape): row 1 left to right, row 2 right to left, so the pipe snakes along the coast.
const GRID := [0, 1, 2, 3, 4, 9, 8, 7, 6, 5, 10, 11]

static func plate_box() -> StyleBoxFlat:
	if paper:
		var b := StyleBoxFlat.new(); b.bg_color = Color(0.36, 0.45, 0.58, 0.07); b.border_color = Color(0.36, 0.45, 0.58, 0.45); b.set_border_width_all(1); b.set_corner_radius_all(2)
		b.content_margin_left = 16; b.content_margin_right = 16; b.content_margin_top = 4; b.content_margin_bottom = 4; return b
	return HoloTheme.box(Color(1, 1, 1, 0.05), Color(HoloTheme.TEAL, 0.3), 1, 10, 8)

static func number(id: String) -> String: return "C" if id == "CAREER" else id.trim_prefix("L").trim_prefix("l")

# =====================================================================================================================
# Progress, unlocks, rank
# =====================================================================================================================
class Campaign:
	static var path := "user://eq_campaign.cfg"
	static var force_persist := false   ## tests: write the file even when CbSettings.persist is off
	static var unlock_all := false      ## CB_UNLOCK_ALL=1: every node open (QA screenshots)
	static var stars := {}              ## level id -> best stars (1..3)
	static var hard := {}               ## level id -> true when the best was won in Engineer mode
	static var ids: Array = []          ## the engine's level ids, in order
	static var done_list: Array = []    ## finished chapters (for the world)
	static var _loaded := false
	static var _last_key := ""
	static var _live := false

	static func persisting() -> bool: return CbSettings.persist or force_persist

	static func load_all() -> void:
		if _loaded: return
		if OS.get_environment("CB_UNLOCK_ALL") == "1": unlock_all = true
		if not persisting(): return   # not marked loaded: a later attach with persistence on still reads the file
		_loaded = true
		var c := ConfigFile.new()
		if c.load(path) != OK: return
		if not c.has_section("stars"): return   # a file written before any win (or by an older build) has no section: nothing to read, nothing to log
		for k in c.get_section_keys("stars"):
			var n := clampi(int(c.get_value("stars", k, 0)), 0, 3)
			if n >= int(stars.get(k, 0)):   # a record already in memory (this session) is never lowered by the file
				stars[k] = n; hard[k] = bool(c.get_value("hard", k, false)) if c.has_section_key("hard", k) else false

	static func save_all() -> void:
		if not persisting(): return
		var c := ConfigFile.new()
		c.set_value("meta", "version", 2)   # the sections below always exist, even with no star yet
		for k in stars: c.set_value("stars", k, stars[k]); c.set_value("hard", k, hard.get(k, false))
		c.save(path)

	static func reset() -> void:
		_loaded = true; stars.clear(); hard.clear(); done_list = []; save_all()

	static func set_levels(levels: Array) -> void:
		ids = []
		for l in levels: ids.append(str((l as Dictionary).get("id", "")))

	## CAREER has no L-number: it is node 40, after the last numbered job (it used to read as 0 and sit on the gate; L39 is the pump house).
	static func num(id: String) -> int:
		if id == "CAREER": return 40
		return int(id.trim_prefix("L").trim_prefix("l")) if id.length() > 1 and id.trim_prefix("L").trim_prefix("l").is_valid_int() else -1

	static func chapter_of(id: String) -> int:
		var n := num(id)
		for ch in WorksMap.CHAPTERS: if n >= int(ch[4]) and n <= int(ch[5]): return int(ch[0])
		return -1

	static func is_bridge(id: String) -> bool: return WorksMap.BRIDGES.has(num(id))

	## Existing level ids of a chapter in order; `bridges` picks the exam bridges instead of the critical path.
	static func chapter_ids(n: int, bridges := false) -> Array:
		var out: Array = []
		for id in ids:
			if chapter_of(id) == n and is_bridge(id) == bridges: out.append(id)
		return out

	static func chapter_name(n: int) -> String: return str(WorksMap.CHAPTERS[n][1])

	static func starred(id: String) -> bool: return int(stars.get(id, 0)) >= 1

	static func ch_done(n: int) -> bool:
		var cr := chapter_ids(n)
		if cr.is_empty(): return false
		for id in cr: if not starred(id): return false
		return true

	static func ch_open(n: int) -> bool:
		if unlock_all: return true
		var p: int = int(WorksMap.PREREQ.get(n, -1))
		return p < 0 or ch_done(p)

	## "" when the level can be played, else the rule that locks it.
	static func lock_reason(id: String) -> String:
		if unlock_all: return ""
		var n := chapter_of(id)
		if n < 0: return ""
		if not ch_open(n):
			var p: int = int(WorksMap.PREREQ[n]); return WorksMap.T("MAP_LOCK_CH") % [p, chapter_name(p)]
		for c in chapter_ids(n):   # the critical path in order; a bridge waits for all of it
			if c == id: break
			if not starred(c): return WorksMap.T("MAP_LOCK_LV") % c
		return ""

	static func state_of(id: String) -> String:
		if lock_reason(id) != "": return "locked"
		return "done" if starred(id) else "open"

	## Stars earned on nodes the player can actually reach (a star left over on a locked node never counts).
	static func eff(id: String) -> int: return 0 if lock_reason(id) != "" else int(stars.get(id, 0))

	static func total_stars() -> int:
		var t := 0
		for id in ids: t += eff(id)
		return t

	static func max_stars() -> int: return ids.size() * 3

	static func rank_index() -> int:
		var t := total_stars(); var r := 0
		for i in WorksMap.RANKS.size(): if t >= int(WorksMap.RANKS[i][1]): r = i
		return r

	static func rank_name() -> String: return str(WorksMap.RANKS[rank_index()][0])

	static func chapters_done() -> Array:
		var a: Array = []
		for ch in WorksMap.CHAPTERS: if int(ch[0]) >= 1 and int(ch[0]) <= 9 and ch_done(int(ch[0])): a.append(int(ch[0]))   # the backdrop has nine plants; Career is an office
		return a

	## The next critical-path level after `id` in play order that can be played now ("" when there is none).
	static func next_after(id: String) -> String:
		for c in ids:
			if num(c) > num(id) and not is_bridge(c) and lock_reason(c) == "" and not starred(c): return c
		for c in ids:
			if num(c) > num(id) and not is_bridge(c) and lock_reason(c) == "": return c
		return ""

	## Keep the best result: more stars win, and at equal stars an Engineer-mode win replaces a Learner one. True when the record changed.
	static func record(id: String, s: int, engineer: bool) -> bool:
		s = clampi(s, 1, 3)
		var old := int(stars.get(id, 0))
		if s > old or (s == old and engineer and not bool(hard.get(id, false))):
			stars[id] = s; hard[id] = engineer; save_all(); return true
		return false

	## Push the finished chapters into the backdrop.
	static func push_world(app: CbApp) -> void:
		done_list = chapters_done()
		var pw = app.get("plant_world") if app != null else null
		if pw != null and pw.get("scenery") != null: (pw.scenery as Scenery).set_revived(done_list.size(), done_list)

	static var _claimed := ""

	## The engine's own progress record (claimStars on a win; a `progress` query when the engine offers one) is the source of truth once it speaks: its stars
	## replace the local copy, so a star the engine never gave cannot light a node.
	static func sync_engine(app: CbApp) -> void:
		if app == null or app.b == null: return
		var qs: Array = app.b.init_data.get("queries", [])
		if not qs.has("progress"): return
		var pr = app.b.q("progress")
		if not (pr is Dictionary): return
		var es = pr.get("stars", pr)
		if not (es is Dictionary): return
		for id in ids:
			if (es as Dictionary).has(id) and int((es as Dictionary)[id]) > int(stars.get(id, 0)): stars[id] = clampi(int((es as Dictionary)[id]), 0, 3)   # the engine can only add: a fresh launch's all-zero record must not wipe the file's stars
			# an id the engine has no record of keeps the user:// copy: that file is only the migration fallback for a launch that did not Continue (the engine's progress is carried over inside a session and saved with the game)

	## Hook the running game (once): a won level is recorded with its stars, the backdrop follows, and a level that has just begun is autosaved
	## so Continue never resumes the level before it (the engine only autosaves on ticks and on a win; a level begun and then left was lost).
	static func attach(app: CbApp) -> void:
		if app == null or app.get("b") == null or app.b == null: return
		load_all(); set_levels(app.b.levels()); sync_engine(app)
		if app.has_meta("eq_campaign"): return
		app.set_meta("eq_campaign", true)
		app.b.changed.connect(func(): _on_changed(app))
		push_world(app)

	static func _on_changed(app: CbApp) -> void:
		var g: Dictionary = app.b.g
		var lvl := str(g.get("level", "")) if g.get("level", null) != null else ""
		if lvl == "": return
		var st := str(g.get("status", "playing"))
		if st == "won":
			var li = app.b.q("levelInfo") if (app.b.init_data.get("queries", []) as Array).has("levelInfo") else null
			var n := 1
			if li is Dictionary and li.get("stars", null) is Dictionary: n = int((li.stars as Dictionary).get("have", 1))
			var key2 := "%s|%s" % [lvl, str(g.get("seed", ""))]
			if _claimed != key2 and (app.b.init_data.get("actions", []) as Array).has("claimStars"):
				_claimed = key2; app.b.act("claimStars", [])   # the engine keeps the campaign record (stars of this win)
			sync_engine(app)
			if record(lvl, n, str(g.get("mode", "learner")) == "engineer"): push_world(app)
		elif st == "playing" and int(g.get("tick", 0)) == 0:
			var key := "%s|%s" % [lvl, str(g.get("seed", ""))]
			if key != _last_key:
				_last_key = key
				app.call_deferred("_autosave")

# =====================================================================================================================
# The map dialog
# =====================================================================================================================
static var sel_id := ""
static var _touch_override := false   ## tests: behave as a touch device (tap selects, tap again starts)

static func open(app: CbApp) -> void:
	var old = app.root.get_node_or_null("levels")
	if old != null: return
	Campaign.attach(app)
	var compact := CbLayout.compact
	var vw := app.vw(); var vh := app.vs_h()
	var narrow := vw < 1000.0 or vh > vw * 1.1
	var home: bool = LabHome.is_up() and not app.started and not compact
	paper = home   # 0.12: opened from the title in the lab: the map is the lit plan on the planning table, the lab shows round it
	var d: Dictionary = app.dialog("levels", minf(vw - (16.0 if compact else 40.0), 1860.0) * (0.66 if home else 1.0), (vh - (16.0 if compact else 40.0)) * (0.74 if home else 1.0), EqTheme.ENAMEL_HI, 0.0 if home else 0.55)
	var host: Control = d.host; var vb: VBoxContainer = d.vb
	if home:   # paper on the table: opaque sheet, thin edge, soft shadow (no glass wall)
		var sheet := StyleBoxFlat.new(); sheet.bg_color = P_PAPER; sheet.border_color = Color(0.72, 0.68, 0.58); sheet.set_border_width_all(1); sheet.set_corner_radius_all(3)
		sheet.shadow_color = Color(0.05, 0.03, 0.0, 0.45); sheet.shadow_size = 16; sheet.shadow_offset = Vector2(3, 7)
		for sd in ["left", "right"]: sheet.set("content_margin_" + sd, 26)
		for sd in ["top", "bottom"]: sheet.set("content_margin_" + sd, 18)
		(d.panel as PanelContainer).add_theme_stylebox_override("panel", sheet)
	else: (d.panel as PanelContainer).add_theme_stylebox_override("panel", HoloTheme.box(Color(HoloTheme.GLASS, 0.94), Color(HoloTheme.TEAL, 0.4), 1, 14, int(10.0 if compact else 18.0)))   # owner review: the glass language
	if LabHome.is_up() and not app.started: LabHome.map_opened(app, host)   # every layout: the title UI steps aside while the map and its briefing card are up (on a handheld the card used to be drawn over the menu)
	vb.add_theme_constant_override("separation", 6 if compact else 10)
	var view := MapView.new(); view.app = app; view.host = host; view.narrow = narrow
	view.build(vb)
	app.focus_dialog()

## Start a level from the map (or the title): closes the map first.
static func start(app: CbApp, host: Control, id: String) -> void:
	if LabHome.brief(app, host, id): return   # 0.12: in the lab the job opens as a briefing card on the table first
	if host != null and is_instance_valid(host): host.queue_free()
	sel_id = ""
	BuildKeeper.predict_done.erase(id)
	BuildKeeper.run_prior.erase(id)
	app.start_level(id, true)

# ---------------------------------------------------------------------------------------------------------------------
class MapView extends RefCounted:
	var app: CbApp
	var host: Control
	var narrow := false
	var nodes: Dictionary = {}     ## level id -> NodeBtn
	var cards: Dictionary = {}     ## chapter -> SiteCard
	var info: Label
	var start_btn: Button
	var bay: Bay
	var scroll: ScrollContainer
	var levels_by_id: Dictionary = {}

	func build(vb: VBoxContainer) -> void:
		var compact := CbLayout.compact
		for l in app.b.levels(): levels_by_id[str((l as Dictionary).id)] = l
		# header: title, rank plate, close
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 14); vb.add_child(hb)
		var t := EqTheme.label(WorksMap.T("MAP_TITLE"), 26 if compact else 32, WorksMap.pk(EqTheme.TEXT, WorksMap.P_INK), "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; t.name = "Title"; hb.add_child(t)
		var x := EqTheme.key_button(WorksMap.T("MAP_CLOSE"), false, 16); x.name = "Close"; x.pressed.connect(func(): host.queue_free()); hb.add_child(x)
		vb.add_child(_rank_plate(narrow or compact))
		scroll = ScrollContainer.new(); scroll.name = "List"; scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		scroll.follow_focus = true; vb.add_child(scroll)
		bay = Bay.new(); bay.name = "Bay"; bay.view = self; bay.narrow = narrow; bay.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bay.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.add_child(bay)
		bay.build()
		# info bar: the focused or tapped job and its lock rule
		var ib := PanelContainer.new(); ib.name = "InfoBar"; ib.add_theme_stylebox_override("panel", WorksMap.plate_box()); vb.add_child(ib)
		var ibh := HBoxContainer.new(); ibh.add_theme_constant_override("separation", 12); ib.add_child(ibh)
		info = EqTheme.label(WorksMap.T("MAP_PICK"), 15 if compact else 17, WorksMap.pk(HoloTheme.INK, WorksMap.P_INK), "sans"); info.name = "Info"; info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; info.custom_minimum_size = Vector2(0, 46 if compact else 50); info.vertical_alignment = VERTICAL_ALIGNMENT_CENTER; ibh.add_child(info)
		start_btn = EqTheme.key_button(WorksMap.T("MAP_START"), true, 17); start_btn.name = "Start"; start_btn.disabled = true
		start_btn.pressed.connect(func(): if WorksMap.sel_id != "": WorksMap.start(app, host, WorksMap.sel_id))
		ibh.add_child(start_btn)
		if not (compact and narrow):
			var lg := EqTheme.label((WorksMap.T("MAP_LEGEND") if not WorksMap.paper else "grey: locked   white: done   blue: three stars   book: exam bridge") + ("   ·   swipe up for chapters 5-10 and Career" if CbLayout.phone else ""), 20, WorksMap.pk(EqTheme.DIM, WorksMap.P_DIM), "sans"); lg.name = "Legend"; lg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(lg)
		# first focus: the first open, unstarred node (else the first open one)
		var pick: NodeBtn = null
		for id in WorksMap.Campaign.ids:
			var nb: NodeBtn = nodes.get(id)
			if nb != null and nb.state == "open": pick = nb; break
		if pick == null:
			for id in WorksMap.Campaign.ids:
				var nb2: NodeBtn = nodes.get(id)
				if nb2 != null and nb2.state != "locked": pick = nb2; break
		if pick != null and CbKit.pad_mode: pick.call_deferred("grab_focus")  # (guarded below)
		if pick != null: select(pick.lid, false)
		_wire_focus(pick, x)

	## 0.12: the d-pad and the left stick walk the job nodes by where they are on the plan (Godot's own neighbour search jumped from Close to Start and never entered the grid).
	## Wired once the layout has settled; positions are taken inside the bay, so a scrolled list does not change them. The top row goes up to Close, the bottom row down to Start.
	func _wire_focus(pick: NodeBtn, close_btn: Button) -> void:
		var sig := ""; var same := 0
		for i in 60:   # wait for the layout to settle: the same node positions on three frames running
			await app.get_tree().process_frame
			if bay == null or not is_instance_valid(bay): return
			var s2 := ""
			for k in nodes: if is_instance_valid(nodes[k]): s2 += str((nodes[k] as Control).get_global_rect().position) + ";"
			same = same + 1 if s2 == sig else 0; sig = s2
			if same >= 3: break
		if bay == null or not is_instance_valid(bay): return
		var inv := bay.get_global_transform().affine_inverse()
		var list: Array = []
		for k in nodes: if is_instance_valid(nodes[k]): list.append(nodes[k])
		if list.is_empty(): return
		var ctr := func(n: Control) -> Vector2: return inv * n.get_global_rect().get_center()
		var dirs := {"left": Vector2.LEFT, "right": Vector2.RIGHT, "top": Vector2.UP, "bottom": Vector2.DOWN}
		for n in list:
			var c: Vector2 = ctr.call(n)
			for dn in dirs:
				var d: Vector2 = dirs[dn]; var best: Control = null; var bs := INF
				for pass_i in 2:   # first the nodes in a cone ahead, then (so nothing is unreachable) any node ahead
					for m in list:
						if m == n: continue
						var del: Vector2 = (ctr.call(m) as Vector2) - c
						var along := del.dot(d); var perp := absf(del.dot(Vector2(-d.y, d.x)))
						if along <= 4.0 or (pass_i == 0 and perp > along * 2.0 + 20.0): continue
						var sc := along + perp * 2.0
						if sc < bs: bs = sc; best = m
					if best != null: break
				if best != null: n.set("focus_neighbor_" + dn, n.get_path_to(best))
				elif dn == "top": n.focus_neighbor_top = n.get_path_to(close_btn)
				elif dn == "bottom": n.focus_neighbor_bottom = n.get_path_to(start_btn)
		close_btn.focus_neighbor_bottom = close_btn.get_path_to(pick if pick != null else list[0])
		start_btn.focus_neighbor_top = start_btn.get_path_to(pick if pick != null else list[0])
		if CbKit.pad_mode and pick != null and is_instance_valid(pick) and pick.is_inside_tree(): pick.grab_focus()
		await app.get_tree().process_frame
		_open_view(pick)

	## The map opens at its top, or (when the first job is further down) with that job's chapter card at the top: the focus grab during the first layout used to leave it scrolled to the middle.
	func _open_view(pick: NodeBtn) -> void:
		if scroll == null or not is_instance_valid(scroll) or bay == null or not is_instance_valid(bay): return
		scroll.scroll_vertical = 0
		if pick == null or not is_instance_valid(pick): return
		var pr: Rect2 = Rect2(bay.get_global_transform().affine_inverse() * pick.get_global_rect().position, pick.get_global_rect().size)
		if pr.end.y + 24.0 > scroll.size.y: scroll.scroll_vertical = maxi(0, int(pr.position.y) - 90)

	func _rank_plate(compact: bool) -> Control:
		var pn := PanelContainer.new(); pn.name = "Rank"; pn.add_theme_stylebox_override("panel", WorksMap.plate_box())
		var h: BoxContainer = HBoxContainer.new() if not narrow else VBoxContainer.new(); h.add_theme_constant_override("separation", 14 if not narrow else 0); pn.add_child(h)
		var h1: BoxContainer = h
		if narrow: h1 = HBoxContainer.new(); h1.add_theme_constant_override("separation", 10); h.add_child(h1)
		var c := WorksMap.Campaign
		var tag := EqTheme.label(WorksMap.T("MAP_RANK"), 13, WorksMap.pk(EqTheme.DIM, WorksMap.P_DIM), "sans"); h1.add_child(tag)
		var rn := EqTheme.label(c.rank_name(), 20 if compact else 26, WorksMap.pk(EqTheme.TEAL.lightened(0.2), WorksMap.P_BLUE), "title"); rn.name = "RankName"; h1.add_child(rn)
		var ri := c.rank_index(); var tot := c.total_stars()
		var nxt := WorksMap.T("MAP_TOP") if ri >= WorksMap.RANKS.size() - 1 else WorksMap.T("MAP_NEXT") % [str(WorksMap.RANKS[ri + 1][0]), int(WorksMap.RANKS[ri + 1][1])]
		var sl := EqTheme.label("%s · %s" % [WorksMap.T("MAP_STARS") % [tot, c.max_stars()], nxt], 15 if compact else 17, WorksMap.pk(HoloTheme.INK, WorksMap.P_INK), "sans"); sl.name = "RankStars"; sl.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		sl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; h.add_child(sl)
		return pn

	## Select a node: show its job and rule in the info bar; START is live when the node is open.
	func select(id: String, announce := true) -> void:
		WorksMap.sel_id = id
		var lv: Dictionary = levels_by_id.get(id, {})
		var why := WorksMap.Campaign.lock_reason(id)
		var head := "%s · %s" % [WorksMap.number(id), str(lv.get("title", id))]
		var brief := str(lv.get("brief", ""))
		info.text = head + "\n" + (why if why != "" else brief)
		start_btn.disabled = why != ""
		for k in nodes: (nodes[k] as NodeBtn).set_selected(k == id)

	## The finger is dragging a list (CbTouchScroll's cancel arrives as a release while the finger is still over the lamp, which the button would count as a tap).
	func swiping() -> bool:
		var ts = app.get("touch_scroll") if app != null else null
		return ts != null and bool(ts.get("_dragging"))

	## A node was pressed. Desktop: starts an open job at once. Touch: the first tap selects, the second starts. A locked job only says why.
	func pressed(id: String) -> void:
		var why := WorksMap.Campaign.lock_reason(id)
		if why != "": select(id); app.toast(why, "warn"); return
		if (CbLayout.touch or WorksMap._touch_override) and WorksMap.sel_id != id: select(id); return
		WorksMap.start(app, host, id)

# ---------------------------------------------------------------------------------------------------------------------
## The bay: the background, the pipes between the sites, the site cards (a grid in landscape, one column in portrait) and the ship band.
class Bay extends VBoxContainer:
	var view: MapView
	var narrow := false
	var box: Container
	var t := 0.0
	var ship: ShipBand
	const EDGES := [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]]

	func build() -> void:
		var compact := CbLayout.compact
		var v: VBoxContainer = self
		v.add_theme_constant_override("separation", 6)
		var pad := MarginContainer.new(); pad.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		for side in ["left", "right", "top", "bottom"]: pad.add_theme_constant_override("margin_" + side, 10)
		if narrow: pad.add_theme_constant_override("margin_left", 34)
		v.add_child(pad)
		if narrow:
			var col := VBoxContainer.new(); col.add_theme_constant_override("separation", 14); col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; pad.add_child(col); box = col
			for ch in WorksMap.CHAPTERS: _add_card(int(ch[0]))
		else:
			var g := GridContainer.new(); g.columns = 5
			g.add_theme_constant_override("h_separation", 26 if compact else 48); g.add_theme_constant_override("v_separation", 44); g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
			pad.add_child(g); box = g
			for n in WorksMap.GRID: _add_card(n)
		ship = ShipBand.new(); ship.custom_minimum_size = Vector2(0, 86 if not compact else 70); ship.size_flags_vertical = Control.SIZE_EXPAND_FILL; v.add_child(ship)
		set_process(true)

	func _add_card(n: int) -> void:
		var c := SiteCard.new(); c.view = view; c.chapter = n; c.narrow = narrow; c.size_flags_horizontal = Control.SIZE_EXPAND_FILL; c.size_flags_vertical = Control.SIZE_FILL
		box.add_child(c); c.build(); view.cards[n] = c

	func _process(dt: float) -> void:
		if CbSettings.reduced_motion: return
		t += dt; queue_redraw()

	func _anchor(n: int, side: String) -> Vector2:
		var c: Control = view.cards.get(n)
		if c == null: return Vector2.ZERO
		var r := Rect2(c.get_global_rect().position - get_global_rect().position, c.size)
		match side:
			"l": return Vector2(r.position.x, r.position.y + r.size.y * 0.5)
			"r": return Vector2(r.end.x, r.position.y + r.size.y * 0.5)
			"t": return Vector2(r.position.x + r.size.x * 0.5, r.position.y)
			"b": return Vector2(r.position.x + r.size.x * 0.5, r.end.y)
			_: return r.get_center()

	func _draw() -> void:
		var C := WorksMap.Campaign
		# mimic-panel backdrop: faint grid and a salt-flat band
		var gcol := WorksMap.pk(Color(EqTheme.ENAMEL_LO, 0.5), WorksMap.P_GRID)
		var gx := 60.0
		var x := 0.0
		while x < size.x: draw_line(Vector2(x, 0), Vector2(x, size.y), gcol, 1.0); x += gx
		var y := 0.0
		while y < size.y: draw_line(Vector2(0, y), Vector2(size.x, y), gcol, 1.0); y += gx
		if view.cards.size() < WorksMap.CHAPTERS.size(): return
		var flow := fmod(t * 40.0, 24.0)
		if narrow:
			var gx0 := 17.0
			for i in range(WorksMap.CHAPTERS.size() - 1):
				var a := i; var b := i + 1
				var src := 5 if b >= 8 else a
				var p0 := _anchor(a, "c"); var p1 := _anchor(b, "c")
				_pipe([Vector2(gx0, p0.y), Vector2(gx0, p1.y)], C.ch_done(src) if src > 0 else C.starred("L00"), b >= 8, flow)
			for n in range(WorksMap.CHAPTERS.size()):   # valves in the gutter
				var pc := _anchor(n, "c"); var done := C.ch_done(n) if n > 0 else C.starred("L00")
				draw_circle(Vector2(gx0, pc.y), 9.0, WorksMap.pk(Color("#0B1413"), WorksMap.P_INK)); draw_circle(Vector2(gx0, pc.y), 6.0, WorksMap.pk(EqTheme.TEAL if done else EqTheme.LAMP_OFF, WorksMap.P_BLUE if done else WorksMap.P_PAPER))
			return
		for e in EDGES:
			var a: int = e[0]; var b: int = e[1]
			var laid: bool = C.ch_done(a) if a > 0 else C.starred("L00")
			if a == 4: _pipe([_anchor(4, "b"), _anchor(5, "t")], laid, false, flow)
			elif a >= 5: _pipe([_anchor(a, "l"), _anchor(b, "r")], laid, false, flow)
			else: _pipe([_anchor(a, "r"), _anchor(b, "l")], laid, false, flow)
		# signal lines (dashed) from the loop to the control room and the turnaround yard, along the trench under the second row
		var yb := maxf(_anchor(5, "b").y, _anchor(8, "b").y) + 20.0
		for target in [8, 9, 10, 11]:
			var s0 := _anchor(5, "b"); var s1 := _anchor(target, "b" if target < 10 else "t")
			_pipe([s0, Vector2(s0.x, yb), Vector2(s1.x, yb), s1], C.ch_done(5), true, flow)

	## A pipe along `pts`: a dark outline, a rust or teal body (teal once laid) and chevrons that run along it when it carries product. Dashed = signal line.
	func _pipe(pts: Array, laid: bool, dashed: bool, flow: float) -> void:
		var col := (WorksMap.P_BLUE if laid else Color("#8A7A62")) if WorksMap.paper else (EqTheme.TEAL if laid else Color("#5B4A3E"))
		var w := 6.0 if not dashed else 3.0
		for i in range(pts.size() - 1):
			var a: Vector2 = pts[i]; var b: Vector2 = pts[i + 1]
			if dashed:
				var dir := (b - a); var len := dir.length(); if len < 1.0: continue
				dir /= len; var d := 0.0
				while d < len:
					var e := minf(d + 10.0, len)
					draw_line(a + dir * d, a + dir * e, col if laid else col.darkened(0.15), w)
					d += 18.0
			else:
				if not WorksMap.paper: draw_line(a, b, Color("#0B1413"), w + 4.0)
				draw_line(a, b, col.darkened(0.25) if laid else col, w if not WorksMap.paper else w * 0.6)
		if laid and not dashed and not CbSettings.reduced_motion:
			for i in range(pts.size() - 1):
				var a: Vector2 = pts[i]; var b: Vector2 = pts[i + 1]
				var dir := (b - a); var len := dir.length(); if len < 1.0: continue
				dir /= len; var nrm := Vector2(-dir.y, dir.x); var d := flow
				while d < len:
					var c := a + dir * d
					draw_polyline(PackedVector2Array([c - dir * 4.0 + nrm * 4.0, c + dir * 2.0, c - dir * 4.0 - nrm * 4.0]), EqTheme.LAMP_WHITE, 2.0)
					d += 24.0

# ---------------------------------------------------------------------------------------------------------------------
## One site: its drawn plant (dark, rusted, or lit with steam), the chapter title, and the lamp nodes of its levels (bridges after them).
class SiteCard extends PanelContainer:
	var view: MapView
	var chapter := 0
	var narrow := false
	var glyph: Glyph
	var state := "locked"

	func build() -> void:
		var C := WorksMap.Campaign
		var ch: Array = WorksMap.CHAPTERS[chapter]
		name = "Site_%d" % chapter
		var compact := CbLayout.compact
		var done := C.ch_done(chapter) if chapter > 0 else C.starred("L00")
		var opened := C.ch_open(chapter)
		state = "done" if done else ("open" if opened else "locked")
		var sb := HoloTheme.box(Color(0.10, 0.20, 0.24, 0.72), Color(HoloTheme.TEAL, 0.22), 1, 12, int((6.0 if CbLayout.phone else 10.0) if compact else 14.0))   # owner review: glass cards
		if chapter in WorksMap.NEW_LOOK: sb.border_color = Color(HoloTheme.TEAL, 0.75)
		if state == "locked": sb.bg_color = Color(0.05, 0.09, 0.11, 0.8)
		elif state == "done": sb.border_color = EqTheme.TEAL.darkened(0.2)
		if WorksMap.paper:   # a plot on the sheet: a slightly lighter patch with an ink outline; a locked plot is shaded grey; new-look plots have a heavier line
			sb.bg_color = Color(1, 1, 1, 0.45) if state != "locked" else Color(0.45, 0.47, 0.52, 0.16)
			sb.border_color = Color(0.11, 0.14, 0.19, 0.8 if chapter in WorksMap.NEW_LOOK else 0.4); sb.set_border_width_all(2 if chapter in WorksMap.NEW_LOOK else 1); sb.set_corner_radius_all(2)
		add_theme_stylebox_override("panel", sb)
		mouse_filter = Control.MOUSE_FILTER_PASS
		var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3 if CbLayout.phone else 6); add_child(v)
		var top: BoxContainer = HBoxContainer.new() if narrow else VBoxContainer.new()
		top.add_theme_constant_override("separation", 10 if narrow else 4); top.mouse_filter = Control.MOUSE_FILTER_IGNORE; v.add_child(top)
		glyph = Glyph.new(); glyph.clip_contents = true; glyph.kind = str(ch[3]); glyph.state = state; glyph.custom_minimum_size = Vector2(100 if (narrow or compact) else 160, 76 if compact else 92)
		if not narrow: glyph.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
		var thumb_path := "res://look2/assets/thumb_ch%d.jpg" % chapter
		if chapter in WorksMap.NEW_LOOK and ResourceLoader.exists(thumb_path):   # owner review: the new-look chapters show their scene
			var tr := TextureRect.new(); tr.texture = load(thumb_path); tr.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; tr.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
			tr.custom_minimum_size = Vector2(glyph.custom_minimum_size.x, glyph.custom_minimum_size.x * 9.0 / 16.0) if not compact else glyph.custom_minimum_size; tr.mouse_filter = Control.MOUSE_FILTER_IGNORE
			if not narrow: tr.size_flags_horizontal = Control.SIZE_SHRINK_CENTER
			top.add_child(tr)
		else: top.add_child(glyph)
		if glyph.get_parent() == null: glyph.free.call_deferred()
		var tv := VBoxContainer.new(); tv.add_theme_constant_override("separation", 0); tv.size_flags_horizontal = Control.SIZE_EXPAND_FILL; tv.mouse_filter = Control.MOUSE_FILTER_IGNORE; top.add_child(tv)
		var head := ("%02d" % chapter if chapter > 0 else "00") + " · " + str(ch[1])
		var tl := EqTheme.label(head, 18 if compact else 21, WorksMap.pk(EqTheme.TEXT if state != "locked" else EqTheme.DIM, WorksMap.P_INK if state != "locked" else WorksMap.P_DIM), "title"); tl.name = "SiteTitle"; tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tl.custom_minimum_size = Vector2(40, 0); tv.add_child(tl)
		var sub := str(ch[2])
		var crit := C.chapter_ids(chapter)
		if crit.is_empty() and chapter > 0: sub += " · " + WorksMap.T("MAP_SOON")
		sub += " · " + ("New look" if chapter in WorksMap.NEW_LOOK else "classic") + ((" · " + str(WorksMap.PART_LOOK[chapter])) if WorksMap.PART_LOOK.has(chapter) else "")
		var sl := EqTheme.label(sub, 14 if compact else 16, WorksMap.pk(EqTheme.TEAL.lightened(0.25) if state != "locked" else EqTheme.DIM, WorksMap.P_BLUE if state != "locked" else WorksMap.P_DIM), "sans"); sl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; sl.custom_minimum_size = Vector2(40, 0); tv.add_child(sl)
		if not opened:
			var p: int = int(WorksMap.PREREQ[chapter])
			var rl := EqTheme.label(WorksMap.T("MAP_LOCK_CH") % [p, C.chapter_name(p)], 13, WorksMap.pk(EqTheme.DIM, WorksMap.P_DIM), "sans"); rl.name = "Rule"; rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; rl.custom_minimum_size = Vector2(40, 0); tv.add_child(rl)
		var fl := HFlowContainer.new(); fl.name = "Nodes"; fl.add_theme_constant_override("h_separation", 6); fl.add_theme_constant_override("v_separation", 2 if CbLayout.phone else 4); fl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; v.add_child(fl)
		for id in crit: fl.add_child(_node(id, false))
		var brs := C.chapter_ids(chapter, true)
		if not brs.is_empty():
			var sp := Control.new(); sp.custom_minimum_size = Vector2(6, 10); sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; fl.add_child(sp)
			for id in brs: fl.add_child(_node(id, true))

	func _node(id: String, bridge: bool) -> NodeBtn:
		var C := WorksMap.Campaign
		var nb := NodeBtn.new(); nb.lid = id; nb.bridge = bridge; nb.name = "Level_" + id
		nb.state = C.state_of(id); nb.stars = C.eff(id); nb.hard = bool(C.hard.get(id, false))
		var lv: Dictionary = view.levels_by_id.get(id, {})
		nb.text = "%s · %s" % [WorksMap.number(id), str(lv.get("title", id))]
		nb.tooltip_text = nb.text + ("\n" + WorksMap.T("MAP_BRIDGE") if bridge else "") + ("\n" + C.lock_reason(id) if nb.state == "locked" else "")
		var tap := maxf(CbLayout.tap(), 46.0)
		nb.custom_minimum_size = Vector2(tap, tap + (13.0 if CbLayout.phone else 16.0))
		nb.pressed.connect(func(): if not view.swiping(): view.pressed(id))   # a swipe that began on a lamp scrolls the map: it is never a tap
		nb.focus_entered.connect(func(): view.select(id))
		nb.mouse_entered.connect(func(): if not (CbLayout.touch or WorksMap._touch_override): view.select(id))
		view.nodes[id] = nb
		return nb

## The lamp node of one level: a lamp (ring, number) with three star pips under it. Locked = dark with a padlock; a bridge is a rounded square with a book.
class NodeBtn extends Button:
	var lid := ""
	var bridge := false
	var state := "open"
	var stars := 0
	var hard := false
	var sel := false
	func _init() -> void:
		flat = true; focus_mode = Control.FOCUS_ALL; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var e := StyleBoxEmpty.new()
		for s in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]: add_theme_stylebox_override(s, e)
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_disabled_color", "font_hover_pressed_color"]: add_theme_color_override(c, Color(0, 0, 0, 0))
		clip_text = true; alignment = HORIZONTAL_ALIGNMENT_CENTER
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw); mouse_entered.connect(queue_redraw); mouse_exited.connect(queue_redraw)
	func set_selected(on: bool) -> void:
		if sel != on: sel = on; queue_redraw()
	func _draw() -> void:
		var f := EqStrings.font("cap")
		var r := minf(size.x, size.y - 16.0) * 0.5 - 2.0
		var c := Vector2(size.x * 0.5, r + 3.0)
		var lit := has_focus() or is_hovered() or sel
		var fill := EqTheme.LAMP_OFF; var ink := EqTheme.DIM; var ring := Color("#0B1413")
		match state:
			"done": fill = EqTheme.TEAL if stars >= 3 else EqTheme.LAMP_WHITE; ink = EqTheme.INK
			"open": fill = EqTheme.ENAMEL_HI; ink = EqTheme.TEXT; ring = EqTheme.LAMP_WHITE.darkened(0.2)
		var dim := EqTheme.DIM
		if WorksMap.paper:   # a pin on the plan: ink ring, white head; three stars in blue ink; locked = grey pin
			dim = WorksMap.P_DIM
			match state:
				"done": fill = WorksMap.P_BLUE if stars >= 3 else Color.WHITE; ink = Color.WHITE if stars >= 3 else WorksMap.P_INK; ring = WorksMap.P_BLUE
				"open": fill = Color.WHITE; ink = WorksMap.P_INK; ring = WorksMap.P_INK
				_: fill = Color(0.78, 0.78, 0.76); ring = WorksMap.P_DIM
		if lit and state != "locked": draw_circle(c, r + 8.0, Color(EqTheme.TEAL, 0.25) if not WorksMap.paper else Color(0.95, 0.62, 0.15, 0.35))
		if bridge:
			var rect := Rect2(c - Vector2(r, r), Vector2(r, r) * 2.0)
			var sbx := StyleBoxFlat.new(); sbx.bg_color = fill; sbx.border_color = (EqTheme.TEAL if not WorksMap.paper else Color(0.95, 0.62, 0.15)) if lit else ring; sbx.set_border_width_all(3 if lit else 2); sbx.set_corner_radius_all(int(r * 0.35))
			draw_style_box(sbx, rect)
		else:
			draw_circle(c, r + 3.0, (EqTheme.TEAL if not WorksMap.paper else Color(0.95, 0.62, 0.15)) if lit else ring); draw_circle(c, r, ring)
			draw_circle(c, r - 3.0, fill)
			if state == "done": draw_circle(c + Vector2(-r * 0.3, -r * 0.35), r * 0.16, Color(1, 1, 1, 0.55))
		var num := WorksMap.number(lid); var sz := EqTheme.fs(15 if r < 20.0 else 17)
		var tw := f.get_string_size(num, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		if state == "locked":
			# padlock: a body and a shackle, the number small under it is the tooltip's job
			var bd := Rect2(c + Vector2(-r * 0.32, -r * 0.05), Vector2(r * 0.64, r * 0.5))
			draw_rect(bd, Color(dim, 0.8)); draw_arc(c + Vector2(0, -r * 0.05), r * 0.24, PI, TAU, 10, Color(dim, 0.8), 2.5)
		else:
			EqTheme.ds(self, f, Vector2(c.x - tw * 0.5, c.y + sz * 0.34), num, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, ink)
		if bridge:   # the book: two pages on a spine, at the top-right corner
			var bp := c + Vector2(r * 0.62, -r * 0.78)
			draw_circle(bp, 9.0, WorksMap.pk(Color("#0B1413"), WorksMap.P_INK))
			draw_colored_polygon(PackedVector2Array([bp + Vector2(-6, -4), bp + Vector2(0, -2), bp + Vector2(0, 5), bp + Vector2(-6, 3)]), EqTheme.AMBER)
			draw_colored_polygon(PackedVector2Array([bp + Vector2(6, -4), bp + Vector2(0, -2), bp + Vector2(0, 5), bp + Vector2(6, 3)]), EqTheme.AMBER.lightened(0.3))
		# the stars: solid gold for Engineer wins, hollow gold for Learner wins, a grey dot when not earned
		var sy := c.y + r + 11.0
		for i in 3:
			var p := Vector2(size.x * 0.5 + (i - 1) * 13.0, sy)
			if i < stars:
				var pts := _star(p, 6.0)
				if hard: draw_colored_polygon(pts, EqTheme.AMBER)
				else:
					draw_colored_polygon(pts, Color(EqTheme.AMBER, 0.18)); var cl := PackedVector2Array(pts); cl.append(pts[0]); draw_polyline(cl, EqTheme.AMBER, 1.6)
			else: draw_circle(p, 2.2, Color(dim, 0.45 if state != "locked" else 0.2))
	static func _star(c: Vector2, r: float) -> PackedVector2Array:
		var a := PackedVector2Array()
		for i in 10:
			var rr := r if i % 2 == 0 else r * 0.45; var ang := -PI * 0.5 + i * PI / 5.0
			a.append(c + Vector2(cos(ang), sin(ang)) * rr)
		return a

## The plant drawn for its site, from the side. state: locked (dark silhouette), open (rusted, windows dark), done (lit windows, steam, flare).
class Glyph extends Control:
	var kind := "lab"
	var state := "locked"
	var t := 0.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(dt: float) -> void:
		if state != "done" or CbSettings.reduced_motion: return
		t += dt; queue_redraw()
	func _ready() -> void: set_process(true)
	func _draw() -> void:
		var w := size.x; var h := size.y
		var gy := h - 8.0
		var body := Color("#8E7A66") if state == "open" else (Color("#9FA89F") if state == "done" else Color("#2E3E3B"))
		var dark := body.darkened(0.3)
		var win_on := state == "done" or (kind == "lab" and state != "locked")   # the QC lab is the one lit plant at the start
		var wcol := Color("#FFC27A") if win_on else Color("#1A2523")
		draw_rect(Rect2(0, gy, w, 3.0), Color("#0B1413"))
		var steam := false
		match kind:
			"gate":
				draw_rect(Rect2(w * 0.18, gy - 40, 6, 40), dark); draw_rect(Rect2(w * 0.74, gy - 40, 6, 40), dark)
				draw_rect(Rect2(w * 0.18, gy - 46, w * 0.62, 7), body)
				draw_circle(Vector2(w * 0.5, gy - 62), 9.0, Color("#F4F1DE") if state != "locked" else Color("#3C4B48"))   # the moon of the night shift
				draw_circle(Vector2(w * 0.5 + 4.0, gy - 65), 8.0, Color("#1D3330"))
				draw_rect(Rect2(w * 0.4, gy - 22, 16, 8), wcol)
			"lab":
				draw_rect(Rect2(w * 0.1, gy - 34, w * 0.62, 34), body); draw_rect(Rect2(w * 0.07, gy - 38, w * 0.68, 6), dark)
				for i in 3: draw_rect(Rect2(w * 0.16 + i * w * 0.18, gy - 26, w * 0.1, 12), wcol)
				draw_rect(Rect2(w * 0.78, gy - 52, 7, 52), dark); steam = true
				_steam(Vector2(w * 0.78 + 3.5, gy - 54), 0.0, state == "done")
			"burner":
				draw_rect(Rect2(w * 0.08, gy - 36, w * 0.5, 36), body)
				draw_rect(Rect2(w * 0.68, gy - 76, 12, 76), dark); draw_rect(Rect2(w * 0.68, gy - 62, 12, 5), Color("#B33A2E") if state != "locked" else dark)
				draw_rect(Rect2(w * 0.2, gy - 22, 14, 14), wcol)
				if win_on: draw_colored_polygon(PackedVector2Array([Vector2(w * 0.23, gy - 9), Vector2(w * 0.27, gy - 20 - 3.0 * sin(t * 9.0)), Vector2(w * 0.31, gy - 9)]), Color("#FF9A3A"))
				_steam(Vector2(w * 0.68 + 6.0, gy - 78), 0.3, state == "done")
			"converter":
				draw_rect(Rect2(w * 0.22, gy - 58, w * 0.26, 58), body); draw_circle(Vector2(w * 0.35, gy - 58), w * 0.13, body)
				draw_rect(Rect2(w * 0.55, gy - 38, w * 0.18, 38), dark); draw_circle(Vector2(w * 0.64, gy - 38), w * 0.09, dark)
				draw_line(Vector2(w * 0.48, gy - 30), Vector2(w * 0.55, gy - 30), dark, 4.0)
				for i in 3: draw_rect(Rect2(w * 0.25, gy - 48 + i * 14, w * 0.2, 4), wcol)
			"catalyst":
				for k in 2:
					var x0 := w * (0.18 + k * 0.36)
					draw_rect(Rect2(x0, gy - 54, w * 0.22, 54), body); draw_circle(Vector2(x0 + w * 0.11, gy - 54), w * 0.11, body)
					for i in 3: draw_rect(Rect2(x0 + 3, gy - 44 + i * 13, w * 0.22 - 6, 6), Color("#C9A24A") if win_on else Color("#4B4338"))
				draw_line(Vector2(w * 0.4, gy - 20), Vector2(w * 0.54, gy - 20), dark, 4.0)
			"loop":
				var rc := Rect2(w * 0.12, gy - 62, w * 0.62, 50)
				draw_rect(rc, Color(0, 0, 0, 0), false, 1.0)
				draw_polyline(PackedVector2Array([rc.position, Vector2(rc.end.x, rc.position.y), rc.end, Vector2(rc.position.x, rc.end.y), rc.position]), body, 6.0)
				draw_circle(rc.get_center(), 14.0, dark); draw_circle(rc.get_center(), 8.0, wcol)
				draw_rect(Rect2(w * 0.8, gy - 40, 10, 40), body); _steam(Vector2(w * 0.8 + 5.0, gy - 42), 0.6, state == "done")
			"yard":
				draw_rect(Rect2(w * 0.1, gy - 30, w * 0.3, 30), body); draw_rect(Rect2(w * 0.1, gy - 34, w * 0.3, 5), dark)
				draw_rect(Rect2(w * 0.5, gy - 60, 6, 60), dark)
				if win_on: draw_colored_polygon(PackedVector2Array([Vector2(w * 0.5 - 2.0, gy - 61), Vector2(w * 0.5 + 3.0, gy - 78 - 3.0 * sin(t * 8.0)), Vector2(w * 0.5 + 8.0, gy - 61)]), Color("#FF9A3A"))
				draw_rect(Rect2(w * 0.64, gy - 24, w * 0.22, 24), body); draw_rect(Rect2(w * 0.7, gy - 17, 8, 8), wcol)
			"works":
				draw_rect(Rect2(w * 0.05, gy - 28, w * 0.18, 28), body); draw_rect(Rect2(w * 0.27, gy - 28, w * 0.18, 28), dark)
				draw_rect(Rect2(w * 0.5, gy - 70, 8, 70), body); draw_rect(Rect2(w * 0.62, gy - 40, w * 0.3, 40), dark)
				for i in 3: draw_rect(Rect2(w * 0.65 + i * w * 0.09, gy - 30, 8, 14), wcol)
				_steam(Vector2(w * 0.5 + 4.0, gy - 72), 0.1, state == "done")
			"control":
				draw_rect(Rect2(w * 0.12, gy - 36, w * 0.6, 36), body); draw_rect(Rect2(w * 0.1, gy - 40, w * 0.64, 6), dark)
				draw_rect(Rect2(w * 0.18, gy - 28, w * 0.48, 12), wcol)
				draw_line(Vector2(w * 0.68, gy - 40), Vector2(w * 0.68, gy - 70), dark, 3.0); draw_circle(Vector2(w * 0.68, gy - 70), 3.0, Color("#E63946") if win_on and fmod(t, 1.2) < 0.6 else dark)
			"career":   # the plant manager's office: a low block, a window row, and a wall calendar
				draw_rect(Rect2(w * 0.14, gy - 40, w * 0.52, 40), body); draw_rect(Rect2(w * 0.11, gy - 45, w * 0.58, 6), dark)
				for i in 4: draw_rect(Rect2(w * 0.2 + i * w * 0.11, gy - 30, w * 0.07, 12), wcol)
				draw_rect(Rect2(w * 0.74, gy - 56, w * 0.16, 44), Color("#F4EEE2") if state != "locked" else dark)
				draw_rect(Rect2(w * 0.74, gy - 56, w * 0.16, 9), Color("#B33A2E") if state != "locked" else dark.darkened(0.2))
				for r in 3: for c in 3: draw_rect(Rect2(w * 0.755 + c * w * 0.045, gy - 42 + r * 9, w * 0.03, 5), dark)
			"pumps":   # the pump house: a low shed, a tank, a pump on its plinth and a riser to a drum on a deck
				draw_rect(Rect2(w * 0.08, gy - 26, w * 0.2, 26), body); draw_rect(Rect2(w * 0.06, gy - 30, w * 0.24, 5), dark)
				draw_rect(Rect2(w * 0.62, gy - 52, w * 0.3, 52), Color(0, 0, 0, 0), false, 1.0)
				draw_line(Vector2(w * 0.6, gy - 52), Vector2(w * 0.94, gy - 52), body, 4.0); draw_line(Vector2(w * 0.64, gy), Vector2(w * 0.64, gy - 52), body, 3.0); draw_line(Vector2(w * 0.9, gy), Vector2(w * 0.9, gy - 52), body, 3.0)
				draw_rect(Rect2(w * 0.66, gy - 66, w * 0.22, 13), dark); draw_circle(Vector2(w * 0.66, gy - 59.5), 6.5, dark); draw_circle(Vector2(w * 0.88, gy - 59.5), 6.5, dark)
				draw_line(Vector2(w * 0.28, gy - 7), Vector2(w * 0.42, gy - 7), dark, 4.0); draw_circle(Vector2(w * 0.45, gy - 8), 7.0, Color("#2D5DA8") if state != "locked" else dark)
				draw_line(Vector2(w * 0.45, gy - 15), Vector2(w * 0.45, gy - 40), dark, 4.0); draw_line(Vector2(w * 0.45, gy - 40), Vector2(w * 0.7, gy - 40), dark, 4.0); draw_line(Vector2(w * 0.7, gy - 40), Vector2(w * 0.7, gy - 53), dark, 4.0)
				draw_rect(Rect2(w * 0.12, gy - 18, w * 0.06, 8), wcol)
				if win_on: draw_circle(Vector2(w * 0.45, gy - 8), 2.5, Color("#E4E8E3") if fmod(t, 0.6) < 0.3 else Color("#2D5DA8"))
			"turnaround":
				for i in 3:
					var x0 := w * (0.1 + i * 0.22)
					draw_rect(Rect2(x0, gy - 56, w * 0.2, 56), Color(0, 0, 0, 0), false, 1.0)
					for lv in 3: draw_line(Vector2(x0, gy - 8 - lv * 20), Vector2(x0 + w * 0.2, gy - 8 - lv * 20), body, 3.0)
					draw_line(Vector2(x0, gy), Vector2(x0, gy - 56), body, 3.0); draw_line(Vector2(x0 + w * 0.2, gy), Vector2(x0 + w * 0.2, gy - 56), body, 3.0)
				draw_line(Vector2(w * 0.86, gy), Vector2(w * 0.86, gy - 72), Color("#C99A2E") if state != "locked" else dark, 5.0)
				draw_line(Vector2(w * 0.5, gy - 72), Vector2(w * 0.92, gy - 72), Color("#C99A2E") if state != "locked" else dark, 4.0)
				draw_circle(Vector2(w * 0.5, gy - 72), 3.0, Color("#FFB703") if win_on and fmod(t, 1.0) < 0.5 else dark)
	## A few puffs rising from `at` (only when lit).
	func _steam(at: Vector2, phase: float, on: bool) -> void:
		if not on or CbSettings.reduced_motion: return
		for i in 4:
			var ph := fposmod(t * 0.5 + phase + i * 0.25, 1.0)
			var rise := minf(26.0, maxf(8.0, at.y - 6.0))
			draw_circle(at + Vector2(ph * 8.0, -ph * rise), 2.5 + ph * 4.0, Color(1, 1, 1, 0.55 * (1.0 - ph)))

## The bay at the foot of the map: waves, the jetty, and the sulfur ship that sails in once the burner house is done (deck lamps at chapter 6).
class ShipBand extends Control:
	var t := 0.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; name = "Bay"
	func _process(dt: float) -> void:
		if CbSettings.reduced_motion: return
		t += dt; queue_redraw()
	func _ready() -> void: set_process(true)
	func _draw() -> void:
		var C := WorksMap.Campaign
		var w := size.x; var h := size.y
		draw_rect(Rect2(0, 40.0, w, h - 40.0), WorksMap.pk(Color("#2B5F78", 0.9), Color("#7FA3B8", 0.55)))
		for k in 3:
			var y := 52.0 + k * (h - 52.0) * 0.3; var pts := PackedVector2Array()
			for i in range(0, int(w) + 12, 12): pts.append(Vector2(i, y + sin(t * 1.4 + i * 0.05 + k) * 2.0))
			draw_polyline(pts, WorksMap.pk(Color(1, 1, 1, 0.12), Color(0.1, 0.3, 0.45, 0.3)), 1.5)
		var jy := maxf(52.0, h * 0.3) - 4.0
		draw_rect(Rect2(w - 150.0, jy, 150.0, 8.0), Color("#8C7A62"))   # the jetty
		for i in 6: draw_rect(Rect2(w - 140.0 + i * 24.0, jy, 5.0, h * 0.5), Color("#6E5A44"))
		if C.ch_done(2) or C.unlock_all:
			var bob := sin(t * 1.1) * 2.0
			var sx := w - 330.0; var sy := maxf(52.0, h * 0.3) + bob
			draw_colored_polygon(PackedVector2Array([Vector2(sx, sy - 18), Vector2(sx + 130, sy - 18), Vector2(sx + 112, sy + 6), Vector2(sx + 14, sy + 6)]), Color("#2E3B4E"))
			draw_rect(Rect2(sx + 2, sy - 20, 126, 4), Color("#8C2F2A"))
			draw_rect(Rect2(sx + 92, sy - 40, 30, 22), Color("#E7E3D8"))
			for i in 2: draw_colored_polygon(PackedVector2Array([Vector2(sx + 14 + i * 40, sy - 18), Vector2(sx + 30 + i * 40, sy - 34), Vector2(sx + 46 + i * 40, sy - 18)]), Color("#E8D44D"))
			if C.ch_done(6) or C.unlock_all:
				for i in 6: draw_circle(Vector2(sx + 14 + i * 18, sy - 12), 2.4, Color("#FFD48A"))
