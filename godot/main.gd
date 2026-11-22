extends CbApp
## EQUILIBRIUM front-end. Custom chrome (UI.md): the plant world is full-bleed and the interface is a control-room console in front of it
## (ui/console.gd: intercom, annunciator, chart recorder, key switch, parts rack slot), a title with Dymo-tape strips (ui/title_screen.gd) and an enamel pause
## plate (ui/pause_menu.gd). Settings, saves, codex, pad, touch, env hooks and smoke still come from CbApp in addons/cobanana.
## Text is tr() from locales/strings.csv or EqStrings (ui/eq_strings.gd), or region-pack data from the engine.
var plant_world: PlantWorld
var chrome: EqConsole
var lvbay: LevelViewBay   ## the level-local view (ui/level_view_bay.gd); wins the instrument bay's slot
var bay: InstrumentBay   ## the hero instrument of the plant (ui/instrument_bay.gd)
var audio_eq: EqAudio
var look2: Look2   ## LOOK2 phase A: the slice level (L00) in the new look (look2/look2.gd); CB_LOOK2=0 turns it off
var _chrome_on := false
func chrome_shown() -> bool: return _chrome_on

## Every level start draws its seed here. A Retry / restart pins the seed of the attempt it replaces, so the level's random draw (L03's unknown fuel) is the same fuel again.
var last_seed := 0
var pinned_seed := -1
func _seed() -> int:
	last_seed = pinned_seed if pinned_seed >= 0 else super._seed()
	return last_seed

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
		"tick_label": tr("TICK_BUTTON"), "tick_seconds": [0.0, 1.0, 0.25, 0.0625],   # x1 / x4 / x16 are 1 / 4 / 16 ticks a second (the engine runs the ticks the shell asks for)
		"keys": [[tr("KEY_ROTATE"), tr("KEY_ROTATE_DESC")], [tr("KEY_WHEEL"), tr("KEY_WHEEL_DESC")], [tr("KEY_PAN"), tr("KEY_PAN_DESC")], ["Space", EqStrings.T("KEY_HINT")], ["K", EqStrings.T("ANN_ACK")]],
	}

func _lift_node(n: Node) -> void:
	if n is Label or n is Button or n is LineEdit or n is RichTextLabel: EqTheme.lift.call_deferred(n)

func game_build_world(parent: Node) -> Node:
	EqSettings.load_all()
	get_tree().node_added.connect(_lift_node)   # F32: text the shell builds (Settings) never draws under the 16 px floor
	plant_world = PlantWorld.new(); plant_world.app = self; parent.add_child(plant_world)
	plant_world.set_cute.call_deferred(EqSettings.cute)
	audio_eq = EqAudio.new(); add_child(audio_eq); audio_eq.start_music.call_deferred()
	return plant_world

## Design edits are autosaved too (the engine only saves on ticks and wins): a killed game's Continue brings the plant back. Written once the player pauses for a second.
var _save_dirty := false
var _save_at := 0.0
func _autosave_design() -> void:
	if not _save_dirty or Time.get_ticks_msec() < _save_at or not started or b == null or no_autosave or not CbSettings.autosave: return
	_save_dirty = false
	if chrome == null or not chrome.visible or str(b.g.get("level", "")) == "" or str(b.g.get("status", "playing")) != "playing": return
	var q := quiet; quiet = true; b.act("save", ["auto"]); quiet = q

## CAREER: the run is saved the frame after every change (a decision, a month advanced), not after a pause: a killed window loses nothing. See CareerSave.
var _career_dirty := false
func _career_flush() -> void:
	if not _career_dirty or not started or b == null: return
	_career_dirty = false
	if CareerSave.is_career(self) and CareerSave.enabled(self): CareerSave.store(self)

## Quitting, going to the title or losing focus saves the autosave; a Career in progress is copied to its own file too.
func _autosave() -> void:
	super()
	if CareerSave.is_career(self) and CareerSave.enabled(self): CareerSave.store(self)

func game_on_changed() -> void:
	_save_dirty = true; _save_at = Time.get_ticks_msec() + 1000.0
	if started and b != null and str(b.g.get("level", "")) == "CAREER": _career_dirty = true
	if chrome != null: chrome.refresh()   # intercom coach, annunciator, recorder and key follow the engine
	if lvbay != null: lvbay.refresh()
	if bay != null and not (lvbay != null and lvbay.active()): bay.refresh()
	if plant_world == null: return
	var p = b.q("plant")
	if p is Dictionary: plant_world.set_state(p)
	plant_world.set_snapshot(b.g)   # live looks: stream colours/flow, unit heat and alarms, Cute critters
	_level_mood()
	if look2 != null: look2.sync()

