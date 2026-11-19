class_name PartsRack
extends HBoxContainer
## The P&ID parts rack: enamel tiles with the unit's ISO 10628 symbol, a Dymo name, the price and count pips. Pick a tile (click, keys 1-9, pad LB/RB + A) and
## the world shows the placement ghost; click the plot to place (`placeUnit`). `PartsRack.build(app)` returns the Control for the console's rack slot and
## wires the paper layer once (faceplates, piping, stream tags, notebook watcher).
var app = null
var tiles: Array = []
var _scroll: ScrollContainer
var _row: Container
var _focus := 0
var _sig := ""
var _tsig := ""
const TILE := Vector2(100, 112)

class Tile extends Control:
	signal picked(type: String)
	var type := ""
	var label := ""
	var price: Variant = null
	var count := 0
	var limit: Variant = null
	var available := true
	var hint := ""
	var selected := false
	var focused := false
	var coach := false      ## the coach points here: a pulsing teal ring
	var need := false       ## the level cannot be read without this part (levelInfo.notice NEEDS_UNIT): an amber chevron bobs on the tile
	var _hover := false
	func _init() -> void: custom_minimum_size = PartsRack.TILE; mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND; focus_mode = Control.FOCUS_ALL
	var _press := Vector2(-1, -1)
	func _gui_input(e: InputEvent) -> void:
		if CbLayout.phone and e is InputEventMouseButton and e.button_index == MOUSE_BUTTON_LEFT:
			# a finger: the tile is chosen on lift, and only if the finger did not travel (a drag scrolls the drawer)
			if e.pressed: _press = e.position; accept_event()
			else:
				if _press.x >= 0.0 and e.position.distance_to(_press) < 18.0: picked.emit(type)
				_press = Vector2(-1, -1); accept_event()
		elif e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: grab_focus(); picked.emit(type); accept_event()
		elif e is InputEventMouseMotion: pass
		elif e.is_action_pressed("ui_accept"): picked.emit(type); accept_event()
	func _notification(w: int) -> void:
		if w == NOTIFICATION_MOUSE_ENTER: _hover = true; queue_redraw()
		elif w == NOTIFICATION_MOUSE_EXIT: _hover = false; queue_redraw()
		elif w == NOTIFICATION_FOCUS_ENTER or w == NOTIFICATION_FOCUS_EXIT: queue_redraw()
	func _draw() -> void:
		var r := Rect2(Vector2.ZERO, size)
		var bg := EqTheme.ENAMEL_HI if not _hover else EqTheme.ENAMEL_HI.lightened(0.1)
		if selected: bg = EqTheme.ENAMEL_HI.lerp(EqTheme.TEAL, 0.25)
		draw_rect(r.grow(-1), bg); draw_rect(Rect2(1, 1, size.x - 2, 2), Color(1, 1, 1, 0.18))
		draw_rect(r.grow(-1), EqTheme.TEAL if (selected or has_focus() or focused) else EqTheme.ENAMEL_LO, false, 3.0 if (selected or has_focus() or focused) else 1.5)
		if coach:
			var a := 0.45 + 0.45 * sin(Time.get_ticks_msec() * 0.006)
			draw_rect(r.grow(2), Color(EqTheme.TEAL, a), false, 4.0)
			queue_redraw()
		if need:
			var bob := 3.0 * sin(Time.get_ticks_msec() * 0.008); var cx := size.x * 0.5
			draw_colored_polygon(PackedVector2Array([Vector2(cx - 11.0, 4.0 + bob), Vector2(cx + 11.0, 4.0 + bob), Vector2(cx, 20.0 + bob)]), EqTheme.AMBER)
			draw_polyline(PackedVector2Array([Vector2(cx - 11.0, 4.0 + bob), Vector2(cx + 11.0, 4.0 + bob), Vector2(cx, 20.0 + bob), Vector2(cx - 11.0, 4.0 + bob)]), EqTheme.INK, 1.5)
			queue_redraw()
		var col := EqTheme.TEXT if available else EqTheme.DIM.darkened(0.2)
		PidSymbols.draw(self, type, Rect2(8, 8, size.x - 16, size.y - 54), col, EqTheme.AMBER if available else col)
		# Dymo name
		var lf := EqTheme.font("dymo"); var ls := EqTheme.fs(13); var lt := label.to_upper()
		while ls > 8 and lf.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x + 10.0 > size.x - 8.0: ls -= 1   # a long name steps its type down until the whole word fits the tape
		var lw := minf(lf.get_string_size(lt, HORIZONTAL_ALIGNMENT_LEFT, -1, ls).x + 10.0, size.x - 8.0)
		var lr := Rect2((size.x - lw) * 0.5, size.y - 40.0, lw, 17.0)
		draw_rect(lr, EqTheme.DYMO_TAPE); draw_string(lf, lr.position + Vector2(5, 13), lt, HORIZONTAL_ALIGNMENT_LEFT, lw - 6.0, ls, EqTheme.DYMO_TEXT)
		# price and pips
		var mf := EqTheme.font("mono"); var ms := EqTheme.fs(13)
		var ptxt := ("$" + CbKit.num(float(price), 0)) if price != null else ""
		draw_string(mf, Vector2(6, size.y - 7), ptxt, HORIZONTAL_ALIGNMENT_LEFT, size.x * 0.65, ms, EqTheme.TEXT if available else EqTheme.DIM)
		if limit != null:
			var n := mini(int(limit), 6)
			for i in range(n):
				var c := Vector2(size.x - 8.0 - (n - 1 - i) * 9.0, size.y - 13.0)
				draw_circle(c, 3.5, EqTheme.AMBER if i < count else EqTheme.ENAMEL_LO); draw_arc(c, 3.5, 0, TAU, 12, EqTheme.DIM, 1.0)
		if not available and limit != null and count >= int(limit):   # every allowed one is on the sheet (a pre-placed unit too): greyed, and it says so
			var cap := PaperStrings.t("RACK_ONSITE") if int(limit) == 1 else PaperStrings.t("RACK_LIMIT") % int(limit)
			var cs := EqTheme.fs(11)
			while cs > 7 and mf.get_string_size(cap, HORIZONTAL_ALIGNMENT_LEFT, -1, cs).x > size.x - 12.0: cs -= 1
			draw_rect(Rect2(3, size.y * 0.34, size.x - 6, 17), Color(0, 0, 0, 0.62))
			draw_string(mf, Vector2(3, size.y * 0.34 + 13.0), cap, HORIZONTAL_ALIGNMENT_CENTER, size.x - 6.0, cs, EqTheme.TEXT.darkened(0.15))
		if hint != "":
			draw_string(mf, Vector2(5, 14), hint, HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(13), EqTheme.TEXT.darkened(0.2))

