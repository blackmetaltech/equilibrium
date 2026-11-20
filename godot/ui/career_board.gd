class_name CareerBoard
extends Ch9Board
## CAREER: the plant manager's office. A calendar strip with the ADVANCE key, the cash ledger, four plant health cards (catalyst, exchanger U, compressor wear,
## inspection, rate knob, turnaround booking), the inbox of contract offers, investment keys, the annual review as typed memos and the ending stamp.
## Pure view of levelView(): every edit leaves as act(name, args) (accept, decline, setRate, inspect, buyCatalyst, turnaround, cancelTurnaround, hireCrew, invest, advance).
const MON := ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"]
const PLANT_COL := {"nh3": Color("#2D5DA8"), "acid": Color("#C8793C"), "meoh": Color("#2E8B57"), "etoh": Color("#8A5BA8")}
const PLANT_TAG := {"nh3": "Ammonia", "acid": "Sulfuric acid", "meoh": "Methanol", "etoh": "Ethanol"}   ## one name per product; the formula appears once, on the plant card
const END_NAME := {"chief": "FLAGSHIP", "steady": "STEADY", "sold": "SOLD", "shut": "SHUT DOWN"}
const INV_NAME := {"heat": "HEAT RECOVERY", "abate": "EMISSIONS ABATEMENT", "safety": "SAFETY SYSTEMS"}
var app_ref = null
var _ta := {}                 ## plant -> {m, crane, crew}: the turnaround being drafted
var _cards := {}              ## plant id -> its card (the alert strip scrolls to it)
var _lock_until := 0          ## msec: +3 MONTHS stays dark for about a second after a stop at a warning, so a double click cannot ride through it
var pin: VBoxContainer        ## the action row, the strike warning and a pending decision: outside the scroll, so they never move and never need a wheel
var _open := {}               ## plant id -> bool: the player's choice to open or fold a plant card (absent: the default, see _plant_open)
var _armed := {}              ## plant id -> true: BUY CATALYST was pressed once and waits (no timeout) for the confirming press or a CANCEL
var _book_msg := {}           ## plant id -> why BOOK did nothing (no catalyst charge yet), shown until the charge is bought
var _dec_open := -1           ## the pending card's DETAILS: -1 default (open unless compact), 0 folded, 1 open
var _last_run := "3"          ## the last multi-month key pressed ("3" or "next"): CONTINUE ANYWAY acknowledges and runs it again

func _init() -> void:
	super()
	remove_child(scroll)
	var outer := VBoxContainer.new(); outer.name = "Outer"; outer.add_theme_constant_override("separation", 4); add_child(outer)
	pin = VBoxContainer.new(); pin.name = "Pinned"; pin.add_theme_constant_override("separation", 4); outer.add_child(pin)
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL; scroll.size_flags_horizontal = Control.SIZE_EXPAND_FILL; outer.add_child(scroll)

## A handheld board (1280x800 leaves it about 570 px): plant cards fold and the pending card's long text hides behind DETAILS until asked for.
func _compact() -> bool: return fit_h < 700.0 or fit_w < 600.0

## Open every plant card (tests and the player's "show all"): the choice sticks until a card is folded again.
func open_all() -> void:
	for p in view.get("plants", []): _open[str(p.id)] = true
	_refresh_keep()

## Re-draw after a local change (fold, arm, draft) without the scroll jumping back to the top.
func _refresh_keep() -> void:
	_want_scroll = scroll.scroll_vertical; _render(); _restore_scroll()

## The board is a column of cards: below 900 px the grids reflow to one or two columns so the contents never ask for more width than the panel has.
func fit(w: float, h: float, p_narrow: bool) -> void:
	super(w, h, p_narrow or w < 900.0)

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
	var month := int(d.get("monthNow", int(d.month) + 1)); var yr := int(d.year)   # the month now in progress, 1-based (the engine's monthNow)
	body.add_child(head("PLANT MANAGER'S OFFICE", "YEAR %d of 5  ·  MONTH %d / %d" % [yr, month, int(d.months)]))
	_cards.clear()
	for c0 in pin.get_children(): pin.remove_child(c0); c0.queue_free()
	# pinned: the action row, the strike warning and a pending decision (they are what the manager acts on, so they stay where the thumb is)
	pin.add_child(_advance_row(d))
	var sw: Array = d.get("strikeWarn", [])
	if not sw.is_empty() and not bool(d.over):
		var swl := lbl("\n".join(PackedStringArray(sw)), 12, STAMP_RED, "mono_bold"); swl.name = "StrikeWarn"; swl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; swl.custom_minimum_size = Vector2(200, 0); pin.add_child(swl)
	if not bool(d.over):
		for bn in [["emWarn", "EmWarn"], ["endAhead", "EndAhead"]]:
			var bt := str(d.get(bn[0], ""))
			if bt == "": continue
			var cut := bt.find(" Levers:")
			var bl := lbl(bt.substr(0, cut) if cut >= 0 else bt, 12, STAMP_RED, "mono_bold"); bl.name = bn[1]; bl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bl.custom_minimum_size = Vector2(200, 0); pin.add_child(bl)
	var dc: Variant = d.get("decision", null)
	var dpend := dc is Dictionary and bool((dc as Dictionary).get("pending", false))
	if dpend: pin.add_child(_decision_card(dc as Dictionary, bool(d.over)))
	var ewt := str(d.get("emWarn", ""))
	if ewt != "" and ewt.find(" Levers:") >= 0 and not bool(d.over):
		var el := lbl("EMISSIONS LEVERS:" + ewt.substr(ewt.find(" Levers:") + 8), 12, AMBER_INK, "sans"); el.name = "EmLevers"; el.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; el.custom_minimum_size = Vector2(200, 0); body.add_child(_paper(el, Color("#F8EBD0")))
	body.add_child(_alerts(d))
	body.add_child(_calendar(d))
	if dc is Dictionary and not dpend: body.add_child(_decision_card(dc as Dictionary, bool(d.over)))
	body.add_child(_advance_notes(d))
	if str(d.ending) != "": body.add_child(_ending(d))
	body.add_child(_ledger(d))
	body.add_child(head("ENDINGS", "where this Works is heading"))
	body.add_child(_endings())
	body.add_child(head("PLANT HEALTH", ""))
	var g := GridContainer.new(); g.columns = 1 if narrow else 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 8); body.add_child(g)
	for p in view.get("plants", []): var c := _plant_card(p, d); c.size_flags_horizontal = Control.SIZE_EXPAND_FILL; g.add_child(c); _cards[str(p.id)] = c
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
		var r: Dictionary = lg[i]; var sev := str(r.kind) in ["critical", "fine", "strike", "penalty", "notice"]
		body.add_child(lbl("%s  %s" % [str(r.get("stamp", "m%02d" % int(r.m))), str(r.label)], 12, STAMP_RED if sev else PENCIL))

