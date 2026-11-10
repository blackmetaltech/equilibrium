class_name PlantCamera
extends Node3D
## The orthographic camera rig: 35 degree pitch, yaw in 90 degree steps (animated), three zoom presets plus smooth zoom, pan bounded to
## the plot. Inputs: mouse (wheel zoom, right/middle drag pan), keyboard (WASD/arrows pan, +/- zoom; Q/E come from main.gd), touch
## (one finger drags the ground, pinch zooms, two-finger twist snaps a quarter turn), pad via pad_move(). Emits `tapped` for a short touch.
signal tapped(pos: Vector2)
const PITCH := 35.0
const YAW0 := 45.0
const ZOOMS: Array[float] = [36.0, 56.0, 80.0]   # view height in metres
const ZMIN := 24.0
const ZMAX := 90.0
var world: Node                      # PlantWorld (input gating, plot size)
var cam: Camera3D
var yaw_step := 0
var zoom_i := 1
var pan_limit := Vector2(24.0, 16.0)
var _yaw := YAW0
var _yaw_to := YAW0
var _size := 56.0
var _size_to := 56.0
var _pan := Vector3.ZERO
var _pan_to := Vector3.ZERO
var _instant := true
var _touches := {}                   # index -> position
var _touch_start := {}               # index -> [pos, ms]
var _moved := false
var _pinch_d0 := 0.0
var _pinch_s0 := 56.0
var _twist_a0 := 0.0
var _twist_done := false
var _flick := false
var h_shift_px := 0.0

func _init() -> void:
	cam = Camera3D.new(); cam.projection = Camera3D.PROJECTION_ORTHOGONAL; cam.size = _size; cam.near = 0.5; cam.far = 700.0
	cam.position = Vector3(0, 0, 120.0); add_child(cam)

func _ready() -> void: cam.current = true

func yaw_degrees() -> float: return YAW0 + 90.0 * yaw_step
func ortho_size() -> float: return cam.size
func pan_target() -> Vector3: return _pan_to

func rotate_view(dir: int) -> void:
	yaw_step = posmod(yaw_step + dir, 4); _yaw_to += 90.0 * dir

func set_yaw_step(i: int) -> void:
	yaw_step = posmod(i, 4); _yaw_to = YAW0 + 90.0 * yaw_step
	_yaw = _yaw_to

func set_zoom_index(i: int) -> void:
	zoom_i = clampi(i, 0, ZOOMS.size() - 1); _size_to = ZOOMS[zoom_i]

func zoom_step(dir: int) -> void:
	# nearest preset in the direction asked (dir > 0 = zoom in = smaller view)
	var best := zoom_i
	if dir > 0:
		for i in range(ZOOMS.size() - 1, -1, -1): if ZOOMS[i] < _size_to - 0.5: best = i; break
	else:
		for i in range(ZOOMS.size()): if ZOOMS[i] > _size_to + 0.5: best = i; break
	if best == zoom_i and ((dir > 0 and zoom_i == 0) or (dir < 0 and zoom_i == ZOOMS.size() - 1)): return
	set_zoom_index(best)

func set_size(s: float) -> void: _size_to = clampf(s, ZMIN, ZMAX)
func look_at_ground(p: Vector3) -> void: _pan_to = Vector3(clampf(p.x, -pan_limit.x, pan_limit.x), 0, clampf(p.z, -pan_limit.y, pan_limit.y))
func pan_ground(d: Vector3) -> void: look_at_ground(_pan_to + d)
func snap() -> void: _instant = true

## Pan by a screen-space delta in logical pixels (drag the ground under the finger/cursor).
func pan_pixels(rel: Vector2) -> void:
	var mpp := _size / maxf(1.0, get_viewport().get_visible_rect().size.y)
	var right := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(_yaw)); var fwd := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(_yaw))
	pan_ground((-right * rel.x + fwd * rel.y / sin(deg_to_rad(PITCH))) * mpp)
	_instant = false

func _allowed() -> bool: return world != null and world.call("input_ok")

func _typing() -> bool:
	var f := get_viewport().gui_get_focus_owner()
	return f is LineEdit or f is TextEdit or f is SpinBox or f is OptionButton or f is Slider or f is ItemList or f is Tree

