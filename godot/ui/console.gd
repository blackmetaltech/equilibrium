class_name EqConsole
extends Control
## The bottom enamel console (UI.md "Screen anatomy"): intercom | annunciator | chart recorder | key switch + speed on the top row, the parts rack below
## it (desktop, handheld) or as a strip that slides up from the console (phone). Also owns the notebook-tab slot top-left and the small gear top-right.
## Layout per device class (UI.md 11): `layout()`. Everything shown comes from the engine (levelInfo, runs); `refresh()` runs on every engine change.
##
## Slots for the other worker:  `rack_slot` (HBox, parts rack tiles)  and  `hud_top_left` (Control, notebook tab).  Signal `notebook_requested` (pause menu).
signal notebook_requested

var app: CbApp
var panel: PanelContainer
var top_row: HBoxContainer
var intercom: Intercom
var annunciator: Annunciator
var recorder: ChartRecorder
var keys: KeySwitch
var rack_slot: HBoxContainer      ## E2b: the parts rack fills this (tiles, Dymo names, price)
var hud_top_left: Control         ## E2b: the notebook tab goes here
var gear: Button
var rack_wrap: PanelContainer
var rack_scroll: ScrollContainer
var rack_open := false            ## phone: the rack strip is up
var parts_btn: Button
var _vbox: VBoxContainer
var _on := false
var _level := ""
var _pred_level := ""          ## the last real level id seen: the predict-first memory is dropped only when a different level starts
var _coach_id := ""
var _kind := "desktop"
var _rack_float: PanelContainer
var phase := "design"
var qa_li := {}                   ## QA / tests: a canned levelInfo that replaces the engine's (see qa())
var qa_runs: Array = []
const SPEEDS := [0, 1, 4, 16]

func _init() -> void:
	EqStrings.load_strings()
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)

func build() -> void:
	# top-left notebook slot, top-right gear
	hud_top_left = Control.new(); hud_top_left.name = "HudTopLeft"; hud_top_left.mouse_filter = Control.MOUSE_FILTER_IGNORE
	hud_top_left.set_anchors_preset(Control.PRESET_TOP_LEFT); hud_top_left.offset_left = 12; hud_top_left.offset_top = 10; hud_top_left.custom_minimum_size = Vector2(380, 46); hud_top_left.size = Vector2(380, 46)
	add_child(hud_top_left)
	gear = GearButton.new(); gear.name = "Gear"; gear.tooltip_text = EqStrings.T("GEAR_TIP"); gear.focus_mode = CbKit.focus_mode()
	gear.add_theme_font_size_override("font_size", EqTheme.fs(22))
	gear.add_theme_stylebox_override("normal", _gear_sb(0.0)); gear.add_theme_stylebox_override("hover", _gear_sb(0.1)); gear.add_theme_stylebox_override("pressed", _gear_sb(0.2)); gear.add_theme_stylebox_override("focus", _gear_sb(0.1, true))
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: gear.add_theme_color_override(c, EqTheme.TEXT)
	gear.set_anchors_preset(Control.PRESET_TOP_RIGHT); gear.grow_horizontal = Control.GROW_DIRECTION_BEGIN
	gear.pressed.connect(func(): app.toggle_menu())
	add_child(gear)
	# the console panel
	panel = PanelContainer.new(); panel.name = "Console"; panel.mouse_filter = Control.MOUSE_FILTER_STOP
	panel.set_anchors_preset(Control.PRESET_BOTTOM_WIDE); panel.grow_vertical = Control.GROW_DIRECTION_BEGIN
	var sb := EqTheme.enamel_sb(0, 10.0); sb.set_corner_radius_all(0); sb.border_width_top = 3; sb.shadow_size = 14; sb.shadow_offset = Vector2(0, -3)
	sb.content_margin_top = 8; sb.content_margin_bottom = 8; sb.content_margin_left = 12; sb.content_margin_right = 12
	panel.add_theme_stylebox_override("panel", sb)
	add_child(panel)
	_vbox = VBoxContainer.new(); _vbox.add_theme_constant_override("separation", 8); _vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE; panel.add_child(_vbox)
	top_row = HBoxContainer.new(); top_row.name = "TopRow"; top_row.add_theme_constant_override("separation", 10); top_row.mouse_filter = Control.MOUSE_FILTER_IGNORE; _vbox.add_child(top_row)
	intercom = Intercom.new(); intercom.app = app; intercom.name = "Intercom"; top_row.add_child(intercom)
	annunciator = Annunciator.new(); annunciator.app = app; annunciator.name = "Annunciator"; top_row.add_child(annunciator)
	recorder = ChartRecorder.new(); recorder.name = "Recorder"; recorder.size_flags_horizontal = Control.SIZE_EXPAND_FILL; top_row.add_child(recorder)
	recorder.clicked.connect(open_recorder)
	keys = KeySwitch.new(); keys.app = app; keys.name = "Keys"; top_row.add_child(keys)
	keys.step_requested.connect(turn_key); keys.goto_requested.connect(goto_pos); keys.speed_chosen.connect(choose_speed)
	intercom.got_it.connect(func(): if app.coach != null: app.coach.advance())
	# the rack: its own enamel strip (second row; on a phone it floats above the console on demand)
	rack_wrap = PanelContainer.new(); rack_wrap.name = "RackWrap"; rack_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var rsb := EqTheme.enamel_sb(4, 6.0).duplicate() as StyleBoxFlat; rsb.bg_color = EqTheme.ENAMEL_LO; rsb.shadow_size = 0; rsb.border_color = Color("#12211F"); rsb.set_border_width_all(2)
	rack_wrap.add_theme_stylebox_override("panel", rsb)
	rack_scroll = ScrollContainer.new(); rack_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO; rack_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	rack_scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rack_scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; rack_wrap.add_child(rack_scroll)
	rack_slot = HBoxContainer.new(); rack_slot.name = "RackSlot"; rack_slot.add_theme_constant_override("separation", 8); rack_slot.size_flags_vertical = Control.SIZE_EXPAND_FILL; rack_scroll.add_child(rack_slot)
	_vbox.add_child(rack_wrap)
	_rack_float = PanelContainer.new(); _rack_float.name = "RackFloat"; _rack_float.mouse_filter = Control.MOUSE_FILTER_STOP; _rack_float.visible = false
	_rack_float.add_theme_stylebox_override("panel", sb); add_child(_rack_float)
	parts_btn = Button.new(); parts_btn.name = "PartsTab"; parts_btn.text = EqStrings.T("PARTS_TAB"); parts_btn.tooltip_text = EqStrings.T("PARTS_TIP"); parts_btn.focus_mode = CbKit.focus_mode()
	parts_btn.add_theme_font_override("font", EqTheme.font("semi")); parts_btn.add_theme_font_size_override("font_size", EqTheme.fs(15))
	for st in ["normal", "hover", "pressed", "focus"]: parts_btn.add_theme_stylebox_override(st, EqTheme.key_sb(false, "hover" if st != "normal" else "normal"))
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: parts_btn.add_theme_color_override(c, EqTheme.INK)
	parts_btn.pressed.connect(toggle_rack); parts_btn.visible = false; add_child(parts_btn)
	layout()

