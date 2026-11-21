class_name DisplayScene
extends Node3D
## Display-only plants for the board levels (L33-L38, CAREER), which carry no engine units: the carrier plant is drawn from the real unit models so the
## slab is never empty. Nothing here is pickable or piped; ids are tags only. `build(level_id)` returns false when the level has no scene.
const GRID := 2.0
var world: PlantWorld
var level := ""

## Scenes: [type, tile x, tile y, rot, id-tag] for units; the helpers below add sensors, blinds, meters, a crane and straight pipes.
const UNITS := {
	"L29": [["feed", 3, 6, 0, "F-100"], ["flash", 9, 6, 0, "D-101"], ["valve", 14, 6, 0, "LV-101"], ["product", 17, 5, 0, "T-102"]],
	"L30": [["feed", 3, 6, 0, "F-100"], ["heater", 8, 5, 0, "E-101"], ["converter", 14, 5, 0, "R-101"], ["product", 20, 5, 0, "T-102"]],
	"L31": [["feed", 2, 3, 0, "H2"], ["feed", 2, 10, 0, "N2"], ["mixer", 11, 6, 0, "M-103"], ["product", 17, 5, 0, "T-104"]],
	"L32": [["feed", 2, 6, 0, "F-100"], ["converter", 8, 5, 0, "R-101"], ["valve", 10, 3, 0, "QV-101"], ["product", 17, 5, 0, "T-102"]],
	"L33": [["cstr", 10, 5, 0, "R-101"], ["cooler", 15, 6, 0, "C-102"], ["feed", 4, 6, 0, "F-100"], ["product", 18, 10, 0, "T-103"]],
	"L34": [["feed", 3, 5, 0, "F-100"], ["converter", 8, 4, 0, "R-101"], ["hx", 14, 5, 0, "E-102"], ["product", 19, 5, 0, "T-103"]],
	"L35": [["feed", 2, 3, 0, "F-100"], ["converter", 8, 3, 0, "R-101"], ["hx", 14, 4, 0, "E-102"], ["flash", 19, 3, 0, "D-103"], ["compressor", 12, 9, 2, "K-104"], ["product", 19, 9, 0, "T-105"]],
	"L36": [["feed", 4, 6, 0, "F-100"], ["hx", 10, 6, 0, "E-101"], ["product", 17, 6, 0, "T-102"]],
	"L37": [["feed", 2, 3, 0, "F-100"], ["converter", 9, 2, 0, "R-101"], ["flash", 16, 3, 0, "D-102"], ["product", 19, 10, 0, "T-103"]],
	"L38": [["feed", 2, 4, 0, "F-100"], ["converter", 8, 3, 0, "R-101"], ["hx", 14, 4, 0, "E-102"], ["flash", 19, 3, 0, "D-103"], ["compressor", 8, 10, 0, "K-104"], ["stack", 15, 10, 0, "Z-105"], ["product", 19, 9, 0, "T-106"]],
	"L39": [["product", 3, 8, 0, "T-301"], ["compressor", 9, 9, 0, "P-301"], ["flash", 17, 4, 0, "D-302"]],
	"CAREER": [["feed", 1, 1, 0, "A"], ["converter", 6, 1, 0, "A"], ["product", 11, 1, 0, "A"],
		["feed", 13, 1, 0, "B"], ["cstr", 18, 1, 0, "B"],
		["feed", 1, 9, 0, "C"], ["flash", 6, 9, 0, "C"], ["product", 9, 9, 0, "C"],
		["feed", 13, 9, 0, "D"], ["boiler", 18, 9, 0, "D"], ["stack", 22, 9, 0, "D"]],
}

func has_scene(id: String) -> bool: return UNITS.has(id)

func build(id: String) -> bool:
	clear()
	if not UNITS.has(id): return false
	level = id
	var tiles := {}
	for u in UNITS[id]:
		var m := UnitModels.create(str(u[0]), "deco_" + str(u[4]))
		add_child(m)
		var fp := UnitModels.footprint(str(u[0]), int(u[3]))
		m.position = world.tile_to_world(Vector2i(int(u[1]), int(u[2])), fp); m.rotation_degrees.y = -90.0 * int(u[3])
		tiles[str(u[4]) + str(u[0])] = m
		if id != "CAREER": _tag(m, str(u[4]), fp)
	_extras(id)
	return true

func clear() -> void:
	for c in get_children(): c.queue_free()