# ---- alert strip: what needs the manager now, each with a key that jumps to the plant ------------------------------------------------------------
func _alerts(d: Dictionary) -> Control:
	var al: Array = []; var handled: Array = []   # a warning a booked turnaround already takes care of is shown apart and does not count as needing the manager
	for a0 in d.get("alerts", []):
		if bool(a0.get("handled", false)): handled.append(a0)
		else: al.append(a0)
	var v := VBoxContainer.new(); v.name = "AlertStrip"; v.add_theme_constant_override("separation", 3)
	if al.is_empty() or bool(d.get("over", false)):
		v.add_child(lbl("ALERTS: none. Every inspection, catalyst and exchanger is in order." if handled.is_empty() else "ALERTS: none need you. A booked turnaround covers the rest.", 12, OKGREEN, "mono_bold"))
		for h0 in handled:
			var hl := lbl("%s: %s" % [str(PLANT_TAG.get(str(h0.plant), str(h0.plant))), str(h0.text).trim_prefix(str(h0.label) + ": ")], 11, OKGREEN, "sans"); hl.name = "Handled_%s" % str(h0.plant); hl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; hl.custom_minimum_size = Vector2(200, 0); v.add_child(hl)
		var r0 := lbl(str(d.get("strikeRule", "")), 11, PENCIL, "sans"); r0.name = "StrikeRule"; r0.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; r0.custom_minimum_size = Vector2(200, 0); v.add_child(r0)
		return _paper(v, Color("#EFF3E2"))
	var by := {}; var order: Array = []   # one row per plant: all of its alerts, one JUMP TO PLANT key
	for a in al:
		var pid0 := str(a.plant)
		if not by.has(pid0): by[pid0] = []; order.append(pid0)
		(by[pid0] as Array).append(str(a.text).trim_prefix(str(a.label) + ": "))
	v.add_child(lbl("ALERTS: %d plant%s need%s you" % [order.size(), "" if order.size() == 1 else "s", "s" if order.size() == 1 else ""], 12, STAMP_RED, "mono_bold"))
	for pid in order:
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 8)
		var nm: String = str(PLANT_TAG.get(pid, pid))
		var t := lbl("%s: %s" % [nm, "; ".join(PackedStringArray(by[pid]))], 12, AMBER_INK, "sans"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size = Vector2(160, 0); h.add_child(t)
		var kj := key("JUMP TO PLANT", func(): jump_to(pid), false, 11); kj.name = "Jump_%s" % pid; kj.custom_minimum_size = Vector2(0, 28); h.add_child(kj)
		v.add_child(h)
	var rl := lbl(str(d.get("strikeRule", "")), 11, PENCIL, "sans"); rl.name = "StrikeRule"; rl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; rl.custom_minimum_size = Vector2(200, 0); v.add_child(rl)
	return _paper(v, Color("#F8EBD0"))

## Scroll the office to a plant's card.
func jump_to(pid: String) -> void:
	var c = _cards.get(pid)
	if c == null or not is_instance_valid(c): return
	scroll.scroll_vertical = maxi(0, int((c as Control).global_position.y - body.global_position.y) - 6)

# ---- calendar -------------------------------------------------------------------------------------------------------------------------------
func _calendar(d: Dictionary) -> Control:
	var c := Cal.new(); c.view = view; c.custom_minimum_size = Vector2(300, 64); return c

var _busy := false            ## a month advance is running: input is ignored (never queued and replayed later)
func emit_act(name: String, args: Array = []) -> void:
	if _busy and name != "advance" and name != "advanceToDecision": return
	super(name, args)

## One advance: show WORKING, let it draw, run the months, then keep ignoring input for a few frames so keys pressed during a long advance are dropped, not replayed.
func advance_months(n: int) -> void:
	if _busy: return
	if n > 1: _last_run = "3"
	var rv0 := (view.get("review", []) as Array).size()
	_busy = true; _render()
	await get_tree().process_frame; await get_tree().process_frame
	Input.flush_buffered_events()
	act.emit("advance", [n])
	if n > 1 and bool(view.get("dashboard", {}).get("needsAck", false)): _lock_until = Time.get_ticks_msec() + 1000
	Input.flush_buffered_events()
	for i in 4: await get_tree().process_frame
	_busy = false; _render()
	_year_popup(rv0)
	if _lock_until > Time.get_ticks_msec():
		await get_tree().create_timer(1.05).timeout
		if is_inside_tree(): _render()

## CONTINUE ANYWAY: acknowledge the warnings that are open (each by its own key in the engine) and run what was stopped, in one press.
func continue_anyway() -> void:
	if _busy: return
	emit_act("ackWarning")
	if _last_run == "next": advance_to_decision()
	else: advance_months(3)

## NEXT DECISION: run months until something needs the manager (the engine says why it stopped); same busy/lock handling as advance_months.
func advance_to_decision() -> void:
	if _busy: return
	_last_run = "next"
	var rv0 := (view.get("review", []) as Array).size()
	_busy = true; _render()
	await get_tree().process_frame; await get_tree().process_frame
	Input.flush_buffered_events()
	act.emit("advanceToDecision", [])
	if bool(view.get("dashboard", {}).get("needsAck", false)): _lock_until = Time.get_ticks_msec() + 1000
	Input.flush_buffered_events()
	for i in 4: await get_tree().process_frame
	_busy = false; _render()
	_year_popup(rv0)
	if _lock_until > Time.get_ticks_msec():
		await get_tree().create_timer(1.05).timeout
		if is_inside_tree(): _render()

## A year ended during this advance: the annual review opens as a card over the board (NEXT DECISION stops there), with last year's card priced against the road not taken. CONTINUE closes it. The last year's review opens through review_first instead.
func _year_popup(before: int) -> void:
	var ys: Array = view.get("review", [])
	if app_ref == null or ys.size() <= before or ys.is_empty() or str(view.get("dashboard", {}).get("ending", "")) != "": return
	var old = app_ref.get_meta("career_year_popup") if app_ref.has_meta("career_year_popup") else null
	if old != null and is_instance_valid(old) and (old as Node).is_inside_tree(): (old as Node).queue_free()
	var y: Dictionary = ys[ys.size() - 1]
	var d: Dictionary = app_ref.dialog("career_year_review", 760.0, 0.0, EqTheme.PEN_GREEN, 0.6)
	var host: Control = d.host; var vb: VBoxContainer = d.vb
	app_ref.set_meta("career_year_popup", host)
	var sc := ScrollContainer.new(); sc.name = "YearReviewScroll"; sc.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; sc.custom_minimum_size = Vector2(0, minf(520.0, app_ref.get_viewport().get_visible_rect().size.y * 0.62)); vb.add_child(sc)
	var memo := _memo(y, "YEAR %d REVIEW" % int(y.year), ys[ys.size() - 2] if ys.size() > 1 else {}); memo.name = "YearReview"; memo.size_flags_horizontal = Control.SIZE_EXPAND_FILL; sc.add_child(memo)
	var go := EqTheme.key_button("CONTINUE", true, 16); go.name = "YearReviewContinue"
	go.pressed.connect(func(): host.queue_free())
	vb.add_child(go); go.grab_focus.call_deferred()

## The yearly decision card: a paper slip with the situation and two options, each with its expected MUSD from the engine and the terms that add up to it. Pending: amber paper (pinned above the scroll) and two CHOOSE keys; the long text sits behind DETAILS on a handheld. Answered: the chosen option stays on the slip.
func _decision_card(dc: Dictionary, over: bool) -> Control:
	var pending := bool(dc.get("pending", false))
	var det := true if not pending else (_dec_open == 1 if _dec_open >= 0 else not _compact())
	var v := VBoxContainer.new(); v.name = "DecisionCard"; v.add_theme_constant_override("separation", 4)
	var th := HBoxContainer.new(); th.add_theme_constant_override("separation", 8); v.add_child(th)
	var t := lbl("YEAR %d  ·  %s" % [int(dc.year), str(dc.title)], 14, STAMP_RED if pending else PENCIL, "mono_bold"); t.name = "DecisionTitle"; t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size = Vector2(220, 0); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; th.add_child(t)
	if pending:
		var kd := key("DETAILS ▴" if det else "DETAILS ▾", func(): _dec_open = 0 if det else 1; _refresh_keep(), false, 11); kd.name = "DecisionDetails"; kd.tooltip_text = "The situation, each option in words and the advice."; th.add_child(kd)
		var b := lbl(str(dc.body), 12, PENCIL, "sans"); b.name = "DecisionBody"; b.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; b.custom_minimum_size = Vector2(220, 0); b.visible = det; v.add_child(b)
	for o in dc.get("options", []):
		var chosen := bool(o.chosen)
		if not pending and not chosen: continue
		var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 8); v.add_child(h)
		var ix := int(o.index)
		if pending:
			var k := key("CHOOSE %s  ·  %+.2f MUSD" % [str(o.label), float(o.effMusd)], func(): emit_act("answer", [ix]), ix == int(dc.best) and bool(dc.get("learner", false)), 13); k.name = "Choose_%s" % str(o.label); k.disabled = over or _busy; k.tooltip_text = str(o.effectText); h.add_child(k)
		else:
			var tag := lbl("YOU CHOSE %s%s" % [str(o.label), "  (the decision lapsed)" if bool(dc.get("lapsed", false)) else ""], 12, OKGREEN if not bool(dc.get("lapsed", false)) else AMBER_INK, "mono_bold"); tag.name = "DecisionChosen"; h.add_child(tag)
		var ef := lbl(str(o.effectText), 12, STAMP_RED if float(o.effectUSD) < 0.0 else PENCIL, "mono_bold"); ef.name = "Effect_%s" % str(o.label); ef.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; ef.custom_minimum_size = Vector2(200, 0); ef.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(ef)
		var ot := lbl(str(o.text), 12, PENCIL, "sans"); ot.name = "OptionText_%s" % str(o.label); ot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; ot.custom_minimum_size = Vector2(220, 0); ot.visible = det; v.add_child(ot)
	if pending:
		if bool(dc.get("learner", false)):
			var hi := lbl(str(dc.hint), 12, OKGREEN, "sans"); hi.name = "DecisionHint"; hi.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; hi.custom_minimum_size = Vector2(220, 0); hi.visible = det; v.add_child(hi)
		var bl := lbl(str(dc.blocks), 11, AMBER_INK, "sans"); bl.name = "DecisionBlocks"; bl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bl.custom_minimum_size = Vector2(220, 0); bl.visible = det; v.add_child(bl)
	return _paper(v, Color("#F6E7B8") if pending else Color("#F4EEDC"))