func _gear_sb(a: float, ring := false) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = Color(EqTheme.ENAMEL, 0.55 + a); s.set_corner_radius_all(22)
	s.border_color = EqTheme.TEAL if ring else EqTheme.ENAMEL_HI; s.set_border_width_all(3 if ring else 1)
	s.content_margin_left = 6; s.content_margin_right = 6; s.content_margin_top = 2; s.content_margin_bottom = 2
	return s

# ---- layout ----------------------------------------------------------------------------------------------------------------------------------
## Desktop / handheld / phone (UI.md 11). Heights and widths are logical px (the shell scales the window to the class).
func layout() -> void:
	if panel == null: return
	_kind = CbLayout.kind
	var vw := app.vw() if app != null else 1920.0
	var phone := _kind == "phone"; var hand := _kind == "handheld"
	var tap := maxf(CbLayout.tap(), 44.0)
	gear.custom_minimum_size = Vector2(tap, tap); gear.offset_left = -tap - 10.0; gear.offset_top = 10.0; gear.offset_right = -10.0; gear.offset_bottom = 10.0 + tap
	var row_h := 108.0 if _kind == "desktop" else 98.0
	top_row.custom_minimum_size.y = row_h
	intercom.custom_minimum_size = Vector2(500.0 if _kind == "desktop" else (330.0 if hand else 360.0), row_h)
	intercom.set_max_lines(3 if (_kind == "desktop" or phone) else 2)   # a phone shows three lines too; a tap opens the whole log
	annunciator.max_windows = 4 if phone else 8
	annunciator.custom_minimum_size = Vector2(430.0 if _kind == "desktop" else (300.0 if hand else 230.0), row_h)
	if phone and annunciator.wins.size() > 4: annunciator.wins = annunciator.wins.slice(0, 4)
	recorder.custom_minimum_size = Vector2(220.0 if _kind == "desktop" else (200.0 if hand else 190.0), row_h)
	keys.set_compact(_kind != "desktop")
	if phone:
		# the parts drawer: a sheet above its own button holding the tiles in a wrapping, finger-scrolled grid
		if rack_wrap.get_parent() != _rack_float: rack_wrap.reparent(_rack_float, false)
		var dw := minf(vw * 0.62, 700.0); var dh := 262.0
		var btn_h := maxf(tap, PHONE_TAP)
		_rack_float.custom_minimum_size = Vector2(dw, dh)
		rack_wrap.custom_minimum_size = Vector2(dw - 24.0, dh - 16.0); rack_wrap.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rack_wrap.size_flags_vertical = Control.SIZE_EXPAND_FILL
		rack_wrap.mouse_filter = Control.MOUSE_FILTER_PASS
		rack_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; rack_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_SHOW_NEVER
		rack_slot.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_rack_flow(true)
		parts_btn.visible = _on; parts_btn.custom_minimum_size = Vector2(150.0, btn_h)
		_rack_float.visible = rack_open and _on
		for a in ["anchor_left", "anchor_right", "anchor_top", "anchor_bottom"]: _rack_float.set(a, 0.0 if a.begins_with("anchor_l") or a.begins_with("anchor_r") else 1.0)
		var bt := -(row_h + 22.0 + btn_h + 6.0)
		_rack_float.offset_left = 12.0; _rack_float.offset_right = 12.0 + dw; _rack_float.offset_bottom = bt; _rack_float.offset_top = bt - dh
		_rack_float.grow_vertical = Control.GROW_DIRECTION_BEGIN
		parts_btn.anchor_left = 0.0; parts_btn.anchor_right = 0.0; parts_btn.anchor_top = 1.0; parts_btn.anchor_bottom = 1.0
		parts_btn.offset_left = 12.0; parts_btn.offset_right = 12.0 + 150.0; parts_btn.offset_bottom = -(row_h + 22.0); parts_btn.offset_top = -(row_h + 22.0 + btn_h)
		parts_btn.text = EqStrings.T("PARTS_TAB") + (" ▾" if rack_open else " ▴")
	else:
		if rack_wrap.get_parent() != _vbox: rack_wrap.reparent(_vbox, false)
		rack_wrap.custom_minimum_size = Vector2(0, 88.0 if _kind == "desktop" else 76.0)
		rack_wrap.size_flags_horizontal = Control.SIZE_FILL; rack_wrap.size_flags_vertical = Control.SIZE_FILL; rack_wrap.mouse_filter = Control.MOUSE_FILTER_IGNORE
		rack_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO; rack_scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
		_rack_flow(false)
		rack_wrap.visible = true; parts_btn.visible = false; _rack_float.visible = false
	panel.offset_top = 0; panel.offset_bottom = 0; panel.offset_left = 0; panel.offset_right = 0
	hud_top_left.offset_left = 12.0; hud_top_left.offset_top = 10.0
	hud_top_left.size = Vector2(minf(420.0, vw - tap - 40.0), tap)
	call_deferred("_notify_height")

