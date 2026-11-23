class_name PlantSketch
extends Control
## 0.13 the pencil sketch on the briefing card: the level's flowsheet in graphite process symbols (vessel, column, exchanger circle-with-line, compressor, burner, tank, stack) joined by
## lines, with a little hand jitter. Parts that already stand on the plot are drawn solid, parts the job lets you add are dashed and lighter. Pure data in, `model()`, so a test can
## check it; the drawing only reads the model. Data: the engine's `plant` query (units with tile positions, streams) and `levelInfo.allowedUnits` (the tray).
const GRAPHITE := Color(0.20, 0.22, 0.27)
const STAGE := {"feed": 0, "compressor": 1, "pump": 1, "mixer": 2, "mixer3": 2, "heater": 3, "hx": 3, "burner": 4, "gasifier": 4, "gauze_burner": 4, "co_burner": 5, "eq_reactor": 4, "stoich_reactor": 4,
	"cstr": 4, "packed_bed": 4, "eq_bed": 4, "batch": 4, "fermenter": 4, "tubular": 4, "reformer": 4, "lab_flask": 4, "methanator": 5, "boiler": 5, "cooler": 5, "flash": 6, "nh3_sep": 6,
	"absorber": 6, "hno3_absorber": 6, "co2_removal": 6, "column": 6, "n2o_abater": 6, "splitter": 7, "valve": 7, "relief": 7, "interlock": 7, "product": 9, "sink": 9, "stack": 9, "vent": 9, "flare": 9}
const NAMES := {"feed": "feed", "compressor": "compressor", "pump": "pump", "mixer": "mixer", "mixer3": "mixer", "heater": "heater", "hx": "exchanger", "burner": "burner", "gasifier": "gasifier",
	"gauze_burner": "burner", "co_burner": "CO burner", "eq_reactor": "reactor", "stoich_reactor": "reactor", "cstr": "reactor", "packed_bed": "bed", "eq_bed": "bed", "batch": "batch", "fermenter": "fermenter",
	"tubular": "tubular", "reformer": "reformer", "lab_flask": "flask", "methanator": "methanator", "boiler": "boiler", "cooler": "cooler", "flash": "flash", "nh3_sep": "separator", "absorber": "absorber",
	"hno3_absorber": "absorber", "co2_removal": "CO₂ wash", "column": "column", "n2o_abater": "abater", "splitter": "splitter", "valve": "valve", "relief": "relief", "interlock": "interlock", "product": "tank",
	"sink": "sink", "stack": "stack", "vent": "vent", "flare": "flare"}

