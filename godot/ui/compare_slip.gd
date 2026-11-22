class_name CompareSlip
extends PanelContainer
## F33: the incident comparison as a side-by-side slip of green-bar paper (tractor holes down both edges, typed figures), never a dashboard table. Three columns, YOUR FIX, THE
## CONTRACTOR and IGNORE IT, against four rows: the purge, the output against the clean loop, the gas bought per tonne made, and what the incident costs over its months
## (USD against the clean loop, the contractor's bill included). Every figure is the engine's (levelView().slip in the incident level, dashboard.incident.slip on the
## Career board): {months, gjT, chosen, lapsed, fix: {purgePct, outPct, gasGJt, lossUSD} | null, contractor: {...}, ignore: {...}}. YOUR FIX reads "not yet run" until a
## commission has measured the loop. Shown on the Career's incident card, in the plant after each commission, and on the printout.
const PAPER := Color("#F7F9F2")
const BAR := Color("#DDEBD5")
const TYPE := Color("#24302B")
const RED := Color("#B3262F")
const GREEN := Color("#2E7D4F")
var slip := {}
var grid: GridContainer
var _bg: Bars

static func make(d: Dictionary, title := "", compact := false) -> CompareSlip:
	var s := CompareSlip.new(); s.name = "CompareSlip"; s.compact = compact; s.build(d, title); return s
var compact := false      ## a small board: no title line, a one-line footnote

func _init() -> void:
	var sb := StyleBoxFlat.new(); sb.bg_color = PAPER; sb.border_color = Color("#B9C4B2"); sb.set_border_width_all(1)
	sb.content_margin_left = 30; sb.content_margin_right = 30; sb.content_margin_top = 8; sb.content_margin_bottom = 8
	sb.shadow_color = Color(0, 0, 0, 0.25); sb.shadow_size = 5; sb.shadow_offset = Vector2(0, 2)
	add_theme_stylebox_override("panel", sb)
	mouse_filter = Control.MOUSE_FILTER_PASS

static func money(usd: float) -> String: return ("%.2f" % (usd / 1.0e6)) if usd >= 0.0 else ("+%.2f" % (-usd / 1.0e6))

