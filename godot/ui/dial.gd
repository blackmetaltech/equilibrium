class_name Dial
extends Control
## A live readout drawn like a gauge on the plant: a 240 degree arc with ticks, a needle and the number. State is never colour alone:
## the needle sits in a marked band (hatched ticks at the limits) and the number is printed. Drawn here, no font glyphs needed.
var value := 0.0
var lo := 0.0
var hi := 1.0
var label := ""
var text := ""
var warn_lo := -INF
var warn_hi := INF
const A0 := deg_to_rad(150.0)
const SWEEP := deg_to_rad(240.0)

func _init() -> void:
	custom_minimum_size = Vector2(112, 104); mouse_filter = Control.MOUSE_FILTER_IGNORE

func set_value(v: float, t: String) -> void:
	value = v; text = t; queue_redraw()

func _draw() -> void:
	var c := Vector2(size.x * 0.5, size.y * 0.56); var r := minf(size.x * 0.5, size.y * 0.55) - 6.0
	var f := CbKit.font_bold()
	draw_arc(c, r, A0, A0 + SWEEP, 40, CbKit.LINE, 7.0, true)
	var frac := clampf((value - lo) / maxf(hi - lo, 1e-9), 0.0, 1.0)
	var bad: bool = value > warn_hi or value < warn_lo
	var col: Color = CbKit.RD if bad else CbKit.ACC
	draw_arc(c, r, A0, A0 + SWEEP * frac, 40, col, 7.0, true)
	for i in range(0, 11):
		var a := A0 + SWEEP * i / 10.0; var d := Vector2.from_angle(a)
		draw_line(c + d * (r - 10.0), c + d * (r - (16.0 if i % 5 == 0 else 13.0)), CbKit.DIM, 2.0 if i % 5 == 0 else 1.0)
	if warn_hi < INF:   # a hatched stop at the high limit: the danger zone is marked by shape, not only by colour
		var a2 := A0 + SWEEP * clampf((warn_hi - lo) / maxf(hi - lo, 1e-9), 0.0, 1.0)
		for k in range(4): draw_line(c + Vector2.from_angle(a2 + 0.04 * k) * (r - 18.0), c + Vector2.from_angle(a2 + 0.04 * k) * (r + 5.0), CbKit.RD, 2.0)
	var na := A0 + SWEEP * frac
	draw_line(c, c + Vector2.from_angle(na) * (r - 14.0), CbKit.TX, 3.0, true)
	draw_circle(c, 5.0, CbKit.TX)
	var fs := CbKit.fs(15)
	var tw := f.get_string_size(text, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x
	draw_string(f, Vector2(c.x - minf(tw, size.x) * 0.5, c.y + r * 0.62), text, HORIZONTAL_ALIGNMENT_LEFT, size.x, fs, CbKit.TX)
	var fl := CbKit.fs(13)
	var lw := f.get_string_size(label, HORIZONTAL_ALIGNMENT_LEFT, -1, fl).x
	draw_string(f, Vector2(c.x - minf(lw, size.x) * 0.5, size.y - 3.0), label, HORIZONTAL_ALIGNMENT_LEFT, size.x, fl, CbKit.DIM)
