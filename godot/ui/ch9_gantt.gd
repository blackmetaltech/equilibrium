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
	if view.get("cpmDays") != null: line.add_child(lbl("CPM %d d" % int(view.cpmDays), 13, PENCIL))   # the critical path is the call-it's answer: not printed until the call is locked or the plan has run
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
	if str(view.get("hint", "")) != "":
		var hl := lbl(str(view.hint), 12, PENCIL, "sans"); hl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; hl.custom_minimum_size = Vector2(200, 0); body.add_child(hl)
	var ph := HBoxContainer.new(); ph.add_theme_constant_override("separation", 8); body.add_child(ph)
	ph.add_child(lbl("PRIORITY ORDER (drag a chip, or pick one and use the arrows)", 12, PENCIL, "semi"))
	var pr := Chips.new(); pr.chips = []
	var back := key("◀", func(): pr.nudge(-1), false, 12); back.name = "ChipEarlier"; back.tooltip_text = "Move the picked job earlier in the order"; ph.add_child(back)
	var fwd := key("▶", func(): pr.nudge(1), false, 12); fwd.name = "ChipLater"; fwd.tooltip_text = "Move the picked job later in the order"; ph.add_child(fwd)
	pr.name = "Chips"; pr.sel_keep = _sel_keep
	for id in view.get("priority", []):
		for j in view.get("jobs", []): if j.id == id: pr.chips.append({"id": id, "label": str(j.label), "crit": bool(j.critical)})
	pr.moved.connect(func(a: int, b: int): _sel_keep = b; emit_act("move", [a, b]))
	pr.picked.connect(func(i: int): _sel_keep = i)
	body.add_child(pr)

var _sel_keep := -1     ## the picked chip survives the rebuild that follows a move

