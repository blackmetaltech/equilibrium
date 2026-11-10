class_name TitleScreen
extends RefCounted
## The title (UI.md 9, cfg game_title -> true): the Works at dusk behind (the plant world in title mode plus a dusk grade), top-left the EQUILIBRIUM logo in
## Archivo 800 wide with a drawn balance beam that rocks and settles level, and the menu as Dymo-tape strips on an enamel plate; a teal lamp marks the focus.
## Continue shift (when a save exists) / New works, Works map, Sandbox, Settings, Quit (desktop). Keyboard / pad focus walks the strips, the mouse moves focus on
## hover, touch taps. "Works map" opens ui/works_map.gd (levels numbered 00-04 as the engine ids).

static func T(key: String) -> String: return EqStrings.T(key)

static func build(app: CbApp, root: Control) -> bool:
	EqStrings.load_strings(); EqSettings.load_all()
	var vh := app.vs_h(); var vw := app.vw()
	var k := clampf(vh / 1080.0, 0.6, 1.0)
	var compact := CbLayout.compact and vh < 700.0
	root.theme = CbKit.make_theme()
	root.add_child(_dusk(vw, vh, app))
	var box := VBoxContainer.new(); box.name = "EqTitleMenu"; box.add_theme_constant_override("separation", int(6 * k))
	box.set_anchors_preset(Control.PRESET_TOP_LEFT); box.offset_left = (56.0 if compact else 80.0 * k); box.offset_top = (14.0 if compact else 52.0 * k)
	box.offset_right = box.offset_left + minf(820.0, vw - 100.0)
	root.add_child(box)
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", int(18 * k)); head.mouse_filter = Control.MOUSE_FILTER_IGNORE; box.add_child(head)
	var beam := Beam.new(); beam.name = "Beam"; beam.custom_minimum_size = Vector2(150, 96) * (0.7 if compact else k); head.add_child(beam)
	var tcol := VBoxContainer.new(); tcol.add_theme_constant_override("separation", 0); tcol.mouse_filter = Control.MOUSE_FILTER_IGNORE; head.add_child(tcol)
	var logo := EqTheme.label(str(app.cfg.title).to_upper(), 60 if compact else int(92 * k), EqTheme.TEXT, "title"); logo.name = "logo"; logo.add_theme_color_override("font_shadow_color", Color(0, 0, 0, 0.5)); tcol.add_child(logo)
	var sub := EqTheme.label(T("TITLE_SUB"), 18 if compact else int(26 * k), EqTheme.TEAL.lightened(0.25), "sans"); sub.name = "tagline"; tcol.add_child(sub)
	var gap := Control.new(); gap.custom_minimum_size = Vector2(0, (8 if compact else 26 * k)); gap.mouse_filter = Control.MOUSE_FILTER_IGNORE; box.add_child(gap)
	var plate := PanelContainer.new(); plate.name = "Plate"; plate.size_flags_horizontal = Control.SIZE_SHRINK_BEGIN
	var sb := EqTheme.enamel_sb(6, 18.0 * k); sb.shadow_size = 16; plate.add_theme_stylebox_override("panel", sb); box.add_child(plate)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", int((5 if compact else 9) * k)); plate.add_child(vb)
	var saves: Array = app.b.q("saves") if app.b.q("saves") is Array else []
	var entries: Array = []
	WorksMap.Campaign.attach(app)   # the campaign record and the backdrop's revival follow the running game
	if saves.size() > 0: entries.append(["continue", T("TITLE_CONTINUE"), func(): continue_play(app, saves[0] as Dictionary)])
	entries.append(["new", T("TITLE_NEW"), func(): new_works(app)])
	entries.append(["map", T("TITLE_MAP"), func(): WorksMap.open(app)])
	entries.append(["sandbox", T("TITLE_SANDBOX"), func(): app.new_game("sandbox")])
	entries.append(["settings", T("TITLE_SETTINGS"), func(): app.open_settings()])
	if not CbLayout.is_mobile(): entries.append(["quit", T("TITLE_QUIT"), func(): app.quit_game()])
	var first: Strip = null
	var strips: Array = []
	for en in entries:
		var s := Strip.new(str(en[1]), 20 if compact else int(26 * k)); s.name = "Strip_" + str(en[0]); s.pressed.connect(en[2]); vb.add_child(s); strips.append(s)
		if first == null: first = s
	for i in strips.size():
		var s2: Strip = strips[i]
		s2.focus_neighbor_top = strips[(i - 1 + strips.size()) % strips.size()].get_path() if strips.size() > 1 else NodePath()
		s2.focus_neighbor_bottom = strips[(i + 1) % strips.size()].get_path() if strips.size() > 1 else NodePath()
	var cute := Strip.new(T("CUTE_ON") if EqSettings.cute else T("CUTE_OFF"), 15 if compact else int(18 * k), true); cute.name = "Strip_cute"; cute.tooltip_text = T("CUTE_HINT")
	cute.pressed.connect(func():
		EqSettings.set_cute(app, not EqSettings.cute)
		cute.set_label(T("CUTE_ON") if EqSettings.cute else T("CUTE_OFF")))
	vb.add_child(cute)
	var foot := EqTheme.label(T("TITLE_FOOT"), 15, EqTheme.DIM, "sans"); foot.name = "Foot"
	foot.set_anchors_preset(Control.PRESET_BOTTOM_RIGHT); foot.grow_horizontal = Control.GROW_DIRECTION_BEGIN; foot.grow_vertical = Control.GROW_DIRECTION_BEGIN; foot.offset_right = -20.0; foot.offset_bottom = -12.0
	root.add_child(foot)
	if first != null: _focus_later.call_deferred(first)
	return true

