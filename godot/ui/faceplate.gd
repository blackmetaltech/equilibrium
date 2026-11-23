class_name Faceplate
extends PanelContainer
## A 1970s controller faceplate for one unit: ISA tag + Dymo name, a vertical PV bar with the SP marker, a Bakelite knob for every editable parameter of
## `unitCard`, mono readouts and Why? / Lens / Window. Every number is the engine's (unitCard, stream); nothing is computed here but unit display conversion.
## Also holds the piping hub (`Faceplate.attach(app)`): select a unit -> its free ports light; click an outlet then a lit inlet -> `connect`.
static var plates := {}              # unit id -> Faceplate
var app = null
var unit_id := ""
var pinned := false
var card: Dictionary = {}
var readouts := {}                   # key -> {text, si, unit, cap}  (what is printed; the truth test compares it with the engine)
var knobs := {}                      # param key -> Knob
var _sig := ""
var _pv: PvBar
var _cells := {}                     # readout key -> [caption Label, value Label]
var _need: Label
var _title: HBoxContainer
var _pin: Button
var _why: Button
var _lens: Button
var _win: Button
var _knob_box: GridContainer
var _body: VBoxContainer
var _scroll: ScrollContainer         # phone: everything under the header scrolls so the plate fits above the console
var _head_box: HBoxContainer
var _outer: VBoxContainer
var _foot: HBoxContainer
var _last_pos := Vector2(-1, -1)
var _dock_pos := Vector2(-1, -1)     # where the plate docked (the side column); kept until the screen changes or a bay would cover it
var _dock_vr := Vector2.ZERO
var _order := 0
var _warn: Label
var _last: Label
var _all: Button
var _uncovered := false
var _cmd := {}                       # knob key -> SI value commanded during a shift (the ramp target; shown as SP until the plant gets there)
var _bank := false                   # a cylinder bank (L01 / L04): species chips and one kg/h knob
var _bank_sp: Array = []             # the species a bank can carry (levelInfo.bankSpecies)
var _chips := {}                     # species -> Button
var _bank_kg: Knob
var _kmol_lbl: Label
var _carry_lbl: Label
var _name_lbl: Label                 # the Dymo name under the tag (a bank's follows its species chip)
var _level_id := ""                  # the level this plate was opened in: a level change closes it
var _trash: Button
var _pad_hint: Label
var _rc_grid: GridContainer          # the result temperatures of the unit (unitCard.resultsC), one cell each
var _why_card: PanelContainer
var _cat_box: VBoxContainer
var _boxes: Array = []
var _cat_note: Label
var _cat_all: Button                ## F25: "apply catalyst and charge to all beds" (shown when another unit of this type exists and this one has a catalyst)
static var _seq := 0
const MAX_PLATES := 2

## The bin key-cap: Delete this unit (drawn, no font carries a bin glyph everywhere).
class TrashButton extends Button:
	func _init() -> void:
		name = "Trash"; focus_mode = Control.FOCUS_NONE; custom_minimum_size = Vector2(30, 28); tooltip_text = "Delete (Del)"
		for st in ["normal", "hover", "pressed", "disabled"]:
			var sb := EqTheme.key_sb(false, st); sb.content_margin_left = 5; sb.content_margin_right = 5; sb.content_margin_top = 1; sb.content_margin_bottom = 1; add_theme_stylebox_override(st, sb)
	func _draw() -> void:
		var c := size * 0.5 + Vector2(0, -1.0); var col := EqTheme.RED
		draw_rect(Rect2(c.x - 6.0, c.y - 3.0, 12.0, 11.0), col, false, 2.0)
		draw_line(Vector2(c.x - 8.0, c.y - 5.0), Vector2(c.x + 8.0, c.y - 5.0), col, 2.0)
		draw_rect(Rect2(c.x - 2.5, c.y - 8.0, 5.0, 3.0), col, false, 1.5)
		draw_line(Vector2(c.x - 2.0, c.y - 0.5), Vector2(c.x - 2.0, c.y + 5.0), col, 1.5); draw_line(Vector2(c.x + 2.0, c.y - 0.5), Vector2(c.x + 2.0, c.y + 5.0), col, 1.5)

# ---- the PV bar --------------------------------------------------------------------------------------------------------------
class PvBar extends Control:
	var pv := NAN
	var sp := NAN
	var lo := 0.0
	var hi := 1.0
	var sp_label := "SP"
	func _init() -> void: custom_minimum_size = Vector2(40, 170); mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var x0 := 14.0; var w := 16.0; var top := 16.0; var bot := size.y - 18.0; var h := bot - top
		draw_rect(Rect2(x0, top, w, h), EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.82)); draw_rect(Rect2(x0, top, w, h), EqTheme.INK, false, 1.5)
		for i in range(0, 11):
			var y := bot - h * i / 10.0
			draw_line(Vector2(x0 + w, y), Vector2(x0 + w + (6.0 if i % 5 == 0 else 3.0), y), EqTheme.INK, 1.0)
		if is_finite(pv):
			var f := clampf((pv - lo) / maxf(hi - lo, 1e-12), 0.0, 1.0)
			draw_rect(Rect2(x0 + 1.5, bot - h * f, w - 3.0, h * f), EqTheme.TEAL)
		if is_finite(sp):
			var fs := clampf((sp - lo) / maxf(hi - lo, 1e-12), 0.0, 1.0); var y := bot - h * fs
			draw_line(Vector2(x0 - 6.0, y), Vector2(x0 + w + 2.0, y), EqTheme.RED, 2.0, true)
			draw_colored_polygon(PackedVector2Array([Vector2(x0 - 10.0, y - 5.0), Vector2(x0 - 10.0, y + 5.0), Vector2(x0 - 2.0, y)]), EqTheme.RED)
		var f2 := EqTheme.font("dymo"); var s := EqTheme.fs(12)
		EqTheme.ds(self, f2, Vector2(2, 12), "PV", HORIZONTAL_ALIGNMENT_LEFT, -1, s, EqTheme.INK)
		EqTheme.ds(self, f2, Vector2(2, size.y - 4.0), sp_label, HORIZONTAL_ALIGNMENT_LEFT, -1, s, EqTheme.RED)

# ---- opening / attaching -----------------------------------------------------------------------------------------------------
static func open(app, id: String) -> Faceplate:
	var old = plates.get(id)
	if old != null and is_instance_valid(old): (old as Faceplate).refresh(); return old
	var fp := Faceplate.new(); fp.app = app; fp.unit_id = id; _seq += 1; fp._order = _seq
	while plates.size() >= MAX_PLATES:   # the two-plate rule: the oldest unpinned goes (else the oldest)
		var victim := ""
		for k in plates: if not (plates[k] as Faceplate).pinned: victim = k; break
		if victim == "": victim = plates.keys()[0]
		(plates[victim] as Faceplate).close()
	plates[id] = fp
	app.root.add_child(fp)
	fp.refresh(); fp._place(true)
	fp._settle_place.call_deferred()   # wrapped text and the knob rows size a frame late: lay the plate out again once its real size is known, so a second card never lands over the first
	return fp

func _settle_place() -> void:
	for i in 2:
		await get_tree().process_frame
		if not is_instance_valid(self): return
		_place(true)

## The coach steps "tap the converter" (L00), "pin the window" (L10) and "read the curve" (L13) are done by looking at the converter: opening its card tells the engine so
## (markCoach with that step's id), only while that step is the one on the intercom.
const WINDOW_STEPS := {"L00": [1, "tap_converter"], "L10": [5, "pin_window"], "L13": [4, "read_curve"]}
static func note_window_read(app, id: String) -> void:
	if app == null or app.b == null: return
	var lid := str(app.b.g.get("level", ""))
	if not WINDOW_STEPS.has(lid): return
	var p = app.b.q("plant")
	var type := ""
	if p is Dictionary: for u in p.get("units", []): if str(u.get("id", "")) == id: type = str(u.get("type", ""))
	if not ["eq_reactor", "eq_bed", "packed_bed"].has(type): return
	var li = app.b.q("levelInfo")
	if not (li is Dictionary) or not (li.get("coach") is Dictionary): return
	if int(li.coach.get("step", 0)) != int((WINDOW_STEPS[lid] as Array)[0]): return
	app.b.act("markCoach", [str((WINDOW_STEPS[lid] as Array)[1])]); app.game_on_changed()

static func close_all() -> void:
	for k in plates.keys():
		if is_instance_valid(plates[k]): (plates[k] as Faceplate).close()
	plates.clear()

func close() -> void:
	if _why_card != null and is_instance_valid(_why_card): _why_card.queue_free()
	plates.erase(unit_id)
	if app != null and app.b != null and app.b.changed.is_connected(refresh): app.b.changed.disconnect(refresh)
	queue_free()

## Wire the world's signals (selection, ports, pipe tags, placement) once per app. Returns the hub.
static func attach(app) -> Node:
	var h = app.root.get_node_or_null("PaperHub")
	if h != null: return h
	var hub := Hub.new(); hub.name = "PaperHub"; hub.app = app; app.root.add_child(hub); hub.connect_world()
	return hub

# ---- build -------------------------------------------------------------------------------------------------------------------
func _init() -> void:
	name = "Faceplate"; mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", EqTheme.porcelain_sb(5, 10.0))

func _ready() -> void:
	if app != null and app.b != null: app.b.changed.connect(refresh)

static var li_extra := {}            ## QA / tests: keys merged over the engine's levelInfo (e.g. bankSpecies before the engine reports it)
func _li() -> Dictionary:
	var li = PaperStrings.q(app, "levelInfo")
	if not (li is Dictionary): return {}
	if li_extra.is_empty() or (li as Dictionary).is_empty(): return li
	var m: Dictionary = (li as Dictionary).duplicate(); m.merge(li_extra, true)
	return m