const PHONE_TAP := 62.4   ## 48 dp on the Pixel 9a (2.6 px/dp, the phone layout draws at 0.5 physical px per logical px)

## The rack's tiles wrap into rows in the phone drawer (scrolled by finger), and run in one strip elsewhere.
func _rack_flow(on: bool) -> void:
	if rack == null and rack_slot != null:
		for ch in rack_slot.get_children(): if ch.has_method("set_flow"): rack = ch
	if rack != null and rack.has_method("set_flow"): rack.call("set_flow", on)

## A tile was chosen on a phone: the drawer folds away so the ghost and the plant are in view.
func close_rack() -> void:
	if rack_open: rack_open = false; layout()

func _notify_height() -> void:
	if app != null and app.world != null and app.world.has_method("set_cover_bottom"): app.world.call("set_cover_bottom", console_height())

## Pixels the console covers at the bottom (the world may centre itself above them).
func console_height() -> float: return panel.size.y if panel != null and _on else 0.0

func toggle_rack() -> void:
	rack_open = not rack_open; layout()

func set_chrome_visible(v: bool) -> void:
	_on = v; visible = v
	if v: refresh()
	layout()

# ---- engine state -> widgets ----------------------------------------------------------------------------------------------------------------
func _has_query(n: String) -> bool: return app != null and (app.b.init_data.get("queries", []) as Array).has(n)

func level_info() -> Dictionary:
	if not qa_li.is_empty(): return qa_li
	if app == null or not app.started or not _has_query("levelInfo"): return {}
	var li = app.b.q("levelInfo")
	if li is Dictionary and li.get("active", true) != false and li.has("id"): return li
	return {}

func engine_phase() -> String:
	var li := level_info()
	if not li.is_empty() and li.has("phase"): return str(li.phase)
	var p = app.b.q("plant") if app != null and app.started else null
	return str(p.get("phase", "design")) if p is Dictionary else "design"

func refresh() -> void:
	if app == null or not app.started or intercom == null: return
	var li := level_info()
	var id := str(li.get("id", "")) if not li.is_empty() else ""
	if id != _level:
		_level = id; if id != "" and id != _pred_level: _pred_level = id; BuildKeeper.predict_done.erase(id)
		intercom.clear(); _coach_id = "<unset>"; _explained_runs = -1; _shift_seen = false; _outcome_said = false; _bank_dup = ""; _fail_sig = ""; _last_fail_msg = ""; _fail_text = ""; _notice_sig = ""
		_close_paper()
		if app.bay != null: app.bay.reset()
		if app.lvbay != null: app.lvbay.reset()
	_gl = str(app.b.g.get("level", ""))
	phase = engine_phase()
	# a shift that is running (a level that opens mid-shift, or the key just turned) starts at 1x: nothing moves at pause and the coach seems stuck
	var running := phase == "shift" or phase == "firstrun"
	if running and not _shift_seen:
		_shift_seen = true
		choose_speed(_rec_idx())   # the speed dial opens at the level's recommended speed (levelInfo.recommendedSpeed), not at whatever the last level left
	elif not running: _shift_seen = false
	annunciator.set_windows(li.get("annunciators", []) if li.get("annunciators") is Array else [])
	var runs: Array = qa_runs if not qa_li.is_empty() else (app.b.q("runs") if app.b.q("runs") is Array else [])
	recorder.feed(li, runs, int(app.b.g.get("tick", 0)))
	_sync_key()
	_poll_coach(li)
	if not li.is_empty() and intercom.lines.is_empty() and qa_li.is_empty():   # no coach (Engineer mode): the intercom is never blank at the start of a job
		var notes: Array = li.get("note", []) if li.get("note") is Array else []
		intercom.say(str(li.get("setter", "mara")), str(notes[0]) if not notes.is_empty() else EqStrings.T("IC_IDLE"), "info")
	_explain_run(li, runs)
	_reconcile(li)
	_stale_lines(li)
	_bank_hint(li)
	_failure()
	_notice(li)

