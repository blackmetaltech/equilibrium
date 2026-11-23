class_name Notebook
extends RefCounted
## The lab notebook (UI.md section 7): a squared porcelain page that slides up over the dimmed world. Level title, the setter's note signed in pen, goals on
## ruled lines with tick boxes, the budget, three flask stars, the Call-it answer line (keypad -> `callIt`), the Learner/Engineer chip on the first job and
## the teal "Start work" key. Everything comes from the `levelInfo` query. It folds into a tab at the top left.
static var stub := {}          # a levelInfo-shaped dict for galleries/tests; used when the engine has none
static var started := {}       # level id -> the job has been worked on (commissioned, or restarted with the build kept): the key says Back to work
static var _named_pick := {}   # level id -> the species chip picked for a named call-it (L04 limiting reagent), sent with the number
static var _seen := {}         # app instance id -> last level id the watcher opened for
static var qa_hold := false    # QA (CB_CAM nbclose): the watcher does not open the notebook for this level start (it opens a frame or two after CB_CAM ran)

class Grid extends Control:
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var c := Color("#9DB7C9", 0.32)
		var x := 0.0
		while x < size.x: draw_line(Vector2(x, 0), Vector2(x, size.y), c, 1.0); x += 22.0
		var y := 0.0
		while y < size.y: draw_line(Vector2(0, y), Vector2(size.x, y), c, 1.0); y += 22.0
		draw_line(Vector2(54, 0), Vector2(54, size.y), Color(EqTheme.PEN_RED, 0.35), 2.0)   # the margin rule

class TickBox extends Control:
	var met := false
	func _init() -> void: custom_minimum_size = Vector2(26, 26); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		draw_rect(Rect2(2, 2, 22, 22), EqTheme.INK, false, 2.0)
		if met:
			draw_polyline(PackedVector2Array([Vector2(5, 14), Vector2(11, 21), Vector2(26, 0)]), EqTheme.PEN_GREEN, 3.5, true)

class Flask extends Control:
	var filled := false
	var armed := false            ## the third flask while a Call it answer is locked in: outlined, waiting to be earned
	func _init() -> void: custom_minimum_size = Vector2(46, 46); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		PidSymbols.flask(self, size * 0.5, 38.0, EqTheme.INK, filled, EqTheme.TEAL)
		if armed and not filled: draw_arc(size * 0.5, 22.0, 0.0, TAU, 40, EqTheme.TEAL, 3.0, true)

class Answer extends Control:
	var text := ""
	var unit := ""
	var locked := false
	var refused := false          ## the engine turned the typed value down: it stays on the line, in red
	signal tapped
	func _init() -> void: custom_minimum_size = Vector2(190, EqTheme.PHONE_TAP if CbLayout.phone else 38.0); mouse_default_cursor_shape = Control.CURSOR_IBEAM; focus_mode = Control.FOCUS_ALL
	func _gui_input(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or e.is_action_pressed("ui_accept"): tapped.emit(); accept_event()
	func _draw() -> void:
		draw_line(Vector2(0, size.y - 4), Vector2(size.x, size.y - 4), EqTheme.INK, 2.0)
		var f := EqTheme.font("mono_bold"); var fs := EqTheme.fs(22)
		if text == "": EqTheme.ds(self, EqTheme.font("sans"), Vector2(4, size.y - 12), PaperStrings.t("NB_TAP"), HORIZONTAL_ALIGNMENT_LEFT, size.x - 8, EqTheme.fs(15), EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.55))
		else: EqTheme.ds(self, f, Vector2(4, size.y - 10), text, HORIZONTAL_ALIGNMENT_LEFT, size.x - 8, fs, EqTheme.RED if refused else EqTheme.PEN_BLUE)
		if has_focus(): draw_rect(Rect2(0, 0, size.x, size.y), EqTheme.TEAL, false, 3.0)

# ---- query ---------------------------------------------------------------------------------------------------------------
static func info(app) -> Dictionary:
	var li = PaperStrings.q(app, "levelInfo")
	if li is Dictionary and not (li as Dictionary).is_empty(): return li
	return stub

