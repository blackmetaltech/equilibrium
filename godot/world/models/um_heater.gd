class_name UMHeater
extends UnitModel
## Fired heater: a box furnace with a stack. flame 0-1 is the burner duty: three burners protrude from the firing wall with flames of
## that size, the peepholes glow, the stack breathes a plume (plume 0-1, default follows the flame). glow heats the furnace shell.
var _flames: Array[PFlame] = []
var _holes: Array[StandardMaterial3D] = []
var _plume: PPlume
var _shim: PShimmer

func _build() -> void:
	tiles = Vector2i(3, 3); height = 9.2; beacon_pos = Vector3(-1.2, 3.9, -1.1)
	Parts.plinth(body, Vector3(5.8, 0.2, 5.8))
	var shell := PMat.shell(Color("#B8553F"), 0.6, 0.3); shell_mats.append(shell)
	Parts.box(body, Vector3(4.4, 0.8, 3.6), Vector3(0, 0.2 + 0.4, 0), PMat.brick())                   # brick base
	Parts.box(body, Vector3(4.2, 2.6, 3.4), Vector3(0, 0.2 + 0.8 + 1.3, 0), shell)                      # firebox
	Parts.box(body, Vector3(4.5, 0.18, 3.7), Vector3(0, 0.2 + 3.4 + 0.09, 0), PMat.dark_metal())      # roof plate
	for i in range(5): Parts.box(body, Vector3(0.12, 2.6, 3.5), Vector3(-1.8 + i * 0.9, 0.2 + 0.8 + 1.3, 0), PMat.dark_metal(), false)   # buckstays
	# convection hood and the stack
	Parts.box(body, Vector3(1.8, 1.0, 1.8), Vector3(0, 4.3, -0.2), shell)
	Parts.stack(body, Vector3(0, 4.8, -0.2), 0.8, 0.5, 4.2, PMat.paint("steel"), 2)
	Parts.platform(body, 0.55, 7.0, 0.7, Vector3(0, 0, -0.2))
	_plume = PPlume.new().setup(Color(0.9, 0.92, 0.95), 1.6, 3.2, 0.9, 3.2, 18, 12.0, 0.05); _plume.position = Vector3(0, 9.1, -0.2); body.add_child(_plume)
	_shim = PShimmer.new().setup(2.4, 3.0); _shim.position = Vector3(0, 9.0, -0.2); body.add_child(_shim)
	# burners on the +z (front) wall, with peepholes between them
	for i in range(3):
		var x := -1.3 + i * 1.3
		Parts.cyl(body, 0.26, 0.55, Vector3(x, 1.5, 1.95), PMat.dark_metal(), Vector3(90, 0, 0), 0.34, 14)
		Parts.flange(body, 0.26, Vector3(x, 1.5, 1.72), Vector3(90, 0, 0))
		var f := PFlame.new().setup(1.6, 0.34, i == 1); f.position = Vector3(x, 1.5, 2.2); f.rotation_degrees.x = 90.0; f.name = "flame%d" % i; body.add_child(f); _flames.append(f)
		var hm := PMat.emissive(Color("#FFB35A"), 2.0); _holes.append(hm)
		Parts.box(body, Vector3(0.34, 0.26, 0.06), Vector3(x + 0.65, 2.6, 1.72), hm, false)
		Parts.box(body, Vector3(0.44, 0.36, 0.05), Vector3(x + 0.65, 2.6, 1.69), PMat.dark_metal(), false)
	add_port("in", Vector3(-2.3, 1.5, -0.6), Vector3.LEFT)
	add_port("out", Vector3(2.3, 3.0, -0.6), Vector3.RIGHT)
	Parts.nozzle(body, Vector3(-2.1, 1.5, -0.6), Vector3.LEFT, 0.22, 0.4); Parts.nozzle(body, Vector3(2.1, 3.0, -0.6), Vector3.RIGHT, 0.22, 0.4)

func _apply() -> void:
	var fl := clampf(dv("flame", dv("duty", glow())), 0.0, 1.0)
	for f in _flames: f.set_flame(fl, Color("#FF7A18"), Color("#FFE08A"))
	for h in _holes:
		h.emission = PMat.blackbody(0.35 + 0.65 * fl) if fl > 0.02 else Color.BLACK; h.albedo_color = h.emission
	_plume.set_level(dv("plume", fl) * 0.9, Color(0.92, 0.94, 0.97, 1.0) if display.get("sooty", false) == false else Color(0.2, 0.2, 0.22))
	_shim.set_amount(fl * 1.2)