func _musd_short(x: float) -> String: return "%s%.1f MUSD" % ["+" if x >= 0.0 else "-", absf(x) / 1e6]

## The action row, pinned: ADVANCE 1 MONTH, NEXT DECISION, +3 MONTHS and CONTINUE ANYWAY with what stopped the last run (the banners are about the keys, so they sit under them).
func _advance_row(d: Dictionary) -> Control:
	var v := VBoxContainer.new(); v.name = "ActionRow"; v.add_theme_constant_override("separation", 3)
	var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 8); v.add_child(h)
	var over := bool(d.over)
	var k1 := key("ADVANCE 1 MONTH", func(): advance_months(1), true, 15); k1.name = "Advance1"; k1.disabled = over or _busy; h.add_child(k1)
	k1.tooltip_text = "One month. A waiting yearly decision lapses to option B."
	var gap := Control.new(); gap.custom_minimum_size = Vector2(28, 1); h.add_child(gap)   # keeps the multi-month keys a thumb away from ADVANCE
	var ack := bool(d.get("needsAck", false)); var locked := Time.get_ticks_msec() < _lock_until
	var dcv: Variant = d.get("decision", null); var pend := dcv is Dictionary and bool((dcv as Dictionary).get("pending", false))
	var kn := key("NEXT DECISION ▸", func(): advance_to_decision(), true, 15); kn.name = "NextDecision"; kn.disabled = over or _busy or ack or locked or pend
	kn.tooltip_text = str(d.get("nextNote", "")); h.add_child(kn)
	var k3 := key("+3 MONTHS", func(): advance_months(3), false, 13); k3.name = "Advance3"; k3.disabled = over or _busy or ack or locked or pend
	k3.tooltip_text = "Stops early at an inspection coming due, a worn catalyst, a fouled exchanger and the annual review. A warning that is open (and not covered by a booked turnaround) must be acknowledged first: CONTINUE ANYWAY."; h.add_child(k3)
	if ack and not over:
		var kc := key("CONTINUE ANYWAY", func(): continue_anyway(), true, 12); kc.name = "ContinueAnyway"; kc.disabled = _busy or locked or pend
		kc.tooltip_text = "Acknowledge the open warnings (each one, by plant and due date) and keep running, in one press. ADVANCE 1 MONTH always works."; h.add_child(kc)
	if _busy:
		var w := lbl("WORKING... running the months, input is paused", 13, AMBER_INK, "mono_bold"); w.name = "Working"; h.add_child(w)
	var wn := str(d.get("whyNote", ""))
	if wn != "" and not over:
		var wl := lbl(wn, 12, STAMP_RED, "mono_bold"); wl.name = "WhyStopped"; wl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wl.size_flags_horizontal = Control.SIZE_EXPAND_FILL; wl.custom_minimum_size = Vector2(200, 0); v.add_child(wl)
	var sn: Array = d.get("stoppedNotes", [])
	if ack and not over:
		var sl := lbl("Open warning: " + "; ".join(PackedStringArray(sn)) + ". Deal with it (or book its turnaround), or press CONTINUE ANYWAY.", 12, STAMP_RED, "mono_bold"); sl.name = "Stopped"; sl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; sl.custom_minimum_size = Vector2(200, 0); v.add_child(sl)
	return v