## Per-level mood: L00 is the 02:40 night shift (dark, lamps on), the bench levels are daytime; alarms drive the tones, the music stress
## and the lab cat (it hides). The engine's annunciator states are the single source.
var _mood_level := "?"
var _alarm_level := ""
func _level_mood() -> void:
	var lid := str(b.g.get("level", ""))
	if lid != _mood_level:
		_mood_level = lid
		if plant_world.scenery: plant_world.scenery.set_hour(21.0 if lid == "L00" else 15.5)
		if audio_eq: audio_eq.set_piece("shift" if lid == "L00" else "design")
	var li = b.q("levelInfo") if (b.init_data.get("queries", []) as Array).has("levelInfo") else null
	var worst := ""
	if li is Dictionary:
		for a in li.get("annunciators", []):
			var st := str(a.get("state", "off"))
			if st == "critical": worst = "critical"
			elif st == "high" and worst != "critical": worst = "high"
	if worst != _alarm_level:
		_alarm_level = worst
		if plant_world.scenery: plant_world.scenery.set_alarm(worst != "")
		if audio_eq:
			if worst == "": audio_eq.clear_alarm()
			else: audio_eq.alarm(worst)
			audio_eq.set_stress(1.0 if worst == "critical" else (0.6 if worst == "high" else 0.2))
			audio_eq.set_critical(worst == "critical")


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
		elif part.begins_with("speed="):   # QA/captures: the speed dial position 0-3 (pause, 1x, 4x, 16x), as the console sets it
			var si := clampi(int(part.substr(6)), 0, 3); b.act("setSpeed", [[0, 1, 4, 16][si]]); set_speed(si)
		elif part.begins_with("key="):
			for i in int(part.substr(4)):
				if chrome != null: chrome.turn_key()
		elif part.begins_with("li="):
			if chrome != null: chrome.qa(part.substr(3))
		elif part.begins_with("fp="): Faceplate.attach(self); Faceplate.open(self, part.substr(3))   # QA: open a faceplate
		elif part.begins_with("sel="):   # QA: select a unit as a click would (faceplate and free-port pips)
			Faceplate.attach(self); plant_world.select(part.substr(4)); plant_world.unit_clicked.emit(part.substr(4))
		elif part.begins_with("knobset="):   # QA: unit/key/display value, committed through the faceplate knob
			var f2 := part.substr(8).split("/"); Faceplate.attach(self)
			var fpl := Faceplate.open(self, f2[0]); var kn: Knob = fpl.knobs.get(f2[1])
			if kn != null: kn.set_value(float(f2[2])); kn.committed.emit(float(f2[2]))
		elif part.begins_with("bsp="): Faceplate.li_extra = {"bankSpecies": Array(part.substr(4).split(","))}   # QA: banks before the engine reports bankSpecies
		elif part == "keypad": Knob.keypad(self, "BANK FLOW", "kg/h", "140", 0.0, 3000.0, func(_v: float): pass)
		elif part.begins_with("tag="):
			var st := StreamTag.attach(self); st._pin_t = 6.0; st.show_for(part.substr(4), Vector2(vw() * 0.5, vs_h() * 0.5))
		elif part == "menu": game_menu()
		elif part == "nbclose": Notebook.close(self); Notebook.qa_hold = true   # QA: put the notebook away (screenshots of the plant and its board); F33: also the one the watcher opens after CB_CAM ran
		elif part.begins_with("incident"):   # QA (F33): "incident" or "incident=<seed>": a fresh Career (on that seed) run a month at a time until a plant incident waits on the board
			if part.begins_with("incident="): pinned_seed = int(part.substr(9)); _career_fresh(); pinned_seed = -1
			for i in 24:
				var v = b.q("levelView")
				var ic = v.get("dashboard", {}).get("incident", null) if v is Dictionary else null
				if ic is Dictionary and bool((ic as Dictionary).get("pending", false)): break
				var r: Dictionary = b.act("levelAct", ["answer", 1]) if i == 0 else {}
				if not bool(r.get("ok", false)): b.act("levelAct", ["advance", 1])
		elif part == "recorder":
			if chrome != null: chrome.open_recorder()
		elif part == "log":
			if chrome != null: chrome.intercom.open_full()
		else: cam.append(part)
	game_on_changed()
	if not cam.is_empty() and look2 != null and look2.camera(",".join(cam)): return
	if plant_world != null and not cam.is_empty(): plant_world.set_camera(",".join(cam))

func game_unhandled_key(e: InputEventKey) -> bool:
	if look2 != null and e.pressed and not e.echo and look2.key(e): return true
	if chrome != null and chrome.key(e): return true
	if plant_world == null or not e.pressed or e.echo: return false
	match e.keycode:
		KEY_Q: plant_world.rotate_view(-1); return true
		KEY_E: plant_world.rotate_view(1); return true
	return false

