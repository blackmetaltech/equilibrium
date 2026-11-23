class_name LabHome
extends Node
## 0.12 "the lab as the game's home": the title, the Works Map and the level briefing are shown in the genius's private lab (FlaskLab, the L14 room), so the player owns a place.
## Three fixed camera shots, no walking: "title" (the wide shot, a slow sway), "table" (the planning table from above; the Works Map is laid over it as a lit plan) and "card"
## (nearer; one briefing card). The screens are the existing ones (title_screen.gd, works_map.gd); this file owns the lab behind them and the card.
## A setting (EqSettings.home_lab, default on; CB_HOME=0 for one run) switches all of it off: the classic screens stay. CB_HOME=title|map|brief opens a view at launch (captures).
const SHOTS := {"title": "title", "table": "home", "card": "home_card"}
static var up: LabHome
var app
var lab: FlaskLab
var view := ""
var _t := 0.0
var _parked_here := false
var card_host: Control
const PAPER := Color("#EFE9D8")      ## the brief sheet: a little lighter than the drafting paper under it
const INK := Color("#1D2330")        ## dark ink: 14:1 on the paper
const INK_BLUE := Color("#124E78")   ## the Call it line: blue ink, 7:1 on the paper

static func enabled() -> bool: return Look2.enabled() and EqSettings.home_lab and DisplayServer.get_name() != "xx"
static func is_up() -> bool: return up != null and is_instance_valid(up) and up.lab != null

## Show the lab behind the title. Returns false when the flag is off or there is no plant world to share the screen with.
static func show(app, v := "title") -> bool:
	EqSettings.load_all()
	if not enabled() and is_up(): up.hide_home()   # the flag went off while the lab stood
	if not enabled() or app.plant_world == null or app.get("look2") == null: return false
	if is_up():
		up.set_view(v); return true
	var h := LabHome.new(); h.app = app; h.name = "LabHome"; h.process_priority = -100
	app.add_child(h); up = h
	h.lab = FlaskLab.new(); h.lab.app = app; h.lab.name = "HomeLab"
	app.plant_world.get_parent().add_child(h.lab)
	h.lab.set_quality(Look2.auto_tier()); h.lab.setup({})
	# the L14 signs (the book's flask pressure, the clamp) belong to that job: there is no job here, so no number is shown
	for lb in [h.lab.twin_plate, h.lab._clamp_lbl]: if lb != null: lb.queue_free()
	h.lab.twin_plate = null; h.lab._clamp_lbl = null
	app.plant_world.visible = false; app.plant_world.set_blocked(true)
	if app.look2._parked.is_empty(): app.look2._park_env(true); h._parked_here = true
	h.lab.make_current()
	h.set_view(v)
	return true

## Take the lab away (a level starts, or the flag went off) and give the plant world its view back. Called from main.game_on_changed before look2.sync.
static func sync(app) -> void:
	if is_up() and app.started: up.hide_home()

func hide_home() -> void:
	if card_host != null and is_instance_valid(card_host): card_host.queue_free()
	if lab != null: lab.queue_free(); lab = null
	if _parked_here and app.look2 != null and app.look2.gen == null and not app.look2.on: app.look2._park_env(false)
	if app.look2 != null and app.look2.gen == null and not app.look2.on and app.plant_world != null:
		app.plant_world.visible = true; app.plant_world.set_blocked(false)
		if app.plant_world.cam != null: app.plant_world.cam.make_current()
	if up == self: up = null
	queue_free()

func set_view(v: String) -> void:
	view = v
	if lab == null: return
	if not lab.is_inside_tree(): lab.ready.connect(set_view.bind(v), CONNECT_ONE_SHOT); return   # the plant world is not in the tree yet at the very first title
	lab.set_camera(SHOTS.get(v, "wide"))
	if (OS.has_environment("CB_HOME") or OS.has_environment("CB_SHOT")) and lab.is_inside_tree() and lab.cam != null and lab.cam.is_inside_tree(): lab._snap_cam()

func _process(dt: float) -> void:
	if lab == null: return
	_t += dt
	# fixed shots: the preset is held every frame (the lab's own stick and key camera moves are overruled), the title sways a little
	var p: Array = FlaskLab.L14_PRESETS[SHOTS.get(view, "wide")]
	lab.t_focus = p[0]; lab.t_yaw = p[1] + (0.2 * sin(_t * 0.12) if view == "title" and not CbSettings.reduced_motion else 0.0); lab.t_pitch = p[2]; lab.t_dist = p[3]
	if lab.cam != null and not lab.cam.current: lab.make_current()

# ---- the title screen shows over the lab; the map over the table --------------------------------------------------------------------------------
## The title UI root (hidden while the table is shown so the plan has the lab to itself).
static func title_ui(app) -> Control:
	var n = app.root.get_node_or_null("title")
	return n if n is Control else null

## The Works Map opened over the lab: the camera goes to the table, the title UI steps aside and comes back when the map closes. Returns the dialog options.
static func map_opened(app, host: Control) -> void:
	if not is_up() or app.started: return
	up.set_view("table")
	var tu := title_ui(app)
	if tu != null: tu.visible = false
	host.tree_exited.connect(func():
		if is_up() and not app.started and up.view == "table":
			up.set_view("title")
			var t2 := title_ui(app)
			if t2 == null: return
			t2.visible = true
			var sm = t2.find_child("Strip_map", true, false)
			if sm is Control and CbKit.pad_mode: (sm as Control).grab_focus.call_deferred())

