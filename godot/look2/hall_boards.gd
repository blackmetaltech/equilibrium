class_name HallBoards
extends RefCounted
## 0.14 (D-14-1): the subject of each board level, standing in the hall beside its display plant (GenWorld.board_plant). The worksheet stays over the hall;
## what you set on it shows here, read from the engine's levelView: the drum's level, the controller's faceplate, the sensors and their votes, the cards'
## valves, the blinds and locks, the meters, the crane, the pump legs, the Career's four plants.
## build(gw, lid) runs once per rebuild, after the units stand; live(gw, view, running, g) runs on every snapshot.
## Instruments wear their own small lit displays; status is lamps, gauges and colour, never text laid over the 3D scene.
const FONT := "res://ui/fonts/Archivo-Variable.ttf"
const GREEN := Color(0.2, 1.0, 0.4)
const RED := Color(1.0, 0.1, 0.06)
const AMBER := Color(1.0, 0.62, 0.12)
const CYAN := Color(0.25, 0.9, 0.9)
const PLANT_COL := {"nh3": Color("#2D5DA8"), "acid": Color("#C8793C"), "meoh": Color("#2E8B57"), "etoh": Color("#8A5BA8")}   ## the Career board's legend
const CAREER_PLANT := {"A": "nh3", "B": "acid", "C": "meoh", "D": "etoh"}
const DECK_H := 4.0   ## L39: the boiler-house deck (m)
const PIPE_K := 2.0   ## L39: the pipe radius drawn is PIPE_K x the real inside radius (the real ones are threads at hall distance)

var _g: GenWorld
var _lid := ""
var _n := {}                       ## the level's live nodes and materials
var _cover := -1.0                 ## the worksheet's width (px) the camera was last framed for
var _fr := [Vector3.ZERO, 0.0, 0.0]   ## the framing this level set: focus, yaw, distance (a moved camera is left alone)

# ---- the contract ------------------------------------------------------------------------------------------------------------------------------
func build(gw: GenWorld, lid: String) -> void:
	_g = gw; _lid = lid; _n = {}; _cover = -1.0
	match lid:
		"L29": _b29()
		"L30": _b30()
		"L31": _b31()
		"L32": _b32()
		"L33": _b33()
		"L34": _b34()
		"L35": _b35()
		"L36": _b36()
		"L37": _b37()
		"L38": _b38()
		"L39": _b39()
		"CAREER": _bcareer()

func live(gw: GenWorld, view: Dictionary, running: bool, _g_snap: Dictionary) -> void:
	_g = gw
	match _lid:
		"L29": _l29(view, running)
		"L30": _l30(view, running)
		"L31": _l31(view, running)
		"L32": _l32(view, running)
		"L33": _l33(view, running)
		"L34": _l34(view, running)
		"L35": _l35(view, running)
		"L36": _l36(view, running)
		"L37": _l37(view, running)
		"L38": _l38(view, running)
		"L39": _l39(view, running)
		"CAREER": _lcareer(view, running)
	_reframe()

## The hero view: a box round the subject (world m), the side it is seen from, and how much of the free part of the frame it fills. The worksheet covers the right
## part of the window: hfrac is the share of the frame width left of it, shift() slides the subject into that part.
func hero(gw: GenWorld, lid: String) -> Dictionary:
	_g = gw
	var b: Array = _frame(lid)
	if b.is_empty(): return {}
	return {"ids": [], "box": [b[0], b[1]], "yaw": float(b[2]), "frac": float(b[3]), "pitch": float(b[4]), "hfrac": _hfrac(), "extra_ids": [], "third": false, "front": false}

## Called at the end of GenWorld._frame_hero: the camera pans (the eye stays, the focus moves right) by half the worksheet's width, so the subject stands in the part of
## the window it leaves free. A pan moves near and far things alike on the screen; sliding the camera sideways would push the near ones off the edge.
func shift(gw: GenWorld) -> void:
	_g = gw
	var cover := _cover_px()
	if gw.cam != null and cover > 0.0:
		var vp := gw.get_viewport().get_visible_rect().size
		if vp.x > 1.0 and vp.y > 1.0:
			var wd := 2.0 * gw.t_dist * tan(deg_to_rad(gw.cam.fov * 0.5)) * (vp.x / vp.y)   # world width of the frame at the focus
			var dir := Basis(Vector3.UP, gw.t_yaw) * Basis(Vector3.RIGHT, gw.t_pitch) * Vector3(0, 0, 1)
			var eye := gw.t_focus + dir * gw.t_dist
			var foc := gw.t_focus + (Basis(Vector3.UP, gw.t_yaw) * Vector3.RIGHT) * (cover * 0.5 / vp.x) * wd
			var v := eye - foc
			gw.t_focus = foc; gw.t_dist = v.length(); gw.t_yaw = atan2(v.x, v.z); gw.t_pitch = -asin(clampf(v.y / maxf(v.length(), 0.001), -1.0, 1.0))
	_cover = cover
	_fr = [gw.t_focus, gw.t_yaw, gw.t_dist]

func _cover_px() -> float:
	if _g == null or _g.app == null or _g.app.plant_world == null: return 0.0
	return float(_g.app.plant_world.board_cover)

func _hfrac() -> float:
	var vp := _g.get_viewport().get_visible_rect().size if _g != null and _g.is_inside_tree() else Vector2(1600, 900)
	var cover := clampf(_cover_px(), 0.0, vp.x * 0.7)
	return clampf((1.0 - cover / maxf(vp.x, 1.0)) * 0.9, 0.3, 0.86)

## The worksheet's width changed (it is built a moment after the level starts): frame again, unless the player has moved the camera.
func _reframe() -> void:
	var cover := _cover_px()
	if absf(cover - _cover) < 4.0 or _g._preset != "plant": return
	var untouched: bool = _g.t_focus.distance_to(_fr[0]) < 0.05 and absf(_g.t_yaw - float(_fr[1])) < 0.01 and absf(_g.t_dist - float(_fr[2])) < 0.05
	_cover = cover
	if untouched: _g.set_camera("plant")

# ---- small builders ----------------------------------------------------------------------------------------------------------------------------
func _u(id: String) -> Vector3: return _g._at.get(id, Vector3.ZERO)
func _holder(pos: Vector3, yaw := 0.0) -> Node3D:
	var h := Node3D.new(); h.position = pos; h.rotation_degrees.y = yaw; _g.plant.add_child(h); return h
func _mat(c: Color, metal := 0.0, rough := 0.6) -> StandardMaterial3D: return _g._flat(c, metal, rough)
func _ser(view: Dictionary, key: String) -> Array:
	var s: Variant = view.get("series", {})
	if s is Dictionary and (s as Dictionary).get(key) is Array: return (s as Dictionary)[key]
	return []
func _lastf(a: Array, def := 0.0) -> float: return float(a[a.size() - 1]) if a.size() > 0 else def
func _dial(view: Dictionary, key: String, def := 0.0) -> float:
	for d in view.get("dials", []):
		if str(d.get("key", "")) == key: return float(d.get("value", def))
	return def
func _txt(l: Label3D, s: String) -> void:
	if l != null and l.text != s: l.text = s
func _vis(n: Node3D, on: bool) -> void:
	if n != null and n.visible != on: n.visible = on

## A signal lamp: a dark bezel and a lens that lights from its own emission (the colour is kept on the material).
func _lamp(parent: Node3D, pos: Vector3, col: Color, r := 0.04) -> StandardMaterial3D:
	var m := _g._flat(col.darkened(0.6), 0.0, 0.25, col, 0.0); m.set_meta("col", col)
	_g._cyl(r * 1.5, 0.026, pos + Vector3(0, 0, -0.004), _mat(Color(0.05, 0.05, 0.055), 0.5, 0.5), parent).rotation_degrees.x = 90
	_g._cyl(r, 0.034, pos + Vector3(0, 0, 0.006), m, parent).rotation_degrees.x = 90
	return m
func _lamp_set(m: StandardMaterial3D, on: bool, e := 3.0) -> void:
	if m == null: return
	var col: Color = m.get_meta("col")
	m.albedo_color = col if on else col.darkened(0.6)
	m.emission_enabled = true; m.emission = col; m.emission_energy_multiplier = e if on else 0.0

## An instrument's own display: a dark window with lit digits (the only text in the scene).
func _display(parent: Node3D, pos: Vector3, size: Vector2, text: String, col := GREEN, lines := 1) -> Label3D:
	_g._box(Vector3(size.x + 0.02, size.y + 0.02, 0.025), pos, _mat(Color(0.015, 0.02, 0.02), 0.3, 0.35), parent)
	var l := Label3D.new()
	l.text = text; l.font = load(FONT) as Font; l.font_size = 48
	l.pixel_size = size.y * 0.8 / (48.0 * float(lines) * 1.2)
	l.shaded = false; l.double_sided = false; l.outline_size = 0; l.modulate = col
	l.position = pos + Vector3(0, 0, 0.016); parent.add_child(l)
	return l

## A stamped tag plate on a piece of equipment (its own name, small, not a label floating over it).
func _plate(parent: Node3D, pos: Vector3, text: String, w := 0.34) -> void:
	_g._box(Vector3(w, 0.12, 0.012), pos, _g._flat(Color(0.74, 0.75, 0.76), 0.85, 0.35), parent)
	var l := Label3D.new(); l.text = text; l.font = load(FONT) as Font; l.font_size = 40; l.pixel_size = 0.0015; l.outline_size = 0; l.shaded = true; l.double_sided = false
	l.modulate = Color(0.08, 0.09, 0.1); l.position = pos + Vector3(0, 0, 0.0075); parent.add_child(l)

## A field cabinet in painted enamel on a plinth, door on the front (+z), hood and handle. size.y is the total height.
func _cabinet(parent: Node3D, size: Vector3, col := Color(0.62, 0.66, 0.62)) -> void:
	_g._box(Vector3(size.x + 0.05, 0.12, size.z + 0.05), Vector3(0, 0.06, 0), _g.M.paint_grey, parent)
	_g._box(Vector3(size.x, size.y - 0.12, size.z), Vector3(0, 0.12 + (size.y - 0.12) * 0.5, 0), _g._enamel(col), parent)
	_g._box(Vector3(size.x * 0.9, (size.y - 0.12) * 0.9, 0.02), Vector3(0, 0.12 + (size.y - 0.12) * 0.5, size.z * 0.5 + 0.006), _g._enamel(col.darkened(0.1)), parent)
	_g._box(Vector3(size.x + 0.07, 0.05, size.z + 0.09), Vector3(0, size.y + 0.025, 0.02), _g._enamel(col.darkened(0.25)), parent)
	_g._seg(Vector3(size.x * 0.36, size.y * 0.42, size.z * 0.5 + 0.035), Vector3(size.x * 0.36, size.y * 0.58, size.z * 0.5 + 0.035), 0.012, _g.M.ss, parent, 8)
	for yy in [0.3, 0.75]: _g._cyl(0.014, 0.12, Vector3(-size.x * 0.46, size.y * yy, size.z * 0.5 + 0.012), _g.M.steel_dull, parent, -1.0, 8)
	_g._seg(Vector3(-size.x * 0.3, 0.12, -size.z * 0.35), Vector3(-size.x * 0.3, 0.0, -size.z * 0.35), 0.025, _g.M.black, parent, 8)   # cable gland into the plinth

## A post-mounted stand for a field instrument box.
func _stand(parent: Node3D, h: float) -> void:
	_g._box(Vector3(0.42, 0.04, 0.42), Vector3(0, 0.02, 0), _g.M.paint_grey, parent)
	_g._cyl(0.05, h, Vector3(0, h * 0.5, 0), _g.M.steel_dull, parent, -1.0, 12)
	for sx in [-1.0, 1.0]: _g._seg(Vector3(sx * 0.2, 0.04, 0), Vector3(0, h * 0.55, 0), 0.014, _g.M.steel_dull, parent, 6)

## A field controller faceplate: enamel case with a lit display of two lines, an AUTO lamp and an alarm lamp. pos is the case's foot.
func _controller(parent: Node3D, pos: Vector3, text := "") -> Dictionary:
	var h := Node3D.new(); h.position = pos; parent.add_child(h)
	_g._box(Vector3(0.52, 0.6, 0.24), Vector3(0, 0.3, 0), _g._enamel(Color(0.78, 0.76, 0.66)), h)
	_g._box(Vector3(0.58, 0.04, 0.3), Vector3(0, 0.62, 0.02), _g._enamel(Color(0.5, 0.5, 0.46)), h)
	var d := _display(h, Vector3(0, 0.42, 0.122), Vector2(0.38, 0.17), text, GREEN, 2)
	var a := _lamp(h, Vector3(-0.16, 0.17, 0.122), GREEN, 0.032); var w := _lamp(h, Vector3(0.0, 0.17, 0.122), RED, 0.032); var c := _lamp(h, Vector3(0.16, 0.17, 0.122), AMBER, 0.032)
	_g._seg(Vector3(0, 0.0, -0.05), Vector3(0, -0.02, -0.05), 0.02, _g.M.black, h, 6)
	return {"root": h, "disp": d, "auto": a, "alm": w, "aux": c}