static func stub_info() -> Dictionary:
	return {"id": "L01", "chapter": 1, "index": 1, "title": "Moles, Not Kilograms", "setter": "Mara", "place": "Kestrel Bay, ammonia loop",
		"note": ["The shop says 1 kg of H2 per 3 kg of N2. Reactors do not count kilograms.", "Count molecules, then call the mass you will buy."],
		"goals": [{"key": "nh3", "text": "Make 30 kmol/h of NH3", "met": true, "value": 31.2, "target": 30.0}, {"key": "vent", "text": "Vent under 2 % of the feed", "met": false}, {"key": "ratio", "text": "Feed H2:N2 at the reaction ratio", "met": false}],
		"budgetUSD": 120000, "spentUSD": 34500, "stars": {"have": 1, "rules": ["Meet every goal", "Spend under $90,000", "Vent under 0.5 %"]},
		"callIt": {"key": "h2", "prompt": "H2 needed for 140 kg/h of N2", "unit": "kg/h", "answered": false},
		"allowedUnits": [], "phase": "design", "mode": "learner", "lesson": ""}

static func result_stub(won: bool) -> Dictionary:
	return {"won": won, "verdictKey": "ok", "verdictText": "Ammonia on spec.", "cause": "" if won else "Hydrogen left through the vent: 41 kmol/h gone.",
		"equation": "" if won else "n(H2) = 3 x n(N2) = 3 x 5.0 = 15.0 kmol/h, you fed 3.0",
		"metrics": [{"key": "nh3", "label": "NH3 made", "value": 31.2, "unit": "kmol/h"}, {"key": "cost", "label": "Spend", "value": 84200, "unit": "$"}, {"key": "vent", "label": "Vent", "value": 0.4, "unit": "%"}],
		"stars": {"have": 2 if won else 0, "earned": [true, true, false] if won else [false, false, false]},
		"histogram": {"metric": "cost", "bins": [2, 5, 9, 14, 8, 3, 1], "edges": [60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000], "you": 84200.0, "youBin": 2} if won else null,
		"callIt": {"prompt": "H2 for 140 kg/h N2", "unit": "kg/h", "value": 30.0, "answer": 30.24, "ok": true}, "lesson": "Moles react in 1 : 3. By mass that is 6 kg H2 to 28 kg N2, about 1 : 4.7, not 1 : 3.", "designCode": "EQ1-L01-7K2F9Q"}

# ---- the page ------------------------------------------------------------------------------------------------------------
static func open(app) -> Control:
	var li := info(app)
	if li.is_empty(): return null
	var old = app.root.get_node_or_null("notebook")
	if old != null: return old
	var d: Dictionary = app.dialog("notebook", 780.0, 0.0, EqTheme.TEAL, 0.55)
	var host: Control = d.host; var pn: PanelContainer = d.panel; var vb: VBoxContainer = d.vb
	pn.add_theme_stylebox_override("panel", EqTheme.porcelain_sb(3, 0.0)); pn.clip_contents = false
	var grid := Grid.new(); pn.add_child(grid); pn.move_child(grid, 0)
	var mg := MarginContainer.new(); for s in ["left", "right"]: mg.add_theme_constant_override("margin_" + s, 28)
	mg.add_theme_constant_override("margin_left", 70); mg.add_theme_constant_override("margin_top", 22); mg.add_theme_constant_override("margin_bottom", 24)
	vb.reparent(mg)
	var sc := ScrollContainer.new(); sc.name = "PageScroll"; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sc.follow_focus = true; mg.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	sc.add_child(mg)   # a page taller than the screen scrolls instead of running off it...
	var outer := VBoxContainer.new(); outer.name = "Page"; outer.add_theme_constant_override("separation", 0); sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; outer.add_child(sc); pn.add_child(outer)
	var fm := MarginContainer.new(); fm.name = "FooterMargin"; fm.add_theme_constant_override("margin_left", 70); fm.add_theme_constant_override("margin_right", 28); fm.add_theme_constant_override("margin_bottom", 14); fm.add_theme_constant_override("margin_top", 4)
	var fvb := VBoxContainer.new(); fvb.name = "Footer"; fvb.add_theme_constant_override("separation", 8); fm.add_child(fvb); outer.add_child(fm)   # ...and Call it + Start work stay pinned under it
	vb.set_meta("fvb", fvb)
	var rule := ColorRect.new(); rule.name = "FooterRule"; rule.color = Color(EqTheme.INK, 0.35); rule.custom_minimum_size = Vector2(0, 2); outer.add_child(rule); outer.move_child(rule, 1)
	_fill(app, host, vb, li)
	_dismiss(app, host, sc)
	app.focus_dialog()
	var tw := host.create_tween(); pn.modulate.a = 0.0
	tw.tween_property(pn, "modulate:a", 1.0, 0.18)
	_settle.call_deferred(app, pn, 780.0)
	return host

