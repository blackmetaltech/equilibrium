class_name UMSplitter
extends UnitModel
## Splitter / purge: a tee with a control valve in the purge branch. stem 0-1 is the valve position (the stem and actuator yoke move).
## Ports: in (west), out (east), purge (south).
var _valve: Node3D

func _build() -> void:
	tiles = Vector2i(2, 2); height = 2.6; beacon_pos = Vector3(0, 2.4, -0.8)
	var pm := PMat.paint("process")
	Parts.plinth(body, Vector3(3.6, 0.12, 3.6))
	for x in [-1.3, 1.3]: Parts.box(body, Vector3(0.3, 0.55, 0.5), Vector3(x, 0.4, 0), PMat.concrete())
	Parts.pipe(body, Vector3(-1.9, 0.9, 0), Vector3(1.9, 0.9, 0), 0.26, pm, true)
	Parts.sphere(body, 0.36, Vector3(0, 0.9, 0), pm)
	Parts.pipe(body, Vector3(0, 0.9, 0), Vector3(0, 0.9, 0.7), 0.2, pm)
	_valve = Parts.control_valve(body, Vector3(0, 0.9, 1.3), 0.2); _valve.rotation_degrees.y = 90.0
	Parts.flange(body, 0.2, Vector3(0, 0.9, 1.9), Vector3(90, 0, 0), pm)   # the purge nozzle's flange (a zero-length pipe here gave a NaN normal)
	add_port("in", Vector3(-1.95, 0.9, 0), Vector3.LEFT); add_port("out", Vector3(1.95, 0.9, 0), Vector3.RIGHT); add_port("purge", Vector3(0, 0.9, 1.95), Vector3(0, 0, 1))

func _apply() -> void: Parts.set_stem(_valve, dv("stem", 0.5))