## A pneumatic control valve's actuator over a valve at p (axis x or z, radius r): yoke legs, diaphragm can, stem and a travel scale with a pointer that follows the
## stem. Returns {ptr, y0, y1}: the pointer node and the heights it travels between.
func _actuator(parent: Node3D, p: Vector3, r: float, tone := Color(0.2, 0.34, 0.55)) -> Dictionary:
	var lx := r * 2.2; var y_b := p.y + r * 1.4; var y_c := p.y + r * 6.2
	for sx in [-1.0, 1.0]: _g._seg(Vector3(p.x + sx * lx, y_b, p.z), Vector3(p.x + sx * lx, y_c, p.z), r * 0.16, _g.M.steel_dull, parent, 8)
	_g._seg(Vector3(p.x - lx, y_b, p.z), Vector3(p.x + lx, y_b, p.z), r * 0.14, _g.M.steel_dull, parent, 8)
	_g._seg(Vector3(p.x, p.y + r * 4.0, p.z), Vector3(p.x, y_c + r * 0.4, p.z), r * 0.14, _g.M.ss, parent, 8)   # the stem
	var body := _g._enamel(tone)
	_g._cyl(r * 2.1, r * 1.0, Vector3(p.x, y_c + r * 0.5, p.z), body, parent, r * 1.9, 24)
	_g._sph(r * 1.9, Vector3(p.x, y_c + r * 1.0, p.z), body, parent, true)
	_g._torus(r * 2.0, r * 0.1, Vector3(p.x, y_c + r * 1.02, p.z), _g.M.steel_dull, parent)
	var sx2 := p.x + lx + r * 0.5
	var y0 := y_b + r * 0.3; var y1 := y_c - r * 0.3
	_g._box(Vector3(r * 0.22, y1 - y0 + r * 0.4, r * 0.45), Vector3(sx2, (y0 + y1) * 0.5, p.z + r * 0.4), _g._flat(Color(0.92, 0.92, 0.88), 0.0, 0.6), parent)   # the scale plate
	for i in 6: _g._box(Vector3(r * 0.5, r * 0.07, r * 0.07), Vector3(sx2 + r * 0.25, y0 + (y1 - y0) * float(i) / 5.0, p.z + r * 0.62), _g.M.black, parent)
	var ptr := _g._box(Vector3(r * 0.6, r * 0.22, r * 0.5), Vector3(sx2 + r * 0.1, y0, p.z + r * 0.62), _g._flat(RED, 0.2, 0.4, RED, 0.6), parent)
	_g._box(Vector3(r * 1.2, r * 1.4, r * 1.2), Vector3(p.x - lx - r * 0.4, (y_b + y_c) * 0.5, p.z), _g._enamel(Color(0.3, 0.3, 0.3)), parent)   # the positioner
	return {"ptr": ptr, "y0": y0, "y1": y1}
func _act_set(a: Dictionary, pct: float) -> void:
	if a.is_empty(): return
	var n := a.ptr as Node3D; n.position.y = lerpf(float(a.y0), float(a.y1), clampf(pct / 100.0, 0.0, 1.0))

## An orifice meter on a line at p (axis d along x or z): the flange pair, impulse lines and a DP cell with its own display and a lamp. Returns {disp, lamp, top}.
func _meter(parent: Node3D, p: Vector3, d: Vector3, r: float, tag: String, text := "---") -> Dictionary:
	_g._flange(p - d * 0.14, d, r, parent); _g._flange(p + d * 0.14, d, r, parent)
	_g._box(Vector3(0.05, 0.14, 0.02) if absf(d.x) > 0.5 else Vector3(0.02, 0.14, 0.05), p + Vector3(0, r * 1.9 + 0.05, 0), _g.M.steel_dull, parent)   # the orifice plate's tab
	var top := p + Vector3(0, r + 0.65, 0)
	for sg in [-1.0, 1.0]: _g._seg(p + d * sg * 0.14 + Vector3(0, r * 1.7, 0), top + d * sg * 0.06 + Vector3(0, -0.12, 0), 0.015, _g.M.ss, parent, 6)
	_g._box(Vector3(0.18, 0.09, 0.14), top + Vector3(0, -0.08, 0), _g.M.steel_dull, parent)   # the manifold
	_g._cyl(0.1, 0.22, top + Vector3(0, 0.03, 0), _g._enamel(Color(0.3, 0.4, 0.55)), parent, -1.0, 16)
	_g._box(Vector3(0.46, 0.24, 0.2), top + Vector3(0, 0.26, 0), _g._enamel(Color(0.72, 0.72, 0.68)), parent)
	var disp := _display(parent, top + Vector3(-0.06, 0.27, 0.105), Vector2(0.27, 0.12), text, GREEN)
	var lamp := _lamp(parent, top + Vector3(0.175, 0.27, 0.105), RED, 0.03)
	_plate(parent, top + Vector3(0, 0.07, 0.1), tag, 0.3)
	return {"disp": disp, "lamp": lamp, "top": top}

## A thermowell with a transmitter head on a line: stub, hex, head and its own display.
func _thermowell(parent: Node3D, p: Vector3, text := "---") -> Dictionary:
	_g._seg(p, p + Vector3(0, 0.34, 0), 0.032, _g.M.ss, parent, 8)
	_g._cyl(0.06, 0.05, p + Vector3(0, 0.1, 0), _g.M.steel_dull, parent, -1.0, 6)
	_g._box(Vector3(0.3, 0.2, 0.18), p + Vector3(0, 0.46, 0), _g._enamel(Color(0.72, 0.72, 0.68)), parent)
	var disp := _display(parent, p + Vector3(0, 0.47, 0.095), Vector2(0.24, 0.11), text, GREEN)
	return {"disp": disp, "head": p + Vector3(0, 0.56, 0)}

func _cable(pts: Array, parent: Node3D, col := Color(0.04, 0.04, 0.045), r := 0.013) -> void:
	_g._pipe(pts, r, _mat(col, 0.2, 0.6), parent, false)

## A yellow tag hung on a string, one per item.
func _tag_card(parent: Node3D, p: Vector3, col := Color(0.95, 0.75, 0.1)) -> MeshInstance3D:
	_g._seg(p, p + Vector3(0, -0.07, 0), 0.004, _g.M.black, parent, 4)
	return _g._box(Vector3(0.1, 0.15, 0.012), p + Vector3(0, -0.15, 0), _g._flat(col, 0.0, 0.5, col, 0.25), parent)

## A red beacon on a pole: base, dome and one light (only on the GPU tiers).
func _beacon(parent: Node3D, p: Vector3, col := RED) -> Dictionary:
	_g._cyl(0.09, 0.1, p + Vector3(0, 0.05, 0), _g.M.black, parent, -1.0, 16)
	var m := _g._flat(col.darkened(0.55), 0.0, 0.2, col, 0.0); m.set_meta("col", col); m.albedo_color = col.darkened(0.45)
	var dome := _g._sph(0.12, p + Vector3(0, 0.1, 0), m, parent, true)
	var l: OmniLight3D = null
	if _g.tier != "compat":
		l = OmniLight3D.new(); l.light_color = col; l.light_energy = 0.0; l.light_specular = 0.0; l.omni_range = 4.0; l.position = p + Vector3(0, 0.3, 0.2); parent.add_child(l)
	return {"mat": m, "light": l, "dome": dome}
func _beacon_set(b: Dictionary, on: bool) -> void:
	if b.is_empty(): return
	_lamp_set(b.mat as StandardMaterial3D, on, 4.0)
	if b.light != null: (b.light as OmniLight3D).light_energy = 2.2 if on else 0.0

## Scaffold round a footprint (w x d, h high): standards, ledgers and transoms every 2 m, boards on each lift, a diagonal brace, a ladder on one end.
func _scaffold(c: Vector3, w: float, d: float, h: float, parent: Node3D = null) -> Node3D:
	var root := Node3D.new(); root.position = c; (parent if parent != null else _g.plant).add_child(root)
	var m: Material = _g.M.galv
	for sx in [-1.0, 1.0]:
		for sz in [-1.0, 1.0]: _g._seg(Vector3(sx * w * 0.5, 0, sz * d * 0.5), Vector3(sx * w * 0.5, h, sz * d * 0.5), 0.026, m, root, 8)
	var lifts := maxi(1, int(h / 2.0))
	var plank := _g._flat(Color(0.52, 0.4, 0.26), 0.0, 0.85)
	for k in range(1, lifts + 1):
		var y := float(k) * 2.0 if k * 2.0 <= h else h
		for sz in [-1.0, 1.0]: _g._seg(Vector3(-w * 0.5, y, sz * d * 0.5), Vector3(w * 0.5, y, sz * d * 0.5), 0.022, m, root, 6)
		for sx in [-1.0, 1.0]: _g._seg(Vector3(sx * w * 0.5, y, -d * 0.5), Vector3(sx * w * 0.5, y, d * 0.5), 0.022, m, root, 6)
		_g._box(Vector3(w, 0.04, 0.9), Vector3(0, y + 0.02, d * 0.5 - 0.5), plank, root)   # a walkway of boards along the front; the equipment stays in view
		for sz in [-1.0, 1.0]: _g._seg(Vector3(-w * 0.5, y + 1.0, sz * d * 0.5), Vector3(w * 0.5, y + 1.0, sz * d * 0.5), 0.018, m, root, 6)   # the guard rail
	_g._seg(Vector3(-w * 0.5, 0, d * 0.5), Vector3(w * 0.5, minf(h, float(lifts) * 2.0), d * 0.5), 0.016, m, root, 6)
	_g._seg(Vector3(w * 0.5, 0, -d * 0.5), Vector3(-w * 0.5, minf(h, float(lifts) * 2.0), -d * 0.5), 0.016, m, root, 6)
	for sx2 in [-0.14, 0.14]: _g._seg(Vector3(w * 0.5 + 0.22 + sx2 * 0.0, 0, sx2), Vector3(w * 0.5 + 0.22, h, sx2), 0.02, m, root, 6)   # the ladder's stiles
	var i := 0.3
	while i < h: _g._seg(Vector3(w * 0.5 + 0.22, i, -0.14), Vector3(w * 0.5 + 0.22, i, 0.14), 0.012, m, root, 4); i += 0.3
	return root

## A crawler crane facing +x (yaw turns it): tracks, deck, house and cab, a lattice boom, backstay, hook block on its rope.
func _crane(c: Vector3, yaw: float) -> Node3D:
	var root := _holder(c, yaw)
	var yel := _g._enamel(Color(0.78, 0.6, 0.12)); var dark := _g._enamel(Color(0.2, 0.2, 0.22))
	for sz in [-1.0, 1.0]:
		_g._box(Vector3(4.4, 0.7, 1.0), Vector3(0, 0.35, sz * 1.5), dark, root)
		for i in 9: _g._box(Vector3(0.12, 0.76, 1.04), Vector3(-1.9 + 0.48 * float(i), 0.36, sz * 1.5), _g.M.black, root)
	_g._box(Vector3(4.2, 0.4, 3.9), Vector3(0, 0.95, 0), dark, root)
	_g._box(Vector3(3.2, 1.5, 2.8), Vector3(-0.2, 1.9, 0), yel, root)
	_g._box(Vector3(1.4, 1.2, 1.2), Vector3(1.0, 2.3, 1.1), yel, root)
	_g._box(Vector3(0.04, 0.9, 1.0), Vector3(1.72, 2.4, 1.1), _g._flat(Color(0.25, 0.4, 0.5, 0.5), 0.0, 0.1, Color(0.2, 0.35, 0.45), 0.2), root)
	_g._box(Vector3(1.2, 1.0, 2.4), Vector3(-2.2, 1.7, 0), _g._enamel(Color(0.3, 0.3, 0.3)), root)   # the counterweight
	var piv := Vector3(0.8, 2.7, 0.0); var ang := deg_to_rad(62.0); var L := 10.0
	var tip := piv + Vector3(cos(ang), sin(ang), 0) * L
	for sz in [-0.32, 0.32]:
		_g._seg(piv + Vector3(0, 0, sz), tip + Vector3(0, 0, sz * 0.4), 0.05, yel, root, 8)
	var dir := (tip - piv) / L
	for i in 10:
		var a := piv + dir * (L * float(i) / 10.0); var b := piv + dir * (L * float(i + 1) / 10.0)
		var wa := 0.32 - 0.19 * float(i) / 10.0; var wb := 0.32 - 0.19 * float(i + 1) / 10.0
		_g._seg(a + Vector3(0, 0, wa), b + Vector3(0, 0, -wb), 0.018, _g.M.galv, root, 4)
		_g._seg(a + Vector3(0, 0, -wa), b + Vector3(0, 0, wb), 0.018, _g.M.galv, root, 4)
	_g._seg(Vector3(-0.8, 2.65, 0), Vector3(-0.8, 5.4, 0), 0.07, yel, root, 8)   # the A-frame
	_g._seg(Vector3(-0.8, 5.4, 0), tip, 0.014, _g.M.black, root, 4)   # the backstay
	_g._seg(tip, tip + Vector3(0.1, -6.2, 0), 0.012, _g.M.black, root, 4)   # the hoist rope
	_g._box(Vector3(0.32, 0.4, 0.22), tip + Vector3(0.1, -6.35, 0), _g._enamel(Color(0.7, 0.55, 0.1)), root)
	_g._torus(0.12, 0.025, tip + Vector3(0.1, -6.7, 0), _g.M.steel, root).rotation_degrees.x = 90
	return root

## Tank-side and pump-side helpers
func _tube_bundle(parent: Node3D, L: float, r: float) -> void:
	_g._cyl(r, L, Vector3.ZERO, _g._flat(Color(0.5, 0.52, 0.55), 0.8, 0.45), parent, -1.0, 24).rotation_degrees.z = 90
	for i in 5: _g._cyl(r * 1.04, 0.05, Vector3(-L * 0.5 + 0.3 + L * float(i) / 4.4, 0, 0), _g.M.steel_dull, parent, -1.0, 24).rotation_degrees.z = 90
	_g._cyl(r * 1.15, 0.12, Vector3(-L * 0.5, 0, 0), _g.M.steel_dull, parent, -1.0, 24).rotation_degrees.z = 90