class Plan extends Control:
	var view := {}
	const LW := 150.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_PASS
	static func fit_text(f: Font, t: String, w: float, fs: int) -> String:
		if f.get_string_size(t, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x <= w: return t
		while t.length() > 1 and f.get_string_size(t + "…", HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > w: t = t.left(t.length() - 1)
		return t + "…"
	func _get_tooltip(at: Vector2) -> String:
		var jobs: Array = view.get("jobs", []); var i := int((at.y - 18.0) / 15.0)
		if at.x < LW + 4 and i >= 0 and i < jobs.size():
			var j: Dictionary = jobs[i]; return "%s: %d d, days %d to %d, float %d d%s" % [j.label, int(j.days), int(j.start), int(j.finish), int(j.float), ", critical" if bool(j.critical) else ""]
		return ""
	func _draw() -> void:
		var jobs: Array = view.get("jobs", []); var hz := maxf(float(view.get("horizon", 1)), 1.0); var win := float(view.get("window", 0))
		var x0 := LW; var pw := size.x - LW - 16.0; var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold"); var fs := EqTheme.fs(11)
		var dx := pw / hz
		var rh := 15.0; var top := 18.0
		draw_rect(Rect2(x0, top, pw, rh * jobs.size()), Color("#F7F9F6"))
		var step := 5.0 if hz <= 60 else 10.0
		for d in range(0, int(hz) + 1, int(step)):
			draw_line(Vector2(x0 + d * dx, top), Vector2(x0 + d * dx, top + rh * jobs.size() + 2 * 58.0), Color(0, 0, 0, 0.12), 1.0)
			EqTheme.ds(self, f, Vector2(x0 + d * dx - 6, 12), str(d), HORIZONTAL_ALIGNMENT_LEFT, 30, fs, Ch9Board.PENCIL)
		for i in jobs.size():
			var j: Dictionary = jobs[i]; var y := top + i * rh
			if i % 2 == 1: draw_rect(Rect2(x0, y, pw, rh), Color(0, 0, 0, 0.04))
			EqTheme.ds(self, f, Vector2(2, y + 11), fit_text(f, str(j.label), LW - 8, fs), HORIZONTAL_ALIGNMENT_LEFT, LW - 6, fs, Color("#1E2A2E"))
			var s := float(j.start); var e := float(j.finish); var fl := float(j.float)
			if fl > 0: draw_rect(Rect2(x0 + e * dx, y + 5, fl * dx, 5), Color(0.5, 0.5, 0.5, 0.22))
			var crit := bool(j.critical); var col := Color("#C8323C") if crit else Color("#3C7E8C")
			var r := Rect2(x0 + s * dx, y + 2, maxf((e - s) * dx, 2.0), rh - 4)
			draw_rect(r, col); draw_rect(r, col.darkened(0.35), false, 1.0); draw_rect(Rect2(r.position, Vector2(r.size.x, 3)), Color(1, 1, 1, 0.25))
			if r.size.x > 24: EqTheme.ds(self, fb, r.position + Vector2(3, 9), "%dd" % int(j.days), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 4, EqTheme.fs(10), Color.WHITE)
		var by := top + rh * jobs.size() + 4.0
		_hist(by, "CREW", view.get("crewByDay", []), float(view.get("limits", {}).get("crew", 0)), x0, pw, dx, Color("#C8793C"))
		_hist(by + 58.0, "CRANE", view.get("craneByDay", []), float(view.get("limits", {}).get("crane", 0)), x0, pw, dx, Color("#2D5DA8"))
		var wx := x0 + win * dx
		for yy in range(int(top - 4), int(by + 2 * 58.0), 8): draw_line(Vector2(wx, yy), Vector2(wx, yy + 4), Color("#E0A020"), 2.0)
		EqTheme.ds(self, fb, Vector2(wx + 3, top + 10 + rh * jobs.size() - rh * 0.0 - 0), "", HORIZONTAL_ALIGNMENT_LEFT, -1, fs, Color.BLACK)
	func _hist(y: float, cap: String, a: Array, lim: float, x0: float, pw: float, dx: float, col: Color) -> void:
		var h := 46.0; var mx := maxf(lim, 1.0)
		for v in a: mx = maxf(mx, float(v))
		EqTheme.ds(self, EqTheme.font("mono_bold"), Vector2(2, y + 12), cap, HORIZONTAL_ALIGNMENT_LEFT, LW, EqTheme.fs(11), Ch9Board.PENCIL)
		EqTheme.ds(self, EqTheme.font("mono"), Vector2(2, y + 26), "lim %d" % int(lim), HORIZONTAL_ALIGNMENT_LEFT, LW, EqTheme.fs(10), Ch9Board.PENCIL)
		draw_rect(Rect2(x0, y, pw, h), Color("#F7F9F6"))
		for d in a.size():
			var v := float(a[d]); var bh := h * v / mx
			draw_rect(Rect2(x0 + d * dx, y + h - bh, maxf(dx - 0.5, 1.0), bh), Color("#C8323C") if v > lim else col)
			if cap == "CREW" and dx >= 12.0 and v > 0.0: EqTheme.ds(self, EqTheme.font("mono"), Vector2(x0 + d * dx + 1.0, y + h - bh - 2.0), "%d" % int(v), HORIZONTAL_ALIGNMENT_LEFT, dx, EqTheme.fs(9), Color("#1E2A2E"))   # crew in use that day, against the limit line
		var ly := y + h - h * lim / mx; draw_line(Vector2(x0, ly), Vector2(x0 + pw, ly), Color("#1E2A2E"), 1.5)

class Chips extends Control:
	signal moved(from: int, to: int)
	signal picked(i: int)
	var chips: Array = []
	var sel_keep := -1
	var _drag := -1
	var _pos := Vector2.ZERO
	var _press := Vector2.ZERO
	var _sel := -1
	const CH := 26.0
	const NUDGE_PX := 10.0       ## a drag that ends on its own chip but travelled this far sideways moves it one place
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_DRAG; focus_mode = Control.FOCUS_ALL
	func _w(i: int) -> float: return minf(maxf(size.x, 120.0), minf(190.0, EqTheme.font("mono").get_string_size(str(chips[i].label), HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(12)).x + 34.0))
	func _layout() -> Array:
		var out: Array = []; var x := 0.0; var y := 0.0
		for i in chips.size():
			var w := _w(i)
			if x + w > size.x and x > 0: x = 0.0; y += CH + 4.0
			out.append(Rect2(x, y, w, CH)); x += w + 4.0
		return out
	func _ready() -> void: resized.connect(_fix); _sel = sel_keep; queue_redraw()
	func _fix() -> void:
		var l := _layout(); custom_minimum_size.y = (l.back().end.y if not l.is_empty() else CH) + 2.0
	func _notification(what: int) -> void:
		if what == NOTIFICATION_RESIZED or what == NOTIFICATION_READY: _fix()
	func _get_tooltip(at: Vector2) -> String:
		var l := _layout()
		for i in l.size(): if (l[i] as Rect2).has_point(at): return str(chips[i].label)
		return ""
	## The chip a drop at `p` lands on: the chip whose rectangle holds the point (chips differ in width, so the nearest centre is often the wrong neighbour); in a gap or off the row, the nearest rectangle.
	func slot_at(p: Vector2) -> int:
		var l := _layout(); var best := -1; var bd := 1e9
		for i in l.size():
			var r: Rect2 = l[i]
			if r.has_point(p): return i
			var cp := Vector2(clampf(p.x, r.position.x, r.end.x), clampf(p.y, r.position.y, r.end.y))
			var d := cp.distance_to(p)
			if d < bd: bd = d; best = i
		return best
	## Pick a chip and move it one place earlier (-1) or later (+1) with the arrow keys or the arrow buttons.
	func nudge(dir: int) -> void:
		var to := _sel + dir
		if _sel < 0 or to < 0 or to >= chips.size(): return
		var from := _sel; _sel = to; moved.emit(from, to)
	func _gui_input(e: InputEvent) -> void:
		var l := _layout()
		if e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			if e.pressed:
				_drag = -1
				for i in l.size(): if (l[i] as Rect2).has_point(e.position): _drag = i
				if _drag >= 0: _sel = _drag; _press = e.position; _pos = e.position; picked.emit(_drag); grab_focus()
				queue_redraw()
			elif _drag >= 0:
				var f := _drag; _drag = -1
				var to := slot_at(e.position)
				if to == f and absf(e.position.x - _press.x) >= NUDGE_PX:   # a short drag that stays on its own chip: one place the way it went
					to = clampi(f + (1 if e.position.x > _press.x else -1), 0, chips.size() - 1)
				queue_redraw()
				if to != f and to >= 0: _sel = to; moved.emit(f, to)
		elif e is InputEventMouseMotion and _drag >= 0: _pos = e.position; queue_redraw()
		elif e is InputEventKey and e.pressed and _sel >= 0:
			if e.keycode == KEY_LEFT: nudge(-1); accept_event()
			elif e.keycode == KEY_RIGHT: nudge(1); accept_event()
	func _draw() -> void:
		var l := _layout(); var f := EqTheme.font("mono")
		for i in l.size():
			var r: Rect2 = l[i]; var c: Dictionary = chips[i]
			var col := Color("#C8323C") if bool(c.crit) else Color("#3C7E8C")
			draw_rect(r, Color(col, 0.35) if i == _drag else col); draw_rect(r, col.darkened(0.4), false, 1.0)
			if i == _sel: draw_rect(r.grow(1.5), Color("#1E2A2E"), false, 2.5)
			EqTheme.ds(self, f, r.position + Vector2(8, 17), "%d %s" % [i + 1, Plan.fit_text(f, str(c.label), r.size.x - 30, EqTheme.fs(12))], HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 8, EqTheme.fs(12), Color.WHITE)
		if _drag >= 0:
			var r2: Rect2 = l[_drag]; r2.position = _pos - r2.size * 0.5
			draw_rect(r2, Color("#1E2A2E")); EqTheme.ds(self, f, r2.position + Vector2(8, 17), str(chips[_drag].label), HORIZONTAL_ALIGNMENT_LEFT, r2.size.x - 8, EqTheme.fs(12), Color.WHITE)
