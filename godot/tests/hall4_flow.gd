extends SceneTree
## 0.13 (Ingrid): L09 and chapter 4 stand in the hall. For each level the expert persona (the level's own solver) builds and commissions the plant;
## then the hall must show the level's subject with the chemistry in it:
##   chapter 4 (L15-L17): a packed bed you can see into: pellet slices that glow hotter toward the outlet when the bed runs above 450 C, thermowell readings that
##     rise down the bed and match the engine's T_in / T_out, a deeper bed for more catalyst;
##   L18: a glass batch kettle per batch unit, bubbling by its catalyst (catalase > iodide > none);
##   L09: the calorimeter bench and the lab furnace, whose bore glows with the furnace temperature the level reports.
## Prints HALL4-FLOW checks=N and HALL4-FLOW OK / HALL4-FLOW FAILED n.
var fails := 0
var checks := 0
var app

func check(c: bool, msg: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", msg)

func frames(n := 3) -> void:
	for i in n: await process_frame

func _initialize() -> void:
	OS.set_environment("CB_NOAUTOSAVE", "1"); OS.set_environment("CB_LOOK2", ""); OS.set_environment("CB_NOCOACH", "1"); OS.set_environment("CB_SEED", "1003")
	CbLayout.forced = "desktop"; root.size = Vector2i(1600, 900)
	app = (load("res://main.tscn") as PackedScene).instantiate(); root.add_child(app)
	await frames(6)
	await _run()
	print("HALL4-FLOW checks=%d" % checks)
	print("HALL4-FLOW OK" if fails == 0 else "HALL4-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _play(lid: String) -> GenWorld:
	app.start_level(lid, true); await frames(4)
	check(Look2.GEN_LEVELS.has(lid), "%s is a hall level" % lid)
	app.b.env("autoplay", ["expert", 40]); app._on_changed(); await frames(4)
	app.look2.sync(); await frames(6)
	var gw: GenWorld = app.look2.gen
	check(gw != null, "%s: the hall world is up" % lid)
	if gw != null: gw.set_snapshot(app.b.g); await frames(2)
	return gw

func _run() -> void:
	var depths := {}
	for lid in ["L15", "L16", "L17"]:
		var gw := await _play(lid)
		if gw == null: continue
		check(gw._beds.size() == 1, "%s: one packed bed in the hall (%d)" % [lid, gw._beds.size()])
		if gw._beds.is_empty(): continue
		var id: String = gw._beds.keys()[0]; var b: Dictionary = gw._beds[id]
		depths[lid] = float(b.depth)
		var inf: Dictionary = {}
		for u in app.b.g.get("units", []): if str(u.get("id", "")) == id: inf = u.get("info", {}) if u.get("info", {}) is Dictionary else {}
		var ti := float(inf.get("T_in", 0.0)); var to := float(inf.get("T_out", 0.0))
		check(ti > 0.0 and to > ti, "%s: the engine reports an adiabatic rise (T_in %.1f K, T_out %.1f K)" % [lid, ti, to])
		var tags: Array = b.tags; var vals: Array = []
		for t in tags: vals.append(int(str((t as Label3D).text).split(" ")[0]) if str((t as Label3D).text) != "--" else -999)
		var rising := vals.size() == 5
		for i in range(1, vals.size()): rising = rising and int(vals[i]) >= int(vals[i - 1])
		check(rising, "%s: thermowell readings rise from inlet to outlet %s" % [lid, str(vals)])
		check(vals.size() == 5 and int(vals[0]) > roundi(ti - 273.15) - 1 and int(vals[4]) < roundi(to - 273.15) + 1, "%s: readings lie between the engine's inlet %d C and outlet %d C %s" % [lid, roundi(ti - 273.15), roundi(to - 273.15), str(vals)])
		check(vals.size() == 5 and int(vals[4]) == roundi(to - 273.15), "%s: the last well, at the outlet, reads the engine's outlet %d C, as the recorder does %s" % [lid, roundi(to - 273.15), str(vals)])
		var mats: Array = b.mats
		var e0 := (mats[0] as StandardMaterial3D).emission_energy_multiplier; var e1 := (mats[mats.size() - 1] as StandardMaterial3D).emission_energy_multiplier
		check(e1 >= e0, "%s: the outlet slice glows at least as much as the inlet slice (%.2f vs %.2f)" % [lid, e1, e0])
		if to - 273.15 > 470.0: check(e1 > 0.0, "%s: the bed above 450 C glows at the outlet (%.2f)" % [lid, e1])
		check(gw._pick_hero().ids.has(id), "%s: the hero view frames the bed" % lid)
		var mms := 0
		for ch in gw.plant.get_children(): if ch is MultiMeshInstance3D: mms += 1
		check(mms >= mats.size() + 2, "%s: pellet slices and ceramic-ball layers are built (%d multimeshes)" % [lid, mms])
	if depths.has("L15") and depths.has("L16"): check(float(depths.L16) > float(depths.L15), "L16's bigger catalyst volume is a deeper bed (%.2f m vs %.2f m)" % [depths.L16, depths.L15])
	var g18 := await _play("L18")
	if g18 != null:
		check(g18._kettles.size() >= 1, "L18: the glass kettles stand in the hall (%d)" % g18._kettles.size())
		for kid in g18._kettles:
			var k: Dictionary = g18._kettles[kid]
			check(float(k.act) >= 0.0 and float(k.act) <= 1.0, "L18 %s: catalyst activity in range" % kid)
			check((k.bub as GPUParticles3D).emitting == (float(k.act) > 0.05), "L18 %s: bubbles follow the catalyst (act %.2f, emitting %s)" % [kid, float(k.act), str((k.bub as GPUParticles3D).emitting)])
		check(float(GenWorld.KETTLE_ACT.catalase) > float(GenWorld.KETTLE_ACT.iodide) and float(GenWorld.KETTLE_ACT.iodide) > float(GenWorld.KETTLE_ACT.none), "L18: catalase foams more than iodide, iodide more than no catalyst")
	await _l09_by_hand()
	var g09 := await _play("L09")
	if g09 != null:
		check(g09._bench.has("furnace") and g09._bench.has("dw"), "L09: the calorimeter bench and the lab furnace are built (%s)" % str(g09._bench.keys()))
		if g09._bench.has("furnace"):
			var li = app.b.q("levelInfo")
			var fk := float(li.secondary.value) if li is Dictionary and li.get("secondary") is Dictionary else 0.0
			var e := (g09._bench.furnace as StandardMaterial3D).emission_energy_multiplier
			check(fk > 900.0 and e > 0.5 or fk <= 723.0 and e == 0.0, "L09: the furnace bore glows with the furnace temperature (%.0f K, emission %.2f)" % [fk, e])
			check(str((g09._bench.fread as Label3D).text) == "%d °C" % roundi(fk - 273.15), "L09: the furnace controller reads the level's furnace temperature (%s)" % str((g09._bench.fread as Label3D).text))
		check(g09._pick_hero().ids.size() == 1 and str(g09._types[g09._pick_hero().ids[0]]) == "stoich_reactor", "L09: the hero view frames the calorimeter bench")

## Lena's L09 (0.13): the player's own path, answers then commission, then the 30 s first run in which the furnace climbs. The recorder's point for the run was
## taken at commission (298 K) and never moved, while the printout said 2400 K. After the first run the furnace pen must agree with the level.
func _l09_by_hand() -> void:
	app.start_level("L09", true); await frames(4)
	for a in [["callIt", [885.3530859408867]], ["predict", ["heat_co2", 314.8]], ["predict", ["du_vap", 37.688878]], ["predict", ["tmin_k", 2000]], ["commission", []]]:
		app.b.act(a[0], a[1]); app._on_changed(); await frames(2)
	var rec = app.chrome.recorder if app.chrome != null else null
	check(rec != null and str(app.b.q("levelInfo").get("phase", "")) == "firstrun", "L09 by hand: the first run is playing (%s)" % str(app.b.q("levelInfo").get("phase", "")))
	for k in 34:
		app.b.act("tick", [1]); app._on_changed(); await frames(1)
	var li = app.b.q("levelInfo"); var fk := float(li.secondary.value) if li is Dictionary and li.get("secondary") is Dictionary else 0.0
	check(fk > 2000.0, "L09 by hand: after the first run the level reports the furnace hot (%.1f K)" % fk)
	check(rec != null and not rec.runs.is_empty() and absf(float(rec.runs.back().s) - fk) < 0.5, "L09 by hand: the recorder's furnace pen agrees with the level after the first run (%s against %.1f K)" % [str(rec.runs.back() if rec != null and not rec.runs.is_empty() else "none"), fk])
