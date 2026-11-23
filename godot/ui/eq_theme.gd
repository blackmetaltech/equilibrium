class_name EqTheme
extends RefCounted
## EQUILIBRIUM's own look (design/equilibrium/UI.md "Palette" and "Type"): a 1970s control room — enamel panels, porcelain
## faceplates, annunciator lamps, chart-recorder pens, Dymo tape, green-bar printout. Tokens, fonts and StyleBox helpers only;
## nothing here knows the engine.

const ENAMEL := Color("#2C4A45")
const ENAMEL_HI := Color("#3E635C")
const ENAMEL_LO := Color("#1D3330")
const PORCELAIN := Color("#E9EDE4")
const INK := Color("#1E2A2E")
const TEAL := Color("#2EC4B6")        ## the accent: focus, primary key, equilibrium/lock
const AMBER := Color("#FFB703")       ## High alarms, warnings
const RED := Color("#E63946")         ## Critical alarms, failures
const LAMP_WHITE := Color("#F4F1DE")  ## normal / goal-met annunciator windows
const LAMP_OFF := Color("#26302E")    ## dark annunciator glass
const PEN_BLUE := Color("#2D5DA8")
const PEN_RED := Color("#C8323C")
const PEN_GREEN := Color("#2E8B57")
const DYMO_TAPE := Color("#141414")
const DYMO_TEXT := Color("#F2F2F2")
const GREENBAR := Color("#DDEBD5")
const GREENBAR_LIGHT := Color("#F7F9F2")
const TEXT := Color("#E8EFEA")
const DIM := Color("#9FB3AC")
const GOOD := Color("#2E8B57")
const BAKELITE := Color("#2A2522")    ## knob bodies

## Species colours (physics only; DESIGN §5.6). Pipes, critters, lens, swatches.
const SPECIES := {
	"H2": Color("#E8F1FF"), "N2": Color("#5B7DB1"), "NH3": Color("#9D4EDD"), "O2": Color("#4CC9F0"), "Ar": Color("#6C757D"),
	"H2O": Color("#1D7FD8"), "CH3OH": Color("#F15BB5"), "SO2": Color("#E9C46A"), "SO3": Color("#F4A261"), "H2SO4": Color("#B5651D"),
	"CO": Color("#8D99AE"), "CO2": Color("#495057"), "CH4": Color("#2A9D8F"), "C2H5OH": Color("#FFD166"), "NO": Color("#C9ADA7"),
	"NO2": Color("#8B4513"), "Cl2": Color("#B5E48C"), "C3H8": Color("#52B788"), "S": Color("#F2E205"),
}
static func species(id: String) -> Color: return SPECIES.get(id, Color("#B0B8B4"))

const DIR := "res://ui/fonts/"
static var _files := {}
static var _fonts := {}

static func _file(n: String) -> Font:
	if _files.has(n): return _files[n]
	var f: Font = ThemeDB.fallback_font
	var p := DIR + n
	if ResourceLoader.exists(p):
		var r = load(p)
		if r is Font: f = r
	elif FileAccess.file_exists(p):   # fresh checkout, not imported yet
		var ff := FontFile.new()
		if ff.load_dynamic_font(p) == OK: f = ff
	_files[n] = f
	return f

static func _tag(a: String) -> int: return (a.unicode_at(0) << 24) | (a.unicode_at(1) << 16) | (a.unicode_at(2) << 8) | a.unicode_at(3)

static func _var(base: Font, axes: Dictionary) -> Font:
	var fv := FontVariation.new(); fv.base_font = base
	var v := {}
	for k in axes: v[_tag(k)] = axes[k]
	fv.variation_opentype = v
	return fv

## kind: "title" (Archivo wide 800), "head" (Archivo 700 normal width), "sans" (Barlow), "semi" (Barlow SemiBold),
## "mono" (Space Mono), "mono_bold", "print" (VT323, printout only), "dymo" (Barlow SemiBold, caps on tape)
static func font(kind: String) -> Font:
	if _fonts.has(kind): return _fonts[kind]
	var f: Font
	match kind:
		"title": f = _var(_file("Archivo-Variable.ttf"), {"wdth": 125, "wght": 800})
		"head": f = _var(_file("Archivo-Variable.ttf"), {"wdth": 100, "wght": 700})
		"semi": f = _file("Barlow-SemiBold.ttf")
		"dymo":   # Barlow has no subscript digits (NH₃, H₂): tape text falls back to Space Mono Bold, then Archivo
			var fv := FontVariation.new(); fv.base_font = _file("Barlow-SemiBold.ttf")
			fv.fallbacks = [_file("Archivo-Variable.ttf"), _file("SpaceMono-Bold.ttf"), ThemeDB.fallback_font]
			f = fv
		"mono": f = _file("SpaceMono-Regular.ttf")
		"mono_bold": f = _file("SpaceMono-Bold.ttf")
		"print": f = _file("VT323-Regular.ttf")
		_: f = _file("Barlow-Regular.ttf")
	_fonts[kind] = f
	return f

