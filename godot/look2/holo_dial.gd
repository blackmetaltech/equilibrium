class_name HoloDial
extends Control
## The cooler temperature dial: a luminous 270 degree arc. Drag it, turn the wheel over it, or use the arrow keys / pad d-pad while it has focus.
## Values are kelvin (what the engine takes); the face shows deg C. `committed(k)` fires when the player lets go or stops turning.
signal changed(k: float)
signal committed(k: float)
const A0 := PI * 0.75
const SWEEP := PI * 1.5
var lo_k := 400.0
var hi_k := 800.0
var value_k := 700.0:        ## the target the player has asked for
	set(v): value_k = clampf(v, lo_k, hi_k); queue_redraw()
var actual_k := 700.0:       ## the cooler's outlet right now (a marker on the arc)
	set(v): actual_k = v; queue_redraw()
var enabled := true:
	set(v): enabled = v; queue_redraw()
var _shown_k := 700.0
var _drag := false
var _timer: SceneTreeTimer
var _hover := false

func _init() -> void:
	focus_mode = Control.FOCUS_ALL; custom_minimum_size = Vector2(176, 168); mouse_filter = Control.MOUSE_FILTER_STOP
	mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
	mouse_entered.connect(func(): _hover = true; queue_redraw()); mouse_exited.connect(func(): _hover = false; queue_redraw())

func _frac(k: float) -> float: return clampf((k - lo_k) / (hi_k - lo_k), 0.0, 1.0)
func _ang(k: float) -> float: return A0 + SWEEP * _frac(k)
func _centre() -> Vector2: return Vector2(size.x * 0.5, size.y * 0.5 + 6.0)
func _radius() -> float: return minf(size.x * 0.5 - 14.0, size.y * 0.5 - 14.0)

func _process(dt: float) -> void:
	if absf(_shown_k - value_k) > 0.05:
		_shown_k = value_k if CbSettings.reduced_motion else lerpf(_shown_k, value_k, 1.0 - exp(-dt * 14.0)); queue_redraw()
	elif _shown_k != value_k: _shown_k = value_k; queue_redraw()

func _arc(c: Vector2, r: float, a0: float, a1: float, w: float, col: Color) -> void:
	if a1 - a0 > 0.001: draw_arc(c, r, a0, a1, maxi(8, int((a1 - a0) * 28.0)), col, w, true)

func _draw() -> void:
	var c := _centre(); var r := _radius()
	var on := enabled
	var accent := HoloTheme.TEAL if on else Color(HoloTheme.TEAL, 0.35)
	_arc(c, r, A0, A0 + SWEEP, 7.0, Color(1, 1, 1, 0.10))
	# ticks every 50 K, the major ones every 100 K
	var k := lo_k
	while k <= hi_k + 0.1:
		var a := _ang(k); var major := int(round(k - lo_k)) % 100 == 0
		var d := Vector2(cos(a), sin(a))
		draw_line(c + d * (r + 8.0), c + d * (r + (14.0 if major else 11.0)), Color(1, 1, 1, 0.38 if major else 0.2), 1.5, true)
		k += 50.0
	var va := _ang(_shown_k)
	# the glow under the value arc, then the core
	_arc(c, r, A0, va, 16.0, Color(accent, 0.10)); _arc(c, r, A0, va, 11.0, Color(accent, 0.20)); _arc(c, r, A0, va, 5.5, accent)
	# the cooler's actual outlet: a short white bar across the track
	if on:
		var aa := _ang(actual_k); var ad := Vector2(cos(aa), sin(aa))
		draw_line(c + ad * (r - 11.0), c + ad * (r + 11.0), Color(1, 1, 1, 0.85), 2.0, true)
	# the knob
	var kp := c + Vector2(cos(va), sin(va)) * r
	var focus := has_focus() or _drag or _hover
	draw_circle(kp, 13.0 if focus else 11.0, Color(accent, 0.22)); draw_circle(kp, 7.5, Color("#F6FCFB") if on else Color(1, 1, 1, 0.5)); draw_circle(kp, 3.5, accent)
	if has_focus(): draw_arc(c, r + 20.0, A0 - 0.02, A0 + SWEEP + 0.02, 60, Color(HoloTheme.TEAL_HI, 0.55), 1.5, true)
	# the face: the target in deg C, large, and its caption
	var f := HoloTheme.font(600); var f2 := HoloTheme.font(500)
	var txt := "%d" % int(round(HoloTheme.c_of(_shown_k)))
	var fsz := HoloTheme.fs(38)
	var tw := f.get_string_size(txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
	draw_string(f, Vector2(c.x - tw * 0.5 - 6.0, c.y + 6.0), txt, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz, HoloTheme.INK if on else HoloTheme.MUTED)
	draw_string(f2, Vector2(c.x + tw * 0.5 - 2.0, c.y - 8.0), "°C", HORIZONTAL_ALIGNMENT_LEFT, -1, HoloTheme.fs(16), HoloTheme.MUTED)
	var cap := "Dial target"
	var cw := f2.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, HoloTheme.fs(16)).x
	draw_string(f2, Vector2(c.x - cw * 0.5, c.y + 30.0), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, HoloTheme.fs(16), HoloTheme.MUTED)

# ---- input ----
func _set_from_pos(p: Vector2) -> void:
	var d := p - _centre()
	if d.length() < 8.0: return
	var a := fposmod(d.angle() - A0, TAU)
	var f: float
	if a <= SWEEP: f = a / SWEEP
	else: f = 0.0 if (a - SWEEP) > (TAU - SWEEP) * 0.5 else 1.0   # the dead gap at the bottom snaps to the nearer end
	_apply_k(roundf(lerpf(lo_k, hi_k, f)), false)

func _apply_k(k: float, commit_now: bool) -> void:
	if not enabled: return
	k = clampf(k, lo_k, hi_k)
	if absf(k - value_k) > 0.01:
		value_k = k; changed.emit(k)
	if commit_now: _commit()
	else: _soon()

func nudge(dk: float) -> void: _apply_k(value_k + dk, false)

func _commit() -> void: if enabled: committed.emit(value_k)

func _soon() -> void:   # wheel / keys: commit when the player stops turning
	var t := get_tree().create_timer(0.35); _timer = t
	t.timeout.connect(func(): if _timer == t and not _drag: _commit())

func _gui_input(e: InputEvent) -> void:
	if not enabled: return
	if e is InputEventMouseButton:
		var mb := e as InputEventMouseButton
		if mb.button_index == MOUSE_BUTTON_LEFT:
			if mb.pressed: _drag = true; grab_focus(); _set_from_pos(mb.position); accept_event()
			elif _drag: _drag = false; _commit(); accept_event()
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_UP: _apply_k(value_k + (1.0 if mb.shift_pressed else 5.0), false); accept_event()
		elif mb.pressed and mb.button_index == MOUSE_BUTTON_WHEEL_DOWN: _apply_k(value_k - (1.0 if mb.shift_pressed else 5.0), false); accept_event()
	elif e is InputEventMouseMotion and _drag: _set_from_pos((e as InputEventMouseMotion).position); accept_event()
	elif e is InputEventKey and (e as InputEventKey).pressed:
		var step := 25.0 if (e as InputEventKey).shift_pressed else 5.0
		if e.is_action_pressed("ui_right") or e.is_action_pressed("ui_up"): _apply_k(value_k + step, false); accept_event()
		elif e.is_action_pressed("ui_left") or e.is_action_pressed("ui_down"): _apply_k(value_k - step, false); accept_event()