static func build(app) -> Control:
	var rack := PartsRack.new(); rack.app = app
	Faceplate.attach(app)
	Notebook.attach(app)
	return rack

func _init() -> void:
	name = "PartsRack"; add_theme_constant_override("separation", 6); size_flags_horizontal = Control.SIZE_EXPAND_FILL; custom_minimum_size = Vector2(0, TILE.y + 6)
	_scroll = ScrollContainer.new(); _scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	_scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO; _scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; add_child(_scroll)
	_row = HBoxContainer.new(); _row.add_theme_constant_override("separation", 6); _scroll.add_child(_row)

var flow := false
## Phone drawer: tiles wrap into rows (a HFlowContainer) instead of one strip.
func set_flow(on: bool) -> void:
	if on == flow or _row == null: return
	flow = on
	var nr: Container = HFlowContainer.new() if on else HBoxContainer.new()
	nr.add_theme_constant_override("separation", 6); nr.add_theme_constant_override("h_separation", 6); nr.add_theme_constant_override("v_separation", 6)
	nr.size_flags_horizontal = Control.SIZE_EXPAND_FILL if on else Control.SIZE_FILL
	for t in tiles: if is_instance_valid(t) and t.get_parent() != null: t.reparent(nr, false)
	var par := _row.get_parent(); var idx := _row.get_index()
	par.add_child(nr); par.move_child(nr, idx); _row.queue_free(); _row = nr
	size_flags_horizontal = Control.SIZE_EXPAND_FILL if on else Control.SIZE_FILL
	if on: custom_minimum_size = Vector2(0, 0)
	else: custom_minimum_size = Vector2(0, TILE.y + 6)

func _ready() -> void:
	var n := get_parent()   # inside a scrolling slot (the console's rack strip) the tiles flow at full width and the slot scrolls
	while n != null:
		if n is ScrollContainer: _row.reparent(self); _scroll.queue_free(); _scroll = null; size_flags_horizontal = Control.SIZE_FILL; break
		n = n.get_parent()
	if app != null and app.b != null: app.b.changed.connect(refresh)
	refresh()

