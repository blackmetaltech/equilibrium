class_name LevelViewBay
extends Control
## Hosts the level-local widget for the current level's `levelView()` (kind 'control' -> ControlPanel; later 'hazop', 'sop', ...). Docked where the instrument
## bay lives; when a level has a view this bay wins and the instrument bay hides. `refresh()` is called from main.game_on_changed (throttled ~8/s).
var app: CbApp
var kind := ""
var panel: Control
var _last_ms := 0
var _dirty := false
var _sig := ""
var _stub = null            ## QA / tests: a view dictionary used instead of the engine's
const OP_HEIGHTS := {}

func build() -> void:
	name = "LevelViewBay"; mouse_filter = Control.MOUSE_FILTER_IGNORE; visible = false
	layout()

func active() -> bool: return visible and kind != ""

func layout() -> void:
	if app == null: return
	if kind != "" and kind != "control": _hide_rack(true)
	var k := CbLayout.kind
	var tap := maxf(CbLayout.tap(), 44.0)
	var vw: float = app.vw(); var vh: float = app.vs_h()
	var portrait := vw < vh
	var top := 10.0 + tap + 8.0
	var board := kind != "" and kind != "control"
	var w := minf(vw - 20.0, 620.0 if k == "desktop" else (560.0 if k == "handheld" else (640.0 if not portrait else vw - 20.0)))
	if board: w = minf(vw - 20.0, 800.0 if not portrait else vw - 20.0)
	var pumps := kind == "pumps"
	if pumps: w = minf(vw - 20.0, (700.0 if k == "desktop" else 500.0) if not portrait else vw - 20.0)   # F33: the pump-curve plotter; the pump house keeps the rest of the window
	var bottom_gap := (250.0 if not portrait else 230.0) - (90.0 if board else 0.0)
	if (kind == "control" or pumps) and app.chrome != null: bottom_gap = maxf(bottom_gap if not pumps else 0.0, app.chrome.console_height() + 14.0)   # never sit on the console: the DESIGN key and the Commission dial live in it
	var st_h := _place_station()
	if pumps and portrait: bottom_gap += st_h + 10.0   # a portrait phone: the local panel runs under the plotter
	var h := vh - top - bottom_gap
	set_anchors_preset(Control.PRESET_TOP_RIGHT); grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offset_right = -10.0; offset_left = -10.0 - w; offset_top = top; offset_bottom = top + h
	custom_minimum_size = Vector2(w, 0); size = Vector2(w, h)
	if panel is Ch9Board:
		(panel as Ch9Board).fit(w, h, portrait or w < 620.0)
	elif panel != null:
		panel.fit(h, w, portrait)
		panel.custom_minimum_size = Vector2(w, 0); panel.size = Vector2(w, 0)
		panel.position = Vector2.ZERO

## F33: L39's local panel of selectors at the bottom left, standing on the console; the camera frames the pump house above it. Returns its height (0 when there is none).
func _place_station() -> float:
	if kind != "pumps" or not (panel is HydBoard) or (panel as HydBoard).station == null or app.chrome == null: return 0.0
	var st: HydStation = (panel as HydBoard).station
	var ms := st.get_combined_minimum_size()
	var st_w := minf(ms.x, app.vw() - 24.0)
	var cb: float = app.chrome.console_height()
	st.set_anchors_preset(Control.PRESET_BOTTOM_LEFT); st.grow_vertical = Control.GROW_DIRECTION_BEGIN
	st.offset_left = 12.0; st.offset_right = 12.0 + st_w; st.offset_bottom = -(cb + 8.0); st.offset_top = -(cb + 8.0) - ms.y
	if absf(float(app.chrome.extra_cover) - (ms.y + 8.0)) > 0.5: app.chrome.extra_cover = ms.y + 8.0; app.chrome.call_deferred("_notify_height")
	return ms.y

