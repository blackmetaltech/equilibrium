class_name UMColumn
extends UnitModel
## Distillation column: a tall slim shell with a tray ladder on its flank, an overhead condenser and reflux drum, a reboiler at the foot.
## The ladder is a strip of tray lamps coloured cold-to-hot by tray temperature: `trays` = [T_K, ...] top to bottom, else linear between
## `T_top` and `T_bot`. `level` is the sump sight glass, `reflux` 0-1 the reflux drum. Ports: in (feed, mid), vap (overhead), liq (bottoms).
var _lamps: Array[StandardMaterial3D] = []
var _fill: MeshInstance3D
var _drum_fill: MeshInstance3D
var _reb: StandardMaterial3D
const R := 0.8
const N := 10
const Y0 := 1.3
const H := 8.0

func _build() -> void:
	tiles = Vector2i(2, 2); height = 11.4; beacon_pos = Vector3(0, 10.9, 0)
	Parts.plinth(body, Vector3(3.8, 0.2, 3.8))
	var shell := PMat.shell(Color("#C9D0D8"), 0.45, 0.5); shell_mats.append(shell)
	Parts.cyl(body, R * 0.8, 0.9, Vector3(0, 0.65, 0), PMat.paint("steel"), Vector3.ZERO, R, 20)
	Parts.vessel(body, R, H, shell, Y0)
	for i in range(N + 1): Parts.cyl(body, R * 1.04, 0.06, Vector3(0, Y0 + i * H / N, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 24, false)
	for i in range(N):
		var m := PMat.emissive(Color("#2EC4B6"), 1.2); _lamps.append(m)
		Parts.box(body, Vector3(0.3, H / N * 0.7, 0.06), Vector3(0, Y0 + (i + 0.5) * H / N, R + 0.04), m, false)
	Parts.box(body, Vector3(0.44, H + 0.1, 0.06), Vector3(0, Y0 + H * 0.5, R + 0.0), PMat.dark_metal(), false)
	Parts.platform(body, R, 5.0, 0.6); Parts.ladder(body, Vector3(0.0, 0.2, -R - 0.7), 5.0, 0.5).rotation_degrees.y = 180.0
	# overhead condenser (cooler tubes on the +x side) and its reflux drum
	Parts.pipe(body, Vector3(0, Y0 + H + 0.6, 0), Vector3(1.2, Y0 + H + 0.6, 0), 0.2, PMat.paint("process"), true)
	Parts.vessel_h(body, 0.35, 1.2, PMat.paint("water"), Vector3(1.5, Y0 + H + 0.2, 0.0))
	Parts.pipe(body, Vector3(1.5, Y0 + H - 0.2, 0), Vector3(1.5, Y0 + H - 1.1, 0), 0.12, PMat.paint("process"))
	Parts.vessel_h(body, 0.3, 0.9, PMat.paint("tank"), Vector3(1.5, Y0 + H - 1.4, 0.0))
	_drum_fill = Parts.box(body, Vector3(0.5, 0.2, 0.1), Vector3(1.5, Y0 + H - 1.45, 0.34), PMat.emissive(Color("#4CC9F0"), 1.4), false)
	Parts.pipe(body, Vector3(1.5, Y0 + H - 1.4, 0.0), Vector3(R * 0.8, Y0 + H - 1.4, 0.0), 0.1, PMat.paint("process"))
	# reboiler: a short horizontal shell at the foot, heated by its own colour
	_reb = PMat.shell(Color("#B8553F"), 0.5, 0.4)
	Parts.cyl(body, 0.4, 1.2, Vector3(-1.4, 0.7, 0.0), _reb, Vector3(0, 0, 90), -1.0, 18)
	Parts.pipe(body, Vector3(-1.4, 0.9, 0), Vector3(-R * 0.7, Y0 + 0.5, 0), 0.12, PMat.paint("steam"))
	# sump sight glass
	Parts.box(body, Vector3(0.2, 1.1, 0.1), Vector3(-R * 0.55, Y0 + 0.8, R * 0.75), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.12, 0.9, 0.04), Vector3(-R * 0.55, Y0 + 0.8, R * 0.75 + 0.07), PMat.glass(Color("#9fb4c8")), false)
	_fill = Parts.box(body, Vector3(0.1, 0.5, 0.04), Vector3(-R * 0.55, Y0 + 0.6, R * 0.75 + 0.1), PMat.emissive(Color("#E8D17A"), 1.4), false)
	Parts.nozzle(body, Vector3(-R, Y0 + H * 0.5, 0), Vector3.LEFT, 0.18, 0.6); add_port("in", Vector3(-R - 0.65, Y0 + H * 0.5, 0), Vector3.LEFT)
	var e := Parts.nozzle(body, Vector3(0, Y0 + H + 0.9, 0), Vector3.UP, 0.18, 0.4); add_port("vap", e + Vector3(0, 0.2, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(0.0, 0.55, 0), Vector3.RIGHT, 0.17, 1.4); add_port("liq", Vector3(1.55, 0.55, 0), Vector3.RIGHT)

func _apply() -> void:
	var tr: Array = display.get("trays", [])
	var top := dv("T_top", 330.0); var bot := dv("T_bot", 400.0)
	var lo := minf(top, bot) - 20.0; var hi := maxf(top, bot) + 20.0
	if tr.size() > 0:
		lo = 1e9; hi = -1e9
		for v in tr: lo = minf(lo, float(v)); hi = maxf(hi, float(v))
		lo -= 15.0; hi += 15.0
	for i in range(N):
		var t := float(tr[mini(i * tr.size() / N, tr.size() - 1)]) if tr.size() > 0 else lerpf(top, bot, float(i) / (N - 1))
		var c := PMat.t_ramp(t, lo, hi); _lamps[i].albedo_color = c; _lamps[i].emission = c
	var lv := clampf(dv("level", 0.5), 0.0, 1.0); var h := maxf(0.02, 0.9 * lv)
	_fill.scale = Vector3(1, h / 0.5, 1); _fill.position.y = Y0 + 0.8 - 0.45 + h * 0.5
	var rf := clampf(dv("reflux", 0.5), 0.0, 1.0)
	_drum_fill.scale = Vector3(1, maxf(0.1, rf * 2.0), 1)
	_reb.albedo_color = Color("#B8553F").lerp(PMat.t_ramp(bot, lo, hi), 0.3); PMat.set_heat(_reb, PMat.heat(bot) * 0.6, 1.0)
