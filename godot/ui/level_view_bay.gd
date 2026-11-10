class_name LevelViewBay
extends Control
## Hosts the level-local widget for the current level's `levelView()` (kind 'control' -> ControlPanel; later 'hazop', 'sop', ...). Docked where the instrument
## bay lives; when a level has a view this bay wins and the instrument bay hides. `refresh()` is called from main.game_on_changed (throttled ~8/s).
var app: CbApp
var kind := ""
var panel: ControlPanel
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
	var k := CbLayout.kind
	var tap := maxf(CbLayout.tap(), 44.0)
	var vw: float = app.vw(); var vh: float = app.vs_h()
	var portrait := vw < vh
	var top := 10.0 + tap + 8.0
	var w := minf(vw - 20.0, 620.0 if k == "desktop" else (560.0 if k == "handheld" else (640.0 if not portrait else vw - 20.0)))
	var bottom_gap := 250.0 if not portrait else 230.0
	var h := vh - top - bottom_gap
	set_anchors_preset(Control.PRESET_TOP_RIGHT); grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offset_right = -10.0; offset_left = -10.0 - w; offset_top = top; offset_bottom = top + h
	custom_minimum_size = Vector2(w, 0); size = Vector2(w, h)
	if panel != null:
		panel.fit(h, w, portrait)
		panel.custom_minimum_size = Vector2(w, 0); panel.size = Vector2(w, 0)
		panel.position = Vector2.ZERO

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
		kind = ""; visible = false
		if panel != null: panel.visible = false
		return
	var k := str(d.kind)
	if k != kind:
		if panel != null: panel.queue_free(); panel = null
		kind = k
		match k:
			"control":
				panel = ControlPanel.new(); panel.app_ref = app; add_child(panel)
				panel.dial_set.connect(_on_dial)
				layout()
			_: kind = ""; visible = false; return
	if app.bay != null: app.bay.visible = false
	visible = true; panel.visible = true
	var sig := JSON.stringify(d)
	if sig == _sig: return
	_sig = sig
	panel.set_view(d)
	panel.reset_size()

func _on_dial(key: String, value: float) -> void:
	var r: Dictionary = app.b.act("levelAct", ["setDial", key, value])
	if not bool(r.get("ok", false)) and r.has("message"): app.toast(str(r.get("message", "")), "warn")
	refresh(true)

func _process(_dt: float) -> void:
	if _dirty: refresh()
