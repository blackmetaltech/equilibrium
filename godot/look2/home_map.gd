class_name HomeMap
extends RefCounted
## 0.13 the Works map in the lab: a scale model of the Works on the planning table (SiteModel) and one slim paper sheet beside it for the chosen chapter (its jobs, the brief, START).
## Every chapter stop has a tag over its building (a Button: mouse hover or click and pad focus select the chapter) and a group on the sheet (`Site_N`, holding the usual `Level_<id>`
## job rows). Only the chosen chapter's group shows. WorksMap.open() builds this when the lab is up and the window is wide; narrow and handheld windows keep the classic map.
const SHORT := ["Gate", "QC lab", "Burner", "Converter", "Catalyst", "The loop", "Yard", "Works", "Control", "Turnaround", "Pumps", "Office"]
static var sheet_w := 0.0                 ## the sheet's width while the model stands (LabHome frames the table in the rest of the window); 0 = no site map
static var model: SiteModel

static func width_for(vw: float) -> float: return clampf(vw * 0.30, 400.0, 480.0)

static func chapter_state(n: int) -> String:
	var C := WorksMap.Campaign
	if OS.get_environment("CB_MAP_DONE") != "" and str(n) in OS.get_environment("CB_MAP_DONE").split(","): return "done"   # captures: show these chapters as finished
	if (C.ch_done(n) if n > 0 else C.starred("L00")): return "done"
	return "open" if C.ch_open(n) else "locked"

## The job a chapter opens on: its first open job without a star, else its first open one, else its first job ("" when the engine has none yet).
static func default_level(n: int) -> String:
	var C := WorksMap.Campaign
	var all: Array = C.chapter_ids(n) + C.chapter_ids(n, true)
	for id in all: if C.state_of(id) == "open": return id
	for id in all: if C.state_of(id) != "locked": return id
	return all[0] if not all.is_empty() else ""

static func build(view: WorksMap.MapView, vb: VBoxContainer) -> void:
	var C := WorksMap.Campaign
	var app: CbApp = view.app
	var host: Control = view.host
	# header: the title and Close
	var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); vb.add_child(hb)
	var t := EqTheme.label(WorksMap.T("MAP_TITLE"), 30, WorksMap.P_INK, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; t.name = "Title"; hb.add_child(t)
	var x := EqTheme.key_button(WorksMap.T("MAP_CLOSE"), false, 16); x.name = "Close"; x.pressed.connect(func(): host.queue_free()); hb.add_child(x)
	vb.add_child(view._rank_plate(true))
	# the chapters' groups, one at a time
	view.scroll = ScrollContainer.new(); view.scroll.name = "List"; view.scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	view.scroll.follow_focus = true; vb.add_child(view.scroll)
	view.scroll.custom_minimum_size = Vector2(0, clampf(app.vs_h() - 450.0, 220.0, 350.0))
	var col := VBoxContainer.new(); col.name = "Groups"; col.size_flags_horizontal = Control.SIZE_EXPAND_FILL; view.scroll.add_child(col)
	for ch in WorksMap.CHAPTERS:
		var g := _group(view, int(ch[0])); g.visible = false; col.add_child(g); view.groups[int(ch[0])] = g
	# the chosen job: its brief or the rule that locks it, and START
	var ib := PanelContainer.new(); ib.name = "InfoBar"; ib.add_theme_stylebox_override("panel", WorksMap.plate_box()); vb.add_child(ib)
	var ibh := VBoxContainer.new(); ibh.add_theme_constant_override("separation", 6); ib.add_child(ibh)
	view.info = EqTheme.label(WorksMap.T("MAP_PICK"), 17, WorksMap.P_INK, "sans"); view.info.name = "Info"; view.info.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	view.info.custom_minimum_size = Vector2(0, 92); view.info.vertical_alignment = VERTICAL_ALIGNMENT_TOP; ibh.add_child(view.info)
	view.start_btn = EqTheme.key_button(WorksMap.T("MAP_START"), true, 18); view.start_btn.name = "Start"; view.start_btn.disabled = true; view.start_btn.custom_minimum_size = Vector2(0, 48)
	view.start_btn.pressed.connect(func(): if WorksMap.sel_id != "": WorksMap.start(app, host, WorksMap.sel_id))
	ibh.add_child(view.start_btn)
	var lg := EqTheme.label("lit: open   grey: locked   flag: done   book: exam bridge", 16, WorksMap.P_DIM, "sans"); lg.name = "Legend"; lg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(lg)
	# the model on the table and the tags over it
	var lab = LabHome.up.lab if LabHome.is_up() else null
	var table: Node = lab.get_node_or_null("PlanningTable") if lab != null else null
	if table != null:
		var states: Array = []
		for n in SiteModel.STOPS.size(): states.append(chapter_state(n))
		model = SiteModel.new(); table.add_child(model); model.position = Vector3(0, 0.975, 0)
		model.build(states, C.ch_done(2) or C.unlock_all)
		var layer := StopLayer.new(); layer.name = "Stops"; layer.view = view; layer.lab = lab; layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT); layer.mouse_filter = Control.MOUSE_FILTER_IGNORE
		host.add_child(layer)
		for n in SiteModel.STOPS.size():
			var sb := StopBtn.new(); sb.chapter = n; sb.state = states[n]; sb.name = "Stop_%d" % n; sb.view = view; sb.text = ""
			sb.tooltip_text = "%d · %s: %s" % [n, WorksMap.CHAPTERS[n][1], SiteModel.NAMES[n]]
			layer.add_child(sb); view.stops[n] = sb
		_wire_stops(view)
		host.tree_exited.connect(func():
			if model != null and is_instance_valid(model): model.queue_free()
			model = null; sheet_w = 0.0)
		layer.update_all()
	# first pick: the first open, unstarred job (else the first open one)
	var pick: WorksMap.NodeBtn = null
	for id in C.ids:
		var nb: WorksMap.NodeBtn = view.nodes.get(id)
		if nb != null and nb.state == "open": pick = nb; break
	if pick == null:
		for id in C.ids:
			var nb2: WorksMap.NodeBtn = view.nodes.get(id)
			if nb2 != null and nb2.state != "locked": pick = nb2; break
	if pick != null: view.select(pick.lid, false)
	else: view.select_chapter(0)
	if OS.get_environment("CB_MAP_PICK") != "": view.select_chapter(clampi(int(OS.get_environment("CB_MAP_PICK")), 0, 11))   # captures: open on this chapter
	if pick != null and CbKit.pad_mode: pick.call_deferred("grab_focus")
	x.focus_neighbor_bottom = x.get_path_to(pick) if pick != null else NodePath()

