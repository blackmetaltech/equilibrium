extends SceneTree
## Lane 0.5b: the build checklist. A player who has only the notebook wins L23 Spirits, L25 and L26 by CLICKING: the checklist row arms a part (its rack tile pulses, the
## suggested spot glows), a click on that spot places it, a pipe row pulses the two ports and two clicks on them pipe it, a setting row opens the unit's plate and the keypad
## takes the number. No engine call builds anything here; the engine is only asked what happened.
## Run: godot --headless --path godot --script res://tests/build_guide_flow.gd   (CB_BG_SHOTS=<dir> to write screenshots: needs --rendering-driver opengl3 and a display)
var fails := 0
var checks := 0
var auto_armed := 0   ## F14: part rows found already in hand after the previous part row was placed
var app: CbApp
var shots := OS.get_environment("CB_BG_SHOTS")
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
var emit: Array = []   ## CB_BG_EMIT=<file>: the clicks and keys as desk.sh commands, for replaying a run with xdotool
func click_at(p: Vector2, gap := 2) -> void:
	emit.append("click %d %d" % [int(p.x), int(p.y)])
	var m := InputEventMouseMotion.new(); m.position = p; m.global_position = p; Input.parse_input_event(m); await frames(1)
	var e := InputEventMouseButton.new(); e.button_index = MOUSE_BUTTON_LEFT; e.position = p; e.global_position = p; e.pressed = true; e.button_mask = MOUSE_BUTTON_MASK_LEFT; Input.parse_input_event(e)
	await frames(1)
	var r := InputEventMouseButton.new(); r.button_index = MOUSE_BUTTON_LEFT; r.position = p; r.global_position = p; r.pressed = false; Input.parse_input_event(r)
	await frames(gap)
func key(code: int, uni := 0) -> void:
	var e := InputEventKey.new(); e.keycode = code; e.physical_keycode = code; e.unicode = uni; e.pressed = true; Input.parse_input_event(e); await frames(1)
	var r := InputEventKey.new(); r.keycode = code; r.physical_keycode = code; r.pressed = false; Input.parse_input_event(r); await frames(1)
func type_number(s: String) -> void:
	emit.append("type %s" % s); emit.append("key Return")
	for ch in s:
		if ch == ".": await key(KEY_PERIOD, 46)
		else: await key(KEY_0 + int(ch), 48 + int(ch))
	await key(KEY_ENTER); await frames(2)
func snap(tag: String) -> void:
	if shots == "": return
	await frames(4)
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [shots, tag])
func tile_px(w, t: Vector2i) -> Vector2: return w.cam.unproject_position(w.tile_to_world(t, Vector2i(1, 1)))
func q(name: String) -> Variant: return app.b.q(name)
func li() -> Dictionary: return q("levelInfo")
func panel() -> BuildChecklist: return BuildChecklist.panel(app)
func line(id: String) -> Dictionary:
	for l in li().get("buildGuide", []): if str(l.id) == id: return l
	return {}
