class_name CareerBoard
extends Ch9Board
## CAREER: the plant manager's office. A calendar strip with the ADVANCE key, the cash ledger, four plant health cards (catalyst, exchanger U, compressor wear,
## inspection, rate knob, turnaround booking), the inbox of contract offers, investment keys, the annual review as typed memos and the ending stamp.
## Pure view of levelView(): every edit leaves as act(name, args) (accept, decline, setRate, inspect, buyCatalyst, turnaround, cancelTurnaround, hireCrew, invest, advance).
const MON := ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
const PLANT_COL := {"nh3": Color("#2D5DA8"), "acid": Color("#C8793C"), "meoh": Color("#2E8B57"), "etoh": Color("#8A5BA8")}
const PLANT_TAG := {"nh3": "NH3", "acid": "H2SO4", "meoh": "MeOH", "etoh": "EtOH"}
const END_NAME := {"chief": "CHIEF ENGINEER", "steady": "STEADY", "sold": "SOLD", "shut": "SHUT DOWN"}
const INV_NAME := {"heat": "HEAT RECOVERY", "abate": "EMISSIONS ABATEMENT", "safety": "SAFETY SYSTEMS"}
var app_ref = null
var _ta := {}                 ## plant -> {m, crane, crew}: the turnaround being drafted

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = Color("#B79C78"); return sb

func _paper(inner: Control, col := Color("#F4EEDC")) -> PanelContainer:
	var p := PanelContainer.new(); var sb := StyleBoxFlat.new(); sb.bg_color = col; sb.border_color = Color("#8A7352"); sb.set_border_width_all(1); sb.set_corner_radius_all(2)
	sb.content_margin_left = 8; sb.content_margin_right = 8; sb.content_margin_top = 6; sb.content_margin_bottom = 6; sb.shadow_color = Color(0, 0, 0, 0.3); sb.shadow_size = 3; sb.shadow_offset = Vector2(1, 2)
	p.add_theme_stylebox_override("panel", sb); p.add_child(inner); return p

func _m(v: float) -> String: return ("%.1f MUSD" % (v / 1e6))

func _build() -> void:
	var d: Dictionary = view.get("dashboard", {})
	if d.is_empty(): body.add_child(lbl("The office is closed.", 14, PENCIL)); return
	var month := int(d.month); var yr := int(d.year)
	body.add_child(head("PLANT MANAGER'S OFFICE", "YEAR %d of 5  ·  MONTH %d / %d" % [yr, month, int(d.months)]))
	body.add_child(_calendar(d))
	body.add_child(_advance_row(d))
	if str(d.ending) != "": body.add_child(_ending(d))
	body.add_child(_ledger(d))
	body.add_child(head("PLANT HEALTH", ""))
	var g := GridContainer.new(); g.columns = 1 if narrow else 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 8); body.add_child(g)
	for p in view.get("plants", []): var c := _plant_card(p, d); c.size_flags_horizontal = Control.SIZE_EXPAND_FILL; g.add_child(c)
	body.add_child(head("INBOX: CONTRACT OFFERS", "%d waiting" % (view.get("offers", []) as Array).size()))
	_offers()
	_contracts()
	body.add_child(head("INVESTMENTS AND CREWS", ""))
	_invest()
	body.add_child(head("ANNUAL REVIEW", ""))
	_reviews(d)
	body.add_child(head("SITE LOG", ""))
	var lg: Array = view.get("log", [])
	for i in range(lg.size() - 1, maxi(-1, lg.size() - 9), -1):
		var r: Dictionary = lg[i]; var sev := str(r.kind) in ["critical", "fine", "strike", "penalty"]
		body.add_child(lbl("m%02d  %s" % [int(r.m), str(r.label)], 12, STAMP_RED if sev else PENCIL))

# ---- calendar -------------------------------------------------------------------------------------------------------------------------------
func _calendar(d: Dictionary) -> Control:
	var c := Cal.new(); c.view = view; c.custom_minimum_size = Vector2(300, 64); return c