## levelInfo.notice (NEEDS_UNIT: the plant cannot be read without a unit type): one intercom line per notice and a chevron on that unit's parts-rack tile.
var _notice_sig := ""
func _notice(li: Dictionary) -> void:
	var nt = li.get("notice")
	var unit := ""; var sig := ""
	if nt is Dictionary:
		unit = str(nt.get("unit", "")) if str(nt.get("code", "")) == "NEEDS_UNIT" else ""
		sig = "%s|%s|%s" % [str(li.get("id", "")), str(nt.get("code", "")), str(nt.get("unit", ""))]
	if rack == null and rack_slot != null:
		for ch in rack_slot.get_children(): if ch.has_method("set_need"): rack = ch
	if rack != null and rack.has_method("set_need"): rack.call("set_need", unit)
	if sig == _notice_sig: return
	_notice_sig = sig
	if sig != "": intercom.say("MARA", str(nt.get("text", "")), "info")

## A level change closes every faceplate, the stream tag, the selection and any half-made pipe (a stale plate would ask the engine about a unit that is gone).
func _close_paper() -> void:
	Faceplate.close_all()
	var hub = app.root.get_node_or_null("PaperHub") if app != null else null
	if hub != null: hub.close_one()
	elif app != null and app.world != null and app.world.has_method("select"): app.world.select("")

var _shift_seen := false
func reset_shift_seen() -> void: _shift_seen = false
## A level (re)start, even of the same level: the next refresh clears the intercom and closes every plate, tag, strip and half-made pipe.
func level_begun() -> void:
	_level = "<new>"
	if recorder != null: recorder.level_id = "<new>"   # a restarted level starts a clean paper
var _gl := ""
## A level change that did not come with an engine `changed` signal still wipes the intercom (no stale coach line from the last job).
func _process(_dt: float) -> void:
	if _on and app != null and app.started and app.b != null and str(app.b.g.get("level", "")) != _gl: refresh()
	elif _transient_at > 0 and _on and app != null and app.started and app.b != null and Time.get_ticks_msec() - _transient_at > 2500: settle_intercom()

## After a commission the intercom says the outcome with the player's own numbers: a miss gives the lesson (levelInfo.lesson), a win gives "Goal met: ..." and,
## when the first run starts, the first-run line. Once per commission.
var _explained_runs := -1
var _outcome_said := false        ## the newest outcome line is on the intercom: a design edit must drop back to the coach line
var _bank_dup := ""               ## species when both banks carry the same one and Mara has said so
func _explain_run(li: Dictionary, runs: Array) -> void:
	if li.is_empty() or not qa_li.is_empty(): return
	if _explained_runs < 0 or runs.size() < _explained_runs: _explained_runs = runs.size(); return
	if runs.size() == _explained_runs: return
	_explained_runs = runs.size()
	var ph := str(li.get("phase", ""))
	if ph != "commissioned" and ph != "firstrun" and ph != "won": return
	var missed := false; var met: Array = []
	for g in li.get("goals", []):
		if g is Dictionary:
			if not bool(g.get("met", false)): missed = true
			else: met.append(str(g.get("text", "")))
	var who := str(li.get("setter", "mara"))
	if missed:
		var lesson := str(li.get("lesson", ""))
		if lesson != "": intercom.say(who, lesson, "info"); _outcome_said = true
		return
	intercom.say("MARA", PaperStrings.t("IC_GOAL_MET") % "; ".join(met), "info"); _outcome_said = true
	var rl = li.get("runLine")   # the engine says what a run is (a control level is not "making product")
	if rl != null and str(rl) != "": _say_bound("MARA", str(rl), "firstrun")

## The plant went back to design after an edit: nothing on the intercom may talk about the old design. Speak the current coach line again, else a neutral one.
func _stale_lines(li: Dictionary) -> void:
	if phase != "design" and not li.is_empty() and qa_li.is_empty():   # "Stopped. Back in DESIGN..." / "Retry: your build is kept" are about the design: gone once the plant runs again
		for k in ["IC_STOPPED", "IC_RETRY_KEPT"]:
			if intercom.drop_last_if(PaperStrings.t(k)) and CbSettings.tutorial != "off" and li.get("coach") is Dictionary: _back_to_coach(li)
	if not _outcome_said or phase != "design" or li.is_empty() or not qa_li.is_empty(): return
	_outcome_said = false
	_back_to_coach(li)

func _back_to_coach(li: Dictionary) -> void:
	if CbSettings.tutorial != "off" and li.get("coach") is Dictionary:
		_coach_id = "<unset>"; _poll_coach(li)
	else: intercom.say("MARA", PaperStrings.t("IC_EDITED"), "info")

## Two banks carrying the same species (both N2): Mara says so, once per occurrence, and drops back to the coach line when it is fixed.
func _bank_hint(li: Dictionary) -> void:
	if li.is_empty() or not qa_li.is_empty() or phase != "design": return
	var banks: Array = li.get("banks", []); var opts: Array = li.get("bankSpecies", [])
	var dup := ""
	if banks.size() >= 2 and opts.size() >= 2:
		dup = str(banks[0].get("species", ""))
		for b in banks: if str(b.get("species", "")) != dup: dup = ""
	if dup != "" and dup != _bank_dup:
		_bank_dup = dup
		var other := ""
		for o in opts: if str(o) != dup: other = str(o); break
		intercom.say("MARA", PaperStrings.t("IC_BANKS_SAME") % [EqStrings.formula(dup), EqStrings.formula(other)], "info")
	elif dup == "" and _bank_dup != "":
		_bank_dup = ""
		_back_to_coach(li)