func _frame(lid: String) -> Array:   # [lo, hi, yaw, frac, pitch] by level
	var lo := Vector3.ZERO; var hi := Vector3.ZERO; var yaw := 0.2 * PI; var frac := 0.6; var pitch := -0.46
	match lid:
		"L29":
			var d := _u("D-101"); var v := _u("LV-101")
			lo = Vector3(d.x - 1.5, 0, d.z - 1.0); hi = Vector3(v.x + 1.0, 4.8, d.z + 2.6); frac = 0.74; yaw = 0.14 * PI; pitch = -0.4
		"L30":
			var e := _u("E-101")
			lo = Vector3(e.x - 4.4, 0, e.z - 3.4); hi = Vector3(e.x + 7.4, 8.2, e.z + 2.8); frac = 0.78; yaw = -0.17 * PI; pitch = -0.42
		"L31":
			var m := _u("M-103"); var h := _u("H2"); var n := _u("N2")
			lo = Vector3(m.x - 5.4, 0, h.z - 0.9); hi = Vector3(m.x + 2.2, 5.6, n.z + 0.7); frac = 0.66; yaw = 0.12 * PI; pitch = -0.5
		"L32":
			var r2 := _u("R-101"); var q := _u("QV-101")
			lo = Vector3(r2.x - 1.8, 0, q.z - 3.0); hi = Vector3(q.x + 2.4, 7.4, r2.z + 3.2); frac = 0.78; yaw = 0.16 * PI; pitch = -0.48
		"L33":
			var c := _u("R-101")
			lo = Vector3(c.x - 4.4, 0, c.z - 2.4); hi = Vector3(c.x + 4.4, 5.4, c.z + 5.0); frac = 0.74; yaw = 0.16 * PI; pitch = -0.48
		"L34":
			var h2 := _u("E-102")
			lo = Vector3(h2.x - 5.6, 0, h2.z - 1.7); hi = Vector3(h2.x + 3.6, 5.2, h2.z + 4.2); frac = 0.7; yaw = 0.14 * PI; pitch = -0.42
		"L35":
			var rr := _u("R-101"); var dd := _u("D-103")
			lo = Vector3(rr.x - 4.0, 0, rr.z - 2.0); hi = Vector3(dd.x + 3.8, 9.2, rr.z + 3.6); frac = 0.62; yaw = 0.28 * PI; pitch = -0.36
		"L36":
			var x := _u("E-101")
			lo = Vector3(x.x - 5.0, 0, x.z - 1.6); hi = Vector3(x.x + 5.4, 4.2, x.z + 4.4); frac = 0.64; yaw = 0.12 * PI; pitch = -0.4
		"L37":
			lo = Vector3(-8.4, 0, -2.4); hi = Vector3(6.8, 3.0, 2.2); frac = 0.56; yaw = 0.1 * PI; pitch = -0.44
		"L38":
			lo = Vector3(-10.0, 0, -7.0); hi = Vector3(14.0, 11.0, 5.0); frac = 0.74; yaw = -0.3 * PI; pitch = -0.34
		"L39":
			var t := _u("T-301"); var dr := _u("D-302")
			lo = Vector3(t.x - 1.8, 0, minf(t.z, dr.z) - 2.0); hi = Vector3(dr.x + 2.0, DECK_H + 5.4, maxf(t.z, dr.z) + 4.4); frac = 0.66; yaw = 0.34 * PI; pitch = -0.4
		"CAREER":
			lo = GenWorld.ORIGIN + Vector3(2.4, 0, -1.6); hi = GenWorld.ORIGIN + Vector3(22.0, 9.6, 8.8); frac = 0.6; yaw = 0.12 * PI; pitch = -0.5   # 0.14 (Ingrid): down the hall's long axis, so the four plants stand in two rows and none is cut (from the front the box is wider than the hall lets the camera back off)
		_: return []
	return [lo, hi, yaw, frac, pitch]

# ==== L29 Hold the Line: the drum, its level on a big gauge glass, LIC-101 on a stand, LV-101 with its stem indicator ==============================
func _b29() -> void:
	var d := _u("D-101"); var v := _u("LV-101")
	# the level bridle: a vertical pipe tied to the shell at both ends, with LT-101 on it (its own small display)
	var bx := d.x - 0.5
	for yy in [1.3, 3.7]:
		_g._seg(Vector3(bx, yy, d.z + 0.62), Vector3(bx, yy, d.z + 1.0), 0.05, _g.M.steel_dull, _g.plant, 10)
		_g._flange(Vector3(bx, yy, d.z + 0.8), Vector3(0, 0, 1), 0.05, _g.plant)
	_g._seg(Vector3(bx, 1.3, d.z + 1.0), Vector3(bx, 3.7, d.z + 1.0), 0.055, _g.M.steel_dull, _g.plant, 12)
	var lt := _g._cyl(0.1, 0.34, Vector3(bx, 2.5, d.z + 1.2), _g._enamel(Color(0.3, 0.4, 0.55)), _g.plant, -1.0, 16); lt.rotation_degrees.x = 90
	var lth := _holder(Vector3(bx, 2.5, d.z + 1.38))
	_g._box(Vector3(0.3, 0.2, 0.16), Vector3.ZERO, _g._enamel(Color(0.72, 0.72, 0.68)), lth)
	_n.lt = _display(lth, Vector3(0, 0, 0.085), Vector2(0.24, 0.11), "50.0", GREEN)
	# the big gauge glass: a thick glass tube in a frame, in place of the drum model's thin one; its liquid follows the level (_levels keeps the column)
	var e: Dictionary = _g._levels.get("D-101", {})
	if not e.is_empty():
		var old := e.liq as MeshInstance3D; var lm: Material = old.material_override; old.visible = false
		var gl := _g._flat(Color(0.85, 0.92, 0.95, 0.2), 0.0, 0.05); gl.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
		var gp := Vector3(d.x, 2.5, d.z + 0.95)
		_g._box(Vector3(0.24, 2.56, 0.05), gp + Vector3(0, 0, -0.07), _g.M.steel_dull, _g.plant)
		for sx in [-0.12, 0.12]: _g._box(Vector3(0.03, 2.56, 0.11), gp + Vector3(sx, 0, -0.03), _g.M.steel_dull, _g.plant)
		_g._cyl(0.075, 2.4, gp, gl, _g.plant, -1.0, 16)
		var liq := _g._cyl(0.06, 2.4, gp, lm, _g.plant, -1.0, 12)
		e["liq"] = liq
	# a scale beside the big glass: a tick every 10 %, longer at 0, 50 and 100, and the set point as a yellow flag that slides on it
	for i in 11:
		var long := i % 5 == 0
		_g._box(Vector3(0.2 if long else 0.12, 0.016, 0.016), Vector3(d.x + 0.25, 1.3 + 2.4 * float(i) / 10.0, d.z + 0.96), _g.M.black, _g.plant)
	_g._box(Vector3(0.012, 2.42, 0.012), Vector3(d.x + 0.16, 2.5, d.z + 0.96), _g.M.black, _g.plant)
	_n.sp = _g._box(Vector3(0.18, 0.05, 0.03), Vector3(d.x + 0.4, 2.5, d.z + 0.97), _g._flat(AMBER, 0.0, 0.5, AMBER, 0.5), _g.plant)
	# LIC-101: a controller on a stand beside the drum, with its signal cable from LT-101
	var sh := _holder(d + Vector3(2.3, 0, 1.5), -14.0)
	_stand(sh, 1.1)
	var ct := _controller(sh, Vector3(0, 1.1, 0.0), "PV 50.0\nSP 50.0")
	_n.lic = ct
	_plate(sh, Vector3(0, 1.0, 0.07), "LIC-101", 0.32)
	_cable([Vector3(bx, 2.62, d.z + 1.38), Vector3(bx, 2.62, d.z + 1.6), Vector3(bx + 1.2, 0.5, d.z + 1.85), Vector3(d.x + 2.3, 0.4, d.z + 1.55), Vector3(d.x + 2.3, 1.2, d.z + 1.5)], _g.plant)
	# LV-101: the actuator on the valve, its stem and travel scale
	_n.lv = _actuator(_g.plant, v + Vector3(0, 0.9, 0), 0.14)
	_g._box(Vector3(0.5, 0.05, 0.5), v + Vector3(0, 0.025, 0), _g.M.paint_grey, _g.plant)

func _l29(view: Dictionary, running: bool) -> void:
	var pv := _ser(view, "pv"); var spv := _ser(view, "sp"); var op := _ser(view, "op")
	var lvl := _lastf(pv, 50.0); var sp := _lastf(spv, 50.0); var o := _lastf(op, 50.0)
	var e: Dictionary = _g._levels.get("D-101", {})
	if not e.is_empty(): _g._set_level(e, lvl / 100.0)
	(_n.sp as Node3D).position.y = 1.3 + 2.4 * clampf(sp / 100.0, 0.02, 0.98)
	_txt(_n.lt, "%.1f" % lvl)
	_txt(_n.lic.disp, "PV %.1f\nSP %.1f" % [lvl, sp])
	_lamp_set(_n.lic.auto, running or pv.size() > 0)
	_lamp_set(_n.lic.alm, absf(lvl - sp) > 10.0 and pv.size() > 0)
	_lamp_set(_n.lic.aux, pv.size() > 0 and (o >= 99.0 or o <= 1.0))
	_act_set(_n.lv, o)

# ==== L30 Tune It: the firebox glows with the heater output; a thermowell and TIC-101 at the converter's inlet ==================================
func _b30() -> void:
	var e := _u("E-101"); var r := _u("R-101")
	var g: Dictionary = _g._glow.get("E-101", {})
	if not g.is_empty():
		for sx in [-0.75, 0.75]: _g._peep(e + Vector3(sx, 1.6, 1.1), Vector3(0, 0, 1), 0.15, 0.28, g.mat)   # more sight ports on the firebox, lit with it
		_g._box(Vector3(2.3, 0.05, 0.05), e + Vector3(0, 1.28, 1.13), _g.M.steel_dull, _g.plant)
	# the fuel gas line to the burners, with FV-101 (the heater output) and its travel scale
	var fz := e.z + 0.5
	_g._pipe([e + Vector3(-5.2, 0.7, 0.5), e + Vector3(-1.45, 0.7, 0.5)], 0.07, _g.M.steel_dull, _g.plant, true)
	_g._seg(e + Vector3(-1.45, 0.7, 0.5), e + Vector3(-1.2, 0.7, 0.5), 0.1, _g.M.steel_dull, _g.plant, 10)
	_g._valve(Vector3(e.x - 3.4, 0.7, fz), Vector3(1, 0, 0), 0.1, _g.plant, Color(0.5, 0.35, 0.1))
	_n.fv = _actuator(_g.plant, Vector3(e.x - 3.4, 0.7, fz), 0.1, Color(0.7, 0.55, 0.12))
	_plate(_g.plant, Vector3(e.x - 3.4, 0.45, fz + 0.2), "FV-101", 0.3)
	# the inlet line's thermowell, between the heater and the converter, with its transmitter display; TIC-101 on a stand in the gap
	var zr: float = _g._rack_z; var tx := (e.x + r.x) * 0.5 + 0.8
	_n.tt = _thermowell(_g.plant, Vector3(tx, 3.28 + 0.09, zr), "---")
	_plate(_g.plant, Vector3(tx, 3.28 - 0.3, zr + 0.1), "TT-101", 0.3)
	var sh := _holder(Vector3(tx - 0.4, 0, e.z + 0.9), -10.0)
	_stand(sh, 1.1)
	_n.tic = _controller(sh, Vector3(0, 1.1, 0), "PV --\nSP --")
	_plate(sh, Vector3(0, 1.0, 0.07), "TIC-101", 0.32)
	_cable([Vector3(tx, 3.28 + 0.66, zr), Vector3(tx, 4.1, zr + 1.0), Vector3(tx - 0.4, 3.9, e.z + 0.9), Vector3(tx - 0.4, 1.8, e.z + 0.9)], _g.plant)
	_cable([Vector3(tx - 0.4, 1.2, e.z + 0.8), Vector3(tx - 0.4, 0.3, e.z + 0.6), Vector3(e.x - 3.4, 0.3, fz + 0.1), Vector3(e.x - 3.4, 1.0, fz)], _g.plant)   # the output to FV-101

func _l30(view: Dictionary, running: bool) -> void:
	var pv := _ser(view, "pv"); var spv := _ser(view, "sp"); var op := _ser(view, "op")
	var T := _lastf(pv, 380.0); var sp := _lastf(spv, 380.0); var o := _lastf(op, 0.0)
	var ran := pv.size() > 0
	var g: Dictionary = _g._glow.get("E-101", {})
	if not g.is_empty():
		var f := clampf(o / 100.0, 0.0, 1.0) if ran else 0.0
		var col := Color(1.0, 0.36, 0.06).lerp(Color(1.0, 0.62, 0.2), f)
		var m := g.mat as StandardMaterial3D; m.emission = col; m.emission_energy_multiplier = 0.2 + 2.6 * f if f > 0.0 else 0.0
		for xm in g.get("extra", []): (xm as StandardMaterial3D).emission = col; (xm as StandardMaterial3D).emission_energy_multiplier = 2.4 * f
		(g.light as OmniLight3D).light_color = Color(1.0, 0.5, 0.2); (g.light as OmniLight3D).light_energy = 3.4 * f; g["lamp"] = 3.4 * f
	_txt(_n.tt.disp, "%.1f C" % (T - 273.15) if ran else "--")
	_txt(_n.tic.disp, "PV %.1f\nSP %.1f" % [T - 273.15, sp - 273.15] if ran else "PV --\nSP --")
	_lamp_set(_n.tic.auto, ran); _lamp_set(_n.tic.alm, ran and absf(T - sp) > 8.0); _lamp_set(_n.tic.aux, ran and (o >= 99.0 or o <= 1.0))
	_act_set(_n.fv, o)