## The engine phase: levelInfo.phase inside a level, the plant's phase in the sandbox ("shift" = knobs are live set points).
func _phase() -> String:
	var li := _li()
	if li.has("phase"): return str(li.phase)
	var p = PaperStrings.q(app, "plant")
	return str(p.get("phase", "design")) if p is Dictionary else "design"

func _bank_entry(li: Dictionary) -> Dictionary:
	for b in li.get("banks", []): if str(b.unit) == unit_id: return b
	return {}

func _query_card() -> Dictionary:
	var c = PaperStrings.q(app, "unitCard", [unit_id])
	return c if c is Dictionary else {}

func _stream_id(c: Dictionary) -> String:
	for k in ["outlets", "inlets"]:
		for p in c.get(k, []):
			if p.get("stream") != null: return str(p.stream)
	return ""

## A unit with several outlets (a splitter, a separator) shows one stream's numbers: which port that is, so "888 kmol/h" is never read as the whole inlet.
func _port_tag(c: Dictionary, sid: String) -> String:
	var outs: Array = c.get("outlets", [])
	if outs.size() < 2: return ""
	for p in outs: if p.get("stream") != null and str(p.stream) == sid: return " (" + str(p.get("label", p.get("port", ""))) + ")"
	return ""

func refresh() -> void:
	if app == null: return
	var lv := str(app.b.g.get("level", ""))
	if _level_id == "": _level_id = lv
	var alive := false
	for u in app.b.g.get("units", []): if str(u.get("id", "")) == unit_id: alive = true
	if lv != _level_id or not alive: close(); return   # a level change or a deleted unit closes the plate before it asks the engine about it
	var c := _query_card()
	if c.is_empty(): close(); return
	card = c
	var li := _li()
	var bsp: Array = li.get("bankSpecies", []) if str(c.type) == "feed" else []
	var cat = c.get("catalyst")
	var sig := (",".join((cat.options as Array).map(func(o): return str(o.id))) if cat is Dictionary else "") + "|" + str(c.type) + "|" + ",".join((c.knobs as Array).map(func(k): return str(k.key))) + "|" + str(c.get("feed", null) != null) + "|" + ",".join(bsp.map(func(x): return str(x))) + "|" + str((li.get("masked", []) as Array).has(unit_id))
	if sig != _sig: _sig = sig; _rebuild()
	_update()

func _rebuild() -> void:
	for ch in get_children(): ch.queue_free()
	knobs.clear(); pickers.clear(); _boxes.clear(); _cells.clear(); _chips.clear(); _bank_kg = null; _kmol_lbl = null; _carry_lbl = null
	var li0 := _li()
	_bank_sp = li0.get("bankSpecies", []) if str(card.type) == "feed" else []
	_bank = not _bank_sp.is_empty() and card.get("feed") != null
	_body = VBoxContainer.new(); _body.add_theme_constant_override("separation", 8); add_child(_body)
	# header: ISA tag on Dymo tape, the unit's name below, pin and close
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", 6); _body.add_child(head)
	var tags := VBoxContainer.new(); tags.add_theme_constant_override("separation", 2); tags.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(tags)
	var tag := EqTheme.dymo(str(card.id), 16); tag.name = "Tag"; tags.add_child(tag)
	var nm := EqTheme.dymo(str(card.label) if not _bank else EqStrings.formula(str(_bank_sp[0])) + " BANK", 12); nm.name = "Name"; tags.add_child(nm)
	_name_lbl = nm.get_child(0) as Label
	if str(card.type) == "feed":   # every feed says what it carries
		_carry_lbl = EqTheme.label("", 14, EqTheme.INK, "mono_bold"); _carry_lbl.name = "Carries"; _carry_lbl.label_settings = EqStrings.ls(14, EqTheme.INK, "cap"); tags.add_child(_carry_lbl)
	_pin = _tiny(PaperStrings.t("FP_PIN"), func(): pinned = not pinned; _pin.text = PaperStrings.t("FP_UNPIN") if pinned else PaperStrings.t("FP_PIN")); head.add_child(_pin)
	_trash = TrashButton.new(); _trash.pressed.connect(func(): _delete_me()); head.add_child(_trash)
	_all = _tiny(PaperStrings.t("FP_CLOSE_ALL"), func(): Faceplate.close_all()); _all.name = "CloseAll"; _all.visible = true; head.add_child(_all)   # two cards open: one key clears the plot
	var x := _tiny("×", func(): close()); x.name = "Close"; head.add_child(x)
	_scroll = null; _head_box = head; _outer = null; _foot = null
	if CbLayout.phone:   # a phone plate is taller than the strip above the console: header pinned, the rest scrolls by swipe
		_scroll = ScrollContainer.new(); _scroll.name = "PlateScroll"; _scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; _scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_AUTO
		var inner := VBoxContainer.new(); inner.name = "PlateInner"; inner.add_theme_constant_override("separation", 8); inner.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		_scroll.add_child(inner); _body.add_child(_scroll); _outer = _body; _body = inner
	# body: PV bar + knobs
	var mid := HBoxContainer.new(); mid.add_theme_constant_override("separation", 6); _body.add_child(mid)
	_pv = PvBar.new(); mid.add_child(_pv)
	_pv.visible = not _bank   # a cylinder bank has no process variable to chart
	if _bank:
		var bv := VBoxContainer.new(); bv.add_theme_constant_override("separation", 4); mid.add_child(bv)
		var chips := HBoxContainer.new(); chips.name = "Chips"; chips.add_theme_constant_override("separation", 6); bv.add_child(chips)
		for sp in _bank_sp:
			var ch := Button.new(); ch.name = "Chip_" + str(sp); ch.text = EqStrings.formula(str(sp)); ch.toggle_mode = true; ch.focus_mode = Control.FOCUS_ALL; ch.custom_minimum_size = Vector2(64, 46)
			ch.add_theme_font_override("font", EqStrings.font("cap")); ch.add_theme_font_size_override("font_size", EqTheme.fs(24))
			ch.add_theme_stylebox_override("normal", _chip_sb(false)); ch.add_theme_stylebox_override("hover", _chip_sb(false, true)); ch.add_theme_stylebox_override("pressed", _chip_sb(true)); ch.add_theme_stylebox_override("hover_pressed", _chip_sb(true)); ch.add_theme_stylebox_override("focus", _ring_sb())
			for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]: ch.add_theme_color_override(c, EqTheme.INK if c != "font_pressed_color" and c != "font_hover_pressed_color" else Color("#0B1F1C"))
			var spc := str(sp); ch.pressed.connect(func(): _pick_species(spc)); chips.add_child(ch); _chips[spc] = ch
		_bank_kg = Knob.new(); _bank_kg.app = app
		_bank_kg.setup(PaperStrings.t("FP_BANK_KG"), "kg/h", 0.0, 3000.0, 10.0, 0.1, 0.0)
		_bank_kg.name = "Knob_bank"; _bank_kg.committed.connect(func(v: float) -> void: _commit_bank(v))
		bv.add_child(_bank_kg); knobs["bank"] = _bank_kg
		_kmol_lbl = EqTheme.label("", 15, EqTheme.INK, "mono_bold"); _kmol_lbl.name = "Kmol"; bv.add_child(_kmol_lbl)
	_knob_box = GridContainer.new(); _knob_box.columns = 1 if (card.knobs as Array).size() <= 1 else 2
	_knob_box.add_theme_constant_override("h_separation", 2); _knob_box.add_theme_constant_override("v_separation", 2)
	if not _bank: mid.add_child(_knob_box)
	if not _bank:
		for k in card.knobs: _add_knob(k)
	if card.get("catalyst") is Dictionary and not _bank: _add_catalyst(card.catalyst)
	if str(card.type) == "interlock" and str(app.b.g.get("level", "")) == "L24":   # L24: the latched trip is released here (the engine refuses while the reactor is still hot, and says so)
		var rb := _btn(PaperStrings.t("ILK_RESET"), func(): _reset_interlock()); rb.name = "ResetInterlock"; rb.tooltip_text = PaperStrings.t("ILK_RESET_TIP"); _knob_box.add_child(rb)
	if (card.knobs as Array).is_empty() and not _bank and not (card.get("catalyst") is Dictionary):
		var nl := EqTheme.label("—", 18, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.5), "mono"); nl.custom_minimum_size = Vector2(90, 40); _knob_box.add_child(nl)
	_pad_hint = EqTheme.label(PaperStrings.t("FP_PADHINT"), 16, EqTheme.INK, "semi"); _pad_hint.name = "PadHint"; _pad_hint.visible = false; _pad_hint.clip_text = true; _pad_hint.custom_minimum_size = Vector2(0, 22)
	_body.add_child(_pad_hint)   # one line, only while the pad is in hand: which buttons turn the dial
	_body.add_child(HSeparator.new())
	# readouts, two cells per row (kmol/h beside kg/h)
	var grid := GridContainer.new(); grid.columns = 2; grid.add_theme_constant_override("h_separation", 10); grid.add_theme_constant_override("v_separation", 2); _body.add_child(grid)
	for key in ["flow", "mass", "T", "P", "duty"]: _cell(grid, key)
	if str(card.type) == "cstr" and str(app.b.g.get("level", "")) == "L24":   # L24: the reactor flow lags the feed by its hold-up: say so right under the readout
		var lag := EqTheme.label(PaperStrings.t("FP_LAG"), 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "mono"); lag.name = "LagNote"; lag.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; lag.custom_minimum_size = Vector2(190, 0); _body.add_child(lag)
	_rc_grid = GridContainer.new(); _rc_grid.name = "ResultsC"; _rc_grid.columns = 2; _rc_grid.add_theme_constant_override("h_separation", 12); _rc_grid.add_theme_constant_override("v_separation", 0); _body.add_child(_rc_grid)   # the unit's own temperatures, in °C
	_last = EqTheme.label("", 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "dymo"); _last.name = "LastRun"; _body.add_child(_last)   # readings of the last run while the dials are being edited
	# fixed slots: error text never moves the fields above it (a heater also has a loud 0 kW warning slot)
	_warn = null
	if str(card.type) in ["heater", "cooler"]:
		_warn = EqTheme.label("", 15, Color("#FFFFFF"), "semi"); _warn.name = "Warn"; _warn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _warn.custom_minimum_size = Vector2(210, 44)
		_warn.max_lines_visible = 2; _warn.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS
		var wp := PanelContainer.new(); wp.name = "WarnBox"; var wsb := StyleBoxFlat.new(); wsb.bg_color = Color("#C4262F"); wsb.set_corner_radius_all(3); wsb.set_content_margin_all(4); wp.add_theme_stylebox_override("panel", wsb); wp.add_child(_warn); _body.add_child(wp); _warn.set_meta("box", wp)
	_need = EqTheme.label("", 14, EqTheme.RED, "semi"); _need.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _need.custom_minimum_size = Vector2(210, 46); _need.max_lines_visible = 2; _need.text_overrun_behavior = TextServer.OVERRUN_TRIM_ELLIPSIS; _body.add_child(_need)
	var bt := HBoxContainer.new(); bt.add_theme_constant_override("separation", 4); (_outer if _outer != null else _body).add_child(bt); _foot = bt   # phone: Why? / Lens / Window stay pinned under the scrolling body
	_why = _btn(PaperStrings.t("FP_WHY"), _on_why); _lens = _btn(PaperStrings.t("FP_LENS"), func(): _open_extra("open_lens")); _win = _btn(PaperStrings.t("FP_WINDOW"), func(): _open_extra("open_window"))
	for b in [_why, _lens, _win]: bt.add_child(b)

