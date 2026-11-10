class_name Notebook
extends RefCounted
## The lab notebook (UI.md section 7): a squared porcelain page that slides up over the dimmed world. Level title, the setter's note signed in pen, goals on
## ruled lines with tick boxes, the budget, three flask stars, the Call-it answer line (keypad -> `callIt`), the Learner/Engineer chip on the first job and
## the teal "Start work" key. Everything comes from the `levelInfo` query. It folds into a tab at the top left.
static var stub := {}          # a levelInfo-shaped dict for galleries/tests; used when the engine has none
static var started := {}       # level id -> the job has been worked on (commissioned, or restarted with the build kept): the key says Back to work
static var _seen := {}         # app instance id -> last level id the watcher opened for

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
	func _init() -> void: custom_minimum_size = Vector2(190, 38); mouse_default_cursor_shape = Control.CURSOR_IBEAM; focus_mode = Control.FOCUS_ALL
	func _gui_input(e: InputEvent) -> void:
		if (e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT) or e.is_action_pressed("ui_accept"): tapped.emit(); accept_event()
	func _draw() -> void:
		draw_line(Vector2(0, size.y - 4), Vector2(size.x, size.y - 4), EqTheme.INK, 2.0)
		var f := EqTheme.font("mono_bold"); var fs := EqTheme.fs(22)
		if text == "": draw_string(EqTheme.font("sans"), Vector2(4, size.y - 12), PaperStrings.t("NB_TAP"), HORIZONTAL_ALIGNMENT_LEFT, size.x - 8, EqTheme.fs(15), EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.55))
		else: draw_string(f, Vector2(4, size.y - 10), text, HORIZONTAL_ALIGNMENT_LEFT, size.x - 8, fs, EqTheme.RED if refused else EqTheme.PEN_BLUE)
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
		"histogram": {"metric": "cost", "bins": [2, 5, 9, 14, 8, 3, 1], "edges": [60000, 70000, 80000, 90000, 100000, 110000, 120000, 130000], "you": 84200.0} if won else null,
		"callIt": {"prompt": "H2 for 140 kg/h N2", "unit": "kg/h", "value": 30.0, "answer": 30.24, "ok": true}, "lesson": "Moles react in 1 : 3. By mass that is 1 : 6 H2 to N2, not 1 : 3.", "designCode": "EQ1-L01-7K2F9Q"}

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
	vb.reparent(mg); pn.add_child(mg)
	_fill(app, host, vb, li)
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
	pn.reset_size(); app.center(pn, w, 0.0)
	await pn.get_tree().process_frame
	if not is_instance_valid(pn): return
	var y := pn.position.y; pn.position.y = y + 70.0
	pn.create_tween().tween_property(pn, "position:y", y, 0.22).set_trans(Tween.TRANS_QUAD).set_ease(Tween.EASE_OUT)

static func close(app) -> void:
	var h = app.root.get_node_or_null("notebook")
	if h != null: h.queue_free()

static func _rebuild(app, host: Control, vb: VBoxContainer) -> void:
	for c in vb.get_children(): c.queue_free()
	_fill(app, host, vb, info(app))

