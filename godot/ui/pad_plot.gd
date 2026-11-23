class_name PadPlot
extends Node
## The classic drafting table by gamepad alone. Mouse players never see any of this: it works only while CbPad.enabled and CbKit.pad_mode.
##  - Every unit on the sheet and every free port of it gets a focus target at its place on the screen. The D-pad moves the focus the way it does anywhere else,
##    A on a unit selects it and opens its faceplate (focus goes to the plate's first knob), A on a port starts or ends a pipe through the same `port_clicked`
##    signal the mouse uses, so the piping hub's rules and refusals are the only rules. B puts away what the hand is doing (a pipe, a plate, the selection).
##  - LB / RB step the tray's tiles (a folded tray opens first); A on a tile takes the part. While a part is in hand the D-pad (or the left stick) moves the
##    cursor, A places, X turns, B puts it back. The cursor starts on the nearest free spot, so the ghost is green, never a red slab.
##  - Back turns the speed dial. Y (the shell's) turns the key. A on the focused key or dial also works.
##  - In a dialog (notebook, brief, keypad) focus can never leave it, and when there is nowhere to go the D-pad up / down and the right stick scroll the page.
## It runs before the shell's pad node and after Look2 (which keeps itself the last child), so a new-look world keeps its own pad layer and this one stays out of its way.
var app = null
var layer: Control
var targets := {}              ## key -> Target
var _sig := ""
var _ret := ""                 ## key of the target the hand came from (B returns there)
var _was_placing := ""
var _last_in: Control          ## the last control that held the focus inside a dialog
var _nav_press := false       ## a D-pad / shoulder button was pressed this frame (the player chose to move the focus)
var _dir := -1                 ## the D-pad direction pressed this frame (to steer a focus that tried to leave a dialog)
var _modal_seen: Control

class Target extends Control:
	var kind := "unit"         ## unit | port
	var unit := ""
	var port := ""
	var inlet := false
	var cap := ""
	signal activated
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE; focus_mode = Control.FOCUS_NONE
	func _gui_input(e: InputEvent) -> void:
		if e.is_action_pressed("ui_accept") and not (e is InputEventKey): activated.emit(); accept_event()
	func _notification(w: int) -> void:
		if w == NOTIFICATION_FOCUS_ENTER or w == NOTIFICATION_FOCUS_EXIT: queue_redraw()
	func _draw() -> void:
		if not has_focus(): return
		var c := size * 0.5
		draw_arc(c, minf(size.x, size.y) * 0.5, 0.0, TAU, 40, Color(1, 0.96, 0.5), 4.0, true)
		draw_arc(c, minf(size.x, size.y) * 0.5 + 4.0, 0.0, TAU, 40, Color(0, 0, 0, 0.6), 2.0, true)
		var f := EqTheme.font("semi"); var fs := EqTheme.fs(16)
		var tw := minf(f.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x + 12.0, 260.0)
		var r := Rect2(c.x - tw * 0.5, -26.0, tw, 24.0)
		draw_rect(r, Color(0.04, 0.07, 0.07, 0.92)); draw_rect(r, Color(1, 0.96, 0.5), false, 1.5)
		EqTheme.ds(self, f, r.position + Vector2(6, 18), cap, HORIZONTAL_ALIGNMENT_LEFT, tw - 8.0, fs, EqTheme.TEXT)

static func attach(app) -> PadPlot:
	var old = app.get_node_or_null("PadPlot")
	if old != null: return old
	var p := PadPlot.new(); p.name = "PadPlot"; p.app = app; app.add_child(p)
	return p

func _ready() -> void:
	layer = Control.new(); layer.name = "PadTargets"; layer.mouse_filter = Control.MOUSE_FILTER_IGNORE; layer.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	app.root.add_child(layer); app.root.move_child(layer, 0)   # under every panel and dialog
	get_viewport().gui_focus_changed.connect(_focus_changed)
	RenderingServer.frame_pre_draw.connect(_place_hint)   # after every _process of the frame, so the shell's own placement of the hint cannot win

