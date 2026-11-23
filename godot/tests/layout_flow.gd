extends SceneTree
## F32 (0.9 readability): the layout audit. Every screen (title, Works map, settings, pause menu, notebook, printout, faceplates, the Career board with an incident card)
## and the opening view of every level (all of the engine's levels, CAREER_FIX_NH3_INERTS and L39 among them) at 1920x1080 and 1280x800.
## It fails on:
##   - a visible Label / Button / LineEdit / RichTextLabel whose on-screen font size is under 16 px (font size x canvas scale x window stretch),
##   - a 3D name tag (Label3D) under 16 px on screen (fixed size: font_size x pixel_size x half the window height),
##   - text clipped by its container (a line wider than its rect, a wrapped label cut off vertically),
##   - two visible text controls of one (non-stacking) container overlapping, and any text outside the window,
##   - hand-drawn text (EqTheme.ds: floored, measured, and checked against its width), and any raw draw_string left in the sources.
##   - (0.12 handheld gate) the pad's one-line hint over any other text, the Works map opening scrolled away from its top, the briefing card drawn over the title menu
##     (the title UI must be hidden while the card shows, and no visible text outside the card may sit under it), and a notebook opened by pad with its title scrolled off.
## Run: godot --headless --path godot --script res://tests/layout_flow.gd     Prints LAYOUT-FLOW OK / LAYOUT-FLOW FAILED n.
## CB_VERBOSE=1 prints each screen's counts; CB_LAYOUT_ONLY=L39,career,title limits the screens.
const FLOOR := 16.0
const RESES := [Vector2i(1920, 1080), Vector2i(1280, 800)]
const FIX := "CAREER_FIX_NH3_INERTS"
## Deliberate fine print (node-name fragment -> minimum px). Empty on purpose: every text must clear the floor.
const FINE_PRINT := {}
var fails := 0
var checks := 0
var app: CbApp
var only: PackedStringArray = []
var verbose := OS.get_environment("CB_VERBOSE") != ""
var seen_fail := {}

func frames(n := 3) -> void:
	for i in n: await process_frame

func want(tag: String) -> bool: return only.is_empty() or only.has(tag)

func fail(tag: String, what: String) -> void:
	fails += 1
	var k := tag + what
	if not seen_fail.has(k): seen_fail[k] = true
	print("  FAIL %s: %s" % [tag, what])

# ---- measuring --------------------------------------------------------------------------------------------------------------------------------
func font_px(c: Control) -> float:
	var sz := 16
	if c is Label and (c as Label).label_settings != null: sz = (c as Label).label_settings.font_size
	elif c is RichTextLabel: sz = c.get_theme_font_size("normal_font_size")
	else: sz = c.get_theme_font_size("font_size")
	return float(sz) * c.get_global_transform_with_canvas().get_scale().y * c.get_viewport().get_final_transform().get_scale().y

func text_of(c: Control) -> String:
	if c is Label: return (c as Label).text
	if c is Button: return (c as Button).text
	if c is LineEdit: return (c as LineEdit).text if (c as LineEdit).text != "" else (c as LineEdit).placeholder_text
	if c is RichTextLabel: return (c as RichTextLabel).get_parsed_text()
	return ""

func is_text(c: Node) -> bool: return c is Label or c is Button or c is LineEdit or c is RichTextLabel

func walk(n: Node, out: Array) -> void:
	for ch in n.get_children():
		if ch is CanvasItem and not (ch as CanvasItem).visible: continue
		out.append(ch); walk(ch, out)

func in_scroll(c: Control) -> bool:
	var p := c.get_parent()
	while p != null:
		if p is ScrollContainer: return true
		p = p.get_parent()
	return false

## The control is cut away by an ancestor that clips its contents (a scrolled-off row, a collapsed drawer): it cannot be seen, so it is not audited for position.
func clipped_away(c: Control) -> bool:
	var r := c.get_global_rect()
	var p := c.get_parent()
	while p != null:
		if p is Control and ((p as Control).clip_contents or p is ScrollContainer):
			if not (p as Control).get_global_rect().intersects(r): return true
		p = p.get_parent()
	return false

