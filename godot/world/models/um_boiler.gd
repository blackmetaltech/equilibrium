class_name UMBoiler
extends UnitModel
## Waste-heat boiler: a horizontal fire-tube shell on saddles with a steam drum above it, risers and a downcomer. The hot-gas duct at the
## inlet end takes the gas colour from T_K. `steam` 0-1 (or `steam_th` / `steam_max`, default 60 t/h) sizes the plume off the drum and the
## drum's sight glass shows `level`. Ports: in (gas, hot end), out (cooled gas).
var _plume: PPlume
var _fill: MeshInstance3D
var _shim: PShimmer
const GH := 0.6

func _build() -> void:
	tiles = Vector2i(4, 2); height = 5.4; beacon_pos = Vector3(-3.0, 4.8, 0)
	Parts.plinth(body, Vector3(7.6, 0.15, 3.4))
	var shell := PMat.shell(Color("#C3CAD2"), 0.5, 0.55); shell_mats.append(shell)
	Parts.vessel_h(body, 0.8, 4.4, shell, Vector3(0.3, 1.45, 0))
	Parts.saddle(body, -1.0, 0.8, 1.45); Parts.saddle(body, 1.9, 0.8, 1.45)
	for i in range(5): Parts.cyl(body, 0.84, 0.07, Vector3(-1.6 + i * 1.0, 1.45, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 24, false)
	# hot-gas duct at the inlet end, takes the heat colour
	var duct := PMat.shell(Color("#B8553F"), 0.6, 0.3); shell_mats.append(duct)
	Parts.box(body, Vector3(1.5, 1.7, 1.7), Vector3(-3.2, 1.45, 0), duct)
	Parts.cyl(body, 0.95, 0.22, Vector3(-2.4, 1.45, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 20)
	# steam drum, risers, downcomer
	var drum := PMat.paint("tank")
	Parts.vessel_h(body, 0.5, 3.0, drum, Vector3(0.3, 3.5, 0))
	Parts.cyl(body, 0.52, 0.25, Vector3(0.3, 3.5, 0), PMat.paint("steam"), Vector3(0, 0, 90), -1.0, 20)
	for x in [-0.6, 0.4, 1.4]: Parts.pipe(body, Vector3(x, 2.1, 0), Vector3(x, 3.1, 0), 0.13, PMat.paint("steam"))
	Parts.pipe(body, Vector3(2.9, 3.2, 0), Vector3(2.9, 1.0, 0), 0.14, PMat.paint("water")); Parts.pipe(body, Vector3(2.5, 3.2, 0), Vector3(2.9, 3.2, 0), 0.14, PMat.paint("water"))
	Parts.pipe(body, Vector3(2.9, 1.0, 0), Vector3(2.0, 1.0, 0), 0.14, PMat.paint("water"))
	# sight glass on the drum
	Parts.box(body, Vector3(0.2, GH + 0.15, 0.1), Vector3(0.3, 3.5, 0.55), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.12, GH, 0.04), Vector3(0.3, 3.5, 0.6), PMat.glass(Color("#9fb4c8")), false)
	_fill = Parts.box(body, Vector3(0.1, 0.3, 0.04), Vector3(0.3, 3.4, 0.62), PMat.emissive(Color("#4CC9F0"), 1.6), false)
	# steam outlet and safety lift
	var e := Parts.nozzle(body, Vector3(1.2, 3.95, 0), Vector3.UP, 0.16, 0.6, PMat.paint("steam"))
	_plume = PPlume.new().setup(Color(1, 1, 1), 1.6, 3.0, 0.7, 3.2, 20, 14.0, 0.1); _plume.position = e + Vector3(0, 0.1, 0); body.add_child(_plume)
	_shim = PShimmer.new().setup(2.0, 2.4); _shim.position = Vector3(-3.2, 2.4, 0.0); body.add_child(_shim)
	Parts.gauge(body, Vector3(-0.6, 4.1, 0.5), 0.2)
	Parts.nozzle(body, Vector3(-3.9 + 0.8, 1.45, 0), Vector3.LEFT, 0.3, 0.1); add_port("in", Vector3(-3.95, 1.45, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(2.6, 1.45, 0), Vector3.RIGHT, 0.28, 1.2); add_port("out", Vector3(3.85, 1.45, 0), Vector3.RIGHT)

func _apply() -> void:
	var st := clampf(dv("steam", dv("steam_th") / maxf(1.0, dv("steam_max", 60.0))), 0.0, 1.0)
	_plume.set_level(st)
	var lv := clampf(dv("level", 0.5), 0.0, 1.0)
	var h := maxf(0.02, GH * lv); _fill.scale = Vector3(1, h / 0.3, 1); _fill.position.y = 3.5 - GH * 0.5 + h * 0.5
	_shim.set_amount(glow() * 0.9)