## A failed solve: a red chevron over the unit that failed (the world) and TOMAS names its tag and says why in the engine's words. Once per failure.
var _fail_sig := ""
var _last_fail_msg := ""
var _fail_text := ""
func _failure() -> void:
	if app == null or app.world == null: return
	var f = app.b.g.get("failure")
	var uid := ""; var sig := ""
	if f is Dictionary:
		uid = str(f.get("unitId", "")) if f.get("unitId") != null else ""
		sig = str(f.get("code", "")) + "|" + uid + "|" + str(str(f.get("message", "")).hash()) + "|" + str(JSON.stringify(f.get("data", "")).hash())   # a new number in the same fault is a new line
	if app.world.has_method("set_fail_focus"): app.world.call("set_fail_focus", uid)
	if sig == _fail_sig: return
	_fail_sig = sig
	if sig == "":   # the fault cleared: its line must not stay up as if it were still true
		if _fail_text != "" and intercom.drop_last_if(_fail_text): _fail_text = ""; _back_to_coach(level_info())
		_fail_text = ""; _last_fail_msg = ""; return
	var msg := ""
	if uid != "":
		var c = PaperStrings.q(app, "unitCard", [uid])
		if c is Dictionary and not (c.get("diags", []) as Array).is_empty(): msg = str(c.diags[0].get("message", ""))
		if msg == "":
			var nd = PaperStrings.q(app, "needs", [uid])
			if nd is Dictionary and not nd.is_empty(): msg = str(nd.get("text", ""))
	if msg == "": msg = _last_fail_msg
	if msg == "" and f is Dictionary and f.get("message") != null: msg = str(f.message)   # the engine's own sentence for this failure
	if msg == "": msg = PaperStrings.fail_text(str(f.get("code", "")))
	_fail_text = PaperStrings.t("FAIL_AT") % [uid if uid != "" else "-", msg]
	intercom.say("TOMAS", _fail_text, "bad")
	app.sfx("bad")

func _sync_key() -> void:
	var want := keys.pos
	match phase:
		"design": want = 0
		"commissioned": want = 1
		"shift", "firstrun": want = 2
	keys.set_pos(want)
	var nx := -1; var nt := ""
	if key_available() and str(app.b.g.get("status", "playing")) == "playing":
		match phase:
			"design": nx = 1; nt = PaperStrings.t("KH_DESIGN")
			"commissioned":
				if not _no_shift(): nx = 2; nt = PaperStrings.t("KH_COMMISSIONED")
			"shift": nx = 0; nt = PaperStrings.t("KH_RUN")
	if str(app.b.g.get("status", "playing")) == "lost" and not level_info().is_empty(): nx = 0; nt = PaperStrings.t("KH_BACK")
	keys.set_next(nx, nt)
	keys.set_speed_enabled(phase == "shift" or phase == "firstrun")
	if phase != "shift" and phase != "firstrun" and app.speed != 0 and str(app.b.g.get("status", "playing")) == "playing" and app.started: app.set_speed(0); keys.set_speed_pos(0)
	# the note follows the real clock: "PAUSED" only while nothing runs (dial at the pause bars), never over a 4x / 16x shift
	keys.set_speed_note(PaperStrings.t("CLOCK_PAUSED") if (phase == "design" or phase == "commissioned") and key_available() and app.speed == 0 and keys.speed_pos == 0 else (PaperStrings.t("CLOCK_PAUSED_RUN") if (phase == "shift" or phase == "firstrun") and app.speed == 0 and app.started else (recorder.rate_note() if phase == "shift" else "")))
	if (phase == "shift" or phase == "firstrun") and keys.speed_pos != app.speed: keys.set_speed_pos(app.speed)

## A line that is only true while the plant is in a state ("the plant is making product" while the first run rolls): it goes the moment the state is over.
func _say_bound(who: String, text: String, bound: String) -> void:
	intercom.say(who, text, "info")
	var l := intercom.last()
	if not l.is_empty() and str(l.get("text", "")) == text: l["bound"] = bound

func _bound_ok(bound: String) -> bool:
	match bound:
		"firstrun": return phase == "firstrun"
		"running": return phase == "shift" or phase == "firstrun"
	return true

## The intercom follows the plant: bound lines are withdrawn when their state is over, a coach line whose step is done (or whose level is won) goes, and a passing
## log line ("Piped X to Y") gives the floor back to the current instruction after a moment.
var _transient_at := 0
func _reconcile(li: Dictionary) -> void:
	if li.is_empty() or not qa_li.is_empty(): return
	var changed := false
	for i in range(intercom.lines.size() - 1, -1, -1):
		var l: Dictionary = intercom.lines[i]
		if l.has("bound") and not _bound_ok(str(l.bound)): intercom.lines.remove_at(i); changed = true
	if changed: intercom.chars = 1.0e6; intercom._show_last()
	if _transient_at > 0 and Time.get_ticks_msec() - _transient_at > 2500: settle_intercom(li)

## Put the current instruction back on top when the newest line is only a passing log line.
func settle_intercom(li := {}) -> void:
	if li.is_empty(): li = level_info()
	_transient_at = 0
	var l := intercom.last()
	if l.is_empty() or not bool(l.get("transient", false)): return
	if CbSettings.tutorial != "off" and li.get("coach") is Dictionary: _back_to_coach(li)

