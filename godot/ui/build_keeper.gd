class_name BuildKeeper
extends RefCounted
## Restart / stop-and-edit without losing the player's work. The engine has no "back to design" action, so the front-end restarts the level and replays what
## the player had built (units, knob values, feeds, banks, pipes) and the Call it answers onto the fresh plant. `clear := true` keeps nothing but the answers.

## Level-local edits (levelAct: setDial, cards, schedules, worksheets) in the order the player made them. A dial keeps only its last value. The level view bay
## notes each one that the engine accepted and clears the log when a different level starts; a restart replays it onto the fresh level.
static var act_log: Array = []
static var restarting := false
## Levels whose prediction was made (or waived with Run anyway) in this attempt: the predict-first question is not asked again after a Retry / stop-and-edit.
static var predict_done := {}
## Runs of a level already printed before the last restart (Retry / Keep improving restart the engine, whose own run list starts empty): the printout's RUN number counts on from here.
static var run_prior := {}
## Goals that stood met when a level was restarted with its build kept, with a fingerprint of that build: the notebook keeps them ticked until the plant changes.
static var kept_goals := {}
static func plant_sig(app) -> int:
	var c := capture(app)
	return JSON.stringify([c.units, c.streams]).hash()
static func note_act(name: String, args: Array) -> void:
	if name == "setDial" and args.size() >= 1:
		act_log = act_log.filter(func(a): return not (str(a[0]) == "setDial" and str((a[1] as Array)[0]) == str(args[0])))
	act_log.append([name, args.duplicate(true)])
static func clear_log() -> void: act_log = []

## What the plant looks like now: units (type, tile, rot, knob values), feeds, pipes, banks and the Call it answers.
static func capture(app) -> Dictionary:
	var out := {"units": [], "streams": [], "banks": [], "calls": [], "acts": act_log.duplicate(true), "burns": 0}
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
		out.burns = int(li.get("burns", 0))   # L03 counts its test burns across Retries
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
		if _piped(b, fu, str(s.from[1]), tu, str(s.to[1])): continue   # the level already piped it: nothing to redo
		b.act("connect", [fu, s.from[1], tu, s.to[1]])
	# judge the result, not the steps: what is really missing now (a refused duplicate is not a loss)
	var missing: Array = []
	var pl2 = b.q("plant"); var have := {}
	for u in (pl2.get("units", []) if pl2 is Dictionary else []): have[str(u.id)] = true
	for u in olds: if not map.has(str(u.id)) or not have.has(str(map[str(u.id)])): missing.append(str(u.id))
	for s2 in snap.streams:
		var fu2: String = str(map.get(s2.from[0], "")); var tu2: String = str(map.get(s2.to[0], ""))
		if fu2 == "" or tu2 == "" or not _piped(b, fu2, str(s2.from[1]), tu2, str(s2.to[1])): missing.append("%s>%s" % [s2.from[0], s2.to[0]])
	last_missing = missing
	return missing.size()

static var last_missing: Array = []   ## what the last replay could not put back (unit tags and pipes as "A>B")

static func _piped(b, fu: String, fp: String, tu: String, tp: String) -> bool:
	var pl = b.q("plant")
	if not (pl is Dictionary): return false
	for st in pl.get("streams", []):
		if str(st.from.unit) == fu and str(st.from.port) == fp and str(st.to.unit) == tu and str(st.to.port) == tp: return true
	return false

static func restore_acts(app, snap: Dictionary) -> void:
	for a in snap.get("acts", []):
		var r: Dictionary = app.b.act("levelAct", [a[0]] + (a[1] as Array))
		if bool(r.get("ok", false)): note_act(str(a[0]), a[1])

static func restore_calls(app, snap: Dictionary) -> void:
	for c in snap.calls:
		var key := str(c.key)
		var args: Array = [float(c.value)]
		if key != "": args.append(key)
		var r: Dictionary = app.b.act("callIt", args)
		if not bool(r.get("ok", false)) and args.size() > 1: r = app.b.act("callIt", [float(c.value)])
		if not bool(r.get("ok", false)) and key != "": app.b.act("predict", [key, float(c.value)])   # the stored-prediction route: answerOf reads it when the log has no callIt
		if not _call_answered(app, key):
			push_warning("BuildKeeper: the Call it answer %s = %s did not come back after the restart" % [key, str(c.value)])

## True when the engine now holds an answer for this key (the single callIt, or the item of callIts).
static func _call_answered(app, key: String) -> bool:
	var li = PaperStrings.q(app, "levelInfo")
	if not (li is Dictionary): return false
	for ci in (li.get("callIts", []) as Array):
		if ci is Dictionary and (str(ci.get("key", "")) == key or key == "") and bool(ci.get("answered", false)): return true
	var one = li.get("callIt")
	return one is Dictionary and (str(one.get("key", "")) == key or key == "") and bool(one.get("answered", false))

## Restart the current level. keep_build: units/pipes/knobs come back. Call it answers always come back.
static func restart(app, keep_build: bool) -> Dictionary:
	var li = PaperStrings.q(app, "levelInfo")
	if not (li is Dictionary) or not li.has("id"): app.new_game(app._mode_pref()); return {}
	var snap := capture(app)
	if not keep_build: snap.acts = []
	var met_keys: Array = []
	for g in li.get("goals", []): if g is Dictionary and bool(g.get("met", false)): met_keys.append(str(g.key))
	if keep_build and not met_keys.is_empty(): kept_goals[str(li.id)] = {"sig": plant_sig(app), "met": met_keys}
	else: kept_goals.erase(str(li.id))
	var rq = app.b.q("runs")
	run_prior[str(li.id)] = int(run_prior.get(str(li.id), 0)) + ((rq as Array).size() if rq is Array else 0)
	restarting = true; clear_log()
	var had_seed: int = int(app.get("last_seed")) if app.get("last_seed") != null else 0
	if app.get("pinned_seed") != null and had_seed > 0: app.set("pinned_seed", had_seed)   # the same level seed: a Retry is the same job (L03's fuel does not re-roll)
	app.start_level(str(li.id), true)
	if app.get("pinned_seed") != null: app.set("pinned_seed", -1)
	restarting = false
	var fails := 0
	last_missing = []
	if keep_build: fails = replay(app, snap)
	restore_calls(app, snap)
	if int(snap.get("burns", 0)) > 0: app.b.act("carryBurns", [int(snap.burns)])
	if keep_build: restore_acts(app, snap)
	if keep_build and (snap.units.size() > 0 or snap.calls.size() > 0): Notebook.started[str(li.id)] = true
	app.game_on_changed()
	return {"fails": fails, "missing": last_missing.duplicate(), "kept": snap.units.size(), "calls": snap.calls.size()}

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
