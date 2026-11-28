extends SceneTree
## 0.14 (Kofi): the board levels (L29-L39 and the Career) stand in the hall. For each level the expert persona plays it, then the hall's subject must show what the
## engine's levelView says, read back from the nodes:
##   L29 the drum's gauge glass at the last level, the valve's pointer at the output; L30 the firebox glow at the heater output and TT-101's display at the inlet
##   temperature; L31 the ratio lamp, both meter displays, the H2 plume; L32 the bed glow at the bed temperature, the TIC-FIC cable lit with the cascade;
##   L33 as many sensors as the design, the chosen final element ringed, the beacon on a trip; L34 a tag per worksheet row and the equipment of each safeguard named;
##   L35 a lamp per card in the order, the flare pilot, the converter's glow; L36 the blind, shut valves in red, padlocks, the bundle pulled when the shell is open;
##   L37 the red tag on the flagged meter and each meter's own reading; L38 scaffolds for the jobs, the second crane when hired, the crew board;
##   L39 leg radii that follow the sizes chosen, the pump near or far, bubbles under the NPSH margin, and the legs' clicks answering as in the classic house;
##   the Career: four stack lights from the dashboard, a scaffold when a turnaround is booked.
## Every level also gets a hero view that frames a box of its own, in the free part of the window.
## Prints HALL_BOARDS-FLOW checks=N and HALL_BOARDS-FLOW OK / HALL_BOARDS-FLOW FAILED n.
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
	print("HALL_BOARDS-FLOW checks=%d" % checks)
	print("HALL_BOARDS-FLOW OK" if fails == 0 else "HALL_BOARDS-FLOW FAILED %d" % fails)
	if app.b != null: app.b.stop()
	quit(0 if fails == 0 else 1)

func _start(lid: String, expert := true) -> GenWorld:
	app.start_level(lid, true); await frames(4)
	check(Look2.GEN_LEVELS.has(lid) and Look2.BOARD_LEVELS.has(lid), "%s is a board level in the hall" % lid)
	if expert: app.b.env("autoplay", ["expert", 40])
	app._on_changed(); await frames(4)
	app.look2.sync(); await frames(6)
	var gw: GenWorld = app.look2.gen
	check(gw != null, "%s: the hall world is up" % lid)
	if gw != null: gw.set_snapshot(app.b.g); await frames(2)
	return gw

func _view() -> Dictionary:
	var v = app.b.q("levelView")
	return v if v is Dictionary else {}

func _n(gw: GenWorld) -> Dictionary: return gw._board._n if gw._board != null else {}
func _ser(v: Dictionary, k: String) -> Array: return (v.series as Dictionary)[k] if v.get("series") is Dictionary and (v.series as Dictionary).get(k) is Array else []
func _last(a: Array) -> float: return float(a[a.size() - 1]) if a.size() > 0 else 0.0
func _lit(m: StandardMaterial3D) -> bool: return m.emission_energy_multiplier > 0.5
func _live(gw: GenWorld, v: Dictionary) -> void: gw._board.live(gw, v, true, {})

func _hero(gw: GenWorld, lid: String) -> void:
	var h: Dictionary = gw._pick_hero()
	check(h.has("box") and (h.box as Array).size() == 2, "%s: the hero view frames a box of its own" % lid)
	check(float(h.get("hfrac", 1.0)) <= 0.86 and float(h.get("hfrac", 1.0)) >= 0.3, "%s: the hero frame uses the part of the width the worksheet leaves (%.2f)" % [lid, float(h.get("hfrac", 1.0))])
	# the worksheet covers the right 45 % of the window (headless windows are tiny, so the cover is forced to that share): the box's centre must land in the free 55 %
	var vp := gw.get_viewport().get_visible_rect().size
	var keep := float(app.plant_world.board_cover)
	app.plant_world.board_cover = vp.x * 0.45; gw._board._cover = -1.0
	gw.set_camera("plant"); gw._snap_cam()
	var ctr := ((h.box[0] as Vector3) + (h.box[1] as Vector3)) * 0.5
	var sp := gw.cam.unproject_position(ctr)
	check(sp.x < vp.x * 0.55, "%s: the subject's centre (x %.0f of %.0f) stands left of a worksheet covering 45 %%" % [lid, sp.x, vp.x])
	app.plant_world.board_cover = keep

