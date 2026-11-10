class_name UMCstr
extends UnitModel
## Jacketed stirred-tank reactor: glass-banded vessel with a cooling jacket, a top-entry agitator driven by a motor (`spin` 0-1 sets the
## turns), a liquid fill (`level`, `color`). The jacket runs from water blue to red by `Tj_K`. Near the temperature limit (`T_K` against
## `T_lim`, last 30 K) the whole vessel shakes harder. Ports: in, out.
var _blades: Node3D
var _fill: MeshInstance3D
var _jacket: StandardMaterial3D
const R := 1.5
const BY := 1.9            # window bottom
const BH := 1.5

func _build() -> void:
	tiles = Vector2i(4, 4); height = 7.0; beacon_pos = Vector3(1.4, 6.2, 1.2)
	Parts.plinth(body, Vector3(7.0, 0.2, 7.0))
	var shell := PMat.shell(Color("#D7DCE2"), 0.35, 0.3); shell_mats.append(shell)
	for k in range(4): Parts.box(body, Vector3(0.22, 1.2, 0.22), Vector3(cos(k * PI / 2 + PI / 4) * 1.5, 0.8, sin(k * PI / 2 + PI / 4) * 1.5), PMat.paint("steel"))
	Parts.sphere(body, R, Vector3(0, 1.0, 0), shell, 0.45)
	Parts.cyl(body, R, 0.9, Vector3(0, 1.45, 0), shell)
	Parts.cyl(body, R * 1.002, BH, Vector3(0, BY + BH * 0.5, 0), PMat.glass(Color("#BFD8E8")), Vector3.ZERO, -1.0, 28, false)
	Parts.cyl(body, R, 0.9, Vector3(0, BY + BH + 0.45, 0), shell)
	Parts.sphere(body, R, Vector3(0, BY + BH + 0.9, 0), shell, 0.45)
	# jackets (below and above the window)
	_jacket = PMat.shell(Color("#3F8FD2"), 0.4, 0.4)
	Parts.cyl(body, R * 1.16, 0.86, Vector3(0, 1.45, 0), _jacket, Vector3.ZERO, -1.0, 28)
	Parts.cyl(body, R * 1.16, 0.86, Vector3(0, BY + BH + 0.45, 0), _jacket, Vector3.ZERO, -1.0, 28)
	for y in [1.9, 3.4]: Parts.cyl(body, R * 1.17, 0.08, Vector3(0, y, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	# liquid fill inside the window
	var fm := PMat.emissive(Color("#D9C75A"), 0.5); fm.albedo_color.a = 0.75; fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_fill = Parts.cyl(body, R * 0.97, 1.0, Vector3(0, BY, 0), fm, Vector3.ZERO, -1.0, 28, false)
	# agitator: shaft from the motor down into the window, two pitched blades
	var top := BY + BH + 0.9 + R * 0.45
	Parts.cyl(body, 0.06, top - BY, Vector3(0, (top + BY) * 0.5, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	_blades = Node3D.new(); _blades.position = Vector3(0, BY - 0.15, 0); body.add_child(_blades)
	for k in range(4):
		var b := Parts.box(_blades, Vector3(0.9, 0.05, 0.28), Vector3(0, 0, 0), PMat.metal(), false)
		b.position = Vector3(cos(k * PI / 2) * 0.55, 0, sin(k * PI / 2) * 0.55); b.rotation = Vector3(0.45, -k * PI / 2, 0)
	Parts.cyl(body, 0.4, 0.8, Vector3(0, top + 0.5, 0), PMat.paint("motor"), Vector3.ZERO, -1.0, 16)
	Parts.box(body, Vector3(1.0, 0.5, 1.0), Vector3(0, top + 0.1, 0), PMat.dark_metal())
	Parts.platform(body, R * 1.16, 3.4, 0.7)
	Parts.ladder(body, Vector3(0, 0.2, R + 0.9), 3.4, 0.55)
	Parts.gauge(body, Vector3(-R - 0.5, 2.8, 0), 0.22)
	Parts.nozzle(body, Vector3(-R, BY + 1.9, 0), Vector3.LEFT, 0.24, 0.7); add_port("in", Vector3(-R - 0.75, BY + 1.9, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(R * 0.55, 0.95, 0), Vector3.RIGHT, 0.24, 2.0); add_port("out", Vector3(3.85, 0.95, 0), Vector3.RIGHT)
	Parts.pipe(body, Vector3(R * 0.55, 0.95, 0), Vector3(R * 0.55, 1.2, 0), 0.24, PMat.metal())
	Parts.pipe(body, Vector3(R + 0.2, 1.5, -R * 0.4), Vector3(R + 1.0, 1.5, -R * 0.4), 0.1, PMat.paint("water"), true)
	Parts.pipe(body, Vector3(R + 0.2, 3.9, -R * 0.4), Vector3(R + 1.0, 3.9, -R * 0.4), 0.1, PMat.paint("water"), true)

func _apply() -> void:
	var lv := clampf(dv("level", 0.6), 0.0, 1.0); var col := PMat.species(display.get("color", "#D9C75A"))
	var h := maxf(0.02, BH * lv)
	_fill.scale = Vector3(1, h, 1); _fill.position.y = BY + h * 0.5
	var m := _fill.material_override as StandardMaterial3D; m.albedo_color = Color(col.r, col.g, col.b, 0.75); m.emission = col
	var tj := dv("Tj_K", 295.0); var c := PMat.t_ramp(tj, 280.0, 420.0)
	_jacket.albedo_color = Color("#3F8FD2").lerp(c, 0.6); PMat.set_heat(_jacket, PMat.heat(tj), 1.0)
	var lim := dv("T_lim", 0.0)
	var near := clampf((dv("T_K", 300.0) - (lim - 30.0)) / 30.0, 0.0, 1.0) if lim > 0.0 else clampf(dv("near"), 0.0, 1.0)
	shake_hold(0.07 * near)

func _tick(dt: float) -> void: spin_node(_blades, Vector3.UP, dv("spin", 0.4) * 3.0, dt)