func allowed_px(c: Control) -> float:
	for k in FINE_PRINT:
		if str(c.get_path()).contains(k): return float(FINE_PRINT[k])
	return FLOOR

const STACKS := ["PanelContainer", "MarginContainer", "ScrollContainer", "CenterContainer", "AspectRatioContainer", "SubViewportContainer", "TabContainer"]
func stacking(p: Node) -> bool:
	for k in STACKS: if p.is_class(k): return true
	return false

func line_w(c: Control, t: String, px: int) -> float:
	var f: Font = c.get_theme_font("font") if not (c is Label and (c as Label).label_settings != null) else (c as Label).label_settings.font
	if f == null: f = ThemeDB.fallback_font
	var w := 0.0
	for ln in t.split("\n"): w = maxf(w, f.get_string_size(ln, HORIZONTAL_ALIGNMENT_LEFT, -1, px).x)
	return w

func audit(tag: String) -> void:
	var all: Array = []; walk(root, all)
	EqTheme.drawn.clear(); EqTheme.audit = true
	for n in all: if n is CanvasItem: (n as CanvasItem).queue_redraw()
	await frames(3)
	EqTheme.audit = false
	all.clear(); walk(root, all)
	var dkeys: Array = EqTheme.drawn.keys()
	for k in dkeys:
		checks += 1
		var e: Array = EqTheme.drawn[k]
		if float(e[0]) < FLOOR - 0.01: fail(tag, "drawn text %.1f px '%s' (%s)" % [float(e[0]), str(e[1]).replace("\n", " "), str(k).get_slice(" | ", 0).right(60)])
		if str(e[1]).contains("…") and (str(k).contains("Recorder") or str(k).contains("InstrumentBay")): fail(tag, "drawn text cut with an ellipsis '%s' (%s)" % [str(e[1]).replace("\n", " "), str(k).get_slice(" | ", 0).right(60)])   # F33: a legend shortened to "AMMON…" is clipped text
		if not bool(e[2]): fail(tag, "drawn text clipped (%.0f > %.0f px) '%s' (%s)" % [float(e[3]), float(e[4]), str(e[1]).replace("\n", " "), str(k).get_slice(" | ", 0).right(60)])
	var vp := Rect2(Vector2.ZERO, Vector2(root.size))
	for i in dkeys.size():
		var a: Array = EqTheme.drawn[dkeys[i]]
		for j in range(i + 1, dkeys.size()):
			var b: Array = EqTheme.drawn[dkeys[j]]
			if str(a[1]) == str(b[1]) or str(dkeys[i]).get_slice(" | ", 0) != str(dkeys[j]).get_slice(" | ", 0): continue   # the same string twice is a shadow or a glow pass; only texts of one canvas item are compared (a dialog over a board is not an overlap)
			var ra: Rect2 = (a[5] as Rect2).grow(-1.0); var rb: Rect2 = (b[5] as Rect2).grow(-1.0)
			var x := ra.intersection(rb)
			checks += 1
			if x.size.x > 3.0 and x.size.y > 4.0 and ra.intersects(vp): fail(tag, "drawn text overlaps '%s' x '%s' (%s)" % [str(a[1]).left(24).replace("\n", " "), str(b[1]).left(24).replace("\n", " "), str(dkeys[i]).get_slice(" | ", 0).right(50)])
	var nodes := 0
	var texts: Array = []
	for n in all:
		if not is_instance_valid(n): continue
		if n is Label3D:
			checks += 1
			var l3 := n as Label3D
			if l3.is_visible_in_tree() and l3.text.strip_edges() != "":
				var px := _px3d(l3)
				if px < FLOOR - 0.01: fail(tag, "Label3D %.1f px '%s' (%s)" % [px, l3.text.left(30), str(l3.get_path()).get_file()])
			continue
		if not (n is Control) or not (n as Control).is_visible_in_tree(): continue
		var c := n as Control
		if not is_text(c): continue
		var t := text_of(c).strip_edges()
		if t == "" or c.modulate.a < 0.05 or c.self_modulate.a < 0.05: continue
		var r := c.get_global_rect()
		if r.size.x < 1.0 or r.size.y < 1.0: continue
		if clipped_away(c) and in_scroll(c): continue
		nodes += 1; checks += 3
		var path := str(c.get_path())
		var px := font_px(c)
		var fl := allowed_px(c)
		if px < fl - 0.01: fail(tag, "text %.1f px '%s' (%s)" % [px, t.left(30).replace("\n", " "), path.right(70)])
		texts.append(c)
		# clipped by its container (F33: a label or key whose text the engine trims with an ellipsis counts as clipped)
		if (t.contains("…") and (path.contains("Recorder") or path.contains("InstrumentBay"))) or ((c is Label) and (c as Label).text_overrun_behavior != TextServer.OVERRUN_NO_TRIMMING and line_w(c, (c as Label).text, (c as Label).label_settings.font_size if (c as Label).label_settings != null else c.get_theme_font_size("font_size")) > r.size.x + 1.5 and (c as Label).autowrap_mode == TextServer.AUTOWRAP_OFF):
			fail(tag, "text cut with an ellipsis '%s' (%s)" % [t.left(30).replace("\n", " "), path.right(70)])
		if c is Label:
			var l := c as Label
			if l.autowrap_mode == TextServer.AUTOWRAP_OFF:
				var w := line_w(c, l.text, l.label_settings.font_size if l.label_settings != null else l.get_theme_font_size("font_size"))
				if w > r.size.x + 1.5: fail(tag, "label wider than its rect (%.0f > %.0f) '%s' (%s)" % [w, r.size.x, t.left(30).replace("\n", " "), path.right(70)])
			elif l.get_line_count() > l.get_visible_line_count() and l.max_lines_visible < 0: fail(tag, "wrapped label cut off (%d of %d lines) '%s' (%s)" % [l.get_visible_line_count(), l.get_line_count(), t.left(30), path.right(70)])
		elif c is Button:
			var b := c as Button
			if not b.icon and b.get_minimum_size().x > r.size.x + 1.5 and b.text != "": fail(tag, "button text wider than the key (min %.0f > %.0f) '%s' (%s)" % [b.get_minimum_size().x, r.size.x, t.left(30), path.right(70)])
		# outside the window
		if not in_scroll(c) and not clipped_away(c) and (r.position.x < vp.position.x - 1.5 or r.position.y < vp.position.y - 1.5 or r.end.x > vp.end.x + 1.5 or r.end.y > vp.end.y + 1.5):
			fail(tag, "text outside the window %s '%s' (%s)" % [str(r), t.left(30), path.right(70)])
	# overlap among text controls of one container
	var by_parent := {}
	for c in texts:
		var p := (c as Control).get_parent()
		if p == null or stacking(p): continue
		if not by_parent.has(p): by_parent[p] = []
		by_parent[p].append(c)
	for p in by_parent:
		var arr: Array = by_parent[p]
		for i in arr.size():
			for j in range(i + 1, arr.size()):
				var a := (arr[i] as Control).get_global_rect(); var b := (arr[j] as Control).get_global_rect()
				var x := a.intersection(b)
				checks += 1
				if x.size.x > 3.0 and x.size.y > 3.0:
					fail(tag, "overlap %s '%s' x '%s' (%s)" % [str(x.size), text_of(arr[i]).left(20).replace("\n", " "), text_of(arr[j]).left(20).replace("\n", " "), str(p.get_path()).right(60)])
	if verbose: print("  %s: %d text controls" % [tag, nodes])

