class_name UMMixer
extends UnitModel
## Mixer: a tee/manifold. Ports in1..in4 (up to the type's count: mixer 2, mixer3 3, mixer4 4) and out (east).
func _build() -> void:
	tiles = Vector2i(2, 2); height = 2.2; beacon_pos = Vector3(0, 2.0, 0)
	var n := 2
	if utype == "mixer3": n = 3
	elif utype == "mixer4": n = 4
	var pm := PMat.paint("process")
	Parts.plinth(body, Vector3(3.6, 0.12, 3.6))
	Parts.sphere(body, 0.46, Vector3(0, 0.9, 0), pm)
	Parts.pipe(body, Vector3(0, 0.9, 0), Vector3(1.95, 0.9, 0), 0.28, pm, true)
	var dirs: Array[Vector3] = [Vector3(-1, 0, 0), Vector3(0, 0, -1), Vector3(0, 0, 1), Vector3(-1, 0, 0)]
	var offs: Array[Vector3] = [Vector3(0, 0, -0.7), Vector3.ZERO, Vector3.ZERO, Vector3(0, 0, 0.7)]
	for i in range(n):
		var d := dirs[i]; var o := offs[i]
		Parts.pipe(body, Vector3(0, 0.9, 0) + o * 0.6, Vector3(0, 0.9, 0) + d * 1.95 + o, 0.22, pm, true)
		add_port("in%d" % (i + 1), Vector3(0, 0.9, 0) + d * 1.98 + o, d)
	add_port("out", Vector3(1.98, 0.9, 0), Vector3.RIGHT)
	for x in [1.0]: Parts.box(body, Vector3(0.3, 0.55, 0.5), Vector3(x, 0.4, 0), PMat.concrete())
