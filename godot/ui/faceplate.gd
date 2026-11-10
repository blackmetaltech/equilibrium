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
var _last_pos := Vector2(-1, -1)
var _order := 0
var _cmd := {}                       # knob key -> SI value commanded during a shift (the ramp target; shown as SP until the plant gets there)
var _bank := false                   # a cylinder bank (L01 / L04): species chips and one kg/h knob
var _bank_sp: Array = []             # the species a bank can carry (levelInfo.bankSpecies)
var _chips := {}                     # species -> Button
var _bank_kg: Knob
var _kmol_lbl: Label
var _carry_lbl: Label
static var _seq := 0
const MAX_PLATES := 2

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
		draw_string(f2, Vector2(2, 12), "PV", HORIZONTAL_ALIGNMENT_LEFT, -1, s, EqTheme.INK)
		draw_string(f2, Vector2(2, size.y - 4.0), sp_label, HORIZONTAL_ALIGNMENT_LEFT, -1, s, EqTheme.RED)

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
	return fp

static func close_all() -> void:
	for k in plates.keys():
		if is_instance_valid(plates[k]): (plates[k] as Faceplate).close()
	plates.clear()

func close() -> void:
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

func refresh() -> void:
	if app == null: return
	var c := _query_card()
	if c.is_empty(): close(); return
	card = c
	var li := _li()
	var bsp: Array = li.get("bankSpecies", []) if str(c.type) == "feed" else []
	var sig := str(c.type) + "|" + ",".join((c.knobs as Array).map(func(k): return str(k.key))) + "|" + str(c.get("feed", null) != null) + "|" + ",".join(bsp.map(func(x): return str(x))) + "|" + str((li.get("masked", []) as Array).has(unit_id))
	if sig != _sig: _sig = sig; _rebuild()
	_update()

func _rebuild() -> void:
	for ch in get_children(): ch.queue_free()
	knobs.clear(); _cells.clear(); _chips.clear(); _bank_kg = null; _kmol_lbl = null; _carry_lbl = null
	var li0 := _li()
	_bank_sp = li0.get("bankSpecies", []) if str(card.type) == "feed" else []
	_bank = not _bank_sp.is_empty() and card.get("feed") != null
	_body = VBoxContainer.new(); _body.add_theme_constant_override("separation", 8); add_child(_body)
	# header: ISA tag on Dymo tape, the unit's name below, pin and close
	var head := HBoxContainer.new(); head.add_theme_constant_override("separation", 6); _body.add_child(head)
	var tags := VBoxContainer.new(); tags.add_theme_constant_override("separation", 2); tags.size_flags_horizontal = Control.SIZE_EXPAND_FILL; head.add_child(tags)
	var tag := EqTheme.dymo(str(card.id), 16); tag.name = "Tag"; tags.add_child(tag)
	var nm := EqTheme.dymo(str(card.label) if not _bank else EqStrings.formula(str(_bank_sp[0])) + " BANK", 12); nm.name = "Name"; tags.add_child(nm)
	if str(card.type) == "feed":   # every feed says what it carries
		_carry_lbl = EqTheme.label("", 14, EqTheme.INK, "mono_bold"); _carry_lbl.name = "Carries"; _carry_lbl.label_settings = EqStrings.ls(14, EqTheme.INK, "cap"); tags.add_child(_carry_lbl)
	_pin = _tiny(PaperStrings.t("FP_PIN"), func(): pinned = not pinned; _pin.text = PaperStrings.t("FP_UNPIN") if pinned else PaperStrings.t("FP_PIN")); head.add_child(_pin)
	var x := _tiny("×", func(): close()); x.name = "Close"; head.add_child(x)
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
			ch.add_theme_stylebox_override("normal", _chip_sb(false)); ch.add_theme_stylebox_override("hover", _chip_sb(false, true)); ch.add_theme_stylebox_override("pressed", _chip_sb(true)); ch.add_theme_stylebox_override("hover_pressed", _chip_sb(true)); ch.add_theme_stylebox_override("focus", _chip_sb(false, true))
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
	if (card.knobs as Array).is_empty() and not _bank:
		var nl := EqTheme.label("—", 18, EqTheme.INK.lerp(EqTheme.PORCELAIN, 0.5), "mono"); nl.custom_minimum_size = Vector2(90, 40); _knob_box.add_child(nl)
	_body.add_child(HSeparator.new())
	# readouts, two cells per row (kmol/h beside kg/h)
	var grid := GridContainer.new(); grid.columns = 2; grid.add_theme_constant_override("h_separation", 10); grid.add_theme_constant_override("v_separation", 2); _body.add_child(grid)
	for key in ["flow", "mass", "T", "P", "duty"]: _cell(grid, key)
	_need = EqTheme.label("", 14, EqTheme.RED, "semi"); _need.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; _need.custom_minimum_size = Vector2(150, 0); _body.add_child(_need)
	var bt := HBoxContainer.new(); bt.add_theme_constant_override("separation", 4); _body.add_child(bt)
	_why = _btn(PaperStrings.t("FP_WHY"), _on_why); _lens = _btn(PaperStrings.t("FP_LENS"), func(): _open_extra("open_lens")); _win = _btn(PaperStrings.t("FP_WINDOW"), func(): _open_extra("open_window"))
	for b in [_why, _lens, _win]: bt.add_child(b)

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
	var kn := Knob.new(); kn.app = app
	var unit := str(k.unit)
	var lab := str(k.label)
	if str(k.kind) == "choice":
		var opts: Array = k.options
		kn.setup(lab, "", 0.0, float(opts.size() - 1), 1.0, 1.0, float(opts.find(str(k.value))), true, opts)
	else:
		var d0 := EqFmt.to_disp(0.0, unit); var lo := EqFmt.to_disp(float(k.min), unit); var hi := EqFmt.to_disp(float(k.max), unit)
		var coarse := EqFmt.to_disp(float(k.coarse), unit) - d0; var fine := EqFmt.to_disp(float(k.fine), unit) - d0
		kn.setup(lab, PaperStrings.usym(unit), lo, hi, coarse, fine, EqFmt.to_disp(float(k.value), unit), bool(k.get("int", false)))
	kn.name = "Knob_" + str(k.key); kn.set_meta("key", str(k.key)); kn.set_meta("spec", k)
	kn.committed.connect(func(v: float) -> void: _commit(k, v))
	_knob_box.add_child(kn); knobs[str(k.key)] = kn

