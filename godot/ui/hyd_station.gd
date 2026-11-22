class_name HydStation
extends PanelContainer
## F33 (0.9 plant objects): L39's local panel at the foot of the pump house. Physical selectors, not a button strip: a rotary selector knob for the suction size, one for the
## discharge size (schedule-40, 2" to 8": each detent inked by the velocity guide at the design flow, green in the guide, amber too slow, red too fast) and one for the pump
## (P1-P5), the impeller trim (−5 ◀ % ▶ +5) and the pump position (a two-way switch). Every detent is a key: keyboard arrows / the pad's d-pad walk round the dial, A turns
## the knob to it, B puts the selector down. A click on the knob turns it one detent on, the wheel turns it either way. A click on a pipe or the pump in the 3D view puts that
## selector in hand (`take`). The panel is updated in place (focus and knob angles survive a pick); every pick leaves through the board's handlers as a level action.
var board: HydBoard
var view := {}
var sels := {}            ## "suction" | "discharge" | "pump" -> RotarySel
var reads := {}           ## same keys -> the readout Label under each knob
var trim_lbl: Label
var place_keys := {}
var hand := ""
const PANEL_TEXT := Color("#E8EFEA")
const INK_OK := Color("#8BE0A4")
const INK_FAST := Color("#FF8C8C")
const INK_SLOW := Color("#FFC56B")

func _init() -> void:
	var sb := EqTheme.enamel_sb(6, 8.0); sb.content_margin_top = 6; sb.content_margin_bottom = 6
	add_theme_stylebox_override("panel", sb)
	mouse_filter = Control.MOUSE_FILTER_STOP
	var row := HBoxContainer.new(); row.name = "Row"; row.add_theme_constant_override("separation", 8); add_child(row)
	for k in ["suction", "discharge", "pump"]:
		var g := VBoxContainer.new(); g.name = "Group_" + k; g.add_theme_constant_override("separation", 2); row.add_child(g)
		g.add_child(EqTheme.dymo({"suction": "SUCTION LINE", "discharge": "DISCHARGE LINE", "pump": "PUMP"}[k], 13))
		var rs := RotarySel.new(); rs.name = "Sel_" + k; rs.key = k; rs.station = self; g.add_child(rs); sels[k] = rs
		var rd := EqTheme.label("", 16, PANEL_TEXT, "mono_bold"); rd.name = "Read_" + k; rd.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; rd.custom_minimum_size = Vector2(RotarySel.W, 0); g.add_child(rd); reads[k] = rd
	var col := VBoxContainer.new(); col.name = "Group_trim"; col.add_theme_constant_override("separation", 4); row.add_child(col)
	col.add_child(EqTheme.dymo("IMPELLER TRIM", 13))
	var tr := HBoxContainer.new(); tr.add_theme_constant_override("separation", 4); col.add_child(tr)
	for kd in [["TrimDown5", "−5", -5, "Trim the impeller 5 % smaller"], ["TrimDown", "◀", -1, "Trim the impeller 1 % smaller"]]: tr.add_child(_trim_key(kd))
	trim_lbl = EqTheme.label("100 %", 20, Color("#FFB703"), "mono_bold"); trim_lbl.name = "TrimValue"; trim_lbl.custom_minimum_size = Vector2(66, 0); trim_lbl.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER; tr.add_child(trim_lbl)
	for kd in [["TrimUp", "▶", 1, "Back towards the full impeller"], ["TrimUp5", "+5", 5, "5 % back towards the full impeller"]]: tr.add_child(_trim_key(kd))
	col.add_child(EqTheme.dymo("PUMP POSITION", 13))
	var pc := VBoxContainer.new(); pc.name = "Places"; pc.add_theme_constant_override("separation", 4); col.add_child(pc)

func _trim_key(kd: Array) -> Button:
	var b := Ch9Board.key(str(kd[1]), func(): _trim(int(kd[2])), false, 16); b.name = str(kd[0]); b.tooltip_text = str(kd[3]); b.custom_minimum_size = Vector2(40, 34)
	return b

func _trim(step: int) -> void:
	if board != null: board.set_trim(int(view.get("choice", {}).get("trim", 100)) + step)

