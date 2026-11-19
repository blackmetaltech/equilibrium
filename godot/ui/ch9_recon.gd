class_name Ch9Recon
extends Ch9Board
## L37: an analyst's logsheet. Meter table (reading with sigma, reconciled value, adjustment, z) with exclude and flag toggles, the RECONCILE key, node imbalances
## before and after, and chi-square against its critical value.

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#F1F1E2"); return sb

func _draw() -> void:
	for y in range(36, int(size.y), 22): draw_line(Vector2(8, y), Vector2(size.x - 8, y), Color(PAPER_LINE, 0.55), 1.0)
	draw_line(Vector2(60, 0), Vector2(60, size.y), Color("#D88A8A", 0.7), 1.5)

func _build() -> void:
	body.add_child(head("DATA RECONCILIATION LOGSHEET", ""))
	var meters: Array = view.get("meters", [])
	if meters.is_empty(): body.add_child(lbl("No meter readings yet.", 13, PENCIL)); return
	var shown := bool(view.get("shown", false)); var zl := float(view.get("zLimit", 3.29))
	var g := GridContainer.new(); g.columns = 8; g.add_theme_constant_override("h_separation", 10); g.add_theme_constant_override("v_separation", 4); body.add_child(g)
	for c in ["TAG", "METER", "READING ± σ", "RECON", "ADJ", "z", "", ""]: g.add_child(lbl(c, 11, PENCIL, "semi"))
	for m in meters:
		var ex := bool(m.excluded); var fl := bool(m.flagged)
		var dim := PENCIL if ex else Color("#1E2A2E")
		g.add_child(lbl(str(m.tag), 13, dim, "mono_bold"))
		var on: Array = m.get("onNodes", [])
		var nm := lbl(str(m.label) + (" (" + ", ".join(on) + ")" if on.size() > 0 else ""), 12, dim, "sans"); nm.custom_minimum_size = Vector2(130, 0); nm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; g.add_child(nm)
		g.add_child(lbl("%s ± %s" % [fnum(m.reading, 2), fnum(m.sigma, 2)], 13, dim))
		g.add_child(lbl("—" if m.recon == null else fnum(m.recon, 2), 13, dim))
		g.add_child(lbl("—" if m.adjust == null else ("%+.2f" % float(m.adjust)), 13, dim))
		var big := m.z != null and absf(float(m.z)) > zl
		g.add_child(lbl("—" if m.z == null else ("%+.2f" % float(m.z)) + (" !" if big else ""), 13, STAMP_RED if big else dim, "mono_bold"))
		g.add_child(key("INCLUDE" if ex else "EXCLUDE", func(): emit_act("include" if ex else "exclude", [m.i]), ex, 11))
		g.add_child(key("UNFLAG" if fl else "FLAG", func(): emit_act("unflag" if fl else "flag", [m.i]), fl, 11))
	var bar := HBoxContainer.new(); bar.add_theme_constant_override("separation", 12); body.add_child(bar)
	bar.add_child(key("RECONCILE", func(): emit_act("reconcile"), true, 15))
	var c2 := float(view.get("chi2", 0.0)); var cc := float(view.get("chi2Crit", 0.0)); var bad := c2 > cc
	bar.add_child(lbl("χ² %s  vs critical %s" % [fnum(c2, 2), fnum(cc, 2)], 14, STAMP_RED if bad else OKGREEN, "mono_bold"))
	if shown: bar.add_child(stamp("GROSS ERROR" if bad else "CONSISTENT", STAMP_RED if bad else OKGREEN))
	if view.get("rmsErr") != null: bar.add_child(lbl("rms %s" % fnum(float(view.rmsErr), 3), 12, PENCIL))
	var cn := lbl(str(view.get("chi2Note", "")), 11, PENCIL, "sans"); cn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; body.add_child(cn)
	body.add_child(lbl("flag fee %s per flagged meter · budget %s" % [usd(float(view.get("flagFeeUSD", 0.0))), usd(float(view.get("budgetUSD", 0.0)))], 12, PENCIL))
	body.add_child(HSeparator.new())
	body.add_child(head("NODE IMBALANCES", "raw meters → reconciled flows"))
	var ng := GridContainer.new(); ng.columns = 4; ng.add_theme_constant_override("h_separation", 14); body.add_child(ng)
	for n in view.get("nodes", []):
		ng.add_child(lbl(str(n.id), 13, Color("#1E2A2E"), "mono_bold"))
		var nl := lbl(str(n.label), 12, PENCIL, "sans"); nl.custom_minimum_size = Vector2(300, 0); nl.clip_text = true; ng.add_child(nl)
		ng.add_child(lbl("%+.3f" % float(n.imbalance), 13, STAMP_RED if (absf(float(n.imbalance)) > float(n.tol) if n.has("tol") else absf(float(n.imbalance)) > 0.5) else Color("#1E2A2E")))
		ng.add_child(lbl("→ " + ("%+.3f" % float(n.imbalanceAfter)) if shown else "→ —", 13, (OKGREEN if bool(n.get("closes", true)) else STAMP_RED) if shown else PENCIL))