func _commit(k: Dictionary, v: float) -> void:
	var val: Variant
	if str(k.kind) == "choice": val = str((k.options as Array)[clampi(int(round(v)), 0, (k.options as Array).size() - 1)])
	else: val = EqFmt.to_si(v, str(k.unit))
	var shift := _phase() == "shift"   # during a shift the knob is a set point: the actuator ramps the plant to it (setParam is a design-phase action)
	var r: Dictionary = app.b.act("setpoint" if shift else "setParam", [unit_id, str(k.key), val])
	if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn")
	elif shift and typeof(val) == TYPE_FLOAT: _cmd[str(k.key)] = val
	refresh()

func _on_why() -> void:
	var n = PaperStrings.q(app, "needs", [unit_id])
	if n is Dictionary and not (n as Dictionary).is_empty(): app.toast(str(n.text), "warn"); return
	var diags: Array = card.get("diags", [])
	if not diags.is_empty(): app.toast(str(diags[0].message), "warn"); return
	app.toast(PaperStrings.t("FP_NOSOLVE") if card.get("results") == null else str(card.label), "info")

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
	_set_cell("flow", PaperStrings.t("FP_FLOW") + " " + PaperStrings.t("FP_KMOLH"), flow, "kmol/h")
	var mass: Variant = null
	if st.has("mass"): mass = float(st.mass) * 3600.0
	for k in ["massKgh", "kgh", "mass_kgh"]:
		if is_feed and feed.has(k) and mass == null: mass = float(feed[k])
	_set_cell("mass", PaperStrings.t("FP_MASS") + " " + PaperStrings.t("FP_KGH"), mass, "kg/h", "raw")
	_set_cell("T", "T " + PaperStrings.usym("degC"), st.get("T") if st.has("T") else (float(feed.T) if is_feed and feed.has("T") else null), "degC")
	_set_cell("P", "P " + PaperStrings.usym("bar"), st.get("P") if st.has("P") else (float(feed.P) if is_feed and feed.has("P") else null), "bar")
	var res: Variant = card.get("results")
	var duty: Variant = null; var dcap := PaperStrings.t("FP_DUTY") + " kW"
	if res is Dictionary:
		if (res as Dictionary).has("duty"): duty = float(res.duty)
		elif (res as Dictionary).has("work"): duty = float(res.work); dcap = PaperStrings.t("FP_WORK") + " kW"
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
		if kn == null or kn._drag: continue
		if str(k.kind) == "choice": kn.set_value(float((k.options as Array).find(str(k.value))))
		elif _cmd.has(str(k.key)): kn.set_value(EqFmt.to_disp(float(_cmd[str(k.key)]), str(k.unit)))
		else: kn.set_value(EqFmt.to_disp(float(k.value), str(k.unit)))
	_update_feed_info()
	var need = PaperStrings.q(app, "needs", [unit_id])
	_need.text = str(need.text) if need is Dictionary and not (need as Dictionary).is_empty() else (PaperStrings.t("FP_FAILED") if bool(card.get("failed", false)) else "")
	_need.visible = _need.text != ""
	_lens.disabled = app == null or not app.has_method("open_lens"); _win.disabled = app == null or not app.has_method("open_window")
	reset_size()

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
	if _bank_kg != null and not _bank_kg._drag: _bank_kg.set_value(float(be.kgPerH))
	if _kmol_lbl != null: _kmol_lbl.text = "= " + PaperStrings.num(float(be.kmolPerH)) + " kmol/h"