# ---- the screens ----------------------------------------------------------------------------------------------------------------------------------
func set_size(res: Vector2i, kind: String) -> void:
	CbLayout.forced = kind
	root.size = res
	await frames(6)

func close_all() -> void:
	for i in 4:
		if app.modal() != null: app.back(); await frames(2)
	Faceplate.close_all()
	await frames(2)

## The notebook slides in 70 px over 0.22 s of wall time after it is sized, so a fixed frame count samples it mid-slide (headless frames are ~3 ms): wait for the page's own "settled" mark, at most 600 frames.
func nb_settle(tag: String) -> void:
	for i in 600:
		var pn := app.root.get_node_or_null("notebook")
		if pn == null: return   # no notebook open (or it closed): nothing to wait for
		var p := pn.find_child("Page", true, false)
		var panel: Node = p.get_parent() if p != null else null
		if panel != null and bool(panel.get_meta("nb_settled", false)):
			var sb := pn.find_child("Start", true, false) as Control; checks += 1; var gap := app.get_viewport().get_visible_rect().end.y - sb.get_global_rect().end.y
			if gap < 12.0: fail(tag, "'Start work' ends %.1f px above the window bottom once the page has settled (need 12)" % gap)
			return
		await process_frame
	fail(tag, "the notebook did not finish opening in 600 frames")