## A level change: the last level's panel (trace, dials, cards) is thrown away and rebuilt from the new engine view.
## The plant frames itself in the space the control desk leaves, so the desk never sits on the plant (once per level: the camera is not moved by opening panels).
func _frame_world() -> void:
	if app == null or app.world == null or (kind != "control" and kind != "pumps") or not ("board_cover" in app.world): return
	var want: float = size.x + 14.0
	if absf(float(app.world.board_cover) - want) > 4.0:
		app.world.board_cover = want
		if app.world.has_method("_apply"): app.world.call("_apply")

func reset() -> void:
	if slip_panel != null: slip_panel.queue_free(); slip_panel = null; _slip_sig = ""
	if app != null and app.world != null and "board_cover" in app.world and kind == "control": app.world.board_cover = 0.0
	if app != null and app.chrome != null and float(app.chrome.extra_cover) > 0.0: app.chrome.extra_cover = 0.0; app.chrome.call_deferred("_notify_height")
	if not BuildKeeper.restarting: BuildKeeper.clear_log()
	_sig = ""
	if panel != null: panel.queue_free(); panel = null
	kind = ""; visible = false

func pin(d) -> void:
	_stub = d; _sig = ""; refresh(true)

func _query():
	if _stub != null: return _stub
	if not (app.b.init_data.get("queries", []) as Array).has("levelView"): return null
	return app.b.q("levelView")

func refresh(force := false) -> void:
	if app == null or not app.started or not is_inside_tree(): return
	var chrome_on: bool = app.chrome != null and app.chrome.visible
	if not chrome_on: visible = false; return
	var now := Time.get_ticks_msec()
	if not force and now - _last_ms < 120: _dirty = true; return
	_last_ms = now; _dirty = false
	var d = _query()
	_sync_slip(d)
	if not (d is Dictionary) or str(d.get("kind", "")) == "":
		kind = ""; visible = false; _hide_rack(false)
		if panel != null: panel.visible = false
		return
	var k := str(d.kind)
	if k != kind:
		if panel != null: panel.queue_free(); panel = null
		kind = k
		match k:
			"control":
				var cp := ControlPanel.new(); cp.app_ref = app; panel = cp; add_child(cp)
				cp.dial_set.connect(_on_dial)
				layout()
			"hazop", "sop", "permit", "reconcile", "gantt", "career", "pumps":
				match k:
					"hazop": panel = Ch9Hazop.new()
					"sop", "permit": panel = Ch9Cards.new()
					"reconcile": panel = Ch9Recon.new()
					"career": var cb := CareerBoard.new(); cb.app_ref = app; panel = cb
					"pumps": panel = HydBoard.new()
					_: panel = Ch9Gantt.new()
				add_child(panel); (panel as Ch9Board).act.connect(_on_act)
				if panel is HydBoard and app.chrome != null:   # F33: the local panel of selectors stands at the foot of the pump house; a click on a pipe puts its selector in hand
					app.chrome.add_child((panel as HydBoard).station)
					if app.world != null and app.world.has_signal("deco_clicked") and not app.world.deco_clicked.is_connected(_on_deco): app.world.deco_clicked.connect(_on_deco)
				layout()
			_: kind = ""; visible = false; return
	if app.bay != null: app.bay.visible = false
	visible = true; panel.visible = true
	_hide_rack(kind != "control")
	_frame_world()
	if k == "pumps" and app.world != null and app.world.has_method("deco") and app.world.deco() != null and app.world.deco().hyd != null: app.world.deco().hyd.set_view(d)   # the pump house in the plant follows every pick
	var li1 = PaperStrings.q(app, "levelInfo")
	var sig := JSON.stringify(d) + "|" + (str(li1.get("phase", "")) if li1 is Dictionary else "")   # the phase locks the dials and shows Stop: a phase change is a redraw
	if sig == _sig: return
	_sig = sig
	panel.set_view(d)
	if not (panel is Ch9Board): panel.reset_size()
	if panel is HydBoard: _place_station()