## Godot runs _input from the app's last child back. The shell's pad node is added after the chrome, so this node must stand behind it, but in front of nothing but Look2
## (which keeps itself the last child and answers first while a new-look world is up).
func _keep_order() -> void:
	var n: int = app.get_child_count(); if n < 2: return
	var last: Node = app.get_child(n - 1)
	var want: int = n - 2 if str(last.name) == "Look2" else n - 1
	if get_index() != want and last != self: app.move_child(self, want)
	elif last == self and n >= 2 and str(app.get_child(n - 2).name) == "Look2": app.move_child(self, n - 2)

func _hub() -> Node: return app.root.get_node_or_null("PaperHub")
func _world(): return app.world

## The drafting table is up and the pad is the player's hand.
func _plot_ready() -> bool:
	return CbPad.enabled and app != null and app.started and app.world != null and app.world.has_method("pad_nudge") and app.chrome != null and app.chrome.visible \
		and app.world.visible and not app.world.blocked and app.modal() == null

# ---- the pad ---------------------------------------------------------------------------------------------------------------------------------
func _input(e: InputEvent) -> void:
	if not (e is InputEventJoypadButton) or not e.pressed or not CbPad.enabled or app == null or not app.started: return
	var jb := e as InputEventJoypadButton
	if jb.button_index in [JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT, JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER, JOY_BUTTON_B]: _nav_press = true
	var m: Control = app.modal()
	if m != null:
		match jb.button_index:
			JOY_BUTTON_DPAD_UP: _dir = 0
			JOY_BUTTON_DPAD_DOWN: _dir = 1
			JOY_BUTTON_DPAD_LEFT: _dir = 2
			JOY_BUTTON_DPAD_RIGHT: _dir = 3
			_: return
		_check_move.call_deferred(m, get_viewport().gui_get_focus_owner(), _dir)
		return
	if jb.button_index == JOY_BUTTON_BACK and app.chrome != null and app.chrome.visible and app.chrome.get("keys") != null and app.chrome.key_available():   # the speed dial, on the table or in the hall: through the console, so the dial and the engine's clock follow
		app.chrome.choose_speed(((app.chrome.keys.speed_pos) + 1) % 4); get_viewport().set_input_as_handled(); return
	if not _plot_ready(): return
	var w = app.world
	if jb.button_index == JOY_BUTTON_A and w.placing == "" and get_viewport().gui_get_focus_owner() == null:   # A with nothing focused: the parts tray takes the focus (the shell's pad node would hand it to the gear, and this same A would open the menu; Start is the menu's button)
		if not CbKit.pad_mode: app.pad.set_active(true)
		var rk = app.root.find_child("PartsRack", true, false)
		if rk != null and rk.has_method("pad_step") and rk.pad_step(0): get_viewport().set_input_as_handled()
		return
	var dd := [JOY_BUTTON_DPAD_UP, JOY_BUTTON_DPAD_DOWN, JOY_BUTTON_DPAD_LEFT, JOY_BUTTON_DPAD_RIGHT].find(jb.button_index)
	if dd >= 0 and w.placing == "":   # focus on a faceplate: the D-pad walks its controls (a knob keeps the arrows for itself and never let go of the focus), and leaves it only where the plate has nothing further
		var fo := get_viewport().gui_get_focus_owner()
		if fo is Target:   # on the sheet: the nearest target the D-pad points at (ports sit inside their unit's footprint, so the rects alone would not tell them apart)
			var tn := _nearest(layer, fo, dd)
			if tn != null: tn.grab_focus(); get_viewport().set_input_as_handled(); return
		var fp: Faceplate = null
		for k in Faceplate.plates: if is_instance_valid(Faceplate.plates[k]) and fo != null and (Faceplate.plates[k] as Faceplate).is_ancestor_of(fo): fp = Faceplate.plates[k]
		if fp != null:
			if fo is Knob and dd >= 2:   # LEFT / RIGHT on a dial turn it (its own handler), unless another dial of a two-column plate lies that way
				var kn := _nearest(fp, fo, dd, true)
				if kn != null: kn.grab_focus(); get_viewport().set_input_as_handled()
				return
			var nx := _nearest(fp, fo, dd)
			if nx != null: nx.grab_focus(); get_viewport().set_input_as_handled(); return
			if fo is Knob: return
	if w.placing != "":   # a part is in hand: the pad is its cursor
		match jb.button_index:
			JOY_BUTTON_DPAD_UP: w.pad_nudge(Vector2(0, -1))
			JOY_BUTTON_DPAD_DOWN: w.pad_nudge(Vector2(0, 1))
			JOY_BUTTON_DPAD_LEFT: w.pad_nudge(Vector2(-1, 0))
			JOY_BUTTON_DPAD_RIGHT: w.pad_nudge(Vector2(1, 0))
			JOY_BUTTON_A: w.pad_place()
			JOY_BUTTON_X: w.rotate_ghost()
			JOY_BUTTON_B: w.cancel_place(); _refocus()
			_: return
		get_viewport().set_input_as_handled(); return
	match jb.button_index:
		JOY_BUTTON_LEFT_SHOULDER, JOY_BUTTON_RIGHT_SHOULDER:
			var rack = app.root.find_child("PartsRack", true, false)
			if rack != null and app.cur == app.home and rack.has_method("pad_step") and rack.pad_step(-1 if jb.button_index == JOY_BUTTON_LEFT_SHOULDER else 1): get_viewport().set_input_as_handled()
		JOY_BUTTON_B:
			var hub = _hub()
			if hub != null and (hub.from_unit != "" or not Faceplate.plates.is_empty() or w.selected_id != "" or (w.pipes != null and w.pipes.selected != "")) and hub.close_one():
				_refocus(); get_viewport().set_input_as_handled()