func set_view(d: Dictionary) -> void:
	view = d
	var ch: Dictionary = d.get("choice", {}); var g: Dictionary = d.get("guide", {}); var op: Dictionary = d.get("op", {})
	for leg in ["suction", "discharge"]:
		var hi := float(g.get("vsHi", 1.5)) if leg == "suction" else float(g.get("vdHi", 3.0)); var lo := 0.0 if leg == "suction" else float(g.get("vdLo", 1.0))
		var pos: Array = []
		for p in d.get("pipes", []):
			var v := float(p.vAtDesign)
			var ink := INK_OK if (v <= hi + 1e-9 and v >= lo - 1e-9) else (INK_FAST if v > hi else INK_SLOW)
			pos.append({"id": str(p.nps), "label": _nps(str(p.nps)), "ink": ink, "name": "Pipe_%s_%s" % [leg, str(p.nps)],
				"tip": "%s schedule 40, ID %s mm, %s a metre installed: %s m/s at the design flow (%s)" % [_nps(str(p.nps)), Ch9Board.fnum(float(p.idMm), 1), str(p.perM), Ch9Board.fnum(v, 2), "in the guide" if ink == INK_OK else ("too fast" if ink == INK_FAST else "too slow")]})
		(sels[leg] as RotarySel).set_positions(pos, str(ch.get(leg, "")))
		var vnow := float(op.get("vs" if leg == "suction" else "vd", 0.0))
		var rd: Label = reads[leg]
		if bool(op.get("ok", false)):
			var okv := vnow <= hi + 1e-9 and vnow >= lo - 1e-9
			rd.text = "%s · %s m/s" % [_nps(str(ch.get(leg, ""))), Ch9Board.fnum(vnow, 2)]
			rd.label_settings = EqTheme.settings(16, INK_OK if okv else (INK_FAST if vnow > hi else INK_SLOW), "mono_bold")
		else:
			rd.text = "%s · no flow" % _nps(str(ch.get(leg, ""))); rd.label_settings = EqTheme.settings(16, PANEL_TEXT, "mono_bold")
	var pp: Array = []
	var sel_p := {}
	for p in d.get("pumps", []):
		pp.append({"id": str(p.id), "label": str(p.id), "ink": PANEL_TEXT, "name": "Pump_" + str(p.id),
			"tip": "%s: shut-off %s m, best efficiency %d %% at %s m³/h and %s m, %s kW motor, %s" % [str(p.label), Ch9Board.fnum(float(p.shutoff), 0), int(round(100.0 * float(p.etaBep))), Ch9Board.fnum(float(p.qBep), 0), Ch9Board.fnum(float(p.hBep), 0), Ch9Board.fnum(float(p.motorKw), 1), str(p.price)]})
		if str(p.id) == str(ch.get("pump", "")): sel_p = p
	(sels.pump as RotarySel).set_positions(pp, str(ch.get("pump", "")))
	(reads.pump as Label).text = "%s m @ %s m³/h" % [Ch9Board.fnum(float(sel_p.get("hBep", 0.0))), Ch9Board.fnum(float(sel_p.get("qBep", 0.0)))] if not sel_p.is_empty() else ""
	(reads.pump as Label).tooltip_text = "best-efficiency head and flow of the pump on the selector"
	trim_lbl.text = "%d %%" % int(ch.get("trim", 100))
	var pc := find_child("Places", true, false) as VBoxContainer
	if place_keys.is_empty() and pc != null:
		for p in d.get("places", []):
			var pid := str(p.id)
			var k := Ch9Board.key(str(p.label).to_upper(), func(): if board != null: board.pick_place(pid), false, 16); k.name = "Place_" + pid; k.custom_minimum_size = Vector2(0, 34)
			k.tooltip_text = "%s: %d m of suction line, %d m of discharge" % [str(p.label), int(p.ls), int(p.ld)]
			pc.add_child(k); place_keys[pid] = k
	for pid in place_keys:
		var on: bool = str(ch.get("place", "")) == pid
		var k: Button = place_keys[pid]
		for st in ["normal", "hover", "pressed"]: k.add_theme_stylebox_override(st, _switch_sb(on, st))
		k.text = ("● " if on else "○ ") + str(_place_label(pid)).to_upper()
	_tint_hand()

func _place_label(pid: String) -> String:
	for p in view.get("places", []):
		if str(p.id) == pid: return str(p.label)
	return pid

