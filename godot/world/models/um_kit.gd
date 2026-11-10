class_name UMKit
extends RefCounted
## Shared helpers of the chapter 2-9 unit models: the furnace colour ramp (dark red to white-hot), rising bubbles, a tray ladder, a ring of
## tube rows. Pure functions; nothing here holds state.

## Furnace colour: nothing under 650 K, dull red at 800 K, orange at 1000 K, yellow at 1200 K, white from about 1370 K (1100 C).
static func furnace(T_K: float) -> Color:
	var stops: Array[Color] = [Color("#2A0703"), Color("#9E1B08"), Color("#F2500A"), Color("#FF9E24"), Color("#FFDB80"), Color("#FFF6E0")]
	var x := clampf((T_K - 650.0) / 720.0, 0.0, 1.0) * float(stops.size() - 1)
	var i := mini(int(x), stops.size() - 2)
	return stops[i].lerp(stops[i + 1], x - float(i))

## Brightness 0..1 of a furnace part at T (0 below 650 K).
static func furnace_k(T_K: float) -> float: return clampf((T_K - 650.0) / 720.0, 0.0, 1.0)

static func set_furnace(m: StandardMaterial3D, T_K: float, energy := 1.0) -> void:
	var k := furnace_k(T_K)
	if k <= 0.01: m.emission = Color.BLACK; m.albedo_color = Color("#3A3330"); return
	var c := furnace(T_K); m.emission = c; m.albedo_color = c; m.emission_energy_multiplier = energy * (0.6 + 1.6 * k)


## Evenly spaced tray discs inside a column (dark metal), y0 = lowest, returns the nodes.
static func tray_ladder(parent: Node, r: float, y0: float, dy: float, n: int, mats: Array) -> Array[MeshInstance3D]:
	var out: Array[MeshInstance3D] = []
	for i in range(n):
		var m: Material = mats[i] if i < mats.size() else PMat.dark_metal()
		out.append(Parts.cyl(parent, r, 0.07, Vector3(0, y0 + i * dy, 0), m, Vector3.ZERO, -1.0, 24, false))
	return out

## A ring of small bubbles that rise and wrap inside a vertical cylinder (radius r, from y0 to y1). `rate` 0..1 scales the speed and how many show.
class Bubbles extends Node3D:
	var _bs: Array[MeshInstance3D] = []
	var _ph: Array[float] = []
	var _pos: Array[Vector2] = []
	var y0 := 0.0
	var y1 := 1.0
	var rate := 0.0
	func setup(r: float, y_lo: float, y_hi: float, n: int, col: Color) -> Bubbles:
		y0 = y_lo; y1 = y_hi
		var sm := SphereMesh.new(); sm.radius = 0.09; sm.height = 0.18; sm.radial_segments = 8; sm.rings = 4
		var mt := StandardMaterial3D.new(); mt.albedo_color = Color(col.r, col.g, col.b, 0.55); mt.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		mt.emission_enabled = true; mt.emission = col; mt.emission_energy_multiplier = 0.6
		for i in range(n):
			var mi := MeshInstance3D.new(); mi.mesh = sm; mi.material_override = mt; mi.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(mi); _bs.append(mi)
			var a := float(i) * 2.399963; var rr := r * sqrt((float(i) + 0.5) / n)
			_pos.append(Vector2(cos(a) * rr, sin(a) * rr)); _ph.append(fmod(float(i) * 0.61803, 1.0))
		return self
	func set_color(col: Color) -> void:
		if _bs.size() > 0:
			var mt := _bs[0].material_override as StandardMaterial3D; mt.albedo_color = Color(col.r, col.g, col.b, 0.55); mt.emission = col
	func _process(dt: float) -> void:
		var n := _bs.size(); var show := int(ceil(rate * n))
		for i in range(n):
			_bs[i].visible = i < show
			if i >= show: continue
			_ph[i] = fmod(_ph[i] + dt * (0.12 + 0.5 * rate), 1.0)
			var s := _ph[i]
			_bs[i].position = Vector3(_pos[i].x + sin(s * 11.0 + i) * 0.05, lerpf(y0, y1, s), _pos[i].y)
			_bs[i].scale = Vector3.ONE * (0.6 + 0.8 * s)