func build(d: Dictionary, title := "") -> void:
	slip = d
	for c in get_children(): c.queue_free()
	_bg = Bars.new(); _bg.owner_slip = self; add_child(_bg)
	var vb := VBoxContainer.new(); vb.name = "Body"; vb.add_theme_constant_override("separation", 4); vb.mouse_filter = Control.MOUSE_FILTER_IGNORE; add_child(vb)
	var months := int(d.get("months", 3))
	if not compact:
		var t := EqTheme.label(title if title != "" else "THREE ANSWERS · %d MONTHS OF OFF-SPEC GAS" % months, 16, TYPE, "mono_bold"); t.name = "SlipTitle"
		t.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; t.custom_minimum_size = Vector2(300, 0); vb.add_child(t)
	grid = GridContainer.new(); grid.name = "SlipGrid"; grid.columns = 4; grid.add_theme_constant_override("h_separation", 16); grid.add_theme_constant_override("v_separation", 3); vb.add_child(grid)
	var fix = d.get("fix"); var con: Dictionary = d.get("contractor", {}); var ign: Dictionary = d.get("ignore", {})
	var chosen := str(d.get("chosen", ""))
	var cols := [["fix", "YOUR FIX", fix], ["contractor", "THE CONTRACTOR", con], ["ignore", "IGNORE IT", ign]]
	# the cheapest answer that has a number gets a typed mark
	var best := ""; var bv := INF
	for c in cols:
		if c[2] is Dictionary and float((c[2] as Dictionary).get("lossUSD", INF)) < bv: bv = float(c[2].lossUSD); best = str(c[0])
	_cell("", "Head_rows", TYPE)
	for c in cols:
		var head := str(c[1])
		if (str(c[0]) == chosen and chosen != "") or (str(c[0]) == "fix" and chosen == "plant"): head = "▸ " + head   # the answer taken
		_cell(head, "Head_" + str(c[0]), TYPE, true)
	var rows := [["purge", "PURGE"], ["out", "OUTPUT"], ["gas", "GAS / t"], ["usd", "COST, %d MO" % months]]
	for r in rows:
		_cell(str(r[1]), "Row_" + str(r[0]), TYPE, true)
		for c in cols:
			var v = c[2]
			var txt := "—"; var col := TYPE
			if not (v is Dictionary) and str(c[0]) == "fix" and str(r[0]) == "purge": txt = "not yet run"; col = Color("#6B7570")
			if v is Dictionary:
				match str(r[0]):
					"purge": txt = "%.1f %%" % float(v.get("purgePct", 0.0))
					"out": txt = "%d %%" % int(round(float(v.get("outPct", 0.0))))
					"gas": txt = "%.1f GJ" % float(v.get("gasGJt", 0.0))
					"usd":
						txt = "%s MUSD" % money(float(v.get("lossUSD", 0.0)))
						col = GREEN if str(c[0]) == best else (RED if float(v.get("lossUSD", 0.0)) > 0.0 else TYPE)
			_cell(txt, "Cell_%s_%s" % [str(c[0]), str(r[0])], col, str(r[0]) == "usd")
	var cheap: String = ("Cheapest: %s." % {"fix": "your fix", "contractor": "the contractor", "ignore": "ignoring it"}[best]) if best != "" else ""
	var foot := EqTheme.label(("Against the clean loop, bill included. " + cheap) if compact else ("Output and cost against the clean loop, over the %d months, bill included.  %s" % [months, cheap]), 16, Color("#4A5550"), "sans")
	foot.name = "SlipFoot"; foot.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART; foot.custom_minimum_size = Vector2(300, 0); vb.add_child(foot)

func _cell(text: String, nm: String, col: Color, bold := false) -> void:
	var l := EqTheme.label(text, 16, col, "mono_bold" if bold else "mono"); l.name = nm
	l.horizontal_alignment = HORIZONTAL_ALIGNMENT_LEFT if nm.begins_with("Row_") or nm == "Head_rows" else HORIZONTAL_ALIGNMENT_RIGHT
	l.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	grid.add_child(l)

## Tests: the text of one cell ("fix" | "contractor" | "ignore", "purge" | "out" | "gas" | "usd"), or of a column head.
func cell(col: String, row: String) -> String:
	var n := find_child("Cell_%s_%s" % [col, row], true, false) as Label
	return n.text if n != null else ""
func head(col: String) -> String:
	var n := find_child("Head_" + col, true, false) as Label
	return n.text if n != null else ""

## The paper: a green bar behind every other typed row, the tractor-feed holes down both margins.
class Bars extends Control:
	var owner_slip: CompareSlip
	func _init() -> void: mouse_filter = Control.MOUSE_FILTER_IGNORE
	func _process(_dt: float) -> void: queue_redraw()
	func _draw() -> void:
		var s := owner_slip
		if s == null or s.grid == null or not s.grid.is_inside_tree(): return
		var o := s.grid.get_global_rect().position - get_global_rect().position
		var rows := int(ceil(float(s.grid.get_child_count()) / 4.0))
		for r in rows:
			var c0 := s.grid.get_child(r * 4) as Control
			if c0 == null: continue
			if r % 2 == 1: draw_rect(Rect2(Vector2(-22.0, o.y + c0.position.y - 1.0), Vector2(size.x + 44.0, c0.size.y + 2.0)), CompareSlip.BAR)
		var y := 10.0
		while y < size.y:
			draw_circle(Vector2(-16.0, y), 4.0, Color("#C9D1C4")); draw_circle(Vector2(size.x + 16.0, y), 4.0, Color("#C9D1C4"))
			y += 22.0
