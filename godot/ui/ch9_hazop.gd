class_name Ch9Hazop
extends Ch9Board
## L34: the HAZOP worksheet on a clipboard. A 6x5 grid of parameters x guide words (click a cell to simulate that deviation on the node), the row editor
## for the selected cell (cause, consequence, safeguard pickers) and the typewriter rows with pencil ticks and crosses once graded.
const CLS_COL := {"none": Color("#CFE0CF"), "operability": Color("#F1DFA0"), "corrosion": Color("#EDBE8A"), "equipment": Color("#E79A86"), "release": Color("#DC6B6B")}
var sel_p := ""
var sel_g := ""
var _pick := {}              ## "p.g" -> {cause, cons, safe} the player last chose

var _footer: HBoxContainer   ## sticky: ADD / REPLACE / REMOVE ROW stay in view while the worksheet scrolls

func _init() -> void:
	super()
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 4); vb.size_flags_horizontal = Control.SIZE_EXPAND_FILL; vb.size_flags_vertical = Control.SIZE_EXPAND_FILL
	remove_child(scroll); scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; vb.add_child(scroll)
	_footer = HBoxContainer.new(); _footer.name = "Footer"; _footer.add_theme_constant_override("separation", 8); vb.add_child(_footer)
	add_child(vb)

func _build() -> void:
	for c in _footer.get_children(): _footer.remove_child(c); c.queue_free()
	var cov: Dictionary = view.get("coverage", {}); var node: Dictionary = view.get("node", {})
	body.add_child(head("HAZOP WORKSHEET", str(node.get("label", ""))))
	var prop := float(view.get("proposalUSD", 0.0)); var bud := float(view.get("budgetUSD", 0.0))
	var line := HBoxContainer.new(); line.add_theme_constant_override("separation", 14); body.add_child(line)
	var covd := int(cov.get("covered", 0)); var need := int(cov.get("needed", 0))
	line.add_child(lbl("COVERED %d / %d" % [covd, need], 14, OKGREEN if covd == need and need > 0 else PENCIL, "mono_bold"))
	line.add_child(lbl("PROPOSAL %s / %s" % [usd(prop), usd(bud)], 14, STAMP_RED if prop > bud else PENCIL, "mono_bold"))
	var des: Dictionary = node.get("design", {})
	if not des.is_empty():
		line.add_child(lbl("T in %s K  T sat %s K  dew %s K  NTU %s" % [fnum(des.get("tIn", 0)), fnum(des.get("tSat", 0)), fnum(des.get("tDew", 0)), fnum(des.get("ntu", 0), 1)], 12, PENCIL))
	var grid := Grid.new(); grid.view = view; grid.sel_p = sel_p; grid.sel_g = sel_g; grid.custom_minimum_size = Vector2(300, 40.0 + 6 * 36.0)
	grid.picked.connect(_on_cell); body.add_child(grid)
	_editor()
	_rows()

func _cell(p: String, g: String) -> Dictionary:
	for c in view.get("cells", []): if c.param == p and c.guide == g: return c
	return {}

func _on_cell(p: String, g: String) -> void:
	sel_p = p; sel_g = g
	var c := _cell(p, g)
	if bool(c.get("meaningful", false)) and not bool(c.get("simulated", false)): emit_act("simulate", [p, g]); return
	_render()

func _label_of(arr: Array, id: String) -> String:
	for x in arr: if x.id == id: return str(x.label)
	return id