# ---- placement on screen -----------------------------------------------------------------------------------------------------
## Plates dock to the right edge of the screen above the console (never over the unit being piped); the second plate sits to the left of the first.
## The leader line from the plate to its unit is kept (`_draw`).
func _place(force := false) -> void:
	if app == null: return
	var vr := get_viewport().get_visible_rect().size
	var sz := get_combined_minimum_size().max(size)   # wrapped text settles a frame late: trust whichever is larger
	var x := vr.x - 12.0
	for k in plates:
		var o = plates[k]
		if o == self or not is_instance_valid(o) or (o as Faceplate)._order > _order: continue
		x -= maxf((o as Faceplate).get_combined_minimum_size().x, (o as Faceplate).size.x) + 14.0
	x -= sz.x
	var ch = app.get("chrome")
	var bottom := vr.y - (float(ch.console_height()) if ch != null and ch.has_method("console_height") else 190.0) - 10.0
	var pos := Vector2(maxf(8.0, x), maxf(56.0, bottom - sz.y))
	var sp := Vector2.ZERO
	if app.world != null and app.world.has_method("unit_screen_pos"): sp = app.world.unit_screen_pos(unit_id)
	if not force and pos.is_equal_approx(position) and sp.is_equal_approx(_last_pos): return
	_last_pos = sp; position = pos
	queue_redraw()

func _process(_dt: float) -> void: _place()

func _draw() -> void:   # the leader line from the plate's edge to the unit
	if app == null or app.world == null or not app.world.has_method("unit_screen_pos"): return
	var sp: Vector2 = app.world.unit_screen_pos(unit_id) - global_position
	if sp.x < -3000.0: return
	var from := Vector2(0.0 if sp.x < size.x * 0.5 else size.x, clampf(sp.y, 14.0, size.y - 14.0))
	draw_line(from, sp, EqTheme.PORCELAIN, 2.0, true); draw_circle(sp, 4.0, EqTheme.TEAL)