func _advance_row(d: Dictionary) -> Control:
	var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 8)
	var over := bool(d.over)
	var k1 := key("ADVANCE 1 MONTH", func(): emit_act("advance", [1]), true, 15); k1.disabled = over; h.add_child(k1)
	var gap := Control.new(); gap.custom_minimum_size = Vector2(28, 1); h.add_child(gap)   # keeps +3 a thumb away from ADVANCE
	var k3 := key("+3 MONTHS", func(): emit_act("advance", [3]), false, 13); k3.disabled = over; h.add_child(k3)
	var ev := str(d.get("lastEvent", ""))
	h.add_child(lbl("last month %s%s" % [_m(float(d.lastMonthUSD)), ("  ·  event %s %s" % [ev, str(d.get("lastEventPlant", ""))]) if ev != "" else ""], 12, PENCIL))
	return h

func _ending(d: Dictionary) -> Control:
	var e := str(d.ending); var good := e == "chief" or e == "steady"
	var h := HBoxContainer.new(); h.alignment = BoxContainer.ALIGNMENT_CENTER
	var st := stamp(str(END_NAME.get(e, e)), OKGREEN if good else STAMP_RED, 26); st.custom_minimum_size = Vector2(240, 44); h.add_child(st)
	return h

# ---- ledger ---------------------------------------------------------------------------------------------------------------------------------
func _ledger(d: Dictionary) -> Control:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 2)
	v.add_child(lbl("CASH LEDGER", 12, PENCIL, "semi"))
	var g := GridContainer.new(); g.columns = 4 if not narrow else 2; g.add_theme_constant_override("h_separation", 18); v.add_child(g)
	var cash := float(d.cashUSD)
	for r in [["CASH", _m(cash), STAMP_RED if cash < 0 else (AMBER_INK if cash < 1e7 else OKGREEN)], ["MARGIN TOTAL", _m(float(d.marginTotalUSD)), PENCIL], ["MARGIN THIS YEAR", _m(float(d.marginYtdUSD)), PENCIL], ["GAS", "$%.2f / GJ" % float(d.gasUSDPerGJ), PENCIL],
			["REGULATOR STRIKES", "%d / %d" % [int(d.strikes), int(d.strikesMax)], STAMP_RED if int(d.strikes) > 0 else PENCIL], ["CRITICAL ALARMS", str(int(d.criticals)), STAMP_RED if int(d.criticals) > 0 else PENCIL],
			["EMISSIONS YTD", "%.0f / %.0f kt" % [float(d.emissionsYtdT) / 1000.0, float(d.emissionsCapT) / 1000.0], PENCIL], ["CHIEF TARGET", _m(float(d.chiefMarginUSD)), PENCIL]]:
		var cell := VBoxContainer.new(); cell.add_theme_constant_override("separation", 0); g.add_child(cell)
		cell.add_child(lbl(r[0], 10, PENCIL, "semi")); cell.add_child(lbl(r[1], 14, r[2], "mono_bold"))
	var pr := HFlowContainer.new(); pr.add_theme_constant_override("h_separation", 14); v.add_child(pr)
	pr.add_child(lbl("SPOT:", 11, PENCIL, "semi"))
	for p in view.get("prices", []): pr.add_child(lbl("%s $%s/t" % [str(p.label), fnum(float(p.spotUSDPerT))], 12, PLANT_COL.get(str(p.plant), PENCIL), "mono_bold"))
	var sp := Spark.new(); sp.hist = view.get("history", []); sp.custom_minimum_size = Vector2(300, 46); v.add_child(sp)
	return _paper(v)

