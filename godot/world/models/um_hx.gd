class_name UMHx
extends UnitModel
## Shell-and-tube exchanger on saddles. The shell is eight rings whose colour runs from the hot end to the cold end (display grad =
## [T_hot_end, T_cold_end] in K, default from T_K). Ports: hot_in, hot_out, cold_in, cold_out.
var _segs: Array[StandardMaterial3D] = []
const N := 8

func _build() -> void:
	tiles = Vector2i(4, 2); height = 3.2; beacon_pos = Vector3(-3.4, 3.1, 0)
	var y := 1.25; var L := 5.4; var r := 0.8
	Parts.plinth(body, Vector3(7.4, 0.15, 3.2))
	for i in range(N):
		var m := PMat.shell(Color("#C3CAD2"), 0.5, 0.5); _segs.append(m)
		var seg_l := L / N
		Parts.cyl(body, r, seg_l * 0.96, Vector3(-L * 0.5 + seg_l * (i + 0.5), y, 0), m, Vector3(0, 0, 90), -1.0, 24)
		Parts.cyl(body, r * 1.04, 0.06, Vector3(-L * 0.5 + seg_l * i, y, 0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 24, false)
	var hd := PMat.paint("process")
	for s in [-1.0, 1.0]:
		Parts.cyl(body, r * 1.12, 0.7, Vector3(s * (L * 0.5 + 0.35), y, 0), hd, Vector3(0, 0, 90), -1.0, 24)
		Parts.sphere(body, r * 1.1, Vector3(s * (L * 0.5 + 0.7), y, 0), hd, 0.55).rotation_degrees.z = -90.0 * s
	Parts.saddle(body, -1.8, r, y); Parts.saddle(body, 1.8, r, y)
	# shell-side nozzles (top and bottom), tube-side nozzles on the heads
	var xs := -1.9
	Parts.nozzle(body, Vector3(xs, y + r * 0.9, 0), Vector3.UP, 0.22, 0.9); add_port("hot_in", Vector3(xs, y + r * 0.9 + 0.9, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(-xs, y - r * 0.9, 0), Vector3.DOWN, 0.22, 0.2); add_port("hot_out", Vector3(-xs, y - r * 0.9 - 0.2, 0), Vector3.DOWN)
	Parts.nozzle(body, Vector3(L * 0.5 + 0.9, y + r * 0.7, 0), Vector3.UP, 0.2, 0.7); add_port("cold_in", Vector3(L * 0.5 + 0.9, y + r * 0.7 + 0.7, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(-L * 0.5 - 0.9, y + r * 0.7, 0), Vector3.UP, 0.2, 0.7); add_port("cold_out", Vector3(-L * 0.5 - 0.9, y + r * 0.7 + 0.7, 0), Vector3.UP)

func _apply() -> void:
	var T := dv("T_K", 350.0)
	var g: Array = display.get("grad", [T + 40.0, T - 40.0])
	var th := float(g[0]); var tc := float(g[1])
	for i in range(N):
		var t := lerpf(th, tc, float(i) / (N - 1))
		var c := PMat.t_ramp(t, 280.0, 700.0)
		_segs[i].albedo_color = Color("#C3CAD2").lerp(c, 0.75)
		PMat.set_heat(_segs[i], PMat.heat(t), 1.2)
