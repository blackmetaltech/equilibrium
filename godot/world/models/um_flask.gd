class_name UMFlask
extends UnitModel
## Lab flask on a hot-plate bench for the N2O4 <=> 2 NO2 experiments: a closed conical flask in a water bath whose colour runs blue to red
## with T_K, a stopper and tube to a pressure gauge (`P_bar` 0-5 swings the needle) and the gas inside. The gas is clear when it is all N2O4 and
## goes brown as NO2 forms: it reads a real number, `alpha` (0-1 dissociation) or else `no2` mol/m3 over `no2_max` (default 80). Ports: in, out.
var _gas: StandardMaterial3D
var _bath: StandardMaterial3D
var _needle: Node3D
var _plate: StandardMaterial3D

func _build() -> void:
	tiles = Vector2i(2, 2); height = 3.6; beacon_pos = Vector3(0.9, 3.2, 0.9)
	Parts.box(body, Vector3(3.6, 0.15, 3.0), Vector3(0, 0.075, 0), PMat.paint("steel"))                  # bench top
	Parts.box(body, Vector3(2.4, 0.4, 2.2), Vector3(0, 0.35, 0), PMat.dark_metal())                     # hot-plate
	_plate = PMat.emissive(Color("#3A3330"), 1.0)
	Parts.cyl(body, 0.95, 0.06, Vector3(0, 0.58, 0), _plate, Vector3.ZERO, -1.0, 24, false)
	Parts.cyl(body, 1.0, 1.0, Vector3(0, 1.1, 0), PMat.glass(Color("#BFD8E8")), Vector3.ZERO, -1.0, 28, false)    # beaker
	var bm := StandardMaterial3D.new(); bm.albedo_color = Color(0.3, 0.7, 0.95, 0.45); bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; bm.emission_enabled = true; bm.emission = Color("#4CC9F0"); bm.emission_energy_multiplier = 0.3
	_bath = bm; Parts.cyl(body, 0.97, 0.8, Vector3(0, 1.0, 0), _bath, Vector3.ZERO, -1.0, 28, false)
	# the flask: cone body, neck, stopper
	_gas = StandardMaterial3D.new(); _gas.albedo_color = Color(1, 1, 1, 0.12); _gas.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_gas.emission_enabled = true; _gas.emission = Color.BLACK; _gas.roughness = 0.2
	Parts.cyl(body, 0.3, 1.2, Vector3(0, 1.2, 0), _gas, Vector3.ZERO, 0.62, 24, false)
	Parts.cyl(body, 0.22, 0.7, Vector3(0, 2.15, 0), _gas, Vector3.ZERO, -1.0, 16, false)
	Parts.cyl(body, 0.27, 0.15, Vector3(0, 2.55, 0), PMat.rubber(), Vector3.ZERO, 0.22, 14)
	Parts.pipe(body, Vector3(0, 2.6, 0), Vector3(0, 3.0, 0), 0.05, PMat.metal())
	Parts.pipe(body, Vector3(0, 3.0, 0), Vector3(1.0, 3.0, 0), 0.05, PMat.metal())
	# clamp stand and the gauge
	Parts.cyl(body, 0.05, 3.2, Vector3(-1.3, 1.7, -0.9), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	Parts.box(body, Vector3(1.3, 0.05, 0.05), Vector3(-0.65, 2.3, -0.9), PMat.metal(), false)
	Parts.cyl(body, 0.4, 0.15, Vector3(1.0, 2.8, 0.0), PMat.dark_metal(), Vector3(90, 0, 0), -1.0, 20, false)
	Parts.cyl(body, 0.35, 0.16, Vector3(1.0, 2.8, 0.01), PMat.white(), Vector3(90, 0, 0), -1.0, 20, false)
	Parts.cyl(body, 0.035, 0.3, Vector3(1.0, 2.5, 0.0), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	_needle = Node3D.new(); _needle.position = Vector3(1.0, 2.8, 0.1); body.add_child(_needle)
	Parts.box(_needle, Vector3(0.03, 0.3, 0.02), Vector3(0, 0.15, 0), PMat.red(), false)
	for k in range(7): Parts.box(body, Vector3(0.02, 0.07, 0.02), Vector3(1.0 + sin((-120.0 + k * 40.0) * PI / 180.0) * 0.31, 2.8 + cos((-120.0 + k * 40.0) * PI / 180.0) * 0.31, 0.1), PMat.dark_metal(), false)
	Parts.nozzle(body, Vector3(-1.2, 0.5, 0.6), Vector3.LEFT, 0.12, 0.5); add_port("in", Vector3(-1.75, 0.5, 0.6), Vector3.LEFT)
	Parts.nozzle(body, Vector3(1.2, 0.5, 0.6), Vector3.RIGHT, 0.12, 0.5); add_port("out", Vector3(1.75, 0.5, 0.6), Vector3.RIGHT)

func _apply() -> void:
	var a := dv("alpha", -1.0)
	if a < 0.0: a = dv("no2") / maxf(1.0, dv("no2_max", 80.0))
	a = clampf(a, 0.0, 1.0)
	var brown := Color("#8B3E12")
	var c := Color(1, 1, 1).lerp(brown, clampf(a * 1.15, 0.0, 1.0))
	_gas.albedo_color = Color(c.r, c.g, c.b, lerpf(0.1, 0.88, sqrt(a)))
	_gas.emission = brown * (0.35 * a)
	var T := dv("T_K", 298.0)
	var tc := PMat.t_ramp(T, 270.0, 420.0)
	_bath.albedo_color = Color(tc.r, tc.g, tc.b, 0.45); _bath.emission = tc
	var hot := PMat.heat(T)
	_plate.emission = PMat.blackbody(0.2 + 0.6 * hot) if T > 340.0 else Color.BLACK; _plate.albedo_color = _plate.emission if T > 340.0 else Color("#3A3330")
	_needle.rotation_degrees.z = 120.0 - clampf(dv("P_bar", 1.0) / 5.0, 0.0, 1.0) * 240.0
