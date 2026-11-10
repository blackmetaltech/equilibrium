class_name UMConverter
extends UnitModel
## Equilibrium / packed-bed converter: a tall vessel on a skirt with a platform, ladder and manways. 1-4 bed bands colour by temperature
## (display bands = [T_K,...], or beds + T_K); `health` 0-1 is the catalyst: below 1 the band desaturates toward grey (sintering).
## set_xray(true) fades the shell so the bands show. `anchor_top` sits above the dome for the Equilibrium Window and the balance beam.
var _band_mats: Array[StandardMaterial3D] = []
var _band_nodes: Array[MeshInstance3D] = []
var _beds := 3
var _shell: StandardMaterial3D
var _shim: PShimmer
var _plume: PPlume
const R := 1.55
const Y0 := 1.0
const H := 7.4

func _build() -> void:
	tiles = Vector2i(4, 4); height = 10.4; beacon_pos = Vector3(0.0, 10.3, 0)
	_beds = clampi(int(display.get("beds", 3)), 1, 4)
	Parts.plinth(body, Vector3(7.4, 0.3, 7.4))
	_shell = PMat.shell(Color("#A9B5C4"), 0.4, 0.75); shell_mats.append(_shell)
	Parts.cyl(body, R * 0.82, Y0, Vector3(0, 0.3 + Y0 * 0.5, 0), PMat.paint("steel"), Vector3.ZERO, R * 1.0, 24)   # skirt
	Parts.vessel(body, R, H, _shell, Y0 + 0.3)
	for i in range(5): Parts.cyl(body, R * 1.03, 0.1, Vector3(0, Y0 + 0.3 + i * H / 4.0, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 28, false)
	_make_bands(_beds)
	Parts.platform(body, R, 4.6, 0.9)
	Parts.ladder(body, Vector3(0.0, 0.3, R + 1.1), 4.6, 0.55)
	Parts.platform(body, R, 8.0, 0.8)
	Parts.ladder(body, Vector3(0.0, 4.6, R + 1.0), 3.4, 0.55)
	Parts.cyl(body, 0.42, 0.45, Vector3(R + 0.2, 6.5, 0.0), PMat.dark_metal(), Vector3(0, 0, 90), -1.0, 14)             # manway
	Parts.flange(body, 0.42, Vector3(R + 0.45, 6.5, 0.0), Vector3(0, 0, 90))
	Parts.gauge(body, Vector3(-R - 0.4, 3.2, 0.0), 0.24)
	Parts.nozzle(body, Vector3(0, Y0 + 0.3 + H + 0.75, 0), Vector3.UP, 0.22, 0.6)                                  # relief nozzle on the dome
	Parts.nozzle(body, Vector3(-R, 7.6, 0), Vector3.LEFT, 0.28, 0.7); Parts.nozzle(body, Vector3(R, 1.8, 0), Vector3.RIGHT, 0.28, 0.7)
	add_port("in", Vector3(-R - 0.75, 7.6, 0), Vector3.LEFT); add_port("out", Vector3(R + 0.75, 1.8, 0), Vector3.RIGHT)
	add_port("relief", Vector3(0, Y0 + 0.3 + H + 1.4, 0), Vector3.UP)
	_shim = PShimmer.new().setup(5.0, 6.0); _shim.position = Vector3(0, 4.0, R + 0.3); body.add_child(_shim)
	_plume = PPlume.new().setup(Color(0.95, 0.96, 1.0), 1.4, 2.4, 0.45, 2.8, 10, 25.0); _plume.position = Vector3(R * 0.9, 4.0, 0.0); body.add_child(_plume)

func _make_bands(n: int) -> void:
	for nd in _band_nodes: nd.queue_free()
	_band_nodes.clear(); _band_mats.clear()
	var gap := 0.28; var bh := (H - 0.8 - gap * (n - 1)) / n
	for i in range(n):
		var m := PMat.emissive(Color("#2EC4B6"), 1.3); _band_mats.append(m)
		var y := Y0 + 0.3 + 0.4 + bh * 0.5 + i * (bh + gap)
		_band_nodes.append(Parts.cyl(body, R * 1.012, bh, Vector3(0, y, 0), m, Vector3.ZERO, -1.0, 28, false))

func _apply() -> void:
	var n := clampi(int(display.get("beds", _beds)), 1, 4)
	var bands: Array = display.get("bands", [])
	if bands.size() > 0: n = clampi(bands.size(), 1, 4)
	if n != _beds or _band_mats.size() != n: _beds = n; _make_bands(n)
	var T := dv("T_K", 700.0); var health := clampf(dv("health", 1.0), 0.0, 1.0)
	for i in range(_beds):
		var t := float(bands[i]) if i < bands.size() else T
		var c := PMat.t_ramp(t, 450.0, 850.0)
		var gl := c.get_luminance(); var grey := Color(gl, gl, gl)
		c = grey.lerp(c, health)
		_band_mats[i].albedo_color = c; _band_mats[i].emission = c; _band_mats[i].emission_energy_multiplier = 0.9 + 0.8 * glow()
	var runaway := clampf(dv("runaway"), 0.0, 1.0)
	_shim.set_amount(maxf(glow() * 0.8, runaway * 1.4))
	_plume.set_level(runaway if runaway > 0.3 else 0.0)
	if runaway > 0.0: PMat.set_heat(_shell, maxf(glow(), 0.35 + 0.5 * runaway), 2.0)

func set_xray(on: bool) -> void:
	super.set_xray(on)
