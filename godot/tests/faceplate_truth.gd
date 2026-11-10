extends SceneTree
## Faceplate and stream-tag truth: every number printed on a faceplate (readouts, knobs, PV/SP) and on a stream tag equals the engine's value at the shown
## precision (half a unit of the last printed digit). Real engine, real shell. Prints FACEPLATE-TRUTH OK / FAILED n.
var fails := 0
var checks := 0
func check(c: bool, m: String) -> void:
	checks += 1
	if not c: fails += 1; print("FAIL: ", m)

func shown(txt: String) -> float: return txt.replace(",", "").to_float()
func tol(txt: String) -> float:
	var t := txt.replace(",", ""); var i := t.find(".")
	return 0.5 * pow(10.0, -(t.length() - i - 1)) + 1e-9 if i >= 0 else 0.5 + 1e-9
func same(txt: String, expect: float, msg: String) -> void:
	check(absf(shown(txt) - expect) <= tol(txt), "%s: printed %s, engine %f" % [msg, txt, expect])

func _initialize() -> void:
	var app: CbApp = load("res://main.gd").new(); root.add_child(app)
	for i in 40: await process_frame
	app.new_game("sandbox"); for i in 5: await process_frame
	PartsRack.build(app); Faceplate.attach(app)
	check(bool(app.b.act("setSpecies", [["N2", "H2", "NH3"]]).ok), "species set")
	var f: Dictionary = app.b.act("placeUnit", ["feed", 3, 6]); var h: Dictionary = app.b.act("placeUnit", ["heater", 8, 6]); var p: Dictionary = app.b.act("placeUnit", ["product", 13, 6])
	check(f.ok and h.ok and p.ok, "three units placed")
	var pf := func(id: String, k: String) -> String: return str(app.b.q("unitCard", [id])[k][0].port)
	var c1: Dictionary = app.b.act("connect", [f.id, pf.call(f.id, "outlets"), h.id, pf.call(h.id, "inlets")]); var c2: Dictionary = app.b.act("connect", [h.id, pf.call(h.id, "outlets"), p.id, pf.call(p.id, "inlets")])
	check(c1.ok and c2.ok, "two pipes: %s %s" % [c1.get("message", ""), c2.get("message", "")])
	app.b.act("setParam", [h.id, "T", 573.15])
	var c: Dictionary = app.b.act("commission", [])
	check(bool(c.get("ok", false)), "commission: %s" % str(c.get("message", "")))
	await process_frame
	var table: Dictionary = app.b.q("streamTable", [{}])
	check(bool(table.ok) and (table.rows as Array).size() == 2, "two solved streams")
	for id in [f.id, h.id, p.id]:
		var fp := Faceplate.open(app, str(id)); await process_frame
		var card: Dictionary = app.b.q("unitCard", [id])
		# knobs: shown value = engine param in display units
		for k in card.knobs:
			var kn: Knob = fp.knobs.get(str(k.key))
			check(kn != null, "%s has a knob for %s" % [id, k.key])
			if kn == null or str(k.kind) == "choice": continue
			var d := EqFmt.to_disp(float(k.value), str(k.unit))
			same(PaperStrings.num(kn.value, kn.integer), d, "%s knob %s" % [id, k.key])
		# readouts of the unit's stream
		var sid := ""
		for k in ["outlets", "inlets"]:
			for pt in card[k]: if pt.stream != null and sid == "": sid = str(pt.stream)
		var row: Dictionary = {}
		for r in table.rows: if str(r.id) == sid: row = r
		check(not row.is_empty(), "%s has a stream %s" % [id, sid])
		if row.is_empty(): continue
		if str(card.type) != "feed": same(fp.readouts.flow.text, float(row.flow) * 3.6, "%s flow kmol/h" % id)
		else: same(fp.readouts.flow.text, float(card.feed.flow) * 3.6, "%s feed kmol/h" % id)
		same(fp.readouts.mass.text, float(row.mass) * 3600.0, "%s mass kg/h" % id)
		same(fp.readouts.T.text, float(row.T) - 273.15, "%s T" % id)
		same(fp.readouts.P.text, float(row.P) / 1e5, "%s P" % id)
		if card.results != null and card.results.has("duty"): same(fp.readouts.duty.text, float(card.results.duty) / 1e3, "%s duty kW" % id)
		# PV bar
		var spk: Dictionary = {}
		for k in card.knobs: if str(k.kind) == "num" and spk.is_empty(): spk = k
		if not spk.is_empty() and str(spk.key) == "T": same(PaperStrings.num(fp._pv.pv), float(row.T) - 273.15, "%s PV" % id)
		if not spk.is_empty(): same(PaperStrings.num(fp._pv.sp), EqFmt.to_disp(float(spk.value), str(spk.unit)), "%s SP" % id)
		# the stream tag
		var tag := StreamTag.attach(app)
		check(tag.show_for(sid, Vector2(400, 300)), "tag for %s has numbers" % sid)
		same(tag.readouts.flow.text, float(row.flow) * 3.6, "tag %s kmol/h" % sid)
		same(tag.readouts.mass.text, float(row.mass) * 3600.0, "tag %s kg/h" % sid)
		same(tag.readouts.T.text, float(row.T) - 273.15, "tag %s T" % sid)
		same(tag.readouts.P.text, float(row.P) / 1e5, "tag %s P" % sid)
		check(tag.top.size() == (row.top as Array).size() and tag.top.size() <= 3, "tag %s top species count" % sid)
		for i in tag.top.size():
			check(tag.top[i].id == str(row.top[i].id), "tag %s top %d species" % [sid, i])
			same(tag.top[i].text.replace(" %", ""), float(row.top[i].x) * 100.0, "tag %s x(%s) mol%%" % [sid, tag.top[i].id])
		fp.close()
	# a knob commit reaches the engine as SI
	var fp2 := Faceplate.open(app, str(h.id)); await process_frame
	var kt: Knob = fp2.knobs.T; kt.set_value(250.0); kt.committed.emit(250.0); await process_frame
	var after: Dictionary = app.b.q("unitCard", [h.id])
	var tv := 0.0; for k in after.knobs: if k.key == "T": tv = float(k.value)
	check(absf(tv - 523.15) < 1e-6, "turning the T knob to 250 degC set %f K" % tv)
	# an unsolved plant says so (no invented numbers)
	check(not app.b.q("streamTable", [{}]).ok, "an edited plant is unsolved")
	var tag2 := StreamTag.attach(app); var any := str(app.b.q("plant").streams[0].id)
	check(not tag2.show_for(any, Vector2(300, 300)) and tag2.readouts.is_empty(), "an unsolved stream tag shows no numbers")
	print("FACEPLATE-TRUTH checks=%d" % checks)
	print("FACEPLATE-TRUTH OK" if fails == 0 else "FACEPLATE-TRUTH FAILED %d" % fails)
	quit(0 if fails == 0 else 1)
