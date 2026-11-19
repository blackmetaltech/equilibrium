class_name Ch9Board
extends PanelContainer
## Base of the chapter-9 worksheet boards (HAZOP, SOP/permit cards, reconciliation logsheet, turnaround planning board). A board is a pure view of the engine's
## levelView() dictionary: `set_view(d)` rebuilds the body (scroll position kept), every edit leaves as `act(name, args)` which the bay sends through `levelAct`.
signal act(name: String, args: Array)
const PAPER := Color("#EFE7D2")
const PAPER_LINE := Color("#B8C7D6")
const PENCIL := Color("#4A4A48")
const STAMP_RED := Color("#C8323C")
const OKGREEN := Color("#2E7D4F")
const AMBER_INK := Color("#B8780A")
var view := {}
var scroll: ScrollContainer
var body: VBoxContainer
var fit_w := 700.0
var fit_h := 480.0
var narrow := false

func _init() -> void:
	mouse_filter = Control.MOUSE_FILTER_PASS; clip_contents = true
	var sb := board_sb(); add_theme_stylebox_override("panel", sb)
	scroll = ScrollContainer.new(); scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED; add_child(scroll)
	body = VBoxContainer.new(); body.add_theme_constant_override("separation", 6); body.size_flags_horizontal = Control.SIZE_EXPAND_FILL; scroll.add_child(body)

func board_sb() -> StyleBoxFlat:
	var sb := EqTheme.porcelain_sb(4, 8.0); sb.bg_color = PAPER; return sb

func fit(w: float, h: float, p_narrow: bool) -> void:
	fit_w = w; fit_h = h; narrow = p_narrow
	custom_minimum_size = Vector2(w, h); size = Vector2(w, h)
	if not view.is_empty(): _render()

var _want_scroll := -1

func set_view(d: Dictionary) -> void:
	view = d
	if _want_scroll < 0: _want_scroll = scroll.scroll_vertical   # an overlapping refresh keeps the first remembered position
	_render()
	_restore_scroll()

## The rebuilt body has no height until the containers have laid out, so the old offset is applied after two frames (a stable page: nothing jumps after a click, a STOP or a scroll).
func _restore_scroll() -> void:
	scroll.scroll_vertical = _want_scroll
	if not is_inside_tree(): _want_scroll = -1; return
	await get_tree().process_frame
	scroll.scroll_vertical = _want_scroll
	await get_tree().process_frame
	if _want_scroll >= 0: scroll.scroll_vertical = _want_scroll
	_want_scroll = -1

func _render() -> void:
	for c in body.get_children(): body.remove_child(c); c.queue_free()
	_build()

func _build() -> void: pass

# ---- helpers -------------------------------------------------------------------------------------------------------------------------------
static func lbl(text: String, size := 14, col := Color("#1E2A2E"), kind := "mono") -> Label:
	var l := EqTheme.label(text, size, col, kind); l.clip_text = false; return l

static func fnum(v: float, d := 0) -> String:
	if d == 0: return str(int(round(v)))
	return "%.*f" % [d, v]

static func usd(v: float) -> String:
	var s := str(int(round(absf(v)))); var o := ""
	for i in s.length():
		if i > 0 and (s.length() - i) % 3 == 0: o += ","
		o += s[i]
	return ("-" if v < 0 else "") + "$" + o

## A small key-cap button.
static func tmin() -> float: return CbLayout.tap()   ## the touch-target floor of this layout (0 on desktop)
static func key(text: String, cb: Callable, primary := false, size := 13) -> Button:
	var b := EqTheme.key_button(text, primary, size); b.custom_minimum_size = Vector2(tmin(), maxf(32.0, tmin())); b.pressed.connect(cb)
	for st in ["normal", "hover", "pressed", "disabled"]:
		var sb := EqTheme.key_sb(primary, st); sb.content_margin_left = 8; sb.content_margin_right = 8; sb.content_margin_top = 2; sb.content_margin_bottom = 2
		b.add_theme_stylebox_override(st, sb)
	return b

static func tape(text: String, size := 12) -> PanelContainer: return EqTheme.dymo(text, size)

func head(title: String, right := "") -> HBoxContainer:
	var h := HBoxContainer.new(); h.add_theme_constant_override("separation", 8)
	var t := tape(title, 13); h.add_child(t)
	var sp := Control.new(); sp.size_flags_horizontal = Control.SIZE_EXPAND_FILL; h.add_child(sp)
	if right != "": h.add_child(lbl(right, 13, PENCIL))
	return h

## A rubber stamp: bordered caps text, tilted.
static func stamp(text: String, col: Color, size := 12) -> Control:
	var p := PanelContainer.new(); var sb := StyleBoxFlat.new(); sb.bg_color = Color(col, 0.07); sb.border_color = col; sb.set_border_width_all(2); sb.set_corner_radius_all(3)
	sb.content_margin_left = 5; sb.content_margin_right = 5; sb.content_margin_top = 0; sb.content_margin_bottom = 0
	p.add_theme_stylebox_override("panel", sb); p.add_child(lbl(text.to_upper(), size, col, "semi")); p.rotation = -0.06; p.mouse_filter = Control.MOUSE_FILTER_IGNORE
	p.pivot_offset = Vector2(20, 8)
	return p

func emit_act(name: String, args: Array = []) -> void: act.emit(name, args)