static func _group(view: WorksMap.MapView, n: int) -> Control:
	var C := WorksMap.Campaign
	var ch: Array = WorksMap.CHAPTERS[n]
	var g := VBoxContainer.new(); g.name = "Site_%d" % n; g.add_theme_constant_override("separation", 4); g.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var state := chapter_state(n)
	var head := EqTheme.label(("%02d" % n) + " · " + str(ch[1]), 26, WorksMap.P_INK if state != "locked" else WorksMap.P_DIM, "title"); head.name = "SiteTitle"; head.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; g.add_child(head)
	var crit := C.chapter_ids(n)
	var sub := str(ch[2]) + " · " + ("New look" if n in WorksMap.NEW_LOOK else "classic") + ((" · " + str(WorksMap.PART_LOOK[n])) if WorksMap.PART_LOOK.has(n) else "")
	if crit.is_empty() and n > 0: sub += " · " + WorksMap.T("MAP_SOON")
	var sl := EqTheme.label(sub, 17, WorksMap.P_BLUE if state != "locked" else WorksMap.P_DIM, "sans"); sl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; g.add_child(sl)
	if state == "locked":
		var p: int = int(WorksMap.PREREQ[n])
		var rl := EqTheme.label(WorksMap.T("MAP_LOCK_CH") % [p, C.chapter_name(p)], 16, WorksMap.P_DIM, "sans"); rl.name = "Rule"; rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; g.add_child(rl)
	var rows := VBoxContainer.new(); rows.name = "Nodes"; rows.add_theme_constant_override("separation", 3); g.add_child(rows)
	for id in crit: rows.add_child(_row(view, id, false))
	var brs := C.chapter_ids(n, true)
	if not brs.is_empty():
		var sp := Control.new(); sp.custom_minimum_size = Vector2(0, 6); sp.mouse_filter = Control.MOUSE_FILTER_IGNORE; rows.add_child(sp)
		for id in brs: rows.add_child(_row(view, id, true))
	return g

