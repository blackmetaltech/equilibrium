class_name HoloNum
extends Label
## A number that eases to its target and brightens briefly when it changes. Tabular figures, white; text is `fmt % value`.
var target := 0.0
var shown := 0.0
var fmt := "%.0f"
var suffix := ""
var _flash := 0.0
var _text_set := false
var base_col := HoloTheme.INK
var decimals_hide_below := -1.0

func _init(size_px := 18, weight := 600) -> void:
	add_theme_font_override("font", HoloTheme.font(weight)); add_theme_font_size_override("font_size", HoloTheme.fs(size_px))
	add_theme_color_override("font_color", base_col); mouse_filter = Control.MOUSE_FILTER_IGNORE
	horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT

func set_value(v: float, immediate := false) -> void:
	if not _text_set or immediate: shown = v; target = v; _text_set = true; _apply(); return
	if absf(v - target) > pow(10.0, -float(_decimals())) * 0.5: _flash = 1.0
	target = v

func _decimals() -> int:
	var i := fmt.find(".")
	return int(fmt.substr(i + 1, 1)) if i >= 0 and fmt.substr(i + 1, 1).is_valid_int() else 0

func _apply() -> void:
	var t := fmt % shown
	text = (t + suffix) if suffix != "" else t
	add_theme_color_override("font_color", base_col.lerp(HoloTheme.TEAL_HI, _flash * 0.85))

func _process(dt: float) -> void:
	if not _text_set: return
	var changed := false
	if absf(shown - target) > 1e-6:
		shown = target if CbSettings.reduced_motion else lerpf(shown, target, 1.0 - exp(-dt * 9.0))
		if absf(shown - target) < pow(10.0, -float(_decimals())) * 0.05: shown = target
		changed = true
	if _flash > 0.0: _flash = move_toward(_flash, 0.0, dt * 1.8); changed = true
	if changed: _apply()
