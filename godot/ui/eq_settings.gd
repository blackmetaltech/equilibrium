class_name EqSettings
extends RefCounted
## EQUILIBRIUM's own preferences (user://eq_settings.cfg): Cute mode (UI.md "Cute mode", default on). The shell's CbSettings has no game hook, so the
## toggle lives in the pause menu and on the title. `EqSettings.cute` is read by the world and the critters. Smoke runs never touch the file
## (CbSettings.persist is false there). CB_CUTE=0|1 overrides it for one run without saving.
static var cute := true
static var path := "user://eq_settings.cfg"
static var _loaded := false

static func load_all() -> void:
	if _loaded: return
	_loaded = true
	if CbSettings.persist:
		var c := ConfigFile.new()
		if c.load(path) == OK: cute = bool(c.get_value("a", "cute", true))
	var env := OS.get_environment("CB_CUTE")
	if env != "": cute = env != "0"

static func save_all() -> void:
	if not CbSettings.persist: return
	var c := ConfigFile.new()
	c.set_value("a", "cute", cute)
	c.save(path)

## Flip Cute mode, persist it and tell the world (duck-typed: any world node with `cute` or `set_cute`).
static func set_cute(app: CbApp, on: bool) -> void:
	cute = on; save_all()
	var w = app.world if app != null else null
	if w != null:
		if w.has_method("set_cute"): w.call("set_cute", on)
		elif "cute" in w: w.set("cute", on)
