extends SceneTree
## Screenshots for F11: godot --rendering-driver opengl3 --path godot --script res://tests/fix11_shots.gd -- <out dir> <w> <h>
## The Career ledger and the ENDINGS strip at month 26 of a modest careful run.
var app: CbApp
var OUT := ""
func frames(n := 3) -> void:
	for i in n: await process_frame
func snap(name: String) -> void:
	await create_timer(0.8).timeout
	root.get_viewport().get_texture().get_image().save_png("%s/%s.png" % [OUT, name]); print("saved ", name)
func act(name: String, args: Array) -> Dictionary:
	var r: Dictionary = app.b.act("levelAct", [name] + args); app.game_on_changed(); return r
func step(m0: bool) -> void:
	var v: Dictionary = app.b.q("levelView")
	if m0:
		for p in v.plants: act("setRate", [p.id, 0.95])
		act("invest", ["heat"]); act("invest", ["safety"]); act("hireCrew", [])
	if int(v.dashboard.month) == 12: act("invest", ["abate"])
	for p in v.plants:
		var id := str(p.id)
		if int(p.monthsSinceInspection) >= 10 and int(p.turnaroundMonth) < 0: act("inspect", [id])
		if int(p.turnaroundMonth) < 0 and (float(p.catalyst) < 0.62 or float(p.exchangerU) < 0.8):
			if int(p.catalystStock) == 0: act("buyCatalyst", [id])
			act("turnaround", [id, int(v.dashboard.month) + 2, 2, 4])
	for o in v.offers:
		if float(o.premium) > 0.04 and not bool(o.overCapacity) and (v.contracts as Array).size() < 12: act("accept", [o.id])
	act("advance", [1])
func _initialize() -> void:
	var args := OS.get_cmdline_user_args(); OUT = str(args[0]); var w := int(args[1]); var h := int(args[2])
	DirAccess.make_dir_recursive_absolute(OUT)
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_NOCOACH", "1")
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(8); CbSettings.persist = false
	root.size = Vector2i(w, h); await frames(4)
	app.start_level("CAREER", true); await frames(4); Notebook.close(app); await frames(3)
	for i in 26: step(i == 0)
	app.lvbay.refresh(true); await frames(4)
	var sc: ScrollContainer = app.lvbay.panel.scroll
	var tag := "%dx%d" % [w, h]
	await snap("ledger_" + tag)
	sc.scroll_vertical = 330; await frames(3); await snap("endings_" + tag)
	sc.scroll_vertical = 900; await frames(3); await snap("cards_" + tag)
	if app.b != null: app.b.stop()
	quit(0)
