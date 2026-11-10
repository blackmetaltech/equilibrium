class_name UMMultibed
extends UnitModel
## Catalytic converter with visible beds (multibed, packed_bed, eq_bed). Each bed is a band of slices that glow by the bed's temperature
## (display bands = [T_K,...], else beds + T_K; `health` 0-1 greys the catalyst when it sinters). Light-off: `light_off` 0-1 (or a per-bed
## `lit` list) ignites a band from the bottom to the top, unlit catalyst is cold grey. Multibed has quench nozzles in the gaps between beds.
## Ports: in (top), out (bottom), quench (multibed, first gap).
var _slice_mats: Array = []          # per bed: Array[StandardMaterial3D]
var _slice_nodes: Array[MeshInstance3D] = []
var _beds := 3
const R := 1.45
const Y0 := 1.0
const H := 7.0
const GAP := 0.3

func _build() -> void:
	tiles = Vector2i(4, 4); height = 10.2; beacon_pos = Vector3(0.0, 10.1, 0)
	_beds = 1 if (utype == "packed_bed" or utype == "eq_bed") else 3
	_beds = clampi(int(display.get("beds", _beds)), 1, 4)
	Parts.plinth(body, Vector3(7.4, 0.3, 7.4))
	var shell := PMat.shell(Color("#A9B5C4"), 0.4, 0.75); shell_mats.append(shell)
	Parts.cyl(body, R * 0.82, Y0, Vector3(0, 0.3 + Y0 * 0.5, 0), PMat.paint("steel"), Vector3.ZERO, R * 1.0, 24)
	Parts.vessel(body, R, H, shell, Y0 + 0.3)
	for i in range(_beds + 1): Parts.cyl(body, R * 1.03, 0.1, Vector3(0, Y0 + 0.3 + 0.2 + i * (H - 0.4) / _beds, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	_make_bands(_beds)
	Parts.platform(body, R, 4.6, 0.9); Parts.ladder(body, Vector3(0.0, 0.3, R + 1.1), 4.6, 0.55)
	Parts.platform(body, R, 8.0, 0.8); Parts.ladder(body, Vector3(0.0, 4.6, R + 1.0), 3.4, 0.55)
	Parts.gauge(body, Vector3(-R - 0.4, 3.2, 0.0), 0.24)
	Parts.nozzle(body, Vector3(0, Y0 + 0.3 + H + 0.75, 0), Vector3.UP, 0.22, 0.6)
	Parts.nozzle(body, Vector3(-R, 7.6, 0), Vector3.LEFT, 0.28, 0.7); add_port("in", Vector3(-R - 0.75, 7.6, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(R, 1.8, 0), Vector3.RIGHT, 0.28, 0.7); add_port("out", Vector3(R + 0.75, 1.8, 0), Vector3.RIGHT)
	if utype == "multibed":
		# quench-gas nozzles between the beds, a header pipe up the -z side
		var bh := _bed_h(_beds)
		Parts.pipe(body, Vector3(0, 0.6, -R - 1.3), Vector3(0, Y0 + 0.3 + H, -R - 1.3), 0.12, PMat.paint("air"))
		for i in range(_beds - 1):
			var y := Y0 + 0.3 + 0.4 + (bh + GAP) * (i + 1) - GAP * 0.5
			Parts.pipe(body, Vector3(0, y, -R - 1.3), Vector3(0, y, -R), 0.1, PMat.paint("air"), true)
			if i == 0: add_port("quench", Vector3(0, y, -R - 1.4), Vector3(0, 0, -1))

func _bed_h(n: int) -> float: return (H - 0.8 - GAP * (n - 1)) / n

func _make_bands(n: int) -> void:
	for nd in _slice_nodes: nd.queue_free()
	_slice_nodes.clear(); _slice_mats.clear()
	var bh := _bed_h(n); var S := clampi(8 - 2 * (n - 1), 3, 8)
	for i in range(n):
		var mats: Array[StandardMaterial3D] = []
		for j in range(S):
			var m := PMat.emissive(Color("#4A4F58"), 1.0); mats.append(m)
			var y := Y0 + 0.3 + 0.4 + i * (bh + GAP) + (j + 0.5) * bh / S
			_slice_nodes.append(Parts.cyl(body, R * 1.012, bh / S * 0.98, Vector3(0, y, 0), m, Vector3.ZERO, -1.0, 28, false))
		_slice_mats.append(mats)

func _apply() -> void:
	var n := clampi(int(display.get("beds", _beds)), 1, 4)
	var bands: Array = display.get("bands", [])
	if bands.size() > 0: n = clampi(bands.size(), 1, 4)
	if n != _beds or _slice_mats.size() != n: _beds = n; _make_bands(n)
	var T := dv("T_K", 700.0); var health := clampf(dv("health", 1.0), 0.0, 1.0)
	var lit_list: Array = display.get("lit", [])
	for i in range(_beds):
		var t := float(bands[i]) if i < bands.size() else T
		var lit := clampf(float(lit_list[i]) if i < lit_list.size() else dv("light_off", 1.0), 0.0, 1.0)
		var c := PMat.t_ramp(t, 450.0, 850.0); var gl := c.get_luminance(); c = Color(gl, gl, gl).lerp(c, health)
		var mats: Array = _slice_mats[i]; var S := mats.size()
		for j in range(S):
			var m: StandardMaterial3D = mats[j]
			var f := clampf(lit * S - j, 0.0, 1.0)              # slice j (bottom = 0) ignites as the front climbs
			var cold := Color("#4A4F58")
			m.albedo_color = cold.lerp(c, f); m.emission = cold.lerp(c, f) if f > 0.0 else Color.BLACK
			m.emission_energy_multiplier = (0.9 + 0.8 * glow()) * f
	var runaway := clampf(dv("runaway"), 0.0, 1.0)
	if runaway > 0.0: shake_hold(0.04 * runaway)