## The notes that go with the keys but need not stay in view: what NEXT DECISION will stop at, last month, the flags +3 MONTHS stops at.
func _advance_notes(d: Dictionary) -> Control:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3)
	var over := bool(d.over)
	var dcv: Variant = d.get("decision", null); var pend := dcv is Dictionary and bool((dcv as Dictionary).get("pending", false))
	var nn := lbl(str(d.get("nextNote", "")), 11, AMBER_INK if pend else PENCIL, "sans"); nn.name = "NextNote"; nn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; nn.size_flags_horizontal = Control.SIZE_EXPAND_FILL; nn.custom_minimum_size = Vector2(200, 0); v.add_child(nn)
	var ev := str(d.get("lastEvent", ""))
	var st := lbl("last month %s%s" % [_m(float(d.lastMonthUSD)), ("  ·  %s at %s" % [str(d.get("lastEventLabel", "")), str(d.get("lastEventPlantLabel", ""))]) if ev != "" else ""], 12, PENCIL)
	st.name = "LastMonth"; st.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; st.size_flags_horizontal = Control.SIZE_EXPAND_FILL; st.custom_minimum_size = Vector2(200, 0); v.add_child(st)   # a long event wraps here and never pushes the keys around
	var an: Array = d.get("attentionNotes", [])
	if not an.is_empty() and not over and not bool(d.get("needsAck", false)):
		var al := lbl("+3 MONTHS stops here: " + "; ".join(PackedStringArray(an)), 11, AMBER_INK, "sans"); al.name = "Attention"; al.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; al.custom_minimum_size = Vector2(200, 0); v.add_child(al)
	return v

func _ending(d: Dictionary) -> Control:
	var e := str(d.ending); var good := e == "chief" or e == "steady"
	var h := HBoxContainer.new(); h.alignment = BoxContainer.ALIGNMENT_CENTER
	var st := stamp(str(END_NAME.get(e, e)), OKGREEN if good else STAMP_RED, 26); st.custom_minimum_size = Vector2(240, 44); h.add_child(st)
	var why := str(d.get("endingWhy", ""))
	if why == "": return h
	var v := VBoxContainer.new(); v.name = "EndingCard"; v.add_theme_constant_override("separation", 4); v.add_child(h)
	var wl := lbl(why, 12, OKGREEN if good else STAMP_RED, "mono_bold"); wl.name = "EndingWhy"; wl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wl.custom_minimum_size = Vector2(240, 0); v.add_child(wl)
	return v

# ---- ledger ---------------------------------------------------------------------------------------------------------------------------------
func _ledger(d: Dictionary) -> Control:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 2)
	v.add_child(lbl("CASH LEDGER", 12, PENCIL, "semi"))
	var g := GridContainer.new(); g.name = "LedgerGrid"; g.columns = 4 if (not narrow and fit_w >= 1000.0) else 2; g.add_theme_constant_override("h_separation", 18); v.add_child(g)   # four columns of long captions are wider than an 800 px board: two there
	var cash := float(d.cashUSD)
	for r in [["CASH", _m(cash), STAMP_RED if cash < 0 else (AMBER_INK if cash < 1e7 else OKGREEN)], ["OPERATING MARGIN, TOTAL (the score)", _m(float(d.get("opMarginTotalUSD", d.marginTotalUSD))), PENCIL], ["OPERATING MARGIN, THIS YEAR", _m(float(d.get("opMarginYtdUSD", d.marginYtdUSD))), PENCIL], ["ON THIS PACE, FIVE YEARS", _m(float(d.get("paceUSD", 0.0))), PENCIL], ["FLAGSHIP NEEDS (operating margin)", _m(float(d.chiefMarginUSD)), PENCIL], ["INVESTMENTS, THIS YEAR", _m(float(d.get("investmentsYtdUSD", 0.0))), PENCIL], ["INVESTMENTS, TOTAL", _m(float(d.get("investmentsTotalUSD", 0.0))), PENCIL], ["AFTER INVESTMENTS, TOTAL", _m(float(d.marginTotalUSD)), PENCIL], ["AFTER INVESTMENTS, THIS YEAR", _m(float(d.marginYtdUSD)), PENCIL], ["GAS", "$%.2f / GJ" % float(d.gasUSDPerGJ), PENCIL],
			["REGULATOR STRIKES", "%d / %d" % [int(d.strikes), int(d.strikesMax)], STAMP_RED if int(d.strikes) > 0 else PENCIL], ["CRITICAL ALARMS", str(int(d.criticals)), STAMP_RED if int(d.criticals) > 0 else PENCIL],
			["EMISSIONS YTD", "%.0f / %.0f kt" % [float(d.emissionsYtdT) / 1000.0, float(d.emissionsCapT) / 1000.0], PENCIL]]:
		var cell := VBoxContainer.new(); cell.add_theme_constant_override("separation", 0); cell.size_flags_horizontal = Control.SIZE_EXPAND_FILL; g.add_child(cell)
		var cap := lbl(r[0], 10, PENCIL, "semi"); cap.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cap.custom_minimum_size = Vector2(120, 0); cell.add_child(cap); cell.add_child(lbl(r[1], 14, r[2], "mono_bold"))
	var pr := HFlowContainer.new(); pr.add_theme_constant_override("h_separation", 14); v.add_child(pr)
	pr.add_child(lbl("SPOT:", 11, PENCIL, "semi"))
	for p in view.get("prices", []): pr.add_child(lbl("%s $%s/t" % [str(PLANT_TAG.get(str(p.plant), str(p.label))), fnum(float(p.spotUSDPerT))], 12, PLANT_COL.get(str(p.plant), PENCIL), "mono_bold"))
	var sp := Spark.new(); sp.hist = view.get("history", []); sp.custom_minimum_size = Vector2(300, 70); v.add_child(sp)
	return _paper(v)