## Wrapped labels size late: once the page has its width, shrink the panel to its content, re-centre it and slide it up.
static func _settle(app, pn: Control, w: float) -> void:
	if not is_instance_valid(pn): return
	for i in 2:
		await pn.get_tree().process_frame
		if not is_instance_valid(pn): return
	var vh: float = app.vs_h()
	var sc := pn.find_child("PageScroll", true, false) as ScrollContainer
	if sc != null:
		sc.custom_minimum_size.y = 0.0; pn.reset_size(); await pn.get_tree().process_frame
		if not is_instance_valid(pn): return
		var need := (sc.get_child(0) as Control).get_combined_minimum_size().y
		var fh := 0.0
		var fm := pn.find_child("FooterMargin", true, false) as Control
		if fm != null: fh = fm.get_combined_minimum_size().y + 2.0
		sc.custom_minimum_size.y = maxf(120.0, minf(need, vh - 24.0 - fh))
	pn.reset_size(); app.center(pn, w, 0.0)
	await pn.get_tree().process_frame
	if not is_instance_valid(pn): return
	if sc != null: _scroll_hint(pn, sc)
	var y := pn.position.y; pn.position.y = y + 70.0
	pn.create_tween().tween_property(pn, "position:y", y, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

## A page taller than the screen scrolls under the pinned footer: a row cut by the scroll edge looks clipped, so a "more below" tag sits on the edge while there is more to read.
static func _scroll_hint(pn: Control, sc: ScrollContainer) -> void:
	if pn.find_child("ScrollHint", true, false) != null: return
	var ov := Control.new(); ov.name = "ScrollHintHost"; ov.mouse_filter = Control.MOUSE_FILTER_IGNORE; pn.add_child(ov)
	var pl := PanelContainer.new(); pl.name = "ScrollHint"; pl.mouse_filter = Control.MOUSE_FILTER_IGNORE
	var sb := StyleBoxFlat.new(); sb.bg_color = Color(EqTheme.INK, 0.88); sb.set_corner_radius_all(10); sb.content_margin_left = 10; sb.content_margin_right = 10; sb.content_margin_top = 2; sb.content_margin_bottom = 2
	pl.add_theme_stylebox_override("panel", sb)
	var lb := EqTheme.label("▼ more below: scroll", 13, Color("#F4EEDC"), "semi"); lb.mouse_filter = Control.MOUSE_FILTER_IGNORE; pl.add_child(lb); ov.add_child(pl)
	var upd := func() -> void:
		if not is_instance_valid(sc) or not is_instance_valid(pl): return
		var content := (sc.get_child(0) as Control).size.y
		pl.visible = sc.scroll_vertical + sc.size.y < content - 6.0
		pl.reset_size()
		pl.position = (sc.global_position - pn.global_position) + Vector2(sc.size.x - pl.size.x - 36.0, sc.size.y - pl.size.y - 4.0)
	var vsb := sc.get_v_scroll_bar()
	vsb.value_changed.connect(func(_v: float): upd.call()); vsb.changed.connect(func(): upd.call()); sc.resized.connect(func(): upd.call())
	upd.call()

static func close(app) -> void:
	var h = app.root.get_node_or_null("notebook")
	if h != null: h.queue_free()

static func _rebuild(app, host: Control, vb: VBoxContainer) -> void:
	for c in vb.get_children(): c.queue_free()
	var fv0 = vb.get_meta("fvb", null)
	if fv0 != null: for c in (fv0 as Control).get_children(): c.queue_free()
	_fill(app, host, vb, info(app))

## Outside tap or a swipe down from the top of the page puts the notebook away (the Start key and the tab are the other ways).
static func _dismiss(app, host: Control, sc: ScrollContainer) -> void:
	var dm := host.get_child(0)
	if dm is Control: (dm as Control).gui_input.connect(func(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT and is_instance_valid(host): host.queue_free())
	var w := Dismiss.new(); w.sc = sc; w.host = host; host.add_child(w)

class Dismiss extends Node:
	var sc: ScrollContainer
	var host: Control
	var _y0 := -1.0
	var _x0 := 0.0
	var _top := false
	var _done := false
	func _input(e: InputEvent) -> void:
		if not is_instance_valid(sc) or not is_instance_valid(host): return
		if e is InputEventScreenTouch and (e as InputEventScreenTouch).index == 0:
			if e.pressed: _y0 = e.position.y; _x0 = e.position.x; _top = sc.scroll_vertical <= 1; _done = false
			else: _y0 = -1.0
		elif e is InputEventScreenDrag and _y0 >= 0.0 and _top and not _done and (e as InputEventScreenDrag).index == 0:
			var dy: float = e.position.y - _y0
			if dy > 110.0 and dy > absf(e.position.x - _x0) * 1.5 and sc.scroll_vertical <= 1: _done = true; host.queue_free()

## A goal's unit with its space (" s"), so "now 94 s · target 95 s" never shows two bare numbers.
static func _gu(g: Dictionary) -> String: return (" " + str(g.unit)) if str(g.get("unit", "")) != "" else ""

## The dymo already says CALL IT: the rule starts at "Predict before...", not "Call it: predict before...".
static func _rule_text(t: String) -> String:
	var r := t.trim_prefix("Call it: ")
	return r if r == t else r.left(1).to_upper() + r.substr(1)

static var _more_open := {}   ## level id -> the "more" lines of its brief are open

static func _fill(app, host: Control, vb: VBoxContainer, li: Dictionary) -> void:
	var fvb: VBoxContainer = vb.get_meta("fvb", vb)
	vb.add_theme_constant_override("separation", 10); vb.custom_minimum_size.x = minf(660.0, app.get_viewport().get_visible_rect().size.x - 140.0)   # wrapped labels need a width to size against
	var idx := int(li.get("index", 0))
	var title := EqTheme.label("%02d · %s" % [idx, str(li.title)], 32, EqTheme.INK, "title"); title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; title.name = "Title"; vb.add_child(title)
	if str(li.get("place", "")) != "": vb.add_child(EqTheme.label(str(li.place), 15, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.4), "semi"))
	# the setter's note, handwritten-feel: pen blue, a degree off true, signed
	var lines: Array = li.get("note", [])
	var many := lines.size() > 4   # a recipe in short numbered steps: each its own paragraph with air between, a little smaller so the steps fit the page
	var note := VBoxContainer.new(); note.name = "Note"; note.add_theme_constant_override("separation", 9 if many else 2); vb.add_child(note)
	var shown: Array = lines; var extra: Array = []
	if not many:   # 0.12: the goal and what to do first (three short lines); the rest behind "more"; the Call-it rule is not said twice
		var parts := BriefLines.split(lines, str(li.get("predictNote", "")) if li.get("predictNote") != null else "")
		shown = parts.first; extra = parts.more
	for ln in shown:
		var l := EqTheme.label(str(ln), 17 if many else 19, EqTheme.PEN_BLUE, "sans"); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL; note.add_child(l)
	if not extra.is_empty():
		var lid0 := str(li.get("id", ""))
		var xv := VBoxContainer.new(); xv.name = "NoteMore"; xv.add_theme_constant_override("separation", 9); xv.visible = bool(_more_open.get(lid0, false))
		for ln in extra:
			var l2 := EqTheme.label(str(ln), 17, EqTheme.PEN_BLUE, "sans"); l2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; xv.add_child(l2)
		var mb := EqTheme.key_button(PaperStrings.t("NB_LESS") if xv.visible else PaperStrings.t("NB_MORE"), false, 15); mb.name = "NoteMoreBtn"; mb.custom_minimum_size = Vector2(120, 36); mb.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
		mb.pressed.connect(func(): xv.visible = not xv.visible; _more_open[lid0] = xv.visible; mb.text = PaperStrings.t("NB_LESS") if xv.visible else PaperStrings.t("NB_MORE"))
		note.add_child(mb); note.add_child(xv)
	var sg := EqTheme.label("— " + str(li.get("setter", "")), 19, EqTheme.PEN_BLUE, "semi"); sg.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; note.add_child(sg)
	note.rotation_degrees = -0.4
	# goals
	vb.add_child(EqTheme.dymo(PaperStrings.t("NB_GOALS"), 13))
	var gv := VBoxContainer.new(); gv.name = "Goals"; gv.add_theme_constant_override("separation", 0); vb.add_child(gv)
	for g in li.get("goals", []):
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); row.name = "Goal_" + str(g.key)
		var kept := false   # after Keep improving the plant is the same as the one that passed: the tick stays until a part or a dial changes
		var kg: Dictionary = BuildKeeper.kept_goals.get(str(li.get("id", "")), {})
		if not bool(g.met) and bool(g.get("pending", false)) and not kg.is_empty() and (kg.met as Array).has(str(g.key)):
			if int(kg.sig) == BuildKeeper.plant_sig(app): kept = true
			else: BuildKeeper.kept_goals.erase(str(li.get("id", "")))
		var tb := TickBox.new(); tb.met = bool(g.met) or kept; row.add_child(tb)
		var gl := EqTheme.label(str(g.text), 18, EqTheme.INK, "sans"); gl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; gl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; row.add_child(gl)
		if g.get("readout") != null and str(g.readout) != "":
			row.add_child(EqTheme.label(str(g.readout), 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.25), "mono"))
		elif bool(g.get("pending", false)) and not bool(g.met):
			row.add_child(EqTheme.label(PaperStrings.t("NB_KEPT") if kept else PaperStrings.t("NB_PENDING"), 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.4), "mono"))
		elif g.has("value") and g.get("value") != null:
			var vt := PaperStrings.t("NB_NOW") % PaperStrings.num(float(g.value)) + _gu(g) + ((" · " + PaperStrings.t("NB_TARGET") % (PaperStrings.num(float(g.target)) + _gu(g))) if g.get("target") != null else "")   # "now 16.67 · target 10.25", never two bare numbers
			row.add_child(EqTheme.label(vt, 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.25), "mono"))
		gv.add_child(row)
		var rule := ColorRect.new(); rule.color = Color(EqTheme.INK, 0.28); rule.custom_minimum_size = Vector2(0, 1); gv.add_child(rule)
	# the build checklist: the same lines as the panel under the tab (a click puts the notebook away and points at the line)
	var bg = li.get("buildGuide")
	if bg is Array and not (bg as Array).is_empty():
		var ndone := 0
		for bl in bg: if bool(bl.get("done", false)): ndone += 1
		vb.add_child(EqTheme.dymo("%s  %d / %d" % [PaperStrings.t("BC_TITLE"), ndone, (bg as Array).size()], 13))
		var bv := VBoxContainer.new(); bv.name = "BuildGuide"; bv.add_theme_constant_override("separation", 1); vb.add_child(bv)
		BuildChecklist.fill_rows(app, bv, bg, func(sid: String) -> void:
			host.queue_free()
			(func() -> void:
				var bp := BuildChecklist.panel(app)
				if bp != null: bp.activate(sid)).call_deferred(), 16)
	# budget
	var bud := HBoxContainer.new(); bud.add_theme_constant_override("separation", 12); vb.add_child(bud)
	bud.add_child(EqTheme.dymo(PaperStrings.t("NB_BUDGET"), 13))
	var btxt := "$%s   %s $%s" % [CbKit.num(float(li.get("budgetUSD", 0)), 0), PaperStrings.t("NB_SPENT"), CbKit.num(float(li.get("spentUSD", 0)), 0)]
	var bl := EqTheme.label(btxt, 18, EqTheme.INK, "mono_bold"); bl.name = "Budget"; bud.add_child(bl)
	# flasks
	var st: Dictionary = li.get("stars", {"have": 0, "rules": []})
	var fv := HBoxContainer.new(); fv.name = "Stars"; fv.add_theme_constant_override("separation", 18); vb.add_child(fv)
	var fl := VBoxContainer.new(); fl.add_child(EqTheme.dymo(PaperStrings.t("NB_STARS"), 13)); fv.add_child(fl)
	var armed_i := 2   # the flask the Call it answer is for: the star rule that says "on paper" / "call it" / "predict" (L20: the second), else the third
	var rules0: Array = st.get("rules", []) if st.get("rules") is Array else []
	for ri in rules0.size():
		var rt := str(rules0[ri]).to_lower()
		if rt.contains("on paper") or rt.contains("call it") or rt.contains("predict") or rt.contains("your prediction"): armed_i = ri; break
	for i in range(3):
		var cell := HBoxContainer.new(); cell.add_theme_constant_override("separation", 6); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var earned: Array = st.get("earned", []) if st.get("earned") is Array else []
		var f := Flask.new(); f.name = "Flask_%d" % i; f.filled = bool(earned[i]) if i < earned.size() else i < int(st.get("have", 0)); cell.add_child(f)   # each flask is its own star (the second can be lit without the first being "the count")
		if i == armed_i and ((li.get("callIt") is Dictionary and bool(li.callIt.get("answered", false))) or (li.get("callIts") is Array and not (li.callIts as Array).is_empty() and bool((li.callIts[0] as Dictionary).get("answered", false)))): f.armed = true
		var rl := EqTheme.label(str((st.get("rules", []) as Array)[i]) if i < (st.get("rules", []) as Array).size() else "", 14, EqTheme.INK, "sans")
		rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; rl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rl.custom_minimum_size = Vector2(120, 0); cell.add_child(rl); fv.add_child(cell)
	# call it: one row per prediction (levelInfo.callIts when the level has several, else the single callIt)
	var cis: Array = []
	if li.get("callIts") is Array and not (li.callIts as Array).is_empty(): cis = li.callIts
	elif li.get("callIt") is Dictionary: cis = [li.callIt]
	var cbox := VBoxContainer.new(); cbox.name = "CallBox"; cbox.add_theme_constant_override("separation", 6); cbox.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	if not cis.is_empty():   # the call rows scroll inside the page (a four-item bench must not push the title and the Start key off a 1080p screen)
		var csc := ScrollContainer.new(); csc.name = "CallScroll"; csc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; csc.size_flags_horizontal = Control.SIZE_EXPAND_FILL; csc.add_child(cbox); fvb.add_child(csc)
		_fit_calls.call_deferred(app, csc, cbox)
	for ci in cis:
		if not (ci is Dictionary): continue
		if ci == cis[0] and li.get("predictNote") != null and str(li.predictNote) != "":
			var pn := EqTheme.label(_rule_text(str(li.predictNote)), 15, EqTheme.PEN_BLUE, "semi"); pn.name = "PredictNote"; pn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cbox.add_child(pn)
		var ckey := str(ci.get("key", ""))
		var cr := HBoxContainer.new(); cr.name = "CallIt" if cis.size() == 1 else "CallIt_" + ckey; cr.add_theme_constant_override("separation", 10); cbox.add_child(cr)
		cr.add_child(EqTheme.dymo(PaperStrings.t("NB_CALLIT"), 13))
		var pl := EqTheme.label(str(ci.prompt) + ":", 18, EqTheme.INK, "sans"); pl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; pl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cr.add_child(pl)
		var answered := bool(ci.get("answered", false)) and ci.get("value") != null
		var opts: Array = ci.get("options", []) if ci.get("options") is Array else []
		var lid := str(li.get("id", ""))
		if not opts.is_empty():   # a named part of the call (L04: the limiting reagent): pick a chip first, the number then locks both
			var nr := HBoxContainer.new(); nr.name = "NamedPick"; nr.add_theme_constant_override("separation", 6); cr.add_child(nr)
			nr.add_child(EqTheme.label(PaperStrings.t("NB_NAMED"), 15, EqTheme.INK, "sans"))
			var cur := str(ci.get("named", "")) if answered else str(_named_pick.get(lid, ""))
			for o in opts:
				var ob := EqTheme.key_button(EqStrings.formula(str(o)), cur == str(o), 15); ob.name = "Named_" + str(o); ob.custom_minimum_size = Vector2(56, 36); ob.disabled = answered
				var ov := str(o)
				ob.pressed.connect(func(): _named_pick[lid] = ov; _rebuild(app, host, vb)); nr.add_child(ob)
		var an := Answer.new(); an.name = "Answer"; an.unit = str(ci.unit)
		if answered: an.text = PaperStrings.num(float(ci.value))
		cr.add_child(an)
		cr.add_child(EqTheme.label(str(ci.unit), 18, EqTheme.INK, "mono"))
		var cnote := EqTheme.label(" ", 15, EqTheme.RED, "semi"); cnote.name = "CallNote"; cnote.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cnote.size_flags_horizontal = Control.SIZE_EXPAND_FILL   # the note line is always there (blank until the answer is locked), so a locked answer never pushes the page down
		if answered:   # the locked answer is written under the line, and stays there when the notebook is reopened
			cnote.text = PaperStrings.t("NB_PREDICTED") % [PaperStrings.num(float(ci.value)), str(ci.unit)] + ("  ✓" if ci.get("ok") == true else ("  ✗" if ci.get("ok") == false else "")) + ((" · actual %s %s" % [PaperStrings.num(float(ci.truth)), str(ci.unit)]) if ci.get("truth") != null else "") + ((" · " + str(ci.tol)) if str(ci.get("tol", "")) != "" else "") + ((" · " + PaperStrings.t("NB_NAMED") + " " + str(ci.named) + (("  ✓" if ci.get("namedOk") == true else "  ✗ (" + str(ci.get("truthNamed", "")) + ")") if ci.get("namedOk") != null else "")) if str(ci.get("named", "")) != "" else "")
			cnote.add_theme_color_override("font_color", EqTheme.PEN_GREEN if ci.get("ok") == true else EqTheme.INK); cnote.label_settings = EqStrings.ls(15, EqTheme.PEN_GREEN if ci.get("ok") == true else EqTheme.INK, "semi"); cnote.visible = true
		var cwrap := VBoxContainer.new(); cwrap.add_theme_constant_override("separation", 2); var pi := cr.get_index(); cbox.remove_child(cr); cwrap.add_child(cr)
		if str(ci.get("given", "")) != "":   # what the call needs (data, table, formula), never the answer: written under the call row
			var cg := EqTheme.label(str(ci.given), 14, EqTheme.PEN_BLUE, "sans"); cg.name = "CallGiven"; cg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cg.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cwrap.add_child(cg)
		cwrap.add_child(cnote); cbox.add_child(cwrap); cbox.move_child(cwrap, pi)
		var lo_b := float(ci.get("min", 0.0)); var hi_b := float(ci.get("max", 1e9))   # the engine's bounds for this answer (a typed 7000 °C is refused before it is locked in)
		var is_locked := bool(ci.get("locked", answered)) and ci.get("value") != null
		an.locked = is_locked
		if is_locked: an.mouse_default_cursor_shape = Control.CURSOR_ARROW; an.focus_mode = Control.FOCUS_NONE
		an.tapped.connect(func():
			if is_locked: return   # a locked call-it shows its answer and is never re-armed
			Knob.keypad(app, str(ci.prompt), str(ci.unit), an.text, lo_b, hi_b, func(v: float) -> void:
				if not opts.is_empty() and str(_named_pick.get(lid, "")) == "":   # both parts lock together: ask for the name first
					an.text = PaperStrings.num(v); an.refused = true; an.queue_redraw()
					cnote.text = PaperStrings.t("NB_NAMED_FIRST"); cnote.label_settings = EqStrings.ls(15, EqTheme.RED, "semi"); cnote.visible = true
					return
				var r: Dictionary = app.b.act("callIt", [v, str(_named_pick[lid])] if not opts.is_empty() else ([v] if ckey == "" else [v, ckey]))
				if not bool(r.get("ok", false)):   # the engine's refusal is shown on the page itself, and the typed value stays on the line
					an.text = PaperStrings.num(v); an.refused = true; an.queue_redraw()
					cnote.text = PaperStrings.t("NB_REFUSED") % str(r.get("message", "")); cnote.add_theme_color_override("font_color", EqTheme.RED); cnote.label_settings = EqStrings.ls(15, EqTheme.RED, "semi"); cnote.visible = true
				else: _rebuild(app, host, vb)))
	# mode chip (first job only), then the key
	var foot := HBoxContainer.new(); foot.add_theme_constant_override("separation", 10); fvb.add_child(foot)
	if _is_first(app, str(li.get("id", ""))):
		foot.add_child(EqTheme.dymo(PaperStrings.t("NB_MODE"), 13))
		for m in ["learner", "engineer"]:
			var on: bool = str(li.get("mode", "learner")) == m
			var b := EqTheme.key_button(PaperStrings.t("NB_" + m.to_upper()), on, 15); b.name = "Mode_" + m; b.custom_minimum_size = Vector2(0, 36)
			b.pressed.connect(func(): app.b.act("setMode", [m]); _rebuild(app, host, vb)); foot.add_child(b)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; foot.add_child(sp)
	var go := EqTheme.key_button(PaperStrings.t("NB_RESUME") if (bool(started.get(str(li.get("id", "")), false)) or str(li.get("phase", "design")) != "design" or int(app.b.g.get("tick", 0)) > 0 or (PaperStrings.q(app, "runs") is Array and not (PaperStrings.q(app, "runs") as Array).is_empty())) else PaperStrings.t("NB_START"), true, 20); go.name = "Start"; go.custom_minimum_size = Vector2(190, 50)
	go.pressed.connect(func(): host.queue_free()); foot.add_child(go)