# ---- the model -----------------------------------------------------------------------------------------------------------------------------------
## {nodes: [{type, x, y, placed}], edges: [{a, b, solid}], mode: "placed" | "chain"}; x and y in 0..1. A plant the level placed and plumbed is drawn where it stands; anything else is a chain
## in process order (feeds, compressors, mixers, heaters, reactors, coolers, separators, tank), the placed parts solid and the rest dashed.
static func model(li: Dictionary, plant) -> Dictionary:
	var units: Array = plant.get("units", []) if plant is Dictionary else []
	var streams: Array = plant.get("streams", []) if plant is Dictionary else []
	var allowed: Array = li.get("allowedUnits", []) if li.get("allowedUnits") is Array else []
	var nodes: Array = []; var edges: Array = []
	var idx := {}
	for u in units:
		idx[str(u.id)] = nodes.size()
		nodes.append({"type": str(u.type), "x": float(u.pos.x), "y": float(u.pos.y), "placed": true})
	for s in streams:
		var a = idx.get(str(s.from.unit), -1); var b = idx.get(str(s.to.unit), -1)
		if a >= 0 and b >= 0 and a != b: edges.append({"a": a, "b": b, "solid": true})
	var placed_n := nodes.size()
	# the tray: parts the job lets the player add and that are not on the plot yet
	var extra: Array = []
	for au in allowed:
		var t := str(au.get("type", ""))
		var more := mini(int(au.get("max", 0)) - int(au.get("used", 0)), 3)
		for k in maxi(more, 0): extra.append(t)
	var plumbed := placed_n >= 3 and streams.size() >= placed_n - 3
	if plumbed:   # drawn where it stands; the tray's parts go after it, to the right
		var maxx := -1.0e9
		for n in nodes: maxx = maxf(maxx, float(n.x))
		var last := 0
		for i in nodes.size(): if float(nodes[i].x) >= maxx - 0.01: last = i
		var prev := last
		var col := 0.0
		extra.sort_custom(func(p, q): return int(STAGE.get(p, 5)) < int(STAGE.get(q, 5)))
		for i in extra.size():
			var st := int(STAGE.get(extra[i], 5))
			if i == 0 or st != int(STAGE.get(extra[i - 1], 5)): col += 3.0
			nodes.append({"type": extra[i], "x": maxx + col, "y": float(nodes[last].y) + (0.0 if i == 0 or st != int(STAGE.get(extra[i - 1], 5)) else 3.0), "placed": false})
			edges.append({"a": prev, "b": nodes.size() - 1, "solid": false}); prev = nodes.size() - 1
		return _norm({"nodes": nodes, "edges": edges, "mode": "placed"})
	# a chain in process order
	for t in extra: nodes.append({"type": t, "x": 0.0, "y": 0.0, "placed": false})
	var cols := {}
	for i in nodes.size():
		var st := int(STAGE.get(str(nodes[i].type), 5))
		if not cols.has(st): cols[st] = []
		(cols[st] as Array).append(i)
	var keys: Array = cols.keys(); keys.sort()
	for ci in keys.size():
		var members: Array = cols[keys[ci]]
		for mi in members.size():
			var nd: Dictionary = nodes[members[mi]]
			nd.x = float(ci); nd.y = float(mi) + (1.0 - float(members.size())) * 0.5   # centred on 0
	var solid_pairs := {}
	for e in edges: solid_pairs["%d_%d" % [e.a, e.b]] = true
	for ci in range(keys.size() - 1):   # join each column to the next by nearest height
		var A: Array = cols[keys[ci]]; var B: Array = cols[keys[ci + 1]]
		var done := {}
		for b in B:
			var best: int = A[0]
			for a in A: if absf(float(nodes[a].y) - float(nodes[b].y)) < absf(float(nodes[best].y) - float(nodes[b].y)): best = a
			done["%d_%d" % [best, b]] = true
		for a in A:
			var best2: int = B[0]
			for b in B: if absf(float(nodes[a].y) - float(nodes[b].y)) < absf(float(nodes[a].y) - float(nodes[best2].y)): best2 = b
			done["%d_%d" % [a, best2]] = true
		for k in done:
			if solid_pairs.has(k): continue
			var pr: PackedStringArray = (k as String).split("_")
			var ia := int(pr[0]); var ib := int(pr[1])
			edges.append({"a": ia, "b": ib, "solid": false})
	return _norm({"nodes": nodes, "edges": edges, "mode": "chain"})

static func _norm(m: Dictionary) -> Dictionary:
	var nodes: Array = m.nodes
	if nodes.is_empty(): return m
	var x0 := 1.0e9; var x1 := -1.0e9; var y0 := 1.0e9; var y1 := -1.0e9
	for n in nodes: x0 = minf(x0, float(n.x)); x1 = maxf(x1, float(n.x)); y0 = minf(y0, float(n.y)); y1 = maxf(y1, float(n.y))
	for n in nodes:
		n.x = 0.5 if x1 - x0 < 0.001 else (float(n.x) - x0) / (x1 - x0)
		n.y = 0.5 if y1 - y0 < 0.001 else (float(n.y) - y0) / (y1 - y0)
	return m

# ---- the drawing ---------------------------------------------------------------------------------------------------------------------------------
var data: Dictionary = {}
var seed_i := 1
var _t := 0.0
const REVEAL := 1.4

static func make(li: Dictionary, plant) -> PlantSketch:
	var s := PlantSketch.new(); s.name = "PlantSketch"; s.data = model(li, plant); s.seed_i = hash(str(li.get("id", ""))) % 997
	s.custom_minimum_size = Vector2(0, 190); s.size_flags_horizontal = Control.SIZE_EXPAND_FILL; s.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return s

func _ready() -> void: set_process(not CbSettings.reduced_motion and not (data.get("nodes", []) as Array).is_empty())
func _process(dt: float) -> void:
	_t += dt; queue_redraw()
	if _t > REVEAL + 0.6: set_process(false)

func _n(i: int, k: float) -> float: return fposmod(sin(float(i) * 12.9898 + k * 78.233 + float(seed_i) * 3.1) * 43758.5453, 1.0) - 0.5