func _switch_sb(on: bool, st: String) -> StyleBoxFlat:
	var sb := EqTheme.key_sb(on, st); sb.content_margin_left = 8; sb.content_margin_right = 8; sb.content_margin_top = 2; sb.content_margin_bottom = 2
	return sb

static func _nps(nps: String) -> String: return ("2½" if nps == "2.5" else nps) + "\""

## Put a selector in hand: its knob takes the focus (on its current detent), its group lights, its pipe glows in the plant.
func take(what: String) -> void:
	if not sels.has(what): return
	hand = what
	(sels[what] as RotarySel).focus_current()
	_tint_hand()

func drop() -> void:
	hand = ""
	var fo := get_viewport().gui_get_focus_owner() if is_inside_tree() else null
	if fo != null and is_ancestor_of(fo): fo.release_focus()
	_tint_hand()

func _tint_hand() -> void:
	for k in sels: (sels[k] as RotarySel).hand = k == hand; (sels[k] as RotarySel).queue_redraw()
	var w = _world()
	if w != null and w.has_method("deco") and w.deco() != null and w.deco().hyd != null: w.deco().hyd.set_selected(hand if hand != "pump" else "")

func _world():
	var p := get_parent()
	while p != null:
		if "world" in p and p.get("world") != null: return p.world
		if "app" in p and p.get("app") != null and "world" in p.app: return p.app.world
		p = p.get_parent()
	return null

## A focus that leaves the panel puts the selector down; a detent focused by the keys or the pad puts its knob in hand.
func note_focus(k: String) -> void:
	if hand != k: hand = k; _tint_hand()

func _focus_left() -> void:
	if not is_inside_tree(): return
	var fo := get_viewport().gui_get_focus_owner()
	if hand != "" and (fo == null or not is_ancestor_of(fo)): hand = ""; _tint_hand()

## B / Esc with a selector in hand puts it down (before the pause plate sees the key; the next Esc reaches it).
func _input(e: InputEvent) -> void:
	if hand == "" or not is_visible_in_tree() or not e.is_action_pressed("ui_cancel"): return
	var fo := get_viewport().gui_get_focus_owner()
	if fo == null or not is_ancestor_of(fo): return
	drop(); get_viewport().set_input_as_handled()