## No coach step is current (the level is won, or its steps are all done): a coach line of this level left on top of the log is no longer an instruction.
func _withdraw_coach(li: Dictionary) -> void:
	var pre := str(li.get("id", "")) + ":"
	var dropped := false
	while not intercom.lines.is_empty() and intercom.last().kind == "coach" and str(intercom.last().step).begins_with(pre):
		intercom.lines.pop_back(); dropped = true
	if dropped: _coach_id = ""; intercom.current = ""; intercom.chars = 1.0e6; intercom._show_last()

func _poll_coach(li: Dictionary) -> void:
	if li.is_empty() or CbSettings.tutorial == "off": return
	var c = li.get("coach")
	if not (c is Dictionary): _point(null); _withdraw_coach(li); return
	var cid := "%s:%s" % [str(li.id), str(c.get("step", ""))]
	_point(c.get("focus"))
	if cid != _coach_id:
		_coach_id = cid
		intercom.say(str(c.get("speaker", "MARA")), str(c.get("text", "")), "coach", cid, str(c.get("why", "")))

# ---- the key ---------------------------------------------------------------------------------------------------------------------------------
## One step of the key: DESIGN -> COMMISSION (the engine's commission action) -> RUN (start the shift). Returns the action result ({} when nothing ran).
func turn_key(skip_predict := false) -> Dictionary:
	if app != null and app.started and str(app.b.g.get("status", "playing")) == "lost" and not level_info().is_empty(): return stop_and_edit()   # a lost level always has a way back: the key goes to DESIGN with the build kept
	if app == null or not app.started or str(app.b.g.get("status", "playing")) != "playing": return {}
	phase = engine_phase()
	if phase == "design" and not skip_predict and _call_it_empty():
		_ask_predict(); return {}
	if phase == "design":
		var r: Dictionary = app.b.act("commission")
		if not r.get("ok", false):
			var strays = app.b.q("strayUnits") if _has_query("strayUnits") else []
			if strays is Array and not (strays as Array).is_empty():   # unpiped spares (auto-allotted tanks, a mixer): one key deletes them all
				intercom.say_action("TOMAS", str(r.get("message", "")), "warn", EqStrings.T("KEY_PRUNE"), prune_unconnected)
				app.sfx("alarm")
			else: app.toast(str(r.get("message", "")), "warn")
			keys.set_pos(0); _pulse_open_ports(str(r.get("message", ""))); return r
		if not r.get("commissioned", true):
			_last_fail_msg = str(r.get("message", "")) if str(r.get("message", "")) != "" else EqStrings.T("KEY_SOLVE_FAIL")
			_failure()   # names the failed tag (a no-op when the changed signal already did)
			if not (app.b.g.get("failure") is Dictionary): app.toast(_last_fail_msg, "bad")
			keys.set_pos(0); return r
		keys.set_pos(1); Notebook.started[str(level_info().get("id", ""))] = true
		# a level with a shift: commissioning starts the shift clock (no silent second turn that leaves 0 of N s on the board)
		if int(level_info().get("shiftLen", 0)) > 0:
			var rs: Dictionary = app.b.act("startShift", ["shift"])
			if rs.get("ok", false):
				keys.set_pos(2); app.game_on_changed(); choose_speed(_rec_idx()); phase = engine_phase()
				_say_bound("MARA", PaperStrings.t("IC_RUNNING"), "running"); _outcome_said = true
		return r
	elif phase == "commissioned":
		if _no_shift():   # a job with no shift is judged on its commission: a second click on the key is harmless, never a second run
			app.toast(PaperStrings.t("IC_NO_RUN"), "info"); return {}
		var r2: Dictionary = app.b.act("startShift", ["shift"])
		if not r2.get("ok", false): app.toast(str(r2.get("message", "")), "warn"); return r2
		keys.set_pos(2); choose_speed(_rec_idx()); return r2
	elif phase == "shift": return stop_and_edit()
	else:
		app.toast(PaperStrings.t("IC_FIRST_EDIT"), "info"); return {}

## A level that has no shift to run (shiftLen 0): its only run is the first run that follows a winning commission.
func _no_shift() -> bool:
	var li := level_info()
	return not li.is_empty() and int(li.get("shiftLen", 0)) <= 0

## A call-it level whose answer line is still empty: the first commission is the moment the prediction is for.
func _call_it_empty() -> bool:
	var li := level_info()
	if li.is_empty() or not qa_li.is_empty(): return false
	var cis: Array = li.get("callIts", []) if li.get("callIts") is Array else []
	if cis.is_empty() and li.get("callIt") is Dictionary: cis = [li.callIt]
	if cis.is_empty(): return false
	if li.get("callIt") is Dictionary and bool(li.callIt.get("late", false)): return false   # a late call (L03): the player may call after a test burn, so the first commission is never held up for it
	var lid := str(li.get("id", ""))
	if BuildKeeper.predict_done.has(lid): return false   # asked, answered or waived once for this attempt: never again until a fresh start
	for ci in cis: if ci is Dictionary and bool(ci.get("answered", false)): BuildKeeper.predict_done[lid] = true; return false
	return true