static func _row(view: WorksMap.MapView, id: String, bridge: bool) -> WorksMap.NodeBtn:
	var C := WorksMap.Campaign
	var nb := WorksMap.NodeBtn.new(); nb.lid = id; nb.bridge = bridge; nb.row = true; nb.name = "Level_" + id
	nb.state = C.state_of(id); nb.stars = C.eff(id); nb.hard = bool(C.hard.get(id, false))
	var lv: Dictionary = view.levels_by_id.get(id, {})
	nb.title = str(lv.get("title", id)); nb.text = "%s · %s" % [WorksMap.number(id), nb.title]
	nb.tooltip_text = nb.text + ("\n" + WorksMap.T("MAP_BRIDGE") if bridge else "") + ("\n" + C.lock_reason(id) if nb.state == "locked" else "")
	nb.custom_minimum_size = Vector2(0, maxf(CbLayout.tap(), 50.0)); nb.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	nb.pressed.connect(func(): if not view.swiping(): view.pressed(id))
	nb.focus_entered.connect(func(): view.select(id))
	nb.mouse_entered.connect(func(): if not (CbLayout.touch or WorksMap._touch_override): view.select(id))
	view.nodes[id] = nb
	return nb

## The d-pad walks the stops by where they stand on the board (a cone ahead, then anything ahead); the two stops at the right end step into their chapter's sheet, and every
## job row steps back left to its own stop. A on a stop (pad) moves into the sheet too.
static func _wire_stops(view: WorksMap.MapView) -> void:
	var dirs := {"left": Vector2(-1, 0), "right": Vector2(1, 0), "top": Vector2(0, -1), "bottom": Vector2(0, 1)}
	for a in SiteModel.STOPS.size():
		var sa: StopBtn = view.stops[a]
		for dn in dirs:
			var d: Vector2 = dirs[dn]; var best := -1; var bs := INF
			for pass_i in 2:
				for b in SiteModel.STOPS.size():
					if b == a: continue
					var del: Vector2 = SiteModel.STOPS[b] - SiteModel.STOPS[a]
					var along := del.dot(d); var perp := absf(del.dot(Vector2(-d.y, d.x)))
					if along <= 0.1 or (pass_i == 0 and perp > along * 1.5 + 0.25): continue
					var sc := along + perp * 2.0
					if sc < bs: bs = sc; best = b
				if best >= 0: break
			if best >= 0: sa.set("focus_neighbor_" + dn, sa.get_path_to(view.stops[best]))
			elif dn == "right":
				var first := default_level(a)
				sa.focus_neighbor_right = sa.get_path_to(view.nodes[first]) if first != "" and view.nodes.has(first) else sa.get_path_to(view.start_btn)
	for id in view.nodes:
		var nb: WorksMap.NodeBtn = view.nodes[id]
		var n := WorksMap.Campaign.chapter_of(str(id))
		if view.stops.has(n): nb.focus_neighbor_left = nb.get_path_to(view.stops[n])

## Show one chapter's group on the sheet and light its stop on the model.
static func show_chapter(view: WorksMap.MapView, n: int) -> void:
	if n < 0 or view.shown == n: return
	view.shown = n
	for k in view.groups: (view.groups[k] as Control).visible = (k == n)
	for k in view.stops: (view.stops[k] as StopBtn).set_selected(k == n)
	if model != null and is_instance_valid(model): model.set_selected(n)
	if view.scroll != null: view.scroll.scroll_vertical = 0