func level(id: String) -> void:
	app.start_level(id, true); await frames(6)
	if app.lvbay != null: app.lvbay.refresh(true)
	await frames(4)
	await nb_settle("level " + id)   # a level can open with its briefing notebook, which slides in

func scale_note(res: Vector2i) -> void:
	if not verbose: return
	var c := Label.new(); root.add_child(c); await frames(2)
	print("  scale at %s: canvas %.3f x final %.3f (content %.3f, kind %s)" % [str(res), c.get_global_transform_with_canvas().get_scale().y, c.get_viewport().get_final_transform().get_scale().y, root.content_scale_factor, CbLayout.kind])
	c.queue_free()

func career_screens(tag: String) -> void:
	OS.set_environment("CB_NEW", "1")
	app.pinned_seed = 11
	app.start_level("CAREER", true); await frames(5)
	OS.unset_environment("CB_NEW")
	Notebook.close(app); await frames(3)
	if app.lvbay != null: app.lvbay.refresh(true)
	await frames(4)
	await audit(tag + " Career board")
	for i in 8:
		var v = app.b.q("levelView")
		var ic = v.get("dashboard", {}).get("incident", null) if v is Dictionary else null
		if ic is Dictionary and bool((ic as Dictionary).get("pending", false)): break
		app.b.act("levelAct", ["answer", 1]) if i == 0 else app.b.act("levelAct", ["advance", 1])
		app.game_on_changed()
	if app.lvbay != null: app.lvbay.refresh(true)
	await frames(5)
	await audit(tag + " Career incident card")

func run_screens(res: Vector2i, kind: String) -> void:
	var at := "@%dx%d" % [res.x, res.y]
	await set_size(res, kind)
	await scale_note(res)
	if want("title"): app.to_title(); await frames(5); await audit("title " + at)
	if want("settings"): app.to_title(); await frames(3); app.open_settings(); await frames(5); await audit("settings " + at); await close_all()
	var ids: Array = []
	for lv in app.b.levels(): ids.append(str(lv.id))
	if not ids.has(FIX): ids.append(FIX)
	if want("map"): await level("L01"); await frames(3); await close_all(); WorksMap.open(app); await frames(6); await audit("Works map " + at); await close_all()
	if want("menu"): await level("L07"); await frames(2); await close_all(); app.menus.menu(); await frames(5); await audit("pause menu " + at); await close_all()
	if want("notebook"):
		for id in ["L01", "L39", FIX]:
			await level(id); await frames(3); await close_all(); Notebook.open(app); await frames(6); await nb_settle("notebook " + id + " " + at); await audit("notebook %s %s" % [id, at]); await close_all()
	if want("printout"):
		for won in [true, false]:
			await level("L07"); await frames(3); await close_all()
			Notebook.stub = Notebook.stub_info(); Printout.stub = Notebook.result_stub(won); Printout.open(app); await frames(6)
			await audit("printout %s %s" % ["won" if won else "lost", at]); await close_all()
		Printout.stub = {}; Notebook.stub = {}
	if want("faceplates"):
		for id in ["L07", FIX, "L39"]:
			await level(id); await frames(3); await close_all()
			var us: Array = []
			var pl = app.b.q("plant")
			if pl is Dictionary: us = pl.get("units", [])
			var n := 0
			for u in us:
				if n >= 6: break
				n += 1
				Faceplate.close_all(); Faceplate.open(app, str(u.id)); await frames(4)
				await audit("faceplate %s %s %s" % [id, str(u.id), at])
			Faceplate.close_all(); await frames(2)
	if want("collisions"): await collisions(at)
	if want("career"): await career_screens("@%dx%d" % [res.x, res.y]); await close_all()
	for id in ids:
		if not want(id) and not want("levels"): continue
		await level(id)
		await audit("%s opening view %s" % [id, at])
		if app.modal() != null: await close_all(); await audit("%s plant view %s" % [id, at])

