class_name UMBurner
extends UnitModel
## Sulfur burner: a long brick-lined horizontal furnace with a molten-sulfur tank, an air blower, sight ports and hot rings. The glow follows
## the outlet T_K along the blackbody ramp (dull red at 800 K, yellow at 1200 K, white near 1100 C = 1373 K); `flame` 0-1 lights the
## burner-gun glow at the inlet end. Ports: in (air + sulfur, side), out (gas, far end).
var _shell: StandardMaterial3D
var _rings: Array[StandardMaterial3D] = []
var _ports: Array[StandardMaterial3D] = []
var _gun: StandardMaterial3D
var _fan: Node3D
var _shim: PShimmer
var _light: OmniLight3D
const Y := 1.9

func _build() -> void:
	tiles = Vector2i(4, 4); height = 4.6; beacon_pos = Vector3(0.4, 4.2, 0)
	Parts.plinth(body, Vector3(7.6, 0.15, 3.2), Vector3(0.0, 0, 0))
	_shell = PMat.shell(Color("#8A4B35"), 0.9, 0.0)
	Parts.vessel_h(body, 1.25, 5.2, _shell, Vector3(0.4, Y, 0))
	Parts.saddle(body, -1.2, 1.25, Y, 0.7); Parts.saddle(body, 2.0, 1.25, Y, 0.7)
	for s in [-1.0, 1.0]: Parts.cyl(body, 1.28, 0.5, Vector3(0.4 + s * 2.35, Y, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 24)
	for i in range(4):
		var m := PMat.emissive(Color("#3A3330"), 1.0); _rings.append(m)
		Parts.cyl(body, 1.265, 0.12, Vector3(-1.3 + i * 1.7, Y, 0), m, Vector3(0, 0, 90), -1.0, 24, false)
	for i in range(3):
		var m := PMat.emissive(Color("#3A3330"), 1.0); _ports.append(m)
		Parts.cyl(body, 0.24, 0.1, Vector3(-0.6 + i * 1.7, Y + 0.25, 1.28), PMat.dark_metal(), Vector3(90, 0, 0), -1.0, 14, false)
		Parts.cyl(body, 0.17, 0.12, Vector3(-0.6 + i * 1.7, Y + 0.25, 1.32), m, Vector3(90, 0, 0), -1.0, 14, false)
	# burner gun and the sulfur line
	_gun = PMat.emissive(Color("#3A3330"), 1.0)
	Parts.cyl(body, 0.32, 0.5, Vector3(-3.15, Y, 0), PMat.dark_metal(), Vector3(0, 0, 90), 0.2, 14)
	Parts.cyl(body, 0.12, 0.1, Vector3(-3.42, Y, 0), _gun, Vector3(0, 0, 90), -1.0, 10, false)
	var tank := Parts.vessel_h(body, 0.75, 2.2, PMat.safety(), Vector3(-0.4, 1.0, 2.9))
	for k in [-0.7, 0.7]: Parts.box(body, Vector3(0.3, 0.9, 1.6), Vector3(-0.4 + k, 0.45, 2.9), PMat.concrete())
	Parts.pipe(body, Vector3(-1.1, 1.0, 2.9), Vector3(-3.2, 1.0, 2.9), 0.1, PMat.paint("fuel")); Parts.pipe(body, Vector3(-3.2, 1.0, 2.9), Vector3(-3.2, 1.0, 0.4), 0.1, PMat.paint("fuel"))
	Parts.pipe(body, Vector3(-3.2, 1.0, 0.4), Vector3(-3.2, Y, 0.3), 0.1, PMat.paint("fuel"))
	tank.name = "sulfur_tank"
	# air blower
	Parts.box(body, Vector3(2.2, 0.2, 1.2), Vector3(-2.6, 0.1, -2.8), PMat.paint("steel"))
	var mo := Parts.motor(body, Vector3(-3.2, 0.75, -2.8), 0.4, 1.2); _fan = mo.get_meta("fan")
	Parts.sphere(body, 0.7, Vector3(-1.9, 0.9, -2.8), PMat.paint("air"), 1.0)
	Parts.nozzle(body, Vector3(-1.9, 1.5, -2.8), Vector3.UP, 0.2, 0.3, PMat.paint("air"))
	Parts.pipe(body, Vector3(-1.9, 1.8, -2.8), Vector3(-1.9, Y, -2.8), 0.2, PMat.paint("air")); Parts.pipe(body, Vector3(-1.9, Y, -2.8), Vector3(-1.9, Y, -1.1), 0.2, PMat.paint("air"), true)
	add_port("in", Vector3(-1.9, Y, -3.0), Vector3(0, 0, -1))
	Parts.nozzle(body, Vector3(-1.9, Y, -2.6), Vector3(0, 0, -1), 0.2, 0.4)
	Parts.nozzle(body, Vector3(3.0, Y, 0), Vector3.RIGHT, 0.4, 0.9); add_port("out", Vector3(3.95, Y, 0), Vector3.RIGHT)
	_shim = PShimmer.new().setup(5.0, 2.4); _shim.position = Vector3(0.4, Y + 1.3, 0.0); body.add_child(_shim)
	_light = OmniLight3D.new(); _light.light_color = Color("#FF9A3C"); _light.omni_range = 7.0; _light.light_energy = 0.0; _light.position = Vector3(0.4, Y + 1.0, 1.8); body.add_child(_light)

func _apply() -> void:
	var T := dv("T_K", 300.0); var k := UMKit.furnace_k(T)
	UMKit.set_furnace(_shell, T - 480.0, 0.4)
	if UMKit.furnace_k(T - 480.0) <= 0.01: _shell.albedo_color = Color("#8A4B35")
	for m in _rings: UMKit.set_furnace(m, T, 1.2)
	for m in _ports: UMKit.set_furnace(m, T + 80.0, 1.6)
	var fl := clampf(dv("flame", k), 0.0, 1.0)
	_gun.emission = Color("#6FA8FF") if fl > 0.05 else Color.BLACK; _gun.albedo_color = _gun.emission; _gun.emission_energy_multiplier = 1.0 + 2.0 * fl
	_shim.set_amount(k * 1.2)
	_light.light_energy = 2.4 * k
	
func _tick(dt: float) -> void: spin_node(_fan, Vector3.RIGHT, dv("spin", 0.5) * 6.0, dt)
