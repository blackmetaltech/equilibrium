class_name Ch9Gantt
extends Ch9Board
## L38: the turnaround planning board. Job magnets on a day grid (critical in red, float as a faint tail), the window line, crew and crane load histograms with their
## limits, the priority order (drag a chip to move it), crane 1/2 switch, reset, and makespan / lost tonnes / cost.
func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#E6E9E6"); return sb

func _build() -> void:
	body.add_child(head("TURNAROUND PLANNING BOARD", "window %d d" % int(view.get("window", 0))))
	var ms := int(view.get("makespan", 0)); var win := int(view.get("window", 0))
	var line := HFlowContainer.new(); line.add_theme_constant_override("h_separation", 16); body.add_child(line)
	line.add_child(lbl("MAKESPAN %d d" % ms, 14, STAMP_RED if ms > win else OKGREEN, "mono_bold"))
	line.add_child(lbl("CPM %d d" % int(view.get("cpmDays", 0)), 13, PENCIL))
	line.add_child(lbl("LOST %s t" % fnum(view.get("lostTonnes", 0)), 13, PENCIL, "mono_bold"))
	var cost := float(view.get("costUSD", 0.0)); var bud := float(view.get("budgetUSD", 0.0))
	line.add_child(lbl("COST %s / %s" % [usd(cost), usd(bud)], 13, STAMP_RED if cost > bud else PENCIL, "mono_bold"))
	var plan := Plan.new(); plan.view = view; plan.custom_minimum_size = Vector2(300, 28.0 + 15.0 * view.get("jobs", []).size() + 2 * 58.0 + 10.0); body.add_child(plan)
	var ctl := HFlowContainer.new(); ctl.add_theme_constant_override("h_separation", 8); body.add_child(ctl)
	ctl.add_child(lbl("CRANE", 12, PENCIL, "semi"))
	for n in view.get("craneOptions", [1, 2]):
		ctl.add_child(key("%d" % int(n), func(): emit_act("setCrane", [int(n)]), int(view.get("crane", 1)) == int(n), 13))
	ctl.add_child(key("RESET", func(): emit_act("reset")))
	ctl.add_child(lbl("hire %s" % usd(float(view.get("craneHireUSD", 0.0))), 12, PENCIL))
	body.add_child(lbl("PRIORITY ORDER (drag a chip)", 12, PENCIL, "semi"))
	var pr := Chips.new(); pr.chips = []
	for id in view.get("priority", []):
		for j in view.get("jobs", []): if j.id == id: pr.chips.append({"id": id, "label": str(j.label), "crit": bool(j.critical)})
	pr.moved.connect(func(a: int, b: int): emit_act("move", [a, b]))
	body.add_child(pr)