## One pencil line along `pts`: resampled, nudged by a small wobble, drawn twice (a heavy and a faint pass). dashed = a lighter, broken line (not built yet).
func _line(pts: Array, a: float, dashed: bool, key: int, faint := false) -> void:
	if a <= 0.01: return
	var rs := PackedVector2Array()
	for i in range(pts.size() - 1):
		var p: Vector2 = pts[i]; var q: Vector2 = pts[i + 1]
		var n := maxi(int(p.distance_to(q) / 7.0), 1)
		for k in n: rs.append(p.lerp(q, float(k) / float(n)))
	rs.append(pts[pts.size() - 1])
	for pass_i in 2:
		var jp := PackedVector2Array()
		for i in rs.size(): jp.append(rs[i] + Vector2(_n(i + key, 1.0 + pass_i), _n(i + key, 2.0 + pass_i)) * (1.5 if pass_i == 0 else 2.2))
		var col := Color(GRAPHITE, (0.88 if pass_i == 0 else 0.38) * a * (0.6 if (faint or dashed or _faint) else 1.0))
		var w := 1.7 if pass_i == 0 else 1.0
		if not dashed: draw_polyline(jp, col, w, true)
		else:   # a dash of about 9 px, a gap of 6
			var run := 0.0; var on := true
			for i in range(jp.size() - 1):
				var seg := jp[i].distance_to(jp[i + 1])
				if on: draw_line(jp[i], jp[i + 1], col, w, true)
				run += seg
				if run >= (9.0 if on else 6.0): run = 0.0; on = not on

func _arc(c: Vector2, rx: float, ry: float, a0: float, a1: float, n := 14) -> Array:
	var out: Array = []
	for i in n + 1:
		var a := lerpf(a0, a1, float(i) / float(n)); out.append(c + Vector2(cos(a) * rx, sin(a) * ry))
	return out

func _draw() -> void:
	_faint = false
	var nodes: Array = data.get("nodes", [])
	var r := Rect2(Vector2.ZERO, size)
	# the sketch frame: a pencilled rectangle with a hair of wobble
	_line([Vector2(3, 3), Vector2(size.x - 3, 3), Vector2(size.x - 3, size.y - 3), Vector2(3, size.y - 3), Vector2(3, 3)], 0.45, false, 900)
	if nodes.is_empty(): return
	var labels := nodes.size() <= 9
	var ml := 44.0; var mt := 34.0; var mb := 56.0 if labels else 30.0
	var inner := Rect2(ml, mt, size.x - ml * 2.0, size.y - mt - mb)
	var s := clampf(sqrt(inner.size.x * inner.size.y / maxf(float(nodes.size()), 1.0)) / 3.4, 9.0, 21.0)
	var pos: Array = []
	for n in nodes: pos.append(inner.position + Vector2(float(n.x), float(n.y)) * inner.size)
	var edges: Array = data.get("edges", [])
	for ei in edges.size():
		var e: Dictionary = edges[ei]
		var a: Vector2 = pos[e.a]; var b: Vector2 = pos[e.b]
		var al := clampf((_t - float(ei) * 0.05) / 0.3, 0.0, 1.0) if not CbSettings.reduced_motion else 1.0
		var pa := a + Vector2(s * _half_w(str(nodes[e.a].type)), 0.0); var pb := b - Vector2(s * _half_w(str(nodes[e.b].type)), 0.0)
		if b.x < a.x + s: pa = a + Vector2(0, s if b.y > a.y else -s); pb = b - Vector2(0, s if b.y > a.y else -s)   # a join that does not run to the right leaves from the side
		var mx := (pa.x + pb.x) * 0.5
		var path: Array = [pa, Vector2(mx, pa.y), Vector2(mx, pb.y), pb] if absf(pa.y - pb.y) > 2.0 and pb.x > pa.x else [pa, pb]
		_line(path, al, not bool(e.solid), ei * 31)
		if pb.x > pa.x and path.size() > 1: _line([pb + Vector2(-6, -4), pb, pb + Vector2(-6, 4)], al, false, ei * 31 + 7, not bool(e.solid))   # the arrow head
	for i in nodes.size():
		var nd: Dictionary = nodes[i]
		var al2 := clampf((_t - 0.1 - float(i) * 0.07) / 0.3, 0.0, 1.0) if not CbSettings.reduced_motion else 1.0
		_symbol(str(nd.type), pos[i], s, al2, not bool(nd.placed), i * 17)
		if labels and al2 > 0.5:
			var nm := str(NAMES.get(str(nd.type), str(nd.type)))
			var f := EqStrings.font("sans")
			EqTheme.ds(self, f, pos[i] + Vector2(-60.0, s * 1.5 + 17.0), nm, HORIZONTAL_ALIGNMENT_CENTER, 120.0, 16, Color(GRAPHITE, 0.9 if bool(nd.placed) else 0.55))