func _process(_dt: float) -> void:
	var placing: String = app.world.placing if app != null and app.world != null and "placing" in app.world else ""
	for t in tiles:
		var s: bool = (t as Tile).type == placing and placing != ""
		if s != (t as Tile).selected: (t as Tile).selected = s; (t as Tile).queue_redraw()

func refresh() -> void:
	if app == null: return
	var pal = PaperStrings.q(app, "palette")
	var li = PaperStrings.q(app, "levelInfo")
	var prices := {}
	if li is Dictionary:
		for a in li.get("allowedUnits", []): prices[str(a.type)] = a.get("priceUSD")
	var items: Array = []
	for c in (pal.get("cats", []) if pal is Dictionary else []):
		for it in c.items:
			if it.available or str(it.why) == "err.place.limit": items.append(it)
	var sig := JSON.stringify(items.map(func(i): return [i.type, i.count, i.available])) + JSON.stringify(prices)
	if sig == _sig: return
	_sig = sig
	# the same parts in the same order (only counts, prices or availability moved): update the tiles in place, so a placement never rebuilds the tile
	# under the next click (a freed tile eats the first press) and keyboard focus stays where it was
	var tsig := JSON.stringify(items.map(func(i): return i.type))
	if tsig == _tsig and tiles.size() == items.size() and not tiles.is_empty():
		for i in items.size():
			var it2: Dictionary = items[i]; var t2: Tile = tiles[i]
			t2.price = prices.get(str(it2.type)); t2.count = int(it2.count); t2.limit = it2.limit; t2.available = bool(it2.available); t2.queue_redraw()
		return
	_tsig = tsig
	for c in _row.get_children(): c.queue_free()
	tiles.clear()
	for i in items.size():
		var it: Dictionary = items[i]
		var t := Tile.new(); t.type = str(it.type); t.label = PaperStrings.short(str(it.type), str(it.label)); t.price = prices.get(str(it.type)); t.count = int(it.count); t.limit = it.limit; t.available = bool(it.available)
		t.hint = str(i + 1) if i < 9 else ""
		t.name = "Tile_" + t.type
		t.picked.connect(pick); _row.add_child(t); tiles.append(t)
	_focus = clampi(_focus, 0, maxi(tiles.size() - 1, 0))

## Choose a tile: the world shows the ghost. Unavailable tiles say why through the intercom.
func pick(type: String) -> void:
	for t in tiles:
		if (t as Tile).type == type:
			if not (t as Tile).available: app.toast(PaperStrings.t("RACK_LIMIT1") if int((t as Tile).limit) == 1 else PaperStrings.t("RACK_LIMIT") % int((t as Tile).limit), "info"); return
	if app.world == null: return
	if app.world.placing == type: app.world.cancel_place(); return
	app.world.begin_place(type)
	app.sfx("click") if app.has_method("sfx") else null
	if CbLayout.phone and app.get("chrome") != null: app.chrome.close_rack()

func pick_index(i: int) -> void:
	if i >= 0 and i < tiles.size(): pick((tiles[i] as Tile).type)

func _unhandled_key_input(e: InputEvent) -> void:
	if not (e is InputEventKey) or not e.pressed or e.echo or not is_visible_in_tree(): return
	if app == null or app.modal() != null or not app.started: return
	var f := get_viewport().gui_get_focus_owner()
	if f is LineEdit or f is TextEdit or f is SpinBox or f is OptionButton: return   # digits belong to a field that has focus (a Knob takes focus on a click but never reads a digit: a number key after a knob tweak must still pick the tile)
	if app.root.get_node_or_null("keypad") != null: return
	if e.keycode >= KEY_1 and e.keycode <= KEY_9 and not (e.ctrl_pressed or e.alt_pressed):
		pick_index(e.keycode - KEY_1); get_viewport().set_input_as_handled()

func _input(e: InputEvent) -> void:
	if not (e is InputEventJoypadButton) or not e.pressed or not CbPad.enabled or not is_visible_in_tree() or tiles.is_empty(): return
	if app.modal() != null or app.world == null: return
	match e.button_index:
		JOY_BUTTON_LEFT_SHOULDER: _focus = posmod(_focus - 1, tiles.size()); _show_focus()
		JOY_BUTTON_RIGHT_SHOULDER: _focus = posmod(_focus + 1, tiles.size()); _show_focus()
		JOY_BUTTON_A: if app.world.placing == "": pick_index(_focus)

