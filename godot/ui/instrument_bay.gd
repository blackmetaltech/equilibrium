class_name InstrumentBay
extends PanelContainer
## The instrument bay: a small porcelain panel docked at the top right of the console side (under the gear), never over the console, showing the hero
## instrument of the plant in front of the player. It decides which one from the unit types present (and the level):
##   jacketed CSTR -> Semenov plot; two or more adiabatic beds / a multi-bed converter -> X-T staircase; a gasifier, CO burner or the L07/L08 levels ->
##   heat ledger; an equilibrium reactor / bed / packed bed -> Equilibrium Window with the balance beam. Hidden in L01-L04 unless such a reactor is present
##   (a stoichiometric reactor has no equilibrium to show), hidden when nothing fits. Tap enlarges it in a modal (app.dialog). Every number is an engine query.
## `refresh()` is called from main.game_on_changed; queries are throttled to ~8 per second during a shift.
var app: CbApp
var kind := ""              ## "eqwin" | "xt" | "semenov" | "ledger" | ""
var view: InstrPaper
var title_lbl: Label
var _vbox: VBoxContainer
var _sig := ""
var _unit := ""
var _last_ms := 0
var _dirty := false
var _forced_kind := ""       ## tests / QA: pin one instrument
var _big: InstrPaper
var _compact := false        ## the Semenov plot before a run: a small sheet (no operating point yet, and it stays off the plant)
const EQ_TYPES := ["eq_reactor", "eq_bed", "packed_bed", "multibed"]
const BED_TYPES := ["eq_reactor", "eq_bed", "packed_bed"]

func build() -> void:
	name = "InstrumentBay"; mouse_filter = Control.MOUSE_FILTER_PASS
	var sb := EqTheme.porcelain_sb(4, 4.0); sb.content_margin_top = 3; sb.content_margin_bottom = 4
	add_theme_stylebox_override("panel", sb)
	_vbox = VBoxContainer.new(); _vbox.add_theme_constant_override("separation", 3); _vbox.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(_vbox)
	title_lbl = EqTheme.label("", 12, EqTheme.INK, "semi"); _vbox.add_child(title_lbl)
	visible = false
	layout()

## Size and place by device class: top right under the gear; a phone gets a smaller sheet.
func layout() -> void:
	if app == null: return
	var k := CbLayout.kind
	var tap := maxf(CbLayout.tap(), 44.0)
	var land := app.vw() > app.vs_h()   # a landscape phone is short: keep the camera buttons below the panel clear
	var w := 340.0 if k == "desktop" else (280.0 if k == "handheld" else (300.0 if land else minf(app.vw() * 0.44, 230.0)))
	var h := 236.0 if k == "desktop" else (196.0 if k == "handheld" else (128.0 if land else 150.0))
	if _compact and kind == "semenov": w = roundf(w * 0.74); h = roundf(h * 0.74)
	if view != null: view.custom_minimum_size = Vector2(w - 8.0, h - 24.0)
	custom_minimum_size = Vector2(w, h)
	set_anchors_preset(Control.PRESET_TOP_RIGHT); grow_horizontal = Control.GROW_DIRECTION_BEGIN
	offset_right = -10.0; offset_left = -10.0 - w; offset_top = 10.0 + tap + 8.0; offset_bottom = offset_top + h
	size = Vector2(w, h)

## A level change: nothing of the last job's instrument stays on the paper (the curve, the point, the last unit).
func reset() -> void:
	_sig = ""; _unit = ""; _dirty = false
	if view != null: view.set_data({})
	kind = ""
	if view != null: view.queue_free(); view = null
	visible = false

func _has_query(n: String) -> bool: return app != null and (app.b.init_data.get("queries", []) as Array).has(n)

func pin(k: String, unit := "") -> void:   ## QA / tests: show this instrument whatever the plant is
	_forced_kind = k; _unit = unit; _sig = ""; refresh(true)

# ---- which instrument ------------------------------------------------------------------------------------------------------------------------
## Pure choice from the plant's unit types and the level id: returns {kind, unit}.
static func choose(units: Array, level_id: String) -> Dictionary:
	var by := {}
	for u in units: by[str(u.get("type", ""))] = (by.get(str(u.get("type", "")), []) as Array) + [str(u.get("id", ""))]
	if by.has("cstr"): return {"kind": "semenov", "unit": by.cstr[0]}
	var nbed := 0
	for t in BED_TYPES: nbed += (by.get(t, []) as Array).size()
	if by.has("multibed") or nbed >= 2: return {"kind": "xt", "unit": ""}
	if by.has("gasifier") or by.has("co_burner") or level_id == "L05" or level_id == "L07" or level_id == "L08": return {"kind": "ledger", "unit": ""}
	for t in BED_TYPES:
		if by.has(t): return {"kind": "eqwin", "unit": by[t][0]}
	return {"kind": "", "unit": ""}