## The pad's focus ring on a chip: a bright border over whatever the chip looks like (the old focus style was the hover tint, which no one could see).
func _ring_sb() -> StyleBoxFlat:
	var s := StyleBoxFlat.new(); s.draw_center = false; s.border_color = Color(1, 0.9, 0.25); s.set_border_width_all(4); s.set_corner_radius_all(4)
	s.expand_margin_left = 2; s.expand_margin_right = 2; s.expand_margin_top = 2; s.expand_margin_bottom = 2
	return s

func _chip_sb(on: bool, hover := false) -> StyleBoxFlat:
	var s := EqTheme.key_sb(on)
	if not on and hover: s.bg_color = EqTheme.PORCELAIN.lightened(0.08)
	s.content_margin_left = 8; s.content_margin_right = 8
	if on: s.border_color = EqTheme.INK; s.set_border_width_all(2); s.border_width_bottom = 3
	return s

## A chip: the bank now carries `sp` at the same mass flow.
func _pick_species(sp: String) -> void:
	var be := _bank_entry(_li())
	var kg := _bank_kg.value if _bank_kg != null else float(be.get("kgPerH", 0.0))
	var r: Dictionary = app.b.act("setBank", [unit_id, sp, kg])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	refresh()

func _commit_bank(v: float) -> void:
	var be := _bank_entry(_li())
	var sp := str(be.get("species", _bank_sp[0]))
	if not _bank_sp.has(sp): sp = str(_bank_sp[0])
	var r: Dictionary = app.b.act("setBank", [unit_id, sp, v])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	refresh()

func _reset_interlock() -> void:
	var r: Dictionary = app.b.act("levelAct", ["resetInterlock"])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	app.game_on_changed(); refresh()

## The bin: delete this unit (the hub confirms when it has pipes).
func _delete_me() -> void:
	var hub = app.root.get_node_or_null("PaperHub")
	if hub != null: hub.delete_unit(unit_id, false)

func _tiny(text: String, cb: Callable) -> Button:
	var b := EqTheme.key_button(text, false, 13); b.custom_minimum_size = Vector2(0, 28); b.add_theme_stylebox_override("normal", EqTheme.key_sb(false)); b.pressed.connect(cb)
	for st in ["normal", "hover", "pressed", "disabled"]: var sb := EqTheme.key_sb(false, st); sb.content_margin_left = 7; sb.content_margin_right = 7; sb.content_margin_top = 1; sb.content_margin_bottom = 1; b.add_theme_stylebox_override(st, sb)
	return b

func _btn(text: String, cb: Callable) -> Button:
	var b := EqTheme.key_button(text, false, 15); b.custom_minimum_size = Vector2(0, 34); b.pressed.connect(cb)
	for st in ["normal", "hover", "pressed", "disabled"]: var sb := EqTheme.key_sb(false, st); sb.content_margin_left = 8; sb.content_margin_right = 8; b.add_theme_stylebox_override(st, sb)
	return b

func _cell(grid: GridContainer, key: String) -> void:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 0); v.name = "Cell_" + key; grid.add_child(v)
	var cap := EqTheme.label("", 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.45), "dymo"); var val := EqTheme.label("—", 16, EqTheme.INK, "mono_bold")
	v.add_child(cap); v.add_child(val); _cells[key] = [cap, val, v]

func _add_knob(k: Dictionary) -> void:
	if str(k.kind) == "choice": _add_picker(k); return
	var kn := Knob.new(); kn.app = app
	var unit := str(k.unit)
	var lab := str(k.label)
	if true:
		var dp = k.get("disp")   # the engine's own display-unit numbers (unitCard knob.disp); the SI -> display conversion is only the fallback
		var has_dp: bool = dp is Dictionary
		var lo := float(dp.min) if has_dp else EqFmt.to_disp(float(k.min), unit)
		var hi := float(dp.max) if has_dp else EqFmt.to_disp(float(k.max), unit)
		var span := hi - lo
		var coarse := _nice(span * 0.01); var fine := _nice(span * 0.001)   # floors of the relative wheel step
		if bool(k.get("int", false)): coarse = 1.0; fine = 1.0
		elif has_dp and dp.get("coarse") != null and float(dp.coarse) > 0.0:   # the engine's own step for this knob (an interlock set point moves 1 degC at a time): fixed steps for the wheel and the +/- buttons
			coarse = float(dp.coarse); fine = float(dp.get("fine", coarse)) if float(dp.get("fine", 0.0)) > 0.0 else coarse; kn.engine_steps = true
		else: kn.relative = true   # the wheel moves ~2 % of the value (0.2 % with Shift) in 1/2/5 steps: fine enough to land a narrow window
		var ulab := str(dp.unit) if has_dp else str(k.get("unitLabel", unit))
		kn.setup(lab, PaperStrings.usym(ulab), lo, hi, coarse, fine, float(dp.value) if has_dp else EqFmt.to_disp(float(k.value), unit), bool(k.get("int", false)))
	if str(k.key) == "Pfix": kn.zero_text = "off"   # the flask holds its volume while this is 0: no "0.000 bar(a)" setpoint
	kn.nudge_fine = kn.engine_steps and kn.unit == "°C"   # an interlock set point and a coolant move 1 degC per - / + click, not the 5 degC wheel notch
	kn.name = "Knob_" + str(k.key); kn.set_meta("key", str(k.key)); kn.set_meta("spec", k)
	kn.committed.connect(func(v: float) -> void: _commit(k, v))
	_knob_box.add_child(kn); knobs[str(k.key)] = kn

## A choice knob as a labelled picker: one toggle per option (a heater's utility: fired / steam / cooling water / refrigerant / none).
const CHOICE_ORDER := ["fired", "steam", "cw", "refrig", ""]
var pickers := {}                    # param key -> {option -> Button}
func _add_picker(k: Dictionary) -> void:
	var key := str(k.key)
	var box := VBoxContainer.new(); box.name = "Picker_" + key; box.add_theme_constant_override("separation", 2); box.custom_minimum_size = Vector2(150, 0)
	box.add_child(EqTheme.dymo(str(k.label), 12))
	var opts: Array = (k.options as Array).duplicate()
	opts.sort_custom(func(a, b): return (CHOICE_ORDER.find(str(a)) if CHOICE_ORDER.has(str(a)) else 99) < (CHOICE_ORDER.find(str(b)) if CHOICE_ORDER.has(str(b)) else 99))
	var fl := HFlowContainer.new(); fl.add_theme_constant_override("h_separation", 3); fl.add_theme_constant_override("v_separation", 3); box.add_child(fl)
	var m := {}
	for o in opts:
		var bt := Button.new(); bt.name = "Opt_" + (str(o) if str(o) != "" else "none"); bt.toggle_mode = true; bt.focus_mode = Control.FOCUS_ALL
		bt.text = _opt_text(k, key, str(o)); bt.custom_minimum_size = Vector2(0, 30)
		bt.add_theme_font_override("font", EqStrings.font("cap")); bt.add_theme_font_size_override("font_size", EqTheme.fs(14))
		bt.add_theme_stylebox_override("normal", _chip_sb(false)); bt.add_theme_stylebox_override("hover", _chip_sb(false, true)); bt.add_theme_stylebox_override("pressed", _chip_sb(true)); bt.add_theme_stylebox_override("hover_pressed", _chip_sb(true)); bt.add_theme_stylebox_override("focus", _ring_sb())
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]: bt.add_theme_color_override(c, EqTheme.INK if c != "font_pressed_color" and c != "font_hover_pressed_color" else Color("#0B1F1C"))
		var ov := str(o); bt.pressed.connect(func(): _commit(k, float((k.options as Array).find(ov)))); fl.add_child(bt); m[ov] = bt
	pickers[key] = m
	_hook_pulse(box, key)
	_knob_box.add_child(box)

## The catalyst choice of a packed bed: one tag per catalyst the engine offers for this reaction (unitCard.catalyst), with its price and light-off on the line below.
## An option's text: the engine's own optionLabels (a boiler's "HP · 40 bar") when it sends them, else the catalogue word.
func _opt_text(k: Dictionary, key: String, o: String) -> String:
	var ol = k.get("optionLabels")
	var i: int = (k.options as Array).find(o)
	if ol is Array and i >= 0 and i < (ol as Array).size(): return str((ol as Array)[i])
	return _opt_label(key, o)