class Plan extends Control:
	var view := {}
	const LW := 190.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var jobs: Array = view.get("jobs", []); var hz := maxf(float(view.get("horizon", 1)), 1.0); var win := float(view.get("window", 0))
		var x0 := LW; var pw := size.x - LW - 16.0; var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold"); var fs := EqTheme.fs(11)
		var dx := pw / hz
		var rh := 15.0; var top := 18.0
		draw_rect(Rect2(x0, top, pw, rh * jobs.size()), Color("#F7F9F6"))
		var step := 5.0 if hz <= 60 else 10.0
		for d in range(0, int(hz) + 1, int(step)):
			draw_line(Vector2(x0 + d * dx, top), Vector2(x0 + d * dx, top + rh * jobs.size() + 2 * 58.0), Color(0, 0, 0, 0.12), 1.0)
			draw_string(f, Vector2(x0 + d * dx - 6, 12), str(d), HORIZONTAL_ALIGNMENT_LEFT, 30, fs, Ch9Board.PENCIL)
		for i in jobs.size():
			var j: Dictionary = jobs[i]; var y := top + i * rh
			if i % 2 == 1: draw_rect(Rect2(x0, y, pw, rh), Color(0, 0, 0, 0.04))
			draw_string(f, Vector2(2, y + 11), str(j.label), HORIZONTAL_ALIGNMENT_LEFT, LW - 6, fs, Color("#1E2A2E"))
			var s := float(j.start); var e := float(j.finish); var fl := float(j.float)
			if fl > 0: draw_rect(Rect2(x0 + e * dx, y + 5, fl * dx, 5), Color(0.5, 0.5, 0.5, 0.22))
			var crit := bool(j.critical); var col := Color("#C8323C") if crit else Color("#3C7E8C")
			var r := Rect2(x0 + s * dx, y + 2, maxf((e - s) * dx, 2.0), rh - 4)
			draw_rect(r, col); draw_rect(r, col.darkened(0.35), false, 1.0); draw_rect(Rect2(r.position, Vector2(r.size.x, 3)), Color(1, 1, 1, 0.25))
			if r.size.x > 24: draw_string(fb, r.position + Vector2(3, 9), "%dd" % int(j.days), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 4, EqTheme.fs(10), Color.WHITE)
		var by := top + rh * jobs.size() + 4.0
		_hist(by, "CREW", view.get("crewByDay", []), float(view.get("limits", {}).get("crew", 0)), x0, pw, dx, Color("#C8793C"))
		_hist(by + 58.0, "CRANE", view.get("craneByDay", []), float(view.get("limits", {}).get("crane", 0)), x0, pw, dx, Color("#2D5DA8"))
		var wx := x0 + win * dx
		for yy in range(int(top - 4), int(by + 2 * 58.0), 8): draw_line(Vector2(wx, yy), Vector2(wx, yy + 4), Color("#E0A020"), 2.0)
		draw_string(fb, Vector2(wx + 3, top + 10 + rh * jobs.size() - rh * 0.0 - 0), "", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.BLACK)
	func _hist(y: float, cap: String, a: Array, lim: float, x0: float, pw: float, dx: float, col: Color) -> void:
		var h := 46.0; var mx := maxf(lim, 1.0)
		for v in a: mx = maxf(mx, float(v))
		draw_string(EqTheme.font("mono_bold"), Vector2(2, y + 12), cap, HORIZONTAL_ALIGNMENT_LEFT, LW, EqTheme.fs(11), Ch9Board.PENCIL)
		draw_string(EqTheme.font("mono"), Vector2(2, y + 26), "lim %d" % int(lim), HORIZONTAL_ALIGNMENT_LEFT, LW, EqTheme.fs(10), Ch9Board.PENCIL)
		draw_rect(Rect2(x0, y, pw, h), Color("#F7F9F6"))
		for d in a.size():
			var v := float(a[d]); var bh := h * v / mx
			draw_rect(Rect2(x0 + d * dx, y + h - bh, maxf(dx - 0.5, 1.0), bh), Color("#C8323C") if v > lim else col)
		var ly := y + h - h * lim / mx; draw_line(Vector2(x0, ly), Vector2(x0 + pw, ly), Color("#1E2A2E"), 1.5)

class Chips extends Control:
	signal moved(from: int, to: int)
	var chips: Array = []
	var _drag := -1
	var _pos := Vector2.ZERO
	var _sel := -1
	const CH := 26.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_DRAG
	func _w(i: int) -> float: return EqTheme.font("mono").get_string_size(str(chips[i].label), HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x + 34.0
	func _layout() -> Array:
		var out: Array = []; var x := 0.0; var y := 0.0
		for i in chips.size():
			var w := _w(i)
			if x + w > size.x and x > 0: x = 0.0; y += CH + 4.0
			out.append(Rect2(x, y, w, CH)); x += w + 4.0
		return out
	func _ready() -> void: resized.connect(_fix)
	func _fix() -> void:
		var l := _layout(); custom_minimum_size.y = (l.back().end.y if not l.is_empty() else CH) + 2.0
	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED or what == NOTIFICATION_READY: _fix()
	func _gui_input(e: InputEvent) -> void:
		var l := _layout()
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed:
				for i in l.size(): if (l[i] as Rect2).has_point(e.position): _drag = i; _sel = i; _pos = e.position
				queue_redraw()
			elif _drag >= 0:
				var best := _drag; var bd := 1e9
				for i in l.size():
					var d: float = ((l[i] as Rect2).get_center() - e.position).length()
					if d < bd: bd = d; best = i
				var f := _drag; _drag = -1; queue_redraw()
				if best != f: moved.emit(f, best)
		elif e is InputEventMouseMotion and _drag >= 0: _pos = e.position; queue_redraw()
	func _draw() -> void:
		var l := _layout(); var f := EqTheme.font("mono")
		for i in l.size():
			var r: Rect2 = l[i]; var c: Dictionary = chips[i]
			var col := Color("#C8323C") if bool(c.crit) else Color("#3C7E8C")
			draw_rect(r, Color(col, 0.35) if i == _drag else col); draw_rect(r, col.darkened(0.4), false, 1.0)
			draw_string(f, r.position + Vector2(8, 17), "%d %s" % [i + 1, str(c.label)], HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 8, EqTheme.fs(12), Color.WHITE)
		if _drag >= 0:
			var r2: Rect2 = l[_drag]; r2.position = _pos - r2.size * 0.5
			draw_rect(r2, Color("#1E2A2E")); draw_string(f, r2.position + Vector2(8, 17), str(chips[_drag].label), HORIZONTAL_ALIGNMENT_LEFT, r2.size.x - 8, EqTheme.fs(12), Color.WHITE)