# ---- plant cards -----------------------------------------------------------------------------------------------------------------------------
func _plant_card(p: Dictionary, d: Dictionary) -> Control:
	var id := str(p.id); var col: Color = PLANT_COL.get(id, PENCIL); var m := int(d.month); var over := bool(d.over)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3)
	var hh := HBoxContainer.new(); v.add_child(hh)
	var tg := lbl("%s" % str(p.label).to_upper(), 14, col, "mono_bold"); tg.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hh.add_child(tg)
	if int(p.downDays) > 0: hh.add_child(stamp("DOWN %dd" % int(p.downDays), STAMP_RED, 11))
	var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 6); v.add_child(top)
	var bars := VBoxContainer.new(); bars.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bars.add_theme_constant_override("separation", 2); top.add_child(bars)
	for r in [["CATALYST ACTIVITY", float(p.catalyst), 0.7, true], ["EXCHANGER U", float(p.exchangerU), 0.75, true], ["COMPRESSOR WEAR", float(p.compressorWear), 0.5, false]]:
		var b := Bar.new(); b.cap = r[0]; b.v = r[1]; b.limit = r[2]; b.high_good = r[3]; b.custom_minimum_size = Vector2(150, 24); bars.add_child(b)
	var kn := Knob.new(); kn.app = app_ref; kn.setup("RATE", "×", float(p.rateMin), float(p.rateMax), 0.05, 0.05, float(p.rate)); kn.tooltip_text = "Run rate against capacity. Higher output wears the plant faster."
	kn.committed.connect(func(x: float): emit_act("setRate", [id, x])); kn.editable = not over; kn.custom_minimum_size = Vector2(92, 128); top.add_child(kn)
	var od := int(p.inspectionOverdue)
	v.add_child(lbl("INSPECTION: %d mo since%s" % [int(p.monthsSinceInspection), ("  (%d OVERDUE)" % od) if od > 0 else ""], 12, STAMP_RED if od > 0 else PENCIL, "mono_bold"))
	v.add_child(lbl("output %s t/mo of %s nominal · contracted %s t · risk %s%%" % [fnum(float(p.outputT)), fnum(float(p.nominalT)), fnum(float(p.contractedT)), fnum(float(p.risk) * 100.0, 1)], 11, PENCIL, "sans"))
	var keys := HFlowContainer.new(); keys.add_theme_constant_override("h_separation", 6); keys.add_theme_constant_override("v_separation", 4); v.add_child(keys)
	var ki := key("INSPECT $150k", func(): emit_act("inspect", [id]), false, 11); ki.disabled = over or int(p.monthsSinceInspection) < 6; ki.tooltip_text = "Needs six months since the last one. The plant is down a day."; keys.add_child(ki)
	var kc := key("CATALYST %s" % ("IN STOCK" if int(p.catalystStock) > 0 else "$" + fnum(float(p.catalystPriceUSD) / 1e6, 1) + "M"), func(): emit_act("buyCatalyst", [id]), false, 11); kc.disabled = over or int(p.catalystStock) > 0; kc.tooltip_text = "Buy the next charge before the turnaround that loads it."; keys.add_child(kc)
	v.add_child(_ta_row(p, m, over))
	return _paper(v)