# ---- endings strip: Sold / Shut / Steady / Flagship, the state of each and what it needs ---------------------------------------------------------
const END_STATE_COL := {"achieved": Color("#2E7D4F"), "course": Color("#2E7D4F"), "open": Color("#4A4A48"), "danger": Color("#C8323C"), "closed": Color("#9A9A94")}
const END_STATE_TAG := {"achieved": "REACHED", "course": "ON COURSE", "open": "OPEN", "danger": "AT RISK", "closed": "CLOSED"}
func _endings() -> Control:
	var e: Dictionary = view.get("endings", {})
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 4)
	if e.is_empty(): return _paper(lbl("The endings appear when the career starts.", 12, PENCIL))
	var note := lbl(str(e.get("note", "")), 12, PENCIL, "sans"); note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(note)
	var lv: Array = e.get("levers", [])
	if not lv.is_empty():
		v.add_child(lbl("WHAT WOULD MOVE YOU", 11, PENCIL, "semi"))
		for x in lv: var ll := lbl("•  " + str(x), 12, EqTheme.INK, "sans"); ll.name = "Lever"; ll.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; ll.custom_minimum_size = Vector2(200, 0); v.add_child(ll)
	var g := GridContainer.new(); g.columns = 1 if narrow else 2; g.add_theme_constant_override("h_separation", 8); g.add_theme_constant_override("v_separation", 6); v.add_child(g)
	for r in e.get("rows", []):
		var st := str(r.get("state", "open")); var col: Color = END_STATE_COL.get(st, PENCIL)
		var c := VBoxContainer.new(); c.add_theme_constant_override("separation", 1); c.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 8)
		h.add_child(lbl(str(r.label).to_upper(), 13, col, "mono_bold")); h.add_child(stamp(str(END_STATE_TAG.get(st, st)), col, 10)); c.add_child(h)
		for n in r.get("needs", []):
			var t := lbl(("%s  %s" % ["[x]" if bool(n.met) else "[ ]", str(n.text)]), 11, OKGREEN if bool(n.met) else PENCIL, "sans"); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; c.add_child(t)
		g.add_child(_paper(c, Color("#FBF8EC")))
	return _paper(v)

# ---- plant cards -----------------------------------------------------------------------------------------------------------------------------
func _plant_card(p: Dictionary, d: Dictionary) -> Control:
	var id := str(p.id); var col: Color = PLANT_COL.get(id, PENCIL); var m := int(d.month); var over := bool(d.over)
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3)
	var hh := HBoxContainer.new(); v.add_child(hh)
	var tg := lbl("%s" % str(p.label).to_upper(), 14, col, "mono_bold"); tg.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hh.add_child(tg)
	if int(p.downDays) > 0:
		var db := stamp("DOWN %dd" % int(p.downDays), STAMP_RED, 11); db.tooltip_text = str(p.get("downNote", "")); db.mouse_filter = Control.MOUSE_FILTER_PASS; hh.add_child(db)
		var dl := lbl(str(p.get("downNote", "")), 11, STAMP_RED, "sans"); dl.name = "DownNote"; dl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; dl.custom_minimum_size = Vector2(160, 0); v.add_child(dl)
	var open := _plant_open(id, d)
	var kt := key("▾ FOLD" if open else "▸ OPEN", func(): _open[id] = not open; _refresh_keep(), false, 11); kt.name = "PlantToggle_" + id; kt.tooltip_text = "Fold or open this plant card."; hh.add_child(kt); hh.move_child(kt, 1)
	if not open:   # folded: the numbers that matter, the inspection state and the booking in two lines
		var ist0 := str(p.get("inspectionState", "ok")); var icol0: Color = STAMP_RED if ist0 == "overdue" else (AMBER_INK if ist0 == "due" else PENCIL)
		var sm := lbl("catalyst %d%% · exchanger U %d%% · wear %d%% · rate ×%.2f · risk %s%%" % [int(round(float(p.catalyst) * 100.0)), int(round(float(p.exchangerU) * 100.0)), int(round(float(p.compressorWear) * 100.0)), float(p.rate), fnum(float(p.risk) * 100.0, 1)], 11, PENCIL, "mono"); sm.name = "Summary_" + id; sm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; sm.custom_minimum_size = Vector2(160, 0); v.add_child(sm)
		var il0 := lbl("INSPECTION %s" % str(p.get("inspectionNote", "")), 11, icol0, "mono_bold"); il0.name = "InspNote_" + id; il0.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; il0.custom_minimum_size = Vector2(160, 0); v.add_child(il0)
		if int(p.turnaroundMonth) >= 0: v.add_child(lbl("TURNAROUND booked: month %d" % (int(p.turnaroundMonth) + 1), 11, OKGREEN, "mono_bold"))
		return _paper(v)
	var top := HBoxContainer.new(); top.add_theme_constant_override("separation", 6); v.add_child(top)
	var bars := VBoxContainer.new(); bars.size_flags_horizontal = Control.SIZE_EXPAND_FILL; bars.add_theme_constant_override("separation", 2); top.add_child(bars)
	for r in [["CATALYST ACTIVITY", float(p.catalyst), 0.7, true], ["EXCHANGER U", float(p.exchangerU), 0.75, true], ["COMPRESSOR WEAR", float(p.compressorWear), 0.5, false]]:
		var b := Bar.new(); b.cap = r[0]; b.v = r[1]; b.limit = r[2]; b.high_good = r[3]; b.custom_minimum_size = Vector2(150, 24); bars.add_child(b)
	var kn := Knob.new(); kn.app = app_ref; kn.setup("RATE", "×", float(p.rateMin), float(p.rateMax), 0.05, 0.05, float(p.rate)); kn.tooltip_text = "Run rate against capacity. Higher output wears the plant faster."
	kn.committed.connect(func(x: float): emit_act("setRate", [id, x])); kn.editable = not over; kn.custom_minimum_size = Vector2(92, 128); top.add_child(kn)
	var ist := str(p.get("inspectionState", "ok"))   # ONE state: locked / ok / due / overdue
	var icol: Color = STAMP_RED if ist == "overdue" else (AMBER_INK if ist == "due" else PENCIL)
	var il := lbl("INSPECTION %s" % str(p.get("inspectionNote", "")), 12, icol, "mono_bold")
	il.name = "InspNote_" + id; il.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; il.custom_minimum_size = Vector2(160, 0); v.add_child(il)
	var ol := lbl("output %s t/mo of %s nominal%s · risk %s%%" % [fnum(float(p.outputT)), fnum(float(p.nominalT)), (" · contracted %s t" % fnum(float(p.contractedT))) if float(p.contractedT) > 0.0 else "", fnum(float(p.risk) * 100.0, 1)], 11, PENCIL, "sans"); ol.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(ol)
	var keys := HFlowContainer.new(); keys.add_theme_constant_override("h_separation", 6); keys.add_theme_constant_override("v_separation", 4); v.add_child(keys)
	var ki := key("INSPECT $150k", func(): emit_act("inspect", [id]), false, 11); ki.disabled = over or ist == "locked"; ki.tooltip_text = "Needs six months since the last one. The plant is down a day."; keys.add_child(ki)
	if ist == "locked": ki.tooltip_text = str(p.get("inspectionNote", ""))
	var price := "$" + fnum(float(p.catalystPriceUSD) / 1e6, 1) + "M"
	var armed := _armed.has(id) and int(p.catalystStock) == 0
	var kc := key(("CATALYST: 1 CHARGE IN STOCK" if int(p.catalystStock) > 0 else (("PRESS AGAIN TO BUY %s" % price) if armed else "BUY CATALYST " + price)), func(): _buy_catalyst(id), armed, 11); kc.disabled = over or int(p.catalystStock) > 0; kc.name = "Catalyst_" + id
	kc.tooltip_text = "A charge in the warehouse is what a turnaround loads. Buy it before you BOOK. It cannot be taken back, so the key asks twice: press it again to pay %s, or CANCEL." % price; keys.add_child(kc)
	if armed:
		var kcx := key("CANCEL", func(): _armed.erase(id); _refresh_keep(), false, 11); kcx.name = "CatalystCancel_" + id; kcx.tooltip_text = "Do not buy the catalyst."; keys.add_child(kcx)
	v.add_child(_ta_row(p, m, over))
	return _paper(v)