# --- custom chrome hooks ---
func game_build_chrome(r: Control) -> void:
	chrome = EqConsole.new(); chrome.app = self; r.add_child(chrome); chrome.build()
	chrome.rack_slot.add_child(PartsRack.build(self))
	bay = InstrumentBay.new(); bay.app = self; chrome.add_child(bay); bay.build()
	lvbay = LevelViewBay.new(); lvbay.app = self; chrome.add_child(lvbay); lvbay.build()
	chrome.notebook_requested.connect(func(): Notebook.open(self))
	look2 = Look2.new(); look2.app = self; look2.name = "Look2"; add_child(look2)
func game_chrome_visible(v: bool) -> void:
	_chrome_on = v
	if chrome != null: chrome.set_chrome_visible(v)
	if audio_eq != null: audio_eq.set_title(not v)
	if plant_world != null: plant_world.set_title(not v)   # the title layout shifts the view left; a level centres it again
	if look2 != null and b != null: look2.sync()
func game_relayout() -> void:
	if chrome != null: chrome.layout()
	if bay != null: bay.layout()
	if lvbay != null: lvbay.layout()
	if look2 != null: look2.relayout()
func game_toast(text: String, level: String) -> bool:
	if look2 != null and look2.toast(text, level): return true
	if chrome == null: return false
	chrome.toast(text, level); return true
func game_coach(step: Dictionary, index: int, total: int) -> bool:
	if chrome == null: return false
	chrome.coach(step, index, total); return true
func game_title(r: Control) -> bool: return TitleScreen.build(self, r)
## Esc with no dialog open: close one layer (stream tag, faceplates and selection, placement ghost or half-made pipe) before the pause plate opens.
## The gear button and the pad's Start still open the plate directly.
var _from_esc := false
func game_menu() -> bool:
	if _from_esc and started:
		var hub = root.get_node_or_null("PaperHub")
		if hub != null and hub.close_one(): return true
		if world != null and "placing" in world and str(world.placing) != "": world.cancel_place(); return true   # a build tool in hand is dropped before the pause plate, hub or no hub
	return PauseMenu.toggle(self)
## A level (re)start: the shift-speed latch resets so a level that opens mid-shift (L00) starts at 1x.
func _begin() -> void:
	Notebook.started.clear()
	CareerIncident.on_begin(self)   # F29: an incident level opened from the Career gets the Career plant's state BEFORE the coach and the notes read it (F31: Tomas quoted the default 80 % catalyst)
	if chrome != null: chrome.reset_shift_seen(); chrome.level_begun()
	super()
func game_end_screen() -> bool:
	if look2 != null and look2.end_screen(): return true
	if CareerBoard.review_first(self): return true   # CAREER: the last annual review is read before the result card
	sfx("printer")
	return Printout.open(self)

## A slow frame (a phone, software rendering, a busy desktop) still delivers 4 or 16 ticks every second. Two things used to break that on slow frames (F28):
## Godot clamps the `dt` it hands to _process to about 8/60 s, so a 2 s frame was credited 0.13 s (L08 at 16x measured "1.1x real"); the shell stepped one tick per bridge
## call, eight at most per frame. The ticks owed are now counted from the wall clock and run as ONE engine call of up to FF_MAX ticks (the engine's tick(n) runs the
## same n steps as n single ticks and stops at once if the level resolves, so the result is bit-identical), and the console, recorder and plant view refresh once per call.
const FF_MAX := 32
const FF_PER_FRAME := 2
var _owed := 0.0
var _wall_us := 0
func _process(dt: float) -> void:
	_autosave_design()
	_career_flush()
	var now := Time.get_ticks_usec()
	var wdt := clampf(float(now - _wall_us) / 1.0e6, 0.0, 4.0) if _wall_us > 0 else dt
	_wall_us = now
	var t0 := int(b.g.get("tick", 0)) if started and b != null else 0
	super(dt)
	if started and b != null and speed >= 2 and modal() == null and str(b.g.get("status", "playing")) == "playing":
		_owed += maxf(wdt, dt) * float([0, 1, 4, 16][clampi(speed, 0, 3)]) - float(int(b.g.get("tick", 0)) - t0)
		var n := 0
		while _owed >= 1.0 and n < FF_PER_FRAME and str(b.g.get("status", "playing")) == "playing":
			var k := mini(int(_owed), FF_MAX)
			ticks(k); _owed -= float(k); n += 1
		_owed = clampf(_owed, -2.0, float(FF_MAX))
	else: _owed = 0.0

## `k` ticks in one engine call (one snapshot back, one refresh). k = 1 is next_tick().
func ticks(k: int) -> void:
	if k <= 1: next_tick(); return
	if not started or str(b.g.get("status", "playing")) != "playing": return
	audio.play("tick")
	var r := b.act("tick", [k])
	if not r.get("ok", false): toast(str(r.get("message", "")), "bad"); return
	_claim()

