class_name Annunciator
extends Control
## The annunciator (UI.md 4): 4-8 backlit windows with engraved caps legends, two rows. off = dark glass, normal = dark glass with a green-tinted legend (healthy), GOAL lit teal when met,
## high = amber flashing until acknowledged then steady, critical = red (klaxon cue on arrival). ISA-18.2 sequence: flash -> ack steady -> clear.
## K, pad A or a tap acknowledges. Windows come from `set_windows([{key, legend, state}])` (the engine's levelInfo.annunciators).
signal acked(key: String)
var app: CbApp
var wins: Array = []        ## {key, legend, state, acked, rect}
var demo := false
var max_windows := 8     ## phone: 4
var _t := 0.0
const FLASH_HZ := 2.0
const SQ := 0.8   ## a one-word legend is squeezed to this much of its width before it wraps (EqTheme.ds squeezes to 78 % at most)

func _init() -> void:
	EqStrings.load_strings()
	mouse_filter = Control.MOUSE_FILTER_STOP; focus_mode = Control.FOCUS_NONE
	custom_minimum_size = Vector2(160, 60)
	set_demo()

func set_demo() -> void:
	demo = true
	wins = []
	for i in 4: wins.append({"key": "demo%d" % i, "legend": EqStrings.T("ANN_DEMO_%d" % (i + 1)), "state": "off", "acked": true})
	queue_redraw()

## Replace the windows. Keeps the ack state of a key whose alarm is still on; a new High/Critical arrives unacknowledged.
func set_windows(list: Array) -> void:
	if list.is_empty():
		if not demo: set_demo()
	else:
		demo = false
		var old := {}
		for w in wins: old[w.key] = w
		var nw: Array = []
		var alarmed := false
		for a in list.slice(0, max_windows):
			var key := str(a.get("key", "")); var st := str(a.get("state", "off"))
			if a.has("lit") and not bool(a.lit) and (st == "high" or st == "critical"): st = "normal"   # the engine says this window is not lit: it never draws lit
			var prev: Dictionary = old.get(key, {})
			var ack := true
			if st == "high" or st == "critical":
				var ps := str(prev.get("state", "off"))
				var was := ps == "high" or ps == "critical"
				ack = was and bool(prev.get("acked", false)) and not (ps == "high" and st == "critical")
				if not ack and st == "critical": alarmed = true
			nw.append({"key": key, "legend": str(a.get("legend", "")), "state": st, "acked": ack})
		wins = nw
		if alarmed and app != null: app.sfx("alarm")
	queue_redraw()

func window_count() -> int: return wins.size()
func unacked() -> int:
	var n := 0
	for w in wins: if (w.state == "high" or w.state == "critical") and not w.acked: n += 1
	return n

## Acknowledge one window (or all when key is ""). Returns how many were acknowledged.
func ack(key := "") -> int:
	var n := 0
	for w in wins:
		if (key == "" or w.key == key) and (w.state == "high" or w.state == "critical") and not w.acked: w.acked = true; n += 1
	if n > 0:
		acked.emit(key); queue_redraw()
		if app != null: app.sfx("click")
	return n

func _process(dt: float) -> void:
	if not is_visible_in_tree(): return
	_t += dt
	if unacked() > 0 and not CbSettings.reduced_motion: queue_redraw()

func _gui_input(e: InputEvent) -> void:
	var p := Vector2.ZERO; var hit := false
	if e is InputEventMouseButton and e.pressed and e.button_index == MOUSE_BUTTON_LEFT: p = e.position; hit = true
	elif e is InputEventScreenTouch and e.pressed: p = e.position; hit = true
	if not hit: return
	for w in wins:
		if (w.get("rect", Rect2()) as Rect2).has_point(p):
			if ack(str(w.key)) == 0: ack("")   # a tap on a quiet window acknowledges the rest
			accept_event(); return
	if ack("") > 0: accept_event()

func handle_key(e: InputEventKey) -> bool:
	if e.pressed and not e.echo and e.keycode == KEY_K: ack(""); return true
	return false

