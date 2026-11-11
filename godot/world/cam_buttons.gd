class_name CamButtons
extends Control
## The on-screen camera buttons for touch layouts: zoom + / - and rotate left / right. Drawn here (no font glyphs).
signal pressed(which: String)
const KINDS := ["zoom_in", "zoom_out", "rot_l", "rot_r"]
var size_px := 52.0
var cols := 1            ## phone: a 2x2 pad so the buttons stay short and clear of the instrument window
var _hot := ""

func _ready() -> void:
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	for i in range(KINDS.size()):
		var c := Control.new(); c.name = KINDS[i]; c.mouse_filter = Control.MOUSE_FILTER_STOP; add_child(c)
		c.draw.connect(_draw_btn.bind(c, KINDS[i])); c.gui_input.connect(_input_btn.bind(KINDS[i], c))
	relayout()

func relayout() -> void:
	var s := maxf(size_px, 46.0); var gap := 8.0
	for i in range(KINDS.size()):
		var c: Control = get_node(KINDS[i]); c.position = Vector2((i % cols) * (s + gap), (i / cols) * (s + gap)); c.size = Vector2(s, s); c.queue_redraw()
	var rows := int(ceil(4.0 / cols))
	custom_minimum_size = Vector2(cols * s + (cols - 1) * gap, rows * s + (rows - 1) * gap); size = custom_minimum_size

func _input_btn(e: InputEvent, which: String, c: Control) -> void:
	if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or (e is InputEventScreenTouch and e.pressed):
		pressed.emit(which); _hot = which; c.queue_redraw(); get_tree().create_timer(0.12).timeout.connect(func() -> void:
			_hot = ""; if is_instance_valid(c): c.queue_redraw())
		c.accept_event()

func _draw_btn(c: Control, which: String) -> void:
	var s := c.size; var ctr := s * 0.5; var hot := _hot == which
	c.draw_circle(ctr, s.x * 0.5, Color(0.04, 0.07, 0.17, 0.82 if not hot else 0.95))
	c.draw_arc(ctr, s.x * 0.5 - 1.5, 0, TAU, 40, Color("#2EC4B6") if not hot else Color("#FFB703"), 2.0, true)
	var ink := Color("#F1FAEE"); var r := s.x * 0.22
	match which:
		"zoom_in":
			c.draw_line(ctr - Vector2(r, 0), ctr + Vector2(r, 0), ink, 3.0); c.draw_line(ctr - Vector2(0, r), ctr + Vector2(0, r), ink, 3.0)
		"zoom_out":
			c.draw_line(ctr - Vector2(r, 0), ctr + Vector2(r, 0), ink, 3.0)
		_:
			var dir := -1.0 if which == "rot_l" else 1.0
			var a0 := -PI * 0.5 - dir * 2.3; var a1 := -PI * 0.5 + dir * 0.9
			c.draw_arc(ctr, r * 1.15, minf(a0, a1), maxf(a0, a1), 20, ink, 3.0, true)
			var tip := ctr + Vector2(cos(a1), sin(a1)) * r * 1.15
			var tg := Vector2(-sin(a1), cos(a1)) * dir
			var n := Vector2(cos(a1), sin(a1))
			c.draw_colored_polygon(PackedVector2Array([tip + tg * r * 0.7, tip - n * r * 0.5, tip + n * r * 0.5]), ink)