## F33: an incident level (its view carries `slip`) shows the three answers side by side once a commission has measured your fix: a green-bar slip under the instrument bay.
var slip_panel: CompareSlip
var _slip_sig := ""
func _sync_slip(d) -> void:
	var want: bool = d is Dictionary and str(d.get("kind", "")) == "" and d.get("slip") is Dictionary and (d.slip as Dictionary).get("fix") is Dictionary
	if not want:
		if slip_panel != null:
			slip_panel.queue_free(); slip_panel = null; _slip_sig = ""
			if app.world != null and "board_cover" in app.world and kind == "": app.world.board_cover = 0.0
		return
	var sig := JSON.stringify(d.slip)
	if slip_panel == null:
		slip_panel = CompareSlip.new(); slip_panel.name = "PlantSlip"; app.chrome.add_child(slip_panel)
	if sig != _slip_sig:
		_slip_sig = sig; slip_panel.build(d.slip)
		if app.world != null and "board_cover" in app.world:   # the plant frames itself left of the slip (once per new slip; a moved camera stays where the player put it)
			app.world.board_cover = slip_panel.get_combined_minimum_size().x + 14.0
			if app.world.has_method("reframe_if_untouched"): app.world.call_deferred("reframe_if_untouched")
	_place_slip()

func _place_slip() -> void:
	if slip_panel == null or app == null: return
	var tap := maxf(CbLayout.tap(), 44.0)
	var top := 10.0 + tap + 8.0
	if app.bay != null and app.bay.visible: top = app.bay.offset_bottom + 8.0
	var w := clampf(slip_panel.get_combined_minimum_size().x, 300.0, app.vw() - 20.0)
	slip_panel.set_anchors_preset(Control.PRESET_TOP_RIGHT); slip_panel.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	slip_panel.offset_right = -10.0; slip_panel.offset_left = -10.0 - w; slip_panel.offset_top = top; slip_panel.offset_bottom = top + slip_panel.get_combined_minimum_size().y

var _rack_hidden := false
## Board levels (HAZOP, SOP, permit, reconcile, planning, CAREER) have no plant to build: the parts rack goes away while they are on, and returns after.
func _hide_rack(on: bool) -> void:
	if app == null or app.chrome == null: return
	var c = app.chrome
	if on:
		var was: bool = c.rack_hold
		c.rack_open = false; c.rack_hold = true   # F33: held, so a later console layout() does not bring the tray back over the pump house
		if c.rack_wrap != null: c.rack_wrap.visible = false
		if c.parts_btn != null: c.parts_btn.visible = false
		if c._rack_float != null: c._rack_float.visible = false
		_rack_hidden = true
		if not was: c.layout()
	elif _rack_hidden:
		_rack_hidden = false; c.rack_hold = false
		if c.rack_wrap != null: c.rack_wrap.visible = true   # (the phone drawer keeps its own visibility; the desktop dock is placed again by layout)
		c.layout()

func _on_act(name: String, args: Array) -> void:
	var r: Dictionary = app.b.act("levelAct", [name] + args)
	if not bool(r.get("ok", false)) and r.has("message"): app.toast(str(r.get("message", "")), "warn")
	elif bool(r.get("ok", false)): BuildKeeper.note_act(name, args)
	refresh(true)

func _on_deco(what: String) -> void:
	if panel is HydBoard and visible: (panel as HydBoard).take(what)

func _on_dial(key: String, value: float) -> void:
	var li0 = PaperStrings.q(app, "levelInfo")
	var was := str(li0.get("phase", "design")) if li0 is Dictionary else "design"
	var r: Dictionary = app.b.act("levelAct", ["setDial", key, value])
	if bool(r.get("ok", false)): BuildKeeper.note_act("setDial", [key, value])
	else: _sig = ""   # refused: the knob goes back to the engine's value
	if not bool(r.get("ok", false)) and r.has("message"): app.toast(str(r.get("message", "")), "warn")
	elif was != "design" and app.chrome != null: app.chrome.intercom.say("MARA", PaperStrings.t("IC_DIAL_RESET"), "info")   # a dial edit clears the run: say so, never silently
	refresh(true)

func _process(_dt: float) -> void:
	if _dirty: refresh()
