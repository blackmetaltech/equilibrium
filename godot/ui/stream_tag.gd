class_name StreamTag
extends PanelContainer
## The porcelain tag of a pipe: flow in kmol/h and kg/h side by side, T, P and the top-3 species with colour swatches. Hover shows it, a tap pins it for a
## few seconds. Numbers are the engine's `stream` query; an unsolved plant says so instead of inventing flow.
var app = null
var stream_id := ""
var readouts := {}                 # key -> {text, si, unit}
var top: Array = []                # [{id, name, x, text}] as printed
var _pin_t := 0.0
var _hide_t := 0.0
var _anchor := Vector2.ZERO
var _box: VBoxContainer

static func attach(app) -> StreamTag:
	var t = app.root.get_node_or_null("StreamTag")
	if t != null: return t
	var tag := StreamTag.new(); tag.app = app; app.root.add_child(tag)
	var w = app.world
	if w != null:
		if w.has_signal("pipe_hover"): w.pipe_hover.connect(tag._on_hover)
		if w.has_signal("pipe_clicked"): w.pipe_clicked.connect(tag._on_click)
	return tag

func _init() -> void:
	name = "StreamTag"; visible = false; mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_theme_stylebox_override("panel", EqTheme.porcelain_sb(4, 10.0))
	_box = VBoxContainer.new(); _box.add_theme_constant_override("separation", 3); add_child(_box)

func _on_hover(id: String, pos: Vector2) -> void:
	if _pin_t > 0.0: return
	if id == "": _hide_t = 0.18; return
	_hide_t = 0.0; show_for(id, pos)

func _on_click(id: String) -> void:
	if id == "": return
	var pos: Vector2 = get_viewport().get_mouse_position()
	show_for(id, pos); _pin_t = 4.0

func _process(dt: float) -> void:
	if _pin_t > 0.0:
		_pin_t -= dt
		if _pin_t <= 0.0: visible = false
	elif _hide_t > 0.0:
		_hide_t -= dt
		if _hide_t <= 0.0: visible = false

## Build the tag for stream `id` near `pos`. Returns true when the engine had numbers.
func show_for(id: String, pos: Vector2) -> bool:
	stream_id = id; _anchor = pos
	for c in _box.get_children(): c.queue_free()
	readouts.clear(); top = []
	var d: Dictionary = PaperStrings.stream_row(app, id)
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", 6); _box.add_child(head)
	var tg := EqTheme.dymo(id, 14); tg.name = "Tag"; head.add_child(tg)
	var has := d.has("flow")
	if not has:
		var l := EqTheme.label(PaperStrings.t("TAG_NODATA"), 14, EqTheme.INK, "semi"); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.custom_minimum_size = Vector2(190, 0); _box.add_child(l)
	else:
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 14); _box.add_child(row)
		_cell(row, "flow", PaperStrings.t("TAG_KMOL"), float(d.flow), "kmol/h")
		_cell(row, "mass", PaperStrings.t("TAG_KG"), float(d.mass) * 3600.0, "kg/h")
		var row2 := HBoxContainer.new(); row2.add_theme_constant_override("separation", 14); _box.add_child(row2)
		_cell(row2, "T", PaperStrings.usym("degC"), float(d.T), "degC")
		_cell(row2, "P", PaperStrings.usym("bar"), float(d.P), "bar")
		for sp in d.get("top", []):
			var r := HBoxContainer.new(); r.add_theme_constant_override("separation", 6); _box.add_child(r)
			var sw := ColorRect.new(); sw.custom_minimum_size = Vector2(14, 14); sw.color = EqTheme.species(str(sp.id)); r.add_child(sw)
			var pct := PaperStrings.num(float(sp.x) * 100.0) + " %"
			var nm := EqTheme.label(str(sp.id), 14, EqTheme.INK, "semi"); nm.custom_minimum_size = Vector2(54, 0); r.add_child(nm)
			r.add_child(EqTheme.label(pct, 14, EqTheme.INK, "mono")); top.append({"id": str(sp.id), "name": str(sp.get("name", sp.id)), "x": float(sp.x), "text": pct})
	visible = true; reset_size(); _place(); return has

func _cell(row: HBoxContainer, key: String, cap: String, si: float, unit: String) -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 0); row.add_child(v)
	var d := EqFmt.to_disp(si, unit) if unit != "kg/h" else si
	var txt := PaperStrings.num(d)
	v.add_child(EqTheme.label(cap.to_upper(), 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.45), "dymo")); v.add_child(EqTheme.label(txt, 16, EqTheme.INK, "mono_bold"))
	readouts[key] = {"text": txt, "si": si, "unit": unit}

func _place() -> void:
	var vr := get_viewport().get_visible_rect().size
	var sz := get_combined_minimum_size()
	position = Vector2(clampf(_anchor.x + 18.0, 8.0, vr.x - sz.x - 8.0), clampf(_anchor.y - sz.y - 14.0, 8.0, vr.y - sz.y - 8.0))
