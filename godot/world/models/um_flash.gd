class_name UMFlash
extends UnitModel
## Flash drum (also the NH3 separator): a vertical drum on legs with a sight glass. level 0-1 fills the glass; below 0 C the drum frosts.
## display color tints the liquid. Ports: in, vap (top), liq (bottom).
var _fill: MeshInstance3D
var _frost: MeshInstance3D
var _shell: StandardMaterial3D
const GH := 2.2

func _build() -> void:
	tiles = Vector2i(2, 2); height = 5.4; beacon_pos = Vector3(0.7, 5.3, 0.7)
	Parts.plinth(body, Vector3(3.6, 0.15, 3.6))
	_shell = PMat.shell(Color("#B7C2D0"), 0.4, 0.7); shell_mats.append(_shell)
	for k in range(4): Parts.box(body, Vector3(0.14, 1.2, 0.14), Vector3(cos(k * PI / 2 + PI / 4) * 0.75, 0.75, sin(k * PI / 2 + PI / 4) * 0.75), PMat.paint("steel"))
	Parts.vessel(body, 0.95, 3.0, _shell, 1.35)
	var fm := StandardMaterial3D.new(); fm.albedo_color = Color(0.9, 0.97, 1.0, 0.0); fm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_frost = Parts.cyl(body, 0.985, 3.05, Vector3(0, 1.35 + 1.5, 0), fm, Vector3.ZERO, -1.0, 28, false)
	Parts.box(body, Vector3(0.36, GH + 0.2, 0.14), Vector3(0.0, 2.9, 1.02), PMat.dark_metal(), false)
	Parts.box(body, Vector3(0.22, GH, 0.05), Vector3(0.0, 2.9, 1.1), PMat.glass(Color("#9fb4c8")), false)
	_fill = Parts.box(body, Vector3(0.18, 1.0, 0.05), Vector3(0.0, 2.0, 1.12), PMat.emissive(Color("#4CC9F0"), 1.8), false)
	Parts.cyl(body, 0.3, 0.2, Vector3(0.0, 1.35 + 3.0 + 0.45, 0.0), PMat.dark_metal(), Vector3.ZERO, -1.0, 12)
	Parts.nozzle(body, Vector3(-0.95, 3.9, 0), Vector3.LEFT, 0.2, 0.5); add_port("in", Vector3(-1.45, 3.9, 0), Vector3.LEFT)
	Parts.nozzle(body, Vector3(0, 4.9, 0), Vector3.UP, 0.22, 0.4); add_port("vap", Vector3(0, 5.3, 0), Vector3.UP)
	Parts.nozzle(body, Vector3(0, 1.0, 0.0), Vector3.RIGHT, 0.17, 1.2); add_port("liq", Vector3(1.2, 1.0, 0), Vector3.RIGHT)
	Parts.pipe(body, Vector3(0, 1.0, 0), Vector3(0, 1.4, 0), 0.17, PMat.metal())

func _apply() -> void:
	var lv := clampf(dv("level", 0.4), 0.0, 1.0)
	var col := PMat.species(display.get("color", "#4CC9F0"))
	var h := maxf(0.02, GH * lv); _fill.scale = Vector3(1, h, 1); _fill.position.y = 2.9 - GH * 0.5 + h * 0.5
	var m := _fill.material_override as StandardMaterial3D; m.albedo_color = col; m.emission = col
	var T := dv("T_K", 300.0)
	(_frost.material_override as StandardMaterial3D).albedo_color.a = clampf((273.15 - T) / 40.0, 0.0, 0.8); _frost.visible = T < 273.15