func _editor() -> void:
	body.add_child(HSeparator.new())
	if sel_p == "":
		_footer.add_child(lbl("Pick a cell: it simulates that deviation on the node.", 12, PENCIL))
		body.add_child(lbl("Pick a cell: it simulates that deviation on the node.", 13, PENCIL)); return
	var c := _cell(sel_p, sel_g)
	var title := "%s  /  %s" % [_label_of(view.get("params", []), sel_p), _label_of(view.get("guides", []), sel_g)]
	body.add_child(lbl(title.to_upper(), 15, Color("#1E2A2E"), "mono_bold"))
	if not bool(c.get("meaningful", false)): body.add_child(lbl("No meaningful deviation here.", 13, PENCIL)); return
	var sim = c.get("sim", null)
	if sim is Dictionary:
		var s := "T out %s K   dew margin %s K   tube metal %s K\n%s   steam %s bar   carry-over %s" % [fnum(sim.tOut), fnum(sim.dewMargin), fnum(sim.tubeMetal), ("uncovered in %s min" % fnum(sim.tUncoverMin)) if float(sim.tUncoverMin) < 9999.0 else "never uncovered", fnum(sim.pSteam, 1), "YES" if int(sim.carry) == 1 else "no"]
		body.add_child(lbl(s, 13, PENCIL))
		body.add_child(lbl("Simulated consequence: " + _label_of(view.get("consequences", []), str(sim.cls)).to_upper(), 13, STAMP_RED if int(sim.sev) >= 2 else OKGREEN, "mono_bold"))
	var key_ := sel_p + "." + sel_g
	var cur: Dictionary = _pick.get(key_, {})
	var causes: Array = []
	for cid in c.get("causes", []): causes.append({"id": cid, "label": _label_of(view.get("causes", []), str(cid))})
	var cons: Array = view.get("consequences", []); var sgs: Array = view.get("safeguards", [])
	var row := GridContainer.new(); row.columns = 2 if not narrow else 1; row.add_theme_constant_override("h_separation", 8); body.add_child(row)
	var ob_c := _picker(row, "CAUSE", causes, str(cur.get("cause", "")), func(id): _remember(key_, "cause", id))
	var ob_k := _picker(row, "CONSEQUENCE", cons, str(cur.get("cons", "")), func(id): _remember(key_, "cons", id))
	var sg_items: Array = []
	for x in sgs: sg_items.append({"id": x.id, "label": "%s  %s%s" % [x.label, usd(float(x.priceUSD)), " (installed)" if bool(x.installed) else ""]})
	var ob_s := _picker(row, "SAFEGUARD", sg_items, str(cur.get("safe", "")), func(id): _remember(key_, "safe", id))
	var btns := _footer
	btns.add_child(key("ADD ROW" if not bool(c.get("row", false)) else "REPLACE ROW", func(): emit_act("addRow", [sel_p, sel_g, _sel(ob_c), _sel(ob_k), _sel(ob_s)]), true))
	if bool(c.get("row", false)): btns.add_child(key("REMOVE ROW", func(): emit_act("removeRow", [sel_p, sel_g])))

func _remember(k: String, f: String, id: String) -> void:
	var d: Dictionary = _pick.get(k, {}); d[f] = id; _pick[k] = d

func _sel(ob: OptionButton) -> String: return str(ob.get_item_metadata(ob.selected)) if ob.selected >= 0 else ""

func _picker(parent: Control, cap: String, items: Array, cur: String, on_pick: Callable) -> OptionButton:
	var box := VBoxContainer.new(); box.size_flags_horizontal = Control.SIZE_EXPAND_FILL; box.add_theme_constant_override("separation", 1); parent.add_child(box)
	box.add_child(lbl(cap, 11, PENCIL, "semi"))
	var ob := OptionButton.new(); ob.add_theme_font_override("font", EqTheme.font("mono")); ob.add_theme_font_size_override("font_size", EqTheme.fs(13))
	ob.add_theme_color_override("font_color", EqTheme.INK); ob.add_theme_color_override("font_hover_color", EqTheme.INK); ob.add_theme_color_override("font_focus_color", EqTheme.INK); ob.add_theme_color_override("font_pressed_color", EqTheme.INK)
	for st in ["normal", "hover", "pressed", "focus"]:
		var sb := EqTheme.key_sb(false, st if st != "focus" else "hover"); sb.content_margin_top = 4; sb.content_margin_bottom = 4; ob.add_theme_stylebox_override(st, sb)
	ob.clip_text = true; ob.custom_minimum_size = Vector2(0, 32); ob.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	var idx := 0
	for i in items.size():
		ob.add_item(str(items[i].label)); ob.set_item_metadata(i, items[i].id)
		if str(items[i].id) == cur: idx = i
	if items.size() > 0: ob.select(idx); on_pick.call(str(items[idx].id))
	ob.item_selected.connect(func(i: int): on_pick.call(str(ob.get_item_metadata(i))))
	box.add_child(ob)
	return ob

func _rows() -> void:
	body.add_child(HSeparator.new())
	var rows: Array = view.get("rows", [])
	body.add_child(head("WORKSHEET ROWS", "%d" % rows.size()))
	if rows.is_empty(): body.add_child(lbl("No rows yet.", 13, PENCIL))
	for r in rows:
		var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 10); body.add_child(h)
		var graded := bool(r.get("graded", false))
		h.add_child(lbl("%s / %s" % [str(r.get("paramLabel", r.param)), str(r.get("guideLabel", r.guide))], 13, Color("#1E2A2E"), "mono_bold"))
		for f in [["cause", "causeOk", view.get("causes", []), "causeLabel"], ["cons", "consOk", view.get("consequences", []), "consLabel"], ["safe", "safeOk", view.get("safeguards", []), "safeLabel"]]:
			var ok := bool(r.get(f[1], true)); var col := PENCIL if not graded else (OKGREEN if ok else STAMP_RED)
			h.add_child(lbl(("› " if f[0] != "cause" else "") + str(r.get(f[3], _label_of(f[2], str(r[f[0]])))) + ("" if not graded else (" ✓" if ok else " ✗")), 12, col))
		h.add_child(key("×", func(): emit_act("removeRow", [r.param, r.guide])))