# ==== L31 Ratio: H2 and N2 headers with meters, the ratio station, the H2 vent =================================================================
func _b31() -> void:
	var h := _u("H2"); var n := _u("N2"); var m := _u("M-103")
	var xj := m.x - 2.6
	# the two headers run to a tee in front of the mixer, each with its flow meter; the H2 header carries the vent stack
	_g._pipe([h + Vector3(1.0, 1.1, 0), Vector3(xj, 1.1, h.z), Vector3(xj, 1.1, m.z - 0.5)], 0.1, _g.M.clad, _g.plant, true)
	_g._pipe([n + Vector3(1.0, 1.1, 0), Vector3(xj + 1.0, 1.1, n.z), Vector3(xj + 1.0, 1.1, m.z + 0.9)], 0.1, _g.M.steel_dull, _g.plant, true)
	_g._pipe([Vector3(xj, 1.1, m.z - 0.5), Vector3(xj, 1.1, m.z), Vector3(m.x - 0.8, 0.9, m.z)], 0.12, _g.M.clad, _g.plant, true)
	_g._pipe([Vector3(xj + 1.0, 1.1, m.z + 0.9), Vector3(xj + 1.0, 1.1, m.z), Vector3(xj, 1.1, m.z)], 0.08, _g.M.steel_dull, _g.plant, false)
	_n.fh = _meter(_g.plant, Vector3(xj, 1.1, h.z + 1.9), Vector3(0, 0, 1), 0.1, "FT-H2", "15.0")
	_n.fn = _meter(_g.plant, Vector3(xj + 1.0, 1.1, n.z - 2.0), Vector3(0, 0, 1), 0.1, "FT-N2", "5.0")
	_g._valve(Vector3(xj - 3.2, 1.1, h.z), Vector3(1, 0, 0), 0.1, _g.plant); _g._valve(Vector3(xj - 2.2, 1.1, n.z), Vector3(1, 0, 0), 0.1, _g.plant, Color(0.2, 0.3, 0.5))
	# the vent stack on the H2 header: a block valve, a flame arrestor and the tail pipe up, with its plume
	var vx := xj - 1.5
	_g._seg(Vector3(vx, 1.1, h.z), Vector3(vx, 5.2, h.z), 0.065, _g.M.steel_dull, _g.plant, 10)
	_g._cyl(0.2, 0.5, Vector3(vx, 3.0, h.z), _g._enamel(Color(0.5, 0.52, 0.5)), _g.plant, -1.0, 16)
	_g._valve(Vector3(vx, 1.9, h.z), Vector3(0, 0, 1), 0.07, _g.plant, Color(0.62, 0.12, 0.08))
	_g._sph(0.09, Vector3(vx, 5.25, h.z), _g.M.steel_dull, _g.plant, true)
	_n.plume = _g._particles(Vector3(vx, 5.4, h.z), 32, 3.0, Vector3(0, 1.6, 0), 14.0, 0.7, Color(0.82, 0.86, 0.9, 0.3), _g.plant, 3.2); (_n.plume as GPUParticles3D).emitting = false
	# the ratio station: a cabinet with the ratio on its display and a lamp that lights when the ratio is in
	var sh := _holder(Vector3(m.x - 0.4, 0, m.z + 2.8), -12.0)
	_cabinet(sh, Vector3(0.9, 1.6, 0.42))
	_n.rs_d = _display(sh, Vector3(0, 1.2, 0.222), Vector2(0.56, 0.2), "R 3.00", GREEN)
	_n.rs_on = _lamp(sh, Vector3(-0.22, 0.88, 0.222), GREEN, 0.04); _n.rs_off = _lamp(sh, Vector3(0.0, 0.88, 0.222), AMBER, 0.04); _n.rs_err = _lamp(sh, Vector3(0.22, 0.88, 0.222), RED, 0.04)
	_plate(sh, Vector3(0, 0.62, 0.222), "FFY-101", 0.4)
	_cable([_n.fh.top + Vector3(0, 0.4, 0), _n.fh.top + Vector3(0, 0.9, 0.4), Vector3(m.x - 1.0, 2.3, m.z + 1.0), Vector3(m.x - 0.7, 1.9, m.z + 2.7)], _g.plant)
	_cable([_n.fn.top + Vector3(0, 0.4, 0), _n.fn.top + Vector3(0, 0.9, 0.0), Vector3(m.x - 1.4, 2.0, m.z + 2.6), Vector3(m.x - 0.7, 1.8, m.z + 2.7)], _g.plant)

func _l31(view: Dictionary, running: bool) -> void:
	var hv := _ser(view, "pv"); var nv := _ser(view, "n2")
	var ran := hv.size() > 0
	_txt(_n.fh.disp, "%.1f" % _lastf(hv, 0.0) if ran else "--"); _txt(_n.fn.disp, "%.1f" % _lastf(nv, 0.0) if ran else "--")
	var on := _dial(view, "on", 1.0) >= 0.5
	_txt(_n.rs_d, "R %.2f" % _dial(view, "R", 3.0))
	_lamp_set(_n.rs_on, on); _lamp_set(_n.rs_off, not on)
	var vent := 0.0
	var met: Variant = view.get("metric", {})
	if met is Dictionary: vent = float((met as Dictionary).get("value", 0.0))
	var li: Variant = _g.app.b.q("levelInfo") if _g.app != null and _g.app.b != null else null
	var ann := false
	if li is Dictionary:
		for a in (li as Dictionary).get("annunciators", []):
			if str(a.get("key", "")) == "h2" and bool(a.get("lit", false)): ann = true
	_lamp_set(_n.rs_err, ann)
	var pl := _n.plume as GPUParticles3D
	pl.emitting = ran and (vent > 0.05 or ann); pl.amount_ratio = clampf(vent / 6.0 + (0.4 if ann else 0.0), 0.2, 1.0)

# ==== L32 Cascade: R-101's bed glows with its temperature; QV-101 with its flow transmitter; TIC and FIC linked =================================
func _b32() -> void:
	var r := _u("R-101"); var q := _u("QV-101")
	var zr: float = _g._rack_z
	# the cold-gas header: down from the rack, through FT-101's orifice and QV-101, then up and over to the converter's quench nozzle
	var xh := q.x - 1.3
	_g._pipe([Vector3(xh, 3.0, zr), Vector3(xh, 3.0, q.z), Vector3(xh, 0.9, q.z), Vector3(q.x - 0.5, 0.9, q.z)], 0.09, _g.M.clad, _g.plant, true)
	_n.ft = _meter(_g.plant, Vector3(xh, 3.0, q.z - 1.8), Vector3(0, 0, 1), 0.09, "FT-101", "50.0")
	_g._pipe([Vector3(q.x + 0.5, 0.9, q.z), Vector3(q.x + 0.8, 0.9, q.z), Vector3(q.x + 0.8, 3.7, q.z), Vector3(r.x + 0.55, 3.7, q.z), Vector3(r.x + 0.55, 3.7, r.z + 0.85)], 0.09, _g.M.clad, _g.plant, true)
	_n.qv = _actuator(_g.plant, q + Vector3(0, 0.9, 0), 0.14, Color(0.2, 0.42, 0.5))
	# TT-101 on the bed, TIC-101 (master) near it and FIC-101 (slave) by the valve, the signal cable between them lit when the cascade is on
	_n.tt = _thermowell(_g.plant, Vector3(r.x - 0.7, 3.3, r.z + 0.75), "---")
	_plate(_g.plant, Vector3(r.x - 0.7, 2.9, r.z + 1.05), "TT-101", 0.3)
	var s1 := _holder(Vector3(q.x - 2.0, 0, r.z + 1.7), -8.0); _stand(s1, 1.1)
	_n.tic = _controller(s1, Vector3(0, 1.1, 0), "PV --\nSP --"); _plate(s1, Vector3(0, 1.0, 0.07), "TIC-101", 0.32)
	var s2 := _holder(Vector3(q.x + 1.6, 0, q.z + 1.7), -8.0); _stand(s2, 1.1)
	_n.fic = _controller(s2, Vector3(0, 1.1, 0), "PV --\nOP --"); _plate(s2, Vector3(0, 1.0, 0.07), "FIC-101", 0.32)
	_cable([Vector3(r.x - 0.7, 3.9, r.z + 0.75), Vector3(r.x - 0.7, 4.3, r.z + 1.7), Vector3(q.x - 2.0, 3.0, r.z + 1.7), Vector3(q.x - 2.0, 1.8, r.z + 1.7)], _g.plant)
	var lit := _g._flat(Color(0.05, 0.25, 0.28), 0.0, 0.3, CYAN, 0.0)
	_n.link = lit
	_g._pipe([Vector3(q.x - 2.0, 1.76, r.z + 1.7), Vector3(q.x - 2.0, 2.4, r.z + 1.7), Vector3(q.x + 1.6, 2.4, q.z + 1.7), Vector3(q.x + 1.6, 1.76, q.z + 1.7)], 0.026, lit, _g.plant, false)
	_cable([Vector3(q.x + 1.6, 1.2, q.z + 1.6), Vector3(q.x + 1.6, 0.3, q.z + 1.2), Vector3(q.x + 0.1, 0.3, q.z + 0.6), Vector3(q.x + 0.1, 1.0, q.z + 0.1)], _g.plant)
	_cable([_n.ft.top + Vector3(0, 0.4, 0), _n.ft.top + Vector3(0.6, 0.7, 0.0), Vector3(q.x + 1.6, 2.2, q.z + 1.6), Vector3(q.x + 1.6, 1.8, q.z + 1.7)], _g.plant)

func _l32(view: Dictionary, running: bool) -> void:
	var pv := _ser(view, "pv"); var spv := _ser(view, "sp"); var op := _ser(view, "op"); var fl := _ser(view, "flow")
	var ran := pv.size() > 0
	var T := _lastf(pv, 520.0); var sp := _lastf(spv, 520.0); var o := _lastf(op, 50.0); var f := _lastf(fl, 50.0)
	var casc := _dial(view, "on", 1.0) >= 0.5
	var g: Dictionary = _g._glow.get("R-101", {})
	if not g.is_empty():   # the bed runs at 520 K, far under red heat: the band is drawn on a scale that spans the loop's own range (480 K dark, 560 K bright)
		var k := clampf((T - 480.0) / 80.0, 0.0, 1.0) if ran else 0.0
		var col := Color(1.0, 0.3, 0.05).lerp(Color(1.0, 0.6, 0.18), k)
		var m := g.mat as StandardMaterial3D; m.emission = col; m.emission_energy_multiplier = 0.15 + 1.35 * k if ran else 0.0
		(g.light as OmniLight3D).light_energy = 2.4 * k; g["lamp"] = 2.4 * k
	_txt(_n.tt.disp, "%.0f C" % (T - 273.15) if ran else "--")
	_txt(_n.tic.disp, "PV %.1f\nSP %.1f" % [T - 273.15, sp - 273.15] if ran else "PV --\nSP --")
	_txt(_n.fic.disp, "PV %.1f\nOP %.1f" % [f, o] if ran else "PV --\nOP --")
	_txt(_n.ft.disp, "%.1f" % f if ran else "--")
	for c in [_n.tic, _n.fic]: _lamp_set(c.auto, ran); _lamp_set(c.alm, ran and absf(T - sp) > 8.0); _lamp_set(c.aux, casc and ran)
	var lm := _n.link as StandardMaterial3D; lm.emission_energy_multiplier = 2.6 if casc and ran else 0.0; lm.albedo_color = CYAN if casc and ran else Color(0.05, 0.25, 0.28)
	_act_set(_n.qv, o)

# ==== L33 The Interlock: the CSTR with its sensors, the voting cabinet, the three final elements, the beacon =================================
func _b33() -> void:
	var c := _u("R-101")
	# 1 to 3 temperature sensors on the shell above the jacket, each with its own small display; the design decides how many stand
	var sens: Array = []
	for i in 3:
		var a := deg_to_rad(-48.0 + 48.0 * float(i))
		var nx := Vector3(sin(a), 0, cos(a))
		var p := c + Vector3(0, 2.95, 0) + nx * 1.0
		_g._seg(p - nx * 0.05, p + nx * 0.26, 0.05, _g.M.steel_dull, _g.plant, 10)
		_g._flange(p + nx * 0.14, nx, 0.05, _g.plant)
		var hd := _holder(p + nx * 0.5 + Vector3(0, 0.12, 0), rad_to_deg(a))
		_g._box(Vector3(0.44, 0.22, 0.18), Vector3.ZERO, _g._enamel(Color(0.72, 0.72, 0.68)), hd)
		var ds := _display(hd, Vector3(-0.06, 0.0, 0.095), Vector2(0.26, 0.12), "---", GREEN)
		var lm := _lamp(hd, Vector3(0.17, 0.0, 0.095), AMBER, 0.03)
		sens.append({"root": hd, "disp": ds, "lamp": lm, "p": p + nx * 0.5})
	_n.sens = sens
	# the voting cabinet: one vote lamp per sensor, the k required, the trip lamp and the trip point on its display
	var cb := _holder(c + Vector3(-3.2, 0, 3.2), 14.0)
	_cabinet(cb, Vector3(1.1, 1.8, 0.45))
	_n.vd = _display(cb, Vector3(0, 1.45, 0.24), Vector2(0.7, 0.2), "TRIP 89 C", GREEN)
	var vl: Array = []; var kl: Array = []
	for i in 3:
		vl.append(_lamp(cb, Vector3(-0.25 + 0.25 * float(i), 1.1, 0.24), RED, 0.04))
		kl.append(_lamp(cb, Vector3(-0.25 + 0.25 * float(i), 0.82, 0.24), AMBER, 0.03))
	_n.vl = vl; _n.kl = kl
	_n.trip = _lamp(cb, Vector3(0, 0.5, 0.24), RED, 0.07)
	_plate(cb, Vector3(0, 0.25, 0.24), "XS-101", 0.4)
	var bp := _holder(c + Vector3(-3.2, 0, 3.2) + Vector3(-0.9, 0, 0.0))
	_g._cyl(0.04, 3.0, Vector3(0, 1.5, 0), _g.M.paint_grey, bp, -1.0, 8)
	_n.bcn = _beacon(bp, Vector3(0, 3.0, 0))
	for i in 3: _cable([(sens[i].p as Vector3) + Vector3(0, 0.3, 0), (sens[i].p as Vector3) + Vector3(0, 0.9, 0.6), c + Vector3(-3.0 + 0.1 * float(i), 2.7, 2.2), c + Vector3(-3.0, 1.9, 3.1)], _g.plant)
	# the final elements: a feed cut valve on the feed line, the coolant valve on the jacket inlet, the dump valve to a catch tank; the chosen one is ringed and lit
	var fe: Array = []
	_g._pipe([c + Vector3(-4.2, 3.1, -0.5), c + Vector3(-0.85, 3.1, -0.5)], 0.08, _g.M.clad, _g.plant, true)
	fe.append(_esd(_g.plant, c + Vector3(-2.4, 3.1, -0.5), Vector3(1, 0, 0), Color(0.62, 0.12, 0.08)))
	_g._pipe([c + Vector3(-4.2, 1.4, 0.0), c + Vector3(-1.62, 1.4, 0.0)], 0.07, _g.M.paint_green, _g.plant, true)
	fe.append(_esd(_g.plant, c + Vector3(-2.7, 1.4, 0.0), Vector3(1, 0, 0), Color(0.2, 0.4, 0.6)))
	_g._pipe([c + Vector3(0.95, 1.15, 0.3), c + Vector3(1.9, 1.15, 0.3), c + Vector3(1.9, 1.15, 3.3)], 0.08, _g.M.steel_dull, _g.plant, true)
	fe.append(_esd(_g.plant, c + Vector3(1.9, 1.15, 1.7), Vector3(0, 0, 1), Color(0.7, 0.5, 0.1)))
	_g._drum(c + Vector3(2.9, 0.85, 3.6), 0.6, 2.2, _g._paint(Color(0.62, 0.5, 0.2)), _g.plant)
	_g._pipe([c + Vector3(1.9, 1.15, 3.3), c + Vector3(1.9, 1.15, 3.6), c + Vector3(2.3, 1.15, 3.6)], 0.08, _g.M.steel_dull, _g.plant, false)
	_n.fe = fe

