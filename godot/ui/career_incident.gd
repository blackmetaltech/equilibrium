class_name CareerIncident
extends RefCounted
## F29: a Career incident opens a real plant. GO TO THE PLANT on the board saves the run (CareerSave's own file, as every change does), remembers the incident in a small marker file
## (user://eq_career_incident.json: the level, the Career state it is pre-loaded with, the month) and opens the incident level; the level is pre-loaded with levelAct('career', pre)
## on every fresh start of it (a Retry too). When the fixed loop has run (the level is won), BACK TO THE CAREER on the printout reloads the saved run at the same month and hands it the
## commissioned loop (levelAct('incidentFix', fix)); the board's log says what was done. A crash in the plant loses nothing: the run's file still holds the month with the incident open,
## and the incident level's own autosave still knows it came from the Career.
static var path := "user://eq_career_incident.json"

static func _read() -> Dictionary:
	if not FileAccess.file_exists(path): return {}
	var f := FileAccess.open(path, FileAccess.READ)
	if f == null: return {}
	var d = JSON.parse_string(f.get_as_text())
	return d if typeof(d) == TYPE_DICTIONARY else {}

static func marker() -> Dictionary: return _read()

static func clear() -> void:
	if FileAccess.file_exists(path): DirAccess.remove_absolute(ProjectSettings.globalize_path(path))

## GO TO THE PLANT from the board's incident card. False (with a toast) when the run could not be saved.
static func go(app, ic: Dictionary) -> bool:
	var level := str(ic.get("level", ""))
	if level == "" or not (ic.get("pre") is Dictionary): return false
	if not CareerSave.store(app):
		if app.has_method("toast"): app.toast("The Career could not be saved, so the plant cannot be opened.", "bad")
		return false
	var f := FileAccess.open(path, FileAccess.WRITE)
	if f == null: return false
	f.store_string(JSON.stringify({"level": level, "pre": ic.pre, "month": int(ic.get("month", 0)), "id": str(ic.get("id", ""))}, "", false, true)); f.close()
	app.start_level(level, true)
	return true

## Every level start: a fresh incident level that the marker names gets the Career's state (once, before anything is commissioned).
static func on_begin(app) -> void:
	if app == null or app.b == null: return
	var mk := _read()
	var lid := str(app.b.g.get("level", ""))
	if mk.is_empty() or lid != str(mk.get("level", "")): return
	var v = app.b.q("levelView")
	if not (v is Dictionary) or bool(v.get("fromCareer", false)): return
	var q: bool = app.quiet; app.quiet = true
	app.b.act("levelAct", ["career", mk.pre])
	app.quiet = q

## The printout offers BACK TO THE CAREER: this level came from the Career and its loop is fixed (the level won).
static func can_back(app) -> bool:
	if app == null or app.b == null or _read().is_empty() or CareerSave.info().is_empty(): return false
	var v = app.b.q("levelView")
	return v is Dictionary and bool(v.get("fromCareer", false)) and v.get("fix") is Dictionary

## BACK TO THE CAREER: the run comes back at the same month and runs the plant at the commissioned loop. True when the Career took the fix.
static func back(app) -> bool:
	var v = app.b.q("levelView")
	var fix = v.get("fix") if v is Dictionary else null
	if not (fix is Dictionary): return false
	if not CareerSave.restore(app): app.toast("There is no saved Career to go back to.", "bad"); return false
	var r: Dictionary = app.b.act("levelAct", ["incidentFix", fix])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "The Career did not take the fix.")), "bad"); return false
	clear()
	CareerSave.store(app)
	if app.lvbay != null: app.lvbay.refresh(true)
	return true
