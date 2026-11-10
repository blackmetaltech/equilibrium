class_name UMCooler
extends UnitModel
## Air-fin cooler: a tube bundle on an A-frame under two fans. spin 0-1 sets the fan speed (about 4 turns/s); below 0 C the bundle frosts.
var _fans: Array[Node3D] = []
var _frost: MeshInstance3D
var _bundle: StandardMaterial3D

func _build() -> void:
	tiles = Vector2i(4, 2); height = 4.4; beacon_pos = Vector3(-3.4, 4.2, 1.2)
	Parts.plinth(body, Vector3(7.6, 0.18, 3.6))
	_bundle = PMat.shell(Color("#B0B8C2"), 0.5, 0.6); shell_mats.append(_bundle)
	for sx in [-3.2, 3.2]:
		for sz in [-1.1, 1.1]: Parts.box(body, Vector3(0.2, 2.0, 0.2), Vector3(sx, 1.2, sz), PMat.paint("steel"))
	Parts.box(body, Vector3(7.0, 0.5, 2.6), Vector3(0, 2.4, 0), _bundle)
	for i in range(14): Parts.box(body, Vector3(0.06, 0.52, 2.7), Vector3(-3.25 + i * 0.5, 2.4, 0), PMat.dark_metal(), false)
	for sx in [-3.7, 3.7]: Parts.box(body, Vector3(0.5, 0.7, 2.7), Vector3(sx, 2.4, 0), PMat.paint("water"))
	_frost = Parts.box(body, Vector3(7.05, 0.56, 2.65), Vector3(0, 2.4, 0), _frost_mat(), false)
	for sx in [-1.75, 1.75]:
		Parts.cyl(body, 1.25, 0.9, Vector3(sx, 3.15, 0), PMat.paint("air"), Vector3.ZERO, 1.0, 20)
		var f := Node3D.new(); f.position = Vector3(sx, 3.2, 0); body.add_child(f); _fans.append(f)
		for k in range(4):
			var p := Node3D.new(); f.add_child(p); p.rotation_degrees.y = 90.0 * k
			Parts.box(p, Vector3(1.1, 0.04, 0.34), Vector3(0.55, 0, 0), PMat.dark_metal(), false)
		Parts.cyl(f, 0.18, 0.12, Vector3.ZERO, PMat.metal(), Vector3.ZERO, -1.0, 10, false)
		Parts.box(body, Vector3(2.4, 0.04, 0.05), Vector3(sx, 3.62, 0), PMat.dark_metal(), false); Parts.box(body, Vector3(0.05, 0.04, 2.4), Vector3(sx, 3.62, 0), PMat.dark_metal(), false)
	add_port("in", Vector3(-4.0, 2.4, 0), Vector3.LEFT); add_port("out", Vector3(4.0, 2.4, 0), Vector3.RIGHT)
	Parts.nozzle(body, Vector3(-3.9, 2.4, 0), Vector3.LEFT, 0.25, 0.2); Parts.nozzle(body, Vector3(3.9, 2.4, 0), Vector3.RIGHT, 0.25, 0.2)

func _frost_mat() -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = Color(0.9, 0.97, 1.0, 0.0); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; return m

func _apply() -> void:
	var T := dv("T_K", 320.0)
	(_frost.material_override as StandardMaterial3D).albedo_color.a = clampf((273.15 - T) / 50.0, 0.0, 0.85)
	_frost.visible = T < 273.15
	_bundle.albedo_color = Color("#B0B8C2").lerp(Color("#4CC9F0"), clampf((300.0 - T) / 120.0, 0.0, 0.5))

func _tick(dt: float) -> void:
	for f in _fans: spin_node(f, Vector3.UP, dv("spin") * 4.0, dt)