func done(id: String) -> bool: return bool(line(id).get("done", false))

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1920, 1080); await frames(4)
	var only := OS.get_environment("CB_BG_ONLY")
	for id in ["L23", "L25", "L26"]:
		if only == "" or only == id: await play(id)
	var ef := OS.get_environment("CB_BG_EMIT")
	if ef != "": var fh := FileAccess.open(ef, FileAccess.WRITE); fh.store_string("\n".join(emit)); fh.close()
	check(auto_armed >= 5, "after a part is placed, the next part row is already in hand (%d times)" % auto_armed)
	print("BUILD-GUIDE-FLOW checks=%d" % checks)
	print("BUILD-GUIDE-FLOW OK" if fails == 0 else "BUILD-GUIDE-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

# ---- one level ------------------------------------------------------------------------------------------------------------------
func play(id: String) -> void:
	print("== ", id)
	app.start_level(id, true); await frames(8)
	var w = app.world
	var steps: Array = li().get("buildGuide", [])
	check(steps.size() >= 8, "%s: the notebook carries a build checklist (%d lines)" % [id, steps.size()])
	# the notebook page shows the same lines, ticked from the engine; a click on a row puts the page away and points at it
	check(app.root.get_node_or_null("notebook") != null, "%s: the notebook opens on its own" % id)
	var nb: Node = app.root.get_node_or_null("notebook")
	var bv: Node = nb.find_child("BuildGuide", true, false) if nb != null else null
	check(bv != null and bv.get_child_count() == steps.size(), "%s: the notebook lists every line of the build order" % id)
	await snap(id + "_notebook")
	await call_it(id)
	Notebook.close(app); await frames(3)   # (call_it already clicked "Start work"; this is the fall-back when there is no Call it box)
	var p := panel()
	check(p != null and p.visible, "%s: the checklist panel is on screen under the notebook tab" % id)
	var total := steps.size()
	# 1. nothing is piped yet: once the first pipe has both its ends, those ports pulse without a click (first pipe obvious)
	var guided_first_pipe := false
	for l in steps:
		match str(l.kind):
			"place": await do_place(id, l)
			"pipe":
				if not guided_first_pipe:
					# the guide (no click on a row yet) points at the next line; before the first click on a pipe row it is this pipe's ports
					guided_first_pipe = true
					check(str(panel().target().get("id", "")) == str(l.id), "%s: the next line is the first pipe (%s)" % [id, str(l.id)])
					check(w.guiding().size() == 2, "%s: the first suggested OUT and IN ports pulse with no click (%s)" % [id, str(w.guiding())])
					await snap(id + "_first_pipe")
				await do_pipe(id, l)
			"set": await do_set(id, l)
	var left: Array = []
	for l in li().get("buildGuide", []): if not bool(l.done): left.append(str(l.id))
	check(left.is_empty(), "%s: every line of the checklist is ticked (open: %s)" % [id, str(left)])
	await snap(id + "_built")
	# commission with the key (Space) and let the plant run its first run
	var ks: Control = app.chrome.keys
	await click_at(ks.get_global_rect().get_center(), 4)
	if str(q("levelInfo").phase) == "design": await key(KEY_SPACE); await frames(4)
	var g: Dictionary = app.b.g
	check(str(q("levelInfo").phase) != "design", "%s: the key commissioned the plant (phase %s)" % [id, str(q("levelInfo").phase)])
	for i in 40:
		if str(app.b.g.get("status", "")) == "won": break
		app.b.act("tick", [10]); await frames(2)
	var st := str(app.b.g.get("status", ""))
	check(st == "won", "%s: won through the UI (status %s)" % [id, st])
	await frames(10)
	await snap(id + "_win")
	var rc: Variant = q("resultCard")
	if rc is Dictionary: print("%s result: %s  stars %s  verdict: %s" % [id, "WON" if bool(rc.won) else "not won", str(rc.stars.have), str(rc.verdictText)])

func call_it(id: String) -> void:
	var ans: Control = null
	var nb: Node = app.root.get_node_or_null("notebook")
	if nb == null: return
	ans = nb.find_child("Answer", true, false)
	if ans == null: return
	var v := {"L23": "94.8", "L25": "1.97", "L26": "860"}[id] as String
	await click_at(ans.get_global_rect().get_center(), 3)
	check(app.modal() != null and app.modal().name == "keypad", "%s: tapping the Call it line opens the keypad" % id)
	await type_number(v)
	check(bool(li().callIt.answered), "%s: the Call it answer is locked in from the notebook" % id)
	var go: Control = nb.find_child("Start", true, false)
	if go != null: await click_at(go.get_global_rect().get_center(), 3)

# ---- steps ----------------------------------------------------------------------------------------------------------------------
func row_of(sid: String) -> Control:
	var p := panel()
	var r: Control = p._list.get_node_or_null("Step_" + sid) if p != null else null
	if r != null: p._scroll.ensure_control_visible(r)
	return r
func click_row(sid: String) -> void:
	var r := row_of(sid); await frames(2)
	check(r != null and r.is_visible_in_tree(), "row %s is on screen" % sid)
	if r != null: await click_at(r.get_global_rect().get_center(), 3)

func do_place(id: String, l: Dictionary) -> void:
	var w = app.world; var sid := str(l.id); var ty := str(l.type)
	# the guide itself points at this part before any click
	check(str(panel().target().get("id", "")) == sid, "%s: the guide points at %s (target %s)" % [id, sid, str(panel().target().get("id", ""))])
	var rack: Node = app.root.find_child("PartsRack", true, false)
	var tile_on := false
	for t in rack.tiles: if t.type == ty and t.guide: tile_on = true
	check(tile_on, "%s: the %s tile in the parts rack pulses for %s" % [id, ty, sid])
	check(w.suggested().x >= 0, "%s: the suggested spot of %s glows on the plot" % [id, sid])
	if w.placing == ty: auto_armed += 1
	await click_row(sid)
	check(w.placing == ty, "%s: clicking %s arms the %s (placing '%s')" % [id, sid, ty, w.placing])
	var at: Vector2i = w.suggested()
	var n0: int = (q("plant") as Dictionary).units.size()
	await click_at(tile_px(w, w.suggest_click_tile()), 3)
	var n1: int = (q("plant") as Dictionary).units.size()
	check(n1 == n0 + 1 and done(sid), "%s: a click on the glowing spot places %s (%d -> %d units, done %s)" % [id, sid, n0, n1, str(done(sid))])
	if not done(sid):   # the player would try another spot: the nearest free anchor
		var va: Array = w.valid_anchors(ty, 0)
		if w.placing == "" : await click_row(sid)
		if not va.is_empty() and w.placing == ty:
			await click_at(tile_px(w, va[0] + w.footprint_of(ty) / 2), 3)
	await frames(2)

func do_pipe(id: String, l: Dictionary) -> void:
	var w = app.world; var sid := str(l.id)
	await click_row(sid)
	var cur := line(sid)
	var a: Dictionary = cur.from; var b: Dictionary = cur.to
	check(a.unit != null and b.unit != null, "%s: both ends of %s exist" % [id, sid])
	check(w.guiding().size() == 2, "%s: clicking %s pulses its two ports (%s)" % [id, sid, str(w.guiding())])
	var pa: Vector2 = w.port_screen(str(a.unit), str(a.port), false); var pb: Vector2 = w.port_screen(str(b.unit), str(b.port), true)
	if OS.get_environment("CB_BG_DBG") == sid:
		var hb = app.root.get_node("PaperHub")
		print("  dbg BEFORE pa: hub from ", hb.from_unit, ".", hb.from_port, " chained ", hb.chained, " pa ", pa, " pick ", str(w._pick_port(pa)), " marks ", str(w._marks.map(func(m): return str(m.unit) + "." + str(m.port) + (" hot" if m.get("hot", false) else ""))))
	await click_at(pa, 3)
	if OS.get_environment("CB_BG_DBG") == sid:
		var hb2 = app.root.get_node("PaperHub")
		print("  dbg AFTER pa: hub from ", hb2.from_unit, ".", hb2.from_port, " chained ", hb2.chained)
		pb = w.port_screen(str(b.unit), str(b.port), true)
		print("  dbg ghost=", w.pipe_ghost_active(), " pb=", pb, " marks=", w._marks.size(), " nodes=", w._mark_nodes.size(), " pick=", str(w._pick_port(pb)))
		for i in w._mark_nodes.size():
			var d: float = w.cam.unproject_position((w._mark_nodes[i] as Node3D).global_position).distance_to(pb)
			if d < 60.0: print("    near ", d, " ", str(w._marks[i].unit), ".", str(w._marks[i].port))
	await click_at(pb, 3)
	if not done(sid):   # a mis-click leaves a half pipe in hand: Esc, then again once
		await key(KEY_ESCAPE); await frames(2)
		var ps: Array = (q("plant") as Dictionary).get("pipes", (q("plant") as Dictionary).get("streams", []))
		var mine := ps.filter(func(x): return str(x.from.unit) in [str(a.unit), str(b.unit)] or str(x.to.unit) in [str(a.unit), str(b.unit)])
		print("  retry pipe ", sid, " ", pa, pb, " ", str(mine))
		await click_at(pa, 3); await click_at(pb, 3)
	check(done(sid), "%s: two clicks on the pulsing ports pipe %s" % [id, sid])

func open_plate(uid: String) -> Faceplate:
	var w = app.world
	Faceplate.close_all(); await frames(2)
	var top: Vector3 = w.anchor_world(uid)
	await click_at(w.world_to_screen(Vector3(top.x, top.y * 0.5, top.z)), 3)   # the middle of the model, not its top
	var fp: Faceplate = Faceplate.plates.get(uid)
	return fp

func set_knob(fp: Faceplate, key_: String, value: String) -> void:
	var kn: Knob = fp.knobs.get(key_)
	check(kn != null, "%s has a %s knob" % [fp.unit_id, key_])
	if kn == null: return
	await click_at(kn.get_global_rect().position + kn._num_rect().get_center(), 3)
	if app.modal() == null or app.modal().name != "keypad": check(false, "%s %s: the keypad opened" % [fp.unit_id, key_]); return
	await type_number(value)

func do_set(id: String, l: Dictionary) -> void:
	var sid := str(l.id)
	await click_row(sid)
	var cl := line(sid)
	var plate_ok: bool = cl.get("unit") != null and Faceplate.plates.has(str(cl.unit))
	check(plate_ok, "%s: clicking the setting line %s opens that unit's plate (line %s plates %s)" % [id, sid, str(cl), str(Faceplate.plates.keys())])
	var types := {"L23:purity": [["column", 1, "xD", "83"]],
		"L25:catalyst": [["packed_bed", 1, "W", "8000"], ["packed_bed", 2, "W", "8000"], ["packed_bed", 3, "W", "8000"], ["packed_bed", 4, "W", "8000"]],
		"L25:temps": [["cooler", 1, "T", "420"], ["cooler", 2, "T", "420"], ["heater", 1, "T", "420"]],
		"L26:air": [["feed", 2, "flow", "630"]], "L26:preheat": [["heater", 1, "T", "200"]], "L26:abate": [["n2o_abater", 1, "X", "95"]]}
	for job in types.get(id + ":" + sid, []):
		var uid := unit_id(str(job[0]), int(job[1]))
		var fp := await open_plate(uid)
		check(fp != null, "%s: the plate of %s opens from a click on the unit (at %s, plates %s, modal %s)" % [id, uid, str(app.world.unit_screen_pos(uid)), str(Faceplate.plates.keys()), str(app.modal())])
		if fp == null: continue
		if str(job[0]) == "packed_bed":
			var bt: Button = fp.find_child("Opt_v2o5", true, false) as Button
			check(bt != null, "%s: %s offers the V2O5 catalyst" % [id, uid])
			if bt != null: await click_at(bt.get_global_rect().get_center(), 3)
		await set_knob(fp, str(job[2]), str(job[3]))
	Faceplate.close_all(); await frames(2)
	check(done(sid), "%s: the setting line %s is ticked (%s)" % [id, sid, str(line(sid))])

func unit_id(type: String, n: int) -> String:
	var k := 0
	for u in (q("plant") as Dictionary).units:
		if str(u.type) == type:
			k += 1
			if k == n: return str(u.id)
	return ""