static func _focus_later(b: Control) -> void:
	if is_instance_valid(b) and b.is_inside_tree(): b.grab_focus()

## The dusk grade over the world: a cool sky at the top, a low amber glow at the horizon, and a left scrim for the text.
static func _dusk(vw: float, vh: float, app: CbApp) -> Control:
	var host := Control.new(); host.name = "Dusk"; host.mouse_filter = Control.MOUSE_FILTER_IGNORE; host.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	host.offset_left = -app.inset.x; host.offset_top = -app.inset.y; host.offset_right = app.inset.z; host.offset_bottom = app.inset.w
	host.add_child(_grad(Vector2(0, 0), Vector2(0, 1), [Color("#14233A", 0.55), Color("#C9733A", 0.0), Color("#E8873A", 0.28)], [0.0, 0.6, 1.0]))
	host.add_child(_grad(Vector2(0, 0), Vector2(1, 0), [Color(EqTheme.ENAMEL_LO, 0.88), Color(EqTheme.ENAMEL_LO, 0.0)], [0.0, 0.7], 0.62))
	return host

static func _grad(from: Vector2, to: Vector2, cols: Array, offs: Array, width_frac := 1.0) -> TextureRect:
	var g := Gradient.new(); g.colors = PackedColorArray(cols); g.offsets = PackedFloat32Array(offs)
	var t := GradientTexture2D.new(); t.gradient = g; t.fill_from = from; t.fill_to = to; t.width = 256; t.height = 256
	var r := TextureRect.new(); r.texture = t; r.stretch_mode = TextureRect.STRETCH_SCALE; r.expand_mode = TextureRect.EXPAND_IGNORE_SIZE; r.mouse_filter = Control.MOUSE_FILTER_IGNORE
	r.set_anchors_preset(Control.PRESET_FULL_RECT); r.anchor_right = width_frac
	return r

## Continue: the newest save, but never a finished level. A save that ends in a win (the engine autosaves on the win, and a level begun afterwards used to be
## lost if the game was left before its first tick) goes on to the next job; a lost level is run again; anything else loads as saved.
static func continue_play(app: CbApp, info: Dictionary) -> void:
	var lvl := str(info.get("level", "")) if info.get("level", null) != null else ""
	var st := str(info.get("status", "playing"))
	if lvl != "" and st == "won":
		WorksMap.Campaign.record(lvl, 1, false)   # a no-op when the stars are already known
		WorksMap.Campaign.push_world(app)
		var nxt := WorksMap.Campaign.next_after(lvl)
		if nxt != "": app.start_level(nxt, true)
		else: WorksMap.open(app)
		return
	if lvl != "" and st == "lost": app.start_level(lvl, true); return
	app.load_slot(str(info.get("slot", "main")))

## New works: the first job as a Learner (the notebook opens over the dimmed plant), or a plain new game when the engine lists no levels yet. Stars already
## won ask first: a new works puts the lights out again.
static func new_works(app: CbApp, confirmed := false) -> void:
	if not confirmed and WorksMap.Campaign.total_stars() > 0:
		CbKit.confirm(app, WorksMap.T("MAP_NEW_ASK"), func(): new_works(app, true), WorksMap.T("MAP_NEW_YES")); return
	if CbSettings.last_mode == "" or CbSettings.last_mode == "sandbox": CbSettings.last_mode = "learner"
	WorksMap.Campaign.reset(); WorksMap.Campaign.push_world(app)
	var lv: Array = app.b.levels()
	if lv.is_empty(): app.new_game(app._mode_pref()); return
	app.start_level(str((lv[0] as Dictionary).get("id", "")), true)