func _run() -> void:
	# L29
	var g := await _start("L29"); var v := _view()
	if g != null:
		var n := _n(g); var pv := _ser(v, "pv"); var op := _ser(v, "op")
		check(pv.size() > 0, "L29: the run left a level trace")
		var e: Dictionary = g._levels.get("D-101", {})
		var want := 2.4 * clampf(_last(pv) / 100.0, 0.02, 0.98)
		check(not e.is_empty() and absf(((e.liq as MeshInstance3D).mesh as CylinderMesh).height - want) < 0.005, "L29: the gauge glass shows the last level (%.1f %%: %.3f m, want %.3f)" % [_last(pv), ((e.liq as MeshInstance3D).mesh as CylinderMesh).height if not e.is_empty() else -1.0, want])
		check(str(n.lt.text) == "%.1f" % _last(pv) and str(n.lic.disp.text).begins_with("PV %.1f" % _last(pv)), "L29: LT-101 and LIC-101 read the same level (%s, %s)" % [str(n.lt.text), str(n.lic.disp.text)])
		var yy := lerpf(float(n.lv.y0), float(n.lv.y1), clampf(_last(op) / 100.0, 0.0, 1.0))
		check(absf((n.lv.ptr as Node3D).position.y - yy) < 0.001, "L29: LV-101's pointer stands at the valve output (%.1f %%)" % _last(op))
		var v2 := v.duplicate(true); v2.series.pv = [20.0]; v2.series.op = [90.0]; _live(g, v2)
		check(absf(((e.liq as MeshInstance3D).mesh as CylinderMesh).height - 2.4 * 0.2) < 0.005, "L29: a level of 20 %% gives a gauge column of 0.48 m")
		_live(g, v)
		await _hero(g, "L29")
	# L30
	g = await _start("L30"); v = _view()
	if g != null:
		var n2 := _n(g); var pv2 := _ser(v, "pv"); var op2 := _ser(v, "op")
		var gl: Dictionary = g._glow.get("E-101", {})
		check(not gl.is_empty(), "L30: the fired heater stands in the hall")
		var f := _last(op2) / 100.0
		check(not gl.is_empty() and absf((gl.mat as StandardMaterial3D).emission_energy_multiplier - (0.2 + 2.6 * f)) < 0.01, "L30: the firebox glows with the heater output (%.0f %%: %.2f)" % [_last(op2), (gl.mat as StandardMaterial3D).emission_energy_multiplier if not gl.is_empty() else -1.0])
		check(str(n2.tt.disp.text) == "%.1f C" % (_last(pv2) - 273.15), "L30: TT-101 reads the inlet temperature (%s)" % str(n2.tt.disp.text))
		var v3 := v.duplicate(true); v3.series.op = [0.0]; _live(g, v3)
		check((gl.mat as StandardMaterial3D).emission_energy_multiplier < 0.01, "L30: a heater at 0 %% is dark")
		_live(g, v)
		await _hero(g, "L30")
	# L31
	g = await _start("L31"); v = _view()
	if g != null:
		var n3 := _n(g)
		check(str(n3.fh.disp.text) == "%.1f" % _last(_ser(v, "pv")) and str(n3.fn.disp.text) == "%.1f" % _last(_ser(v, "n2")), "L31: both meters read the run's flows (%s, %s)" % [str(n3.fh.disp.text), str(n3.fn.disp.text)])
		check(_lit(n3.rs_on) and not _lit(n3.rs_off), "L31: the ratio station's lamp is on with the ratio on")
		check((n3.plume as GPUParticles3D).emitting == (float(v.metric.value) > 0.05), "L31: the vent plume follows the H2 vented (%.2f %%)" % float(v.metric.value))
		var v4 := v.duplicate(true); v4.dials[0].value = 0.0; _live(g, v4)
		check(not _lit(n3.rs_on) and _lit(n3.rs_off), "L31: the lamp goes out with the ratio off")
		_live(g, v)
		await _hero(g, "L31")
	# L32
	g = await _start("L32"); v = _view()
	if g != null:
		var n4 := _n(g); var T := _last(_ser(v, "pv"))
		var gl2: Dictionary = g._glow.get("R-101", {})
		var kk := clampf((T - 480.0) / 80.0, 0.0, 1.0)
		check(not gl2.is_empty() and absf((gl2.mat as StandardMaterial3D).emission_energy_multiplier - (0.15 + 1.35 * kk)) < 0.01, "L32: the bed glows with its temperature (%.0f K)" % T)
		check(str(n4.fic.disp.text).contains("OP %.1f" % _last(_ser(v, "op"))), "L32: FIC-101 shows the valve output (%s)" % str(n4.fic.disp.text))
		check((n4.link as StandardMaterial3D).emission_energy_multiplier > 1.0, "L32: the TIC-FIC cable is lit with the cascade on")
		var v5 := v.duplicate(true); v5.dials[0].value = 0.0; _live(g, v5)
		check((n4.link as StandardMaterial3D).emission_energy_multiplier < 0.01, "L32: the cable is dark with the cascade off")
		_live(g, v)
		await _hero(g, "L32")
	# L33
	g = await _start("L33"); v = _view()
	if g != null:
		var n5 := _n(g); var want_n := roundi(float(v.dials[0].value)); var shown := 0
		for s in n5.sens: if (s.root as Node3D).visible: shown += 1
		check(shown == want_n, "L33: as many sensors stand as the design has (%d of %d)" % [shown, want_n])
		var v6 := v.duplicate(true); v6.dials[0].value = 1.0; _live(g, v6); shown = 0
		for s in n5.sens: if (s.root as Node3D).visible: shown += 1
		check(shown == 1, "L33: a design of one sensor leaves one standing (%d)" % shown)
		var act := roundi(float(v.dials[3].value)); _live(g, v)
		var rings := 0; var ok_ring := false
		for i in 3:
			var on := ((n5.fe[i].ring as StandardMaterial3D).emission_energy_multiplier > 0.5)
			if on: rings += 1
			if on and i == act - 1: ok_ring = true
		check(rings == 1 and ok_ring, "L33: only the chosen final element (%d) is ringed" % act)
		check(_lit(n5.trip) == (float(v.tripAt) >= 0.0), "L33: the trip lamp follows the replay (tripAt %.0f s)" % float(v.tripAt))
		check((n5.bcn.light == null or (n5.bcn.light as OmniLight3D).light_energy > 0.0) == (float(v.tripAt) >= 0.0), "L33: the red beacon shows when the replay trips")
		var v7 := v.duplicate(true); v7.tripAt = -1.0; _live(g, v7)
		check(not _lit(n5.trip) and (n5.bcn.mat as StandardMaterial3D).emission_energy_multiplier < 0.01, "L33: no trip, no beacon")
		_live(g, v)
		await _hero(g, "L33")
	# L34
	g = await _start("L34"); v = _view()
	if g != null:
		var n6 := _n(g); var rows: Array = v.rows; var tags := 0
		for t in n6.tags: if (t as Node3D).visible: tags += 1
		check(rows.size() > 0 and tags == rows.size(), "L34: a yellow tag per worksheet row (%d tags, %d rows)" % [tags, rows.size()])
		var okeq := rows.size() > 0
		for r in rows:
			var sfk := str(r.safe)
			if n6.sf.has(sfk): okeq = okeq and (n6.sf[sfk] as Node3D).visible
		check(okeq, "L34: each safeguard the rows name stands on the exchanger")
		var v8 := v.duplicate(true); v8.rows = []; _live(g, v8)
		var any := false
		for k in n6.sf: any = any or (n6.sf[k] as Node3D).visible
		var tg2 := 0
		for t in n6.tags: if (t as Node3D).visible: tg2 += 1
		check(not any and tg2 == 0, "L34: no rows, no safeguards and no tags")
		var v9 := v.duplicate(true); v9.rows = [{"safe": "check_valve"}, {"safe": "tahh"}]; _live(g, v9)
		check((n6.sf.check_valve as Node3D).visible and (n6.sf.tahh as Node3D).visible and not (n6.sf.psv as Node3D).visible, "L34: a check valve and a trip alone put exactly those on the node")
		_live(g, v)
		await _hero(g, "L34")
	# L35
	g = await _start("L35"); v = _view()
	if g != null:
		var n7 := _n(g); var lit_ok := true; var cnt := 0
		for o in v.order:
			var id := str(o.id)
			var key := "heat" if id.begins_with("heat") else id
			if n7.st.has(key): cnt += 1; lit_ok = lit_ok and _lit(n7.st[key].lamp)
		check(cnt >= 6 and lit_ok, "L35: a lamp is lit for each card in the order (%d lamps)" % cnt)
		var flare_in := false
		for o in v.order: if str(o.id) == "flare_on": flare_in = true
		check((n7.flame.node as Node3D).visible == flare_in, "L35: the flare pilot is lit with the flare card in")
		var T35 := float(v.state.t); var kk35 := clampf((T35 - 320.0) / 330.0, 0.0, 1.0)
		var gl3: Dictionary = g._glow.get("R-101", {})
		check(not gl3.is_empty() and absf((gl3.mat as StandardMaterial3D).emission_energy_multiplier - 1.4 * kk35) < 0.01, "L35: the converter glows with the heat-up (%.0f K)" % T35)
		var v10 := v.duplicate(true); v10.order = [{"i": 0, "id": "cool_on", "label": ""}]; v10.trace = []; _live(g, v10)
		check(_lit(n7.st.cool_on.lamp) and not _lit(n7.st.purge.lamp) and not (n7.flame.node as Node3D).visible, "L35: with only the cooling card in, only its lamp is lit and the flare is out")
		_live(g, v)
		await _hero(g, "L35")
	# L36
	g = await _start("L36"); v = _view()
	if g != null:
		var n8 := _n(g); var s: Dictionary = v.state
		check((n8.blind as Node3D).visible == (float(s.blind) > 0.5), "L36: the blind stands where the player fitted it")
		var sh_ok := true
		for k in ["in1", "in2", "out1"]:
			var m := n8.v[k].mat as StandardMaterial3D
			sh_ok = sh_ok and float(s[k]) > 0.5 and m.albedo_color.r > m.albedo_color.g
		check(sh_ok, "L36: the block valves the order closed are red")
		var m2 := n8.v.out2.mat as StandardMaterial3D
		check(float(s.out2) < 0.5 and m2.albedo_color.g > m2.albedo_color.r, "L36: the outlet valve left open is green")
		check((n8.v.in1.lock as Node3D).visible and not (n8.v.out2.lock as Node3D).visible, "L36: locks and tags hang on the shut valves only")
		check(not (n8.bundle as Node3D).visible, "L36: the bundle is back in once the order reinstates it")
		var v11 := v.duplicate(true); v11.state.back = 0.0; _live(g, v11)
		check((n8.bundle as Node3D).visible, "L36: the bundle is out on its cradle while the exchanger is open")
		var v12 := v.duplicate(true); v12.state.blind = 0.0; v12.state.lock = 0.0; v12.state.in1 = 0.0; _live(g, v12)
		var m3 := n8.v.in1.mat as StandardMaterial3D
		check(not (n8.blind as Node3D).visible and m3.albedo_color.g > m3.albedo_color.r and not (n8.v.in1.lock as Node3D).visible, "L36: no blind, no lock, an open inlet valve reads green")
		_live(g, v)
		await _hero(g, "L36")
	# L37
	g = await _start("L37"); v = _view()
	if g != null:
		var n9 := _n(g); var fl := 0; var tagged := 0; var rd_ok := true
		for i in 5:
			var mv: Dictionary = v.meters[i]
			if bool(mv.flagged): fl += 1
			if (n9.ms[i].tag as Node3D).visible: tagged += 1
			if bool(mv.flagged) != (n9.ms[i].tag as Node3D).visible: rd_ok = false
			if not bool(mv.excluded): rd_ok = rd_ok and str(n9.ms[i].disp.text) == "%.1f" % float(mv.reading)
		check(n9.ms.size() == 5 and fl >= 1 and tagged == fl and rd_ok, "L37: the flagged meter wears the red tag and each meter its own reading (%d flagged, %d tags)" % [fl, tagged])
		var v13 := v.duplicate(true)
		for i in 5: v13.meters[i].flagged = (i == 3); v13.meters[i].excluded = false
		_live(g, v13)
		check((n9.ms[3].tag as Node3D).visible and not (n9.ms[1].tag as Node3D).visible, "L37: move the flag to FI-104 and the tag moves with it")
		_live(g, v)
		await _hero(g, "L37")
	# L38
	g = await _start("L38"); v = _view()
	if g != null:
		var n10 := _n(g); var jobs := {}
		for j in v.jobs: jobs[str(j.id)] = true
		var sc_ok := true
		for k in n10.sc: sc_ok = sc_ok and (n10.sc[k] as Node3D).visible == jobs.has(k)
		check(n10.sc.size() == 4 and sc_ok, "L38: scaffold stands on the equipment of the jobs in the plan")
		check((n10.c2 as Node3D).visible == (float(v.crane) >= 2.0), "L38: the second crane stands when hired (crane %.0f)" % float(v.crane))
		var v14 := v.duplicate(true); v14.crane = 1.0; _live(g, v14)
		check(not (n10.c2 as Node3D).visible and (n10.c1 as Node3D).visible, "L38: one crane, one on the site")
		var v15 := v.duplicate(true); v15.crane = 2.0; _live(g, v15)
		check((n10.c2 as Node3D).visible, "L38: hire the second and it stands")
		_live(g, v)
		var bar_ok := true; var crew: Array = v.crewByDay
		for i in 20: bar_ok = bar_ok and (float(crew[i]) <= 0.0 or ((n10.bars[i].node as MeshInstance3D).mesh as BoxMesh).size.y > 0.1)
		check(bar_ok and str(n10.bd_d.text) == "%d d" % roundi(float(v.makespan)), "L38: the crew board shows a bar per working day and the finish (%s)" % str(n10.bd_d.text))
		await _hero(g, "L38")
	# L39
	g = await _start("L39"); v = _view()
	if g != null:
		var n11 := _n(g); var ch: Dictionary = v.choice
		var want_rs := 2.0 * _idmm(v, str(ch.suction)) / 2000.0; var want_rd := 2.0 * _idmm(v, str(ch.discharge)) / 2000.0
		check(absf(float(n11.r_suction) - want_rs) < 0.0005 and absf(float(n11.r_discharge) - want_rd) < 0.0005, "L39: the legs follow the sizes chosen (suction %s\" r %.3f, discharge %s\" r %.3f)" % [str(ch.suction), float(n11.r_suction), str(ch.discharge), float(n11.r_discharge)])
		check(absf(((n11.legs.suction[0] as MeshInstance3D).mesh as CylinderMesh).top_radius - float(n11.r_suction)) < 0.0001, "L39: the suction pipe mesh has the radius")
		check(not (n11.bubbles as GPUParticles3D).emitting == (float(v.op.margin) >= float(v.guide.margin)), "L39: bubbles in the suction only under the NPSH margin (margin %.2f m)" % float(v.op.margin))
		check(g.anchors.has("suction") and g.anchors.has("discharge") and g.anchors.has("pump"), "L39: the legs and the pump can be clicked")
		var got := []
		var cbk := func(w: String): got.append(w)
		app.plant_world.deco_clicked.connect(cbk)
		for w in ["suction", "discharge", "pump"]: g.picked.emit(w)
		g.picked.emit("P-301")
		app.plant_world.deco_clicked.disconnect(cbk)
		check(got == ["suction", "discharge", "pump", "pump"], "L39: a click answers deco_clicked as in the classic house %s" % str(got))
		g.cam.make_current(); g.set_camera("plant"); g._snap_cam(); await frames(2)
		var hit := 0
		for w in ["suction", "discharge", "pump"]:
			if g.cam.is_position_behind(g.anchors[w]): continue
			if g.pick(g.cam.unproject_position(g.anchors[w])) == w: hit += 1
		check(hit >= 2, "L39: a click on the legs and the pump finds them in the hall (%d of 3 picked by the camera)" % hit)
		await _hero(g, "L39")
		# near and far, and a thin suction on a far pump: a fresh design, so the choices can be edited, then commissioned
		var near_x: float = float((n11.pump as Node3D).position.x); var rs_before := float(n11.r_suction)
		g = await _start("L39", false)
		var r1: Dictionary = app.b.act("levelAct", ["setPlace", "far"]); var r2: Dictionary = app.b.act("levelAct", ["setPipe", "suction", "2"])
		check(bool(r1.get("ok", false)) and bool(r2.get("ok", false)), "L39: the far place and a 2 inch suction were accepted")
		app._on_changed(); await frames(3)
		var r3: Dictionary = app.b.act("commission", []); app._on_changed(); await frames(3); app.look2.sync(); await frames(4)
		check(bool(r3.get("ok", false)), "L39: the new line commissioned")
		g.set_snapshot(app.b.g); await frames(2)
		var v16 := _view(); var n12 := _n(g)
		check(str(v16.choice.place) == "far" and float((n12.pump as Node3D).position.x) > near_x + 3.0, "L39: the pump stands at the boiler house when placed far (x %.1f, was %.1f)" % [float((n12.pump as Node3D).position.x), near_x])
		check(absf(float(n12.r_suction) - 2.0 * _idmm(v16, "2") / 2000.0) < 0.0005 and float(n12.r_suction) < rs_before, "L39: a 2 inch suction is thinner than before (r %.3f)" % float(n12.r_suction))
		check((n12.bubbles as GPUParticles3D).emitting == (bool(v16.op.ok) and float(v16.op.q) > 0.0 and float(v16.op.margin) < float(v16.guide.margin)), "L39: the bubbles follow the NPSH margin on the new line (margin %.2f m)" % float(v16.op.margin))
	# the Career
	g = await _start("CAREER"); v = _view()
	if g != null:
		var n13 := _n(g)
		check(n13.pl.size() == 4, "CAREER: four plants stand")
		var lamps_ok := true; var states := {}
		for pk in n13.pl:
			var e: Dictionary = n13.pl[pk]; var on := 0
			for m in e.light.mats: if _lit(m): on += 1
			lamps_ok = lamps_ok and on == 1; states[pk] = int(e.state)
		check(lamps_ok, "CAREER: each stack light shows exactly one colour %s" % str(states))
		var amber_want := {}
		for a in v.dashboard.alerts:
			if not bool(a.handled): amber_want[str(a.plant)] = 2 if str(a.kind) != "insp" else 1
		var st_ok := true
		for pk in n13.pl: st_ok = st_ok and int(states[pk]) == int(amber_want.get(pk, 0))
		check(st_ok, "CAREER: the beacons follow the dashboard's alerts (%s, want %s)" % [str(states), str(amber_want)])
		var v17 := v.duplicate(true); v17.dashboard.alerts = [{"plant": "nh3", "kind": "cat", "handled": false}, {"plant": "meoh", "kind": "insp", "handled": false}]; _live(g, v17)
		check(int(n13.pl.nh3.state) == 2 and int(n13.pl.meoh.state) == 1 and int(n13.pl.acid.state) == 0 and _lit((n13.pl.nh3.light.mats as Array)[2]) and _lit((n13.pl.meoh.light.mats as Array)[1]), "CAREER: an incident reads red, an inspection due amber, the rest green")
		var none := true
		for pk in n13.pl: none = none and not (n13.pl[pk].scaf as Node3D).visible
		var v18 := v.duplicate(true); v18.calendar[1].turnaroundMonth = 40.0; _live(g, v18)
		check(none and (n13.pl.acid.scaf as Node3D).visible and not (n13.pl.nh3.scaf as Node3D).visible, "CAREER: a scaffold stands only at the plant with a turnaround booked")
		_live(g, v)
		await _hero(g, "CAREER")

func _idmm(v: Dictionary, nps: String) -> float:
	for p in v.pipes: if str(p.nps) == nps: return float(p.idMm)
	return 100.0