## After a plate or a pipe is put away: the focus goes back to the target the hand came from.
func _refocus() -> void:
	(func() -> void:
		if targets.has(_ret) and is_instance_valid(targets[_ret]) and (targets[_ret] as Control).focus_mode == Control.FOCUS_ALL: (targets[_ret] as Control).grab_focus()).call_deferred()

# ---- targets ---------------------------------------------------------------------------------------------------------------------------------
func _process(_dt: float) -> void:
	_keep_order()
	_place_hint.call_deferred()   # after the shell's pad node has placed it this frame (also headless, where no frame is drawn; and in the hall, where the rest of this node stands down)
	if app == null or not app.started: return
	_modal_tick()
	var on: bool = _plot_ready() and CbKit.pad_mode and app.world.placing == ""
	if layer != null: layer.visible = on
	var pl: String = app.world.placing if app.world != null and "placing" in app.world else ""
	if pl != _was_placing:
		if pl != "" and CbKit.pad_mode and CbPad.enabled and app.world.has_method("pad_seed_cursor"): app.world.pad_seed_cursor()
		if pl == "" and _was_placing != "": _after_place.call_deferred()
		_was_placing = pl
	if not on:
		for k in targets: (targets[k] as Control).focus_mode = Control.FOCUS_NONE
		return
	_sync_targets()
	_nav_press = false

## The shell parks its one-line button hint at the bottom of the free world, which on this table is the console's own text (the coach, Mara's lines): it stands just above
## the tray instead (set just before the frame is drawn, after the shell's pad node has placed it).
func _place_hint() -> void:
	if app == null or not is_instance_valid(app) or app.pad == null: return
	var h: Label = app.pad.hint if app.pad != null else null
	var ch = app.chrome
	if h == null or not h.visible or ch == null or not ch.visible or CbLayout.phone or ch.panel == null: return
	var top: float = ch.panel.global_position.y
	if ch.rack_wrap != null and ch.rack_wrap.is_visible_in_tree(): top = minf(top, ch.rack_wrap.global_position.y)
	h.position = Vector2(maxf(8.0, app.inset.x + 14.0), top - 30.0)

