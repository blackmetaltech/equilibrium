class_name UMAbsorber
extends UnitModel
## Packed absorption tower (the SO3 absorber): a porcelain-white column on a sump, a glass window onto the packing that takes the acid
## colour (`color`), a sump sight glass (`level`), a pump-around loop and a mist-eliminator head with the gas outlet. `spin` 0-1 runs the
## pump; `plume` 0-1 is the tail-gas haze at the outlet. Ports: in (gas, low), out (gas, top), acid (product, sump).
var _pack: StandardMaterial3D
var _fill: MeshInstance3D
var _pump: Node3D
var _plume: PPlume
const R := 1.25
const GH := 1.0

func _build() -> void:
	tiles = Vector2i(4, 4); height = 10.0; beacon_pos = Vector3(0, 9.4, 0)
	Parts.plinth(body, Vector3(7.4, 0.3, 7.4))
	var shell := PMat.shell(Color("#E6E9EE"), 0.35, 0.15); shell_mats.append(shell)
	Parts.vessel(body, R * 1.08, 1.4, shell, 0.5)                     # sump
	Parts.cyl(body, R, 2.2, Vector3(0, 3.1, 0), shell)                # lower tower
	Parts.cyl(body, R * 1.005, 2.2, Vector3(0, 5.3, 0), PMat.glass(Color("#C8D6E0")), Vector3.ZERO, -1.0, 28, false)   # packing window
	_pack = PMat.shell(Color("#8E98A6"), 0.85, 0.3)
	Parts.cyl(body, R * 0.96, 2.2, Vector3(0, 5.3, 0), _pack, Vector3.ZERO, -1.0, 28, false)
	for i in range(1, 11): Parts.cyl(body, R * 0.975, 0.04, Vector3(0, 4.2 + i * 0.2, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	Parts.cyl(body, R, 1.8, Vector3(0, 7.5, 0), shell)                # mist eliminator section
	Parts.sphere(body, R, Vector3(0, 8.4, 0), shell, 0.5, 28)
	for y in [2.0, 4.2, 6.4, 8.4]: Parts.cyl(body, R * 1.04, 0.1, Vector3(0, y, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	# sump sight glass
	Parts.box(body, Vector3(0.36, GH + 0.2, 0.14), Vector3(0.0, 1.5, R * 1.08 + 0.05), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.22, GH, 0.05), Vector3(0.0, 1.5, R * 1.08 + 0.13), PMat.glass(Color("#9fb4c8")), false)
	_fill = Parts.box(body, Vector3(0.18, 0.5, 0.05), Vector3(0.0, 1.2, R * 1.08 + 0.15), PMat.emissive(Color("#E8D17A"), 1.2), false)
	# pump-around: pump on the +x side, riser to a distributor on the top of the packing
	Parts.box(body, Vector3(1.8, 0.2, 1.1), Vector3(2.7, 0.4, 1.4), PMat.paint("steel"))
	var mo := Parts.motor(body, Vector3(3.2, 0.9, 1.4), 0.34, 1.0); _pump = mo.get_meta("fan")
	Parts.sphere(body, 0.5, Vector3(2.2, 0.95, 1.4), PMat.paint("process"))
	Parts.pipe(body, Vector3(2.2, 1.0, 1.4), Vector3(R * 0.5, 1.0, 1.4), 0.17, PMat.paint("process"), true)
	Parts.pipe(body, Vector3(2.2, 1.0, 1.4), Vector3(2.2, 7.0, 1.4), 0.17, PMat.paint("process"), true)
	Parts.pipe(body, Vector3(2.2, 7.0, 1.4), Vector3(0.0, 7.0, 0.4), 0.17, PMat.paint("process"))
	Parts.pipe(body, Vector3(R * 0.5, 1.0, 1.4), Vector3(R * 0.5, 0.95, 0.6), 0.17, PMat.paint("process"))
	Parts.platform(body, R, 4.2, 0.8); Parts.ladder(body, Vector3(0, 0.3, R + 1.0), 4.2, 0.55)
	Parts.gauge(body, Vector3(-R - 0.35, 3.0, 0), 0.22)
	Parts.nozzle(body, Vector3(-R, 3.0, 0), Vector3.LEFT, 0.3, 0.8); add_port("in", Vector3(-R - 0.85, 3.0, 0), Vector3.LEFT)
	var e := Parts.nozzle(body, Vector3(0, 9.0, 0), Vector3.UP, 0.3, 0.7); add_port("out", e + Vector3(0, 0.2, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(R * 1.08, 0.9, -1.0), Vector3.RIGHT, 0.2, 2.4); add_port("acid", Vector3(R * 1.08 + 2.55, 0.9, -1.0), Vector3.RIGHT)
	_plume = PPlume.new().setup(Color(0.95, 0.95, 0.98), 1.2, 2.8, 0.7, 3.0, 12, 12.0); _plume.position = e + Vector3(0, 0.3, 0); body.add_child(_plume)

func _apply() -> void:
	var col := PMat.species(display.get("color", "#E8D17A"))
	_pack.albedo_color = Color("#8E98A6").lerp(col, 0.55); _pack.emission_enabled = true; _pack.emission = col; _pack.emission_energy_multiplier = 0.25
	var lv := clampf(dv("level", 0.5), 0.0, 1.0); var h := maxf(0.02, GH * lv)
	_fill.scale = Vector3(1, h / 0.5, 1); _fill.position.y = 1.5 - GH * 0.5 + h * 0.5
	var m := _fill.material_override as StandardMaterial3D; m.albedo_color = col; m.emission = col
	_plume.set_level(dv("plume") * 0.8, Color(0.95, 0.95, 0.98, 1.0))

func _tick(dt: float) -> void: spin_node(_pump, Vector3.RIGHT, dv("spin", 0.5) * 5.0, dt)