class Grid extends Control:
	signal picked(p: String, g: String)
	var view := {}
	var sel_p := ""
	var sel_g := ""
	const HW := 140.0
	const TOPH := 30.0
	const CH := 36.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
	func _cw() -> float: return (size.x - HW) / maxf(view.get("guides", []).size(), 1)
	func _rect(i: int, j: int) -> Rect2: return Rect2(HW + j * _cw(), TOPH + i * CH, _cw(), CH)
	func _get_tooltip(at: Vector2) -> String:
		var ps: Array = view.get("params", []); var gs: Array = view.get("guides", [])
		for i in ps.size():
			if at.x < HW and at.y >= TOPH + i * CH and at.y < TOPH + (i + 1) * CH: return str(ps[i].label)
			for j in gs.size():
				if _rect(i, j).has_point(at):
					for x in view.get("cells", []):
						if x.param == ps[i].id and x.guide == gs[j].id:
							if not bool(x.meaningful): return "%s / %s: no meaningful deviation" % [ps[i].label, gs[j].label]
							if bool(x.simulated): return "%s / %s: %s (T out %d K)" % [ps[i].label, gs[j].label, x.sim.cls, int(round(float(x.sim.tOut)))]
							return "%s / %s: tap to simulate" % [ps[i].label, gs[j].label]
		for j in gs.size():
			if at.y < TOPH and at.x >= HW + j * _cw() and at.x < HW + (j + 1) * _cw(): return str(gs[j].label)
		return ""
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT:
			var ps: Array = view.get("params", []); var gs: Array = view.get("guides", [])
			for i in ps.size(): for j in gs.size():
				if _rect(i, j).has_point(e.position): picked.emit(ps[i].id, gs[j].id); accept_event(); return
	func _draw() -> void:
		var ps: Array = view.get("params", []); var gs: Array = view.get("guides", [])
		var f := EqTheme.font("mono"); var fb := EqTheme.font("mono_bold")
		for j in gs.size(): EqTheme.ds(self, fb, Vector2(HW + j * _cw() + 4, 20), str(gs[j].label).to_upper(), HORIZONTAL_ALIGNMENT_LEFT, _cw() - 6, EqTheme.fs(12), Ch9Board.PENCIL)
		for i in ps.size():
			draw_multiline_string(fb, Vector2(2, TOPH + i * CH + 14), str(ps[i].label).to_upper(), HORIZONTAL_ALIGNMENT_LEFT, HW - 6, EqTheme.fs(10), 2, Ch9Board.PENCIL)
			for j in gs.size():
				var r := _rect(i, j).grow(-1.5); var c := {}
				for x in view.get("cells", []): if x.param == ps[i].id and x.guide == gs[j].id: c = x
				if not bool(c.get("meaningful", false)):
					draw_rect(r, Color("#DDD5BF"))
					for k in range(0, int(r.size.x + r.size.y), 7): draw_line(Vector2(r.position.x + minf(k, r.size.x), r.position.y + maxf(0, k - r.size.x)), Vector2(r.position.x + maxf(0, k - r.size.y), r.position.y + minf(k, r.size.y)), Color(0, 0, 0, 0.12), 1.0)
				elif bool(c.get("simulated", false)):
					var sm: Dictionary = c.sim; draw_rect(r, Ch9Hazop.CLS_COL.get(str(sm.cls), Color.WHITE))
					EqTheme.ds(self, fb, r.position + Vector2(4, 15), ({"none": "OK", "operability": "OPER", "corrosion": "CORR", "equipment": "EQUIP", "release": "RELEASE"}.get(str(sm.cls), "?")), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 6, EqTheme.fs(12), Color("#1E2A2E"))
					EqTheme.ds(self, f, r.position + Vector2(4, 30), "%d K" % int(round(float(sm.tOut))), HORIZONTAL_ALIGNMENT_LEFT, r.size.x - 6, EqTheme.fs(11), Ch9Board.PENCIL)
				else:
					draw_rect(r, Color("#F7F2E4")); EqTheme.ds(self, fb, r.position + Vector2(r.size.x * 0.5 - 4, 23), "?", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(16), Color(0, 0, 0, 0.3))
				draw_rect(r, Color(0, 0, 0, 0.25), false, 1.0)
				match str(c.get("rowState", "")):   # the tick counts exactly what COVERED n / m counts: a significant deviation with the right consequence class
					"covered": EqTheme.ds(self, fb, r.position + Vector2(r.size.x - 18, 16), "✓", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(16), Ch9Board.OKGREEN)
					"wrong": EqTheme.ds(self, fb, r.position + Vector2(r.size.x - 18, 16), "✗", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(16), Ch9Board.STAMP_RED)
					"extra": EqTheme.ds(self, fb, r.position + Vector2(r.size.x - 16, 16), "·", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(16), Ch9Board.PENCIL)
				if str(ps[i].id) == sel_p and str(gs[j].id) == sel_g: draw_rect(r.grow(1), EqTheme.TEAL, false, 3.0)