func _show_focus() -> void:
	for i in tiles.size(): (tiles[i] as Tile).focused = i == _focus; (tiles[i] as Tile).queue_redraw()
	if _scroll != null: _scroll.ensure_control_visible(tiles[_focus])
	elif tiles[_focus].get_parent() != null:
		var sc := get_parent()
		while sc != null and not (sc is ScrollContainer): sc = sc.get_parent()
		if sc != null: (sc as ScrollContainer).ensure_control_visible(tiles[_focus])

# ---- gallery (CB_CAM=ui:<what>): builds a small plant and shows one piece of the paper layer, for screenshots ------------------------
static func gallery(app, what: String) -> void:
	await app.get_tree().create_timer(0.6).timeout
	var rack: PartsRack = app.root.find_child("PartsRack", true, false)
	var ch = app.get("chrome") if "chrome" in app else null
	if rack == null and ch != null and ch.get("rack_slot") != null:   # the console's rack slot
		rack = PartsRack.build(app) as PartsRack; ch.rack_slot.add_child(rack)
	if rack == null:   # no console yet: stand the rack on its own enamel strip along the bottom
		var strip := PanelContainer.new(); strip.name = "RackStrip"; strip.add_theme_stylebox_override("panel", EqTheme.enamel_sb(4, 8.0))
		strip.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE); strip.offset_top = -138.0; strip.mouse_filter = Control.MOUSE_FILTER_PASS
		app.root.add_child(strip); rack = PartsRack.build(app) as PartsRack; strip.add_child(rack)
	else: PartsRack.build(app)
	Faceplate.attach(app)
	var units = PaperStrings.q(app, "plant")
	if what in ["faceplate", "tag", "pipe"] and (units.get("units", []) as Array).is_empty():
		app.b.act("setSpecies", [["N2", "H2", "NH3"]])
		var f: Dictionary = app.b.act("placeUnit", ["feed", 3, 6]); var h: Dictionary = app.b.act("placeUnit", ["heater", 8, 6]); var p: Dictionary = app.b.act("placeUnit", ["product", 13, 6])
		var pt := func(id: String, k: String) -> String: return str(PaperStrings.q(app, "unitCard", [id])[k][0].port)
		app.b.act("connect", [f.get("id", ""), pt.call(f.get("id", ""), "outlets"), h.get("id", ""), pt.call(h.get("id", ""), "inlets")]); app.b.act("connect", [h.get("id", ""), pt.call(h.get("id", ""), "outlets"), p.get("id", ""), pt.call(p.get("id", ""), "inlets")])
		app.b.act("commission", [])
		units = PaperStrings.q(app, "plant")
	await app.get_tree().process_frame
	match what:
		"rack": app.world.begin_place("heater"); app.world._cursor = Vector2i(10, 8); app.world._update_ghost()
		"faceplate":
			var us: Array = units.get("units", [])
			if us.size() > 1: app.world.select(str(us[1].id)); Faceplate.open(app, str(us[1].id)); Faceplate.open(app, str(us[0].id))
		"tag":
			var ss: Array = units.get("streams", [])
			if not ss.is_empty(): StreamTag.attach(app).show_for(str(ss[0].id), Vector2(app.get_viewport().get_visible_rect().size * 0.5)); (app.root.get_node("StreamTag") as StreamTag)._pin_t = 60.0
		"notebook": Notebook.stub = Notebook.stub_info() if Notebook.stub.is_empty() else Notebook.stub; Notebook.open(app)
		"pass": Notebook.stub = Notebook.stub_info() if Notebook.stub.is_empty() else Notebook.stub; Printout.stub = Notebook.result_stub(true) if Printout.stub.is_empty() else Printout.stub; Printout.open(app)
		"fail": Notebook.stub = Notebook.stub_info() if Notebook.stub.is_empty() else Notebook.stub; Printout.stub = Notebook.result_stub(false); Printout.open(app)

## The level cannot be read without this part: its tile wears a chevron until it is placed ("" clears).
func set_need(type: String) -> void:
	for t in tiles:
		if t is Tile:
			var on: bool = type != "" and (t as Tile).type == type
			if (t as Tile).need != on: (t as Tile).need = on; (t as Tile).queue_redraw()

## The coach points at a part: its tile pulses until the coach moves on ("" clears).
func set_coach(type: String) -> void:
	for t in tiles:
		if t is Tile:
			var on: bool = (t as Tile).type == type
			if (t as Tile).coach != on: (t as Tile).coach = on; (t as Tile).queue_redraw()