## BUY CATALYST asks twice: the first press arms the key (it says so and stays armed, with a CANCEL key beside it), the second press pays. A stray click, or a click that lands where a layout shift put the key, buys nothing, and nothing re-arms or disarms it on a timer.
func _buy_catalyst(id: String) -> void:
	if _armed.has(id):
		_armed.erase(id); emit_act("buyCatalyst", [id]); return
	_armed[id] = true; _refresh_keep()

## Open by the player's choice; otherwise open on a desktop, and on a handheld only where the plant has an alert that a booked turnaround does not already cover.
func _plant_open(id: String, d: Dictionary) -> bool:
	if _open.has(id): return bool(_open[id])
	if not _compact(): return true
	for a in d.get("alerts", []):
		if str(a.plant) == id and not bool(a.get("handled", false)): return true
	return false

func _ta_row(p: Dictionary, m: int, over: bool) -> Control:
	var id := str(p.id); var h := HFlowContainer.new(); h.add_theme_constant_override("h_separation", 6); h.add_theme_constant_override("v_separation", 4)
	var tam := int(p.turnaroundMonth)
	if tam >= 0:
		h.add_child(lbl("TURNAROUND booked: month %d · crane %d%s" % [tam + 1, int(p.turnaroundCrane), (" · +%d crew" % int(p.turnaroundCrew)) if int(p.turnaroundCrew) > 0 else ""], 12, OKGREEN, "mono_bold"))
		var kx := key("CANCEL", func(): emit_act("cancelTurnaround", [id]), false, 11); kx.disabled = over; h.add_child(kx)
		var bo := str(p.get("bookedOverlapNote", ""))
		if bo != "": var bol := lbl(bo, 11, AMBER_INK, "sans"); bol.name = "BookedOverlap_" + id; bol.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; bol.custom_minimum_size = Vector2(220, 0); h.add_child(bol)
		return h
	var dr: Dictionary = _ta.get(id, {"m": m + 2, "crane": 1, "crew": 0}); dr.m = maxi(int(dr.m), m); _ta[id] = dr
	h.add_child(lbl("TURNAROUND", 11, PENCIL, "semi"))
	var dn := key("◀", func(): dr.m = maxi(m, int(dr.m) - 1); _refresh_keep(), false, 11); dn.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(26.0, Ch9Board.tmin())); h.add_child(dn)
	h.add_child(lbl("month %d" % (int(dr.m) + 1), 12, EqTheme.INK, "mono_bold"))
	var up := key("▶", func(): dr.m = mini(59, int(dr.m) + 1); _refresh_keep(), false, 11); up.custom_minimum_size = Vector2(maxf(26.0, Ch9Board.tmin()), maxf(26.0, Ch9Board.tmin())); h.add_child(up)
	var kc := key("CRANE %d" % int(dr.crane), func(): dr.crane = 2 if int(dr.crane) == 1 else 1; _refresh_keep(), false, 11); kc.tooltip_text = "Second crane: faster, extra hire cost."; h.add_child(kc)
	var kw := key("+4 CREW" if int(dr.crew) == 0 else "NO EXTRA CREW", func(): dr.crew = 4 if int(dr.crew) == 0 else 0; _refresh_keep(), false, 11); h.add_child(kw)
	var stock := int(p.catalystStock) > 0
	var kb := key("BOOK", func(): _book(p, dr), stock and not over, 11); kb.name = "Book_" + id; kb.disabled = over; h.add_child(kb)   # teal only when it can be booked; pressed without a catalyst charge it says why (it is never silent)
	var days := float(p.taDaysWithCatalyst) if stock else float(p.taDaysWithout)
	if stock: _book_msg.erase(id)
	for w in _book_warnings(p, int(dr.m)):
		var wl2 := lbl(w, 11, STAMP_RED, "sans"); wl2.name = "BookWarn_" + id; wl2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wl2.custom_minimum_size = Vector2(220, 0); h.add_child(wl2)
	var wn: Array = p.get("taWeighNote", [])   # booking in this month against the expected cost of not booking (outage, contract penalty and hire, against incident risk)
	if int(dr.m) >= 0 and int(dr.m) < wn.size() and str(wn[int(dr.m)]) != "":
		var wg := lbl(str(wn[int(dr.m)]), 11, OKGREEN if str(wn[int(dr.m)]).begins_with("Worth") else AMBER_INK, "sans"); wg.name = "BookWeigh_" + id; wg.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wg.custom_minimum_size = Vector2(260, 0); h.add_child(wg)
	var dn2 := str(p.get("taDaysNote", ""))   # the outage with and without the catalyst charge, and why they differ
	if dn2 != "": var dl2 := lbl(dn2, 11, PENCIL, "sans"); dl2.name = "TaDays_" + id; dl2.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; dl2.custom_minimum_size = Vector2(220, 0); h.add_child(dl2)
	if not stock:   # a turnaround without a catalyst charge changes nothing the plant needs: BOOK waits for the charge and says why, on the key and when it is pressed
		kb.tooltip_text = str(p.get("bookLockedNote", "BOOK needs a catalyst charge in the warehouse: press BUY CATALYST first."))
		var wl := lbl("BOOK waits for a catalyst charge: press BUY CATALYST first (the outage would take %s d)." % fnum(days), 11, AMBER_INK, "sans"); wl.name = "BookWhy_" + id; wl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wl.custom_minimum_size = Vector2(180, 0); h.add_child(wl)
		if _book_msg.has(id): var wm := lbl(str(_book_msg[id]), 12, STAMP_RED, "mono_bold"); wm.name = "BookMsg_" + id; wm.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; wm.custom_minimum_size = Vector2(220, 0); h.add_child(wm)
	return h

## BOOK: with a catalyst charge it books; without one it shows, in red where the player is looking, why nothing was booked.
func _book(p: Dictionary, dr: Dictionary) -> void:
	var id := str(p.id)
	if int(p.catalystStock) <= 0:
		_book_msg[id] = str(p.get("bookLockedNote", "BOOK needs a catalyst charge in the warehouse: press BUY CATALYST first.")); _refresh_keep(); return
	emit_act("turnaround", [id, int(dr.m), int(dr.crane), int(dr.crew)])