func _add_catalyst(cat: Dictionary) -> void:
	var box := VBoxContainer.new(); box.name = "Picker_catalyst"; box.add_theme_constant_override("separation", 2); box.custom_minimum_size = Vector2(190, 0); _cat_box = box
	box.add_child(EqTheme.dymo(PaperStrings.t("FP_CATALYST"), 12))
	var fl := HFlowContainer.new(); fl.add_theme_constant_override("h_separation", 3); fl.add_theme_constant_override("v_separation", 3); box.add_child(fl)
	var m := {}
	for o in cat.options:
		var oid := str(o.id)
		var bt := Button.new(); bt.name = "Opt_" + oid; bt.toggle_mode = true; bt.focus_mode = Control.FOCUS_ALL; bt.text = str(o.name).to_upper(); bt.custom_minimum_size = Vector2(0, 30)
		bt.tooltip_text = _cat_line(o)
		bt.add_theme_font_override("font", EqStrings.font("cap")); bt.add_theme_font_size_override("font_size", EqTheme.fs(14))
		for st in ["normal", "hover", "pressed", "hover_pressed"]: bt.add_theme_stylebox_override(st, _chip_sb(st.contains("pressed"), st == "hover"))
		bt.add_theme_stylebox_override("focus", _ring_sb())
		for c in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]: bt.add_theme_color_override(c, EqTheme.INK if c != "font_pressed_color" and c != "font_hover_pressed_color" else Color("#0B1F1C"))
		bt.pressed.connect(func(): _commit_catalyst(oid)); fl.add_child(bt); m[oid] = bt
	pickers["catalyst"] = m
	_cat_note = EqTheme.label("", 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.35), "mono"); _cat_note.name = "CatalystNote"; _cat_note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _cat_note.custom_minimum_size = Vector2(190, 0); box.add_child(_cat_note)
	_cat_all = EqTheme.key_button(PaperStrings.t("FP_CAT_ALL"), false, 13); _cat_all.name = "CatalystAll"; _cat_all.custom_minimum_size = Vector2(190, 28)
	_cat_all.tooltip_text = PaperStrings.t("FP_CAT_ALL_TIP"); _cat_all.pressed.connect(_apply_catalyst_all); _cat_all.visible = false; box.add_child(_cat_all)
	_hook_pulse(box, "catalyst")
	_knob_box.add_child(box)

## The other units of this type on the plot.
func _same_type_ids() -> Array:
	var out: Array = []
	for u in app.b.g.get("units", []):
		if str(u.get("type", "")) == str(card.get("type", "")) and str(u.get("id", "")) != unit_id: out.append(str(u.id))
	return out

## F25: this bed's catalyst and its charge (the W knob) go to every other unit of the same type in one press.
func _apply_catalyst_all() -> void:
	if _tripped(): app.toast(PaperStrings.t("FP_TRIPPED"), "warn"); refresh(); return
	var cat = card.get("catalyst")
	if not (cat is Dictionary) or cat.get("id") == null: return
	var w_si = null
	for k in card.knobs: if str(k.key) == "W": w_si = float(k.value)
	var n := 0
	for id in _same_type_ids():
		var r: Dictionary = app.b.act("setCatalyst", [id, str(cat.id)])
		if bool(r.get("ok", false)) and w_si != null: r = app.b.act("setParam", [id, "W", w_si])
		if bool(r.get("ok", false)): n += 1
		else: app.toast(str(r.get("message", "")), "warn"); break
	if n > 0: app.toast(PaperStrings.t("FP_CAT_ALL_DONE") % [n, str(cat.id)], "good")
	refresh()

func _cat_line(o: Dictionary) -> String:
	if o.has("kText"): return "%s · k %s (25 °C)" % [str(o.name), str(o.kText)]   # a bench rig's catalyst: the rate constant, not a price
	return "%s · %s ×%s · %s %s °C" % [str(o.name), PaperStrings.t("FP_PRICE"), PaperStrings.num(float(o.price)), PaperStrings.t("FP_LIGHTOFF"), PaperStrings.num(float(o.lightOffC))]

func _commit_catalyst(id: String) -> void:
	if _tripped(): app.toast(PaperStrings.t("FP_TRIPPED"), "warn"); refresh(); return
	var r: Dictionary = app.b.act("setCatalyst", [unit_id, id])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	refresh()

func _opt_label(key: String, o: String) -> String:
	if key == "utility": return PaperStrings.t("UT_" + (o.to_upper() if o != "" else "NONE")).to_upper()
	return o.to_upper() if o != "" else "—"

## A round step (1, 2, 5 x 10^n) at or just under `x`, so the wheel lands on readable numbers.
static func _nice(x: float) -> float:
	if x <= 0.0: return 1.0
	var e := pow(10.0, floorf(log(x) / log(10.0))); var m := x / e
	return e * (5.0 if m >= 5.0 else 2.0 if m >= 2.0 else 1.0)

## A plant whose interlock (or any trip) has fired, or that is lost: its knobs are not live set points until the trip is reset.
func _tripped() -> bool:
	var sh = app.b.g.get("shift")
	var trips: Array = sh.get("trips", []) if sh is Dictionary else []
	return not trips.is_empty() or str(app.b.g.get("status", "playing")) == "lost" or _phase() == "lost"

func _commit(k: Dictionary, v: float) -> void:
	var val: Variant
	if str(k.kind) == "choice": val = str((k.options as Array)[clampi(int(round(v)), 0, (k.options as Array).size() - 1)])
	else: val = EqFmt.to_si(v, str(k.unit))
	if _tripped():   # a tripped plant takes no set points: say why instead of silently moving the SP
		app.toast(PaperStrings.t("FP_TRIPPED"), "warn"); refresh(); return
	var shift := _phase() == "shift"   # during a shift the knob is a set point: the actuator ramps the plant to it (setParam is a design-phase action)
	var r: Dictionary = app.b.act("setpoint" if shift else "setParam", [unit_id, str(k.key), val])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	elif shift and typeof(val) == TYPE_FLOAT: _cmd[str(k.key)] = val
	refresh()

## Why?: a card beside the plate with what the unit does, its lever and the player's own numbers (unitWhy); what is wrong with it right now comes first, in red.
func _on_why() -> void:
	if _why_card != null and is_instance_valid(_why_card): _why_card.queue_free(); _why_card = null; return
	var lines: Array = []; var bad := ""
	var n = PaperStrings.q(app, "needs", [unit_id])
	if n is Dictionary and not (n as Dictionary).is_empty(): bad = str(n.text)
	elif not (card.get("diags", []) as Array).is_empty(): bad = str(card.diags[0].message)
	var w = PaperStrings.q(app, "unitWhy", [unit_id])
	if w is Dictionary and w.get("sentences") is Array: lines = w.sentences
	if lines.is_empty() and bad == "":
		app.toast(PaperStrings.t("FP_NOSOLVE") if card.get("results") == null else str(card.label), "info"); return
	var pc := PanelContainer.new(); pc.name = "WhyCard"; pc.add_theme_stylebox_override("panel", EqTheme.porcelain_sb(5, 12.0)); pc.custom_minimum_size = Vector2(320, 0)
	var vb := VBoxContainer.new(); vb.add_theme_constant_override("separation", 6); pc.add_child(vb)
	var hd := HBoxContainer.new(); vb.add_child(hd)
	var tg := EqTheme.dymo("%s · %s" % [PaperStrings.t("FP_WHY").trim_suffix("?").to_upper() + "?", str(card.id)], 14); tg.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hd.add_child(tg)
	var cx := _tiny("×", func(): if is_instance_valid(pc): pc.queue_free()); cx.name = "WhyClose"; hd.add_child(cx)
	if bad != "":
		var bl := EqTheme.label(bad, 15, EqTheme.RED, "semi"); bl.name = "WhyBad"; bl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bl.custom_minimum_size.x = 300; vb.add_child(bl)
	var i := 0
	for s in lines:
		var l := EqTheme.label(str(s), 16, EqTheme.INK, "sans"); l.name = "WhyLine_%d" % i; i += 1; l.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; l.custom_minimum_size.x = 300; vb.add_child(l)
	app.root.add_child(pc); _why_card = pc
	_place_why.call_deferred()

func _place_why() -> void:
	if _why_card == null or not is_instance_valid(_why_card): return
	var vr := get_viewport().get_visible_rect().size
	_why_card.reset_size()
	var x := global_position.x - _why_card.size.x - 10.0
	if x < 8.0: x = minf(global_position.x + size.x + 10.0, vr.x - _why_card.size.x - 8.0)
	_why_card.position = Vector2(x, clampf(global_position.y + size.y - _why_card.size.y, 56.0, vr.y - _why_card.size.y - 8.0))

func _open_extra(method: String) -> void:
	if app != null and app.has_method(method): app.call(method, unit_id)

# ---- values ------------------------------------------------------------------------------------------------------------------
func _set_cell(key: String, caption: String, si: Variant, unit: String, scale_to := "") -> void:
	var c: Array = _cells[key]
	(c[2] as Control).visible = si != null
	if si == null: readouts.erase(key); return
	var d := EqFmt.to_disp(float(si), unit) if scale_to == "" else float(si)
	var txt := PaperStrings.num(d)
	(c[0] as Label).text = caption.to_upper(); (c[1] as Label).text = txt
	readouts[key] = {"text": txt, "si": float(si), "unit": unit, "cap": caption}