func _ask_predict() -> void:
	var d: Dictionary = app.dialog("predictask", 460.0, 0.0, EqTheme.AMBER, 0.55)
	var vb: VBoxContainer = d.vb; var h: Control = d.host
	d.panel.add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 18.0))
	vb.add_child(EqTheme.label(PaperStrings.t("PRD_TITLE"), 24, EqTheme.TEXT, "title"))
	var tx := EqTheme.label(PaperStrings.t("PRD_BODY"), 16, EqTheme.TEXT, "sans"); tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tx.custom_minimum_size = Vector2(420, 0); vb.add_child(tx)
	var now := EqTheme.key_button(PaperStrings.t("PRD_NOW"), true, 17); now.name = "PredictNow"; now.custom_minimum_size = Vector2(0, 48)
	now.pressed.connect(func(): h.queue_free(); app.focus_dialog(); Notebook.open(app)); vb.add_child(now)
	var go := EqTheme.key_button(PaperStrings.t("PRD_RUN"), false, 17); go.name = "RunAnyway"; go.custom_minimum_size = Vector2(0, 48)
	go.pressed.connect(func(): BuildKeeper.predict_done[str(level_info().get("id", ""))] = true; h.queue_free(); await app.get_tree().process_frame; turn_key(true)); vb.add_child(go)
	app.focus_dialog(); now.call_deferred("grab_focus")

## Turn the key straight to a position. DESIGN from any state is one click (the run is stopped and the build kept); COMMISSION / RUN step forward as far as asked.
func goto_pos(i: int) -> void:
	if app != null and app.started and str(app.b.g.get("status", "playing")) == "lost" and not level_info().is_empty(): stop_and_edit(); return
	if app == null or not app.started or str(app.b.g.get("status", "playing")) != "playing": return
	phase = engine_phase()
	var cur := 0 if phase == "design" else (1 if phase == "commissioned" else 2)
	if i == cur: return
	if i == 0: stop_and_edit(); return
	var guard := 0
	while cur < i and guard < 3:
		guard += 1
		var r := turn_key()
		if not bool(r.get("ok", false)) or r.get("commissioned", true) == false: return
		phase = engine_phase(); cur = 0 if phase == "design" else (1 if phase == "commissioned" else 2)

## RUN -> DESIGN: the engine has no stop action, so the level restarts with the player's build and Call it answers put back (ui/build_keeper.gd).
## Delete every unit that has no pipe (the engine's pruneUnconnected, one undo step).
func prune_unconnected() -> Dictionary:
	if app == null or not app.started: return {}
	var r: Dictionary = app.b.act("pruneUnconnected")
	if r.get("ok", false): app.game_on_changed(); intercom.say("MARA", str(r.get("message", "")), "info")
	else: app.toast(str(r.get("message", "")), "warn")
	return r

## A commission refused for pipework: the unit the message names (else every unit with an open port) pulses its open ports (the engine's openPorts).
func _pulse_open_ports(message: String) -> void:
	if app == null or app.world == null or not app.world.has_method("pulse_ports") or not _has_query("openPorts"): return
	var all = app.b.q("openPorts")
	if not (all is Array) or (all as Array).is_empty(): return
	var named: Array = (all as Array).filter(func(o): return message.contains(str(o.unit)))
	app.world.call("pulse_ports", named if not named.is_empty() else all)

func stop_and_edit() -> Dictionary:
	if level_info().is_empty(): return {}
	var r := BuildKeeper.restart(app, true)
	app.set_speed(0); keys.set_speed_pos(0)
	phase = engine_phase()
	if phase == "design" or int(r.get("fails", 0)) != 0:   # a level that restarts mid-shift (L00) has no DESIGN to go back to: it says nothing about one
		intercom.say("MARA", PaperStrings.t("IC_STOPPED") if int(r.get("fails", 0)) == 0 else PaperStrings.t("IC_STOP_FAIL") % ", ".join(PackedStringArray(r.get("missing", []))), "info")
	elif CbSettings.tutorial != "off" and level_info().get("coach") is Dictionary: _back_to_coach(level_info())
	app.sfx("key")
	return r

## The speed-dial position (index into [pause, 1x, 4x, 16x]) a run of this level opens at.
func _rec_idx() -> int:
	var r := int(level_info().get("recommendedSpeed", 1))
	return 3 if r >= 16 else (2 if r >= 4 else 1)

func choose_speed(i: int) -> void:
	if app == null or not app.started: return
	phase = engine_phase()
	if phase != "shift" and phase != "firstrun": keys.set_speed_pos(0); return
	i = clampi(i, 0, 3)
	# the engine's setSpeed belongs to a shift; the level first run (no shift object) is paced by the client clock alone, so refusing there would freeze its counter at 0
	var r: Dictionary = {"ok": true} if phase == "firstrun" else app.b.act("setSpeed", [SPEEDS[i]])
	if r.get("ok", false): app.set_speed(i); keys.set_speed_pos(i); app.sfx("click")

# ---- toasts and coach from the shell ------------------------------------------------------------------------------------------------------
func toast(text: String, level: String) -> void:
	var warn := level == "warn" or level == "bad"
	intercom.say("TOMAS" if warn else "MARA", text, level if warn else "info")
	if not warn:   # a log line ("Piped X to Y", "Undone"): it passes, then the current instruction is back on top
		var tl := intercom.last()
		if not tl.is_empty() and str(tl.get("text", "")) == text: tl["transient"] = true; _transient_at = Time.get_ticks_msec()
	if warn: app.sfx("alarm" if level == "warn" else "bad")

