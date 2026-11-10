class_name PFlame
extends Node3D
## A flame: an outer and inner emissive cone that flicker, plus a light. size 0..1 sets the height (about 3 m at 1); alpha fades the
## whole thing (a hydrogen flame is a nearly invisible pale blue).
var size := 0.0
var _outer: MeshInstance3D
var _inner: MeshInstance3D
var _mo: StandardMaterial3D
var _mi: StandardMaterial3D
var light: OmniLight3D
var max_h := 3.0
var _seed := 0.0
var _col_o := Color("#FF7A18")
var _col_i := Color("#FFE08A")
var _alpha := 1.0

func setup(height := 3.0, radius := 0.45, lit := true) -> PFlame:
	max_h = height; _seed = randf() * 10.0
	var cm := CylinderMesh.new(); cm.top_radius = 0.0; cm.bottom_radius = radius; cm.height = 1.0; cm.radial_segments = 10; cm.rings = 1
	_mo = _mat(_col_o, 0.8); _mi = _mat(_col_i, 0.9)
	_outer = MeshInstance3D.new(); _outer.mesh = cm; _outer.material_override = _mo; _outer.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_outer)
	var cm2 := CylinderMesh.new(); cm2.top_radius = 0.0; cm2.bottom_radius = radius * 0.55; cm2.height = 1.0; cm2.radial_segments = 8; cm2.rings = 1
	_inner = MeshInstance3D.new(); _inner.mesh = cm2; _inner.material_override = _mi; _inner.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF; add_child(_inner)
	if lit:
		light = OmniLight3D.new(); light.light_color = Color("#FF9A3C"); light.omni_range = 9.0; light.light_energy = 0.0; light.shadow_enabled = false; add_child(light)
	visible = false
	return self

func _mat(col: Color, a: float) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = Color(col.r, col.g, col.b, a); m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = 3.0
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED; m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA; m.cull_mode = BaseMaterial3D.CULL_DISABLED
	return m

func set_flame(s: float, outer := Color("#FF7A18"), inner := Color("#FFE08A"), alpha := 1.0) -> void:
	size = clampf(s, 0.0, 1.0); _col_o = outer; _col_i = inner; _alpha = alpha
	visible = size > 0.02
	_mo.albedo_color = Color(outer.r, outer.g, outer.b, 0.8 * alpha); _mo.emission = outer
	_mi.albedo_color = Color(inner.r, inner.g, inner.b, 0.9 * alpha); _mi.emission = inner
	if light != null:
		light.light_color = outer.lerp(Color.WHITE, 0.2)

func _process(_dt: float) -> void:
	if not visible: return
	var t := Time.get_ticks_msec() * 0.001
	var f := 1.0 + 0.16 * sin(t * 17.0 + _seed) + 0.1 * sin(t * 29.0 + _seed * 2.0)
	var h := max_h * (0.15 + 0.85 * size) * f
	_outer.scale = Vector3(1.0 + 0.1 * sin(t * 13.0 + _seed) , h, 1.0 + 0.1 * cos(t * 11.0 + _seed)) * Vector3(0.6 + 0.6 * size, 1.0, 0.6 + 0.6 * size)
	_outer.position.y = h * 0.5
	_inner.scale = Vector3(_outer.scale.x * 0.8, h * 0.62, _outer.scale.z * 0.8); _inner.position.y = h * 0.31
	if light != null: light.light_energy = 2.2 * size * _alpha * f; light.position.y = h * 0.4