func _update() -> void:
	var sid := _stream_id(card)
	var st: Dictionary = {}
	if sid != "":
		st = PaperStrings.stream_row(app, sid)
	var is_feed := str(card.type) == "feed" and card.get("feed") != null
	var feed: Dictionary = card.get("feed") if is_feed else {}
	readouts.clear()
	# flow (kmol/h) and mass (kg/h) side by side; for a feed the spec itself is the flow (engine value), the mass comes from the solved stream or the engine's feed fields
	var flow: Variant = float(feed.flow) if is_feed and feed.has("flow") else (st.get("flow") if st.has("flow") else null)
	_set_cell("flow", PaperStrings.t("FP_FLOW") + " " + PaperStrings.t("FP_KMOLH") + _port_tag(card, sid), flow, "kmol/h")
	var mass: Variant = null
	if st.has("mass"):
		mass = float(st.mass) * 3600.0
		# one source: a feed's mass is the solved stream's mass per mole scaled to the flow the knob shows (a stale solve never disagrees with the knob)
		if is_feed and flow != null and st.has("flow") and float(st.flow) > 1e-12: mass = mass * float(flow) / float(st.flow)
	for k in ["massKgh", "kgh", "mass_kgh"]:
		if is_feed and feed.has(k) and mass == null: mass = float(feed[k])
	_set_cell("mass", PaperStrings.t("FP_MASS") + " " + PaperStrings.t("FP_KGH"), mass, "kg/h", "raw")
	var t_cell: Variant = st.get("T") if st.has("T") else (float(feed.T) if is_feed and feed.has("T") else null)
	var live = card.get("live")   # during a shift the engine sends the vessel's live dynamic T (K): the card shows it, not the steady solve
	if live is Dictionary and (live as Dictionary).get("T") != null and is_finite(float(live.T)): t_cell = float(live.T)
	var t_cap := "T " + PaperStrings.usym("degC")
	if _cmd.has("T") and _phase() == "shift" and t_cell != null and absf(float(_cmd.T) - float(t_cell)) > 0.5: t_cap += " → " + PaperStrings.num(EqFmt.to_disp(float(_cmd.T), "degC"))   # a ramp under way: the card says where it is heading, not only where it is passing through
	_set_cell("T", t_cap, t_cell, "degC")
	_set_cell("P", "P " + PaperStrings.usym("bar"), st.get("P") if st.has("P") else (float(feed.P) if is_feed and feed.has("P") else null), "bar")
	var res: Variant = card.get("results")
	var duty: Variant = null; var dcap := PaperStrings.t("FP_DUTY") + " kW"
	if res is Dictionary:
		# a compressor's card says the shaft power going IN (positive, never the intercooler's negative duty and never 0.000 while it runs)
		if (res as Dictionary).has("work"):
			duty = float(res.work); dcap = PaperStrings.t("FP_WORK") + " kW"
			if str(card.type) == "compressor": duty = absf(float(res.work)); dcap = PaperStrings.t("FP_POWER_IN") + " kW"
		elif (res as Dictionary).has("duty"): duty = float(res.duty)
	_set_cell("duty", dcap, duty, "kW")
	# PV bar: the outlet stream's value for the SP knob's variable (T, P or flow); SP is the knob
	var spk := {}
	for k in card.knobs: if str(k.kind) == "num": spk = k; break
	_pv.pv = NAN; _pv.sp = NAN
	if not spk.is_empty():
		var unit := str(spk.unit)
		var sp_si := float(_cmd[str(spk.key)]) if _cmd.has(str(spk.key)) else float(spk.value)   # a commanded ramp shows its target, not where the actuator is now
		_pv.lo = EqFmt.to_disp(float(spk.min), unit); _pv.hi = EqFmt.to_disp(float(spk.max), unit); _pv.sp = EqFmt.to_disp(sp_si, unit); _pv.sp_label = "SP"
		var key := str(spk.key)
		if st.has("T") and key == "T": _pv.pv = EqFmt.to_disp(float(st.T), unit)
		elif st.has("P") and key == "P": _pv.pv = EqFmt.to_disp(float(st.P), unit)
		elif key == "flow" and flow != null: _pv.pv = EqFmt.to_disp(float(flow), unit)
	_pv.queue_redraw()
	# knobs follow the engine (but never fight a hand on the knob); a commanded shift ramp keeps the knob at its target until the plant arrives
	var running := _phase() == "shift"
	for k in card.knobs:
		var kn: Knob = knobs.get(str(k.key))
		if _cmd.has(str(k.key)) and (not running or str(k.kind) == "choice" or absf(float(k.value) - float(_cmd[str(k.key)])) <= 1e-6 * maxf(1.0, absf(float(_cmd[str(k.key)])))): _cmd.erase(str(k.key))
		if str(k.kind) == "choice" and pickers.has(str(k.key)):
			for o in pickers[str(k.key)]: (pickers[str(k.key)][o] as Button).set_pressed_no_signal(str(o) == str(k.value))
			continue
		if kn == null or kn._drag or not kn._timer.is_stopped(): continue   # never fight a hand: a drag, or clicks still waiting to be committed
		if k.get("off") != null:   # a set point of "off" (0 = disarmed) is shown as OFF, never as the bottom of the scale
			kn.off_disp = EqFmt.to_disp(float(k.off), str(k.unit))
			var offn: bool = absf(float(k.value) - float(k.off)) <= 1e-9 * maxf(1.0, absf(float(k.off)))
			kn.set_off(offn)
			if offn: continue
		if str(k.kind) == "choice": kn.set_value(float((k.options as Array).find(str(k.value))))
		elif _cmd.has(str(k.key)): kn.set_value(EqFmt.to_disp(float(_cmd[str(k.key)]), str(k.unit)))
		elif k.get("disp") is Dictionary: kn.set_value(float(k.disp.value))
		else: kn.set_value(EqFmt.to_disp(float(k.value), str(k.unit)))
	_update_catalyst()
	_update_results_c()
	_apply_coach()
	_update_feed_info()
	if _all != null: _all.visible = true
	if _last != null:   # in DESIGN the knobs are the plan; meters from an earlier run say so instead of passing for the plan
		_last.text = PaperStrings.t("FP_LAST_RUN") if (_phase() == "design" and not readouts.is_empty() and sid != "" and not is_feed) else ""
		_last.visible = _last.text != ""
	var need = PaperStrings.q(app, "needs", [unit_id])
	_need.text = str(need.text) if need is Dictionary and not (need as Dictionary).is_empty() else (PaperStrings.t("FP_FAILED") if bool(card.get("failed", false)) else "")
	_need.modulate.a = 1.0 if _need.text != "" else 0.0   # the slot stays, so nothing below it jumps
	if _warn != null:
		var utl := ""; var has_utl := false
		for k in card.knobs: if str(k.key) == "utility": utl = str(k.value); has_utl = true
		var res2: Variant = card.get("results")
		var zero: bool = (has_utl and utl == "") or (res2 is Dictionary and (res2 as Dictionary).has("duty") and absf(float(res2.duty)) < 1.0)
		var wrong := ""
		if str(card.type) == "heater" and (utl == "cw" or utl == "refrig"): wrong = PaperStrings.t("UT_COLD")   # a heater on cooling water cannot heat: say so loudly
		elif str(card.type) == "cooler" and (utl == "fired" or utl == "steam"): wrong = PaperStrings.t("UT_HOT")
		_warn.text = wrong if wrong != "" else (PaperStrings.t("UT_ZERO") % str(card.get("label", card.get("type", "unit"))).to_lower() if zero else "")
		(_warn.get_meta("box") as Control).modulate.a = 1.0 if (zero or wrong != "") else 0.0
	_lens.disabled = app == null or not app.has_method("open_lens"); _win.disabled = app == null or not app.has_method("open_window")
	reset_size()

func _update_catalyst() -> void:
	var cat = card.get("catalyst")
	if not (cat is Dictionary) or not pickers.has("catalyst"): return
	var cur := str(cat.get("id")) if cat.get("id") != null else ""
	var line := ""
	for o in cat.options:
		(pickers.catalyst[str(o.id)] as Button).set_pressed_no_signal(str(o.id) == cur)
		if str(o.id) == cur: line = "%s %s · %s %s °C" % [PaperStrings.t("FP_PRICE"), "×" + PaperStrings.num(float(o.price)), PaperStrings.t("FP_LIGHTOFF"), PaperStrings.num(float(o.lightOffC))]
	var rig = card.get("rig")
	if rig is Dictionary:   # a batch rig (L18): its catalyst by name, k now, and whether it is fast enough for the bench's goal
		line = PaperStrings.t("RIG_LINE") % [str(rig.catalystName), str(rig.kTextNow)]
		var lv = PaperStrings.q(app, "levelView")
		if lv is Dictionary and lv.get("rigs") is Array:
			for r in lv.rigs:
				if str(r.id) == unit_id:
					line += "\n" + (PaperStrings.t("RIG_OK") if bool(r.fastEnough) else PaperStrings.t("RIG_SLOW")) % str(lv.get("kNeededText", ""))
	elif line == "": pass
	if _cat_note != null: _cat_note.text = line
	if _cat_all != null: _cat_all.visible = cur != "" and not (rig is Dictionary) and not _same_type_ids().is_empty()
	readouts["catalyst"] = {"text": cur, "si": 0.0, "unit": "", "cap": "catalyst"}

