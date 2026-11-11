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
	var bottom_gap := (250.0 if not portrait else 230.0) - (90.0 if board else 0.0)
	if kind == "control" and app.chrome != null: bottom_gap = maxf(bottom_gap, app.chrome.console_height() + 14.0)   # never sit on the console: the DESIGN key and the Commission dial live in it
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

## A level change: the last level's panel (trace, dials, cards) is thrown away and rebuilt from the new engine view.
## The plant frames itself in the space the control desk leaves, so the desk never sits on the plant (once per level: the camera is not moved by opening panels).
func _frame_world() -> void:
	if app == null or app.world == null or kind != "control" or not ("board_cover" in app.world): return
	var want: float = size.x + 14.0
	if absf(float(app.world.board_cover) - want) > 4.0:
		app.world.board_cover = want
		if app.world.has_method("_apply"): app.world.call("_apply")

func reset() -> void:
	if app != null and app.world != null and "board_cover" in app.world and kind == "control": app.world.board_cover = 0.0
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
			"hazop", "sop", "permit", "reconcile", "gantt", "career":
				match k:
					"hazop": panel = Ch9Hazop.new()
					"sop", "permit": panel = Ch9Cards.new()
					"reconcile": panel = Ch9Recon.new()
					"career": var cb := CareerBoard.new(); cb.app_ref = app; panel = cb
					_: panel = Ch9Gantt.new()
				add_child(panel); (panel as Ch9Board).act.connect(_on_act)
				layout()
			_: kind = ""; visible = false; return
	if app.bay != null: app.bay.visible = false
	visible = true; panel.visible = true
	_hide_rack(kind != "control")
	_frame_world()
	var li1 = PaperStrings.q(app, "levelInfo")
	var sig := JSON.stringify(d) + "|" + (str(li1.get("phase", "")) if li1 is Dictionary else "")   # the phase locks the dials and shows Stop: a phase change is a redraw
	if sig == _sig: return
	_sig = sig
	panel.set_view(d)
	if not (panel is Ch9Board): panel.reset_size()

var _rack_hidden := false
## Board levels (HAZOP, SOP, permit, reconcile, planning, CAREER) have no plant to build: the parts rack goes away while they are on, and returns after.
func _hide_rack(on: bool) -> void:
	if app == null or app.chrome == null: return
	var c = app.chrome
	if on:
		c.rack_open = false
		if c.rack_wrap != null: c.rack_wrap.visible = false
		if c.parts_btn != null: c.parts_btn.visible = false
		if c._rack_float != null: c._rack_float.visible = false
		_rack_hidden = true
	elif _rack_hidden:
		_rack_hidden = false; if c.rack_wrap != null: c.rack_wrap.visible = true
		c.layout()

func _on_act(name: String, args: Array) -> void:
	var r: Dictionary = app.b.act("levelAct", [name] + args)
	if not bool(r.get("ok", false)) and r.has("message"): app.toast(str(r.get("message", "")), "warn")
	elif bool(r.get("ok", false)): BuildKeeper.note_act(name, args)
	refresh(true)

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