## A mode this game does not have (CB_AUTOSTART=typo) is an error you can see, not a blank board.
const MODES := ["learner", "engineer", "sandbox"]
func new_game(mode: String) -> void:
	if mode == "career":   # CB_AUTOSTART=career: the Career level is a level, not a mode; the alias starts a Learner game and opens it (unless CB_LEVEL names another)
		if not OS.has_environment("CB_LEVEL"): OS.set_environment("CB_LEVEL", "CAREER")
		mode = "learner"
	if not MODES.has(mode):
		push_error("EQUILIBRIUM: unknown game mode '%s' (learner, engineer or sandbox)" % mode)
		menus.title()
		CbKit.confirm(self, "Unknown game mode '%s'. Start with one of: %s." % [mode, ", ".join(MODES)], func(): pass, "OK")
		return
	super(mode)

## Launch aliases for CB_LEVEL / the level menu: "C", "c" and "career" all name the Career level (chapter 10), so CB_LEVEL=C opens it like CB_AUTOSTART=career does.
const LEVEL_ALIAS := {"C": "CAREER", "CAREER": "CAREER"}
var _from_env := false   ## true while _run_env starts CB_LEVEL: a launch resumes the saved Career by itself (CB_NEW=1 starts a new one)
func _run_env() -> void:
	_from_env = true; super(); _from_env = false

func start_level(id: String, force := false) -> void:
	var rid: String = LEVEL_ALIAS.get(id.strip_edges().to_upper(), id)
	if rid == "CAREER" and CareerSave.enabled(self):
		var inf := CareerSave.info()
		if not inf.is_empty() and not OS.has_environment("CB_NEW"):
			if _from_env:
				if CareerSave.restore(self): return
			else:
				_career_choice(inf, force); return
		elif not inf.is_empty(): CareerSave.clear()   # CB_NEW: the old run is dropped
	super(rid, force)

func _career_resume() -> void:
	if not CareerSave.restore(self): _career_fresh()
func _career_fresh() -> void:
	CareerSave.clear(); super.start_level("CAREER", true)

## Opening the Career with a run saved: RESUME month N, or start a NEW CAREER (which drops the saved run).
func _career_choice(inf: Dictionary, force: bool) -> void:
	var d: Dictionary = dialog("career_resume", 640, 0.0, CbKit.ACC, 0.55)
	var vb: VBoxContainer = d.vb; var h: Control = d.host
	vb.add_child(CbKit.label("A CAREER IS IN PROGRESS", 24, CbKit.ACC, true))
	vb.add_child(CbKit.label("Saved run: %s." % CareerSave.label(inf), 17, CbKit.TX, true))
	var row_ := HFlowContainer.new(); row_.add_theme_constant_override("h_separation", 10); row_.add_theme_constant_override("v_separation", 8); vb.add_child(row_)
	var bres := CbKit.btn("RESUME month %d" % (int(inf.month) + 1), func(): h.queue_free(); _career_resume(), "pri", 16); bres.name = "CareerResume"; row_.add_child(bres)
	var bnew := CbKit.btn("NEW CAREER (drops the saved run)", func(): h.queue_free(); _career_fresh(), "", 16); bnew.name = "CareerNew"; row_.add_child(bnew)
	var bx := CbKit.btn("Cancel", func(): h.queue_free(), "", 16); bx.name = "CareerCancel"; row_.add_child(bx)
	focus_dialog()

## Manual step (Space, pad Y): inside a level it turns the key one position; free play and the auto-run clock still advance the engine.
func next_tick() -> void:
	if speed == 0 and chrome != null and chrome.key_available(): chrome.turn_key(); return
	super()

## Pad A acknowledges the annunciator when something is flashing and nothing else wants the button.
func _input(e: InputEvent) -> void:
	if e is InputEventKey and e.pressed and not e.echo and e.keycode == KEY_ESCAPE:
		_from_esc = true; super(e); _from_esc = false; return
	if e is InputEventJoypadButton and e.pressed and e.button_index == JOY_BUTTON_A and CbPad.enabled and started and chrome != null and modal() == null \
			and chrome.annunciator.unacked() > 0 and get_viewport().gui_get_focus_owner() == null:
		chrome.annunciator.ack(""); get_viewport().set_input_as_handled(); return
	super(e)

## Console cues without a recipe in the shell borrow one: the key clunks like a confirm, the intercom blips like a hover.
func sfx(k: String) -> void:
	if audio_eq != null and k == "ack": audio_eq.ack_alarm()   # acknowledging silences the tone; the window stays lit until it clears
	if audio_eq != null and k in EqAudio.ONE_SHOTS: audio_eq.play(k); return
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