func _title_for(k: String) -> String:
	match k:
		"eqwin": return InstrPaper.T("INS_EQWIN")
		"xt": return InstrPaper.T("INS_XT")
		"semenov": return InstrPaper.T("INS_SEM")
		"ledger": return InstrPaper.T("INS_LEDGER")
	return ""

func _make_view(k: String) -> InstrPaper:
	match k:
		"eqwin": return EqWindowView.new()
		"xt": return XtDiagram.new()
		"semenov": return SemenovView.new()
		"ledger": return HeatLedgerView.new()
	return null

func _query(k: String, unit: String):
	match k:
		"eqwin": return app.b.q("eqBeam", [unit]) if _has_query("eqBeam") else null
		"xt": return app.b.q("xtDiagram") if _has_query("xtDiagram") else null
		"semenov": return app.b.q("semenov", [unit]) if _has_query("semenov") else null
		"ledger": return app.b.q("heatLedger") if _has_query("heatLedger") else null
	return null

func _set_kind(k: String) -> void:
	if k == kind and view != null: return
	kind = k
	if view != null: view.queue_free(); view = null
	if k == "": visible = false; return
	view = _make_view(k); view.clicked.connect(enlarge); view.size_flags_vertical = Control.SIZE_EXPAND_FILL; view.size_flags_horizontal = Control.SIZE_EXPAND_FILL; _vbox.add_child(view)
	title_lbl.text = _title_for(k).to_upper()
	layout()

## Called on every engine change (and by _process when a throttled refresh is pending).
func refresh(force := false) -> void:
	if app == null or not app.started or not is_inside_tree(): return
	var chrome_on: bool = app.chrome != null and app.chrome.visible
	if not chrome_on: visible = false; return
	var now := Time.get_ticks_msec()
	if not force and now - _last_ms < 120: _dirty = true; return
	_last_ms = now; _dirty = false
	var p = app.b.q("plant")
	if not (p is Dictionary): visible = false; return
	var lid := str(app.b.g.get("level", ""))
	var pick: Dictionary = {"kind": _forced_kind, "unit": _unit} if _forced_kind != "" else choose(p.get("units", []), lid)
	var k := str(pick.kind)
	if _forced_kind == "" and k == "eqwin" and ["L01", "L02", "L03", "L04"].has(lid) and not _has_equilibrium(p): k = ""
	if _forced_kind == "" and k == "ledger" and _only_feeds(p): k = ""   # no empty "No reading yet" slab before anything is placed
	_set_kind(k)
	if k == "": return
	_unit = str(pick.unit)
	var design: bool = k == "semenov" and app.chrome != null and app.chrome.engine_phase() == "design"
	if view is SemenovView: (view as SemenovView).live = not design
	if design != _compact: _compact = design; layout(); _sig = ""
	elif view != null and absf(size.y - custom_minimum_size.y) > 1.0: layout()   # a sheet left at a stale size (a view rebuilt mid-switch)
	var d = _query(k, _unit)
	if not (d is Dictionary) and view != null and not (view.data as Dictionary).is_empty(): view.set_data({}); _sig = ""
	var sig := JSON.stringify(d)
	if sig != _sig:
		_sig = sig
		if d is Dictionary: view.set_data(d)
	visible = not ((k == "ledger" or k == "eqwin") and _forced_kind == "" and not view.has_reading())   # an instrument with nothing on it yet is no slab at all

func _only_feeds(p: Dictionary) -> bool:
	for u in p.get("units", []): if str(u.get("type", "")) != "feed": return false
	return true

func _has_equilibrium(p: Dictionary) -> bool:
	for u in p.get("units", []): if EQ_TYPES.has(str(u.get("type", ""))): return true
	return false

func _process(_dt: float) -> void:
	if _dirty: refresh()

# ---- enlarge ---------------------------------------------------------------------------------------------------------------------------------
func enlarge() -> void:
	if app == null or app.modal() != null or view == null: return
	var d: Dictionary = app.dialog("instrument", minf(1000.0, app.vw() - 40.0), minf(560.0, app.vs_h() - 40.0), EqTheme.ENAMEL_HI, 0.5)
	(d.panel as PanelContainer).add_theme_stylebox_override("panel", EqTheme.enamel_sb(8, 16.0))
	var vb: VBoxContainer = d.vb
	var hb := HBoxContainer.new(); vb.add_child(hb)
	var t := EqTheme.label(_title_for(kind), 26, EqTheme.TEXT, "title"); t.size_flags_horizontal = Control.SIZE_EXPAND_FILL; hb.add_child(t)
	var x := EqTheme.key_button(InstrPaper.T("INS_CLOSE"), true, 16); x.pressed.connect(func(): d.host.queue_free()); hb.add_child(x)
	_big = _make_view(kind); _big.big = true; _big.mirror_of = view
	if _big is SemenovView and view is SemenovView: (_big as SemenovView).live = (view as SemenovView).live
	_big.size_flags_vertical = Control.SIZE_EXPAND_FILL; _big.custom_minimum_size = Vector2(500, 300); vb.add_child(_big)
	x.call_deferred("grab_focus")
