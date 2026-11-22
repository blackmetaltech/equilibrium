class_name FlaskLab
extends Node3D
## L14 The Brown Gas in the genius's private lab (docs/LOOK2.md). CONTRACT (same as LabWorld): setup(ids), set_snapshot(g), set_quality(t), make_current(),
## anchor_screen(role), anchor_size(role), set_camera(spec), set_xray(on), key(e), var cam, var xray, signal picked(role).
## Plus: signal control_changed(key, value) when the player drags an in-world control ("T" kelvin, "V" m3, "argon" mol/s, "Pfix" Pa);
## set_control_value(key, value) mirrors the HUD's controls onto the world's wheels. Roles: flask, feed (N2O4), argon, mixer, vent, gauge.
signal picked(role: String)
signal control_changed(key: String, value: float)
var app
var ids := {}
var cam: Camera3D
var xray := false
var t_dist := 10.0
func _ready() -> void: cam = Camera3D.new(); add_child(cam); cam.position = Vector3(0, 2, 6); cam.look_at(Vector3(0, 1.2, 0))
func setup(role_ids: Dictionary) -> void: ids = role_ids
func set_snapshot(_g: Dictionary) -> void: pass
func set_quality(_t: String) -> void: pass
func make_current() -> void: cam.make_current()
func anchor_screen(_role: String) -> Vector2: return Vector2(-9999, -9999)
func anchor_size(_role: String) -> float: return 0.0
func set_camera(_spec: String) -> void: pass
func set_xray(on: bool) -> void: xray = on
func set_control_value(_key: String, _value: float) -> void: pass
func key(_e: InputEventKey) -> bool: return false
