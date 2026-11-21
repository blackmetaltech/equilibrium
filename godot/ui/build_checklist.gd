class_name BuildChecklist
extends PanelContainer
## The build checklist (levelInfo.buildGuide): the notebook's build order as a live list under the notebook tab. Each part, pipe and setting ticks when the engine
## sees it done. Clicking a line points the player at it: a part arms (its rack tile pulses, the suggested footprint glows green), a pipe pulses its two ports (teal
## ball OUT, amber square IN), a setting opens that unit's plate. With no click the first line that is not done is the guide, so the first pipe is always lit.
## The notebook page carries the same lines (`fill_rows`).
var app = null
var lines: Array = []
var focus_id := ""                 ## the line the player clicked ("" = the first line not done)
var collapsed := false
var _level := ""
var _head: Button
var _scroll: ScrollContainer
var _list: VBoxContainer
var _sig := ""
var _auto := ""                    ## the line the guide is pointing at now
var _armed_level := ""             ## the level whose first part row has been put in hand

class Row extends PanelContainer:
	signal picked(id: String)
	var id := ""
	var done := false
	var next := false
	var focused := false
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MouseButton.MOUSE_BUTTON_LEFT:
			accept_event()   # first: the handler rebuilds the rows, and a freed row can no longer mark the press as taken (the world would place the ghost under it)
			picked.emit(id)
	func _draw() -> void:
		if next or focused: draw_rect(Rect2(0, 0, 4, size.y), EqTheme.TEAL)

static func attach(app) -> void:
	if app.root.get_node_or_null("BuildChecklist") != null: return
	var c := BuildChecklist.new(); c.app = app; app.root.add_child(c)

static func panel(app) -> BuildChecklist:
	var n = app.root.get_node_or_null("BuildChecklist")
	return n as BuildChecklist

func _ready() -> void:
	name = "BuildChecklist"; z_index = 5; mouse_filter = Control.MOUSE_FILTER_STOP
	var sb := EqTheme.porcelain_sb(4, 8.0); add_theme_stylebox_override("panel", sb)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 4); add_child(vb)
	_head = EqTheme.key_button("", false, 15); _head.name = "Head"; _head.custom_minimum_size = Vector2(0, 32); _head.alignment = HORIZONTAL_ALIGNMENT_LEFT
	_head.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS
	_head.pressed.connect(func(): collapsed = not collapsed; _sig = ""; refresh()); vb.add_child(_head)
	_scroll = ScrollContainer.new(); _scroll.name = "Scroll"; _scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; vb.add_child(_scroll)
	_list = VBoxContainer.new(); _list.name = "List"; _list.add_theme_constant_override("separation", 1); _list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _scroll.add_child(_list)
	visible = false
	if app != null and app.b != null: app.b.changed.connect(refresh)
	refresh()

func _process(_dt: float) -> void:
	if app == null: return
	var li := Notebook.info(app)
	var ph := str(li.get("phase", "design"))
	var open_rows := lines.any(func(l): return not bool(l.get("done", false)))
	# F14: the checklist stays up while the plant runs (L24's start-up rows tick during the shift); it goes once every row is done or at the report
	var want: bool = app.started and not lines.is_empty() and app.modal() == null and (ph == "design" or (ph in ["commissioned", "shift"] and open_rows)) and str(li.get("id", "")) == _level
	if want != visible: visible = want; refresh()   # the notebook put away / a run over: the guide points again
	if not visible: return
	var vp: Vector2 = get_viewport().get_visible_rect().size
	var ch = app.get("chrome")
	var w := clampf(vp.x * 0.3, 300.0, 390.0) if not CbLayout.phone else vp.x - 24.0
	var chh := float(ch.console_height()) if ch != null and ch.has_method("console_height") else 190.0
	var top := 58.0
	var maxh := maxf(96.0, vp.y - chh - top - 16.0)
	var need: float = _list.get_combined_minimum_size().y
	_scroll.custom_minimum_size = Vector2(w - 20.0, 0.0 if collapsed else minf(need, maxh - 56.0))
	_scroll.visible = not collapsed
	custom_minimum_size.x = w
	size = Vector2(w, 0)
	position = Vector2(12.0, top)

## Rebuild from the engine's levelInfo (on every change).
func refresh() -> void:
	if app == null or not app.started: return
	var li := Notebook.info(app)
	var id := str(li.get("id", ""))
	if id != _level: _level = id; focus_id = ""; _sig = ""
	lines = li.get("buildGuide", []) if li.get("buildGuide") is Array else []
	var sig := JSON.stringify(lines) + "|" + focus_id + "|" + str(collapsed)
	if sig != _sig:
		_sig = sig
		for c in _list.get_children(): _list.remove_child(c); c.queue_free()
		var n_done := 0
		for l in lines: if bool(l.get("done", false)): n_done += 1
		_head.text = "%s  %d / %d  %s" % [PaperStrings.t("BC_TITLE"), n_done, lines.size(), "▸" if collapsed else "▾"]
		fill_rows(app, _list, lines, func(sid: String) -> void: activate(sid), 15, focus_id)
		var nxt := _list.find_children("Step_*", "Row", true, false).filter(func(r): return r.next)
		if not nxt.is_empty() and not collapsed: _scroll.ensure_control_visible.call_deferred(nxt[0])
	_guide()