# ---------------------------------------------------------------------------------------------------------------------
## Keeps every tag over its building: projects the model's points through the lab camera each frame.
class StopLayer extends Control:
	var view: WorksMap.MapView
	var lab
	func _process(_dt: float) -> void: update_all()
	func update_all() -> void:
		if lab == null or not is_instance_valid(lab) or lab.cam == null or HomeMap.model == null or not is_instance_valid(HomeMap.model): return
		var cam: Camera3D = lab.cam
		for n in SiteModel.STOPS.size():
			var sb: StopBtn = view.stops.get(n)
			if sb == null: continue
			var tw: Vector3 = HomeMap.model.top_world(n); var fw: Vector3 = HomeMap.model.front_world(n)
			if cam.is_position_behind(tw): sb.visible = false; continue
			sb.visible = true
			var top := cam.unproject_position(tw); var bot := cam.unproject_position(fw)
			var w := 136.0
			var y0 := minf(top.y, bot.y) - 4.0; var y1 := bot.y + 34.0
			sb.position = Vector2(bot.x - w * 0.5, y0); sb.size = Vector2(w, maxf(y1 - y0, 60.0))
			var gap := INF   # the tags of two neighbouring buildings must not cover each other: when they would, an unchosen tag shows only its number
			for o in SiteModel.STOPS.size():
				if o != n and absf(SiteModel.STOPS[o].y - SiteModel.STOPS[n].y) < 0.5: gap = minf(gap, absf(cam.unproject_position(HomeMap.model.front_world(o)).x - bot.x))
			var tight := gap < 128.0
			if tight != sb.tight: sb.tight = tight; sb.queue_redraw()

## A chapter's stop: a hit area over its building and a paper tag under it ("4 Catalyst"). Hover, click or pad focus choose the chapter; the tag shows the state.
class StopBtn extends Button:
	var chapter := 0
	var state := "open"
	var sel := false
	var tight := false    ## neighbours stand close in this window: an unchosen tag shows its number only
	var view: WorksMap.MapView
	func _init() -> void:
		flat = true; focus_mode = Control.FOCUS_ALL; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND; clip_text = false
		var e := StyleBoxEmpty.new()
		for s in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]: add_theme_stylebox_override(s, e)
		focus_entered.connect(_on_focus); mouse_entered.connect(_on_hover); pressed.connect(_on_press)
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw); mouse_entered.connect(queue_redraw); mouse_exited.connect(queue_redraw)
	func set_selected(on: bool) -> void:
		if sel != on: sel = on; queue_redraw()
	func _on_focus() -> void: view.select_chapter(chapter)
	func _on_hover() -> void: if not (CbLayout.touch or WorksMap._touch_override): view.select_chapter(chapter)
	func _on_press() -> void:
		view.select_chapter(chapter)
		if CbKit.pad_mode:   # A on a stop moves into its sheet
			var id := HomeMap.default_level(chapter)
			if CbKit.pad_mode and id != "" and view.nodes.has(id): (view.nodes[id] as Control).call_deferred("grab_focus")
	func _draw() -> void:
		var f := EqStrings.font("cap")
		var lit := sel or has_focus() or is_hovered()
		var txt := "%d %s" % [chapter, HomeMap.SHORT[chapter]] if (lit or not tight) else str(chapter)
		var tw := minf(f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(17)).x + 38.0, size.x - 4.0)
		var tag := Rect2((size.x - tw) * 0.5, size.y - 31.0, tw, 29.0)
		var fill := Color(0.97, 0.95, 0.88, 0.96) if state != "locked" else Color(0.82, 0.82, 0.80, 0.92)
		var edge := WorksMap.P_INK if state != "locked" else WorksMap.P_DIM
		if lit: fill = Color(1.0, 0.86, 0.5, 0.98); edge = Color(0.62, 0.36, 0.02)
		var sbx := StyleBoxFlat.new(); sbx.bg_color = fill; sbx.border_color = edge; sbx.set_border_width_all(2 if lit else 1); sbx.set_corner_radius_all(4)
		sbx.shadow_color = Color(0, 0, 0, 0.35); sbx.shadow_size = 4; sbx.shadow_offset = Vector2(0, 2)
		draw_style_box(sbx, tag)
		var dot := Color("#E0A030") if state == "open" else (BRASS if state == "done" else Color(0.55, 0.55, 0.55))
		draw_circle(Vector2(tag.position.x + 13.0, tag.position.y + 14.5), 5.0, dot); draw_arc(Vector2(tag.position.x + 13.0, tag.position.y + 14.5), 5.0, 0.0, TAU, 14, edge, 1.0)
		EqTheme.ds(self, f, Vector2(tag.position.x + 24.0, tag.position.y + 20.5), txt, HORIZONTAL_ALIGNMENT_LEFT, tag.size.x - 28.0, 17, WorksMap.P_INK if state != "locked" else WorksMap.P_DIM)
		if has_focus(): draw_rect(Rect2(1, 1, size.x - 2.0, size.y - 2.0), Color(0.95, 0.62, 0.15), false, 2.0)
	const BRASS := Color("#B98A2A")