static func _fill(app, host: Control, vb: VBoxContainer, li: Dictionary) -> void:
	vb.add_theme_constant_override("separation", 10); vb.custom_minimum_size.x = minf(660.0, app.get_viewport().get_visible_rect().size.x - 140.0)   # wrapped labels need a width to size against
	var idx := int(li.get("index", 0))
	var title := EqTheme.label("%02d · %s" % [idx, str(li.title)], 32, EqTheme.INK, "title"); title.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; title.name = "Title"; vb.add_child(title)
	if str(li.get("place", "")) != "": vb.add_child(EqTheme.label(str(li.place), 15, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.4), "semi"))
	# the setter's note, handwritten-feel: pen blue, a degree off true, signed
	var note := VBoxContainer.new(); note.name = "Note"; note.add_theme_constant_override("separation", 2); vb.add_child(note)
	for ln in li.get("note", []):
		var l := EqTheme.label(str(ln), 19, EqTheme.PEN_BLUE, "sans"); l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.size_flags_horizontal = Control.SIZE_EXPAND_FILL; note.add_child(l)
	var sg := EqTheme.label("— " + str(li.get("setter", "")), 19, EqTheme.PEN_BLUE, "semi"); sg.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT; note.add_child(sg)
	note.rotation_degrees = -0.4
	# goals
	vb.add_child(EqTheme.dymo(PaperStrings.t("NB_GOALS"), 13))
	var gv := VBoxContainer.new(); gv.name = "Goals"; gv.add_theme_constant_override("separation", 0); vb.add_child(gv)
	for g in li.get("goals", []):
		var row := HBoxContainer.new(); row.add_theme_constant_override("separation", 10); row.name = "Goal_" + str(g.key)
		var tb := TickBox.new(); tb.met = bool(g.met); row.add_child(tb)
		var gl := EqTheme.label(str(g.text), 18, EqTheme.INK, "sans"); gl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; gl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; row.add_child(gl)
		if g.get("readout") != null and str(g.readout) != "":
			row.add_child(EqTheme.label(str(g.readout), 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.25), "mono"))
		elif bool(g.get("pending", false)) and not bool(g.met):
			row.add_child(EqTheme.label(PaperStrings.t("NB_PENDING"), 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.4), "mono"))
		elif g.has("value") and g.get("value") != null:
			var vt := PaperStrings.t("NB_NOW") % PaperStrings.num(float(g.value)) + ((" · " + PaperStrings.t("NB_TARGET") % PaperStrings.num(float(g.target))) if g.get("target") != null else "")   # "now 16.67 · target 10.25", never two bare numbers
			row.add_child(EqTheme.label(vt, 16, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.25), "mono"))
		gv.add_child(row)
		var rule := ColorRect.new(); rule.color = Color(EqTheme.INK, 0.28); rule.custom_minimum_size = Vector2(0, 1); gv.add_child(rule)
	# budget
	var bud := HBoxContainer.new(); bud.add_theme_constant_override("separation", 12); vb.add_child(bud)
	bud.add_child(EqTheme.dymo(PaperStrings.t("NB_BUDGET"), 13))
	var btxt := "$%s   %s $%s" % [CbKit.num(float(li.get("budgetUSD", 0)), 0), PaperStrings.t("NB_SPENT"), CbKit.num(float(li.get("spentUSD", 0)), 0)]
	var bl := EqTheme.label(btxt, 18, EqTheme.INK, "mono_bold"); bl.name = "Budget"; bud.add_child(bl)
	# flasks
	var st: Dictionary = li.get("stars", {"have": 0, "rules": []})
	var fv := HBoxContainer.new(); fv.name = "Stars"; fv.add_theme_constant_override("separation", 18); vb.add_child(fv)
	var fl := VBoxContainer.new(); fl.add_child(EqTheme.dymo(PaperStrings.t("NB_STARS"), 13)); fv.add_child(fl)
	for i in range(3):
		var cell := HBoxContainer.new(); cell.add_theme_constant_override("separation", 6); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var earned: Array = st.get("earned", []) if st.get("earned") is Array else []
		var f := Flask.new(); f.name = "Flask_%d" % i; f.filled = bool(earned[i]) if i < earned.size() else i < int(st.get("have", 0)); cell.add_child(f)   # each flask is its own star (the second can be lit without the first being "the count")
		if i == 2 and ((li.get("callIt") is Dictionary and bool(li.callIt.get("answered", false))) or (li.get("callIts") is Array and not (li.callIts as Array).is_empty() and bool((li.callIts[0] as Dictionary).get("answered", false)))): f.armed = true
		var rl := EqTheme.label(str((st.get("rules", []) as Array)[i]) if i < (st.get("rules", []) as Array).size() else "", 14, EqTheme.INK, "sans")
		rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; rl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; rl.custom_minimum_size = Vector2(120, 0); cell.add_child(rl); fv.add_child(cell)
	# call it: one row per prediction (levelInfo.callIts when the level has several, else the single callIt)
	var cis: Array = []
	if li.get("callIts") is Array and not (li.callIts as Array).is_empty(): cis = li.callIts
	elif li.get("callIt") is Dictionary: cis = [li.callIt]
	for ci in cis:
		if not (ci is Dictionary): continue
		var ckey := str(ci.get("key", ""))
		var cr := HBoxContainer.new(); cr.name = "CallIt" if cis.size() == 1 else "CallIt_" + ckey; cr.add_theme_constant_override("separation", 10); vb.add_child(cr)
		cr.add_child(EqTheme.dymo(PaperStrings.t("NB_CALLIT"), 13))
		var pl := EqTheme.label(str(ci.prompt) + ":", 18, EqTheme.INK, "sans"); pl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; pl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cr.add_child(pl)
		var an := Answer.new(); an.name = "Answer"; an.unit = str(ci.unit)
		var answered := bool(ci.get("answered", false)) and ci.get("value") != null
		if answered: an.text = PaperStrings.num(float(ci.value))
		cr.add_child(an)
		cr.add_child(EqTheme.label(str(ci.unit), 18, EqTheme.INK, "mono"))
		var cnote := EqTheme.label("", 15, EqTheme.RED, "semi"); cnote.name = "CallNote"; cnote.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cnote.size_flags_horizontal = Control.SIZE_EXPAND_FILL; cnote.visible = false
		if answered:   # the locked answer is written under the line, and stays there when the notebook is reopened
			cnote.text = PaperStrings.t("NB_PREDICTED") % [PaperStrings.num(float(ci.value)), str(ci.unit)] + ("  ✓" if ci.get("ok") == true else ("  ✗" if ci.get("ok") == false else "")) + ((" · actual %s %s" % [PaperStrings.num(float(ci.truth)), str(ci.unit)]) if ci.get("truth") != null else "")
			cnote.add_theme_color_override("font_color", EqTheme.PEN_GREEN if ci.get("ok") == true else EqTheme.INK); cnote.label_settings = EqStrings.ls(15, EqTheme.PEN_GREEN if ci.get("ok") == true else EqTheme.INK, "semi"); cnote.visible = true
		var cwrap := VBoxContainer.new(); cwrap.add_theme_constant_override("separation", 2); var pi := cr.get_index(); vb.remove_child(cr); cwrap.add_child(cr); cwrap.add_child(cnote); vb.add_child(cwrap); vb.move_child(cwrap, pi)
		an.tapped.connect(func(): Knob.keypad(app, str(ci.prompt), str(ci.unit), an.text, 0.0, 1e9, func(v: float) -> void:
			var r: Dictionary = app.b.act("callIt", [v] if ckey == "" else [v, ckey])
			if not bool(r.get("ok", false)):   # the engine's refusal is shown on the page itself, and the typed value stays on the line
				an.text = PaperStrings.num(v); an.refused = true; an.queue_redraw()
				cnote.text = PaperStrings.t("NB_REFUSED") % str(r.get("message", "")); cnote.add_theme_color_override("font_color", EqTheme.RED); cnote.label_settings = EqStrings.ls(15, EqTheme.RED, "semi"); cnote.visible = true
			else: _rebuild(app, host, vb)))
	# mode chip (first job only), then the key
	var foot := HBoxContainer.new(); foot.add_theme_constant_override("separation", 10); vb.add_child(foot)
	if _is_first(app, str(li.get("id", ""))):
		foot.add_child(EqTheme.dymo(PaperStrings.t("NB_MODE"), 13))
		for m in ["learner", "engineer"]:
			var on: bool = str(li.get("mode", "learner")) == m
			var b := EqTheme.key_button(PaperStrings.t("NB_" + m.to_upper()), on, 15); b.name = "Mode_" + m; b.custom_minimum_size = Vector2(0, 36)
			b.pressed.connect(func(): app.b.act("setMode", [m]); _rebuild(app, host, vb)); foot.add_child(b)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; foot.add_child(sp)
	var go := EqTheme.key_button(PaperStrings.t("NB_RESUME") if (bool(started.get(str(li.get("id", "")), false)) or str(li.get("phase", "design")) != "design" or int(app.b.g.get("tick", 0)) > 0 or (PaperStrings.q(app, "runs") is Array and not (PaperStrings.q(app, "runs") as Array).is_empty())) else PaperStrings.t("NB_START"), true, 20); go.name = "Start"; go.custom_minimum_size = Vector2(190, 50)
	go.pressed.connect(func(): host.queue_free()); foot.add_child(go)