## F32 (0.9 readability): the smallest text anywhere is 16 px on screen at 1920x1080 and at 1280x800 (the desktop and handheld classes both draw at 1 px per logical px;
## Settings > text size only ever raises it). Every size in the game goes through `fs` (Controls, LabelSettings, Dymo tape) or `ds` (hand-drawn text), so the floor is one number.
const FLOOR := 16
## Text size through the shell's scaling rule so Settings > text size keeps working.
static func fs(n: int) -> int: return maxi(FLOOR, CbKit.fs(n))

## Hand-drawn text (a CanvasItem's _draw): `ci.draw_string` with the floor applied. While `audit` is on (tests/layout_flow.gd) every call records its on-screen size
## and whether its text fits `width`, so the layout test sees drawn text the same way it sees Labels.
static var audit := false
static var drawn := {}
static func ds(ci: CanvasItem, f: Font, pos: Vector2, text: String, align: int = HORIZONTAL_ALIGNMENT_LEFT, width := -1.0, size := 16, col: Color = Color.WHITE) -> void:
	size = maxi(size, FLOOR)
	var sx := 1.0
	var w := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, size).x if text != "" else 0.0
	if width > 0.0 and w > width: sx = clampf(width / w, SQUEEZE_MIN, 1.0)   # the floor is 16 px, so a word too wide for its place is squeezed to at most 78 % of its width, never made smaller
	if audit and text.strip_edges() != "" and ci.is_inside_tree():
		var xf := ci.get_global_transform_with_canvas()
		var sc: float = xf.get_scale().y * ci.get_viewport().get_final_transform().get_scale().y
		var ww := w * sx; var x0 := pos.x
		if width > 0.0 and align == HORIZONTAL_ALIGNMENT_CENTER: x0 = pos.x + (width - ww) * 0.5
		elif width > 0.0 and align == HORIZONTAL_ALIGNMENT_RIGHT: x0 = pos.x + width - ww
		var gr: Rect2 = xf * Rect2(x0, pos.y - float(size) * 0.76, ww, float(size) * 0.92)   # cap height above the baseline, a little descender below
		var k := "%s | %s | %s" % [str(ci.get_path()), text, str(pos)]
		drawn[k] = [float(size) * sc, text, width <= 0.0 or ww <= width + 1.5, ww, width, gr]
	if sx < 1.0:
		ci.draw_set_transform(pos, 0.0, Vector2(sx, 1.0))
		ci.draw_string(f, Vector2.ZERO, text, align, width / sx, size, col)
		ci.draw_set_transform(Vector2.ZERO, 0.0, Vector2.ONE)
	else: ci.draw_string(f, pos, text, align, width, size, col)
const SQUEEZE_MIN := 0.78

## The safety net for text that other code builds (the shell's Settings and dialogs in core, a theme default): any Label / Button / LineEdit / RichTextLabel whose font is under the floor
## is raised to it. `PlantWorld`'s owner (main.gd) calls this for every node that joins the tree (deferred, so the creator has set its sizes first).
static var _lifted := {}
# n is untyped on purpose: lift is called deferred, and a node freed in between makes a typed Node parameter fail with "Cannot convert argument 1 from Object to Object" before the validity check can run
static func lift(n) -> void:
	if n == null or not is_instance_valid(n): return
	if n is Label:
		var l := n as Label
		if l.label_settings != null:
			if l.label_settings.font_size < FLOOR:
				var id := l.label_settings.get_instance_id()
				if not _lifted.has(id):
					var d := l.label_settings.duplicate() as LabelSettings; d.font_size = FLOOR; _lifted[id] = d
				l.label_settings = _lifted[id]
		elif l.get_theme_font_size("font_size") < FLOOR: l.add_theme_font_size_override("font_size", FLOOR)
	elif n is Button or n is LineEdit:
		if (n as Control).get_theme_font_size("font_size") < FLOOR: (n as Control).add_theme_font_size_override("font_size", FLOOR)
	elif n is RichTextLabel:
		for k in ["normal_font_size", "bold_font_size", "italics_font_size", "bold_italics_font_size", "mono_font_size"]:
			if (n as Control).get_theme_font_size(k) < FLOOR: (n as Control).add_theme_font_size_override(k, FLOOR)

