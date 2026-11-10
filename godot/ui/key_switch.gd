class_name KeySwitch
extends HBoxContainer
## The key switch and the speed selector (UI.md 6). The key has three positions, DESIGN - COMMISSION - RUN, and clunks (`app.sfx("key")`) as it turns;
## the rotary beside it picks the plant clock ‖ 1× 4× 16×. This widget only draws and asks: `step_requested` (tap, Enter, Space via the console) and
## `speed_chosen(i)` go to the console, which runs the engine action and calls `set_pos` / `set_speed_pos` with the result.
signal step_requested()
signal speed_chosen(i: int)
var app: CbApp
var key: KeyDial
var speed: SpeedDial
var pos: int:
	get: return key.pos
var speed_pos: int:
	get: return speed.pos
var clunks := 0       ## times the key clunked (tests)

func _init() -> void:
	EqStrings.load_strings()
	add_theme_constant_override("separation", 6); mouse_filter = Control.MOUSE_FILTER_IGNORE
	key = KeyDial.new(); key.sw = self; add_child(key)
	speed = SpeedDial.new(); speed.sw = self; add_child(speed)

func set_pos(p: int, animate := true) -> void:
	p = clampi(p, 0, 2)
	if p != key.pos:
		key.pos = p; clunks += 1
		if app != null: app.sfx("key")
		if not animate: key.angle = key.target_angle()
	key.queue_redraw()

func set_speed_pos(i: int) -> void: speed.pos = clampi(i, 0, 3); speed.queue_redraw()
func set_speed_enabled(on: bool) -> void: speed.enabled = on; speed.queue_redraw()
func set_compact(c: bool) -> void: key.custom_minimum_size = Vector2(190, 76) if c else Vector2(190, 96); speed.custom_minimum_size = Vector2(100, 76) if c else Vector2(124, 96); key.compact = c; speed.compact = c; key.queue_redraw(); speed.queue_redraw()