# ---- collisions (the release gate's pad hand play, 1280x800 handheld) -----------------------------------------------------------------------------
func visible_texts(skip: Node = null) -> Array:
	var all: Array = []; walk(root, all)
	var out: Array = []
	for n in all:
		if not (n is Control) or not is_text(n) or n == skip or not (n as Control).is_visible_in_tree(): continue
		var c := n as Control
		if text_of(c).strip_edges() == "" or c.modulate.a < 0.05 or c.get_global_rect().size.x < 1.0: continue
		if clipped_away(c) and in_scroll(c): continue
		out.append(c)
	return out

func collisions(at: String) -> void:
	# 1. the pad hint ("A select  B back ...") never sits on another text
	await level("L01"); await frames(3); await close_all()
	app.pad.set_active(true); await frames(6)
	var h: Label = app.pad.hint
	checks += 1
	if not h.visible: fail("pad hint " + at, "the hint is not shown in pad mode on the drafting table")
	else:
		var hr := h.get_global_rect().grow(-1.0)
		for c in visible_texts(h):
			checks += 1
			var x := hr.intersection((c as Control).get_global_rect().grow(-1.0))
			if x.size.x > 3.0 and x.size.y > 3.0: fail("pad hint " + at, "the pad hint overlaps '%s' (%s)" % [text_of(c).left(30).replace("\n", " "), str(c.get_path()).right(60)])
	# 2. the notebook, opened with the pad in hand, shows its title whole at the top of its page
	Notebook.open(app); await frames(14)
	var nb = app.modal()
	var psc = nb.find_child("PageScroll", true, false) if nb != null else null
	checks += 1
	if psc == null: fail("notebook pad " + at, "no notebook page")
	else:
		var tl: Control = nb.find_child("Title", true, false)
		if (psc as ScrollContainer).scroll_vertical != 0: fail("notebook pad " + at, "the page opened scrolled by %d px (title cut)" % (psc as ScrollContainer).scroll_vertical)
		if tl != null and tl.get_global_rect().position.y < (psc as ScrollContainer).get_global_rect().position.y - 1.0: fail("notebook pad " + at, "the title starts above the page (%s < %s)" % [str(tl.get_global_rect().position.y), str((psc as ScrollContainer).get_global_rect().position.y)])
	await close_all()
	app.pad.set_active(false)
	# 3. the Works map opens at its top, and a job's briefing card hides the title menu instead of lying over it
	app.to_title(); await frames(8)
	checks += 1
	if not LabHome.is_up(): fail("home " + at, "the lab home is not up on the title: the card-over-menu audit has nothing to look at")
	WorksMap.open(app); await frames(40)
	var lv = app.root.get_node_or_null("levels")
	var list = lv.find_child("List", true, false) if lv != null else null
	checks += 1
	if list == null: fail("Works map " + at, "no map list")
	elif (list as ScrollContainer).scroll_vertical != 0:
		var sel: Control = lv.find_child("Level_" + WorksMap.sel_id, true, false) if WorksMap.sel_id != "" else null
		var ok := false   # or: the picked job's whole chapter row in view
		if sel != null:
			var lr := (list as ScrollContainer).get_global_rect(); var sr := sel.get_global_rect()
			ok = lr.encloses(sr)
		if not ok: fail("Works map " + at, "the map opened scrolled by %d px with the picked job out of view" % (list as ScrollContainer).scroll_vertical)
	if lv != null:
		WorksMap.start(app, lv, "L01"); await frames(12)
		var card = app.root.get_node_or_null("homecard")
		checks += 1
		if card == null: fail("brief card " + at, "no briefing card")
		else:
			var tu = LabHome.title_ui(app)
			checks += 1
			if tu != null and tu.is_visible_in_tree(): fail("brief card " + at, "the title menu is still visible under the briefing card")
			var panel := (card.find_child("CardStart", true, false) as Control)
			var cr := Rect2()
			var pn: Node = panel
			while pn != null and pn != card:
				if pn is PanelContainer: cr = (pn as Control).get_global_rect()
				pn = pn.get_parent()
			for c in visible_texts():
				if card.is_ancestor_of(c): continue
				checks += 1
				var x := cr.intersection((c as Control).get_global_rect())
				if x.size.x > 3.0 and x.size.y > 3.0: fail("brief card " + at, "'%s' (%s) shows through the briefing card" % [text_of(c).left(30).replace("\n", " "), str(c.get_path()).right(60)])
	await close_all()
	app.to_title(); await frames(4)