## The call rows take what they need up to a share of the screen, then scroll.
static func _fit_calls(app, csc: ScrollContainer, cbox: Control) -> void:
	if not is_instance_valid(csc) or not is_instance_valid(cbox): return
	await csc.get_tree().process_frame
	if not is_instance_valid(csc) or not is_instance_valid(cbox): return
	csc.custom_minimum_size.y = minf(cbox.get_combined_minimum_size().y, maxf(140.0, app.vs_h() * 0.30))

static func _is_first(app, id: String) -> bool:
	var ls: Array = app.b.levels()
	return (not ls.is_empty() and str(ls[0].get("id", "")) == id) or (ls.is_empty() and id in ["L00", "L01"])

# ---- tab and watcher ----------------------------------------------------------------------------------------------------------
class Tab extends PanelContainer:
	var app = null
	var btn: Button
	func _init() -> void:
		name = "NotebookTab"; add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		btn = EqTheme.key_button("", false, 15); btn.custom_minimum_size = Vector2(0, 36); btn.action_mode = BaseButton.ACTION_MODE_BUTTON_PRESS; btn.pressed.connect(func(): Notebook.open(app)); add_child(btn)   # opens on the press: a click that drifts or loses focus before the release still counts
		custom_minimum_size = Vector2(380, 36); btn.clip_text = true; btn.alignment = HORIZONTAL_ALIGNMENT_LEFT   # a fixed place and width: the title never moves the button
		btn.add_theme_stylebox_override("normal", Notebook._tab_sb("normal")); btn.add_theme_stylebox_override("hover", Notebook._tab_sb("hover"))
	func _process(_dt: float) -> void:
		var li := Notebook.info(app)
		visible = app != null and app.started and not li.is_empty() and (app.modal() == null)
		position = Vector2.ZERO
		if visible: btn.text = fit_text("%s  %02d · " % [PaperStrings.t("NB_TAB"), int(li.get("index", 0))], str(li.get("title", "")), "  ▸")
	## The tab keeps its fixed width: a long title is shortened with an ellipsis so the arrow at the end is never clipped.
	func fit_text(head: String, title: String, tail: String) -> String:
		var f := btn.get_theme_font("font"); var fs := btn.get_theme_font_size("font_size")
		var room := custom_minimum_size.x - 40.0   # the tab style's side margins and the teal edge
		var t := title; var cut := false
		while t.length() > 1 and f.get_string_size(head + t + ("…" if cut else "") + tail, HORIZONTAL_ALIGNMENT_LEFT, -1, fs).x > room:
			t = t.left(t.length() - 1).strip_edges(); cut = true
		return head + t + ("…" if cut else "") + tail