func _half_w(t: String) -> float:
	match t:
		"burner", "gasifier", "co_burner", "gauze_burner": return 1.1
		"product", "sink": return 0.75
		"stack", "vent", "flare": return 0.25
		"tubular", "reformer": return 1.2
		"valve", "relief": return 0.9
	return 1.0

## One process symbol at `c`, `s` pixels of half size.
var _faint := false
func _symbol(t: String, c: Vector2, s: float, a: float, unbuilt: bool, key: int) -> void:
	var dashed := false
	_faint = unbuilt
	match t:
		"feed":   # a drum on its side with an arrow
			_line(_capsule_h(c, s * 1.0, s * 0.62), a, dashed, key); _line([c + Vector2(-s * 0.4, 0), c + Vector2(s * 0.45, 0), c + Vector2(s * 0.15, -s * 0.22)], a, dashed, key + 3)
		"product", "sink":   # a tank: a cylinder with a domed top
			_line([c + Vector2(-s * 0.75, -s * 0.8), c + Vector2(-s * 0.75, s * 0.8)] + _arc(c + Vector2(0, s * 0.8), s * 0.75, s * 0.22, PI, 0.0, 8) + [c + Vector2(s * 0.75, -s * 0.8)], a, dashed, key)
			_line(_arc(c + Vector2(0, -s * 0.8), s * 0.75, s * 0.22, 0.0, TAU, 12), a, dashed, key + 5)
		"stack", "vent", "flare":
			_line([c + Vector2(-s * 0.22, s), c + Vector2(-s * 0.18, -s), c + Vector2(s * 0.18, -s), c + Vector2(s * 0.22, s)], a, dashed, key)
			if t == "flare": _line([c + Vector2(0, -s * 1.0), c + Vector2(s * 0.28, -s * 1.5), c + Vector2(0, -s * 1.3), c + Vector2(-s * 0.2, -s * 1.55), c + Vector2(0, -s * 1.0)], a, dashed, key + 4)
			else: _line([c + Vector2(0, -s * 1.1), c + Vector2(0, -s * 1.7), c + Vector2(-s * 0.2, -s * 1.45)], a, dashed, key + 4)
		"compressor", "pump":   # a circle with the narrowing wedge
			_line(_arc(c, s, s, 0.0, TAU, 18), a, dashed, key); _line([c + Vector2(-s * 0.62, -s * 0.78), c + Vector2(s * 0.98, -s * 0.2), c + Vector2(s * 0.98, s * 0.2), c + Vector2(-s * 0.62, s * 0.78)], a, dashed, key + 3)
		"mixer", "mixer3":
			_line(_arc(c, s * 0.8, s * 0.8, 0.0, TAU, 16), a, dashed, key); _line([c + Vector2(-s * 0.8, 0), c + Vector2(s * 0.8, 0)], a, dashed, key + 3); _line([c + Vector2(0, -s * 0.8), c + Vector2(0, s * 0.8)], a, dashed, key + 4)
		"splitter":
			_line([c + Vector2(-s * 0.7, -s * 0.7), c + Vector2(s * 0.7, 0), c + Vector2(-s * 0.7, s * 0.7), c + Vector2(-s * 0.7, -s * 0.7)], a, dashed, key)
		"heater", "cooler", "hx", "boiler":   # the exchanger: a circle with the zig-zag line through it
			_line(_arc(c, s, s, 0.0, TAU, 18), a, dashed, key)
			_line([c + Vector2(-s, 0), c + Vector2(-s * 0.5, 0), c + Vector2(-s * 0.25, -s * 0.5), c + Vector2(s * 0.25, s * 0.5), c + Vector2(s * 0.5, 0), c + Vector2(s, 0)], a, dashed, key + 3)
			if t == "boiler": _line([c + Vector2(-s * 0.4, -s), c + Vector2(-s * 0.4, -s * 1.5), c + Vector2(s * 0.4, -s * 1.5), c + Vector2(s * 0.4, -s)], a, dashed, key + 5)
			if t == "hx": _line([c + Vector2(0, -s), c + Vector2(0, -s * 0.5)], a, dashed, key + 6)
		"burner", "gasifier", "co_burner", "gauze_burner":   # a firebox with its flame
			_line([c + Vector2(-s * 1.1, s * 0.7), c + Vector2(-s * 1.1, -s * 0.7), c + Vector2(s * 1.1, -s * 0.7), c + Vector2(s * 1.1, s * 0.7), c + Vector2(-s * 1.1, s * 0.7)], a, dashed, key)
			_line([c + Vector2(-s * 0.35, s * 0.55), c + Vector2(-s * 0.2, -s * 0.05), c + Vector2(0, s * 0.25), c + Vector2(s * 0.2, -s * 0.3), c + Vector2(s * 0.35, s * 0.55)], a, dashed, key + 3)
		"valve", "relief", "interlock":
			if t == "valve": _line([c + Vector2(-s * 0.8, -s * 0.6), c + Vector2(s * 0.8, s * 0.6), c + Vector2(s * 0.8, -s * 0.6), c + Vector2(-s * 0.8, s * 0.6), c + Vector2(-s * 0.8, -s * 0.6)], a, dashed, key)
			elif t == "relief": _line([c + Vector2(-s * 0.7, s * 0.7), c + Vector2(0, -s * 0.2), c + Vector2(s * 0.7, s * 0.7), c + Vector2(-s * 0.7, s * 0.7)], a, dashed, key); _line([c + Vector2(0, -s * 0.2), c + Vector2(0, -s * 1.1)], a, dashed, key + 3)
			else: _line(_arc(c, s * 0.7, s * 0.7, 0.0, TAU, 14), a, dashed, key); _line([c + Vector2(0, -s * 0.4), c + Vector2(0, s * 0.4)], a, dashed, key + 3)
		"tubular", "reformer":   # a lying vessel with tubes
			_line(_capsule_h(c, s * 1.2, s * 0.7), a, dashed, key)
			for k in 3: _line([c + Vector2(-s * 0.8, (k - 1) * s * 0.3), c + Vector2(s * 0.8, (k - 1) * s * 0.3)], a, dashed, key + 3 + k)
		"column", "absorber", "hno3_absorber", "co2_removal":   # a tall vessel with its trays
			_line(_capsule_v(c, s * 0.6, s * 1.5), a, dashed, key)
			for k in 3: _line([c + Vector2(-s * 0.55, (k - 1) * s * 0.7), c + Vector2(s * 0.55, (k - 1) * s * 0.7)], a, dashed, key + 3 + k)
		"flash", "nh3_sep":   # a vessel with the level line
			_line(_capsule_v(c, s * 0.75, s * 1.25), a, dashed, key); _line([c + Vector2(-s * 0.7, s * 0.25), c + Vector2(s * 0.7, s * 0.25)], a, dashed, key + 3); _line([c + Vector2(0, s * 1.25), c + Vector2(0, s * 1.65)], a, dashed, key + 4)
		"packed_bed", "eq_bed":   # a vessel with the catalyst bed hatched
			_line(_capsule_v(c, s * 0.75, s * 1.3), a, dashed, key)
			for k in 2: _line([c + Vector2(-s * 0.65, -s * 0.2 + k * s * 0.5), c + Vector2(s * 0.65, -s * 0.2 + k * s * 0.5)], a, dashed, key + 3 + k)
			for k in 4: _line([c + Vector2(-s * 0.5 + k * s * 0.33, -s * 0.2), c + Vector2(-s * 0.35 + k * s * 0.33, s * 0.3)], a, dashed, key + 8 + k)
		"cstr", "batch", "fermenter", "lab_flask":   # a vessel with a stirrer
			_line(_capsule_v(c, s * 0.8, s * 1.3), a, dashed, key); _line([c + Vector2(0, -s * 1.55), c + Vector2(0, s * 0.7)], a, dashed, key + 3); _line([c + Vector2(-s * 0.4, s * 0.7), c + Vector2(s * 0.4, s * 0.7)], a, dashed, key + 4)
		_:   # reactors and anything else: a plain vessel with a bed line
			_line(_capsule_v(c, s * 0.8, s * 1.3), a, dashed, key); _line([c + Vector2(-s * 0.7, -s * 0.15), c + Vector2(s * 0.7, s * 0.15)], a, dashed, key + 3)

func _capsule_v(c: Vector2, hw: float, hh: float) -> Array:
	return _arc(c + Vector2(0, -hh), hw, hw * 0.6, PI, TAU, 8) + _arc(c + Vector2(0, hh), hw, hw * 0.6, 0.0, PI, 8) + [c + Vector2(-hw, -hh)]

func _capsule_h(c: Vector2, hw: float, hh: float) -> Array:
	return _arc(c + Vector2(-hw + hh, 0), hh, hh, PI * 0.5, PI * 1.5, 8) + _arc(c + Vector2(hw - hh, 0), hh, hh, -PI * 0.5, PI * 0.5, 8) + [c + Vector2(-hw + hh, hh)]