static var _ls := {}
static func settings(size: int, col: Color, kind := "sans") -> LabelSettings:
	size = fs(size)
	var k := "%s|%d|%s" % [kind, size, col.to_html()]
	if _ls.has(k): return _ls[k]
	var s := LabelSettings.new(); s.font = font(kind); s.font_size = size; s.font_color = col
	_ls[k] = s
	return s

static func label(text: String, size := 16, col: Color = TEXT, kind := "sans") -> Label:
	var l := Label.new(); l.text = text; l.label_settings = settings(size, col, kind)
	l.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return l

static func _sb(bg: Color, edge: Color, r: int, bw: int, pad: float) -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.bg_color = bg; s.border_color = edge; s.set_border_width_all(bw); s.set_corner_radius_all(r)
	s.content_margin_left = pad; s.content_margin_right = pad; s.content_margin_top = pad * 0.7; s.content_margin_bottom = pad * 0.7
	return s

## Enamel console panel: flat green-teal with a light top seam (1970s panel), small radius.
static func enamel_sb(r := 6, pad := 10.0) -> StyleBoxFlat:
	var s := _sb(ENAMEL, ENAMEL_LO, r, 2, pad)
	s.border_width_top = 2; s.border_color = ENAMEL_HI
	s.shadow_color = Color(0, 0, 0, 0.35); s.shadow_size = 6; s.shadow_offset = Vector2(0, 2)
	return s

## Porcelain faceplate / notebook / tag face with a thin dark bezel.
static func porcelain_sb(r := 4, pad := 12.0) -> StyleBoxFlat:
	var s := _sb(PORCELAIN, Color("#8C9A94"), r, 1, pad)
	s.shadow_color = Color(0, 0, 0, 0.3); s.shadow_size = 8; s.shadow_offset = Vector2(0, 3)
	return s

## Dymo tape strip (label maker): black tape, white embossed caps.
static func dymo_sb(pad := 6.0) -> StyleBoxFlat:
	var s := _sb(DYMO_TAPE, Color("#000000"), 2, 0, pad)
	s.content_margin_top = 2; s.content_margin_bottom = 2
	return s

static func dymo(text: String, size := 13) -> PanelContainer:
	var p := PanelContainer.new(); p.add_theme_stylebox_override("panel", dymo_sb())
	p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.add_child(label(text.to_upper(), size, DYMO_TEXT, "dymo"))
	return p

## Key-cap button styles (teal primary, porcelain secondary) for notebook/printout buttons.
static func key_sb(primary: bool, state := "normal") -> StyleBoxFlat:
	var bg := TEAL if primary else PORCELAIN
	match state:
		"hover": bg = bg.lightened(0.08)
		"pressed": bg = bg.darkened(0.12)
		"disabled": bg = Color(bg, 0.45)
	var s := _sb(bg, INK.lerp(bg, 0.4), 4, 1, 14.0)
	s.border_width_bottom = 3
	return s

## Phone floor for a touch target: 48 dp on the Pixel 9a (2.6 px/dp; the phone layout draws at 0.5 physical px per logical px).
const PHONE_TAP := 62.4
class TapButton extends Button:
	func _enter_tree() -> void:   # callers set their own minimum before adding the key: the phone floor is applied when it joins the tree
		if CbLayout.phone: custom_minimum_size = custom_minimum_size.max(Vector2(EqTheme.PHONE_TAP, EqTheme.PHONE_TAP))

static func key_button(text: String, primary := false, size := 17) -> Button:
	var b := TapButton.new(); b.text = text; b.focus_mode = Control.FOCUS_ALL
	b.add_theme_font_override("font", font("semi")); b.add_theme_font_size_override("font_size", fs(size))
	for st in ["normal", "hover", "pressed", "disabled"]: b.add_theme_stylebox_override(st, key_sb(primary, st))
	var fstyle := key_sb(primary, "hover"); fstyle.border_color = TEAL if not primary else INK; fstyle.set_border_width_all(3)
	b.add_theme_stylebox_override("focus", fstyle)
	for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color"]: b.add_theme_color_override(c, INK)
	b.add_theme_color_override("font_disabled_color", INK.lerp(PORCELAIN if not primary else TEAL, 0.5))   # a disabled key keeps its label, greyed (never a blank box)
	b.custom_minimum_size = Vector2(0, 44)
	return b
