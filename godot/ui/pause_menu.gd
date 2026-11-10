class_name PauseMenu
extends RefCounted
## The pause menu (cfg game_menu -> true): an enamel plate with Dymo-tape strips as plain lines (not a grid of bordered buttons): Resume, Restart job,
## Notebook, Settings, Works map, Title; and the Cute mode switch (persisted in user://eq_settings.cfg, read through `EqSettings.cute`).
## Esc toggles it (the shell's modal discipline: the host is `app.menu_ui`, so Esc / pad B / Android Back close it).

static func T(key: String) -> String: return EqStrings.T(key)

static func toggle(app: CbApp) -> bool:
	if app.menu_ui != null and is_instance_valid(app.menu_ui): app.menus.close_menu(); return true
	EqStrings.load_strings(); EqSettings.load_all()
	app.get_viewport().gui_release_focus()
	var compact := CbLayout.compact and app.vs_h() < 700.0
	var d: Dictionary = app.dialog("menu", 460.0, 0.0, EqTheme.ENAMEL_HI, 0.55)
	app.menu_ui = d.host
	var panel: PanelContainer = d.panel
	panel.add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 20.0 if not compact else 12.0))
	var vb: VBoxContainer = d.vb; vb.add_theme_constant_override("separation", 4 if compact else 8)
	var title := EqTheme.label(T("PAUSE_TITLE").to_upper(), 34 if compact else 44, EqTheme.TEXT, "title"); title.name = "Title"; vb.add_child(title)
	var li = app.b.q("levelInfo") if app.started and (app.b.init_data.get("queries", []) as Array).has("levelInfo") else null
	var in_level: bool = li is Dictionary and li.has("id") and li.get("active", true) != false
	var entries: Array = [["resume", "PAUSE_RESUME", func(): app.menus.close_menu()]]
	if app.started: entries.append(["restart", "PAUSE_RESTART", func(): app.menus.close_menu(); _restart(app)])
	if in_level and app.get("chrome") != null: entries.append(["notebook", "PAUSE_NOTEBOOK", func(): app.menus.close_menu(); app.chrome.notebook_requested.emit()])
	entries.append(["settings", "PAUSE_SETTINGS", func(): app.menus.close_menu(); app.open_settings()])
	entries.append(["map", "PAUSE_MAP", func(): app.menus.close_menu(); WorksMap.open(app)])
	entries.append(["title", "PAUSE_TITLE_BTN", func(): app.menus.close_menu(); app.to_title()])
	var first: Button = null
	var strips: Array = []
	for en in entries:
		var s := TitleScreen.Strip.new(T(str(en[1])), 20 if compact else 24); s.name = "Strip_" + str(en[0]); s.pressed.connect(en[2]); vb.add_child(s); strips.append(s)
		if first == null: first = s
	for i in strips.size():
		var s2: Button = strips[i]
		s2.focus_neighbor_top = strips[(i - 1 + strips.size()) % strips.size()].get_path(); s2.focus_neighbor_bottom = strips[(i + 1) % strips.size()].get_path()
	vb.add_child(HSeparator.new())
	vb.add_child(cute_toggle(app))
	app.audio.play("open")
	if CbKit.pad_mode: first.call_deferred("grab_focus")   # no focus until asked: a lone Space must not press Resume under the keyboard
	app.focus_dialog()
	return true

static func _restart(app: CbApp) -> void:
	var li = app.b.q("levelInfo") if app.started and (app.b.init_data.get("queries", []) as Array).has("levelInfo") else null
	if li is Dictionary and li.has("id"): app.start_level(str(li.id), true)
	else: app.new_game(app._mode_pref())

## The Cute mode row (also usable elsewhere): a dim Dymo strip that reads "Cute mode: on / off".
static func cute_toggle(app: CbApp) -> Button:
	var s := TitleScreen.Strip.new(T("CUTE_ON") if EqSettings.cute else T("CUTE_OFF"), 18, true); s.name = "Strip_cute"; s.tooltip_text = T("CUTE_HINT")
	s.pressed.connect(func():
		EqSettings.set_cute(app, not EqSettings.cute)
		s.set_label(T("CUTE_ON") if EqSettings.cute else T("CUTE_OFF")))
	return s
