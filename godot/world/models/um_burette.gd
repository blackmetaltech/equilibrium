class_name UMBurette
extends UnitModel
## Gas burette on a clamp stand with a levelling bulb: a graduated glass tube whose water column drops as gas collects. `volume` 0-1 is the
## gas filled from the top (the water surface falls to match), `color` tints the water; `bulb` 0-1 raises or lowers the levelling bulb
## (pressure equalised when the two surfaces match). Ports: in (stopcock at the top).
var _water: MeshInstance3D
var _gas: MeshInstance3D
var _bulb: Node3D
var _bulb_fill: MeshInstance3D
var _hose: MeshInstance3D
const TH := 3.6
const BY := 1.4

func _build() -> void:
	tiles = Vector2i(2, 2); height = 6.0; beacon_pos = Vector3(0.3, 5.7, 0)
	Parts.box(body, Vector3(3.6, 0.15, 3.0), Vector3(0, 0.075, 0), PMat.paint("steel"))
	Parts.box(body, Vector3(1.6, 0.15, 1.2), Vector3(0, 0.22, 0), PMat.dark_metal())
	Parts.cyl(body, 0.05, 5.4, Vector3(-0.2, 2.9, -0.6), PMat.metal(), Vector3.ZERO, -1.0, 8, false)
	Parts.box(body, Vector3(0.7, 0.07, 0.07), Vector3(0.1, 4.2, -0.5), PMat.metal(), false)
	Parts.cyl(body, 0.13, TH, Vector3(0, BY + TH * 0.5, 0), PMat.glass(Color("#E6E9EE")), Vector3.ZERO, -1.0, 14, false)
	var wm := PMat.emissive(Color("#4CC9F0"), 0.8); wm.albedo_color.a = 0.8; wm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_water = Parts.cyl(body, 0.105, 1.0, Vector3(0, BY, 0), wm, Vector3.ZERO, -1.0, 14, false)
	var gm := StandardMaterial3D.new(); gm.albedo_color = Color(0.95, 0.9, 0.8, 0.22); gm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_gas = Parts.cyl(body, 0.105, 1.0, Vector3(0, BY + TH, 0), gm, Vector3.ZERO, -1.0, 14, false)
	for k in range(19): Parts.box(body, Vector3(0.34 if k % 5 == 0 else 0.24, 0.015, 0.02), Vector3(0.0, BY + 0.1 + k * (TH - 0.2) / 18.0, 0.15), PMat.dark_metal(), false)
	Parts.cyl(body, 0.08, 0.3, Vector3(0, BY + TH + 0.2, 0), PMat.dark_metal(), Vector3.ZERO, -1.0, 12)              # stopcock
	Parts.box(body, Vector3(0.3, 0.05, 0.08), Vector3(0, BY + TH + 0.2, 0), PMat.red(), false)
	Parts.pipe(body, Vector3(0, BY - 0.1, 0), Vector3(0, 0.9, 0), 0.07, PMat.glass(Color("#E6E9EE")))
	_bulb = Node3D.new(); _bulb.position = Vector3(0.9, 0, 0); body.add_child(_bulb)
	Parts.sphere(_bulb, 0.5, Vector3(0, 0, 0), PMat.glass(Color("#BFD8E8")), 1.0, 20)
	var bm := PMat.emissive(Color("#4CC9F0"), 0.8); bm.albedo_color.a = 0.8; bm.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_bulb_fill = Parts.sphere(_bulb, 0.42, Vector3(0, -0.06, 0), bm, 0.8, 18)
	Parts.pipe(body, Vector3(0, 0.9, 0), Vector3(0.9, 0.9, 0), 0.07, PMat.rubber())
	_hose = Parts.cyl(body, 0.07, 1.0, Vector3(0.9, 1.4, 0), PMat.rubber(), Vector3.ZERO, -1.0, 8, false)
	Parts.nozzle(body, Vector3(0, BY + TH + 0.35, 0), Vector3.UP, 0.08, 0.5); add_port("in", Vector3(0, BY + TH + 0.9, 0), Vector3.UP)
	add_port("out", Vector3(1.4, 0.4, 0.0), Vector3.RIGHT)

func _apply() -> void:
	var v := clampf(dv("volume", 0.0), 0.0, 1.0)
	var col := PMat.species(display.get("color", "#4CC9F0"))
	var wh := maxf(0.05, TH * (1.0 - v))
	_water.scale = Vector3(1, wh, 1); _water.position.y = BY + wh * 0.5
	_gas.scale = Vector3(1, maxf(0.02, TH * v), 1); _gas.position.y = BY + TH - TH * v * 0.5; _gas.visible = v > 0.01
	for mi in [_water, _bulb_fill]:
		var m := (mi as MeshInstance3D).material_override as StandardMaterial3D; m.albedo_color = Color(col.r, col.g, col.b, 0.8); m.emission = col
	var by := (lerpf(0.9, 2.8, clampf(dv("bulb"), 0.0, 1.0)) if display.has("bulb") else clampf(BY + wh - 0.1, 0.9, 2.8))   # level the bulb with the column unless told
	_bulb.position.y = by
	var hl := maxf(0.05, by - 0.5 - 0.9); _hose.scale = Vector3(1, hl, 1); _hose.position = Vector3(0.9, 0.9 + hl * 0.5, 0)
