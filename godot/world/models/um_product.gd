class_name UMProduct
extends UnitModel
## Product storage: a sphere on braced legs (NH3), with a level column and a species colour belt. level 0-1 fills the gauge column and
## brightens the belt; `anchor_top` is where the floating tonnes counter hangs. Also serves as the sink.
var _fill: MeshInstance3D
var _belt: StandardMaterial3D
const R := 2.3
const CY := 3.9
const GH := 4.6

func _build() -> void:
	tiles = Vector2i(4, 4); height = CY + R + 0.6; beacon_pos = Vector3(0, CY + R + 0.1, 0)
	Parts.plinth(body, Vector3(7.4, 0.2, 7.4))
	var sh := PMat.shell(Color("#D7DCE2"), 0.35, 0.5); shell_mats.append(sh)
	Parts.sphere(body, R, Vector3(0, CY, 0), sh, 1.0, 32)
	_belt = PMat.emissive(Color("#9fb4c8"), 0.9)
	Parts.cyl(body, R * 1.005, 0.4, Vector3(0, CY, 0), _belt, Vector3.ZERO, -1.0, 32, false)
	for k in range(8):
		var a := k * TAU / 8.0 + PI / 8.0; var x := cos(a) * R * 0.72; var z := sin(a) * R * 0.72
		Parts.cyl(body, 0.09, CY - 0.6, Vector3(x, 0.2 + (CY - 0.6) * 0.5, z), PMat.paint("steel"), Vector3.ZERO, -1.0, 8)
	Parts.torus(body, R * 0.7, R * 0.73, Vector3(0, 1.8, 0), PMat.dark_metal())
	Parts.ladder(body, Vector3(R + 0.35, 0.2, 0.0), CY + R - 0.2, 0.5).rotation_degrees.y = 90.0
	# level column
	var gx := -R - 0.55
	Parts.box(body, Vector3(0.3, GH + 0.2, 0.3), Vector3(gx, 0.2 + 0.5 + GH * 0.5, 0), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.18, GH, 0.05), Vector3(gx, 0.7 + GH * 0.5, 0.17), PMat.glass(Color("#9fb4c8")), false)
	_fill = Parts.box(body, Vector3(0.14, 1.0, 0.05), Vector3(gx, 1.0, 0.18), PMat.emissive(Color("#9D4EDD"), 1.8), false)
	Parts.nozzle(body, Vector3(-R * 0.7, 0.7, 0), Vector3.LEFT, 0.22, 0.8)
	Parts.pipe(body, Vector3(-R * 0.7 - 0.8, 0.7, 0), Vector3(-R * 0.7 - 1.0, 0.7, 0), 0.22, PMat.paint("process"), true)
	add_port("in", Vector3(-R * 0.7 - 1.05, 0.7, 0), Vector3.LEFT)

func _apply() -> void:
	var col := PMat.species(display.get("color", "#9D4EDD")); var lv := clampf(dv("level", 0.5), 0.0, 1.0)
	_belt.albedo_color = col; _belt.emission = col; _belt.emission_energy_multiplier = 0.4 + 1.4 * lv
	var h := maxf(0.02, GH * lv); _fill.scale = Vector3(1, h, 1); _fill.position.y = 0.7 + h * 0.5
	var m := _fill.material_override as StandardMaterial3D; m.albedo_color = col; m.emission = col