func _tag(m: UnitModel, text: String, fp: Vector2i) -> void:
	var lb := Label3D.new(); lb.text = text; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true; lb.pixel_size = 0.0011; lb.font_size = 36
	lb.outline_size = 10; lb.outline_modulate = Color(0, 0, 0, 0.85); lb.modulate = Color("#F4F1DE"); lb.font = EqTheme.font("semi")
	lb.position = Vector3(0, m.height + 0.9, 0); m.add_child(lb)

func _tile(x: float, z: float) -> Vector3:
	return Vector3(-PlantWorld.PLOT.x * 0.5 + GRID * x, 0.0, -PlantWorld.PLOT.y * 0.5 + GRID * z)

func _mat(col: Color, emit := 0.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = 0.5; m.metallic = 0.4
	if emit > 0.0: m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = emit
	return m

func _cyl(a: Vector3, b: Vector3, r: float, col: Color) -> void:
	var d := b - a; var l := d.length()
	if l < 0.01: return
	var mi := MeshInstance3D.new(); var cm := CylinderMesh.new(); cm.top_radius = r; cm.bottom_radius = r; cm.height = l; cm.radial_segments = 10; mi.mesh = cm
	mi.material_override = _mat(col); add_child(mi)
	mi.position = (a + b) * 0.5
	var up := d.normalized(); var axis := Vector3.UP.cross(up)
	if axis.length() > 0.001: mi.basis = Basis(axis.normalized(), Vector3.UP.angle_to(up))
	elif up.y < 0.0: mi.basis = Basis(Vector3.RIGHT, PI)

func _box(size: Vector3, pos: Vector3, col: Color, emit := 0.0) -> MeshInstance3D:
	var mi := MeshInstance3D.new(); var bm := BoxMesh.new(); bm.size = size; mi.mesh = bm; mi.material_override = _mat(col, emit); mi.position = pos; add_child(mi); return mi

func _pipe(a: Vector3, b: Vector3, _x: float) -> void: _cyl(a, b, 0.22, Color("#6D7480"))

func _label(text: String, pos: Vector3, col := Color("#F4F1DE")) -> void:
	var lb := Label3D.new(); lb.text = text; lb.billboard = BaseMaterial3D.BILLBOARD_ENABLED; lb.no_depth_test = true; lb.fixed_size = true; lb.pixel_size = 0.0011; lb.font_size = 34
	lb.outline_size = 10; lb.outline_modulate = Color(0, 0, 0, 0.85); lb.modulate = col; lb.font = EqTheme.font("semi"); lb.position = pos; add_child(lb)

func _sensor(p: Vector3, h: float, tag: String) -> void:
	_cyl(p, p + Vector3(0, h, 0), 0.07, Color("#B7BFBB"))
	_box(Vector3(0.45, 0.3, 0.45), p + Vector3(0, h + 0.15, 0), Color("#2EC4B6"), 1.2)
	_label(tag, p + Vector3(0, h + 0.9, 0))

func _extras(id: String) -> void:
	var y := 1.0
	match id:
		"L29":   # a feed drum under level control: the drum, its level sensor and the outlet valve the controller drives
			var c := _tile(10.0, 7.0)
			_pipe(_tile(7.0, 7.0) + Vector3(0, y, 0), _tile(9.0, 7.0) + Vector3(0, y, 0), 0.0); _pipe(_tile(11.0, 7.0) + Vector3(0, y, 0), _tile(14.5, 6.5) + Vector3(0, y, 0), 0.0)
			_pipe(_tile(15.5, 6.5) + Vector3(0, y, 0), _tile(17.0, 7.0) + Vector3(0, y, 0), 0.0)
			_sensor(c + Vector3(-1.6, 1.0, 2.2), 2.4, "LT-101"); _label("LIC-101", c + Vector3(3.2, 1.8, 3.2), Color("#2EC4B6"))
		"L30":   # the converter inlet: a heater, the inlet temperature sensor and its controller
			_pipe(_tile(7.0, 7.0) + Vector3(0, y, 0), _tile(8.0, 6.5) + Vector3(0, y, 0), 0.0); _pipe(_tile(11.0, 6.5) + Vector3(0, y, 0), _tile(14.0, 7.0) + Vector3(0, y, 0), 0.0)
			_pipe(_tile(18.0, 7.0) + Vector3(0, y, 0), _tile(20.0, 7.0) + Vector3(0, y, 0), 0.0)
			_sensor(_tile(12.5, 6.5) + Vector3(0, y, 1.8), 1.6, "TT-101"); _label("TIC-101", _tile(12.5, 6.5) + Vector3(0, 4.6, 1.8), Color("#2EC4B6"))
		"L31":   # two gas feeds and a ratio station: H2 follows N2
			for pr in [[6.0, 4.0, 9.0, 4.0], [9.0, 4.0, 9.0, 7.0], [9.0, 7.0, 11.0, 7.0], [6.0, 11.0, 9.0, 11.0], [9.0, 11.0, 9.0, 7.0], [13.0, 7.0, 17.0, 7.0]]:
				_pipe(_tile(pr[0], pr[1]) + Vector3(0, y, 0), _tile(pr[2], pr[3]) + Vector3(0, y, 0), 0.0)
			_sensor(_tile(7.4, 4.0) + Vector3(0, y, 1.2), 1.0, "FT-H2"); _sensor(_tile(7.4, 11.0) + Vector3(0, y, 1.2), 1.0, "FT-N2")
			_box(Vector3(1.8, 1.4, 1.2), _tile(9.0, 7.0) + Vector3(0, 3.0, 0), Color("#E7E3D8")); _label("RATIO H2 : N2", _tile(9.0, 7.0) + Vector3(0, 4.6, 0), Color("#FFB703"))
		"L32":   # a converter bed with its quench valve on the cold-gas header: the temperature master drives the quench
			_pipe(_tile(6.0, 7.0) + Vector3(0, y, 0), _tile(8.0, 7.0) + Vector3(0, y, 0), 0.0); _pipe(_tile(12.0, 7.0) + Vector3(0, y, 0), _tile(17.0, 7.0) + Vector3(0, y, 0), 0.0)
			var h0 := _tile(3.0, 3.5) + Vector3(0, 2.0, 0); var h1 := _tile(22.0, 3.5) + Vector3(0, 2.0, 0)
			_pipe(h0, h1, 0.0); _label("COLD-GAS HEADER", _tile(14.5, 3.5) + Vector3(0, 3.4, 0), Color("#8AD7FF"))
			_pipe(_tile(10.5, 3.5) + Vector3(0, 2.0, 0), _tile(10.5, 5.0) + Vector3(0, 2.0, 0), 0.0)
			_sensor(_tile(10.0, 7.0) + Vector3(0, y, 2.8), 2.0, "TT-101"); _label("TIC-101", _tile(10.0, 7.0) + Vector3(0, 10.5, 2.8), Color("#2EC4B6"))
		"L33":
			var c := _tile(12.0, 7.0)   # the CSTR centre (10..14, 5..9)
			_pipe(_tile(8.0, 7.0) + Vector3(0, y, 0), c + Vector3(-2.0, y, 0), 0.0); _pipe(c + Vector3(2.0, y, 0.0), _tile(15.0, 7.0) + Vector3(0, y, 0), 0.0)
			for i in 3: _sensor(c + Vector3(-1.4 + 1.4 * i, 1.0 + 0.6 * i, 2.6), 1.2 + 0.5 * i, "TT-%d" % (i + 1))
		"L34":
			_pipe(_tile(7.0, 6.0) + Vector3(0, y, 0), _tile(8.0, 6.0) + Vector3(0, y, 0), 0.0); _pipe(_tile(12.0, 6.0) + Vector3(0, y, 0), _tile(14.0, 6.0) + Vector3(0, y, 0), 0.0)
			_pipe(_tile(18.0, 6.0) + Vector3(0, y, 0), _tile(19.0, 6.0) + Vector3(0, y, 0), 0.0)
			_label("WASTE-HEAT COOLER", _tile(16.0, 6.0) + Vector3(0, 1.0, 4.8), Color("#FFB703"))
		"L35":
			for pr in [[6.0, 5.0, 8.0, 5.0], [12.0, 5.0, 14.0, 5.0], [18.0, 5.0, 19.0, 5.0], [20.5, 7.0, 20.5, 9.0], [19.0, 10.0, 15.0, 10.0], [12.0, 10.0, 11.0, 10.0], [11.0, 10.0, 11.0, 6.0]]:
				_pipe(_tile(pr[0], pr[1]) + Vector3(0, y, 0), _tile(pr[2], pr[3]) + Vector3(0, y, 0), 0.0)
			_label("RECYCLE LOOP", _tile(14.0, 11.5) + Vector3(0, 2.5, 0), Color("#2EC4B6"))
		"L36":
			_pipe(_tile(8.0, 7.0) + Vector3(0, y, 0), _tile(10.0, 7.0) + Vector3(0, y, 0), 0.0); _pipe(_tile(14.0, 7.0) + Vector3(0, y, 0), _tile(17.0, 7.0) + Vector3(0, y, 0), 0.0)
			for i in 4:   # blind flanges at the exchanger nozzles: open (green) or closed (red)
				var bp := _tile(10.0 + 1.3 * i, 6.0) + Vector3(0, 2.4, 0)
				_box(Vector3(0.9, 0.12, 0.9), bp, Color("#E63946") if i % 2 == 0 else Color("#38D96B"), 1.0)
				_label("BL-%d" % (i + 1), bp + Vector3(0, 0.9, 0))
		"L37":
			var a := _tile(3.0, 8.0) + Vector3(0, 2.0, 0); var b := _tile(22.0, 8.0) + Vector3(0, 2.0, 0)
			_pipe(a, b, 0.0)
			for i in 5:   # a header with five meters
				var mp := a.lerp(b, (i + 0.5) / 5.0)
				_cyl(mp, mp + Vector3(0, 1.0, 0), 0.08, Color("#B7BFBB")); _cyl(mp + Vector3(0, 1.3, 0), mp + Vector3(0, 1.3, 0.12), 0.45, Color("#F4EEE2"))
				_label("FI-%d" % (i + 1), mp + Vector3(0, 2.4, 0))
		"L38":
			for pr in [[6.0, 5.0, 8.0, 5.0], [12.0, 5.0, 14.0, 5.0], [18.0, 5.0, 19.0, 5.0], [10.0, 7.0, 10.0, 10.0], [12.0, 11.0, 15.0, 11.0]]:
				_pipe(_tile(pr[0], pr[1]) + Vector3(0, y, 0), _tile(pr[2], pr[3]) + Vector3(0, y, 0), 0.0)
			_crane(_tile(10.0, 6.0))   # the plant under maintenance
			_label("TURNAROUND", _tile(10.0, 6.0) + Vector3(0, 12.5, 0), Color("#FFB703"))
		"L39":   # the condensate return: tank at grade, the pump on its plinth, a riser up to the deaerator on the boiler-house deck
			_pipe(_tile(6.0, 10.0) + Vector3(0, 0.6, 0), _tile(9.0, 10.0) + Vector3(0, 0.6, 0), 0.0)
			_pipe(_tile(11.0, 10.0) + Vector3(0, 0.8, 0), _tile(15.0, 10.0) + Vector3(0, 0.8, 0), 0.0)
			_pipe(_tile(15.0, 10.0) + Vector3(0, 0.8, 0), _tile(15.0, 10.0) + Vector3(0, 7.0, 0), 0.0)
			_pipe(_tile(15.0, 10.0) + Vector3(0, 7.0, 0), _tile(15.0, 5.0) + Vector3(0, 7.0, 0), 0.0)
			_box(Vector3(9.0, 0.4, 6.0), _tile(18.0, 5.0) + Vector3(0, 0.2, 0), Color("#7C7466"))
			_label("PUMP HOUSE", _tile(10.0, 9.0) + Vector3(0, 3.6, 0), Color("#FFB703"))
		"CAREER":
			for g in [[1.0, 6.2, "PLANT A"], [13.0, 6.2, "PLANT B"], [1.0, 14.0, "PLANT C"], [13.0, 14.0, "PLANT D"]]:
				_label(str(g[2]), _tile(float(g[0]) + 4.0, float(g[1])) + Vector3(0, 0.5, 0), Color("#FFB703"))

func _crane(base: Vector3) -> void:
	var col := Color("#FFB703")
	_box(Vector3(2.4, 0.6, 2.4), base + Vector3(0, 0.3, 0), Color("#3A3C42"))
	_cyl(base + Vector3(0, 0.6, 0), base + Vector3(0, 11.0, 0), 0.3, col)
	_cyl(base + Vector3(-3.0, 11.0, 0), base + Vector3(9.0, 11.0, 0), 0.22, col)
	_cyl(base + Vector3(4.0, 11.0, 0), base + Vector3(4.0, 5.0, 0), 0.04, Color("#222222"))
	_box(Vector3(0.7, 0.5, 0.7), base + Vector3(4.0, 4.8, 0), Color("#E63946"), 0.6)
