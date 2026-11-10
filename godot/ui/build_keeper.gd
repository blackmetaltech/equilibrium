class_name BuildKeeper
extends RefCounted
## Restart / stop-and-edit without losing the player's work. The engine has no "back to design" action, so the front-end restarts the level and replays what
## the player had built (units, knob values, feeds, banks, pipes) and the Call it answers onto the fresh plant. `clear := true` keeps nothing but the answers.

## What the plant looks like now: units (type, tile, rot, knob values), feeds, pipes, banks and the Call it answers.
static func capture(app) -> Dictionary:
	var out := {"units": [], "streams": [], "banks": [], "calls": []}
	var p = app.b.q("plant")
	if not (p is Dictionary): return out
	for u in p.get("units", []):
		var id := str(u.id)
		var c = PaperStrings.q(app, "unitCard", [id])
		var knobs := {}
		var feed = null
		if c is Dictionary:
			for k in c.get("knobs", []): knobs[str(k.key)] = k.value
			feed = c.get("feed")
		(out.units as Array).append({"id": id, "type": str(u.type), "x": int(u.pos.x), "y": int(u.pos.y), "rot": int(u.rot), "knobs": knobs, "feed": feed, "catalyst": u.get("catalystId")})
	for s in p.get("streams", []): (out.streams as Array).append({"from": [str(s.from.unit), str(s.from.port)], "to": [str(s.to.unit), str(s.to.port)]})
	var li = PaperStrings.q(app, "levelInfo")
	if li is Dictionary:
		out.banks = (li.get("banks", []) as Array).duplicate(true)
		var cis: Array = li.get("callIts", []) if li.get("callIts") is Array else []
		if cis.is_empty() and li.get("callIt") is Dictionary: cis = [li.callIt]
		for ci in cis:
			if ci is Dictionary and bool(ci.get("answered", false)) and ci.get("value") != null: (out.calls as Array).append({"key": str(ci.get("key", "")), "value": float(ci.value)})
	return out

## Put a captured build onto the (fresh) plant. Returns the number of things that could not be put back.
static func replay(app, snap: Dictionary) -> int:
	var fails := 0
	var b = app.b
	var now := {}
	var pl = b.q("plant")
	for u in (pl.get("units", []) if pl is Dictionary else []): now[str(u.id)] = u
	var map := {}
	var olds: Array = snap.units
	# units the level placed already: keep those the player kept, delete the ones they removed
	var old_ids := {}
	for u in olds: old_ids[str(u.id)] = true
	for id in now.keys():
		if not old_ids.has(id):
			var r: Dictionary = b.act("deleteUnit", [id]); if not bool(r.get("ok", false)): fails += 1
	for u in olds:
		var id := str(u.id)
		if now.has(id) and str(now[id].type) == str(u.type):
			map[id] = id
			var mv: Dictionary = {"x": int(now[id].pos.x), "y": int(now[id].pos.y)}
			if int(now[id].pos.x) != int(u.x) or int(now[id].pos.y) != int(u.y) or int(now[id].rot) != int(u.rot):
				b.act("deleteUnit", [id]); var rp: Dictionary = b.act("placeUnit", [u.type, u.x, u.y, u.rot])
				if bool(rp.get("ok", false)): map[id] = str(rp.id)
				else: fails += 1; map.erase(id); continue
		else:
			var r2: Dictionary = b.act("placeUnit", [u.type, u.x, u.y, u.rot])
			if bool(r2.get("ok", false)): map[id] = str(r2.id)
			else: fails += 1; continue
		var nid: String = map[id]
		if u.get("feed") is Dictionary:
			var f: Dictionary = u.feed
			b.act("setFeed", [nid, {"x": f.get("x", []), "flow": f.get("flow", 0.0), "T": f.get("T", 300.0), "P": f.get("P", 1e5)}])
		var knobs: Dictionary = u.knobs
		for k in knobs:
			if u.get("feed") is Dictionary and (k == "flow" or k == "T" or k == "P"): continue
			b.act("setParam", [nid, k, knobs[k]])
		if u.get("catalyst") != null and str(u.catalyst) != "": b.act("setCatalyst", [nid, str(u.catalyst)])
	for bk in snap.banks:
		var nid2: String = str(map.get(str(bk.get("unit", "")), ""))
		if nid2 != "" and (b.q("levelInfo") as Dictionary).get("bankSpecies", []).size() > 0: b.act("setBank", [nid2, str(bk.species), float(bk.kgPerH)])
	for s in snap.streams:
		var fu: String = str(map.get(s.from[0], "")); var tu: String = str(map.get(s.to[0], ""))
		if fu == "" or tu == "": fails += 1; continue
		var rc: Dictionary = b.act("connect", [fu, s.from[1], tu, s.to[1]])
		if not bool(rc.get("ok", false)): fails += 1
	return fails

static func restore_calls(app, snap: Dictionary) -> void:
	for c in snap.calls:
		var args: Array = [float(c.value)]
		if str(c.key) != "": args.append(str(c.key))
		var r: Dictionary = app.b.act("callIt", args)
		if not bool(r.get("ok", false)) and args.size() > 1: app.b.act("callIt", [float(c.value)])

## Restart the current level. keep_build: units/pipes/knobs come back. Call it answers always come back.
static func restart(app, keep_build: bool) -> Dictionary:
	var li = PaperStrings.q(app, "levelInfo")
	if not (li is Dictionary) or not li.has("id"): app.new_game(app._mode_pref()); return {}
	var snap := capture(app)
	app.start_level(str(li.id), true)
	var fails := 0
	if keep_build: fails = replay(app, snap)
	restore_calls(app, snap)
	if keep_build and (snap.units.size() > 0 or snap.calls.size() > 0): Notebook.started[str(li.id)] = true
	app.game_on_changed()
	return {"fails": fails, "kept": snap.units.size(), "calls": snap.calls.size()}

## The "Restart job" question: keep the build, clear the plot, or cancel.
static func ask_restart(app) -> void:
	var d: Dictionary = app.dialog("restartask", 560.0, 0.0, EqTheme.AMBER, 0.55)
	var vb: VBoxContainer = d.vb; var h: Control = d.host
	d.panel.add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 18.0))
	vb.add_child(EqTheme.label(PaperStrings.t("RST_TITLE"), 26, EqTheme.TEXT, "title"))
	var tx := EqTheme.label(PaperStrings.t("RST_BODY"), 16, EqTheme.TEXT, "sans"); tx.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tx.custom_minimum_size = Vector2(500, 0); vb.add_child(tx)
	var keep := EqTheme.key_button(PaperStrings.t("RST_KEEP"), true, 17); keep.name = "KeepBuild"; keep.custom_minimum_size = Vector2(0, 44)
	keep.pressed.connect(func(): h.queue_free(); await app.get_tree().process_frame; restart(app, true)); vb.add_child(keep)
	var clr := EqTheme.key_button(PaperStrings.t("RST_CLEAR"), false, 17); clr.name = "ClearPlot"; clr.custom_minimum_size = Vector2(0, 44)
	clr.pressed.connect(func(): h.queue_free(); await app.get_tree().process_frame; restart(app, false)); vb.add_child(clr)
	var no := EqTheme.key_button(PaperStrings.t("RST_CANCEL"), false, 17); no.name = "Cancel"; no.custom_minimum_size = Vector2(0, 44); no.pressed.connect(func(): h.queue_free()); vb.add_child(no)
	app.focus_dialog()
	no.call_deferred("grab_focus")
