class_name UMValve
extends UnitModel
## An inline control valve on a short pipe run. stem 0-1 is the valve position. Ports: in (west), out (east).
var _valve: Node3D
func _build() -> void:
	tiles = Vector2i(1, 1); height = 2.4; beacon_pos = Vector3(0, 2.4, 0)
	Parts.plinth(body, Vector3(1.8, 0.1, 1.8))
	Parts.pipe(body, Vector3(-0.95, 0.9, 0), Vector3(0.95, 0.9, 0), 0.22, PMat.paint("process"), true)
	_valve = Parts.control_valve(body, Vector3(0, 0.9, 0), 0.22)
	add_port("in", Vector3(-0.98, 0.9, 0), Vector3.LEFT); add_port("out", Vector3(0.98, 0.9, 0), Vector3.RIGHT)
func _apply() -> void: Parts.set_stem(_valve, dv("stem", 0.5))
