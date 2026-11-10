extends CbApp
## EQUILIBRIUM front-end. Custom chrome (UI.md): the plant world is full-bleed and the interface is a control-room console in front of it
## (ui/console.gd: intercom, annunciator, chart recorder, key switch, parts rack slot), a title with Dymo-tape strips (ui/title_screen.gd) and an enamel pause
## plate (ui/pause_menu.gd). Settings, saves, codex, pad, touch, env hooks and smoke still come from CbApp in addons/cobanana.
## Text is tr() from locales/strings.csv or EqStrings (ui/eq_strings.gd), or region-pack data from the engine.
var plant_world: PlantWorld
var chrome: EqConsole

func game_config() -> Dictionary:
	EqStrings.load_strings()
	return {
		"chrome": "custom", "home": "home",
		"title": str(ProjectSettings.get_setting("application/config/name", "EQUILIBRIUM")),
		"tagline": tr("EQ_TAGLINE"),
		"blurb": tr("EQ_BLURB"),
		"accent": Color("#2EC4B6"), "accent2": Color("#FFB703"),
		"modes": [["learner", tr("MODE_LEARNER"), tr("MODE_LEARNER_DESC")], ["engineer", tr("MODE_ENGINEER"), tr("MODE_ENGINEER_DESC")], ["sandbox", tr("MODE_SANDBOX"), tr("MODE_SANDBOX_DESC")]],
		"dock": [["home", tr("DOCK_PLANT"), Color("#2EC4B6"), tr("DOCK_PLANT")], ["codex", tr("DOCK_CODEX"), Color("#9fb4c8"), tr("DOCK_CODEX")]],   # the dock itself is hidden in custom chrome; "home" is blank (ui/home_blank.gd)
		"screens": {"home": "res://ui/home_blank.gd"},
		"overlay": [], "full": ["codex"],
		"tick_label": tr("TICK_BUTTON"), "tick_seconds": [0.0, 1.0, 0.5, 0.25],
		"keys": [[tr("KEY_ROTATE"), tr("KEY_ROTATE_DESC")], [tr("KEY_WHEEL"), tr("KEY_WHEEL_DESC")], [tr("KEY_PAN"), tr("KEY_PAN_DESC")], ["Space", EqStrings.T("KEY_HINT")], ["K", EqStrings.T("ANN_ACK")]],
	}

func game_build_world(parent: Node) -> Node:
	EqSettings.load_all()
	plant_world = PlantWorld.new(); plant_world.app = self; parent.add_child(plant_world)
	return plant_world

func game_on_changed() -> void:
	if plant_world == null: return
	var p = b.q("plant")
	if p is Dictionary: plant_world.set_state(p)

func game_time_text() -> String:
	var t := int(b.g.get("tick", 0))
	return tr("HUD_TIME") % [floori(t / 60.0), t % 60]

func game_top_stats() -> Array:
	var p = b.q("plant")
	if not (p is Dictionary) or p.is_empty(): return []
	return [[tr("HUD_PHASE"), tr("PHASE_" + str(p.get("phase", "design")).to_upper()), CbKit.ACC],
		[tr("HUD_THERMO"), tr("THERMO_" + str(p.get("thermoDetail", "rigorous")).to_upper()), CbKit.DIM]]

func game_coach_steps() -> Array:
	# One shell step (a read-only hello on the intercom); the level's own coach (engine query levelInfo.coach) speaks through the intercom as well.
	return [{"id": "plot", "kind": "read", "title": tr("COACH_PLOT_TITLE"), "body": tr("COACH_PLOT_BODY"), "why": tr("COACH_PLOT_WHY")}]

## CB_CAM for screenshots: parts separated by '|'. `act=name/arg/arg` runs an engine action (numbers, true/false or text args), `ff=n` advances n ticks,
## `key=n` turns the key n steps, `menu` opens the pause plate, anything else goes to the world camera ("wide", "rot+").
func game_camera(spec: String) -> void:
	var cam: PackedStringArray = []
	for part in spec.split("|"):
		if part.begins_with("act="):
			var f := part.substr(4).split("/"); var args: Array = []
			for a in f.slice(1):
				if a == "true" or a == "false": args.append(a == "true")
				elif a.is_valid_float(): args.append(float(a))
				else: args.append(a)
			b.act(f[0], args)
		elif part.begins_with("ff="): b.act("tick", [int(part.substr(3))])
		elif part.begins_with("key="):
			for i in int(part.substr(4)):
				if chrome != null: chrome.turn_key()
		elif part.begins_with("li="):
			if chrome != null: chrome.qa(part.substr(3))
		elif part == "menu": game_menu()
		elif part == "recorder":
			if chrome != null: chrome.open_recorder()
		elif part == "log":
			if chrome != null: chrome.intercom.open_full()
		else: cam.append(part)
	game_on_changed()
	if plant_world != null and not cam.is_empty(): plant_world.set_camera(",".join(cam))

func game_unhandled_key(e: InputEventKey) -> bool:
	if chrome != null and chrome.key(e): return true
	if plant_world == null or not e.pressed or e.echo: return false
	match e.keycode:
		KEY_Q: plant_world.rotate_view(-1); return true
		KEY_E: plant_world.rotate_view(1); return true
	return false