func _ta_row(p: Dictionary, m: int, over: bool) -> Control:
	var id := str(p.id); var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 6); h.add_theme_constant_override("v_separation", 4)
	var tam := int(p.turnaroundMonth)
	if tam >= 0:
		h.add_child(lbl("TURNAROUND booked: month %d · crane %d%s" % [tam, int(p.turnaroundCrane), (" · +%d crew" % int(p.turnaroundCrew)) if int(p.turnaroundCrew) > 0 else ""], 12, OKGREEN, "mono_bold"))
		var kx := key("CANCEL", func(): emit_act("cancelTurnaround", [id]), false, 11); kx.disabled = over; h.add_child(kx)
		return h
	var dr: Dictionary = _ta.get(id, {"m": m + 2, "crane": 1, "crew": 0}); dr.m = maxi(int(dr.m), m); _ta[id] = dr
	h.add_child(lbl("TURNAROUND", 11, PENCIL, "semi"))
	var dn := key("◀", func(): dr.m = maxi(m, int(dr.m) - 1); _render(), false, 11); dn.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(26.0, Ch9Board.tmin())); h.add_child(dn)
	h.add_child(lbl("month %d" % int(dr.m), 12, EqTheme.INK, "mono_bold"))
	var up := key("▶", func(): dr.m = mini(59, int(dr.m) + 1); _render(), false, 11); up.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(26.0, Ch9Board.tmin())); h.add_child(up)
	var kc := key("CRANE %d" % int(dr.crane), func(): dr.crane = 2 if int(dr.crane) == 1 else 1; _render(), false, 11); kc.tooltip_text = "Second crane: faster, extra hire cost."; h.add_child(kc)
	var kw := key("+4 CREW" if int(dr.crew) == 0 else "NO EXTRA CREW", func(): dr.crew = 4 if int(dr.crew) == 0 else 0; _render(), false, 11); h.add_child(kw)
	var kb := key("BOOK", func(): emit_act("turnaround", [id, int(dr.m), int(dr.crane), int(dr.crew)]), true, 11); kb.disabled = over; h.add_child(kb)
	var days := float(p.taDaysWithCatalyst) if int(p.catalystStock) > 0 else float(p.taDaysWithout)
	h.add_child(lbl("%s d %s" % [fnum(days), "with catalyst" if int(p.catalystStock) > 0 else "(no catalyst in stock)"], 11, PENCIL, "sans"))
	return h

# ---- inbox --------------------------------------------------------------------------------------------------------------------------------
func _offers() -> void:
	var offers: Array = view.get("offers", []); var over := bool(view.get("dashboard", {}).get("over", false))
	if offers.is_empty(): body.add_child(_paper(lbl("No offers on the desk. New ones arrive each month.", 13, PENCIL))); return
	for o in offers:
		var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 2)
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 8); v.add_child(h)
		var prem := float(o.premium); var pc: Color = PLANT_COL.get(str(o.plant), PENCIL)
		var t := lbl("%s  %s t/mo  @ $%s/t" % [str(PLANT_TAG.get(str(o.plant), str(o.plant))), fnum(float(o.tpm)), fnum(float(o.priceUSD))], 13, pc, "mono_bold"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; t.clip_text = true; h.add_child(t)
		var ka := key("ACCEPT", func(): emit_act("accept", [o.id]), true, 12); ka.disabled = over; h.add_child(ka)
		h.add_child(key("DECLINE", func(): emit_act("decline", [o.id]), false, 12))
		v.add_child(lbl("%+.0f%% vs spot ($%s)  ·  %d months  ·  %s of capacity  ·  penalty $%s/t short" % [prem * 100.0, fnum(float(o.spotUSD)), int(o.term), fnum(float(o.shareOfCap) * 100.0) + "%", fnum(float(o.penaltyUSDPerT))], 11, OKGREEN if prem > 0 else STAMP_RED, "sans"))
		body.add_child(_paper(v))

func _contracts() -> void:
	var cs: Array = view.get("contracts", [])
	if cs.is_empty(): return
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 1); v.add_child(lbl("ACTIVE CONTRACTS", 11, PENCIL, "semi"))
	for k in cs: v.add_child(lbl("%s  %s t/mo @ $%s  ·  %d mo left  ·  penalty $%s/t" % [str(PLANT_TAG.get(str(k.plant), str(k.plant))), fnum(float(k.tpm)), fnum(float(k.priceUSD)), int(k.monthsLeft), fnum(float(k.penaltyUSDPerT))], 11, PENCIL))
	body.add_child(_paper(v))

