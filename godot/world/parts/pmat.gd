class_name PMat
extends RefCounted
## Shared materials of the parts library (metal, painted steel by service colour, insulation cladding, concrete, glass) and the
## colour ramps the live state uses (a clamped blackbody ramp for glow, a cold-to-hot ramp for temperatures). Everything is built in code.
static var _cache := {}

static func _std(key: String, col: Color, rough: float, metal: float) -> StandardMaterial3D:
	if _cache.has(key): return _cache[key]
	var m := StandardMaterial3D.new(); m.albedo_color = col; m.roughness = rough; m.metallic = metal
	_cache[key] = m; return m

static func metal() -> StandardMaterial3D: return _std("metal", Color("#8E98A6"), 0.38, 0.85)
static func dark_metal() -> StandardMaterial3D: return _std("dmetal", Color("#3C424C"), 0.5, 0.7)
static func concrete() -> StandardMaterial3D: return _std("concrete", Color("#6B6D72"), 0.95, 0.0)
static func insulation() -> StandardMaterial3D: return _std("insul", Color("#C3CAD2"), 0.55, 0.55)
static func brick() -> StandardMaterial3D: return _std("brick", Color("#8A4B35"), 0.95, 0.0)
static func rubber() -> StandardMaterial3D: return _std("rubber", Color("#1B1D22"), 0.9, 0.0)
static func safety() -> StandardMaterial3D: return _std("safety", Color("#E8B923"), 0.6, 0.1)
static func white() -> StandardMaterial3D: return _std("white", Color("#E6E9EE"), 0.6, 0.1)
static func red() -> StandardMaterial3D: return _std("red", Color("#C8352E"), 0.6, 0.1)

## Painted steel by service colour (pipe-coding convention: grey process, orange steam, blue water, yellow fuel gas, green air).
static func paint(service: String) -> StandardMaterial3D:
	var cols := {"process": "#8FA0B8", "steam": "#D9822B", "water": "#3F8FD2", "fuel": "#D6B73A", "air": "#8DB9A0", "hot": "#B8553F", "motor": "#2F8F9A", "tank": "#D7DCE2", "steel": "#6F7A88"}
	var c: String = cols.get(service, "#8FA0B8")
	return _std("paint_" + service, Color(c), 0.45, 0.35)

static func glass(col := Color("#7FD0E8")) -> StandardMaterial3D:
	var key := "glass" + col.to_html()
	if _cache.has(key): return _cache[key]
	var m := StandardMaterial3D.new(); m.albedo_color = Color(col.r, col.g, col.b, 0.35); m.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	m.roughness = 0.1; m.metallic = 0.2; _cache[key] = m; return m

## A fresh emissive material (never cached: the caller animates it).
static func emissive(col: Color, energy := 2.0) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = col; m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = energy
	m.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED if energy > 3.0 else BaseMaterial3D.SHADING_MODE_PER_PIXEL
	return m

## A fresh shell material whose emission is driven by the unit's heat (see set_heat).
static func shell(base: Color, rough := 0.45, metal_ := 0.6) -> StandardMaterial3D:
	var m := StandardMaterial3D.new(); m.albedo_color = base; m.roughness = rough; m.metallic = metal_
	m.emission_enabled = true; m.emission = Color.BLACK; m.emission_energy_multiplier = 1.0
	return m

## Clamped blackbody ramp, g in 0..1: dull red, red, orange, yellow; never pure white so a hot part stays readable against lamps.
static func blackbody(g: float) -> Color:
	var stops: Array[Color] = [Color("#3A0A04"), Color("#B3200A"), Color("#FB5A08"), Color("#FFA02A"), Color("#FFD27A")]
	var x := clampf(g, 0.0, 1.0) * float(stops.size() - 1)
	var i := mini(int(x), stops.size() - 2)
	return stops[i].lerp(stops[i + 1], x - float(i))

## Heat 0..1 from kelvin: nothing below 450 K, full at 1300 K.
static func heat(T_K: float) -> float: return clampf((T_K - 450.0) / 850.0, 0.0, 1.0)

static func set_heat(m: StandardMaterial3D, g: float, strength := 1.6) -> void:
	if g <= 0.01: m.emission = Color.BLACK; return
	m.emission = blackbody(g); m.emission_energy_multiplier = strength * (0.35 + g)

## Cold-to-hot colour for temperature readouts (cool blue, teal, pale, orange, red), lo..hi in kelvin.
static func t_ramp(T_K: float, lo := 300.0, hi := 900.0) -> Color:
	var stops: Array[Color] = [Color("#4CC9F0"), Color("#2EC4B6"), Color("#EAF2F0"), Color("#FB8500"), Color("#E63946")]
	var x := clampf((T_K - lo) / maxf(1.0, hi - lo), 0.0, 1.0) * float(stops.size() - 1)
	var i := mini(int(x), stops.size() - 2)
	return stops[i].lerp(stops[i + 1], x - float(i))

static func species(col) -> Color:
	if col is Color: return col
	if col is String and (col as String) != "": return Color(col)
	return Color("#9fb4c8")