## The shell's own coach steps (a placeholder "read" step): the line carries the teal tick, why? and, for read steps, "got it".
func coach(step: Dictionary, index: int, _total: int) -> void:
	if index < 0 or step.is_empty():
		intercom.set_current(""); return
	var sid := "shell:" + str(step.get("id", ""))
	intercom.say("MARA", str(step.get("body", step.get("title", ""))), "coach", sid, str(step.get("why", "")))
	if str(step.get("kind", "read")) == "read": intercom.last()["got_it"] = true; intercom.set_current(sid)

# ---- the full-size recorder ------------------------------------------------------------------------------------------------------------------
func open_recorder() -> void:
	if app == null or app.modal() != null: return
	var d: Dictionary = app.dialog("recorder", minf(1100.0, app.vw() - 40.0), minf(520.0, app.vs_h() - 40.0), EqTheme.ENAMEL_HI, 0.5)
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 18.0))
	var vb: VBoxContainer = d.vb
	var hb := HBoxContainer.new(); vb.add_child(hb)
	var t := EqTheme.label(EqStrings.T("REC_TITLE"), 28, EqTheme.TEXT, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(t)
	var x := EqTheme.key_button(EqStrings.T("REC_CLOSE"), true, 16); x.pressed.connect(func(): d.host.queue_free()); hb.add_child(x)
	vb.add_child(EqTheme.label(EqStrings.T("REC_HINT"), 15, EqTheme.DIM))
	var big := ChartRecorder.new(); big.big = true; big.mirror(recorder); big.size_flags_vertical = Control.SIZE_EXPAND_FILL; big.custom_minimum_size = Vector2(600, 300); vb.add_child(big)
	x.call_deferred("grab_focus")

## True when the key can be turned: only inside a level (free play keeps Space as "advance one step").
func key_available() -> bool: return not level_info().is_empty() and str(app.b.g.get("status", "playing")) == "playing"

## K acknowledges the annunciator. Called from main.game_unhandled_key.
func key(e: InputEventKey) -> bool:
	if not _on or app.modal() != null: return false
	if annunciator.handle_key(e): return true
	if e.pressed and not e.echo and e.keycode == KEY_SPACE and key_available(): turn_key(); return true
	return false

## QA (CB_CAM "li=..."): a canned L01-shaped levelInfo while the engine's is not there. Spec: design | run | alarm | crit | shift | off. Each "run" adds one commission.
func qa(spec: String) -> void:
	var li := {"id": "L01", "phase": "design", "hero": {"key": "nh3", "label": "NH3", "unit": "kmol/h", "value": 0.0, "lo": 28.0, "hi": 34.0},
		"secondary": {"key": "vent", "label": "vent", "unit": "%", "value": 0.0, "limit": 5.0}, "coach": null,
		"annunciators": [{"key": "vent", "legend": "VENT FLOW HI", "state": "off"}, {"key": "nh3", "legend": "NH3 OFF SPEC", "state": "off"},
			{"key": "ratio", "legend": "H2:N2 RATIO", "state": "normal"}, {"key": "solve", "legend": "SOLVE FAIL", "state": "off"}]}
	if qa_li.is_empty(): qa_runs = []
	else: li = qa_li
	var anns: Array = li.annunciators
	match spec:
		"design": li.phase = "design"
		"run":
			var n := qa_runs.size()
			var v: float = [18.0, 24.5, 29.8, 31.2, 30.4][n % 5]; var vv: float = [22.0, 11.0, 3.0, 2.0, 1.5][n % 5]
			li.hero.value = v; li.secondary.value = vv; li.phase = "commissioned"
			qa_runs.append({"tick": n + 1}); anns[0].state = "high" if vv > 5.0 else "off"; anns[1].state = "normal" if v >= 28.0 else "high"
		"alarm": anns[0].state = "high"
		"crit": anns[3].state = "critical"
		"shift": li.phase = "shift"; li.hero.value = 30.5 + 0.8 * sin(Time.get_ticks_msec() * 0.003); li.secondary.value = 2.0
		"off": for a in anns: a.state = "off"
	qa_li = li
	refresh()

## The ⚙ drawn as a gear (no font carries the glyph on every platform).
class GearButton extends Button:
	func _draw() -> void:
		var c := size * 0.5; var r := minf(size.x, size.y) * 0.26
		var col := EqTheme.TEXT
		for i in 8:
			var a := TAU * float(i) / 8.0
			draw_line(c + Vector2(cos(a), sin(a)) * r, c + Vector2(cos(a), sin(a)) * (r + 4.5), col, 4.0)
		draw_arc(c, r, 0.0, TAU, 28, col, 3.5)
		draw_circle(c, r * 0.38, col)

## Point at what the coach talks about: a unit in the world (chevron), a parts-rack tile (pulse) or the key.
var rack: Node = null
func _point(f) -> void:
	var unit := ""; var tile := ""
	if f is Dictionary:
		unit = str(f.get("unit", "")); tile = str(f.get("rack", ""))
		if keys != null and keys.has_method("set_coach"): keys.call("set_coach", bool(f.get("key", false)))
	if app != null and app.world != null and app.world.has_method("set_coach_focus"): app.world.call("set_coach_focus", unit)
	Faceplate.set_coach_knob(app, unit, str(f.get("knob", "")) if f is Dictionary else "")   # a knob in the focus pulses on that unit's faceplate
	if rack == null and rack_slot != null:
		for ch in rack_slot.get_children(): if ch.has_method("set_coach"): rack = ch
	if rack != null: rack.call("set_coach", tile)
