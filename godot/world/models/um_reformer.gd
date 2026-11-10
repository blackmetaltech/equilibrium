class_name UMReformer
extends UnitModel
## Steam-methane reformer: a box radiant furnace seen through a glass-fronted opening onto two rows of vertical catalyst tubes. The tubes
## glow along the furnace ramp by `T_K` (red at 800 K, orange at 1000 K, yellow to white towards 1300 K; `tubes` = [T_K, ...] sets them
## one by one), the roof burners flame with `flame` 0-1 (default from the glow) and a flue stack carries the plume. Ports: in (top
## manifold), out (bottom, far side).
var _tubes: Array[StandardMaterial3D] = []
var _flames: Array[PFlame] = []
var _plume: PPlume
var _shim: PShimmer
var _light: OmniLight3D
const W := 6.0
const D := 3.2
const FY := 1.1
const FH := 3.8
const NT := 7

func _build() -> void:
	tiles = Vector2i(4, 4); height = 9.4; beacon_pos = Vector3(-3.0, 6.4, 0)
	Parts.plinth(body, Vector3(7.6, 0.3, 7.0))
	var shell := PMat.shell(Color("#8A4B35"), 0.8, 0.1)
	Parts.box(body, Vector3(W + 0.4, 0.8, D + 0.4), Vector3(0, 0.7, 0), PMat.brick())
	Parts.box(body, Vector3(0.2, FH, D), Vector3(-W * 0.5 - 0.1, FY + FH * 0.5, 0), shell)
	Parts.box(body, Vector3(0.2, FH, D), Vector3(W * 0.5 + 0.1, FY + FH * 0.5, 0), shell)
	Parts.box(body, Vector3(W + 0.4, FH, 0.2), Vector3(0, FY + FH * 0.5, -D * 0.5 - 0.1), shell)
	Parts.box(body, Vector3(W + 0.4, 0.2, D + 0.4), Vector3(0, FY + FH + 0.1, 0), shell)
	Parts.box(body, Vector3(W - 0.2, FH - 0.2, 0.05), Vector3(0, FY + FH * 0.5, -D * 0.5 + 0.05), PMat.concrete(), false)   # dark interior back wall
	Parts.box(body, Vector3(W + 0.4, 0.4, 0.2), Vector3(0, FY + 0.2, D * 0.5 + 0.1), shell)
	Parts.box(body, Vector3(W + 0.4, 0.3, 0.2), Vector3(0, FY + FH - 0.15, D * 0.5 + 0.1), shell)
	for s in [-1.0, 1.0]: Parts.box(body, Vector3(0.3, FH, 0.2), Vector3(s * (W * 0.5 - 0.05), FY + FH * 0.5, D * 0.5 + 0.1), shell)
	Parts.box(body, Vector3(W - 0.4, FH - 0.7, 0.04), Vector3(0, FY + FH * 0.5, D * 0.5 + 0.12), PMat.glass(Color("#FFB35A")), false)
	# two rows of tubes with pigtails up to the manifold
	for row in range(2):
		for i in range(NT):
			var m := PMat.emissive(Color("#3A3330"), 1.0); _tubes.append(m)
			var x := -W * 0.5 + 0.6 + i * (W - 1.2) / (NT - 1); var z := -0.5 + row * 1.0
			Parts.cyl(body, 0.13, FH - 0.2, Vector3(x, FY + FH * 0.5, z), m, Vector3.ZERO, -1.0, 10, false)
	var top_y := FY + FH + 0.9
	Parts.pipe(body, Vector3(-W * 0.5 - 0.6, top_y, 0), Vector3(W * 0.5 + 0.2, top_y, 0), 0.22, PMat.paint("process"), true)
	for i in range(NT): Parts.pipe(body, Vector3(-W * 0.5 + 0.6 + i * (W - 1.2) / (NT - 1), FY + FH - 0.1, -0.5), Vector3(-W * 0.5 + 0.6 + i * (W - 1.2) / (NT - 1), top_y, 0), 0.06, PMat.dark_metal(), false)
	Parts.pipe(body, Vector3(-W * 0.5 + 0.2, FY + 0.15, 0), Vector3(W * 0.5 + 0.9, FY + 0.15, 0), 0.2, PMat.paint("hot"), true)
	# roof burners
	for i in range(3):
		var bx := -1.8 + i * 1.8
		Parts.cyl(body, 0.28, 0.3, Vector3(bx, FY + FH - 0.45, 0.0), PMat.dark_metal(), Vector3.ZERO, 0.4, 12)
		var f := PFlame.new().setup(1.5, 0.28, i == 1); f.position = Vector3(bx, FY + FH - 0.6, 0.0); f.rotation_degrees.x = 180.0; f.name = "flame%d" % i; body.add_child(f); _flames.append(f)
	# flue stack at the back
	Parts.box(body, Vector3(1.4, 1.2, 1.2), Vector3(0, FY + FH + 0.7, -D * 0.5 - 0.7), shell)
	Parts.stack(body, Vector3(0, FY + FH + 0.4, -D * 0.5 - 0.9), 0.75, 0.5, 4.0, PMat.paint("steel"), 2)
	Parts.platform(body, 0.55, 7.0, 0.6, Vector3(0, 0, -D * 0.5 - 0.9))
	_plume = PPlume.new().setup(Color(0.9, 0.92, 0.95), 1.6, 3.2, 0.9, 3.2, 18, 12.0, 0.05); _plume.position = Vector3(0, FY + FH + 4.6, -D * 0.5 - 0.9); body.add_child(_plume)
	_shim = PShimmer.new().setup(3.0, 3.0); _shim.position = Vector3(0, FY + FH + 4.2, -D * 0.5 - 0.9); body.add_child(_shim)
	_light = OmniLight3D.new(); _light.light_color = Color("#FF8A2C"); _light.omni_range = 7.0; _light.light_energy = 0.0; _light.position = Vector3(0, FY + FH * 0.5, D * 0.5 + 1.2); body.add_child(_light)
	Parts.nozzle(body, Vector3(-W * 0.5 - 0.6, top_y, 0), Vector3.LEFT, 0.22, 0.7); add_port("in", Vector3(-3.95, top_y, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(W * 0.5 + 0.9, FY + 0.15, 0), Vector3.RIGHT, 0.2, 0.5); add_port("out", Vector3(3.95, FY + 0.15, 0), Vector3.RIGHT)

func _apply() -> void:
	var T := dv("T_K", 300.0); var arr: Array = display.get("tubes", [])
	for i in range(_tubes.size()):
		var t := float(arr[i % arr.size()]) if arr.size() > 0 else T + 25.0 * sin(float(i) * 1.7)   # a little scatter: hot spots are what the player watches for
		UMKit.set_furnace(_tubes[i], t, 1.3)
	var fl := clampf(dv("flame", dv("duty", glow())), 0.0, 1.0)
	for f in _flames: f.set_flame(fl, Color("#FF7A18"), Color("#FFE08A"))
	_plume.set_level(dv("plume", fl) * 0.9, Color(0.9, 0.92, 0.95, 1.0))
	_shim.set_amount(fl * 1.2)
	_light.light_energy = 2.0 * UMKit.furnace_k(T)
