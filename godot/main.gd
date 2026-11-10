extends CbApp
## EQUILIBRIUM front-end. Everything else (title, top bar, dock, drawers over the world, toasts, settings, codex, saves, coach, pad,
## touch, env hooks, smoke) comes from CbApp in addons/cobanana. This file only says what is specific to the game.
## All text is tr() from locales/strings.csv, or region-pack data from the engine.
var plant_world: PlantWorld

func game_config() -> Dictionary:
	return {
		"title": str(ProjectSettings.get_setting("application/config/name", "EQUILIBRIUM")),
		"tagline": tr("EQ_TAGLINE"),
		"blurb": tr("EQ_BLURB"),
		"accent": Color("#2EC4B6"), "accent2": Color("#FFB703"),
		"modes": [["learner", tr("MODE_LEARNER"), tr("MODE_LEARNER_DESC")], ["engineer", tr("MODE_ENGINEER"), tr("MODE_ENGINEER_DESC")], ["sandbox", tr("MODE_SANDBOX"), tr("MODE_SANDBOX_DESC")]],
		"dock": [["plant", tr("DOCK_PLANT"), Color("#2EC4B6"), tr("DOCK_PLANT")], ["codex", tr("DOCK_CODEX"), Color("#9fb4c8"), tr("DOCK_CODEX")]],
		"screens": {"plant": "res://screens/plant.gd"},
		"overlay": ["plant"], "full": ["codex"],
		"tick_label": tr("TICK_BUTTON"), "tick_seconds": [0.0, 1.0, 0.5, 0.25],
		"keys": [[tr("KEY_ROTATE"), tr("KEY_ROTATE_DESC")], [tr("KEY_WHEEL"), tr("KEY_WHEEL_DESC")], [tr("KEY_PAN"), tr("KEY_PAN_DESC")], ["1-2", tr("KEY_DOCK_DESC")]],
	}

func game_build_world(parent: Node) -> Node:
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
	return [
		{"id": "plot", "kind": "read", "title": tr("COACH_PLOT_TITLE"), "body": tr("COACH_PLOT_BODY"), "why": tr("COACH_PLOT_WHY")},
		{"id": "plant", "kind": "visit", "key": "plant", "target": "dock:plant", "title": tr("COACH_PLANT_TITLE"), "body": tr("COACH_PLANT_BODY"), "why": tr("COACH_PLANT_WHY")},
	]

func game_camera(spec: String) -> void:
	if plant_world != null: plant_world.set_camera(spec)

func game_unhandled_key(e: InputEventKey) -> bool:
	if plant_world == null or not e.pressed or e.echo: return false
	match e.keycode:
		KEY_Q: plant_world.rotate_view(-1); return true
		KEY_E: plant_world.rotate_view(1); return true
	return false

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
	show_screen("plant"); await get_tree().process_frame
	show_screen(home); await get_tree().process_frame