## The selector itself: a Bakelite knob on a dial plate, its detents printed round it as keys.
class RotarySel extends Control:
	const W := 150.0
	const H := 132.0
	const R := 56.0            ## detent labels sit on this radius
	const KR := 25.0           ## the knob
	var key := ""
	var station: HydStation
	var positions: Array = []
	var sel := -1
	var hand := false
	var ang := 0.0             ## drawn pointer angle (eases to the selected detent)
	var _keys: Array = []
	var _sig := ""
	func _init() -> void:
		custom_minimum_size = Vector2(W, H); mouse_filter = Control.MOUSE_FILTER_STOP; mouse_default_cursor_shape = Control.CURSOR_POINTING_HAND
		tooltip_text = "Click the knob to turn it one step; the wheel turns it either way; or pick a detent."
	func centre() -> Vector2: return Vector2(W * 0.5, 72.0)
	func detent_angle(i: int) -> float:
		var n := maxi(positions.size(), 2)
		return deg_to_rad(lerpf(-225.0, 45.0, float(i) / float(n - 1)))
	func set_positions(pos: Array, selected_id: String) -> void:
		var sig := JSON.stringify(pos.map(func(p): return [p.id, p.label, p.name]))
		positions = pos   # the detent angles follow the number of positions: set before the keys are placed
		if sig != _sig:
			_sig = sig
			for k in _keys: k.queue_free()
			_keys.clear()
			for i in pos.size():
				var b := Button.new(); b.name = str(pos[i].name); b.text = str(pos[i].label); b.focus_mode = Control.FOCUS_ALL; b.flat = false
				b.add_theme_font_override("font", EqTheme.font("semi")); b.add_theme_font_size_override("font_size", EqTheme.fs(13))
				var bw := 36.0; var bh := 24.0
				b.custom_minimum_size = Vector2(bw, bh); b.size = Vector2(bw, bh)
				var c := centre() + Vector2(cos(detent_angle(i)), sin(detent_angle(i))) * R
				b.position = c - Vector2(bw, bh) * 0.5
				var idx := i
				b.pressed.connect(func(): _choose(idx))
				b.focus_entered.connect(func(): if station != null: station.note_focus(key))
				b.focus_exited.connect(func(): if station != null: station.call_deferred("_focus_left"))
				add_child(b); _keys.append(b)
		positions = pos
		var was := sel
		sel = -1
		for i in pos.size():
			if str(pos[i].id) == selected_id: sel = i
		if was < 0 and sel >= 0: ang = detent_angle(sel)
		for i in _keys.size():
			var b: Button = _keys[i]; var on: bool = i == sel
			b.tooltip_text = str(pos[i].tip)
			for st in ["normal", "hover", "pressed", "focus"]:
				var sb := StyleBoxFlat.new(); sb.set_corner_radius_all(4); sb.content_margin_left = 2; sb.content_margin_right = 2; sb.content_margin_top = 0; sb.content_margin_bottom = 0
				sb.bg_color = Color("#FFB703") if on else (Color(1, 1, 1, 0.10) if st == "hover" else Color(0, 0, 0, 0.0))
				if st == "focus": sb.bg_color = Color(0, 0, 0, 0); sb.border_color = EqTheme.TEAL; sb.set_border_width_all(2); sb.draw_center = false
				b.add_theme_stylebox_override(st, sb)
			var ink: Color = Color("#1E2A2E") if on else (pos[i].ink as Color)
			for cn in ["font_color", "font_hover_color", "font_pressed_color", "font_focus_color", "font_hover_pressed_color"]: b.add_theme_color_override(cn, ink)
		set_process(true); queue_redraw()
	func focus_current() -> void:
		if sel >= 0 and sel < _keys.size(): (_keys[sel] as Button).grab_focus()
		elif not _keys.is_empty(): (_keys[0] as Button).grab_focus()
	func _choose(i: int) -> void:
		if i < 0 or i >= positions.size() or station == null or station.board == null: return
		var id := str(positions[i].id)
		match key:
			"pump": station.board.pick_pump(id)
			_: station.board.pick_pipe(key, id)
	func step(d: int) -> void:
		if positions.is_empty(): return
		_choose(posmod(sel + d, positions.size()))
	func _gui_input(e: InputEvent) -> void:
		if e is InputEventMouseButton and e.pressed:
			if e.button_index == MOUSE_BUTTON_LEFT and e.position.distance_to(centre()) <= KR + 6.0: step(1); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_UP: step(1); accept_event()
			elif e.button_index == MOUSE_BUTTON_WHEEL_DOWN: step(-1); accept_event()
	func _process(dt: float) -> void:
		if sel < 0: return
		var want := detent_angle(sel)
		if CbSettings.reduced_motion or absf(want - ang) < 0.01: ang = want; set_process(false)
		else: ang = lerpf(ang, want, clampf(dt * 12.0, 0.0, 1.0))
		queue_redraw()
	func _draw() -> void:
		var c := centre()
		# the dial plate (brushed aluminium) and, in hand, a teal ring round it
		if hand: draw_circle(c, R + 24.0, Color(EqTheme.TEAL, 0.28))
		draw_circle(c, R - 14.0, Color("#B9BFB8")); draw_arc(c, R - 14.0, 0.0, TAU, 48, Color("#6E756E"), 1.5)
		for i in positions.size():   # a tick at every detent
			var a := detent_angle(i); var d := Vector2(cos(a), sin(a))
			draw_line(c + d * (KR + 3.0), c + d * (R - 15.0), Color("#1E2A2E") if i == sel else Color("#4B524B"), 3.0 if i == sel else 1.5)
		# the knob: shadow, fluted Bakelite skirt, cap and the white pointer line
		draw_circle(c + Vector2(2, 3), KR + 1.0, Color(0, 0, 0, 0.35))
		var flutes := PackedVector2Array()
		for i in 48:
			var a := TAU * float(i) / 48.0
			flutes.append(c + Vector2(cos(a), sin(a)) * (KR if i % 2 == 0 else KR - 2.5))
		draw_colored_polygon(flutes, EqTheme.BAKELITE)
		draw_circle(c, KR - 7.0, EqTheme.BAKELITE.lightened(0.12))
		var pd := Vector2(cos(ang), sin(ang))
		draw_line(c + pd * 4.0, c + pd * (KR - 1.0), Color("#F4F1DE"), 4.0)
		draw_circle(c, 3.0, Color("#0E0C0B"))