func _after_place() -> void:   # the part went down (or went back): the focus comes to the unit just placed
	var w = app.world
	if w == null or w.selected_id == "": return
	var k := "u:" + str(w.selected_id)
	if targets.has(k) and (targets[k] as Control).focus_mode == Control.FOCUS_ALL: (targets[k] as Control).grab_focus(); _ret = k

func _sync_targets() -> void:
	var w = app.world; var hub = _hub()
	var design: bool = hub == null or hub._designing()
	var want := {}
	for id in w.unit_ids():
		if hub != null and not hub._alive(str(id)): continue
		want["u:" + str(id)] = {"kind": "unit", "unit": str(id), "port": "", "inlet": false}
		if design and hub != null:
			for m in hub._free_ports(str(id)): want["p:%s:%s:%s" % [id, m.port, m.inlet]] = {"kind": "port", "unit": str(id), "port": str(m.port), "inlet": bool(m.inlet)}
	var sig := ",".join(PackedStringArray(want.keys()))
	if sig != _sig:
		_sig = sig
		for k in targets.keys():
			if not want.has(k):
				if is_instance_valid(targets[k]): (targets[k] as Control).queue_free()
				targets.erase(k)
		for k in want:
			if targets.has(k): continue
			var d: Dictionary = want[k]
			var t := Target.new(); t.name = "Pad_" + str(k).replace(":", "_"); t.kind = d.kind; t.unit = d.unit; t.port = d.port; t.inlet = d.inlet
			t.size = Vector2(64, 64) if d.kind == "unit" else Vector2(30, 30)
			t.cap = (d.unit + "  A: open") if d.kind == "unit" else "%s  %s" % [d.unit, Faceplate.Hub.cap(d.port, d.inlet)]
			t.activated.connect(_activate.bind(t)); layer.add_child(t); targets[k] = t
	for k in targets:
		var t: Target = targets[k]
		var p: Vector2 = w.unit_screen_pos(t.unit) if t.kind == "unit" else w.port_screen(t.unit, t.port, t.inlet)
		var ok: bool = p.x > -9000.0
		t.visible = ok; t.focus_mode = Control.FOCUS_ALL if ok else Control.FOCUS_NONE
		if ok: t.position = p - t.size * 0.5

func _activate(t: Target) -> void:
	var w = app.world
	_ret = "u:" + t.unit if t.kind == "unit" else "p:%s:%s:%s" % [t.unit, t.port, t.inlet]
	if t.kind == "port": w.port_clicked.emit(t.unit, t.port, t.inlet); return
	var hub = _hub()
	var piping: bool = hub != null and hub.from_unit != ""
	if w.pipes != null: w.pipes.select("")
	w.select(t.unit); w.unit_clicked.emit(t.unit)
	if not piping: _focus_plate.call_deferred(t.unit)

## A faceplate opened by pad takes the focus on its first knob (a bank's chips, a plain unit's first button).
func _focus_plate(id: String) -> void:
	await get_tree().process_frame
	var fp = Faceplate.plates.get(id)
	if fp == null or not is_instance_valid(fp) or app.modal() != null: return
	var first: Control = null
	for k in (fp as Faceplate).knobs: if is_instance_valid(fp.knobs[k]) and (fp.knobs[k] as Control).is_visible_in_tree(): first = fp.knobs[k]; break
	if first == null:
		for c in fp.find_children("*", "Control", true, false): if (c as Control).focus_mode == Control.FOCUS_ALL and (c as Control).is_visible_in_tree(): first = c; break
	if first != null: first.grab_focus()

# ---- dialogs: focus stays inside, pages scroll --------------------------------------------------------------------------------------------------
func _inside(m: Control, c: Control) -> bool: return c != null and (m == c or m.is_ancestor_of(c))