const RC_CAP := {"T": "T", "Tmax": "T max", "Tmin": "T min", "Tin": "T in", "Tout": "T out", "Thot": "T hot", "Tcold": "T cold", "Tc": "T cool"}
## unitCard.resultsC: the unit's result temperatures, already in °C.
func _update_results_c() -> void:
	if _rc_grid == null: return
	var rc = card.get("resultsC")
	var keys: Array = (rc as Dictionary).keys() if rc is Dictionary else []
	keys.sort()
	var sig := ",".join(keys.map(func(x): return str(x)))
	if str(_rc_grid.get_meta("sig", "#")) != sig:
		_rc_grid.set_meta("sig", sig)
		for ch in _rc_grid.get_children(): ch.queue_free()
		for k in keys:
			var v := HBoxContainer.new(); v.name = "RC_" + str(k); v.custom_minimum_size = Vector2(120, 0); v.add_theme_constant_override("separation", 5)   # one line per temperature: the plate stays short
			var cap := EqTheme.label("", 12, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.45), "dymo"); var val := EqTheme.label("—", 15, EqTheme.INK, "mono_bold")
			cap.text = (str(RC_CAP.get(str(k).replace("_", ""), str(k))) + " °C").to_upper(); v.add_child(cap); v.add_child(val); _rc_grid.add_child(v)
	for k in keys:
		var node := _rc_grid.get_node_or_null("RC_" + str(k))
		if node == null: continue
		var txt := PaperStrings.num(float((rc as Dictionary)[k]))
		(node.get_child(1) as Label).text = txt
		readouts["rc_" + str(k)] = {"text": txt, "si": float((rc as Dictionary)[k]) + 273.15, "unit": "degC", "cap": str(k)}
	_rc_grid.visible = not keys.is_empty()

# ---- the coach points at a knob ----------------------------------------------------------------------------------------------
static var coach_knob := {}          ## {unit, knob} the coach is talking about (console._point sets it); that knob pulses on its faceplate
class PulseRing extends Control:
	func _init() -> void: name = "Coach"; mouse_filter = Control.MOUSE_FILTER_IGNORE; set_anchors_preset(Control.PRESET_FULL_RECT)
	func _process(_d: float) -> void: queue_redraw()
	func _draw() -> void:
		var a := 0.5 + 0.45 * sin(Time.get_ticks_msec() * 0.006)
		draw_rect(Rect2(Vector2.ZERO, size).grow(1.0), Color(EqTheme.TEAL, a), false, 3.0)
static func set_coach_knob(app, unit: String, knob: String) -> void:
	coach_knob = {"unit": unit, "knob": knob} if unit != "" and knob != "" else {}
	for k in plates: if is_instance_valid(plates[k]): (plates[k] as Faceplate)._apply_coach()
func _apply_coach() -> void:
	var want := str(coach_knob.get("knob", "")) if str(coach_knob.get("unit", "")) == unit_id else ""
	var targets := {}
	for k in knobs: targets[str(k)] = knobs[k]
	for k in targets:
		var n: Control = targets[k]
		if not is_instance_valid(n): continue
		var ring := n.get_node_or_null("Coach")
		if str(k) == want and ring == null: n.add_child(PulseRing.new())
		elif str(k) != want and ring != null: ring.queue_free()
	for b in _boxes:   # a picker sits in a container: it draws its own ring
		if is_instance_valid(b): b.set_meta("coach", str(b.get_meta("key")) == want); b.queue_redraw()
func _hook_pulse(box: Control, key: String) -> void:
	box.set_meta("key", key); box.set_meta("coach", false); _boxes.append(box)
	box.draw.connect(func():
		if bool(box.get_meta("coach", false)): box.draw_rect(Rect2(Vector2.ZERO, box.size).grow(3.0), Color(EqTheme.TEAL, 0.5 + 0.45 * sin(Time.get_ticks_msec() * 0.006)), false, 3.0))

## Feed faceplates: what the feed carries (masked feeds stay unknown) and, for a cylinder bank, the lit species chip and the kmol/h beside the kg/h knob.
func _update_feed_info() -> void:
	if _carry_lbl == null: return
	var li := _li()
	if (li.get("masked", []) as Array).has(unit_id): _carry_lbl.text = PaperStrings.t("FP_MASKED")
	else:
		var pl = PaperStrings.q(app, "plant")
		var f = card.get("feed")
		_carry_lbl.text = EqStrings.carries(pl.get("species", []) if pl is Dictionary else [], f.get("x", []) if f is Dictionary else [])
	_carry_lbl.visible = _carry_lbl.text != ""
	if not _bank: return
	var be := _bank_entry(li)
	if be.is_empty(): return
	for sp in _chips: (_chips[sp] as Button).set_pressed_no_signal(str(sp) == str(be.species))
	if _bank_kg != null and not _bank_kg._drag and _bank_kg._timer.is_stopped(): _bank_kg.set_value(float(be.kgPerH))
	if _name_lbl != null: _name_lbl.text = (EqStrings.formula(str(be.species)) + " BANK").to_upper()   # the tape follows the chip
	var kt := "%.2f" % float(be.kmolPerH)   # one number, one rounding: the engine's banks[].kmolPerH, everywhere
	if _kmol_lbl != null: _kmol_lbl.text = "= " + kt + " kmol/h"
	if _cells.has("flow") and readouts.has("flow"):
		(_cells.flow[1] as Label).text = kt; readouts["flow"]["text"] = kt

# ---- placement on screen -----------------------------------------------------------------------------------------------------
## Plates dock to the right edge of the screen above the console (never over the unit being piped); the second plate sits to the left of the first.
## The leader line from the plate to its unit is kept (`_draw`).
func _place(force := false) -> void:
	if app == null: return
	var vr := get_viewport().get_visible_rect().size
	var sz := get_combined_minimum_size().max(size)   # wrapped text settles a frame late: trust whichever is larger
	var ch0 = app.get("chrome")
	var bot0 := vr.y - (float(ch0.console_height()) if ch0 != null and ch0.has_method("console_height") else 190.0) - 10.0
	if _dock_pos.x >= 0.0 and not force and vr == _dock_vr:   # a docked plate stays where it is while the player edits: nothing re-lays it out between clicks
		var rc0 := Rect2(_dock_pos, sz); var hit := rc0.end.y > bot0 + 4.0
		for bayn0 in ["bay", "lvbay"]:
			var bw0 = app.get(bayn0)
			if bw0 == null or not is_instance_valid(bw0) or not (bw0 as Control).visible or (bayn0 == "lvbay" and not bw0.active()): continue
			if rc0.intersects((bw0 as Control).get_global_rect().grow(6.0)): hit = true
		for k0 in plates:
			var o0 = plates[k0]
			if o0 == self or not is_instance_valid(o0) or (o0 as Faceplate)._order > _order: continue
			if rc0.intersects(Rect2((o0 as Faceplate).position, (o0 as Faceplate).size)): hit = true
		if not hit:
			if not position.is_equal_approx(_dock_pos): position = _dock_pos; queue_redraw()
			return
	var x := vr.x - 12.0
	for k in plates:
		var o = plates[k]
		if o == self or not is_instance_valid(o) or (o as Faceplate)._order > _order: continue
		x -= maxf((o as Faceplate).get_combined_minimum_size().x, (o as Faceplate).size.x) + 14.0
	x -= sz.x
	var ch = app.get("chrome")
	var bottom := vr.y - (float(ch.console_height()) if ch != null and ch.has_method("console_height") else 190.0) - 10.0
	var pos := Vector2(maxf(8.0, x), maxf(56.0, bottom - sz.y))
	# never over the instrument bay or the level-view bay: step left of whatever is in the way
	for bayn in ["bay", "lvbay"]:
		var bw = app.get(bayn)
		if bw == null or not is_instance_valid(bw) or not (bw as Control).visible: continue
		if bayn == "lvbay" and not bw.active(): continue
		var br: Rect2 = (bw as Control).get_global_rect()
		if Rect2(pos, sz).intersects(br.grow(6.0)): pos.x = maxf(8.0, br.position.x - 10.0 - sz.x)
	# stepping left of the bay may land on an older plate that stepped left of it too: clear that plate as well
	for k in plates:
		var o2 = plates[k]
		if o2 == self or not is_instance_valid(o2) or (o2 as Faceplate)._order > _order: continue
		var orc := Rect2((o2 as Faceplate).position, maxf((o2 as Faceplate).size.x, (o2 as Faceplate).get_combined_minimum_size().x) * Vector2.RIGHT + Vector2(0, (o2 as Faceplate).size.y))
		if Rect2(pos, sz).intersects(orc.grow(4.0)): pos.x = maxf(8.0, orc.position.x - 14.0 - sz.x)
	var sp := Vector2.ZERO
	if app.world != null and app.world.has_method("unit_screen_pos"): sp = app.world.unit_screen_pos(unit_id)
	if CbLayout.phone and sz.x > 40.0: pos = _phone_pos(vr, sz, bottom, sp)
	if sz.x > 40.0 and get_child_count() > 0 and size.x > 40.0 and size.x >= get_combined_minimum_size().x - 1.0 and size.y >= get_combined_minimum_size().y - 1.0: _dock_pos = pos; _dock_vr = vr
	if not force and pos.is_equal_approx(position) and sp.is_equal_approx(_last_pos): return
	_last_pos = sp; position = pos
	# the card never hides the unit it is about: when the unit sits under the card, the plot slides left (once per card) until it is clear
	if not _uncovered and sp.x > -3000.0 and app.world != null and app.world.get("cam_rig") != null and size.x > 40.0:
		var pr := Rect2(pos, sz).grow(28.0)
		if pr.has_point(sp): _uncovered = true   # the camera stays where the player put it: the plate docks in the side column instead
	queue_redraw()

## Phone: the plate docks in the side column farther from the tapped unit, never over the bottom bar, the Equilibrium window or the unit itself.
func _fit_scroll(avail_h: float) -> void:
	if _scroll == null or _scroll.get_child_count() == 0 or _head_box == null: return
	var inner := _scroll.get_child(0) as Control
	var want := inner.get_combined_minimum_size()
	var maxh := maxf(90.0, avail_h - _head_box.get_combined_minimum_size().y - (_foot.get_combined_minimum_size().y if _foot != null else 0.0) - 34.0)
	var h := clampf(want.y, 60.0, maxh)
	_scroll.custom_minimum_size = Vector2(want.x + (14.0 if want.y > maxh else 0.0), h)