## A shut-off valve with a spring actuator (a yellow can on a yoke) and a ring that lights when it is the chosen final element.
func _esd(parent: Node3D, p: Vector3, d: Vector3, col: Color) -> Dictionary:
	_g._valve(p, d, 0.12, parent, col)
	_g._seg(p + Vector3(0, 0.1, 0), p + Vector3(0, 0.72, 0), 0.03, _g.M.steel_dull, parent, 8)
	var can := _g._cyl(0.2, 0.34, p + Vector3(0, 0.82, 0), _g._enamel(Color(0.78, 0.6, 0.12)), parent, 0.17, 20)
	var ring := _g._flat(CYAN.darkened(0.6), 0.0, 0.3, CYAN, 0.0); ring.set_meta("col", CYAN)
	var rg := _g._torus(0.3, 0.025, p + Vector3(0, 0.0, 0), ring, parent)
	if absf(d.x) > 0.5: rg.rotation_degrees.z = 90
	else: rg.rotation_degrees.x = 90
	return {"ring": ring, "can": can}

func _l33(view: Dictionary, running: bool) -> void:
	var n := clampi(roundi(_dial(view, "sensors", 3.0)), 1, 3); var k := clampi(roundi(_dial(view, "k", 2.0)), 1, 3)
	var act := clampi(roundi(_dial(view, "action", 3.0)), 1, 3); var tp := _dial(view, "tripC", 89.0)
	var sc: Array = view.get("scenarios", []); var s0: Dictionary = sc[0] if sc.size() > 0 and sc[0] is Dictionary else {}
	var sens: Array = _n.sens
	var rd: Array = s0.get("sensors", [])
	var votes := 0
	for i in 3:
		var e: Dictionary = sens[i]
		_vis(e.root, i < n)
		var val := float((rd[i] as Dictionary).get("reading", 0.0)) if i < rd.size() and rd[i] is Dictionary else 0.0
		var failed := bool((rd[i] as Dictionary).get("failed", false)) if i < rd.size() and rd[i] is Dictionary else false
		_txt(e.disp, "%.0f C" % val if rd.size() > 0 else "---")
		var over := rd.size() > 0 and val >= tp
		if i < n and over: votes += 1
		_lamp_set(_n.vl[i], i < n and over); _lamp_set(e.lamp, failed, 3.0)
		_lamp_set(_n.kl[i], i < k)
	_txt(_n.vd, "TRIP %.0f C" % tp)
	var tripped: bool = float(view.get("tripAt", -1.0)) >= 0.0
	_lamp_set(_n.trip, tripped); _beacon_set(_n.bcn, tripped)
	for i in 3:
		var fe: Dictionary = _n.fe[i]; var on := i == act - 1
		var m := fe.ring as StandardMaterial3D; m.albedo_color = CYAN if on else CYAN.darkened(0.6); m.emission_enabled = true; m.emission = CYAN; m.emission_energy_multiplier = 3.0 if on else 0.0
	var cs: Dictionary = _g._cstr.get("R-101", {})
	if not cs.is_empty():   # the dial thermometer reads the replay's reactor temperature, the shell reddens near the limit
		var T := _lastf(_ser(view, "pv"), 25.0); var lim := float(view.get("limitC", 118.0))
		(cs.dial as ShaderMaterial).set_shader_parameter("value", clampf((T - 25.0) / maxf(1.0, lim - 25.0) * 0.75, 0.0, 1.0))

# ==== L34 HAZOP Node: E-102 as a waste-heat cooler; each safeguard the worksheet names stands on it, one yellow tag per row ======================
const SAFE_KEYS := ["psv", "check_valve", "tahh", "lal", "bfw_standby", "tic_bypass", "demister", "dryer"]
func _b34() -> void:
	var h := _u("E-102"); var dz := h.z + 0.35; var dy := 3.5
	# the steam drum above the exchanger on two risers, its level glass, the feed-water line into it
	var dm: Material = _g.M.clad
	_g._cyl(0.45, 3.0, Vector3(h.x + 0.2, dy, dz), dm, _g.plant, -1.0, 32).rotation_degrees.z = 90
	for sg in [-1.0, 1.0]: _g._sph(0.45, Vector3(h.x + 0.2 + sg * 1.5, dy, dz), dm, _g.plant, true).rotation_degrees.z = -90.0 * sg
	for rx in [-0.6, 1.0]: _g._seg(Vector3(h.x + rx, 1.9, dz), Vector3(h.x + rx, dy - 0.4, dz), 0.1, _g.M.steel_dull, _g.plant, 12)
	var liq := _g._gauge_glass(Vector3(h.x + 1.1, dy - 0.3, dz + 0.62), 0.6, Color(0.7, 0.86, 0.95)); (liq.mesh as CylinderMesh).height = 0.32; liq.position.y = dy - 0.3 + 0.16
	_g._pipe([Vector3(h.x - 3.4, 0.5, dz + 1.6), Vector3(h.x - 3.4, dy, dz + 1.6), Vector3(h.x - 3.4, dy, dz), Vector3(h.x - 1.7, dy, dz)], 0.07, _g.M.steel_dull, _g.plant, true)   # feed water
	_g._pipe([Vector3(h.x - 3.0, 1.98, h.z), Vector3(h.x - 3.0, 3.0, h.z), Vector3(h.x - 5.4, 3.0, h.z)], 0.15, _g.M.clad, _g.plant, true)   # the gas in
	_g._pipe([Vector3(h.x + 2.1, 1.98, h.z), Vector3(h.x + 2.1, 3.0, h.z), Vector3(h.x + 4.6, 3.0, h.z)], 0.15, _g.M.clad, _g.plant, true)   # and out
	_g._pipe([Vector3(h.x + 1.0, dy + 0.45, dz), Vector3(h.x + 1.0, dy + 1.3, dz), Vector3(h.x + 3.6, dy + 1.3, dz)], 0.09, _g.M.clad, _g.plant, true)   # steam out
	var sf := {}
	# psv: a spring relief valve on the drum with its tail pipe
	var a := _holder(Vector3(h.x - 0.6, dy + 0.45, dz)); sf["psv"] = a
	_g._seg(Vector3.ZERO, Vector3(0, 0.3, 0), 0.07, _g.M.steel_dull, a, 10); _g._cyl(0.12, 0.3, Vector3(0, 0.45, 0), _g.M.red, a, -1.0, 16); _g._cyl(0.07, 0.4, Vector3(0, 0.8, 0), _g.M.steel_dull, a, -1.0, 12); _g._sph(0.06, Vector3(0, 1.02, 0), _g.M.red, a)
	_g._pipe([Vector3(0.12, 0.45, 0), Vector3(0.5, 0.45, 0), Vector3(0.5, 1.8, 0)], 0.07, _g.M.steel_dull, a, false)
	# check_valve: a swing check on the feed water line
	var b := _holder(Vector3(h.x - 2.55, dy, dz)); sf["check_valve"] = b
	_g._cyl(0.1, 0.5, Vector3.ZERO, _g.M.steel_dull, b, -1.0, 16).rotation_degrees.z = 90; _g._sph(0.15, Vector3(0, 0.08, 0), _g.M.steel_dull, b, true); _g._cyl(0.1, 0.04, Vector3(0, 0.2, 0), _g.M.black, b, -1.0, 12)
	_g._box(Vector3(0.18, 0.05, 0.1), Vector3(0, 0.14, 0.14), _g._flat(Color(0.9, 0.8, 0.2), 0.3, 0.4), b)
	# tahh: a high-temperature trip: thermowell head on the outlet and a trip valve on the gas inlet, its lamp
	var c := _holder(Vector3.ZERO); sf["tahh"] = c
	_thermowell(c, Vector3(h.x + 3.2, 3.1, h.z), "TAHH")
	var ev := _esd(c, Vector3(h.x - 4.2, 3.0, h.z), Vector3(1, 0, 0), Color(0.62, 0.12, 0.08))
	# lal: a level switch on the drum and an alarm light above it
	var d := _holder(Vector3(h.x - 1.2, dy + 0.45, dz)); sf["lal"] = d
	_g._box(Vector3(0.2, 0.26, 0.2), Vector3(0, 0.2, 0), _g._enamel(Color(0.72, 0.72, 0.68)), d)
	_n.lal_b = _beacon(d, Vector3(0, 0.33, 0), AMBER)
	# bfw_standby: a second feed pump on its base plate beside the line
	var e := _holder(Vector3(h.x - 2.2, 0, dz + 2.8)); sf["bfw_standby"] = e
	_g._box(Vector3(2.0, 0.14, 0.8), Vector3(0, 0.07, 0), _g.M.yellow, e)
	_g._cyl(0.28, 0.8, Vector3(0.55, 0.5, 0), _g._paint(Color(0.1, 0.25, 0.2)), e, -1.0, 24).rotation_degrees.z = 90
	_g._cyl(0.3, 0.3, Vector3(-0.35, 0.5, 0), _g._paint(Color(0.2, 0.32, 0.5)), e, -1.0, 24).rotation_degrees.z = 90; _g._sph(0.3, Vector3(-0.35, 0.5, 0), _g._paint(Color(0.2, 0.32, 0.5)), e)
	_g._pipe([Vector3(-0.35, 0.8, 0), Vector3(-0.35, 1.2, 0), Vector3(-1.2, 1.2, 0), Vector3(-1.2, 0.5, -1.2)], 0.06, _g.M.steel_dull, e, false)
	# tic_bypass: a gas bypass over the shell with its control valve and thermowell
	var f := _holder(Vector3.ZERO); sf["tic_bypass"] = f
	_g._pipe([Vector3(h.x - 2.2, 1.95, h.z - 0.3), Vector3(h.x - 2.2, 2.9, h.z - 0.95), Vector3(h.x + 2.2, 2.9, h.z - 0.95), Vector3(h.x + 2.2, 1.95, h.z - 0.3)], 0.1, _g.M.clad, f, true)
	_g._valve(Vector3(h.x, 2.9, h.z - 0.95), Vector3(1, 0, 0), 0.09, f, Color(0.5, 0.35, 0.1)); _actuator(f, Vector3(h.x, 2.9, h.z - 0.95), 0.09, Color(0.7, 0.55, 0.12))
	_thermowell(f, Vector3(h.x + 1.4, 2.98, h.z - 0.95), "TIC")
	# demister: a vane-pack can on the steam outlet
	var g2 := _holder(Vector3(h.x + 1.0, dy + 0.45, dz)); sf["demister"] = g2
	_g._cyl(0.26, 0.55, Vector3(0, 0.3, 0), _g._enamel(Color(0.28, 0.3, 0.32)), g2, -1.0, 20); _g._cyl(0.3, 0.06, Vector3(0, 0.6, 0), _g.M.steel_dull, g2, -1.0, 20)
	for i in 3: _g._box(Vector3(0.4, 0.02, 0.4), Vector3(0, 0.12 + 0.12 * float(i), 0), _g.M.black, g2)
	# dryer: a small blue vessel on the gas line
	var k := _holder(Vector3(h.x + 4.4, 0, h.z + 1.1)); sf["dryer"] = k
	_g._vessel(Vector3.ZERO, 0.45, 1.6, _g._enamel(Color(0.22, 0.34, 0.5)), k, {"legs": true, "base": 0.5})
	_g._pipe([Vector3(0, 0.2, -0.9), Vector3(0, 0.2, -1.1)], 0.05, _g.M.steel_dull, k, false)
	_n.sf = sf; _n.ev = ev
	# the tag rail in front of the exchanger, one yellow tag per worksheet row
	_g._seg(Vector3(h.x - 2.7, 2.62, h.z + 0.95), Vector3(h.x + 2.7, 2.62, h.z + 0.95), 0.012, _g.M.steel_dull, _g.plant, 6)
	for sx in [-2.7, 2.7]: _g._seg(Vector3(h.x + sx, 1.9, h.z + 0.95), Vector3(h.x + sx, 2.62, h.z + 0.95), 0.014, _g.M.steel_dull, _g.plant, 6)
	var tags: Array = []
	for i in 24: tags.append(_tag_card(_g.plant, Vector3(h.x - 2.5 + 0.215 * float(i), 2.62, h.z + 0.95)))
	_n.tags = tags

