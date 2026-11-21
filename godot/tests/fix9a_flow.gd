extends SceneTree
## Play-test round 5 fixes (fix9a): commission lists every unpiped unit + "Delete all unconnected", ports always on show in DESIGN, L16 flask hint and load goal wording,
## L11 window note, smoothed ETA, made-kg hidden before product, pre-placed cards greyed "already on site", disabled keys keep their label, money formatter.
## Run: godot --headless --path godot --script res://tests/fix9a_flow.gd
var fails := 0
var checks := 0
var app: CbApp
func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)
func frames(n := 3) -> void:
	for i in n: await process_frame
func level(id: String) -> void:
	app.start_level(id, true); await frames(4)
	Notebook.close(app); await frames(3)
func tile(type: String) -> Variant:
	for t in app.chrome.rack.tiles: if (t as PartsRack.Tile).type == type: return t
	return null

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	await _prune(); await _ports(); await _texts(); await _eta(); await _cards(); await _keys(); _money()
	print("FIX9A-FLOW checks=%d" % checks)
	print("FIX9A-FLOW OK" if fails == 0 else "FIX9A-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

## L11 has three auto-allotted feed banks: pipe one, and commission names the other two at once; the intercom offers one key that deletes both.
func _prune() -> void:
	await level("L11")
	var r0: Dictionary = app.b.act("pruneUnconnected")
	check(not bool(r0.get("ok", true)), "nothing to prune on a fresh sheet is refused")
	var tk: Dictionary = app.b.act("placeUnit", ["product", 20, 0, 0]); check(bool(tk.get("ok", false)), "tank placed")
	var tid := str(tk.get("id", ""))
	check(bool(app.b.act("connect", ["F-101", "out", tid, "in"]).get("ok", false)), "F-101 piped to the tank")
	# the level's contract feeds are never strays (F23: a mixer inlet needs them), so place two spare units of our own
	var fa := str(app.b.act("placeUnit", ["mixer3", 14, 10, 0]).get("id", "")); var fb := str(app.b.act("placeUnit", ["nh3_sep", 18, 10, 0]).get("id", ""))
	app.game_on_changed(); await frames(3)
	var strays: Array = app.b.q("strayUnits")
	check(strays.size() == 2 and strays.has(fa) and strays.has(fb), "strayUnits names both spare units: %s" % str(strays))
	var r: Dictionary = app.chrome.turn_key(true); await frames(4)
	var msg := str(r.get("message", ""))
	check(not bool(r.get("ok", true)) and msg.contains(fa) and msg.contains(fb), "the refusal lists ALL unpiped units at once: " + msg)
	var l: Dictionary = app.chrome.intercom.last()
	check(l.has("action") and str(l.get("action_label", "")) == "Delete all unconnected", "the refusal carries a Delete all unconnected key")
	var btn: Button = app.chrome.intercom._act
	check(btn != null and btn.visible and btn.text == "Delete all unconnected", "the key is on the intercom")
	var n0: int = (app.b.q("plant").units as Array).size()
	btn.pressed.emit(); await frames(4)
	check((app.b.q("plant").units as Array).size() == n0 - 2, "pressing it deletes both spare units")
	check((app.b.q("strayUnits") as Array).is_empty() and not btn.visible, "no strays remain and the key is spent")

## In DESIGN every unit's free ports are on the sheet without a hover or a selection.
func _ports() -> void:
	await level("L01")
	for a in [["feed", 0, 0, 0], ["mixer", 4, 2, 0]]: app.b.act("placeUnit", a)
	app.game_on_changed(); await frames(6)
	app.world.select(""); await frames(3)
	check(app.world._mark_nodes.size() >= 3, "free-port pips show with nothing selected or hovered (%d)" % app.world._mark_nodes.size())
	var subtle := 0
	for m in app.world._marks: if bool(m.get("subtle", false)): subtle += 1
	check(subtle > 0 and subtle == app.world._marks.size(), "unselected units' pips are the subtle kind")

## L16 flask hint / load goal, L11 window note.
func _texts() -> void:
	await level("L16")
	var li: Dictionary = app.b.q("levelInfo")
	var rule := str(li.stars.rules[1])
	check(rule.contains("exchanger") and rule.contains("10 kW"), "L16 flask 2 says what to change: " + rule)
	var load_goal := ""
	for g in li.goals: if str(g.key) == "load": load_goal = str(g.text)
	check(load_goal != "" and not load_goal.contains("stays at"), "the load goal is reworded: " + load_goal)
	await level("L11")
	var l11: Dictionary = app.b.q("levelInfo")
	var all := " ".join(PackedStringArray((l11.note as Array).map(func(s): return str(s))))
	check(all.contains("Equilibrium Window") and all.contains("mole fraction"), "L11 explains the window percentage against the ticket's mole fraction")

## The ETA averages the real sim speed over the last seconds.
func _eta() -> void:
	var rec := ChartRecorder.new()
	var raw := 100.0
	var out: Array = []
	for i in 6:
		rec.shift_clock = {"t": 2.0 * i, "total": 100.0, "speed": 1.0, "running": true, "ended": false, "etaWallS": raw}
		out.append(rec.eta_smoothed(float(i)))
	check(out[0] == raw, "no history yet: the engine's number")
	# plant time advances 2 s per wall second: 100 - 10 = 90 s left -> 45 s of wall time
	check(absf(float(out[5]) - 45.0) < 0.5, "smoothed ETA follows the measured rate (%s)" % str(out[5]))
	rec.shift_clock = {"t": 11.0, "total": 100.0, "speed": 1.0, "running": true, "ended": false, "etaWallS": raw}
	var e6: float = rec.eta_smoothed(5.5)
	check(absf(e6 - 45.0) < 5.0, "a wobbling frame does not jump the figure (%.1f)" % e6)
	rec.free()

## Pre-placed units: their cards are greyed with "already on site".
func _cards() -> void:
	await level("L16"); await frames(3)
	var t = tile("packed_bed")
	check(t != null and not (t as PartsRack.Tile).available and int((t as PartsRack.Tile).count) >= 1, "the pre-placed bed's card is greyed")
	check(PaperStrings.t("RACK_ONSITE") == "already on site", "the card's caption")
	check(not PaperStrings.t("RACK_LIMIT1").contains("Already placed"), "no 'Already placed' error text")

## A disabled key keeps its label in a readable grey.
func _keys() -> void:
	var b := EqTheme.key_button("Window", false, 15); b.disabled = true; root.add_child(b); await frames(2)
	var c := b.get_theme_color("font_disabled_color")
	check(b.text == "Window" and c.v < 0.8 and c.a > 0.9, "disabled key font colour %s" % str(c))
	b.queue_free()

func _money() -> void:
	check(Printout.metric_text(84200.0, "USD") == "$84,200", "USD reads $84,200: " + Printout.metric_text(84200.0, "USD"))
	check(Printout.metric_text(84200.0, "$") == "$84,200", "$ unit too")
	check(Printout.metric_text(14.9, "USD/t").begins_with("$14.9") and Printout.metric_text(14.9, "USD/t").ends_with("/t"), "USD/t: " + Printout.metric_text(14.9, "USD/t"))
	check(Printout.metric_text(31.2, "kmol/h").ends_with("kmol/h"), "other units unchanged")