## The rows, shared with the notebook page. `on_pick(id)` is called with the line id.
static func fill_rows(app, parent: Control, ls: Array, on_pick: Callable, size := 15, focus := "") -> void:
	for l in ls:
		var done := bool(l.get("done", false))
		var r := Row.new(); r.name = "Step_" + str(l.id); r.id = str(l.id); r.done = done; r.next = bool(l.get("next", false)); r.focused = (focus == str(l.id) and not done)
		var sb := StyleBoxFlat.new(); sb.bg_color = Color(EqTheme.TEAL, 0.16) if (r.next or r.focused) else Color(0, 0, 0, 0); sb.content_margin_left = 8; sb.content_margin_right = 4; sb.content_margin_top = 2; sb.content_margin_bottom = 2
		r.add_theme_stylebox_override("panel", sb)
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 8); hb.mouse_filter = Control.MOUSE_FILTER_IGNORE; r.add_child(hb)
		var tb := Notebook.TickBox.new(); tb.met = done; tb.custom_minimum_size = Vector2(22, 22); hb.add_child(tb)
		var col := EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.5) if done else EqTheme.INK
		var lb := EqTheme.label(str(l.text), size, col, "semi" if (r.next or r.focused) else "sans"); lb.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; lb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; lb.mouse_filter = Control.MOUSE_FILTER_IGNORE
		lb.custom_minimum_size = Vector2(120, 0); hb.add_child(lb)
		r.picked.connect(func(sid: String): on_pick.call(sid))
		parent.add_child(r)

func line_of(id: String) -> Dictionary:
	for l in lines: if str(l.id) == id: return l
	return {}

func target() -> Dictionary:
	var f := line_of(focus_id)
	if not f.is_empty() and not bool(f.get("done", false)): return f
	for l in lines: if bool(l.get("next", false)): return l
	return {}

## What the guide points at: pipe -> its two ports pulse; part -> the rack tile pulses and the suggested footprint glows; else nothing.
func _guide() -> void:
	var w = app.world
	if w == null or not w.has_method("guide_ports"): return
	var rack: Node = app.root.find_child("PartsRack", true, false)
	var tg: Dictionary = target() if (visible or not lines.is_empty()) and str(Notebook.info(app).get("phase", "design")) == "design" and app.modal() == null else {}
	var prev_auto := _auto
	_auto = str(tg.get("id", ""))
	# F14 (round 7 blocker): when a part row has just been done and the next row is another part, put that part in hand at once, so one click on the
	# plot places it (testers clicked the plot and nothing happened: the tile only pulsed). Only on an advance, never on opening a level.
	if _auto != prev_auto and prev_auto != "" and str(tg.get("kind", "")) == "place" and bool(line_of(prev_auto).get("done", false)):
		_auto_arm.call_deferred(str(tg.get("id", "")))   # deferred: the placement that ticked the row is still in hand until its handler drops it
	# F25: the very first part row of a level is put in hand too (once per level, while nothing is ticked): one click on the plot places it, which saves the arming click
	if _auto != "" and _armed_level != _level and str(tg.get("kind", "")) == "place" and not lines.any(func(l): return bool(l.get("done", false))):
		_armed_level = _level
		_auto_arm.call_deferred(_auto)
	var ports: Array = []; var tile := ""; var sug := Vector2i(-1, -1); var stype := ""
	if not tg.is_empty():
		match str(tg.kind):
			"pipe":
				var a: Dictionary = tg.get("from", {}); var b: Dictionary = tg.get("to", {})
				if a.get("unit") != null and b.get("unit") != null:
					ports = [{"unit": str(a.unit), "port": str(a.port), "inlet": false}, {"unit": str(b.unit), "port": str(b.port), "inlet": true}]
			"place":
				tile = str(tg.get("type", ""))
				if tg.get("at") is Array:
					stype = tile; sug = Vector2i(int(tg.at[0]), int(tg.at[1]))
	if ports.is_empty(): w.clear_guide_ports()
	else: w.guide_ports(ports)
	if sug.x >= 0: w.suggest_place(stype, sug)
	else: w.clear_suggest()
	if rack != null and rack.has_method("set_guide"): rack.call("set_guide", tile)

func _auto_arm(id: String) -> void:
	var l := line_of(id)
	var w = app.world if app != null else null
	if w == null or l.is_empty() or bool(l.get("done", false)) or str(w.get("placing")) != "" or _auto != id: return
	w.begin_place(str(l.get("type", "")))
	if l.get("at") is Array: w._cursor = Vector2i(int(l.at[0]), int(l.at[1])); w._update_ghost()

## A click on a line (panel or notebook): part -> in hand with its spot lit; pipe -> its ports pulse; setting -> the unit's plate opens.
func activate(id: String) -> void:
	var l := line_of(id)
	if l.is_empty() or app == null or app.world == null: return
	focus_id = id; _sig = ""
	var w = app.world
	if bool(l.get("done", false)) and l.get("unit") != null and str(l.kind) == "place":
		w.cancel_place(); w.select(str(l.unit)); refresh(); return
	match str(l.kind):
		"place":
			w.cancel_place(); w.begin_place(str(l.type))
			if l.get("at") is Array:
				w._cursor = Vector2i(int(l.at[0]), int(l.at[1])); w._update_ghost()
			if CbLayout.phone and app.get("chrome") != null: app.chrome.close_rack()
		"pipe":
			w.cancel_place()
			var a: Dictionary = l.get("from", {}); var b: Dictionary = l.get("to", {})
			if a.get("unit") == null or b.get("unit") == null: app.toast(PaperStrings.t("BC_NEED"), "info")
		_:
			w.cancel_place()
			if l.get("unit") != null:
				w.select(str(l.unit)); Faceplate.open(app, str(l.unit))
			else: app.toast(PaperStrings.t("BC_NEED"), "info")
	refresh()