func _l34(view: Dictionary, running: bool) -> void:
	var rows: Array = view.get("rows", [])
	var have := {}
	for r in rows: have[str((r as Dictionary).get("safe", ""))] = true
	var sf: Dictionary = _n.sf
	for key in SAFE_KEYS: _vis(sf.get(key), have.has(key))
	var t: Array = _n.tags
	for i in t.size(): _vis(t[i], i < rows.size())
	_beacon_set(_n.lal_b, have.has("lal"))
	var ring := _n.ev.ring as StandardMaterial3D; ring.emission_enabled = true; ring.emission = CYAN; ring.emission_energy_multiplier = 3.0 if have.has("tahh") else 0.0
	ring.albedo_color = CYAN if have.has("tahh") else CYAN.darkened(0.6)

# ==== L35 Start-up: valves and lamps lit in the order of the SOP cards; the flare pilot; the converter heating up ===================================
func _station(p: Vector3, col: Color) -> Dictionary:
	var h := _holder(p, -8.0); h.scale = Vector3.ONE * 1.4
	_g._pipe([Vector3(-1.0, 0.7, 0), Vector3(1.0, 0.7, 0)], 0.07, _g.M.steel_dull, h, true)
	_g._valve(Vector3(0, 0.7, 0), Vector3(1, 0, 0), 0.1, h, col)
	for sx in [-0.7, 0.7]: _g._box(Vector3(0.1, 0.62, 0.1), Vector3(sx, 0.31, 0), _g.M.paint_grey, h)
	_g._cyl(0.035, 1.0, Vector3(0.75, 0.5, 0.4), _g.M.steel_dull, h, -1.0, 8)
	_g._box(Vector3(0.26, 0.34, 0.1), Vector3(0.75, 1.17, 0.4), _g._enamel(Color(0.74, 0.74, 0.7)), h)
	var lamp := _lamp(h, Vector3(0.75, 1.26, 0.455), GREEN, 0.045)
	var disp := _display(h, Vector3(0.75, 1.08, 0.455), Vector2(0.16, 0.1), "", AMBER)
	return {"lamp": lamp, "disp": disp}

func _b35() -> void:
	var r := _u("R-101"); var e := _u("E-102"); var d := _u("D-103"); var f := _u("F-100"); var k := _u("K-104")
	var st := {}
	var zf := -1.3
	st["intro_h2"] = _station(Vector3(f.x + 1.6, 0, zf), Color(0.7, 0.3, 0.1))
	st["purge"] = _station(Vector3(r.x - 2.2, 0, zf), Color(0.2, 0.4, 0.6))
	st["press_full"] = _station(Vector3(r.x + 2.0, 0, zf), Color(0.62, 0.12, 0.08))
	st["cool_on"] = _station(Vector3(e.x - 0.4, 0, zf), Color(0.2, 0.5, 0.35))
	st["flare_on"] = _station(Vector3(d.x - 0.2, 0, zf), Color(0.62, 0.12, 0.08))
	for i in 3:   # nitrogen cylinders by the purge station
		var cy := _holder(Vector3(r.x - 3.9 + 0.3 * float(i), 0, zf + 0.3))
		_g._cyl(0.12, 1.4, Vector3(0, 0.7, 0), _g._flat(Color(0.2, 0.3, 0.55), 0.3, 0.45), cy, -1.0, 16); _g._sph(0.12, Vector3(0, 1.4, 0), _g._flat(Color(0.2, 0.3, 0.55), 0.3, 0.45), cy, true)
	# an instrument plate on the converter: pressure gauge, a test lamp and a heat-up lamp
	var ip := _holder(r + Vector3(0.75, 1.9, 0.7), 12.0)
	_g._box(Vector3(0.7, 0.42, 0.05), Vector3.ZERO, _g._enamel(Color(0.74, 0.74, 0.7)), ip)
	_n.gauge = _g._gauge(Vector3(-0.17, 0.0, 0.06), Vector3(0, 0, 1), ip, 0.0, 0.14)
	st["press_test"] = {"lamp": _lamp(ip, Vector3(0.17, 0.1, 0.03), GREEN, 0.04), "disp": null}
	st["heat"] = {"lamp": _lamp(ip, Vector3(0.17, -0.1, 0.03), AMBER, 0.04), "disp": null}
	st["circ_on"] = {"lamp": _lamp(_g.plant, k + Vector3(0.75, 1.0, 0.43), GREEN, 0.05), "disp": null}
	_n.st = st
	# the flare: a knock-out line from the drum to a stack, its pilot and flame
	var fx := d.x + 2.9; var fz := d.z - 1.0
	_g._pipe([d + Vector3(0.4, 4.6, 0), d + Vector3(0.4, 5.4, 0), Vector3(fx, 5.4, fz)], 0.09, _g.M.clad, _g.plant, true)
	_g._cyl(0.17, 8.2, Vector3(fx, 4.1, fz), _g.M.steel_dull, _g.plant, -1.0, 16); _g._cyl(0.34, 0.2, Vector3(fx, 0.1, fz), _g.M.paint_grey, _g.plant)
	_g._cyl(0.26, 0.4, Vector3(fx, 8.4, fz), _g.M.steel_dull, _g.plant, 0.17, 16)
	for i in 3: var a := i * TAU / 3.0; _g._seg(Vector3(fx, 7.6, fz), Vector3(fx + cos(a) * 2.2, 0.05, fz + sin(a) * 2.2), 0.01, _g.M.steel_dull, _g.plant, 4)
	var fm := _g._flat(Color(1.0, 0.5, 0.1), 0.0, 0.3, Color(1.0, 0.45, 0.08), 0.0)
	var fl := _g._sph(0.16, Vector3(fx + 0.12, 8.7, fz), fm, _g.plant); fl.scale = Vector3(0.7, 1.6, 0.7)
	var fli: OmniLight3D = null
	if _g.tier != "compat":
		fli = OmniLight3D.new(); fli.light_color = Color(1.0, 0.5, 0.2); fli.light_energy = 0.0; fli.light_specular = 0.0; fli.omni_range = 5.0; fli.position = Vector3(fx, 8.6, fz + 0.4); _g.plant.add_child(fli)
	_n.flame = {"node": fl, "mat": fm, "light": fli}

func _l35(view: Dictionary, running: bool) -> void:
	var order: Array = view.get("order", [])
	var idx := {}
	for i in order.size(): idx[str((order[i] as Dictionary).get("id", ""))] = i + 1
	idx["heat"] = idx.get("heat_slow", idx.get("heat_fast", 0))
	var bad := ""
	for tr in view.get("trace", []):
		if str((tr as Dictionary).get("kind", "")) != "done": bad = str((tr as Dictionary).get("id", "")); break
	if bad.begins_with("heat"): bad = "heat"
	var st: Dictionary = _n.st
	for key in st:
		var s: Dictionary = st[key]; var n: int = int(idx.get(key, 0))
		var m := s.lamp as StandardMaterial3D; var col: Color = GREEN if key != "heat" else AMBER
		m.set_meta("col", RED if bad == key else col); _lamp_set(m, n > 0)
		if s.get("disp") != null: _txt(s.disp, "%d" % n if n > 0 else "")
	var stt: Dictionary = view.get("state", {})
	var fl: Dictionary = _n.flame
	var pilot: bool = int(idx.get("flare_on", 0)) > 0 and (float(stt.get("flare", 1.0)) > 0.5 if stt.has("flare") else true)
	(fl.node as Node3D).visible = pilot
	(fl.mat as StandardMaterial3D).emission_energy_multiplier = 3.0 if pilot else 0.0
	if fl.light != null: (fl.light as OmniLight3D).light_energy = 2.5 if pilot else 0.0
	_n.gauge.set_shader_parameter("value", clampf(float(stt.get("p", 1.0)) / 100.0, 0.0, 1.0) * 0.9)
	var g: Dictionary = _g._glow.get("R-101", {})
	if not g.is_empty():   # the converter warms toward its working temperature: dark at 300 K, a deep orange glow at 650 K and over
		var T := float(stt.get("t", 300.0)); var kk := clampf((T - 320.0) / 330.0, 0.0, 1.0)
		var m2 := g.mat as StandardMaterial3D; m2.emission = Color(1.0, 0.3, 0.05).lerp(Color(1.0, 0.55, 0.15), kk); m2.emission_energy_multiplier = 1.4 * kk
		(g.light as OmniLight3D).light_energy = 2.2 * kk; g["lamp"] = 2.2 * kk

# ==== L36 Permit to Work: E-101 isolated step by step: block valves, bleeds, the blind, locks and tags, the gas tester, the bundle pulled ===================
## A block valve with a hand wheel whose colour says its state (red shut, green open); returns {mat, lock, tag}.
func _blk(parent: Node3D, p: Vector3, d: Vector3, r: float) -> Dictionary:
	var m := _g._flat(RED, 0.2, 0.5)
	_g._seg(p - d * r * 1.6, p + d * r * 1.6, r * 1.5, m, parent, 14)
	_g._flange(p - d * r * 1.7, d, r, parent); _g._flange(p + d * r * 1.7, d, r, parent)
	_g._seg(p, p + Vector3(0, r * 4.2, 0), r * 0.35, _g.M.steel_dull, parent, 8)
	_g._box(Vector3(r * 1.6, r * 1.6, r * 1.6), p + Vector3(0, r * 1.9, 0), m, parent)
	var wh := _g._torus(r * 1.7, r * 0.2, p + Vector3(0, r * 4.4, 0), m, parent)
	var lk := Node3D.new(); lk.position = p + Vector3(r * 1.7, r * 4.4, 0); parent.add_child(lk)
	_g._box(Vector3(0.1, 0.09, 0.05), Vector3(0, -0.02, 0), _g._flat(Color(0.8, 0.62, 0.12), 0.9, 0.3), lk)
	_g._torus(0.035, 0.008, Vector3(0, 0.05, 0), _g._flat(Color(0.8, 0.8, 0.82), 0.9, 0.3), lk).rotation_degrees.x = 90
	_tag_card(lk, Vector3(0, -0.06, 0.04), RED)
	return {"mat": m, "lock": lk}

func _b36() -> void:
	var e := _u("E-101"); var y := 3.0
	_g._pipe([Vector3(e.x - 1.8, 1.98, e.z), Vector3(e.x - 1.8, y, e.z), Vector3(e.x - 7.0, y, e.z)], 0.13, _g.M.clad, _g.plant, true)
	_g._pipe([Vector3(e.x + 1.8, 1.98, e.z), Vector3(e.x + 1.8, y, e.z), Vector3(e.x + 7.0, y, e.z)], 0.13, _g.M.clad, _g.plant, true)
	var v := {}
	v["in1"] = _blk(_g.plant, Vector3(e.x - 3.1, y, e.z), Vector3(1, 0, 0), 0.13); v["in2"] = _blk(_g.plant, Vector3(e.x - 4.4, y, e.z), Vector3(1, 0, 0), 0.13)
	v["out1"] = _blk(_g.plant, Vector3(e.x + 4.2, y, e.z), Vector3(1, 0, 0), 0.13); v["out2"] = _blk(_g.plant, Vector3(e.x + 5.5, y, e.z), Vector3(1, 0, 0), 0.13)
	# the bleeds: a small valve on a stub off each side, between the block valves and the exchanger
	_g._seg(Vector3(e.x - 2.2, y, e.z), Vector3(e.x - 2.2, y + 0.5, e.z), 0.04, _g.M.steel_dull, _g.plant, 8)
	v["bleedIn"] = _blk(_g.plant, Vector3(e.x - 2.2, y + 0.5, e.z), Vector3(0, 0, 1), 0.05)
	_g._seg(Vector3(e.x + 3.2, y, e.z), Vector3(e.x + 3.2, y + 0.5, e.z), 0.04, _g.M.steel_dull, _g.plant, 8)
	v["bleedOut"] = _blk(_g.plant, Vector3(e.x + 3.2, y + 0.5, e.z), Vector3(0, 0, 1), 0.05)
	_n.v = v
	# the blind: a spade between the outlet nozzle's flanges, its handle standing up
	var bl := _holder(Vector3(e.x + 2.55, y, e.z)); _n.blind = bl
	_g._cyl(0.2, 0.035, Vector3.ZERO, _g._flat(Color(0.85, 0.2, 0.1), 0.5, 0.4), bl, -1.0, 24).rotation_degrees.z = 90
	_g._box(Vector3(0.035, 0.34, 0.07), Vector3(0, 0.3, 0), _g._flat(Color(0.85, 0.2, 0.1), 0.5, 0.4), bl)
	_g._flange(Vector3(e.x + 2.45, y, e.z), Vector3(1, 0, 0), 0.13, _g.plant); _g._flange(Vector3(e.x + 2.65, y, e.z), Vector3(1, 0, 0), 0.13, _g.plant)
	# the pressure gauge on the shell, a drain hose into a bucket, the permit board
	_n.gauge = _g._gauge(Vector3(e.x + 0.4, 1.55, e.z + 0.7), Vector3(0, 0, 1), _g.plant, 0.6, 0.15)
	var dr := _holder(Vector3(e.x + 1.4, 0, e.z + 1.5)); _n.drain = dr
	_g._pipe([Vector3(-0.4, 1.1, -0.7), Vector3(-0.4, 0.5, -0.1), Vector3(0, 0.5, 0.0), Vector3(0, 0.3, 0)], 0.03, _g.M.black, dr, false)
	_g._cyl(0.26, 0.36, Vector3(0, 0.18, 0), _g._flat(Color(0.7, 0.3, 0.1), 0.3, 0.5), dr, 0.3, 16)
	var pb := _holder(Vector3(e.x - 3.8, 0, e.z + 2.6), 8.0)
	for sx in [-0.45, 0.45]: _g._cyl(0.03, 1.6, Vector3(sx, 0.8, 0), _g.M.steel_dull, pb, -1.0, 8)
	_g._box(Vector3(1.0, 0.7, 0.04), Vector3(0, 1.3, 0), _g._flat(Color(0.9, 0.88, 0.8), 0.0, 0.7), pb)
	_n.pb = _lamp(pb, Vector3(0, 1.78, 0.0), GREEN, 0.07)
	# the gas tester on a tripod, its display and lamp
	var gt := _holder(Vector3(e.x - 1.6, 0, e.z + 2.9), 10.0)
	for i in 3: var a := i * TAU / 3.0; _g._seg(Vector3(0, 1.0, 0), Vector3(cos(a) * 0.4, 0, sin(a) * 0.4), 0.014, _g.M.steel_dull, gt, 6)
	_g._box(Vector3(0.3, 0.42, 0.14), Vector3(0, 1.22, 0), _g._flat(Color(0.82, 0.66, 0.1), 0.0, 0.5), gt)
	_n.gt = _display(gt, Vector3(0, 1.3, 0.075), Vector2(0.22, 0.12), "--", GREEN)
	_n.gt_l = _lamp(gt, Vector3(0, 1.1, 0.075), GREEN, 0.04)
	# the tube bundle on its cradle, pulled when the exchanger is open
	var bu := _holder(Vector3(e.x, 0.0, e.z + 3.6)); _n.bundle = bu
	for sx in [-1.4, 1.4]: _g._box(Vector3(0.2, 0.5, 0.9), Vector3(sx, 0.25, 0), _g.M.paint_grey, bu)
	var bb := Node3D.new(); bb.position = Vector3(0, 0.85, 0); bu.add_child(bb); _tube_bundle(bb, 4.4, 0.4)
	_n.bundle.visible = false

