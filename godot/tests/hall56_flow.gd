extends SceneTree
## 0.14 (Ingrid): chapters 5 and 6 stand in the hall. For each level the expert persona (the level's own solver) builds and commissions the plant; then the hall
## must show the chapter's subject with the chemistry in it, read from the engine:
##   chapter 5 (L19-L21): the recycle compressor and the loop's own colour on the recycle line; the catch pot's gauge glass at the liquid fraction (1 - beta);
##   L22: the steam-raising tubular converter; L23: the fermenter's beer level and the column's tray temperatures, cool at the top and hot at the foot;
##   chapter 6: L24's reactor in its bund with the dial on the hero reading; L25's four beds; L26's gauze glowing at its outlet temperature and the nitric tower
##   brown at the foot, clearing toward the top; L27's drum and relief with its catch tank.
## Prints HALL56-FLOW checks=N and HALL56-FLOW OK / HALL56-FLOW FAILED n.
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
	print("HALL56-FLOW checks=%d" % checks)
	print("HALL56-FLOW OK" if fails == 0 else "HALL56-FLOW FAILED %d" % fails)
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

func _info(id: String) -> Dictionary:
	for u in app.b.g.get("units", []): if str(u.get("id", "")) == id: return u.get("info", {}) if u.get("info", {}) is Dictionary else {}
	return {}

func _of(gw: GenWorld, ty: String) -> Array:
	var r: Array = []
	for id in gw._types: if str(gw._types[id]) == ty: r.append(id)
	return r

func _hero_has(gw: GenWorld, ty: String) -> bool:
	for id in gw._pick_hero().ids: if str(gw._types[id]) == ty: return true
	return false

func _run() -> void:
	for lid in ["L19", "L20", "L21"]:
		var gw := await _play(lid)
		if gw == null: continue
		check(gw._loop, "%s: the plant is read as a recycle loop" % lid)
		check(_hero_has(gw, "compressor"), "%s: the hero view frames the recycle compressor" % lid)
		var orange := 0
		for ch in gw.plant.get_children(): if ch is MeshInstance3D and (ch as MeshInstance3D).material_override == gw._lp: orange += 1
		check(orange >= 6, "%s: the recycle line is painted in the loop's colour (%d pieces)" % [lid, orange])
		for id in gw._levels:
			var e: Dictionary = gw._levels[id]
			if str(e.kind) != "flash": continue
			var beta := float(_info(id).get("beta", 1.0)); var want := clampf(clampf(1.0 - beta, 0.0, 1.0) * 2.5, 0.02, 0.98) * float(e.h)
			var got := ((e.liq as MeshInstance3D).mesh as CylinderMesh).height
			check(absf(got - want) < 0.01, "%s %s: the gauge glass shows the liquid fraction (beta %.3f: %.2f m of %.2f m, want %.2f)" % [lid, id, beta, got, float(e.h), want])
	var g22 := await _play("L22")
	if g22 != null:
		check(_of(g22, "tubular").size() == 1 and _hero_has(g22, "tubular"), "L22: the tubular converter stands in the hall and is the hero")
	var g23 := await _play("L23")
	if g23 != null:
		var col := _of(g23, "column"); var fer := _of(g23, "fermenter")
		check(col.size() == 1 and fer.size() == 1, "L23: the fermenter and the column stand in the hall")
		if col.size() == 1:
			var tags: Array = g23._towers[col[0]].tags; var v: Array = []
			for t in tags: v.append(int(str((t as Label3D).text).split(" ")[0]) if str((t as Label3D).text) != "--" else -999)
			var down := v.size() == 8
			for i in range(1, v.size()): down = down and int(v[i]) >= int(v[i - 1])
			check(down, "L23: tray temperatures rise from the top tray to the foot %s" % str(v))
			var inf := _info(col[0])
			check(v.size() == 8 and int(v[0]) == roundi(float(inf.get("tray_T0", 0.0)) - 273.15) and int(v[7]) == roundi(float(inf.get("tray_T%d" % (int(inf.get("tray_n", 1)) - 1), 0.0)) - 273.15), "L23: the top and bottom tags are the engine's first and last trays %s" % str(v))
		if fer.size() == 1:
			var e2: Dictionary = g23._levels[fer[0]]
			var lv := float(_info(fer[0]).get("level", 0.0))
			check(absf((e2.liq as MeshInstance3D).scale.y - float(e2.h) * clampf(lv, 0.02, 1.0)) < 0.01, "L23: the beer stands at the fermenter's level (%.2f)" % lv)
			check((e2.bub as GPUParticles3D).emitting == (float(_info(fer[0]).get("gas", 0.0)) > 0.0), "L23: the beer bubbles while CO2 comes off")
	var g24 := await _play("L24")
	if g24 != null:
		var cs := _of(g24, "cstr")
		check(cs.size() == 1 and _hero_has(g24, "cstr"), "L24: the reactor is the hero")
		check(_of(g24, "relief").size() == 1, "L24: the relief and its catch tank stand in the hall")
		if cs.size() == 1:
			var li = app.b.q("levelInfo")
			var T := float(li.hero.value) + 273.15; var hi := float(li.hero.hi) + 273.15
			var want := clampf(clampf((T - 298.15) / maxf(1.0, hi - 298.15), 0.0, 1.3) * 0.75, 0.0, 1.0)
			var got := float((g24._cstr[cs[0]].dial as ShaderMaterial).get_shader_parameter("value"))
			check(absf(got - want) < 0.001, "L24: the dial thermometer follows the reactor temperature (%.1f C: %.3f, want %.3f)" % [T - 273.15, got, want])
	var g25 := await _play("L25")
	if g25 != null: check(_of(g25, "packed_bed").size() == 4 and g25._beds.size() == 4, "L25: four catalyst beds you can see into (%d)" % g25._beds.size())
	var g26 := await _play("L26")
	if g26 != null:
		var gz := _of(g26, "gauze_burner")
		check(gz.size() == 1 and _hero_has(g26, "gauze_burner"), "L26: the gauze burner is the hero")
		if gz.size() == 1:
			var To := float(_info(gz[0]).get("T_out", 0.0))
			var e := ((g26._glow[gz[0]] as Dictionary).mat as StandardMaterial3D).emission_energy_multiplier
			check(To > 1000.0 and e >= 1.4, "L26: the gauze glows at its outlet temperature (%.0f K, emission %.2f)" % [To, e])
		for id in g26._towers:
			var tw: Dictionary = g26._towers[id]
			if str(tw.kind) != "nitric": continue
			var m0 := tw.mats[0] as StandardMaterial3D; var m5 := tw.mats[5] as StandardMaterial3D
			check(m0.albedo_color.b < m5.albedo_color.b - 0.2, "L26: the absorber's gas is brown at the foot and clear at the top (%s vs %s)" % [str(m0.albedo_color), str(m5.albedo_color)])
	var g27 := await _play("L27")
	if g27 != null:
		check(_of(g27, "relief").size() == 1 and _of(g27, "flash").size() == 1, "L27: the drum and its relief stand in the hall")
		check(_hero_has(g27, "flash") or _hero_has(g27, "relief"), "L27: the hero view frames the drum or the relief")
