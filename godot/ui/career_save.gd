class_name CareerSave
extends RefCounted
## CAREER persistence: a 60-month run survives a crash or a quit. The engine already knows how to save a whole level state (seed, month, cash, plants, contracts, the pending
## yearly card, ...) into its autosave slot; the Career copies that save to its own file (user://eq_career_resume.json) every time anything changes, so another level's
## autosave never overwrites a run in progress. Opening the Career offers RESUME (month N, cash, seed) or NEW CAREER; a launch with CB_LEVEL=C (or CB_AUTOSTART=career)
## resumes by itself, and CB_NEW=1 starts a fresh run instead. A finished run (any ending) deletes the file. Nothing here runs when autosave is off (Settings, CB_NOAUTOSAVE).
static var path := "user://eq_career_resume.json"
static var force := false   ## tests: persist even under CB_NOAUTOSAVE
const ENGINE_SAVE := "equilibrium%3Asave%3Aauto.json"   ## the engine's autosave file inside user://saves (FileKV: one file per key, ':' encoded)

static func enabled(app: CbApp) -> bool: return force or (not app.no_autosave and CbSettings.autosave)

static func engine_file() -> String: return ProjectSettings.globalize_path("user://saves").path_join(ENGINE_SAVE)

static func is_career(app: CbApp) -> bool: return app.started and app.b != null and str(app.b.g.get("level", "")) == "CAREER"

static func _read(p: String) -> String:
	if not FileAccess.file_exists(p): return ""
	var f := FileAccess.open(p, FileAccess.READ)
	return f.get_as_text() if f != null else ""

static func _write(p: String, text: String) -> bool:
	var tmp := p + ".tmp"
	var f := FileAccess.open(tmp, FileAccess.WRITE)
	if f == null: return false
	f.store_string(text); f.close()
	return DirAccess.rename_absolute(ProjectSettings.globalize_path(tmp), ProjectSettings.globalize_path(p)) == OK

## Save the run in progress now (the engine writes its autosave slot; the file is copied). A finished run deletes the file instead. Returns true when the file holds the run.
static func store(app: CbApp) -> bool:
	if not is_career(app): return false
	if str(app.b.g.get("status", "playing")) != "playing": clear(); return false
	var q: bool = app.quiet; app.quiet = true
	var r: Dictionary = app.b.act("save", ["auto"])
	app.quiet = q
	if not bool(r.get("ok", false)): return false
	var text := _read(engine_file())
	return text != "" and _write(path, text)

static func clear() -> void:
	if FileAccess.file_exists(path): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

## What the file holds, or {} when there is no resumable run: month (months already run), cash (USD), seed, mode, pending (a yearly card waits).
static func info() -> Dictionary:
	var text := _read(path)
	if text == "": return {}
	var s = JSON.parse_string(text)
	if typeof(s) != TYPE_DICTIONARY or str(s.get("level", "")) != "CAREER" or str(s.get("status", "playing")) != "playing": return {}
	var lv = s.get("lv", {})
	var c = lv.get("c", null) if typeof(lv) == TYPE_DICTIONARY else null
	if typeof(c) != TYPE_DICTIONARY or str(c.get("ending", "")) != "": return {}
	var ds: Array = c.get("decisions", []) if typeof(c.get("decisions", [])) == TYPE_ARRAY else []
	var pend := not ds.is_empty() and typeof(ds[ds.size() - 1]) == TYPE_DICTIONARY and int(ds[ds.size() - 1].get("choice", 0)) == -1
	return {"month": int(c.get("m", 0)), "cash": float(c.get("cash", 0.0)), "seed": int(s.get("seed", 0)), "mode": str(s.get("mode", "")), "pending": pend}

## Put the file back as the engine's autosave and load it: the same month, cash, seed and pending card. False when there is nothing to resume.
static func restore(app: CbApp) -> bool:
	if info().is_empty(): return false
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("user://saves"))
	var ef := engine_file()
	var f := FileAccess.open(ef + ".tmp", FileAccess.WRITE)
	if f == null: return false
	f.store_string(_read(path)); f.close()
	if DirAccess.rename_absolute(ef + ".tmp", ef) != OK: return false
	app.load_slot("auto")
	return is_career(app)

static func label(inf: Dictionary) -> String:
	return "month %d of 60, cash %.1f MUSD, seed %d%s" % [int(inf.month) + 1, float(inf.cash) / 1e6, int(inf.seed), ", a yearly decision waiting" if bool(inf.pending) else ""]
