class_name UMBomb
extends UnitModel
## Bomb calorimeter: a lagged white bucket with a steel bomb and stirrer under a lid, a motor, and a mercury thermometer whose column
## climbs with the water's rise (`dT` kelvin of rise over `dT_max`, default 10 K). `ignite` 0-1 flashes the firing lamp; the water ring warms
## blue to red with T_K. `spin` 0-1 turns the stirrer. Ports: in, out (the bomb's charge and vent lines).
var _merc: MeshInstance3D
var _lamp: StandardMaterial3D
var _water: StandardMaterial3D
var _stir: Node3D
const TH := 1.8

func _build() -> void:
	tiles = Vector2i(2, 2); height = 3.8; beacon_pos = Vector3(0.9, 3.5, 0.9)
	Parts.box(body, Vector3(3.6, 0.15, 3.0), Vector3(0, 0.075, 0), PMat.paint("steel"))
	var shell := PMat.shell(Color("#E6E9EE"), 0.5, 0.1); shell_mats.append(shell)
	Parts.cyl(body, 1.3, 1.9, Vector3(0, 1.1, 0), shell, Vector3.ZERO, -1.0, 28)                          # insulated jacket
	Parts.cyl(body, 1.33, 0.12, Vector3(0, 0.25, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	_water = PMat.emissive(Color("#4CC9F0"), 0.5)
	Parts.cyl(body, 1.05, 0.08, Vector3(0, 2.07, 0), _water, Vector3.ZERO, -1.0, 28, false)              # visible water ring in the open top
	Parts.cyl(body, 1.1, 0.12, Vector3(0, 2.1, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false).scale = Vector3(1, 0.4, 1)
	Parts.cyl(body, 0.45, 1.1, Vector3(0, 1.75, 0), PMat.metal(), Vector3.ZERO, -1.0, 20)                 # the steel bomb
	Parts.cyl(body, 0.32, 0.3, Vector3(0, 2.45, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 16)
	for s in [-1.0, 1.0]: Parts.pipe(body, Vector3(s * 0.15, 2.6, 0), Vector3(s * 0.15, 3.0, 0), 0.03, PMat.paint("fuel"), false)
	_lamp = PMat.emissive(Color("#222222"), 3.5)
	Parts.sphere(body, 0.12, Vector3(0.4, 2.6, 0.2), _lamp)
	# stirrer paddle in the water and its motor
	_stir = Node3D.new(); _stir.position = Vector3(0.82, 1.0, 0); body.add_child(_stir)
	Parts.cyl(_stir, 0.03, 1.6, Vector3(0, 0.7, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	Parts.box(_stir, Vector3(0.4, 0.05, 0.1), Vector3(0, 0.1, 0), PMat.metal(), false)
	Parts.box(body, Vector3(0.5, 0.4, 0.5), Vector3(0.82, 2.0, 0), PMat.paint("motor"))
	# thermometer on a stand: glass tube with a mercury column
	Parts.cyl(body, 0.05, 3.6, Vector3(-1.5, 1.8, 0.6), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	Parts.box(body, Vector3(0.2, TH + 0.1, 0.16), Vector3(-1.2, 1.7, 0.6), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.1, TH, 0.1), Vector3(-1.2, 1.7, 0.66), PMat.glass(Color("#E6E9EE")), false)
	_merc = Parts.box(body, Vector3(0.05, 1.0, 0.05), Vector3(-1.2, 1.2, 0.7), PMat.emissive(Color("#E63946"), 2.0), false)
	for k in range(8): Parts.box(body, Vector3(0.14, 0.015, 0.02), Vector3(-1.2, 0.85 + k * TH / 8.0, 0.72), PMat.dark_metal(), false)
	Parts.nozzle(body, Vector3(-0.3, 2.6, 0.0), Vector3.UP, 0.08, 0.3); add_port("in", Vector3(-0.3, 2.95, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(1.2, 0.5, 0.6), Vector3.RIGHT, 0.12, 0.5); add_port("out", Vector3(1.75, 0.5, 0.6), Vector3.RIGHT)

func _apply() -> void:
	var f := clampf(dv("dT") / maxf(0.1, dv("dT_max", 10.0)), 0.0, 1.0)
	var h := maxf(0.1, TH * (0.15 + 0.85 * f)); _merc.scale = Vector3(1, h, 1); _merc.position.y = 0.8 + h * 0.5
	var ig := clampf(dv("ignite"), 0.0, 1.0)
	var c := Color("#222222").lerp(Color("#FFB703"), ig); _lamp.albedo_color = c; _lamp.emission = c
	var tc := PMat.t_ramp(dv("T_K", 298.0), 285.0, 320.0); _water.albedo_color = tc; _water.emission = tc

func _tick(dt: float) -> void: spin_node(_stir, Vector3.UP, dv("spin", 0.5) * 3.0, dt)