func _phone_pos(vr: Vector2, sz: Vector2, bottom: float, sp: Vector2) -> Vector2:
	var top := 56.0
	var y := maxf(top, minf(bottom - sz.y, vr.y))
	var xs: Array = [vr.x - 12.0 - sz.x, 8.0] if sp.x < vr.x * 0.5 else [8.0, vr.x - 12.0 - sz.x]
	for k in plates:   # a second plate takes the column the first one left free
		var o = plates[k]
		if o == self or not is_instance_valid(o) or (o as Faceplate)._order > _order: continue
		var orc := Rect2((o as Faceplate).position, (o as Faceplate).size)
		xs = xs.filter(func(x): return not Rect2(Vector2(x, y), sz).intersects(orc)) + xs.filter(func(x): return Rect2(Vector2(x, y), sz).intersects(orc))
	var best := Vector2(xs[0], y)
	for x in xs:
		var r := Rect2(Vector2(x, y), sz); var bad := r.grow(30.0).has_point(sp)
		for bayn in ["bay", "lvbay"]:
			var bw = app.get(bayn)
			if bw == null or not is_instance_valid(bw) or not (bw as Control).visible or (bayn == "lvbay" and not bw.active()): continue
			if r.intersects((bw as Control).get_global_rect().grow(6.0)): bad = true
		if not bad: return Vector2(x, y)
	return best

func _process(_dt: float) -> void:
	if _pad_hint != null: _pad_hint.visible = CbKit.pad_mode
	if CbLayout.phone and _scroll != null and app != null:
		var ch = app.get("chrome")
		var vh := get_viewport().get_visible_rect().size.y
		_fit_scroll(vh - (float(ch.console_height()) if ch != null and ch.has_method("console_height") else 100.0) - 10.0 - 56.0)
	_place()
	for b in _boxes: if is_instance_valid(b) and bool(b.get_meta("coach", false)): (b as Control).queue_redraw()

func _draw() -> void:   # the leader line from the plate's edge to the unit
	if app == null or app.world == null or not app.world.has_method("unit_screen_pos"): return
	var sp: Vector2 = app.world.unit_screen_pos(unit_id) - global_position
	if sp.x < -3000.0: return
	var from := Vector2(0.0 if sp.x < size.x * 0.5 else size.x, clampf(sp.y, 14.0, size.y - 14.0))
	draw_dashed_line(from, sp, EqTheme.INK, 1.0, 5.0, true); draw_circle(sp, 3.0, EqTheme.INK)   # thin, dashed, ink: never mistaken for a pipe