## What the BOOK key would do to the Works in month `m`: when another turnaround falls in the same month, the extra outage days and MUSD of sharing the crews and the crane (the engine prices them), and which month has no overlap.
func _book_warnings(p: Dictionary, m: int) -> Array:
	var out: Array = []; var on: Array = p.get("taOverlapNote", [])
	if m >= 0 and m < on.size() and str(on[m]) != "": out.append(str(on[m]))
	return out

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
		v.add_child(lbl("%+.0f%% vs spot ($%s)  ·  %d months  ·  %s of this plant's nominal output (%s t/mo)  ·  penalty $%s/t short" % [prem * 100.0, fnum(float(o.spotUSD)), int(o.term), fnum(float(o.get("shareOfNominal", o.shareOfCap)) * 100.0) + "%", fnum(float(o.get("nominalT", 0))), fnum(float(o.penaltyUSDPerT))], 11, OKGREEN if prem > 0 else STAMP_RED, "sans"))
		var ex := lbl(str(o.get("exposureNote", "")), 11, STAMP_RED if bool(o.get("overCapacity", false)) else PENCIL, "sans"); ex.name = "Exposure"; ex.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; ex.custom_minimum_size = Vector2(220, 0); v.add_child(ex)
		var tn := str(o.get("taNote", ""))
		if tn != "":
			var tl := lbl(tn, 11, STAMP_RED, "mono_bold"); tl.name = "TaNote"; tl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; tl.custom_minimum_size = Vector2(220, 0); v.add_child(tl)
		ka.tooltip_text = (str(o.get("exposureNote", "")) + ("\n" + tn if tn != "" else ""))
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
		var iv := VBoxContainer.new(); iv.add_theme_constant_override("separation", 1); iv.add_child(h)
		var rl := str(o.get("realised", ""))
		if rl != "": var rll := lbl(rl, 11, OKGREEN, "sans"); rll.name = "Realised_" + str(k); rll.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; rll.custom_minimum_size = Vector2(200, 0); iv.add_child(rll)
		var pv := str(o.get("preview", ""))
		if pv != "" and lvl < mx: var pl := lbl(pv, 11, PENCIL, "sans"); pl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; pl.custom_minimum_size = Vector2(200, 0); iv.add_child(pl)
		g.add_child(_paper(iv))
	var cr: Dictionary = opt.get("crews", {})
	var h2 := HBoxContainer.new(); h2.add_theme_constant_override("separation", 6)
	var nm2 := lbl("TURNAROUND CREWS  %d of %d hired (limit %d people)" % [int(cr.get("hired", 0)), int(cr.get("max", 3)), int(cr.get("limit", 0))], 12, EqTheme.INK, "mono_bold"); nm2.size_flags_horizontal = Control.SIZE_EXPAND_FILL; nm2.clip_text = true; h2.add_child(nm2)
	var kh := key("HIRE CREW", func(): emit_act("hireCrew"), false, 12); kh.disabled = over or int(cr.get("hired", 0)) >= int(cr.get("max", 3)); h2.add_child(kh)
	var cv := VBoxContainer.new(); cv.add_theme_constant_override("separation", 1); cv.add_child(h2)
	var cl := lbl("Hired crews are the hands a turnaround can draw on: the +4 CREW key on a plant card adds four of them to its outage.", 11, PENCIL, "sans"); cl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cl.custom_minimum_size = Vector2(200, 0); cv.add_child(cl)
	g.add_child(_paper(cv))

# ---- annual review ---------------------------------------------------------------------------------------------------------------------------
func _reviews(d: Dictionary) -> void:
	var ys: Array = view.get("review", [])
	if ys.is_empty(): body.add_child(_paper(lbl("The first review is at the end of month 12.", 13, PENCIL))); return
	for i in range(ys.size() - 1, -1, -1): body.add_child(_memo(ys[i], "MEMO · ANNUAL REVIEW · YEAR %d" % int(ys[i].year), ys[i - 1] if i > 0 else {}))

func _memo(y: Dictionary, title: String, prev: Dictionary = {}) -> Control:
	var v := VBoxContainer.new(); v.add_theme_constant_override("separation", 3)
	v.add_child(lbl(title, 13, EqTheme.INK, "mono_bold"))
	v.add_child(lbl("TO: Plant manager     CC: Board", 11, PENCIL))
	v.add_child(HSeparator.new())
	# MARGIN DRIVERS: one small table, this year against last (MUSD)
	v.add_child(lbl("MARGIN DRIVERS (MUSD)", 11, PENCIL, "semi"))
	var g := GridContainer.new(); g.name = "MemoMoney"; g.columns = 4; g.add_theme_constant_override("h_separation", 16); g.add_theme_constant_override("v_separation", 1); v.add_child(g)
	for h in ["", "THIS YEAR", "LAST YEAR", "CHANGE"]: g.add_child(lbl(h, 10, PENCIL, "semi"))
	var op := float(y.get("opMarginUSD", float(y.rev) - float(y.cost) - float(y.pen)))   # one number: the table, the Victor line and the score all read the engine's operating margin
	var rows := [["REVENUE", float(y.rev), float(prev.get("rev", 0.0)), false], ["OPERATING COST", float(y.cost), float(prev.get("cost", 0.0)), false], ["PENALTIES", float(y.pen), float(prev.get("pen", 0.0)), false],
		["OPERATING MARGIN (the score)", op, float(prev.get("opMarginUSD", 0.0)), true], ["INVESTMENTS (apart)", float(y.get("investmentsUSD", y.inv)), float(prev.get("inv", 0.0)), false], ["NET", float(y.get("netUSD", y.margin)), float(prev.get("margin", 0.0)), false]]
	for r in rows:
		var bold := bool(r[3]); var f := "mono_bold" if bold else "mono"
		g.add_child(lbl(str(r[0]), 11, EqTheme.INK if bold else PENCIL, f))
		g.add_child(lbl("%.1f" % (float(r[1]) / 1e6), 11, EqTheme.INK, f))
		g.add_child(lbl(("%.1f" % (float(r[2]) / 1e6)) if not prev.is_empty() else "-", 11, PENCIL, f))
		g.add_child(lbl(("%+.1f" % ((float(r[1]) - float(r[2])) / 1e6)) if not prev.is_empty() else "-", 11, PENCIL, f))
	if float(y.get("fine", 0.0)) > 0.0: v.add_child(lbl("Year-end emissions fine %.1f MUSD is inside the operating cost." % (float(y.fine) / 1e6), 11, STAMP_RED, "sans"))
	for sn in y.get("strikeNotes", []): var sl := lbl(str(sn), 11, STAMP_RED, "mono_bold"); sl.name = "StrikeNote"; sl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; sl.custom_minimum_size = Vector2(200, 0); v.add_child(sl)
	# the three reviewers: name, score, one note
	var rg := GridContainer.new(); rg.name = "MemoScores"; rg.columns = 3; rg.add_theme_constant_override("h_separation", 12); rg.add_theme_constant_override("v_separation", 3); v.add_child(rg)
	var lines := [
		["VICTOR (finance)", int(y.victor), str(y.get("victorNote", "Operating margin %s." % _m(float(y.get("opMarginUSD", y.margin)))))],
		["NOOR (safety, environment)", int(y.noor), "%d critical alarm%s. Emissions at %.0f%% of the cap.%s" % [int(y.criticals), "" if int(y.criticals) == 1 else "s", float(y.emRatio) * 100.0, "  The regulator issued %d strike%s." % [int(y.strike), "" if int(y.strike) == 1 else "s"] if int(y.strike) > 0 else ""]],
		["MARA (operations)", int(y.mara), str(y.get("maraNote", "Energy at %.0f%% of design." % (float(y.effRatio) * 100.0)))],
	]
	for r in lines:
		var sc := int(r[1]); var col := OKGREEN if sc >= 80 else (AMBER_INK if sc >= 50 else STAMP_RED)
		rg.add_child(lbl(str(r[0]), 11, EqTheme.INK, "mono_bold")); rg.add_child(lbl("%d/100" % sc, 12, col, "mono_bold"))
		var t := lbl(str(r[2]), 11, PENCIL, "sans"); t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; t.custom_minimum_size = Vector2(160, 0); rg.add_child(t)
	if str(y.get("revenueNote", "")) != "":
		var rn := lbl(str(y.revenueNote), 11, PENCIL, "sans"); rn.name = "RevenueNote"; rn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(rn)
	if str(y.get("cardNote", "")) != "":
		var cnl := lbl(str(y.cardNote), 11, EqTheme.INK, "sans"); cnl.name = "CardNote"; cnl.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; cnl.custom_minimum_size = Vector2(200, 0); v.add_child(cnl)
	if str(y.get("outlookNote", "")) != "":
		var on := lbl(str(y.outlookNote), 12, EqTheme.INK, "sans"); on.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(on)
	if str(y.get("capNote", "")) != "":
		var cn := lbl(str(y.capNote), 12, AMBER_INK, "sans"); cn.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; v.add_child(cn)
	return _paper(v, Color("#FBF8EC"))