func _l36(view: Dictionary, running: bool) -> void:
	var s: Dictionary = view.get("state", {})
	if s.is_empty(): s = {}
	var ran: bool = view.has("order") and (view.get("order") as Array).size() > 0
	var lock := float(s.get("lock", 0.0)) > 0.5 and ran
	for k in _n.v:
		var e: Dictionary = _n.v[k]
		var closed := float(s.get(k, 0.0)) > 0.5
		var bleed: bool = str(k).begins_with("bleed")
		var col := GREEN if (closed if bleed else not closed) else RED   # a block valve is red shut, a bleed is green open
		(e.mat as StandardMaterial3D).albedo_color = col; (e.mat as StandardMaterial3D).emission_enabled = true; (e.mat as StandardMaterial3D).emission = col; (e.mat as StandardMaterial3D).emission_energy_multiplier = 0.25
		_vis(e.lock, lock and not bleed and closed)
	_vis(_n.blind, float(s.get("blind", 0.0)) > 0.5)
	var dep := float(s.get("dep", 0.0)) > 0.5
	_n.gauge.set_shader_parameter("value", 0.04 if dep else 0.62)
	_vis(_n.drain, float(s.get("drained", 0.0)) > 0.5)
	var gas := float(s.get("gas", 0.0)) > 0.5
	_txt(_n.gt, "%d" % roundi(float(s.get("resid", 0.0))) if (ran and float(s.get("drained", 0.0)) > 0.5) else "--")
	_lamp_set(_n.gt_l, gas)
	_lamp_set(_n.pb, ran and bool(view.get("safe", false)) and not bool(view.get("halted", false)))
	_vis(_n.bundle, float(s.get("open", 0.0)) > 0.5 and float(s.get("back", 0.0)) < 0.5)

# ==== L37 The Analyser Lies: five flow meters on the loop piping, each with its own reading, a red tag on the flagged one =========================
func _b37() -> void:
	var x0 := -4.6; var x1 := 2.8; var zm := -1.0; var zr := 1.2; var y := 1.1
	var m: Material = _g.M.clad
	_g._pipe([Vector3(-8.6, y, zm), Vector3(x0, y, zm), Vector3(x1, y, zm), Vector3(x1, y, zr), Vector3(x0, y, zr), Vector3(x0, y, zm)], 0.1, m, _g.plant, true)
	_g._pipe([Vector3(x1, y, zm), Vector3(7.0, y, zm)], 0.08, _g.M.steel_dull, _g.plant, true)
	for sx in [-7.8, -4.2, -1.0, 2.4, 5.0, 6.8]: _g._box(Vector3(0.14, 1.0, 0.14), Vector3(sx, 0.5, zm), _g.M.paint_grey, _g.plant)
	for sx in [-3.4, 0.6]: _g._box(Vector3(0.14, 1.0, 0.14), Vector3(sx, 0.5, zr), _g.M.paint_grey, _g.plant)
	var at := [Vector3(-6.4, y, zm), Vector3(-2.6, y, zm), Vector3(0.9, y, zm), Vector3(5.0, y, zm), Vector3(-0.9, y, zr)]
	var ms: Array = []
	for i in 5:
		var mt := _meter(_g.plant, at[i], Vector3(1, 0, 0), 0.1, "FI-10%d" % (i + 1), "---")
		var tg := _tag_card(_g.plant, (mt.top as Vector3) + Vector3(0.0, 0.1, 0.13), RED); tg.scale = Vector3(1.6, 1.6, 1.0)
		mt["tag"] = tg; ms.append(mt)
	_n.ms = ms

func _l37(view: Dictionary, running: bool) -> void:
	var meters: Array = view.get("meters", [])
	var ms: Array = _n.ms
	for i in ms.size():
		var e: Dictionary = ms[i]
		var mv: Dictionary = meters[i] if i < meters.size() and meters[i] is Dictionary else {}
		var flagged := bool(mv.get("flagged", false)); var excl := bool(mv.get("excluded", false))
		_txt(e.disp, "--" if (mv.is_empty() or excl) else "%.1f" % float(mv.get("reading", 0.0)))
		(e.disp as Label3D).modulate = AMBER if excl else GREEN
		_vis(e.tag, flagged); _lamp_set(e.lamp, flagged)

# ==== L38 Turnaround Plan: scaffold on the equipment for the jobs, the crane (a second when hired), the crew board for the days ===================
func _b38() -> void:
	var r := _u("R-101"); var e := _u("E-102"); var d := _u("D-103"); var z := _u("Z-105")
	var sc := {}
	sc["J2"] = _scaffold(r, 3.6, 3.6, 8.0); sc["J3"] = _scaffold(e + Vector3(-0.2, 0, 0), 7.2, 2.8, 4.0)
	sc["J5"] = _scaffold(d, 2.8, 2.8, 6.0); sc["J4"] = _scaffold(z, 3.0, 3.0, 4.0)
	var flags := {}
	for k in sc:   # a pennant on each scaffold: orange on the critical path, blue off it
		var s: Node3D = sc[k]; var hh := 8.0 if k == "J2" else (4.0 if k in ["J3", "J4"] else 6.0)
		_g._seg(Vector3(0, hh, 0), Vector3(0, hh + 1.1, 0), 0.02, _g.M.steel_dull, s, 6)
		var fm := _g._flat(Color(0.2, 0.4, 0.8), 0.0, 0.6, Color(0.2, 0.4, 0.8), 0.4)
		_g._box(Vector3(0.5, 0.3, 0.02), Vector3(0.25, hh + 0.95, 0), fm, s); flags[k] = fm
	_n.sc = sc; _n.flags = flags
	_n.c1 = _crane(Vector3(-8.0, 0, -11.0), -51.6)
	_n.c2 = _crane(Vector3(17.2, 0, -1.4), 188.0)
	# the crew board: 20 day columns, each a bar of crew (amber, red over the limit) with a lamp above for the days the crane works; a green marker at the finish
	var bd := _holder(Vector3(10.6, 0, 2.2), -10.0)
	for sx in [-2.1, 2.1]: _g._box(Vector3(0.14, 2.8, 0.14), Vector3(sx, 1.4, 0), _g.M.paint_grey, bd)
	_g._box(Vector3(4.6, 2.3, 0.1), Vector3(0, 1.65, 0), _g._enamel(Color(0.08, 0.1, 0.1)), bd)
	var bars: Array = []; var cl: Array = []
	for i in 20:
		var bx := -2.0 + 0.2 * float(i) + 0.1
		var bm := _g._flat(AMBER.darkened(0.5), 0.0, 0.4, AMBER, 0.0); bm.set_meta("col", AMBER)
		var bar := _g._box(Vector3(0.14, 1.0, 0.04), Vector3(bx, 0.8, 0.07), bm, bd)
		var lamp := _g._flat(CYAN.darkened(0.6), 0.0, 0.3, CYAN, 0.0); lamp.set_meta("col", CYAN)
		_g._box(Vector3(0.14, 0.08, 0.04), Vector3(bx, 2.62, 0.07), lamp, bd)
		bars.append({"node": bar, "mat": bm}); cl.append(lamp)
	_g._box(Vector3(4.2, 0.02, 0.03), Vector3(0, 0.78, 0.08), _g.M.black, bd)
	var fin := _g._flat(GREEN.darkened(0.5), 0.0, 0.4, GREEN, 2.0)
	_n.fin = _g._box(Vector3(0.05, 1.6, 0.03), Vector3(-2.0, 1.5, 0.095), fin, bd)
	_n.bars = bars; _n.cl = cl
	_n.bd_d = _display(bd, Vector3(1.5, 2.42, 0.07), Vector2(0.6, 0.2), "16 d", GREEN)

func _l38(view: Dictionary, running: bool) -> void:
	var jobs: Array = view.get("jobs", [])
	var by := {}
	for j in jobs: by[str((j as Dictionary).get("id", ""))] = j
	for k in _n.sc:
		_vis(_n.sc[k], by.has(k))
		if by.has(k):
			var crit := bool((by[k] as Dictionary).get("cpmCritical", false)) or bool((by[k] as Dictionary).get("critical", false))
			var m := _n.flags[k] as StandardMaterial3D; var col := Color(1.0, 0.5, 0.05) if crit else Color(0.2, 0.4, 0.8)
			m.albedo_color = col; m.emission = col
	_vis(_n.c2, float(view.get("crane", 1.0)) >= 2.0)
	var crew: Array = view.get("crewByDay", []); var cr: Array = view.get("craneByDay", [])
	var lim := float((view.get("limits", {}) as Dictionary).get("crew", 8.0)) if view.get("limits") is Dictionary else 8.0
	var bars: Array = _n.bars
	for i in bars.size():
		var c := float(crew[i]) if i < crew.size() else 0.0
		var n := bars[i].node as MeshInstance3D; var h := maxf(0.02, 1.4 * c / maxf(lim, 1.0))
		(n.mesh as BoxMesh).size.y = h; n.position.y = 0.8 + h * 0.5 - 0.0
		var bm := bars[i].mat as StandardMaterial3D
		bm.set_meta("col", RED if c > lim else AMBER); _lamp_set(bm, c > 0.0, 1.6)
		_lamp_set(_n.cl[i], (float(cr[i]) if i < cr.size() else 0.0) > 0.0, 2.0)
	var ms := float(view.get("makespan", 0.0))
	(_n.fin as Node3D).position.x = -2.0 + 0.2 * clampf(ms, 0.0, 20.0)
	_txt(_n.bd_d, "%d d" % roundi(ms))

