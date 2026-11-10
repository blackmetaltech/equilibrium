class_name WorksMap
extends RefCounted
## The Works map: the job list as porcelain cards. Numbered by the engine's level ids ("L00" -> "00 · Night Shift"), not by list position.

static func number(id: String) -> String: return id.trim_prefix("L").trim_prefix("l")

static func open(app: CbApp) -> void:
	var old = app.root.get_node_or_null("levels")
	if old != null: return
	var d: Dictionary = app.dialog("levels", minf(760.0, app.vw() - 40.0), minf(620.0, app.vs_h() - 40.0), EqTheme.ENAMEL_HI, 0.55)
	var host: Control = d.host; var vb: VBoxContainer = d.vb
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 18.0))
	vb.add_theme_constant_override("separation", 8)
	var hb := HBoxContainer.new(); vb.add_child(hb)
	var t := EqTheme.label(EqStrings.T("TITLE_MAP").to_upper(), 30, EqTheme.TEXT, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(t)
	var sc := ScrollContainer.new(); sc.name = "List"; sc.size_flags_vertical = Control.SIZE_EXPAND_FILL; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; vb.add_child(sc)
	var list := VBoxContainer.new(); list.add_theme_constant_override("separation", 8); list.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(list)
	var first := true
	for lv in app.b.levels():
		var id := str((lv as Dictionary).id)
		var label := "%s · %s" % [number(id), str(lv.title).to_upper()]
		var brief := str(lv.get("brief", ""))
		var bt := EqTheme.key_button(label + ("\n" + brief if brief != "" else ""), first, 17)
		bt.name = "Level_" + id; bt.alignment = HORIZONTAL_ALIGNMENT_LEFT; bt.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bt.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bt.custom_minimum_size = Vector2(0, 76)
		bt.pressed.connect(func(): host.queue_free(); app.start_level(id, true))
		list.add_child(bt); first = false
	var x := EqTheme.key_button(EqStrings.T("REC_CLOSE"), false, 16); x.name = "Close"; x.pressed.connect(func(): host.queue_free()); vb.add_child(x)
	app.focus_dialog()