static func _is_first(app, id: String) -> bool:
	var ls: Array = app.b.levels()
	return (not ls.is_empty() and str(ls[0].get("id", "")) == id) or (ls.is_empty() and id in ["L00", "L01"])

# ---- tab and watcher ----------------------------------------------------------------------------------------------------------
class Tab extends PanelContainer:
	var app = null
	var btn: Button
	func _init() -> void:
		name = "NotebookTab"; add_theme_stylebox_override("panel", StyleBoxEmpty.new())
		btn = EqTheme.key_button("", false, 15); btn.custom_minimum_size = Vector2(0, 36); btn.pressed.connect(func(): Notebook.open(app)); add_child(btn)
		btn.add_theme_stylebox_override("normal", Notebook._tab_sb("normal")); btn.add_theme_stylebox_override("hover", Notebook._tab_sb("hover"))
	func _process(_dt: float) -> void:
		var li := Notebook.info(app)
		visible = app != null and app.started and not li.is_empty() and (app.modal() == null)
		if visible: btn.text = "%s  %02d · %s  ▸" % [PaperStrings.t("NB_TAB"), int(li.get("index", 0)), str(li.get("title", ""))]

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
		if str(li.get("phase", "design")) == "design" and float(li.get("spentUSD", 0)) == 0.0: Notebook.open(app)

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