# ---- the briefing card ----------------------------------------------------------------------------------------------------------------------
## A job chosen on the table: the engine loads it (without starting the app's game screen), and one card shows its brief: the goal and what to do in at most three
## short lines, the one Call it, and Start work / Back. Returns false when the lab is not up (the caller starts the level the classic way).
static func brief(app, map_host: Control, id: String) -> bool:
	if not is_up() or app.started or id == "CAREER": return false
	BuildKeeper.predict_done.erase(id); BuildKeeper.run_prior.erase(id)
	app.quiet = true; app.b.env("autosave", [false]); app.quiet = false   # browsing a card must never overwrite the saved game
	var r: Dictionary = app.b.act("startLevel", [id, app._seed(), app._mode_pref()])
	if not r.get("ok", false): app.toast(str(r.get("message", "Could not open that job.")), "bad"); return true
	var li = app.b.q("levelInfo")
	if not (li is Dictionary) or (li as Dictionary).is_empty(): return false
	up.set_view("card")
	if map_host != null and is_instance_valid(map_host): map_host.visible = false
	up._build_card(app, map_host, id, li)
	return true

func _build_card(app, map_host: Control, id: String, li: Dictionary) -> void:
	var vw: float = app.vw(); var vh: float = app.vs_h()
	var w := minf(vw - 40.0, 760.0)
	var d: Dictionary = app.dialog("homecard", w, 0.0, EqTheme.ENAMEL_HI, 0.0)
	card_host = d.host; var vb: VBoxContainer = d.vb
	# a sheet of paper lying on the drafting table: paper colour, a thin edge, a soft drop shadow, dark ink (the lamp over the table lights the sheet behind it)
	var sheet := StyleBoxFlat.new(); sheet.bg_color = PAPER; sheet.border_color = Color(0.72, 0.68, 0.58); sheet.set_border_width_all(1); sheet.set_corner_radius_all(3)
	sheet.shadow_color = Color(0.05, 0.03, 0.0, 0.45); sheet.shadow_size = 16; sheet.shadow_offset = Vector2(3, 7)
	sheet.content_margin_left = 34; sheet.content_margin_right = 34; sheet.content_margin_top = 26; sheet.content_margin_bottom = 26
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", sheet)
	vb.add_theme_constant_override("separation", 10)
	var title := EqTheme.label("%s · %s" % [WorksMap.number(id), str(li.get("title", id))], 30, INK, "title"); title.name = "CardTitle"; title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(title)
	var rule := ColorRect.new(); rule.color = Color(0.3, 0.38, 0.5, 0.35); rule.custom_minimum_size = Vector2(0, 2); rule.mouse_filter = Control.MOUSE_FILTER_IGNORE; vb.add_child(rule)
	var parts := BriefLines.split(li.get("note", []) if li.get("note") is Array else [], str(li.get("predictNote", "")) if li.get("predictNote") != null else "")
	for ln in parts.first:
		var l := EqTheme.label(EqVerb.adapt(str(ln)), 19, INK, "sans"); l.name = "CardLine"; l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.add_child(l)
	var ci = li.get("callIt")
	if ci is Dictionary and str((ci as Dictionary).get("prompt", "")) != "":
		var cl := EqTheme.label(EqVerb.adapt(str(ci.prompt)), 18, INK_BLUE, "semi"); cl.name = "CardCallIt"; cl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; vb.add_child(cl)
	var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 12); vb.add_child(row)
	var go := EqTheme.key_button(WorksMap.T("CARD_START"), true, 18); go.name = "CardStart"; row.add_child(go)
	var back := EqTheme.key_button(WorksMap.T("CARD_BACK"), false, 18); back.name = "CardBack"; row.add_child(back)
	var host := card_host
	go.pressed.connect(func(): _begin(app, map_host, id, li))
	back.pressed.connect(func(): host.queue_free())
	host.tree_exited.connect(func():
		if not is_inside_tree() or app.started: return
		if is_up(): set_view("table")
		if map_host != null and is_instance_valid(map_host): map_host.visible = true
		if CbKit.pad_mode and map_host != null and is_instance_valid(map_host):
			var nb = map_host.find_child("Level_" + id, true, false)   # the map's own first focus
			if nb is Control: (nb as Control).grab_focus.call_deferred())
	if CbKit.pad_mode: go.call_deferred("grab_focus")

func _begin(app, map_host: Control, id: String, li: Dictionary) -> void:
	Notebook._seen[str(app.get_instance_id())] = str(li.get("id", id)) + ":" + str(app.b.g.get("seed", ""))   # the card was the briefing: the notebook does not open by itself
	if card_host != null and is_instance_valid(card_host): card_host.queue_free()
	if map_host != null and is_instance_valid(map_host): map_host.queue_free()
	WorksMap.sel_id = ""
	app._begin()

## CB_HOME=map|brief (captures and tests): open the map, or the map and the card of CB_LEVEL (default L02), as soon as the title stands.
static func env_views(app) -> void:
	var v := OS.get_environment("CB_HOME")
	if not is_up() or app.started or v == "" or v == "0" or v == "title": return
	WorksMap.open(app)
	if v == "brief":
		var host = app.root.get_node_or_null("levels")
		var id := OS.get_environment("CB_LEVEL") if OS.get_environment("CB_LEVEL") != "" else "L02"
		if host is Control: WorksMap.start(app, host, id)