## Hand-drawn text goes through EqTheme.ds (floored at 16 px, measured above): no raw draw_string may be left in the game's sources.
func source_scan() -> void:
	for d in ["res://ui", "res://world", "res://world/parts", "res://screens", "res://"]:
		var da := DirAccess.open(d)
		if da == null: continue
		for f in da.get_files():
			if not f.ends_with(".gd") or f == "eq_theme.gd": continue
			var ln := 0
			for line in FileAccess.get_file_as_string(d.path_join(f)).split("\n"):
				ln += 1
				var t := line.strip_edges()
				if t.begins_with("#") or t.begins_with("##"): continue
				checks += 1
				if line.contains(".draw_string(") or line.contains("\tdraw_string(") or line.contains(" draw_string("): fail("source", "%s/%s:%d a raw draw_string (use EqTheme.ds)" % [d, f, ln])

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	if OS.get_environment("CB_LAYOUT_ONLY") != "": only = OS.get_environment("CB_LAYOUT_ONLY").split(",")
	var backup := ""
	if FileAccess.file_exists(CareerSave.engine_file()): backup = FileAccess.get_file_as_string(CareerSave.engine_file())
	CareerSave.force = true; CareerSave.path = "user://eq_career_resume_f32_test.json"; CareerSave.clear()
	CareerIncident.path = "user://eq_career_incident_f32_test.json"; CareerIncident.clear()
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(10)
	CbSettings.persist = false
	app.quiet = true
	for rk in [[RESES[0], "desktop"], [RESES[1], "handheld"]]: await run_screens(rk[0], rk[1])
	if only.is_empty(): source_scan()
	if backup != "":
		var f := FileAccess.open(CareerSave.engine_file(), FileAccess.WRITE); f.store_string(backup); f.close()
	CareerSave.clear(); CareerIncident.clear(); CareerSave.force = false
	CbLayout.forced = ""
	print("LAYOUT-FLOW checks=%d failures=%d" % [checks, fails])
	print("LAYOUT-FLOW OK" if fails == 0 else "LAYOUT-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## 0.12: a fixed-size Label3D's height on screen. Godot draws it at font_size x pixel_size x H / (2 tan(fov / 2)) under a perspective camera; Tag3D.screen_px assumes a 90°
## camera (half the window height), which under-reads the look2 cameras (48-50°) by about 2.2x. Orthographic and non-fixed labels keep the old measure.
func _px3d(l3: Label3D) -> float:
	var cam := l3.get_viewport().get_camera_3d() if l3.get_viewport() != null else null
	if l3.fixed_size and cam != null and cam.projection == Camera3D.PROJECTION_PERSPECTIVE:
		return float(l3.font_size) * l3.pixel_size * Tag3D.window_h(root) / (2.0 * tan(deg_to_rad(cam.fov) * 0.5))
	return Tag3D.screen_px(l3, root)