# ---- the piping hub ----------------------------------------------------------------------------------------------------------
class Hub extends Node:
	var app = null
	var from_unit := ""
	var from_port := ""
	var from_inlet := false
	var legal: Array = []
	var hover_id := ""

	func connect_world() -> void:
		var w = app.world
		if w == null: return
		if w.has_signal("unit_clicked") and not w.unit_clicked.is_connected(_on_unit): w.unit_clicked.connect(_on_unit)
		if w.has_signal("port_clicked") and not w.port_clicked.is_connected(_on_port): w.port_clicked.connect(_on_port)
		if w.has_signal("place_requested") and not w.place_requested.is_connected(_on_place): w.place_requested.connect(_on_place)
		if w.has_signal("unit_hover") and not w.unit_hover.is_connected(_on_unit_hover): w.unit_hover.connect(_on_unit_hover)
		if app.b != null and not app.b.changed.is_connected(_on_changed): app.b.changed.connect(_on_changed)
		StreamTag.attach(app)

	## Esc, one layer at a time (main.gd game_menu): the open stream tag, then faceplates and the selection, then a placement ghost or a half-made pipe.
	## Returns true when something was closed (the pause menu stays shut).
	func close_one() -> bool:
		var w = app.world
		var tag = app.root.get_node_or_null("StreamTag")
		if tag != null and tag.visible:
			tag.dismiss()
			if w != null and w.pipes != null: w.pipes.select("")
		elif not Faceplate.plates.is_empty() or (w != null and w.selected_id != ""):
			Faceplate.close_all()
			if w != null: w.select("")
			hover_id = ""
			_refresh_ports()
		elif w != null and w.placing != "": w.cancel_place()
		elif from_unit != "": clear_pipe(); _refresh_ports()
		else: return false
		return true

	func _on_place(type: String, x: int, y: int, rot: int) -> void:
		var r: Dictionary = app.b.act("placeUnit", [type, x, y, rot])
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return
		app.world.cancel_place()
		var id := str(r.get("id", ""))
		if id != "": app.world.select(id); show_free_ports(id)

	func _on_unit(id: String) -> void:
		if app.world.placing != "": return
		clear_pipe()
		if id == "":
			for k in Faceplate.plates.keys(): if not (Faceplate.plates[k] as Faceplate).pinned: (Faceplate.plates[k] as Faceplate).close()
			_refresh_ports(); return
		Faceplate.open(app, id); _refresh_ports()

	func _on_unit_hover(id: String) -> void:
		hover_id = id
		if from_unit == "" and app.world.placing == "": _refresh_ports()

	## Free ports of the selected unit and of the one under the cursor (pips with their V / L / OUT / IN caps); a half-made pipe shows its own targets instead.
	func _refresh_ports() -> void:
		if from_unit != "": _light_targets(); return
		var marks: Array = []
		var seen := {}
		for id in [app.world.selected_id, hover_id]:
			if str(id) == "" or seen.has(str(id)) or not app.world.unit_ids().has(str(id)): continue
			seen[str(id)] = true; marks.append_array(_free_ports(str(id)))
		app.world.show_ports(marks)

	func _on_changed() -> void:
		if from_unit != "": _light_targets()
		else: _refresh_ports()

	func _free_ports(id: String) -> Array:
		var out: Array = []
		var c = PaperStrings.q(app, "unitCard", [id])
		if not (c is Dictionary) or (c as Dictionary).is_empty(): return out
		for p in c.outlets: if p.stream == null: out.append({"unit": id, "port": str(p.port), "inlet": false, "hot": false, "label": cap(str(p.port), false)})
		for p in c.inlets: if p.stream == null: out.append({"unit": id, "port": str(p.port), "inlet": true, "hot": false, "label": cap(str(p.port), true)})
		return out

	## The tiny cap beside a port pip: outlets V / L / OUT by their engine port name (vap / liq / out), inlets IN (IN1, IN2 when numbered).
	static func cap(port: String, inlet: bool) -> String:
		if inlet: return "IN" + (port.right(1) if port.right(1).is_valid_int() else "")
		match port:
			"vap": return "V"
			"liq": return "L"
			"out": return "OUT"
		return port.to_upper().left(5)

	func show_free_ports(id: String) -> void: app.world.show_ports(_free_ports(id))

	func clear_pipe() -> void:
		from_unit = ""; from_port = ""; legal = []

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
				else: continue
				marks.append(m); seen[str(m.unit) + ":" + str(m.port)] = true
		app.world.show_ports(marks)

	func _on_port(unit: String, port: String, inlet: bool) -> void:
		if app.world.placing != "": return
		if from_unit == "":
			from_unit = unit; from_port = port; from_inlet = inlet
			_light_targets()
			if legal.is_empty(): app.toast(PaperStrings.t("PIPE_NONE") % [unit, port], "warn"); clear_pipe(); show_free_ports(unit); return
			app.toast(PaperStrings.t("PIPE_FROM") % unit, "info"); return
		if unit == from_unit and port == from_port: clear_pipe(); show_free_ports(unit); return
		if inlet == from_inlet:   # same kind: restart from this port
			clear_pipe(); _on_port(unit, port, inlet); return
		var a: Array = [from_unit, from_port, unit, port] if not from_inlet else [unit, port, from_unit, from_port]
		var r: Dictionary = app.b.act("connect", a)
		if not bool(r.get("ok", false)): app.toast(str(r.get("message", "")), "warn"); return   # the engine's teaching refusal
		app.toast(PaperStrings.t("PIPE_DONE") % [a[0], a[2]], "good")
		clear_pipe(); show_free_ports(unit)