# --- custom chrome hooks ---
func game_build_chrome(r: Control) -> void:
	chrome = EqConsole.new(); chrome.app = self; r.add_child(chrome); chrome.build()
func game_chrome_visible(v: bool) -> void:
	if chrome != null: chrome.set_chrome_visible(v)
func game_relayout() -> void:
	if chrome != null: chrome.layout()
func game_toast(text: String, level: String) -> bool:
	if chrome == null: return false
	chrome.toast(text, level); return true
func game_coach(step: Dictionary, index: int, total: int) -> bool:
	if chrome == null: return false
	chrome.coach(step, index, total); return true
func game_title(r: Control) -> bool: return TitleScreen.build(self, r)
func game_menu() -> bool: return PauseMenu.toggle(self)

## Manual step (Space, pad Y): inside a level it turns the key one position; free play and the auto-run clock still advance the engine.
func next_tick() -> void:
	if speed == 0 and chrome != null and chrome.key_available(): chrome.turn_key(); return
	super()

## Pad A acknowledges the annunciator when something is flashing and nothing else wants the button.
func _input(e: InputEvent) -> void:
	if e is InputEventJoypadButton and e.pressed and e.button_index == JOY_BUTTON_A and CbPad.enabled and started and chrome != null and modal() == null \
			and chrome.annunciator.unacked() > 0 and get_viewport().gui_get_focus_owner() == null:
		chrome.annunciator.ack(""); get_viewport().set_input_as_handled(); return
	super(e)

## Console cues without a recipe in the shell borrow one: the key clunks like a confirm, the intercom blips like a hover.
func sfx(k: String) -> void:
	match k:
		"key": super("confirm")
		"radio": super("hover")
		_: super(k)

func game_smoke() -> void:
	CbSmoke._check(tr("EQ_TAGLINE") != "EQ_TAGLINE", "string catalogue locales/strings.csv is loaded (run --import)")
	CbSmoke._check(plant_world != null and is_instance_valid(plant_world), "the plant world exists")
	await get_tree().process_frame
	var p = b.q("plant")
	CbSmoke._check(p is Dictionary and str(p.get("phase", "")) == "design" and (p.get("units", null) is Array) and (p.get("streams", null) is Array) and (p.get("species", null) is Array), "the plant query answers")
	CbSmoke._check(plant_world.unit_count() == 0, "the plot starts empty")
	CbSmoke._check(plant_world.lamp_count() > 0 and plant_world.cam.projection == Camera3D.PROJECTION_ORTHOGONAL, "the world is lit and the camera is orthographic")
	var y0 := plant_world.yaw_degrees()
	plant_world.set_camera("rot+")
	CbSmoke._check(absf(plant_world.yaw_degrees() - y0 - 90.0) < 0.01 or y0 >= 315.0, "the view turns in quarter steps")
	for i in range(3): plant_world.set_camera("rot+")
	CbSmoke._check(absf(plant_world.yaw_degrees() - y0) < 0.01, "four quarter turns come back")
	plant_world.set_camera("wide"); plant_world.set_camera("close"); plant_world.set_camera("mid")
	# the models: one of every kind builds, has ports and an anchor, takes a display state, an alarm, a shake and an outline
	for t in UnitModels.TYPES:
		var m := UnitModels.create(t, "t_" + t)
		plant_world.add_child(m)
		m.set_display({"T_K": 700.0, "spin": 0.5, "level": 0.5, "flame": 0.5, "alarm": 2}); m.set_alarm(1); m.shake(0.02); m.set_selected(true)
		CbSmoke._check(m.ports.size() > 0 and m.anchor_top != null and m.footprint(0).x > 0, "model %s has ports and an anchor" % t)
		m.queue_free()
	plant_world.set_units([{"id": "u1", "type": "flash", "pos": {"x": 2, "y": 2}, "rot": 1, "display": {"level": 0.5}}])
	CbSmoke._check(plant_world.unit_count() == 1 and plant_world.can_place("flash", 2, 2) == false and plant_world.can_place("flash", 6, 6), "units diff by id and the grid refuses overlap")
	plant_world.begin_place("heater"); plant_world.rotate_ghost(); plant_world.cancel_place()
	plant_world.set_units([])
	CbSmoke._check(plant_world.unit_count() == 0, "units are removed by id")
	show_screen(home); await get_tree().process_frame
	# console chrome: nodes exist, the kit bar and dock are hidden, the key and the intercom answer
	CbSmoke._check(chrome != null and chrome.visible and chrome.intercom != null and chrome.annunciator != null and chrome.recorder != null and chrome.keys != null and chrome.rack_slot != null, "the console exists and is shown in a game")
	CbSmoke._check(not top.visible and not dock_scroll.visible, "the kit bar and dock are hidden in custom chrome")
	var wn: int = chrome.annunciator.window_count()
	CbSmoke._check(wn >= 4 and wn <= 8, "the annunciator shows 4-8 windows")
	chrome.toast("test", "warn")
	CbSmoke._check(chrome.intercom.last().speaker == "TOMAS" and chrome.intercom.last().kind == "warn", "a warn toast arrives on the intercom as TOMAS")