func _focus_changed(c: Control) -> void:
	if c != null and c.name == "Gear" and not _nav_press and CbKit.pad_mode and _plot_ready() and app.world.placing == "":   # the shell's pad node parks a lost focus on the gear (the first button of the screen), and A would open the menu: the tray takes it instead (Start is the menu's button)
		(func() -> void:
			var rk = app.root.find_child("PartsRack", true, false)
			if rk != null and rk.has_method("pad_focus") and get_viewport().gui_get_focus_owner() == c: rk.pad_focus()).call_deferred()
	var m: Control = app.modal() if app != null else null
	if m == null or c == null: return
	if _inside(m, c): _last_in = c; return
	_steer.call_deferred(m)   # the focus tried to leave the dialog (the tray behind it): bring it back, one step the way the D-pad pointed if there is a control there

func _steer(m: Control) -> void:
	if not is_instance_valid(m) or app.modal() != m: return
	var cur := get_viewport().gui_get_focus_owner()
	if _inside(m, cur): return
	var d := _dir; _dir = -1
	var from: Control = _last_in if is_instance_valid(_last_in) and _inside(m, _last_in) else null
	var pick: Control = null
	if from != null and d >= 0: pick = _nearest(m, from, d)
	if pick == null: pick = from
	if pick == null:
		for c in m.find_children("*", "Control", true, false): if _ok(c): pick = c; break
	if pick != null: pick.grab_focus()

## The D-pad went up or down inside a dialog and the focus is where it was (nothing further that way, or it tried to leave): the page moves instead.
func _check_move(m: Control, pre: Control, d: int) -> void:
	if not is_instance_valid(m) or app.modal() != m or d < 0 or d > 1: return
	if get_viewport().gui_get_focus_owner() == pre and pre != null: _scroll_for(m, pre, 1 if d == 1 else -1)

func _ok(c: Node) -> bool:
	var ctl := c as Control
	return ctl != null and ctl.is_visible_in_tree() and ctl.focus_mode == Control.FOCUS_ALL and not (c is BaseButton and (c as BaseButton).disabled) and not (c is Faceplate.TrashButton)   # the bin is never a D-pad stop: one A would delete the unit (X held does it, with the hold as the confirm)

func _nearest(m: Control, from: Control, d: int, knobs_only := false) -> Control:
	var o := from.get_global_rect().get_center(); var best: Control = null; var bs := INF
	for c in m.find_children("*", "Control", true, false):
		if c == from or not _ok(c) or (knobs_only and not (c is Knob)): continue
		var v: Vector2 = (c as Control).get_global_rect().get_center() - o
		var along: float = [-v.y, v.y, -v.x, v.x][d]; var across: float = absf(v.x) if d < 2 else absf(v.y)
		if along <= 4.0 or across > along * 2.5 + 40.0: continue
		var s: float = along + across * 2.0
		if s < bs: bs = s; best = c
	return best

func _scroll_for(m: Control, from: Control, dir: int) -> void:
	var n: Node = from
	while n != null and n != m:
		if n is ScrollContainer and (n as ScrollContainer).get_v_scroll_bar().max_value > (n as ScrollContainer).size.y + 1.0:
			(n as ScrollContainer).scroll_vertical += dir * 140; return
		n = n.get_parent()
	for c in m.find_children("*", "ScrollContainer", true, false):
		if (c as ScrollContainer).get_v_scroll_bar().max_value > (c as ScrollContainer).size.y + 1.0: (c as ScrollContainer).scroll_vertical += dir * 140; return

## A dialog is up: the right stick scrolls its page; a D-pad press that moved nothing scrolls it too (a brief whose only button is Begin).
func _modal_tick() -> void:
	var m: Control = app.modal()
	if m != _modal_seen: _modal_seen = m; _last_in = null
	if m == null or not CbPad.enabled: return
	var cur := get_viewport().gui_get_focus_owner()
	if _inside(m, cur): _last_in = cur
	var ry := Input.get_joy_axis(0, JOY_AXIS_RIGHT_Y)
	if absf(ry) > 0.3:
		for c in m.find_children("*", "ScrollContainer", true, false):
			var sc := c as ScrollContainer
			if sc.is_visible_in_tree() and sc.get_v_scroll_bar().max_value > sc.size.y + 1.0: sc.scroll_vertical += int(ry * 18.0); break