## The last annual review (year 5 when the career ran its course) is shown BEFORE the end card. Returns true when it opened (the shell then waits); CONTINUE opens the printout.
static func review_first(app) -> bool:
	if app == null or app.b == null or str(app.b.g.get("level", "")) != "CAREER": return false
	var lv = app.b.q("levelView")
	if not (lv is Dictionary): return false
	var ys: Array = (lv as Dictionary).get("review", [])
	if ys.is_empty(): return false
	var old = app.get_meta("career_review_host") if app.has_meta("career_review_host") else null
	if old != null and is_instance_valid(old) and (old as Node).is_inside_tree(): return true   # already up
	var y: Dictionary = ys[ys.size() - 1]
	var tmp := CareerBoard.new()
	var d: Dictionary = app.dialog("career_review", 760.0, 0.0, EqTheme.PEN_GREEN, 0.6)
	var host: Control = d.host; var vb: VBoxContainer = d.vb
	app.end_ui = host; app.set_meta("career_review_host", host)
	var ed := str((lv as Dictionary).get("dashboard", {}).get("ending", ""))
	var title := "YEAR %d REVIEW · THE LAST ONE BEFORE THE RESULT" % int(y.year) if ed == "chief" or ed == "steady" else "LAST ANNUAL REVIEW · YEAR %d" % int(y.year)
	var memo := tmp._memo(y, title, ys[ys.size() - 2] if ys.size() > 1 else {}); memo.name = "Year5Review"; vb.add_child(memo)
	var go := EqTheme.key_button("CONTINUE TO THE RESULT", true, 16); go.name = "ReviewContinue"
	go.pressed.connect(func(): host.queue_free(); app.end_ui = null; Printout.open(app))
	vb.add_child(go); go.grab_focus.call_deferred()
	return true

# ---- widgets ------------------------------------------------------------------------------------------------------------------------------
class Cal extends Control:
	var view := {}
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_PASS
	func _draw() -> void:
		var d: Dictionary = view.get("dashboard", {}); var m := int(d.get("monthNow", int(d.get("month", 0)) + 1)) - 1; var base := mini(int(m / 12), 4) * 12   # the strip follows the month in progress across every year turn
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
		draw_string(EqTheme.font("sans"), Vector2(2, 54), "dot = inspection due   T = turnaround booked   (colours: ammonia blue, sulfuric acid orange, methanol green, ethanol purple)", HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(10), Color("#4A4A48"))

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
	static func _mu(x: float) -> String:
		var r := int(round(x / 1e6)); return "%d" % (0 if r == 0 else r)   # never "-0"
	func _draw() -> void:
		draw_rect(Rect2(Vector2.ZERO, size), Color("#FBF8EC")); draw_rect(Rect2(Vector2.ZERO, size), Color("#B8A888"), false, 1.0)
		if hist.size() < 2: draw_string(EqTheme.font("sans"), Vector2(6, 28), "Cash and margin history builds as the months pass.", HORIZONTAL_ALIGNMENT_LEFT, size.x, EqTheme.fs(11), Color("#6A6A60")); return
		var f := EqTheme.font("mono"); var fs := EqTheme.fs(9); var lw := 34.0; var top := 16.0   # axis labels live in side gutters and a title band: nothing is drawn over the lines
		for k in [["cashUSD", Color("#2D5DA8"), true], ["marginUSD", Color("#C8793C"), false]]:
			var lo := INF; var hi := -INF
			for h in hist: lo = minf(lo, float(h[k[0]])); hi = maxf(hi, float(h[k[0]]))
			if hi - lo < 1.0: hi = lo + 1.0
			var pts := PackedVector2Array(); var x0 := lw; var x1 := size.x - lw; var y0 := top; var y1 := size.y - 4.0
			for i in hist.size(): pts.append(Vector2(x0 + (x1 - x0) * i / float(hist.size() - 1), y1 - (y1 - y0) * (float(hist[i][k[0]]) - lo) / (hi - lo)))
			draw_polyline(pts, k[1], 1.8, true)
			var left: bool = k[2]
			var tx := 2.0 if left else size.x - lw + 2.0
			draw_string(f, Vector2(tx, y0 + 8.0), _mu(hi), HORIZONTAL_ALIGNMENT_LEFT, lw - 4.0, fs, k[1]); draw_string(f, Vector2(tx, y1), _mu(lo), HORIZONTAL_ALIGNMENT_LEFT, lw - 4.0, fs, k[1])
		draw_string(EqTheme.font("mono"), Vector2(lw, 11), "cash (blue, left axis)   operating margin per month (orange, right axis), MUSD", HORIZONTAL_ALIGNMENT_LEFT, size.x - 2.0 * lw, EqTheme.fs(10), Color("#4A4A48"))