func _process(dt: float) -> void:
	var k := 1.0 - exp(-dt * 9.0)
	_yaw = lerpf(_yaw, _yaw_to, k); _pan = _pan.lerp(_pan_to, k)
	if absf(_size - _size_to) > 0.004: _size = lerpf(_size, _size_to, k)
	if _allowed() and not _typing() and not (Input.is_key_pressed(KEY_CTRL) or Input.is_key_pressed(KEY_ALT) or Input.is_key_pressed(KEY_META)):
		var v := Vector2.ZERO
		if Input.is_key_pressed(KEY_W) or Input.is_key_pressed(KEY_UP): v.y -= 1
		if Input.is_key_pressed(KEY_S) or Input.is_key_pressed(KEY_DOWN): v.y += 1
		if Input.is_key_pressed(KEY_A) or Input.is_key_pressed(KEY_LEFT): v.x -= 1
		if Input.is_key_pressed(KEY_D) or Input.is_key_pressed(KEY_RIGHT): v.x += 1
		if v != Vector2.ZERO:
			var sp := _size * 0.9 * dt * (2.0 if Input.is_key_pressed(KEY_SHIFT) else 1.0)
			var right := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(_yaw)); var fwd := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(_yaw))
			pan_ground((right * v.x - fwd * v.y) * sp); _instant = false
	apply()

func apply() -> void:
	if _instant: _yaw = _yaw_to; _pan = _pan_to; _size = _size_to
	position = _pan
	rotation_degrees = Vector3(-PITCH, _yaw, 0.0)
	cam.size = _size
	var vr := get_viewport().get_visible_rect().size
	cam.h_offset = h_shift_px * _size / maxf(1.0, vr.y)
	_instant = false

## Stick input (CbPad.enabled gates the call): left pans, right Y zooms, right X flicks a quarter turn.
func pad_move(left: Vector2, right: Vector2, dt: float, pan_enabled := true) -> void:
	if not _allowed(): return
	if pan_enabled and left.length() > 0.05:
		var r := Vector3.RIGHT.rotated(Vector3.UP, deg_to_rad(_yaw)); var f := Vector3.FORWARD.rotated(Vector3.UP, deg_to_rad(_yaw))
		pan_ground((r * left.x - f * left.y) * _size * 0.8 * dt); _instant = false
	if absf(right.y) > 0.2: set_size(_size_to * (1.0 + right.y * dt * 1.4))
	if absf(right.x) > 0.75 and not _flick: _flick = true; rotate_view(1 if right.x > 0 else -1)
	elif absf(right.x) < 0.3: _flick = false

func _unhandled_input(e: InputEvent) -> void:
	if not _allowed(): _touches.clear(); return
	if e is InputEventMouseButton and e.pressed and e.device != InputEvent.DEVICE_ID_EMULATION:
		if e.button_index == MOUSE_BUTTON_WHEEL_UP: zoom_step(1)
		elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: zoom_step(-1)
	elif e is InputEventMouseMotion and e.device != InputEvent.DEVICE_ID_EMULATION and (e.button_mask & (MOUSE_BUTTON_MASK_RIGHT | MOUSE_BUTTON_MASK_MIDDLE)) != 0:
		pan_pixels(e.relative)
	elif e is InputEventKey and e.pressed and not e.echo and not _typing() and not (e.ctrl_pressed or e.alt_pressed):
		match e.keycode:
			KEY_EQUAL, KEY_PLUS, KEY_KP_ADD: zoom_step(1)
			KEY_MINUS, KEY_KP_SUBTRACT: zoom_step(-1)
	elif e is InputEventScreenTouch: _touch(e)
	elif e is InputEventScreenDrag: _drag(e)

func _touch(e: InputEventScreenTouch) -> void:
	if e.pressed:
		_touches[e.index] = e.position; _touch_start[e.index] = [e.position, Time.get_ticks_msec()]
		if _touches.size() == 1: _moved = false
		elif _touches.size() == 2:
			var p: Array = _touches.values(); _pinch_d0 = (p[0] as Vector2).distance_to(p[1]); _pinch_s0 = _size_to
			_twist_a0 = ((p[1] as Vector2) - (p[0] as Vector2)).angle(); _twist_done = false; _moved = true
	else:
		if _touches.size() == 1 and not _moved and _touch_start.has(e.index):
			var st: Array = _touch_start[e.index]
			if Time.get_ticks_msec() - int(st[1]) < 450: tapped.emit(e.position)
		_touches.erase(e.index); _touch_start.erase(e.index)
		if _touches.size() < 2: _twist_done = false

func _drag(e: InputEventScreenDrag) -> void:
	if not _touches.has(e.index): return
	_touches[e.index] = e.position
	if _touches.size() == 1:
		var st: Array = _touch_start.get(e.index, [e.position, 0])
		if _moved or e.position.distance_to(st[0]) > 12.0: _moved = true; pan_pixels(e.relative)
	elif _touches.size() == 2:
		var p: Array = _touches.values(); var d := (p[0] as Vector2).distance_to(p[1])
		if _pinch_d0 > 8.0: set_size(_pinch_s0 * _pinch_d0 / maxf(8.0, d))
		var a := ((p[1] as Vector2) - (p[0] as Vector2)).angle(); var da := wrapf(a - _twist_a0, -PI, PI)
		if not _twist_done and absf(rad_to_deg(da)) > 38.0:
			_twist_done = true; rotate_view(-1 if da > 0.0 else 1)
