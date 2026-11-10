class_name UMGauze
extends UnitModel
## Ammonia-oxidation gauze burner: an inlet cone over a glass sight band with a platinum gauze disc inside, and a waste-heat section
## below. The disc glows along the furnace ramp by `T_K` (dull red 800 K, orange 1000 K, yellow 1200 K); `health` 0-1 dulls it as it poisons
## and a small lamp lights the plant by the glow. Ports: in (top), out (side, below the gauze).
var _disc: StandardMaterial3D
var _light: OmniLight3D
var _grid: Array[MeshInstance3D] = []
const R := 1.25

func _build() -> void:
	tiles = Vector2i(2, 2); height = 6.8; beacon_pos = Vector3(1.2, 6.2, 0)
	Parts.plinth(body, Vector3(3.8, 0.2, 3.8))
	var shell := PMat.shell(Color("#B7C2D0"), 0.4, 0.7)
	for k in range(4): Parts.box(body, Vector3(0.2, 1.0, 0.2), Vector3(cos(k * PI / 2 + PI / 4) * 1.1, 0.7, sin(k * PI / 2 + PI / 4) * 1.1), PMat.paint("steel"))
	Parts.cyl(body, R, 1.7, Vector3(0, 1.95, 0), shell)                                        # waste-heat section
	for i in range(4): Parts.cyl(body, R * 1.03, 0.07, Vector3(0, 1.3 + i * 0.5, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 24, false)
	Parts.cyl(body, R * 1.003, 1.0, Vector3(0, 3.3, 0), PMat.glass(Color("#FFE0B0")), Vector3.ZERO, -1.0, 28, false)   # sight band
	for s in [0.0, 1.0]: Parts.cyl(body, R * 1.06, 0.14, Vector3(0, 2.8 + s * 1.0, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	_disc = PMat.emissive(Color("#FF8A1C"), 1.5)
	Parts.cyl(body, R * 0.94, 0.06, Vector3(0, 3.2, 0), _disc, Vector3.ZERO, -1.0, 32, false)
	for k in range(6):                                                                         # the woven wire, as crossed dark lines
		var b := Parts.box(body, Vector3(R * 1.88, 0.02, 0.03), Vector3(0, 3.235, 0), PMat.dark_metal(), false); b.rotation_degrees.y = k * 30.0; _grid.append(b)
	Parts.cyl(body, R * 0.7, 0.9, Vector3(0, 4.25, 0), shell, Vector3.ZERO, R, 28)           # inlet cone
	Parts.cyl(body, 0.4, 0.8, Vector3(0, 5.1, 0), shell, Vector3.ZERO, R * 0.55, 20)
	Parts.cyl(body, 0.32, 0.6, Vector3(0, 5.8, 0), shell, Vector3.ZERO, -1.0, 20)
	Parts.cyl(body, R * 1.05, 0.1, Vector3(0, 4.7, 0), PMat.dark_metal(), Vector3.ZERO, 0.6, 20, false)
	Parts.platform(body, R, 2.9, 0.6); Parts.ladder(body, Vector3(0.0, 0.2, R + 0.6), 2.9, 0.5)
	Parts.gauge(body, Vector3(-R - 0.3, 2.0, 0), 0.2)
	Parts.nozzle(body, Vector3(0, 6.1, 0), Vector3.UP, 0.3, 0.6); add_port("in", Vector3(0, 6.85, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(R, 1.6, 0), Vector3.RIGHT, 0.28, 0.6); add_port("out", Vector3(R + 0.65, 1.6, 0), Vector3.RIGHT)
	_light = OmniLight3D.new(); _light.light_color = Color("#FF9A3C"); _light.omni_range = 6.0; _light.light_energy = 0.0; _light.position = Vector3(0, 3.4, 1.8); body.add_child(_light)

func _apply() -> void:
	var T := dv("T_K", 300.0); var health := clampf(dv("health", 1.0), 0.0, 1.0)
	UMKit.set_furnace(_disc, T, 1.5)
	if UMKit.furnace_k(T) > 0.01:
		var c := _disc.emission; var gl := c.get_luminance(); c = Color(gl, gl, gl).lerp(c, 0.4 + 0.6 * health)
		_disc.emission = c; _disc.albedo_color = c
	_light.light_energy = 2.2 * UMKit.furnace_k(T)
