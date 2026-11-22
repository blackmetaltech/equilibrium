class_name LabWorld
extends Node3D
## CONTRACT STUB (filled by the world programmer, see docs/LOOK2.md). The process hall for L00 Night Shift: the ammonia loop at pilot scale in the
## genius's hall, the plant at night outside the glass wall. Reads the engine snapshot only; never calls engine actions.
signal picked(role: String)   ## a click on a piece of equipment (role names as in Look2.ROLE_OF_TYPE values)
var app
var ids := {}
var cam: Camera3D

func setup(role_ids: Dictionary) -> void: ids = role_ids
func set_quality(_tier: String) -> void: pass
func make_current() -> void:
	if cam == null: cam = Camera3D.new(); add_child(cam); cam.position = Vector3(0, 6, 14); cam.look_at(Vector3.ZERO)
	cam.make_current()
func set_snapshot(_g: Dictionary) -> void: pass
## Screen position (px) of a role's anchor (where its HUD readout leads from); Vector2(-9999, -9999) when off screen or behind the camera.
func anchor_screen(_role: String) -> Vector2: return Vector2(-9999, -9999)
func set_camera(_spec: String) -> void: pass
func set_xray(_on: bool) -> void: pass
func key(_e: InputEventKey) -> bool: return false
