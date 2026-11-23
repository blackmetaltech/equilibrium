class_name HeatLedgerView
extends InstrPaper
## The heat ledger (DESIGN 2.7 L07, 5.4): green-bar printout paper, one row per unit with heat: a bar of MW in the kind's ink (released red, recovered
## green, lost blue, duty amber), the number at the right, and at the bottom a stacked ribbon of every release with the total on Dymo tape ("two roads,
## one total"). Data is the engine's `heatLedger()`: {items:[{unitId,tag,MW,kind}], totalMW}.
const KIND_COL := {"release": Color("#C8323C"), "recovered": Color("#2E8B57"), "lost": Color("#2D5DA8"), "duty": Color("#C98A00")}

func has_reading() -> bool: return arr(data.get("items", [])).size() > 0

func _ink(kind: String) -> Color: return KIND_COL.get(kind, EqTheme.INK)

## The engine's words for this ledger (levels.ts `ledger.*`: translated, region-aware), with the paper's own as the fallback.
func _lab(key: String, fallback: String) -> String:
	var l = data.get("labels")
	return str(l.get(key, fallback)) if l is Dictionary else fallback
## Lines under the bars: heat the exchangers swap, and each heater's duty against the fuel it burns (efficiency).
func _extra_lines() -> Array:
	var out: Array = []
	if bool(data.get("estimate", false)): out.append(InstrPaper.T("INS_ESTIMATE") + " (no run yet)")   # F25: figures off a throw-away solve of the current design are a prediction, and say so
	var ex := num(data.get("exchangerMW", 0.0))
	if ex > 0.0: out.append("%s  %s %s" % [_lab("exchanger", "exchangers"), _fmt(ex), InstrPaper.T("INS_MW")])
	for h in arr(data.get("heaters", [])):
		if h is Dictionary and str(h.get("label", "")) != "": out.append(str(h.label))
	return out.slice(0, 4)

func _draw_body() -> void:
	if not has_reading(): empty_note(); return
	var items := arr(data.items).duplicate()
	items.sort_custom(func(a, b): return num(a.MW) > num(b.MW))
	var mono := EqTheme.font("mono"); var fsz := EqTheme.fs(12 if not big else 14)
	var row_h := float(fsz) + 9.0
	var extra := _extra_lines()
	var lfs := EqTheme.fs(11); var lh := float(lfs) + 4.0
	var wrap_w := size.x - 10.0
	var extra_h := 0.0
	var extra_n: Array = []   # wrapped line count of each extra line: a long line wraps, it never clips mid-word
	for ln in extra:
		var n := maxi(int(round(mono.get_multiline_string_size(str(ln), HORIZONTAL_ALIGNMENT_LEFT, wrap_w, lfs, -1, TextServer.BREAK_WORD_BOUND | TextServer.BREAK_MANDATORY).y / mono.get_height(lfs))), 1)   # 0.12: the real word-wrapped count (width / wrap_w under-counted: the last line was cut)
		extra_n.append(n); extra_h += lh * float(n) + 2.0
	var foot_h := row_h + 34.0 + extra_h
	var rows_fit := maxi(int((size.y - foot_h - 6.0) / row_h), 1)
	var shown := mini(items.size(), rows_fit)
	var more := items.size() - shown
	if more > 0: shown = maxi(shown - 1, 1); more = items.size() - shown
	var mx := 0.0
	for it in items: mx = maxf(mx, num(it.MW))
	mx = maxf(mx, 1e-9)
	draw_rect(Rect2(Vector2.ZERO, size), EqTheme.GREENBAR_LIGHT)
	var tag_w := 58.0; var val_w := 70.0
	var bx := tag_w + 6.0; var bw := maxf(size.x - bx - val_w - 8.0, 20.0)
	var y := 3.0
	for i in shown:
		var it: Dictionary = items[i]
		if i % 2 == 0: draw_rect(Rect2(0, y, size.x, row_h), EqTheme.GREENBAR)
		var col := _ink(str(it.kind))
		EqTheme.ds(self, mono, Vector2(5, y + row_h - 6.0), str(it.tag), HORIZONTAL_ALIGNMENT_LEFT, tag_w, fsz, EqTheme.INK)
		var w := bw * lerpf(_prev_mw(str(it.unitId)), num(it.MW), _k) / mx
		draw_rect(Rect2(bx, y + 3.0, w, row_h - 6.0), col)
		draw_rect(Rect2(bx, y + 3.0, w, row_h - 6.0), col.darkened(0.35), false, 1.0)
		EqTheme.ds(self, mono, Vector2(size.x - val_w - 4.0, y + row_h - 6.0), "%s %s" % [_fmt(num(it.MW)), InstrPaper.T("INS_MW")], HORIZONTAL_ALIGNMENT_RIGHT, val_w, fsz, col.darkened(0.2))
		y += row_h
	if more > 0:
		EqTheme.ds(self, mono, Vector2(5, y + row_h - 6.0), InstrPaper.T("INS_MORE") % more, HORIZONTAL_ALIGNMENT_LEFT, size.x - 10.0, fsz, Color("#6B7C76")); y += row_h
	# footer: stacked ribbon of the releases and the total
	var fy := size.y - foot_h
	draw_line(Vector2(0, fy), Vector2(size.x, fy), Color("#6B7C76"), 1.0)
	var tot := num(data.get("totalMW", 0.0))
	var rx := bx + 3.0
	var rw := size.x - bx - 11.0
	for it in items:
		if str(it.kind) != "release" or tot <= 0.0: continue
		var w := rw * num(it.MW) / tot
		draw_rect(Rect2(rx, fy + 4.0, w, row_h - 5.0), _ink("release").lerp(Color("#E8A0A5"), 0.0 if int(rx) % 2 == 0 else 0.35))
		draw_rect(Rect2(rx, fy + 4.0, w, row_h - 5.0), Color("#7A1F26"), false, 1.0)
		if w > 40.0: EqTheme.ds(self, mono, Vector2(rx + 4.0, fy + row_h - 6.0), str(it.tag), HORIZONTAL_ALIGNMENT_LEFT, w - 6.0, EqTheme.fs(11), EqTheme.PORCELAIN)
		rx += w
	EqTheme.ds(self, mono, Vector2(5, fy + row_h - 6.0), _lab("release", InstrPaper.T("INS_FROM")), HORIZONTAL_ALIGNMENT_LEFT, tag_w - 2.0, EqTheme.fs(10), EqTheme.INK)
	tape(Vector2(5.0, fy + row_h + 5.0), "%s  %s %s" % [_lab("total", InstrPaper.T("INS_RELEASED")), _fmt(tot), InstrPaper.T("INS_MW")], EqTheme.PEN_RED, size.x - 10.0, 12)
	var ly := fy + row_h + 30.0 + float(lfs)
	for i in extra.size():
		if ly - float(lfs) + lh * float(extra_n[i]) > size.y + 2.0: break   # 0.12: a line that does not fit is left out whole, never cut through
		draw_multiline_string(mono, Vector2(5, ly), str(extra[i]), HORIZONTAL_ALIGNMENT_LEFT, wrap_w, lfs, int(extra_n[i]) + 1, EqTheme.INK, TextServer.BREAK_WORD_BOUND | TextServer.BREAK_MANDATORY)
		ly += lh * float(extra_n[i]) + 2.0
	frame()

func _prev_mw(unit_id: String) -> float:
	for it in arr(prev.get("items", [])): if str(it.get("unitId", "")) == unit_id: return num(it.get("MW", 0.0))
	return 0.0
