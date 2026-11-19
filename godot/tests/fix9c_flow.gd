extends SceneTree
## Round 5 lane F9c: L35 rack lists every card and keeps its place after a click / STOP, NOT READY names what is missing, a duplicate card is refused; L37 one chi-square
## notation; Career review explains revenue with numbers, capex apart from operating margin, one product name.  Run: godot --headless --path godot --script res://tests/fix9c_flow.gd
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
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act(name, args); app.game_on_changed(); return r
func lact(args: Array) -> Dictionary: return act("levelAct", args)
func all_text(n: Node) -> String:
	var s := ""
	if n is Label: s += (n as Label).text + "\n"
	if n is Button: s += (n as Button).text + "\n"
	for c in n.get_children(): s += all_text(c)
	return s
func rack_buttons(n: Node, out: Array) -> void:
	if n is Button and (n as Button).text.contains("min)"): out.append(n)
	for c in n.get_children(): rack_buttons(c, out)

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(1280, 800); await frames(4)
	await _l35(); await _l37(); await _career()
	print("FIX9C-FLOW checks=%d" % checks)
	print("FIX9C-FLOW OK" if fails == 0 else "FIX9C-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _l35() -> void:
	await level("L35"); app.lvbay.refresh(true); await frames(4)
	var p: Ch9Cards = app.lvbay.panel as Ch9Cards
	var cards: Array = p.view.cards
	var rb: Array = []; rack_buttons(p, rb)
	check(rb.size() == cards.size(), "rack shows all %d cards (found %d buttons)" % [cards.size(), rb.size()])
	check(all_text(p).contains("%d cards" % cards.size()), "rack header states the card count")
	var t0 := all_text(p)
	check(t0.contains("reference to beat:"), "reference labelled apart from MIN")
	check(not t0.contains("/ ref "), "no bare 'ref' beside MIN")
	# add four cards by pressing rack buttons; the rack's buttons keep their positions after the refresh
	var pos0: Array = []; for b in rb: pos0.append((b as Button).global_position.y - p.scroll.get_global_position().y + p.scroll.scroll_vertical)
	p.scroll.scroll_vertical = 40; await frames(3)
	rb.clear(); rack_buttons(p, rb); (rb[0] as Button).pressed.emit(); await frames(4); app.lvbay.refresh(true); await frames(6)
	check(p.scroll.scroll_vertical == 40, "scroll position survives the refresh (%d)" % p.scroll.scroll_vertical)
	rb.clear(); rack_buttons(p, rb)
	var pos1: Array = []; for b in rb: pos1.append((b as Button).global_position.y - p.scroll.get_global_position().y + p.scroll.scroll_vertical)
	check(pos0.size() == pos1.size() and absf(float(pos0[0]) - float(pos1[0])) < 1.0 and absf(float(pos0[pos0.size() - 1]) - float(pos1[pos1.size() - 1])) < 1.0, "rack card positions are stable after adding a card")
	var r := lact(["add", "cool_on"])
	check(not bool(r.get("ok", true)) or str(r.get("message", "")).contains("already"), "duplicate card is refused: " + str(r))
	var t1 := all_text(p)
	check(t1.contains("NOT READY, missing:"), "NOT READY names what is missing")
	check(t1.contains("Pressurise to full loop pressure"), "missing list names the full-pressure card")

func _l37() -> void:
	await level("L37"); lact(["reconcile"]); app.lvbay.refresh(true); await frames(4)
	var t := all_text(app.lvbay.panel)
	check(t.contains("7.81") and not t.contains("7.82"), "one chi-square notation (7.81)")
	check(t.contains("degrees of freedom"), "line explains the degrees of freedom")
	lact(["flag", 1]); app.lvbay.refresh(true); await frames(4)
	t = all_text(app.lvbay.panel)
	check(t.contains("5.99"), "after a flag the limit reads 5.99")

func _career() -> void:
	await level("CAREER"); app.lvbay.refresh(true); await frames(4)
	for i in 26: lact(["advance", 1])
	app.lvbay.refresh(true); await frames(5)
	var t := all_text(app.lvbay.panel)
	check(t.contains("REVENUE"), "review explains revenue")
	check(t.contains("Volume") and t.contains("Price"), "revenue change split into volume and price")
	check(t.contains("OPERATING MARGIN") and t.contains("INVESTMENTS") and t.contains("NET"), "ledger shows operating margin, investments, net")
	check(t.contains("operating margin") and t.contains("Net"), "review shows operating margin and net")
	check(not t.contains("EtOH") and not t.contains("Distillery") and not t.contains("H2SO4 "), "one product name in the board text")
	check(t.contains("emissions cap tightens") or t.contains("Regulator notice"), "cap tightening announced in the log")
	check(t.contains("at the current gas price"), "heat saving says at the current gas price")
