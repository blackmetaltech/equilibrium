class_name HoloPanel
extends PanelContainer
## A frosted glass panel: the glass shader behind a margin box with the content. Fades and slides in; `pos` is where the layout wants it (the
## slide offset and easing are applied on top); `edge` tints the luminous border (teal, amber or red); `pulse` brightens it for a moment.
var glass: ColorRect
var box: MarginContainer
var content: Control
var pos := Vector2.ZERO
var _slide := 1.0
var _edge := HoloTheme.TEAL
var _glow := 0.0
var _pulse := 0.0
var shown := false
var focus_ring := false   ## the coach points at this panel: a slow glow

func _init(inner: Control = null, pad := 12) -> void:
	add_theme_stylebox_override("panel", StyleBoxEmpty.new())
	glass = ColorRect.new(); glass.color = Color.WHITE; glass.mouse_filter = Control.MOUSE_FILTER_IGNORE
	glass.material = HoloTheme.glass_material(); add_child(glass)
	glass.resized.connect(func(): (glass.material as ShaderMaterial).set_shader_parameter("rect_size", glass.size))
	box = MarginContainer.new(); box.mouse_filter = Control.MOUSE_FILTER_IGNORE
	for s in ["left", "right"]: box.add_theme_constant_override("margin_" + s, pad + 2)
	for s in ["top", "bottom"]: box.add_theme_constant_override("margin_" + s, maxi(pad - 3, 6))
	add_child(box)
	mouse_filter = Control.MOUSE_FILTER_STOP
	modulate.a = 0.0
	if inner != null: set_content(inner)

func set_content(c: Control) -> void:
	content = c; box.add_child(c)

func set_edge(c: Color) -> void:
	if c == _edge: return
	_edge = c; (glass.material as ShaderMaterial).set_shader_parameter("edge_color", c)

func solid() -> void: (glass.material as ShaderMaterial).set_shader_parameter("tint_amount", 0.95)   ## cards over a dimmed scene read as a page, not a window

func pulse() -> void: _pulse = 1.0

func appear(delay := 0.0) -> void:
	if shown: return
	shown = true; visible = true
	var tw := create_tween().set_parallel(true)
	if delay > 0.0: tw.tween_interval(delay)
	tw.chain().tween_property(self, "modulate:a", 1.0, 0.35).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)
	tw.tween_property(self, "_slide", 0.0, 0.45).set_ease(Tween.EASE_OUT).set_trans(Tween.TRANS_CUBIC)

func vanish() -> void:
	if not shown: return
	shown = false
	var tw := create_tween(); tw.tween_property(self, "modulate:a", 0.0, 0.2)
	tw.tween_callback(func(): if not shown: visible = false)

func _process(dt: float) -> void:
	_pulse = move_toward(_pulse, 0.0, dt * 1.6)
	var g := _pulse
	if focus_ring: g = maxf(g, 0.5 + 0.5 * sin(Time.get_ticks_msec() * 0.004))
	if absf(g - _glow) > 0.01 or g == 0.0 and _glow != 0.0:
		_glow = g; (glass.material as ShaderMaterial).set_shader_parameter("glow", g)

## Size to the content (the panel never takes a size the content does not need) and sit at `pos` plus the slide.
func fit(min_w := 0.0) -> void:
	var m := get_combined_minimum_size()
	size = Vector2(maxf(m.x, min_w), m.y)
	position = pos + Vector2(0.0, _slide * 14.0)