# ---- the piping hub ----------------------------------------------------------------------------------------------------------
class Hub extends Node:
	var app = null
	var from_unit := ""
	var from_port := ""
	var from_inlet := false
	var legal: Array = []
	var hover_id := ""
	var chained := false          ## F25: the pipe in hand was re-armed by the chain (a pipe dropped on an inlet carries on from that unit's next free outlet)
	static var chain_hint_said := false

	func connect_world() -> void:
		var w = app.world
		if w == null: return
		if w.has_signal("unit_clicked") and not w.unit_clicked.is_connected(_on_unit): w.unit_clicked.connect(_on_unit)
		if w.has_signal("port_clicked") and not w.port_clicked.is_connected(_on_port): w.port_clicked.connect(_on_port)
		if w.has_signal("place_requested") and not w.place_requested.is_connected(_on_place): w.place_requested.connect(_on_place)
		if w.has_signal("chain_ended") and not w.chain_ended.is_connected(_on_chain_end): w.chain_ended.connect(_on_chain_end)
		if w.has_signal("unit_hover") and not w.unit_hover.is_connected(_on_unit_hover): w.unit_hover.connect(_on_unit_hover)
		if app.b != null and not app.b.changed.is_connected(_on_changed): app.b.changed.connect(_on_changed)
		StreamTag.attach(app)

	## Esc clears everything in one press: the stream tag and pipe highlight, faceplates and the selection, a placement ghost, a half-made pipe and the delete
	## strip. Returns true when something was cleared (the pause menu stays shut).
	## Esc closes one layer per press: first what the hand is doing (a confirm, a half-made pipe, the placement ghost), then the panels (stream tag, pipe highlight, plates, selection);
	## only when nothing is left does Esc reach the pause plate.
	func close_one() -> bool:
		var w = app.world
		var did := false
		if _confirm != null: _drop_confirm(); did = true
		if from_unit != "": clear_pipe(); did = true
		if w != null and w.placing != "":
			w.cancel_place(); did = true
			# the parts tile that was clicked keeps keyboard focus, and a focused tile is drawn like a chosen one: it must not look like the tool is still in hand
			var fo = app.get_viewport().gui_get_focus_owner()
			if fo != null and fo.get_script() != null and str((fo.get_script() as Script).resource_path).ends_with("parts_rack.gd"): fo.release_focus()
		if did: _refresh_ports(); return true
		var tag = app.root.get_node_or_null("StreamTag")
		if tag != null and tag.visible: tag.dismiss(); did = true
		if w != null and w.pipes != null and w.pipes.selected != "": w.pipes.select(""); did = true
		if not Faceplate.plates.is_empty() or (w != null and w.selected_id != ""):
			Faceplate.close_all()
			if w != null: w.select("")
			hover_id = ""; did = true
		if did: _refresh_ports()
		return did

	# ---- delete: Delete / Backspace, the bin key-caps, pad X held --------------------------------------------------------------------------------
	var _confirm: PanelContainer
	var _hold := 0.0
	var _holding := false

	func _unhandled_key_input(e: InputEvent) -> void:
		if not (e is InputEventKey) or not e.pressed or e.echo or app == null or not app.started or app.modal() != null: return
		if (e.ctrl_pressed or e.meta_pressed) and (e.keycode == KEY_Z or e.keycode == KEY_Y) and not e.alt_pressed:
			var fo = get_viewport().gui_get_focus_owner()
			if fo is LineEdit or fo is TextEdit or fo is SpinBox: return
			get_viewport().set_input_as_handled(); undo_redo(e.keycode == KEY_Y or e.shift_pressed); return
		if e.keycode != KEY_DELETE and e.keycode != KEY_BACKSPACE: return
		var f = get_viewport().gui_get_focus_owner()
		if f is LineEdit or f is TextEdit: return
		if _confirm != null and is_instance_valid(_confirm):   # Delete again on the open confirm answers yes
			var cid := str(_confirm.get_meta("unit", ""))
			get_viewport().set_input_as_handled(); _do_delete(cid); return
		if delete_selected(false): get_viewport().set_input_as_handled()

	func _input(e: InputEvent) -> void:
		if e is InputEventJoypadButton and e.button_index == JOY_BUTTON_X and CbPad.enabled and app != null and app.started and app.world.placing == "":
			_holding = e.pressed; _hold = 0.0

	func _process(dt: float) -> void:
		if from_unit != "" and app != null and app.world != null and app.world.placing != "": clear_pipe()   # F25: a part taken from the rack drops the pipe in hand
		if not _holding: return
		_hold += dt
		if _hold >= 0.8:
			_holding = false; _hold = 0.0
			delete_selected(true)

	## What a Delete press acts on: a highlighted pipe first, else the selected unit.
	func delete_selected(confirmed: bool) -> bool:
		var w = app.world
		if w == null: return false
		if w.pipes != null and w.pipes.selected != "": return delete_pipe(str(w.pipes.selected))
		if w.selected_id != "": return delete_unit(str(w.selected_id), confirmed)
		return false

	func pipes_of(id: String) -> int:
		var c = PaperStrings.q(app, "unitCard", [id]); var n := 0
		if not (c is Dictionary): return 0
		for k in ["inlets", "outlets"]: for p in c.get(k, []): if p.get("stream") != null: n += 1
		return n

	func delete_pipe(id: String) -> bool:
		var r: Dictionary = app.b.act("disconnect", [id])
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return false
		var tag = app.root.get_node_or_null("StreamTag")
		if tag != null: tag.dismiss()
		if app.world.pipes != null: app.world.pipes.select("")
		_refresh_ports(); return true

	## Delete a unit. With pipes on it the first call shows the small Dymo confirm strip (or deletes at once when `confirmed`, a held X).
	func delete_unit(id: String, confirmed: bool) -> bool:
		var n := pipes_of(id)
		if n > 0 and not confirmed:
			_ask(id, n); return true
		return _do_delete(id)

	func _do_delete(id: String) -> bool:
		_drop_confirm()
		if Faceplate.plates.has(id) and is_instance_valid(Faceplate.plates[id]): (Faceplate.plates[id] as Faceplate).close()
		app.world.select(""); hover_id = ""   # before the engine changes: nothing may ask about the unit once it is gone
		var r: Dictionary = app.b.act("deleteUnit", [id])
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return false
		app.world.select(""); hover_id = ""; clear_pipe(); _refresh_ports(); return true

	func _drop_confirm() -> void:
		if _confirm != null and is_instance_valid(_confirm): _confirm.queue_free()
		_confirm = null

	func _ask(id: String, n: int) -> void:
		_drop_confirm()
		var pn := PanelContainer.new(); pn.name = "DeleteAsk"; pn.add_theme_stylebox_override("panel", EqTheme.porcelain_sb(4, 8.0))
		var hb := HBoxContainer.new(); hb.add_theme_constant_override("separation", 10); pn.add_child(hb)
		hb.add_child(EqTheme.dymo(id, 14))
		var txt := PaperStrings.t("DEL_ASK1") % id if n == 1 else PaperStrings.t("DEL_ASK") % [id, n]
		hb.add_child(EqTheme.label(txt, 16, EqTheme.INK, "semi"))
		var yes := EqTheme.key_button(PaperStrings.t("DEL_YES"), true, 15); yes.name = "Yes"; yes.custom_minimum_size = Vector2(0, 36); yes.pressed.connect(func(): _do_delete(id)); hb.add_child(yes)
		var no := EqTheme.key_button(PaperStrings.t("DEL_NO"), false, 15); no.name = "No"; no.custom_minimum_size = Vector2(0, 36); no.pressed.connect(_drop_confirm); hb.add_child(no)
		pn.set_meta("unit", id); pn.z_index = 100; pn.focus_mode = Control.FOCUS_NONE
		app.root.add_child(pn); _confirm = pn
		var vr := pn.get_viewport().get_visible_rect().size
		var ch = app.get("chrome")
		pn.reset_size(); await pn.get_tree().process_frame
		if not is_instance_valid(pn): return
		var bottom := vr.y - (float(ch.console_height()) if ch != null and ch.has_method("console_height") else 190.0) - 12.0
		pn.position = Vector2(clampf((vr.x - pn.size.x) * 0.5, 4.0, maxf(4.0, vr.x - pn.size.x - 4.0)), clampf(bottom - pn.size.y, 4.0, maxf(4.0, vr.y - pn.size.y - 4.0)))
		pn.move_to_front(); no.grab_focus()   # in front of every plate; focus on Keep, so Enter never deletes by accident

	## ctrl+z / ctrl+y (ctrl+shift+z): the engine's undo / redo in DESIGN, with a toast. A refusal (nothing to undo, plant running) is the engine's own text.
	func undo_redo(redo: bool) -> Dictionary:
		if not _designing(): app.toast("Stop the run and go back to DESIGN to undo.", "info"); return {}
		var r: Dictionary = app.b.act("redo" if redo else "undo")
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "info"); return r
		clear_pipe(); _drop_confirm(); hover_id = ""
		for pid in Faceplate.plates.keys():
			if not _alive(str(pid)) and is_instance_valid(Faceplate.plates[pid]): (Faceplate.plates[pid] as Faceplate).close()
		if app.world.selected_id != "" and not _alive(str(app.world.selected_id)): app.world.select("")
		app.toast(PaperStrings.t("REDO_DONE") if redo else PaperStrings.t("UNDO_DONE"), "info")
		_refresh_ports(); return r

	func _on_place(type: String, x: int, y: int, rot: int) -> void:
		var r: Dictionary = app.b.act("placeUnit", [type, x, y, rot])
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return
		app.world.cancel_place()
		var id := str(r.get("id", ""))
		if id != "": app.world.select(id); show_free_ports(id)

	func _on_unit(id: String) -> void:
		if app.world.placing != "": return
		if from_unit != "" and id != "" and id != from_unit:   # a pipe in hand and a click on another unit's body: its one legal port takes it
			var cands: Array = legal.filter(func(t): return str(t.unit) == id)
			if cands.size() == 1: _on_port(id, str(cands[0].port), not from_inlet); return
			if cands.size() > 1: app.toast(PaperStrings.t("PIPE_WHICH") % [id, ", ".join(PackedStringArray(cands.map(func(t): return cap(str(t.port), not from_inlet))))], "info"); return
			app.toast(PaperStrings.t("PIPE_NOFIT") % id, "warn"); return   # no legal port on that unit: the pipe stays in hand, nothing attaches
		clear_pipe()
		if id == "":
			for k in Faceplate.plates.keys(): if not (Faceplate.plates[k] as Faceplate).pinned: (Faceplate.plates[k] as Faceplate).close()
			_refresh_ports(); return
		Faceplate.open(app, id); _refresh_ports(); Faceplate.note_window_read(app, id)

	func _on_unit_hover(id: String) -> void:
		hover_id = id
		if from_unit == "" and app.world.placing == "": _refresh_ports()

	## Free ports of the selected unit and of the one under the cursor (pips with their V / L / OUT / IN caps); a half-made pipe shows its own targets instead.
	func _refresh_ports() -> void:
		if from_unit != "": _light_targets(); return
		var marks: Array = []
		var seen := {}
		for id in [app.world.selected_id, hover_id]:
			if str(id) == "" or seen.has(str(id)) or not app.world.unit_ids().has(str(id)) or not _alive(str(id)): continue
			seen[str(id)] = true; marks.append_array(_free_ports(str(id)))
		if _designing():   # DESIGN: every unit's free ports are always on show, small and quiet (no captions) until the unit is selected or hovered
			for id in app.world.unit_ids():
				if seen.has(str(id)) or not _alive(str(id)): continue
				for m in _free_ports(str(id)): m["subtle"] = true; m["label"] = ""; marks.append(m)
		app.world.show_ports(marks)

	func _designing() -> bool:
		var ch = app.get("chrome")
		return ch == null or not ch.has_method("engine_phase") or str(ch.engine_phase()) == "design"

	## The engine still has this unit (the world may be a frame behind a deletion).
	func _alive(id: String) -> bool:
		for u in app.b.g.get("units", []): if str(u.get("id", "")) == id: return true
		return false

	func _on_changed() -> void:
		if from_unit != "": _light_targets()
		else: _refresh_ports.call_deferred()   # after the world has synced its units (a unit placed this tick has a body to hang its pips on)

	func _free_ports(id: String) -> Array:
		var out: Array = []
		var c = PaperStrings.q(app, "unitCard", [id])
		if not (c is Dictionary) or (c as Dictionary).is_empty(): return out
		for p in c.outlets: if p.stream == null: out.append({"unit": id, "port": str(p.port), "inlet": false, "hot": false, "label": cap(str(p.port), false)})
		for p in c.inlets: if p.stream == null: out.append({"unit": id, "port": str(p.port), "inlet": true, "hot": false, "label": cap(str(p.port), true)})
		return out

	## The tiny cap beside a port pip: outlets V / L / OUT by their engine port name (vap / liq / out), inlets IN (IN1, IN2 when numbered).
	static func cap(port: String, inlet: bool) -> String:
		match port:
			"hot_in": return "HOT IN"
			"hot_out": return "HOT OUT"
			"cold_in": return "COLD IN"
			"cold_out": return "COLD OUT"
			"vap": return "V"
			"liq": return "L"
			"out": return "OUT"
		if inlet: return "IN" + (port.right(1) if port.right(1).is_valid_int() else "")
		return port.to_upper().left(5)

	func show_free_ports(id: String) -> void: app.world.show_ports(_free_ports(id))

	func clear_pipe() -> void:
		from_unit = ""; from_port = ""; legal = []; chained = false
		if app != null and app.world != null: app.world.pipe_chained = false
		if app != null and app.world != null and app.world.has_method("set_pipe_ghost"): app.world.set_pipe_ghost("", "", false)

	func _light_targets() -> void:
		var q = PaperStrings.q(app, "legalPorts", [from_unit, from_port])
		legal = (q.get("targets", []) if q is Dictionary else [])
		var marks: Array = []
		var seen := {}
		for id in app.world.unit_ids():
			for m in _free_ports(str(id)):
				if str(id) == from_unit and str(m.port) == from_port: m.hot = true
				elif bool(m.inlet) != from_inlet:   # the opposite kind is a candidate; legal ones glow
					for t in legal: if t.unit == m.unit and t.port == m.port: m.hot = true
				else: marks.append(m); seen[str(m.unit) + ":" + str(m.port)] = true; continue   # F25: with a pipe in hand (the chain's, or one a click began) every free port of its own kind stays clickable too: a press on one restarts the pipe from it, and a drag from it works (a half-made pipe made that a silent refusal)
				marks.append(m); seen[str(m.unit) + ":" + str(m.port)] = true
		app.world.show_ports(marks)

	func _on_port(unit: String, port: String, inlet: bool) -> void:
		if app.world.placing != "": return
		if from_unit == "":
			from_unit = unit; from_port = port; from_inlet = inlet
			_light_targets()
			if legal.is_empty(): app.toast(PaperStrings.t("PIPE_NONE") % [unit, port], "warn"); clear_pipe(); show_free_ports(unit); return
			app.world.set_pipe_ghost(unit, port, inlet)
			app.toast((PaperStrings.t("PIPE_FROM") if not inlet else PaperStrings.t("PIPE_FROM_IN")) % unit, "info"); return
		if unit == from_unit and port == from_port:
			if chained: return   # the chain armed this port for you: a click on it again keeps the pipe in hand
			clear_pipe(); show_free_ports(unit); return
		if inlet == from_inlet:   # same kind: restart from this port
			clear_pipe(); _on_port(unit, port, inlet); return
		var a: Array = [from_unit, from_port, unit, port] if not from_inlet else [unit, port, from_unit, from_port]
		var r: Dictionary = app.b.act("connect", a)
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return   # the engine's teaching refusal
		app.toast(PaperStrings.t("PIPE_DONE") % [a[0], a[2]], "good")
		var was_outlet := not from_inlet
		clear_pipe(); show_free_ports(unit)
		if was_outlet: _chain_on(unit)

	## F25 chained piping: the pipe tool re-arms from the first free outlet of the unit the pipe was just dropped on (the main "out" first, then the others), so a train is
	## piped with one move per link. A unit with no free outlet (a tank, the stack) ends the chain. The first chain says so on the intercom.
	func _chain_on(unit: String) -> void:
		var outs: Array = _free_ports(unit).filter(func(m): return not bool(m.inlet))
		outs.sort_custom(func(a, b): return (0 if str(a.port) == "out" else 1) < (0 if str(b.port) == "out" else 1))
		for m in outs:
			from_unit = unit; from_port = str(m.port); from_inlet = false; chained = true
			_light_targets()
			if legal.is_empty(): clear_pipe(); continue
			app.world.pipe_chained = true
			app.world.set_pipe_ghost(unit, from_port, false)
			if not Hub.chain_hint_said:
				Hub.chain_hint_said = true
				app.toast(PaperStrings.t("PIPE_CHAIN_HINT"), "info")
			else: app.toast(PaperStrings.t("PIPE_FROM") % unit, "info")
			return

	## The world answered a click on empty ground while a chained pipe was in hand: the chain ends.
	func _on_chain_end() -> void:
		if from_unit == "": return
		var u := from_unit
		clear_pipe(); show_free_ports(u)