static func _tab_sb(state: String) -> StyleBoxFlat:
	var s := EqTheme.porcelain_sb(3, 10.0); s.border_width_left = 5; s.border_color = EqTheme.TEAL
	if state == "hover": s.bg_color = s.bg_color.lightened(0.05)
	s.content_margin_top = 4; s.content_margin_bottom = 4
	return s

class Watch extends Node:
	var app = null
	func _process(_dt: float) -> void:
		if app == null or not app.started or app.modal() != null:
			return
		var li := Notebook.info(app)
		if li.is_empty(): return
		var key := str(app.get_instance_id())
		var id := str(li.id) + ":" + str(app.b.g.get("seed", ""))
		if Notebook._seen.get(key, "") == id: return
		Notebook._seen[key] = id
		# once per level start (a fresh campaign, "Next job", a direct launch): a level that presets parts (L03+) has spent money before the player did anything, so the test is "nothing run yet", not "nothing spent"
		var runs = PaperStrings.q(app, "runs")
		if Notebook.qa_hold: Notebook.qa_hold = false; Notebook.close(app); return
		if str(li.get("phase", "design")) == "design" and int(app.b.g.get("tick", 0)) == 0 and not (runs is Array and not (runs as Array).is_empty()) and not bool(Notebook.started.get(str(li.id), false)): Notebook.open(app)

static func attach(app) -> void:
	if app.root.get_node_or_null("NotebookWatch") != null: return
	var w := Watch.new(); w.name = "NotebookWatch"; w.app = app; app.root.add_child(w)
	var slot: Control = null
	if "hud_top_left" in app and app.get("hud_top_left") is Control: slot = app.get("hud_top_left")
	else:
		var f = app.root.find_child("hud_top_left", true, false)
		if f is Control: slot = f
	var tab := Tab.new(); tab.app = app
	if slot != null: slot.add_child(tab)
	else: tab.position = Vector2(14, 12); app.root.add_child(tab)