# ==== L39 Size the Line: the tank at grade, the pump near or far, legs that follow the sizes chosen, the deaerator on its deck ===================
func _b39() -> void:
	var t := _u("T-301"); var p0 := _u("P-301"); var d := _u("D-302")
	# the placeholder the display plant drew for P-301 (a plain box) gives way to the pump skid
	for c in _g.plant.get_children():
		if c is MeshInstance3D and (c as MeshInstance3D).mesh is BoxMesh and ((c as MeshInstance3D).mesh as BoxMesh).size.is_equal_approx(Vector3(1, 1, 1)) and c.position.distance_to(p0 + Vector3(0, 0.5, 0)) < 0.05: c.queue_free()
	# the boiler-house deck under the deaerator: slab, four columns, a handrail, a ladder
	var dk := DECK_H
	_g._box(Vector3(8.4, 0.3, 6.0), Vector3(d.x, dk - 0.15, d.z), _g._flat(Color(0.5, 0.48, 0.44), 0.1, 0.85), _g.plant)
	_g._box(Vector3(8.4, 0.18, 0.1), Vector3(d.x, dk - 0.34, d.z + 3.0), _g.M.galv, _g.plant); _g._box(Vector3(8.4, 0.18, 0.1), Vector3(d.x, dk - 0.34, d.z - 3.0), _g.M.galv, _g.plant)
	for cx in [-3.9, 3.9]:
		for cz in [-2.7, 2.7]: _g._box(Vector3(0.3, dk - 0.3, 0.3), Vector3(d.x + cx, (dk - 0.3) * 0.5, d.z + cz), _g.M.oxide, _g.plant)
	for sx in [-4.1, 4.1]: _g._seg(Vector3(d.x + sx, dk, d.z + 2.9), Vector3(d.x + sx, dk + 1.05, d.z + 2.9), 0.025, _g.M.yellow, _g.plant, 6)
	for i in 5:
		var x := d.x - 4.1 + 2.05 * float(i)
		_g._seg(Vector3(x, dk, d.z + 2.9), Vector3(x, dk + 1.05, d.z + 2.9), 0.025, _g.M.yellow, _g.plant, 6)
	_g._seg(Vector3(d.x - 4.1, dk + 1.05, d.z + 2.9), Vector3(d.x + 4.1, dk + 1.05, d.z + 2.9), 0.025, _g.M.yellow, _g.plant, 6)
	_g._seg(Vector3(d.x - 4.1, dk + 0.55, d.z + 2.9), Vector3(d.x + 4.1, dk + 0.55, d.z + 2.9), 0.02, _g.M.yellow, _g.plant, 6)
	for sx2 in [-0.2, 0.2]: _g._seg(Vector3(d.x - 4.4, 0, d.z + 1.0 + sx2), Vector3(d.x - 4.4, dk, d.z + 1.0 + sx2), 0.025, _g.M.yellow, _g.plant, 6)
	var i2 := 0.3
	while i2 < dk: _g._seg(Vector3(d.x - 4.4, i2, d.z + 0.8), Vector3(d.x - 4.4, i2, d.z + 1.2), 0.014, _g.M.yellow, _g.plant, 4); i2 += 0.3
	# the tank's outlet nozzle and a drain, so the suction leg starts at a nozzle
	_g._seg(t + Vector3(1.15, 0.8, 0), t + Vector3(1.4, 0.8, 0), 0.1, _g.M.steel_dull, _g.plant, 12)
	# the pump skid (it moves between NEAR and FAR): baseplate, motor, coupling guard, volute, a sight glass on the suction nozzle and two gauges
	var pr := _holder(Vector3.ZERO); _n.pump = pr; pr.scale = Vector3.ONE * 1.4
	_g._box(Vector3(2.6, 0.18, 0.95), Vector3(0, 0.09, 0), _g.M.paint_grey, pr)
	_g._cyl(0.32, 0.95, Vector3(0.75, 0.62, 0), _g._paint(Color(0.1, 0.27, 0.22)), pr, -1.0, 28).rotation_degrees.z = 90
	for i3 in 7: _g._torus(0.335, 0.015, Vector3(0.45 + 0.13 * float(i3), 0.62, 0), _g.M.black, pr).rotation_degrees.z = 90
	_g._box(Vector3(0.7, 0.22, 0.12), Vector3(1.0, 0.98, 0), _g._enamel(Color(0.3, 0.3, 0.3)), pr)   # the terminal box
	_g._box(Vector3(0.45, 0.3, 0.4), Vector3(0.12, 0.55, 0), _g._flat(Color(0.8, 0.62, 0.1), 0.2, 0.5), pr)   # the coupling guard
	var vol := _g._paint(Color(0.2, 0.32, 0.5))
	_g._cyl(0.4, 0.32, Vector3(-0.3, 0.62, 0), vol, pr, -1.0, 28).rotation_degrees.z = 90; _g._sph(0.4, Vector3(-0.3, 0.62, 0), vol, pr)
	_g._seg(Vector3(-0.3, 1.0, 0), Vector3(-0.3, 1.5, 0), 0.1, _g.M.steel_dull, pr, 12)   # the discharge nozzle
	_g._seg(Vector3(-0.6, 0.62, 0), Vector3(-1.2, 0.62, 0), 0.12, _g.M.steel_dull, pr, 12)   # the suction nozzle
	var gl := _g._flat(Color(0.85, 0.92, 0.95, 0.2), 0.0, 0.05); gl.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_g._cyl(0.11, 0.32, Vector3(-1.5, 0.62, 0), gl, pr, -1.0, 16).rotation_degrees.z = 90   # the sight glass spool
	_g._flange(Vector3(-1.34, 0.62, 0), Vector3(1, 0, 0), 0.1, pr); _g._flange(Vector3(-1.66, 0.62, 0), Vector3(1, 0, 0), 0.1, pr)
	var bub := _g._particles(Vector3(-1.5, 0.55, 0), 22, 1.3, Vector3(0, 0.45, 0), 25.0, 0.1, Color(0.92, 0.97, 1.0, 0.85), pr, 1.4); bub.emitting = false
	_n.bubbles = bub
	_n.g_s = _g._gauge(Vector3(-0.95, 1.0, 0.0), Vector3(0, 0, 1), pr, 0.3, 0.12)
	_g._seg(Vector3(-0.95, 0.68, 0), Vector3(-0.95, 0.9, 0), 0.02, _g.M.steel_dull, pr, 6)
	_n.g_d = _g._gauge(Vector3(0.0, 1.62, 0.12), Vector3(0, 0, 1), pr, 0.3, 0.12)
	_g._seg(Vector3(-0.3, 1.5, 0), Vector3(-0.0, 1.5, 0.12), 0.02, _g.M.steel_dull, pr, 6)
	_n.lamp = _lamp(pr, Vector3(1.0, 0.84, 0.062), GREEN, 0.05)
	_n.legs = {"suction": [], "discharge": []}; _n.sig = ""
	# a click on the legs or the pump answers as it did in the classic pump house
	if _g.has_meta("hb_pick"):
		var old: Variant = _g.get_meta("hb_pick")
		if old is Callable and _g.picked.is_connected(old): _g.picked.disconnect(old)
	var cb := Callable(self, "_picked"); _g.set_meta("hb_pick", cb); _g.picked.connect(cb)
	_g.anchors["suction"] = t; _g.radius["suction"] = 0.9; _g.anchors["discharge"] = t; _g.radius["discharge"] = 0.9; _g.anchors["pump"] = t; _g.radius["pump"] = 1.0

func _picked(role: String) -> void:
	var what := "pump" if role == "P-301" else role
	if what in ["suction", "discharge", "pump"] and _g != null and _g.app != null and _g.app.plant_world != null and _g.app.plant_world.has_signal("deco_clicked"):
		_g.app.plant_world.deco_clicked.emit(what)

func _pipe_id(view: Dictionary, nps: String) -> float:
	for p in view.get("pipes", []):
		if str((p as Dictionary).get("nps", "")) == nps: return float((p as Dictionary).get("idMm", 100.0))
	return 100.0

## The velocity guide's verdict for a leg, as in the classic pump house: ok | fast | slow | none.
func _verdict(view: Dictionary, leg: String) -> String:
	var op: Dictionary = view.get("op", {}); var g: Dictionary = view.get("guide", {})
	if not bool(op.get("ok", false)) or float(op.get("q", 0.0)) <= 0.0: return "none"
	var v := float(op.get("vs" if leg == "suction" else "vd", 0.0))
	var hi := float(g.get("vsHi", 1.5)) if leg == "suction" else float(g.get("vdHi", 3.0))
	var lo := 0.0 if leg == "suction" else float(g.get("vdLo", 1.0))
	if v > hi + 1e-9: return "fast"
	if v < lo - 1e-9: return "slow"
	return "ok"

func _l39(view: Dictionary, running: bool) -> void:
	var ch: Dictionary = view.get("choice", {}); var op: Dictionary = view.get("op", {}); var gd: Dictionary = view.get("guide", {})
	var t := _u("T-301"); var d := _u("D-302")
	var far := str(ch.get("place", "near")) == "far"
	var pp := Vector3(d.x - 4.8, 0.0, d.z + 3.4) if far else Vector3(t.x + 4.6, 0.0, t.z)
	var rs := PIPE_K * _pipe_id(view, str(ch.get("suction", "4"))) / 2000.0; var rd := PIPE_K * _pipe_id(view, str(ch.get("discharge", "4"))) / 2000.0
	var vs := _verdict(view, "suction"); var vd := _verdict(view, "discharge")
	var sig := "%s|%.4f|%.4f|%s|%s" % [str(far), rs, rd, vs, vd]
	(_n.pump as Node3D).position = pp
	if sig != str(_n.sig):
		_n.sig = sig
		for leg in ["suction", "discharge"]:
			for n in _n.legs[leg]: (n as Node).queue_free()
			_n.legs[leg] = []
		var rx := d.x - 2.2
		var s0 := t + Vector3(1.4, 0.8, 0)
		var sp := [s0, Vector3(pp.x - 1.7, 0.8, t.z), Vector3(pp.x - 1.7, 0.8, pp.z), Vector3(pp.x - 1.7, 0.62, pp.z)] if far else [s0, Vector3(pp.x - 1.7, 0.8, t.z), Vector3(pp.x - 1.7, 0.62, pp.z)]
		var dp := [Vector3(pp.x - 0.3, 1.5, pp.z), Vector3(pp.x - 0.3, 6.6, pp.z), Vector3(rx, 6.6, pp.z), Vector3(rx, 6.6, d.z), Vector3(rx, d.y + 1.1, d.z), Vector3(d.x - 0.75, d.y + 1.1, d.z)]
		_leg("suction", sp, rs, PumpHouse.verdict_color(vs)); _leg("discharge", dp, rd, PumpHouse.verdict_color(vd))
		var mid: Vector3 = (s0 + (sp[1] as Vector3)) * 0.5
		_g.anchors["suction"] = mid + Vector3(0, 0.1, 0); _g.anchors["discharge"] = Vector3(pp.x - 0.3, 3.4, pp.z)
		_g.anchors["pump"] = pp + Vector3(0, 0.8, 0); _g._at["P-301"] = pp; _g.anchors["P-301"] = pp + Vector3(0, 0.8, 0)
		_g.radius["suction"] = 0.9; _g.radius["discharge"] = 0.9; _g.radius["pump"] = 1.0
	var ok := bool(op.get("ok", false)) and float(op.get("q", 0.0)) > 0.0
	var margin := float(op.get("margin", 99.0)); var need := float(gd.get("margin", 1.0))
	var cav := ok and margin < need
	(_n.bubbles as GPUParticles3D).emitting = cav
	_n.g_s.set_shader_parameter("value", clampf(float(op.get("npsha", 0.0)) / 12.0, 0.0, 1.0) * 0.9 if ok else 0.0)
	_n.g_d.set_shader_parameter("value", clampf(float(op.get("h", 0.0)) / 45.0, 0.0, 1.0) * 0.9 if ok else 0.0)
	var lm := _n.lamp as StandardMaterial3D; lm.set_meta("col", RED if cav else GREEN); _lamp_set(lm, ok)

func _leg(leg: String, pts: Array, r: float, col: Color) -> void:
	var mat := _g._flat(Color(0.58, 0.6, 0.62), 0.7, 0.4)
	var made: Array = []
	for i in pts.size() - 1:
		var a: Vector3 = pts[i]; var b: Vector3 = pts[i + 1]
		if a.distance_to(b) < 0.02: continue
		var s := _g._seg(a, b, r, mat, _g.plant, 20); made.append(s)
		if i > 0: made.append(_g._sph(r * 1.02, a, mat, _g.plant))
		var cm := _g._flat(col, 0.3, 0.45, col, 0.5)   # the velocity verdict's colour on bands along the leg
		var L := a.distance_to(b); var dir := (b - a).normalized()
		for k in range(1, int(L / 1.4) + 1):
			var q := a + dir * (L * float(k) / (float(int(L / 1.4)) + 1.0))
			var ring := _g._seg(q - dir * 0.06, q + dir * 0.06, r * 1.12, cm, _g.plant, 20); made.append(ring)
	_n.legs[leg] = made
	_n["r_" + leg] = r

# ==== CAREER: four plants A to D, each with a stack light, a turnaround scaffold when one is booked, the product's colour on its vessel ===============
func _stack_light(parent: Node3D, p: Vector3) -> Dictionary:
	_g._cyl(0.04, 3.2, p + Vector3(0, 1.6, 0), _g.M.paint_grey, parent, -1.0, 8)
	_g._cyl(0.2, 0.1, p + Vector3(0, 0.05, 0), _g.M.paint_grey, parent, -1.0, 16)
	var ms: Array = []
	for i in 3:
		var col: Color = [GREEN, AMBER, RED][i]
		var m := _g._flat(col.darkened(0.6), 0.0, 0.2, col, 0.0); m.set_meta("col", col)
		_g._cyl(0.11, 0.14, p + Vector3(0, 2.75 + 0.15 * float(2 - i) + 0.0, 0), m, parent, -1.0, 20)
		ms.append(m)
	_g._cyl(0.115, 0.04, p + Vector3(0, 3.28, 0), _g.M.black, parent, -1.0, 20)
	return {"mats": ms}

func _bcareer() -> void:
	var pl := {}
	var scaf := {"A": [3.6, 3.6, 8.0], "B": [3.8, 3.8, 5.6], "C": [2.8, 2.8, 5.6], "D": [4.0, 3.2, 3.6]}
	for L in ["A", "B", "C", "D"]:
		var main := _u("%s-2" % L); var col: Color = PLANT_COL[CAREER_PLANT[L]]
		var e := {}
		var sl := _holder(main + Vector3(-2.7, 0, 2.5)); e["light"] = _stack_light(sl, Vector3.ZERO)
		var fm := _g._flat(col, 0.1, 0.5, col, 0.2)   # the product's colour: a flag on the stack light's pole, and a band on the vessel
		_g._box(Vector3(0.5, 0.34, 0.02), Vector3(0.28, 2.35, 0.0), fm, sl)
		var band := _g._flat(col, 0.3, 0.45)
		match L:
			"A": _g._cyl(1.22, 0.4, _u("A-3") + Vector3(0, 1.7, 0), band, _g.plant, -1.0, 36)
			"B": _g._cyl(1.03, 0.3, main + Vector3(0, 3.1, 0), band, _g.plant, -1.0, 36)
			"C": _g._cyl(1.22, 0.4, _u("C-3") + Vector3(0, 1.7, 0), band, _g.plant, -1.0, 36)
			"D": _g._cyl(0.745, 0.3, _u("D-3") + Vector3(0, 0.5, 0), band, _g.plant, -1.0, 36)
		var sc: Array = scaf[L]
		var base := main if L != "D" else main + Vector3(0, 0, 0)
		e["scaf"] = _scaffold(base, float(sc[0]), float(sc[1]), float(sc[2])); (e.scaf as Node3D).visible = false
		pl[CAREER_PLANT[L]] = e
	_n.pl = pl

func _lcareer(view: Dictionary, running: bool) -> void:
	var db: Dictionary = view.get("dashboard", {}) if view.get("dashboard") is Dictionary else {}
	var alerts: Array = db.get("alerts", [])
	var inc: Dictionary = db.get("incident", {}) if db.get("incident") is Dictionary else {}
	var cal := {}
	for c in view.get("calendar", []): cal[str((c as Dictionary).get("plant", ""))] = c
	var month := float(db.get("month", 0.0))
	for pk in _n.pl:
		var e: Dictionary = _n.pl[pk]
		var st := 0   # 0 ok (green), 1 inspection due (amber), 2 incident or alert (red)
		for a in alerts:
			var ad := a as Dictionary
			if str(ad.get("plant", "")) != pk or bool(ad.get("handled", false)): continue
			st = maxi(st, 1 if str(ad.get("kind", "")) == "insp" else 2)
		if not inc.is_empty() and str(inc.get("plant", "")).to_lower() == pk and bool(inc.get("pending", false)): st = 2
		var ms: Array = e.light.mats
		_lamp_set(ms[0], st == 0, 2.5); _lamp_set(ms[1], st == 1, 3.0); _lamp_set(ms[2], st == 2, 3.5)
		e["state"] = st
		var cd: Dictionary = cal.get(pk, {})
		_vis(e.scaf, float(cd.get("turnaroundMonth", -1.0)) >= 0.0)