func _layout() -> void:
	var n := wins.size()
	var cols := maxi(2, int(ceil(n / 2.0)))
	var gap := 4.0
	var w := (size.x - gap * (cols - 1)) / cols
	var h := (size.y - gap) / 2.0
	for i in n:
		var cx := i % cols; var cy := i / cols
		wins[i]["rect"] = Rect2(cx * (w + gap), cy * (h + gap), w, h)

func _draw() -> void:
	_layout()
	var f := EqStrings.font("cap"); var fsz := EqTheme.fs(13)
	var flash := int(floor(_t * FLASH_HZ * 2.0)) % 2 == 0 or CbSettings.reduced_motion
	for w in wins:
		var r: Rect2 = w.rect
		var st: String = w.state
		var lit: Color = Color("#2A3532")
		var back: Color = EqTheme.LAMP_OFF
		var txt := Color("#52625E")
		var glow := 0.0
		match st:
			"normal":   # a healthy condition is DARK glass on a real panel; only the GOAL window lights (teal) when the job is done
				if str(w.get("key", "")) == "goal": lit = EqTheme.TEAL; back = EqTheme.TEAL; txt = Color("#08201D"); glow = 0.3
				else: back = Color("#121A18"); txt = Color("#46544F")   # a healthy window is dark glass with a dim legend: never green
			"high":
				var on: bool = w.acked or flash
				lit = EqTheme.AMBER; back = EqTheme.AMBER if on else Color("#4A3A0C"); txt = Color("#2A1D00") if on else Color("#8A6F1E"); glow = 0.28 if on else 0.0
			"critical":
				var on2: bool = w.acked or flash
				lit = EqTheme.RED; back = EqTheme.RED if on2 else Color("#4A1A1E"); txt = Color("#FFF1F1") if on2 else Color("#9A4A52"); glow = 0.3 if on2 else 0.0
		if demo: back = EqTheme.LAMP_OFF; txt = Color("#52625E"); glow = 0.0
		draw_rect(r.grow(1.5), Color("#0B1413"))          # bezel
		draw_rect(r, back)
		if st != "off" and not demo:
			draw_rect(Rect2(r.position + Vector2(2, 2), Vector2(r.size.x - 4, 2.0)), Color(1, 1, 1, 0.22))   # glass highlight
			if glow > 0.0: draw_rect(r.grow(2.5), Color(lit, glow), false, 2.0)
		else:
			draw_rect(Rect2(r.position + Vector2(2, 2), Vector2(r.size.x - 4, 1.0)), Color(1, 1, 1, 0.06))
		# window frame cross-bar (the lens divider of a real window)
		draw_rect(r, Color(0, 0, 0, 0.55), false, 1.0)
		var legend := str(w.legend)
		var avail := r.size.x - 6.0
		var tw := f.get_string_size(legend, HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x
		if tw <= avail or (legend.find(" ") < 0 and tw * SQ <= avail):   # one line (a one-word legend squeezes a little before it breaks)
			EqTheme.ds(self, f, Vector2(r.position.x + 3.0, r.position.y + r.size.y * 0.5 + fsz * 0.35), legend, HORIZONTAL_ALIGNMENT_CENTER, avail, fsz, txt)
		else:
			var l1 := ""; var l2 := ""
			for pt in legend.split(" "):
				if f.get_string_size((l1 + " " + pt).strip_edges(), HORIZONTAL_ALIGNMENT_LEFT, -1, fsz).x <= avail and l2 == "": l1 = (l1 + " " + pt).strip_edges()
				else: l2 = (l2 + " " + pt).strip_edges()
			var cy := r.position.y + r.size.y * 0.5
			EqTheme.ds(self, f, Vector2(r.position.x + 3.0, cy - 2.0), l1, HORIZONTAL_ALIGNMENT_CENTER, avail, fsz, txt)
			EqTheme.ds(self, f, Vector2(r.position.x + 3.0, cy + fsz * 0.95), l2, HORIZONTAL_ALIGNMENT_CENTER, avail, fsz, txt)
