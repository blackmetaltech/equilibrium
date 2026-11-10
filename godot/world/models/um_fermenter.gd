class_name UMFermenter
extends UnitModel
## Fermenter: a squat vat with a glass band, a cooling-coil of water rings, an agitator motor on top and rising bubbles in the broth.
## `level` and `color` set the broth, `gas` 0-1 the bubble rate and foam (above 0.7 a foam cap forms), `spin` the agitator, T_K tints the
## coils (cold blue to warm red). Ports: in, out, vap (off-gas on the dome).
var _fill: MeshInstance3D
var _foam: MeshInstance3D
var _bub: UMKit.Bubbles
var _blades: Node3D
var _coil: Array[StandardMaterial3D] = []
const R := 1.5
const BY := 1.2
const BH := 2.0

func _build() -> void:
	tiles = Vector2i(2, 2); height = 6.4; beacon_pos = Vector3(1.0, 5.8, 1.0)
	Parts.plinth(body, Vector3(3.8, 0.2, 3.8))
	var shell := PMat.shell(Color("#D7DCE2"), 0.35, 0.3); shell_mats.append(shell)
	for k in range(4): Parts.box(body, Vector3(0.2, 1.0, 0.2), Vector3(cos(k * PI / 2 + PI / 4) * 1.35, 0.7, sin(k * PI / 2 + PI / 4) * 1.35), PMat.paint("steel"))
	Parts.cyl(body, R, 0.5, Vector3(0, BY - 0.1, 0), shell, Vector3.ZERO, R * 0.5, 28)
	Parts.cyl(body, R * 1.003, BH, Vector3(0, BY + BH * 0.5 + 0.15, 0), PMat.glass(Color("#C8D6E0")), Vector3.ZERO, -1.0, 28, false)
	Parts.cyl(body, R, 0.5, Vector3(0, BY + BH + 0.4, 0), shell, Vector3.ZERO, R * 0.6, 28)
	Parts.sphere(body, R * 0.6, Vector3(0, BY + BH + 0.65, 0), shell, 0.7, 24)
	for y in [BY + 0.15, BY + BH + 0.15]: Parts.cyl(body, R * 1.04, 0.1, Vector3(0, y, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	# the cooling coil: water rings around the band
	for i in range(5):
		var m := PMat.shell(Color("#3F8FD2"), 0.4, 0.3); _coil.append(m)
		Parts.torus(body, R * 1.06, R * 1.06 + 0.12, Vector3(0, BY + 0.4 + i * 0.4, 0), m)
	var fm := PMat.emissive(Color("#C9A66B"), 0.5); fm.albedo_color.a = 0.8; fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_fill = Parts.cyl(body, R * 0.97, 1.0, Vector3(0, BY + 0.15, 0), fm, Vector3.ZERO, -1.0, 28, false)
	var foam := StandardMaterial3D.new(); foam.albedo_color = Color(0.97, 0.95, 0.88, 0.9); foam.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_foam = Parts.cyl(body, R * 0.97, 0.3, Vector3(0, BY + BH, 0), foam, Vector3.ZERO, -1.0, 28, false)
	_bub = UMKit.Bubbles.new().setup(R * 0.85, BY + 0.2, BY + BH, 26, Color("#F3EBD2")); body.add_child(_bub)
	var top := BY + BH + 1.0
	Parts.cyl(body, 0.06, top - BY - 0.4, Vector3(0, (top + BY + 0.4) * 0.5, 0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	_blades = Node3D.new(); _blades.position = Vector3(0, BY + 0.5, 0); body.add_child(_blades)
	for k in range(3):
		var b := Parts.box(_blades, Vector3(0.7, 0.05, 0.22), Vector3.ZERO, PMat.metal(), false); b.position = Vector3(cos(k * TAU / 3) * 0.4, 0, sin(k * TAU / 3) * 0.4); b.rotation = Vector3(0.4, -k * TAU / 3, 0)
	Parts.cyl(body, 0.34, 0.7, Vector3(0, top + 0.25, 0), PMat.paint("motor"), Vector3.ZERO, -1.0, 16)
	Parts.gauge(body, Vector3(-R - 0.3, BY + 0.2, 0), 0.2)
	Parts.nozzle(body, Vector3(-R * 0.7, BY + BH + 0.5, 0), Vector3.LEFT, 0.2, 0.5); add_port("in", Vector3(-R * 0.7 - 0.55, BY + BH + 0.5, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(R * 0.3, BY - 0.2, 0), Vector3.RIGHT, 0.2, 1.4); add_port("out", Vector3(R * 0.3 + 1.45, BY - 0.2, 0), Vector3.RIGHT)
	var e := Parts.nozzle(body, Vector3(0.7, BY + BH + 0.9, 0.5), Vector3.UP, 0.15, 0.5); add_port("vap", e + Vector3(0, 0.2, 0), Vector3.UP)

func _apply() -> void:
	var lv := clampf(dv("level", 0.6), 0.0, 1.0); var col := PMat.species(display.get("color", "#C9A66B")); var h := maxf(0.02, BH * lv)
	_fill.scale = Vector3(1, h, 1); _fill.position.y = BY + 0.15 + h * 0.5
	var m := _fill.material_override as StandardMaterial3D; m.albedo_color = Color(col.r, col.g, col.b, 0.8); m.emission = col
	var gas := clampf(dv("gas", 0.4), 0.0, 1.0)
	_bub.rate = gas; _bub.y1 = BY + 0.15 + h
	_foam.visible = gas > 0.7; _foam.position.y = BY + 0.15 + h + 0.1
	var c := PMat.t_ramp(dv("T_K", 300.0), 280.0, 340.0)
	for cm in _coil: cm.albedo_color = Color("#3F8FD2").lerp(c, 0.7)

func _tick(dt: float) -> void: spin_node(_blades, Vector3.UP, dv("spin", 0.4) * 2.5, dt)