## One Dymo-tape menu strip: black tape with embossed white caps, and a teal indicator lamp at the left that lights on focus / hover.
class Strip extends Button:
	var dim := false
	var fsize := 26
	var cap := ""
	func _init(t := "", size := 26, is_dim := false) -> void:
		dim = is_dim; fsize = size; flat = true; focus_mode = Control.FOCUS_ALL; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		var e := StyleBoxEmpty.new()
		for s in ["normal", "hover", "pressed", "hover_pressed", "focus", "disabled"]: add_theme_stylebox_override(s, e)
		mouse_entered.connect(func(): if is_inside_tree() and not disabled: grab_focus())
		focus_entered.connect(queue_redraw); focus_exited.connect(queue_redraw)
		set_label(t)
	func set_label(t: String) -> void:
		cap = t.to_upper(); text = ""
		var f := EqStrings.font("cap"); var sz := EqTheme.fs(fsize)
		custom_minimum_size = Vector2(f.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x + 44.0 + 30.0, maxf(sz * 1.5 + 6.0, CbLayout.tap()))
		queue_redraw()
	func _draw() -> void:
		var f := EqStrings.font("cap"); var sz := EqTheme.fs(fsize)
		var lit := has_focus() or is_hovered()
		var c := Vector2(14, size.y * 0.5)
		draw_circle(c, 8.0, Color("#0B1413")); draw_circle(c, 6.0, EqTheme.TEAL if lit else EqTheme.TEAL.darkened(0.8))
		if lit: draw_circle(c, 12.0, Color(EqTheme.TEAL, 0.22)); draw_circle(c + Vector2(-1.5, -1.5), 1.8, Color(1, 1, 1, 0.8))
		var tw := f.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, sz).x
		var tape := Rect2(34, size.y * 0.5 - (sz * 0.75 + 3.0), tw + 24.0, sz * 1.5 + 6.0)
		var tcol := Color("#1E1E1E") if dim else EqTheme.DYMO_TAPE
		draw_rect(tape, tcol); draw_rect(Rect2(tape.position.x, tape.end.y - 1.0, tape.size.x, 1.0), Color(1, 1, 1, 0.1))
		if lit: draw_rect(tape, EqTheme.TEAL, false, 2.0)
		var y := tape.position.y + tape.size.y * 0.5 + sz * 0.34
		draw_string(f, Vector2(tape.position.x + 12.0 + 1.0, y + 1.0), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, Color(0, 0, 0, 0.9))      # emboss: dark offset, then the light letters
		draw_string(f, Vector2(tape.position.x + 12.0, y), cap, HORIZONTAL_ALIGNMENT_LEFT, -1, sz, (EqTheme.DYMO_TEXT * Color(1, 1, 1, 0.7)) if dim else EqTheme.DYMO_TEXT)

## The balance-beam logo: a beam on a fulcrum with two pans. It rocks (damped), settles level and the lock lamp lights; it is kicked again every few seconds.
class Beam extends Control:
	var t := 0.0
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func angle() -> float:
		var c := fmod(t, 9.0)
		return 0.34 * exp(-c * 0.62) * cos(c * 4.2) if not CbSettings.reduced_motion else 0.0
	func _process(dt: float) -> void: t += dt; queue_redraw()
	func _draw() -> void:
		var a := angle()
		var c := Vector2(size.x * 0.5, size.y * 0.42)
		var armw := size.x * 0.46
		var base := PackedVector2Array([c + Vector2(0, 2), c + Vector2(-size.x * 0.12, size.y * 0.58), c + Vector2(size.x * 0.12, size.y * 0.58)])
		draw_colored_polygon(base, EqTheme.ENAMEL_HI); draw_polyline(PackedVector2Array([base[1], base[0], base[2]]), Color("#0B1413"), 2.0)
		draw_rect(Rect2(c.x - size.x * 0.2, c.y + size.y * 0.58 - 1, size.x * 0.4, 5), EqTheme.ENAMEL_HI)
		var d := Vector2(cos(a), sin(a)) * armw
		var l := c - d; var r := c + d
		draw_line(l, r, EqTheme.TEXT, 5.0)
		draw_circle(c, 6.5, EqTheme.TEXT); draw_circle(c, 3.0, EqTheme.ENAMEL_LO)
		var drop := size.y * 0.3
		for p in [l, r]:
			var pn: Vector2 = p + Vector2(0, drop)
			draw_line(p, pn + Vector2(-14, 0), EqTheme.DIM, 1.5); draw_line(p, pn + Vector2(14, 0), EqTheme.DIM, 1.5)
			draw_arc(pn + Vector2(0, -2), 16.0, 0.0, PI, 16, EqTheme.TEXT, 3.0)
		draw_circle(l + Vector2(-5, drop - 9), 6.0, EqTheme.species("N2").lightened(0.2)); draw_circle(l + Vector2(6, drop - 7), 4.0, EqTheme.species("H2"))
		draw_circle(r + Vector2(0, drop - 9), 6.0, EqTheme.species("NH3"))
		var lock := absf(a) < 0.015
		draw_circle(c + Vector2(0, -16), 4.0, EqTheme.TEAL if lock else EqTheme.TEAL.darkened(0.8))
		if lock: draw_circle(c + Vector2(0, -16), 9.0, Color(EqTheme.TEAL, 0.25))
