class_name UMCompressor
extends UnitModel
## Compressor: motor and casing on a skid with a guarded coupling. spin 0-1 turns the motor fan and the striped coupling disc (about
## 3 turns/s at 1); heat at the outlet (T_K / glow) heats the discharge pipe and shimmers the air above it.
var _fan: Node3D
var _disc: Node3D
var _hot: StandardMaterial3D
var _shim: PShimmer
var _rotor: Node3D

func _build() -> void:
	tiles = Vector2i(3, 2); height = 3.6; beacon_pos = Vector3(-2.4, 2.1, 1.0)
	Parts.plinth(body, Vector3(5.8, 0.18, 3.6))
	Parts.skid(body, Vector3(5.4, 0.4, 2.6), Vector3(0, 0.18 + 0.0, 0))
	var y := 1.45
	var mot := Parts.motor(body, Vector3(-1.85, y, 0), 0.82, 2.0); _fan = mot.get_meta("fan")
	for sx in [-2.5, -1.2]: Parts.box(body, Vector3(0.5, y - 0.65, 1.1), Vector3(sx, (y - 0.65) * 0.5 + 0.55, 0), PMat.paint("steel"))
	# coupling guard with a window; striped disc inside spins
	Parts.box(body, Vector3(0.9, 0.95, 0.95), Vector3(-0.35, y, 0), PMat.safety())
	_disc = Node3D.new(); _disc.position = Vector3(-0.35, y, 0.49); body.add_child(_disc)
	Parts.cyl(_disc, 0.34, 0.03, Vector3.ZERO, PMat.dark_metal(), Vector3(90, 0, 0), -1.0, 20, false)
	for k in range(3): Parts.box(_disc, Vector3(0.62, 0.025, 0.07), Vector3(0, 0, 0.02), PMat.white(), false).rotation_degrees.z = 60.0 * k
	# casing: a volute (squat horizontal cylinder + dome) with inlet and a discharge riser
	_hot = PMat.shell(Color("#7C93B0"), 0.4, 0.7); shell_mats.append(_hot)
	Parts.cyl(body, 0.95, 1.7, Vector3(1.0, y, 0), _hot, Vector3(0, 0, 90), -1.0, 24)
	Parts.sphere(body, 0.95, Vector3(1.85, y, 0), _hot, 0.7)
	Parts.cyl(body, 1.0, 0.12, Vector3(0.15, y, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 24)
	for k in range(6): Parts.cyl(body, 0.05, 0.12, Vector3(0.12, y + cos(k * 1.0472) * 0.88, sin(k * 1.0472) * 0.88), PMat.metal(), Vector3(0, 0, 90), -1.0, 6, false)
	_rotor = Node3D.new()
	Parts.nozzle(body, Vector3(2.35, y - 0.1, 0), Vector3.RIGHT, 0.34, 0.5)
	var hot := PMat.shell(Color("#8E98A6"), 0.4, 0.8); shell_mats.append(hot)
	Parts.pipe(body, Vector3(0.9, y + 0.8, 0), Vector3(0.9, 3.1, 0), 0.3, hot)
	Parts.pipe(body, Vector3(0.9, 3.1, 0), Vector3(2.5, 3.1, 0), 0.3, hot)
	Parts.flange(body, 0.3, Vector3(2.5, 3.1, 0), Vector3(0, 0, 90))
	_shim = PShimmer.new().setup(2.4, 2.6); _shim.position = Vector3(1.6, 3.1, 0.0); body.add_child(_shim)
	add_port("in", Vector3(2.85, y - 0.1, 0), Vector3.RIGHT)
	add_port("out", Vector3(2.6, 3.1, 0), Vector3.RIGHT)

func _apply() -> void:
	_shim.set_amount(glow() * 1.4)

func _tick(dt: float) -> void:
	var s := dv("spin")
	spin_node(_fan, Vector3.RIGHT, s * 3.0, dt)
	spin_node(_disc, Vector3(0, 0, 1), s * 2.0, dt)
	if s > 0.8: body.position.y = 0.0 + sin(_t * 80.0) * 0.004 * (s - 0.8) * 5.0
