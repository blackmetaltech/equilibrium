class_name UMChiller
extends UnitModel
## Refrigerated chiller: a horizontal evaporator shell with a refrigerant surge drum above it and a small condensing set beside it. When the
## process outlet T_K is under 0 C frost grows over the shell and the nozzles (`frost` 0-1 overrides), and the shell cools toward ice blue.
## `spin` 0-1 runs the compressor fan. Ports: in, out.
var _frost: Array[StandardMaterial3D] = []
var _shell: StandardMaterial3D
var _fan: Node3D
var _frost_nodes: Array[MeshInstance3D] = []

func _build() -> void:
	tiles = Vector2i(4, 2); height = 4.8; beacon_pos = Vector3(-3.4, 4.2, 0)
	Parts.plinth(body, Vector3(7.6, 0.15, 3.4))
	_shell = PMat.shell(Color("#BFD3E2"), 0.5, 0.5); shell_mats.append(_shell)
	Parts.vessel_h(body, 0.8, 4.0, _shell, Vector3(-0.6, 1.4, 0))
	Parts.saddle(body, -1.8, 0.8, 1.4); Parts.saddle(body, 0.8, 0.8, 1.4)
	Parts.vessel_h(body, 0.45, 2.6, PMat.paint("tank"), Vector3(-0.6, 3.2, 0))
	for x in [-1.4, -0.6, 0.2]: Parts.pipe(body, Vector3(x, 2.0, 0), Vector3(x, 2.8, 0), 0.1, PMat.paint("water"))
	# frost: translucent white shells over the evaporator, the drum and the nozzle stubs
	for spec in [[0.84, 4.1, Vector3(-0.6, 1.4, 0)], [0.49, 2.7, Vector3(-0.6, 3.2, 0)]]:
		var m := StandardMaterial3D.new(); m.albedo_color = Color(0.95, 0.99, 1.0, 0.0); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.roughness = 1.0
		_frost.append(m)
		_frost_nodes.append(Parts.cyl(body, spec[0], spec[1], spec[2], m, Vector3(0, 0, 90), -1.0, 24, false))
	# condensing set: compressor and fan coil on the +x side
	Parts.box(body, Vector3(1.6, 0.2, 2.4), Vector3(2.6, 0.1, 0), PMat.paint("steel"))
	Parts.box(body, Vector3(1.2, 1.0, 1.9), Vector3(2.6, 0.7, 0), PMat.paint("motor"))
	Parts.cyl(body, 0.75, 0.2, Vector3(2.6, 1.3, 0), PMat.paint("air"), Vector3.ZERO, -1.0, 20)
	_fan = Node3D.new(); _fan.position = Vector3(2.6, 1.4, 0); body.add_child(_fan)
	for k in range(4):
		var p := Node3D.new(); _fan.add_child(p); p.rotation_degrees.y = 90.0 * k
		Parts.box(p, Vector3(0.6, 0.04, 0.2), Vector3(0.3, 0, 0), PMat.dark_metal(), false)
	Parts.pipe(body, Vector3(1.9, 1.2, 0), Vector3(1.4, 1.2, 0), 0.1, PMat.paint("fuel")); Parts.pipe(body, Vector3(1.4, 1.2, 0), Vector3(1.4, 2.9, 0), 0.1, PMat.paint("fuel"))
	Parts.nozzle(body, Vector3(-2.6, 1.4, 0), Vector3.LEFT, 0.24, 1.2); add_port("in", Vector3(-3.85, 1.4, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(1.4, 1.4, 0.7), Vector3(0, 0, 1), 0.24, 0.5); add_port("out", Vector3(1.4, 1.4, 1.3), Vector3(0, 0, 1))

func _apply() -> void:
	var T := dv("T_K", 300.0)
	var fr := clampf(dv("frost", (273.15 - T) / 50.0), 0.0, 1.0)
	for m in _frost: m.albedo_color.a = fr * 0.85
	for n in _frost_nodes: n.visible = fr > 0.02
	_shell.albedo_color = Color("#BFD3E2").lerp(Color("#4CC9F0"), clampf((300.0 - T) / 120.0, 0.0, 0.5))

func _tick(dt: float) -> void: spin_node(_fan, Vector3.UP, dv("spin", 0.4) * 4.0, dt)