# ---- investments ---------------------------------------------------------------------------------------------------------------------------
func _invest() -> void:
	var opt: Dictionary = view.get("options", {}); var over := bool(view.get("dashboard", {}).get("over", false))
	var g := GridContainer.new(); g.columns = 1 if narrow else 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 6); body.add_child(g)
	var inv: Dictionary = opt.get("invest", {})
	for k in ["heat", "abate", "safety"]:
		var o: Dictionary = inv.get(k, {}); var lvl := int(o.get("level", 0)); var mx := int(o.get("max", 3))
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 6)
		var nm := lbl(str(INV_NAME[k]), 12, EqTheme.INK, "mono_bold"); nm.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(nm)
		h.add_child(lbl("LEVEL %d/%d" % [lvl, mx], 12, OKGREEN, "mono_bold"))
		var kb := key("MAXED" if lvl >= mx else "BUY " + _m(float(o.get("nextUSD", 0))), func(): emit_act("invest", [k]), false, 12); kb.disabled = over or lvl >= mx; h.add_child(kb)
		g.add_child(_paper(h))
	var cr: Dictionary = opt.get("crews", {})
	var h2 := HBoxContainer.new(); h2.add_theme_constant_override("separation", 6)
	var nm2 := lbl("TURNAROUND CREWS  %d of %d hired (limit %d people)" % [int(cr.get("hired", 0)), int(cr.get("max", 3)), int(cr.get("limit", 0))], 12, EqTheme.INK, "mono_bold"); nm2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; nm2.clip_text = true; h2.add_child(nm2)
	var kh := key("HIRE CREW", func(): emit_act("hireCrew"), false, 12); kh.disabled = over or int(cr.get("hired", 0)) >= int(cr.get("max", 3)); h2.add_child(kh)
	g.add_child(_paper(h2))

# ---- annual review ---------------------------------------------------------------------------------------------------------------------------
func _reviews(d: Dictionary) -> void:
	var ys: Array = view.get("review", [])
	if ys.is_empty(): body.add_child(_paper(lbl("The first review is at the end of month 12.", 13, PENCIL))); return
	for i in range(ys.size() - 1, -1, -1):
		var y: Dictionary = ys[i]
		var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3)
		v.add_child(lbl("MEMO · ANNUAL REVIEW · YEAR %d" % int(y.year), 13, EqTheme.INK, "mono_bold"))
		v.add_child(lbl("TO: Plant manager     CC: Board", 11, PENCIL))
		v.add_child(HSeparator.new())
		var lines := [
			["VICTOR (finance)", int(y.victor), "Margin %s this year against the board's yearly target. Cash at year end %s." % [_m(float(y.margin)), _m(float(y.cash))]],
			["NOOR (safety, environment)", int(y.noor), "%d critical alarm%s. Emissions at %.0f%% of the cap.%s" % [int(y.criticals), "" if int(y.criticals) == 1 else "s", float(y.emRatio) * 100.0, "  The regulator issued %d strike%s." % [int(y.strike), "" if int(y.strike) == 1 else "s"] if int(y.strike) > 0 else ""]],
			["MARA (operations)", int(y.mara), "Energy at %.0f%% of design, from fouling, catalyst age and wear." % (float(y.effRatio) * 100.0)],
		]
		for r in lines:
			var sc := int(r[1]); var col := OKGREEN if sc >= 80 else (AMBER_INK if sc >= 50 else STAMP_RED)
			var t := lbl("%s: score %d/100.  %s" % [r[0], sc, r[2]], 12, col, "sans"); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(t)
		body.add_child(_paper(v, Color("#FBF8EC")))

