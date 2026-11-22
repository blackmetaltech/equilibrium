class_name HoloTheme
extends RefCounted
## LOOK2 instrumentation theme: dark glass, teal instruments, white numbers, amber / red only for alarms. Archivo with tabular numbers, 16 px floor, sentence case.
const TEAL := Color("#2EC4B6")
const TEAL_HI := Color("#8AF3E8")
const INK := Color("#F6FCFB")
const MUTED := Color(0.70, 0.82, 0.85, 0.82)
const DIM := Color(0.70, 0.82, 0.85, 0.45)
const AMBER := Color("#FFB703")
const RED := Color("#FF5D4D")
const GLASS := Color("#0B1A21")
const FONT_PATH := "res://ui/fonts/Archivo-Variable.ttf"
const FLOOR := 16
static var _fonts := {}
static var _shader: Shader

static func _tag(a: String) -> int: return (a.unicode_at(0) << 24) | (a.unicode_at(1) << 16) | (a.unicode_at(2) << 8) | a.unicode_at(3)

## Archivo at a weight (400 text, 600 labels, 700 headings), tabular figures on.
static func font(weight := 500) -> Font:
	if _fonts.has(weight): return _fonts[weight]
	var base: Font = ThemeDB.fallback_font
	if ResourceLoader.exists(FONT_PATH):
		var r = load(FONT_PATH)
		if r is Font: base = r
	var fv := FontVariation.new(); fv.base_font = base
	fv.variation_opentype = {_tag("wght"): weight, _tag("wdth"): 100}
	fv.opentype_features = {_tag("tnum"): 1}
	_fonts[weight] = fv
	return fv

static func fs(n: int) -> int: return maxi(FLOOR, EqTheme.fs(n))

static func label(text: String, size := 16, col := INK, weight := 500) -> Label:
	var l := Label.new(); l.text = text
	l.add_theme_font_override("font", font(weight)); l.add_theme_font_size_override("font_size", fs(size)); l.add_theme_color_override("font_color", col)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

static func glass_material(edge := TEAL) -> ShaderMaterial:
	if _shader == null: _shader = load("res://look2/shaders/holo_glass.gdshader")
	var m := ShaderMaterial.new(); m.shader = _shader
	m.set_shader_parameter("edge_color", edge)
	return m

static func box(fill: Color, border: Color, bw := 1, radius := 8, margin := 10) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = fill; s.border_color = border; s.set_border_width_all(bw); s.set_corner_radius_all(radius)
	s.content_margin_left = margin + 4; s.content_margin_right = margin + 4; s.content_margin_top = margin - 4; s.content_margin_bottom = margin - 4
	s.anti_aliasing = true
	return s

## A flat glass button. kind: "" plain, "go" teal-filled primary.
static func button(text: String, kind := "", size := 16) -> Button:
	var b := Button.new(); b.text = text; b.focus_mode = Control.FOCUS_ALL
	b.add_theme_font_override("font", font(600)); b.add_theme_font_size_override("font_size", fs(size))
	b.custom_minimum_size = Vector2(0, 38)
	style(b, kind)
	return b

static func style(b: Button, kind: String) -> void:
	var go := kind == "go"
	var fill := Color(TEAL, 0.9) if go else Color(1, 1, 1, 0.07)
	var edge := TEAL_HI if go else Color(1, 1, 1, 0.20)
	b.add_theme_stylebox_override("normal", box(fill, edge, 1, 9, 10))
	b.add_theme_stylebox_override("hover", box(Color(TEAL_HI, 0.95) if go else Color(TEAL, 0.20), TEAL_HI, 1, 9, 10))
	b.add_theme_stylebox_override("pressed", box(Color(TEAL, 0.5), TEAL_HI, 1, 9, 10))
	b.add_theme_stylebox_override("focus", box(Color(0, 0, 0, 0), TEAL_HI, 2, 9, 10))
	b.add_theme_stylebox_override("disabled", box(Color(1, 1, 1, 0.03), Color(1, 1, 1, 0.10), 1, 9, 10))
	var dark := Color("#04161A")
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(c, dark if go else INK)
	b.add_theme_color_override("font_disabled_color", DIM)

## The pressed / current state of a segmented button (speed, camera).
static func set_active(b: Button, on: bool) -> void:
	b.add_theme_stylebox_override("normal", box(Color(TEAL, 0.28) if on else Color(1, 1, 1, 0.07), TEAL_HI if on else Color(1, 1, 1, 0.20), 1, 9, 10))

static func clock(t: float) -> String:
	var s := maxi(int(t), 0)
	return "%d:%02d" % [s / 60, s % 60]

static func c_of(k: float) -> float: return k - 273.15