## The chunky key.
class KeyDial extends Control:
	var sw: KeySwitch
	var pos := 0
	var angle := -PI / 3.0
	var compact := false
	var coach := false
	const DEG := PI / 3.0
	func _init() -> void:
		custom_minimum_size = Vector2(190, 96); mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = CbKit.focus_mode()
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
	func target_angle() -> float: return (pos - 1) * DEG
	func _process(dt: float) -> void:
		if absf(angle - target_angle()) > 0.003:
			angle = move_toward(angle, target_angle(), 7.0 * dt) if not CbSettings.reduced_motion else target_angle()
			queue_redraw()
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: sw.step_requested.emit(); accept_event()
		elif e is InputEventScreenTouch and e.pressed: sw.step_requested.emit(); accept_event()
		elif e is InputEventKey and e.pressed and not e.echo and (e.keycode == KEY_ENTER or e.keycode == KEY_KP_ENTER): sw.step_requested.emit(); accept_event()
	func _draw() -> void:
		var f := EqStrings.font("cap"); var sz := EqTheme.fs(13)
		var cy := size.y - (24.0 if compact else 30.0); var c := Vector2(size.x * 0.5, cy)
		var rr := 38.0
		if coach:   # the coach points at the key: a pulsing teal ring
			draw_arc(c, rr + 14.0, 0, TAU, 48, Color(EqTheme.TEAL, 0.45 + 0.45 * sin(Time.get_ticks_msec() * 0.006)), 4.0)
			queue_redraw()
		var names := [EqStrings.T("KEY_DESIGN"), EqStrings.T("KEY_COMMISSION"), EqStrings.T("KEY_RUN")]
		for i in 3:
			var a := (i - 1) * DEG
			var lp := c + Vector2(sin(a), -cos(a)) * rr
			var on := i == pos
			draw_circle(lp, 5.5, Color("#0E1A18")); draw_circle(lp, 4.0, EqTheme.TEAL if on else EqTheme.TEAL.darkened(0.8))
			if on: draw_circle(lp, 8.0, Color(EqTheme.TEAL, 0.2))
			var col := EqTheme.TEXT if on else EqTheme.DIM
			var tw := f.get_string_size(names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			if i == 0: draw_string(f, Vector2(lp.x - 10.0 - tw, lp.y + sz * 0.35 + 4.0), names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
			elif i == 1: draw_string(f, Vector2(lp.x - tw * 0.5, lp.y - 9.0), names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
			else: draw_string(f, Vector2(lp.x + 10.0, lp.y + sz * 0.35 + 4.0), names[i], HORIZONTAL_ALIGNMENT_LEFT, -1, sz, col)
		# escutcheon plate and the key
		draw_circle(c, 29.0, Color("#0B1413")); draw_circle(c, 27.0, EqTheme.ENAMEL_HI); draw_circle(c, 23.0, Color("#1A2B28"))
		draw_set_transform(c, angle, Vector2.ONE)
		draw_rect(Rect2(-5, -30, 10, 30), Color("#B7BFBB")); draw_rect(Rect2(-5, -30, 3, 30), Color("#E6ECE8"))   # steel blade pointing out
		draw_rect(Rect2(-5, -30, 10, 5), Color("#7C8581"))
		draw_circle(Vector2.ZERO, 18.0, EqTheme.BAKELITE); draw_circle(Vector2.ZERO, 18.0, Color(1, 1, 1, 0.08), false, 2.0)
		draw_rect(Rect2(-3, -17, 6, 17), EqTheme.TEAL)                                                          # the pointer
		draw_circle(Vector2.ZERO, 5.0, Color("#0E0B0A"))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if has_focus(): draw_rect(Rect2(Vector2.ZERO, size), EqTheme.TEAL, false, 2.0)

## The rotary speed selector: ‖ 1× 4× 16×.
class SpeedDial extends Control:
	var sw: KeySwitch
	var pos := 0
	var enabled := false
	var angle := -1.2
	var compact := false
	const ANG := [-1.3, -0.45, 0.45, 1.3]
	func _init() -> void:
		custom_minimum_size = Vector2(124, 96); mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = CbKit.focus_mode()
		mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
	func _centre() -> Vector2: return Vector2(size.x * 0.5, size.y - (24.0 if compact else 30.0))
	func _process(dt: float) -> void:
		if absf(angle - ANG[pos]) > 0.003:
			angle = move_toward(angle, ANG[pos], 8.0 * dt) if not CbSettings.reduced_motion else ANG[pos]
			queue_redraw()
	func _pick(p: Vector2) -> void:
		var d := p - _centre()
		if d.length() < 20.0: sw.speed_chosen.emit((pos + 1) % 4); return
		var a := atan2(d.x, -d.y); var best := 0; var bd := 99.0
		for i in 4:
			if absf(a - ANG[i]) < bd: bd = absf(a - ANG[i]); best = i
		sw.speed_chosen.emit(best)
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed:
			if e.button_index == MOUSE_BUTTON_LEFT: _pick(e.position); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_UP: sw.speed_chosen.emit(mini(pos + 1, 3)); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: sw.speed_chosen.emit(maxi(pos - 1, 0)); accept_event()
		elif e is InputEventScreenTouch and e.pressed: _pick(e.position); accept_event()
		elif e is InputEventKey and e.pressed and not e.echo:
			if e.keycode == KEY_RIGHT: sw.speed_chosen.emit(mini(pos + 1, 3)); accept_event()
			elif e.keycode == KEY_LEFT: sw.speed_chosen.emit(maxi(pos - 1, 0)); accept_event()
	func _draw() -> void:
		var f := EqStrings.font("cap"); var sz := EqTheme.fs(13)
		var c := _centre()
		var dim := 1.0 if enabled else 0.55
		for i in 4:
			var a: float = ANG[i]
			var lp := c + Vector2(sin(a), -cos(a)) * 30.0
			var on := i == pos
			draw_circle(lp, 3.5, EqTheme.TEAL if on else Color("#22332F"))
			var t := EqStrings.T("SPEED_%d" % i)
			var tw := f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
			var tp := c + Vector2(sin(a), -cos(a)) * 41.0
			var tc := (EqTheme.TEXT if on else EqTheme.DIM) * Color(1, 1, 1, dim)
			if i == 0:   # the pause bars are drawn: no font has the glyph everywhere
				draw_rect(Rect2(tp.x - 5.0, tp.y - 6.0, 3.5, 12.0), tc); draw_rect(Rect2(tp.x + 1.5, tp.y - 6.0, 3.5, 12.0), tc)
			else: draw_string(f, Vector2(tp.x - tw * 0.5, tp.y + 4.0), t, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, tc)
		draw_circle(c, 20.0, Color("#0B1413")); draw_circle(c, 18.0, EqTheme.BAKELITE)
		draw_circle(c, 18.0, Color(1, 1, 1, 0.1), false, 1.5)
		draw_set_transform(c, angle, Vector2.ONE)
		draw_rect(Rect2(-2.5, -17, 5, 12), EqTheme.TEAL * Color(1, 1, 1, dim))
		draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
		if has_focus(): draw_rect(Rect2(Vector2.ZERO, size), EqTheme.TEAL, false, 2.0)

## The coach points at the key (pulse until the step is done).
func set_coach(on: bool) -> void:
	if key != null and key.coach != on: key.coach = on; key.queue_redraw()