# ---- widgets ------------------------------------------------------------------------------------------------------------------------------
class Cal extends Control:
	var view := {}
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_PASS
	func _draw() -> void:
		var d: Dictionary = view.get("dashboard", {}); var m := int(d.get("month", 0)); var base := (mini(int(d.get("year", 1)) - 1, 4)) * 12
		if m > 0 and m % 12 == 0 and m < int(d.get("months", 60)): base = m - 12   # a review is due: the year just closed stays on the strip
		var w := size.x / 12.0; var f := EqTheme.font("mono_bold"); var fs := EqTheme.fs(12)
		for i in 12:
			var mo := base + i; var r := Rect2(i * w + 1, 2, w - 2, 36)
			var col := Color("#E8DFC4") if mo >= m else Color("#CFC6AA")
			draw_rect(r, col); draw_rect(r, Color("#8A7352"), false, 1.0)
			if mo == m: draw_rect(r, Color("#C8323C"), false, 3.0)
			draw_string(f, Vector2(r.position.x + 3, r.position.y + 14), Ch9Board.fnum(mo + 1), HORIZONTAL_ALIGNMENT_LEFT, w, fs, Color("#1E2A2E"))
			draw_string(EqTheme.font("mono"), Vector2(r.position.x + 3, r.position.y + 29), CareerBoard.MON[i], HORIZONTAL_ALIGNMENT_LEFT, w, EqTheme.fs(10), Color("#6A6A60"))
			for c in view.get("calendar", []):
				var pc: Color = CareerBoard.PLANT_COL.get(str(c.plant), Color.BLACK)
				var k := ["nh3", "acid", "meoh", "etoh"].find(str(c.plant))
				if int(c.turnaroundMonth) == mo: draw_rect(Rect2(r.position.x + w - 14, r.position.y + 2 + k * 8, 10, 7), pc); draw_string(f, Vector2(r.position.x + w - 12, r.position.y + 9 + k * 8), "T", HORIZONTAL_ALIGNMENT_LEFT, -1, EqTheme.fs(8), Color.WHITE)
				if int(c.inspectionDueMonth) == mo: draw_circle(Vector2(r.position.x + w - 20, r.position.y + 6 + k * 8), 3.0, pc)
		draw_string(EqTheme.font("sans"), Vector2(2, 54), "dot = inspection due   T = turnaround booked   (colours: NH3 blue, acid orange, MeOH green, EtOH purple)", HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(10), Color("#4A4A48"))

class Bar extends Control:
	var cap := ""
	var v := 0.0
	var limit := 0.0
	var high_good := true
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		var f := EqTheme.font("mono_bold")
		draw_string(f, Vector2(0, 10), "%s %d%%" % [cap, int(round(v * 100.0))], HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(10), Color("#1E2A2E"))
		var r := Rect2(0, 14, size.x, 8); draw_rect(r, Color("#3A3020"))
		var bad := v < limit if high_good else v > limit
		draw_rect(Rect2(r.position, Vector2(r.size.x * clampf(v, 0, 1), r.size.y)), Color("#C8323C") if bad else Color("#2E8B57"))
		var lx := size.x * limit; draw_line(Vector2(lx, 12), Vector2(lx, 24), Color("#E0A020"), 2.0)

class Spark extends Control:
	var hist: Array = []
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#FBF8EC")); draw_rect(Rect2(Vector2.ZERO, size), Color("#B8A888"), false, 1.0)
		if hist.size() < 2: draw_string(EqTheme.font("sans"), Vector2(6, 28), "Cash and margin history builds as the months pass.", HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(11), Color("#6A6A60")); return
		for k in [["cashUSD", Color("#2D5DA8")], ["marginUSD", Color("#C8793C")]]:
			var lo := INF; var hi := -INF
			for h in hist: lo = minf(lo, float(h[k[0]])); hi = maxf(hi, float(h[k[0]]))
			if hi - lo < 1.0: hi = lo + 1.0
			var pts := PackedVector2Array()
			for i in hist.size(): pts.append(Vector2(4 + (size.x - 8) * i / float(hist.size() - 1), size.y - 4 - (size.y - 8) * (float(hist[i][k[0]]) - lo) / (hi - lo)))
			draw_polyline(pts, k[1], 1.8, true)
		draw_string(EqTheme.font("mono"), Vector2(6, 11), "cash (blue)   cumulative margin (orange)", HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(10), Color("#4A4A48"))
