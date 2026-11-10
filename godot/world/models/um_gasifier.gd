class_name UMGasifier
extends UnitModel
## Gasifier and CO burner (type decides the shape). Gasifier: a tall refractory vessel with a coal hopper, a glass-banded burner zone with a
## flame and a quench sump below. CO burner: a horizontal incinerator with a glass-fronted flame box and a stack. `flame` (or `duty`) 0-1
## sizes the flame (default from the glow); the CO flame is pale blue. Ports: in, out.
var _flame: PFlame
var _plume: PPlume
var _shim: PShimmer
var _co := false
var _glass_light: OmniLight3D

func _build() -> void:
	_co = utype == "co_burner"
	tiles = Vector2i(4, 4)
	if _co: _build_co()
	else: _build_gasifier()

func _build_gasifier() -> void:
	height = 10.2; beacon_pos = Vector3(0, 9.9, 0)
	var R := 1.3
	Parts.plinth(body, Vector3(7.0, 0.3, 7.0))
	for k in range(4): Parts.box(body, Vector3(0.3, 1.0, 0.3), Vector3(cos(k * PI / 2 + PI / 4) * 1.4, 0.8, sin(k * PI / 2 + PI / 4) * 1.4), PMat.paint("steel"))
	var sump := PMat.paint("water")
	Parts.cyl(body, 1.0, 1.0, Vector3(0, 1.8, 0), sump, Vector3.ZERO, 0.3, 20)                      # quench cone / slag
	var shell := PMat.shell(Color("#A9B5C4"), 0.5, 0.6); shell_mats.append(shell)
	Parts.cyl(body, R, 0.9, Vector3(0, 2.75, 0), PMat.brick(), Vector3.ZERO, -1.0, 24)               # refractory lower
	Parts.cyl(body, R * 1.01, 1.7, Vector3(0, 3.95, 0), PMat.glass(Color("#FFB35A")), Vector3.ZERO, -1.0, 24, false)   # burner zone window
	_flame = PFlame.new().setup(1.7, 0.5, true); _flame.position = Vector3(0, 3.1, 0); _flame.name = "flame"; body.add_child(_flame)
	Parts.cyl(body, R, 3.6, Vector3(0, 6.6, 0), shell, Vector3.ZERO, -1.0, 24)
	Parts.sphere(body, R, Vector3(0, 8.4, 0), shell, 0.5, 24)
	for i in range(4): Parts.cyl(body, R * 1.03, 0.1, Vector3(0, 2.4 + i * 1.6, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 24, false)
	# coal hopper and feed pipe
	Parts.cyl(body, 0.8, 1.2, Vector3(-1.9, 8.6, 0), PMat.rubber(), Vector3.ZERO, 0.25, 16)
	Parts.pipe(body, Vector3(-1.9, 7.9, 0), Vector3(-0.4, 8.7, 0), 0.22, PMat.dark_metal(), true)
	# oxygen lance with a flanged inlet
	Parts.pipe(body, Vector3(1.3, 3.1, 0), Vector3(2.6, 3.1, 0), 0.18, PMat.paint("air"), true)
	Parts.platform(body, R, 5.6, 0.8); Parts.ladder(body, Vector3(0, 0.3, R + 1.0), 5.6, 0.55)
	Parts.gauge(body, Vector3(-R - 0.3, 4.6, 0), 0.22)
	Parts.nozzle(body, Vector3(-R, 3.1, 0), Vector3.LEFT, 0.3, 0.8); add_port("in", Vector3(-R - 0.85, 3.1, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(R, 7.0, 0), Vector3.RIGHT, 0.3, 0.8); add_port("out", Vector3(R + 0.85, 7.0, 0), Vector3.RIGHT)
	_shim = PShimmer.new().setup(3.0, 5.0); _shim.position = Vector3(0, 3.6, R + 0.35); body.add_child(_shim)
	_plume = PPlume.new().setup(Color(0.5, 0.5, 0.52), 1.2, 2.6, 0.6, 2.6, 12, 14.0); _plume.position = Vector3(-1.9, 9.3, 0); body.add_child(_plume)

func _build_co() -> void:
	height = 9.0; beacon_pos = Vector3(-2.2, 4.4, 0)
	var R := 1.2; var y := 1.9
	Parts.plinth(body, Vector3(7.6, 0.3, 4.0))
	var shell := PMat.shell(Color("#B8553F"), 0.6, 0.3); shell_mats.append(shell)
	Parts.cyl(body, R, 3.2, Vector3(1.2, y, 0), shell, Vector3(0, 0, 90), -1.0, 24)
	Parts.cyl(body, R * 1.03, 2.0, Vector3(-1.4, y, 0), PMat.glass(Color("#8FC0FF")), Vector3(0, 0, 90), -1.0, 24, false)   # flame box
	for x in [-2.4, -0.4, 0.2, 1.4, 2.6]: Parts.cyl(body, R * 1.05, 0.1, Vector3(x, y, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 24, false)
	Parts.cyl(body, 0.9, 0.7, Vector3(-3.0, y, 0), PMat.dark_metal(), Vector3(0, 0, 90), 0.4, 16)
	Parts.saddle(body, -1.4, R, y, 0.6); Parts.saddle(body, 1.8, R, y, 0.6)
	_flame = PFlame.new().setup(2.6, 0.5, true); _flame.position = Vector3(-2.6, y, 0); _flame.rotation_degrees.z = -90.0; _flame.name = "flame"; body.add_child(_flame)
	_flame.set_flame(0.0, Color("#3A7BFF"), Color("#BFE0FF"))
	Parts.stack(body, Vector3(2.8, y + R * 0.6, 0), 0.8, 0.55, 5.0, PMat.paint("steel"), 2)
	Parts.platform(body, 0.6, 6.2, 0.6, Vector3(2.8, 0, 0))
	Parts.nozzle(body, Vector3(-3.4, 1.0, 0), Vector3.LEFT, 0.28, 0.4); add_port("in", Vector3(-3.95, 1.0, 0), Vector3.LEFT)
	Parts.pipe(body, Vector3(-3.0, 1.0, 0), Vector3(-3.5, 1.0, 0), 0.28, PMat.paint("process"), true)
	Parts.nozzle(body, Vector3(2.5, y, 0), Vector3.RIGHT, 0.25, 1.2); add_port("out", Vector3(3.95, y, 0), Vector3.RIGHT)
	_plume = PPlume.new().setup(Color(0.9, 0.92, 0.95), 1.6, 3.2, 0.9, 3.2, 18, 12.0, 0.05); _plume.position = Vector3(2.8, y + R * 0.6 + 5.1, 0); body.add_child(_plume)
	_shim = PShimmer.new().setup(2.4, 3.0); _shim.position = Vector3(2.8, y + R * 0.6 + 5.0, 0); body.add_child(_shim)

func _apply() -> void:
	var fl := clampf(dv("flame", dv("duty", glow())), 0.0, 1.0)
	if _co: _flame.set_flame(fl, Color("#3A7BFF"), Color("#BFE0FF"), 0.9)
	else: _flame.set_flame(fl, Color("#FF8A1C"), Color("#FFE9A0"))
	_plume.set_level(dv("plume", fl) * 0.8, Color(0.92, 0.94, 0.97, 1.0) if _co else Color(0.35, 0.35, 0.38))
	_shim.set_amount(fl * 1.2)
